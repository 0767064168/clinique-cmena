const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const { data: paiements, error } = await supabase
            .from('paiements')
            .select('*, factures(numero_facture, patients(nom, prenom))')
            .order('date_paiement', { ascending: false })
            .limit(100);

        if (error) throw error;

        const formattedPaiements = (paiements || []).map(p => ({
            ...p,
            facture_numero: p.factures ? p.factures.numero_facture : '-',
            patient_nom: p.factures && p.factures.patients ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-'
        }));

        res.render('paiements/index', {
            title: 'Historique des Paiements',
            paiements: formattedPaiements
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des paiements');
        res.redirect('/dashboard');
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
