const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const { statut, date_debut, date_fin, search } = req.query;
        let query = supabase.from('factures').select('*, patients!inner(nom, prenom, matricule)');

        if (statut) query = query.eq('statut', statut);
        if (date_debut) query = query.gte('date_facture', date_debut);
        if (date_fin) query = query.lte('date_facture', date_fin);
        
        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,numero_facture.ilike.%${search}%`, { foreignTable: 'patients' });
        }

        const { data: factures, error } = await query.order('date_facture', { ascending: false });
        if (error) throw error;

        res.render('factures/index', {
            title: 'Factures',
            factures: factures || [],
            filters: { statut, date_debut, date_fin, search }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des factures');
        res.redirect('/dashboard');
    }
});

router.get('/create', async (req, res) => {
    try {
        const { consultation_id } = req.query;
        let selectedConsultation = null;

        if (consultation_id) {
            const { data } = await supabase
                .from('consultations')
                .select('*, patients(*)')
                .eq('id', consultation_id)
                .single();
            selectedConsultation = data;
        }

        const { data: actes } = await supabase.from('actes_medicaux').select('*').eq('actif', true).order('libelle');
        const { data: consultations } = await supabase.from('consultations').select('*, patients(nom, prenom)').eq('statut', 'terminee').order('date_consultation', { ascending: false }).limit(50);

        res.render('factures/create', { 
            title: 'Nouvelle Facture',
            selectedConsultation,
            actes: actes || [],
            consultations: consultations || []
        });
    } catch (error) {
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/factures');
    }
});

router.get(['/nouveau', '/nouvelle'], (req, res) => res.redirect('/factures/create'));

router.post('/', async (req, res) => {
    try {
        const { patient_id, consultation_id, taux_remise, libelle, prix_unitaire, quantite, pourcentage } = req.body;
        
        // Generate numero_facture
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const num = Math.floor(1000 + Math.random() * 9000);
        const numero_facture = `FAC-${year}${month}-${num}`;

        // Create facture
        const { data: facture, error: errFacture } = await supabase
            .from('factures')
            .insert([{ 
                numero_facture, 
                patient_id, 
                consultation_id: consultation_id || null, 
                date_facture: new Date(), 
                taux_remise: taux_remise || 0,
                statut: 'brouillon'
            }])
            .select()
            .single();

        if (errFacture) throw errFacture;

        // Process lines if present
        if (libelle && Array.isArray(libelle)) {
            let total = 0;
            const lignes = libelle.map((l, index) => {
                const pu = parseFloat(prix_unitaire[index] || 0);
                const qte = parseInt(quantite[index] || 1);
                const pct = parseFloat(pourcentage[index] || 100);
                const montant = pu * qte * (pct / 100);
                total += montant;

                return {
                    facture_id: facture.id,
                    libelle: l,
                    prix_unitaire: pu,
                    quantite: qte,
                    pourcentage: pct,
                    montant
                };
            });

            const { error: errLignes } = await supabase.from('facture_lignes').insert(lignes);
            if (errLignes) throw errLignes;

            const remise = (total * (parseFloat(taux_remise || 0) / 100));
            const total_net = total - remise;
            const taux_euro = 655.957;
            const total_euro = total_net / taux_euro;
            const reste_a_payer = total_net; // no payment yet

            await supabase
                .from('factures')
                .update({ total, remise, total_net, total_euro, reste_a_payer })
                .eq('id', facture.id);
        }

        req.flash('success', 'Facture créée avec succès');
        res.redirect(`/factures/${facture.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création de la facture');
        res.redirect('/factures/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .select('*, patients(*), consultations(date_consultation, motif)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', req.params.id).order('created_at');
        const { data: paiements } = await supabase.from('paiements').select('*').eq('facture_id', req.params.id).order('date_paiement', { ascending: false });

        res.render('factures/show', {
            title: `Facture ${facture.numero_facture}`,
            facture,
            lignes: lignes || [],
            paiements: paiements || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Facture introuvable');
        res.redirect('/factures');
    }
});

router.get('/:id/print', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .select('*, patients(*), consultations(date_consultation, motif)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        const { data: lignes } = await supabase.from('facture_lignes').select('*').eq('facture_id', req.params.id).order('created_at');

        res.render('factures/print', {
            layout: false,
            facture,
            lignes: lignes || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'impression');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// Helper for recalculating totals
async function recalculateFactureTotals(factureId) {
    const { data: facture } = await supabase.from('factures').select('*').eq('id', factureId).single();
    const { data: lignes } = await supabase.from('facture_lignes').select('montant').eq('facture_id', factureId);
    
    let total = 0;
    if (lignes) {
        total = lignes.reduce((acc, l) => acc + parseFloat(l.montant), 0);
    }
    
    const remise = total * (parseFloat(facture.taux_remise || 0) / 100);
    const total_net = total - remise;
    const taux_euro = 655.957;
    const total_euro = total_net / taux_euro;
    const reste_a_payer = total_net - parseFloat(facture.montant_paye || 0);

    let statut = facture.statut;
    if (statut !== 'brouillon' && statut !== 'annulee') {
        if (reste_a_payer <= 0) statut = 'payee';
        else if (facture.montant_paye > 0) statut = 'partiellement_payee';
        else statut = 'impayee';
    }

    await supabase
        .from('factures')
        .update({ total, remise, total_net, total_euro, reste_a_payer, statut })
        .eq('id', factureId);
}

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        
        if (facture.statut !== 'brouillon') {
            req.flash('error', 'Seules les factures en brouillon peuvent être modifiées');
            return res.redirect(`/factures/${req.params.id}`);
        }

        res.render('factures/edit', { title: 'Modifier Facture', facture });
    } catch (error) {
        console.error(error);
        res.redirect('/factures');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { taux_remise } = req.body;
        
        const { error } = await supabase
            .from('factures')
            .update({ taux_remise: taux_remise || 0 })
            .eq('id', req.params.id);

        if (error) throw error;

        await recalculateFactureTotals(req.params.id);

        req.flash('success', 'Facture mise à jour avec succès');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour');
        res.redirect(`/factures/${req.params.id}/edit`);
    }
});

router.post('/:id/lignes', async (req, res) => {
    try {
        const { libelle, prix_unitaire, quantite, pourcentage } = req.body;
        const pu = parseFloat(prix_unitaire || 0);
        const qte = parseInt(quantite || 1);
        const pct = parseFloat(pourcentage || 100);
        const montant = pu * qte * (pct / 100);

        const { error } = await supabase
            .from('facture_lignes')
            .insert([{
                facture_id: req.params.id,
                libelle, prix_unitaire: pu, quantite: qte, pourcentage: pct, montant
            }]);

        if (error) throw error;

        await recalculateFactureTotals(req.params.id);
        
        req.flash('success', 'Ligne ajoutée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'ajout de la ligne');
        res.redirect(`/factures/${req.params.id}`);
    }
});

router.delete('/:id/lignes/:ligneId', async (req, res) => {
    try {
        const { error } = await supabase.from('facture_lignes').delete().eq('id', req.params.ligneId);
        if (error) throw error;
        
        await recalculateFactureTotals(req.params.id);
        
        req.flash('success', 'Ligne supprimée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur');
        res.redirect(`/factures/${req.params.id}`);
    }
});

router.put('/:id/valider', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .update({ statut: 'impayee' })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        req.flash('success', 'Facture validée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur de validation');
        res.redirect(`/factures/${req.params.id}`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('factures')
            .update({ statut: 'annulee' })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Facture annulée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'annulation');
        res.redirect(`/factures/${req.params.id}`);
    }
});

module.exports = router;
