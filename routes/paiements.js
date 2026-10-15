const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { logAudit } = require('../utils/audit');

router.get('/', async (req, res) => {
    try {
        const reference = typeof req.query.reference === 'string'
            ? req.query.reference.trim().replace(/[^a-zA-Z0-9À-ÿ\s-]/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        const patient = typeof req.query.patient === 'string'
            ? req.query.patient.trim().replace(/[^a-zA-Z0-9À-ÿ\s-]/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        const invoiceNumberValue = typeof req.query.invoice_number === 'string' ? req.query.invoice_number.trim() : '';
        const parsedInvoiceNumber = /^\d+$/.test(invoiceNumberValue) ? Number(invoiceNumberValue) : null;
        const invoiceNumber = Number.isSafeInteger(parsedInvoiceNumber) ? parsedInvoiceNumber : null;
        const mode = typeof req.query.mode === 'string' ? req.query.mode : '';
        const date_from = typeof req.query.date_from === 'string' ? req.query.date_from : '';
        const date_to = typeof req.query.date_to === 'string' ? req.query.date_to : '';
        const pageValue = Number.parseInt(req.query.page, 10);
        const requestedPage = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 1000000 ? pageValue : 1;
        const pageSize = 25;

        const buildQuery = () => {
            let query = supabase.from('paiements')
                .select('*, factures!inner(numero_facture, patients!inner(nom, prenom))', { count: 'exact' });
            if (mode) query = query.eq('mode_paiement', mode);
            if (date_from) query = query.gte('date_paiement', date_from);
            if (date_to) query = query.lte('date_paiement', `${date_to}T23:59:59`);
            if (reference) query = query.ilike('reference', `%${reference}%`);
            if (patient) {
                query = query.or(
                    `nom.ilike.%${patient}%,prenom.ilike.%${patient}%`,
                    { referencedTable: 'factures.patients' }
                );
            }
            if (invoiceNumber !== null) {
                query = query.eq('numero_facture', invoiceNumber, { referencedTable: 'factures' });
            }
            return query;
        };
        const fetchPage = page => buildQuery()
            .order('date_paiement', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1);

        let currentPage = requestedPage;
        let { data: paiements, count, error } = await fetchPage(currentPage);

        if (error) throw error;

        const totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / pageSize);
        currentPage = totalPages ? Math.min(currentPage, totalPages) : 1;
        if (currentPage !== requestedPage) {
            ({ data: paiements, error } = await fetchPage(currentPage));
            if (error) throw error;
        }

        const formattedPaiements = (paiements || []).map(p => ({
            ...p,
            facture_numero: p.factures ? p.factures.numero_facture : '-',
            patient_nom: p.factures && p.factures.patients ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-'
        }));

        res.render('paiements/index', {
            title: 'Historique des Paiements',
            paiements: formattedPaiements,
            filters: { reference, patient, invoice_number: invoiceNumberValue, mode, date_from, date_to },
            currentPage,
            totalPages,
            totalCount,
            pageSize,
            baseUrl: '/paiements',
            paginationFilters: { reference, patient, invoice_number: invoiceNumberValue, mode, date_from, date_to }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des paiements');
        res.redirect('/dashboard');
    }
});

// GET /paiements/:id/print — Reçu de caisse imprimable
router.get('/:id/print', async (req, res) => {
    try {
        const { data: paiement, error: errPaiement } = await supabase
            .from('paiements')
            .select('*, factures(*, patients(*))')
            .eq('id', req.params.id)
            .single();

        if (errPaiement || !paiement) {
            req.flash('error', 'Reçu de paiement introuvable');
            return res.redirect('/paiements');
        }

        const facture = paiement.factures || null;
        const patient = facture ? facture.patients : null;

        res.render('paiements/print', {
            layout: false,
            title: `Reçu de paiement RC-${paiement.id.slice(0, 8).toUpperCase()}`,
            paiement,
            facture,
            patient,
            user: (req.session && req.session.user) ? req.session.user : null
        });
    } catch (error) {
        console.error('Erreur impression reçu:', error);
        req.flash('error', 'Erreur lors de la génération du reçu');
        res.redirect('/paiements');
    }
});

router.post('/', async (req, res) => {
    try {
        const { facture_id, montant, mode_paiement, reference } = req.body;
        const montantFloat = parseFloat(montant);

        // Fetch current facture
        const { data: facture, error: errFacture } = await supabase
            .from('factures')
            .select('montant_paye, reste_a_payer, total_net')
            .eq('id', facture_id)
            .single();

        if (errFacture) throw errFacture;

        if (montantFloat > facture.reste_a_payer) {
            req.flash('error', 'Le montant saisi est supérieur au reste à payer');
            return res.redirect(`/factures/${facture_id}`);
        }

        // Insert paiement
        const { error: errPaiement } = await supabase
            .from('paiements')
            .insert([{ facture_id, montant: montantFloat, mode_paiement, reference, date_paiement: new Date() }]);

        if (errPaiement) throw errPaiement;

        // Update facture
        const nouveau_montant_paye = parseFloat(facture.montant_paye || 0) + montantFloat;
        const nouveau_reste_a_payer = facture.total_net - nouveau_montant_paye;
        let statut = 'partiellement_payee';
        if (nouveau_reste_a_payer <= 0) statut = 'payee';

        await supabase
            .from('factures')
            .update({ montant_paye: nouveau_montant_paye, reste_a_payer: nouveau_reste_a_payer, statut })
            .eq('id', facture_id);

        await logAudit({
            req,
            action: 'PAIEMENT_ENCAISSE',
            entite: 'paiement',
            entite_id: facture_id,
            description: `Encaissement de ${montantFloat.toLocaleString('fr-FR')} FCFA par ${mode_paiement}`,
            details: { facture_id, montant: montantFloat, mode_paiement, reference }
        });

        req.flash('success', 'Paiement enregistré avec succès');
        res.redirect(`/factures/${facture_id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'enregistrement du paiement');
        res.redirect('back');
    }
});

router.delete('/:id', async (req, res) => {
    try {
        // Fetch paiement
        const { data: paiement, error: errGet } = await supabase
            .from('paiements')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (errGet) throw errGet;

        const facture_id = paiement.facture_id;

        // Fetch facture
        const { data: facture } = await supabase
            .from('factures')
            .select('montant_paye, total_net')
            .eq('id', facture_id)
            .single();

        // Delete paiement
        const { error: errDel } = await supabase.from('paiements').delete().eq('id', req.params.id);
        if (errDel) throw errDel;

        // Revert facture
        const nouveau_montant_paye = parseFloat(facture.montant_paye || 0) - parseFloat(paiement.montant);
        const nouveau_reste_a_payer = facture.total_net - nouveau_montant_paye;
        let statut = 'validee';
        if (nouveau_montant_paye > 0) statut = 'partiellement_payee';

        await supabase
            .from('factures')
            .update({ montant_paye: nouveau_montant_paye, reste_a_payer: nouveau_reste_a_payer, statut })
            .eq('id', facture_id);

        req.flash('success', 'Paiement annulé avec succès');
        res.redirect(`/factures/${facture_id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'annulation du paiement');
        res.redirect('back');
    }
});

module.exports = router;
