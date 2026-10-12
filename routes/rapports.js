const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        // Période par défaut : mois en cours
        const defaultFrom = `${year}-${month}-01`;
        const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0).getDate();
        const defaultTo = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

        const date_from = req.query.date_from || defaultFrom;
        const date_to = req.query.date_to || defaultTo;

        // 1. Factures sur la période
        const { data: factures, error: errFactures } = await supabase
            .from('factures')
            .select('*, patients(nom, prenom)')
            .gte('date_facture', `${date_from}T00:00:00`)
            .lte('date_facture', `${date_to}T23:59:59`)
            .neq('statut', 'annulee')
            .order('date_facture', { ascending: false });

        if (errFactures) throw errFactures;

        // Calculs financiers
        let totalFactureNet = 0;
        let totalEncaisse = 0;
        let totalResteAPayer = 0;
        let totalRemises = 0;

        const statutsCount = {
            payee: 0,
            validee: 0,
            partiellement_payee: 0,
            brouillon: 0
        };

        (factures || []).forEach(f => {
            totalFactureNet += parseFloat(f.total_net || 0);
            totalEncaisse += parseFloat(f.montant_paye || 0);
            totalResteAPayer += parseFloat(f.reste_a_payer || 0);
            totalRemises += parseFloat(f.remise || 0);

            if (statutsCount[f.statut] !== undefined) {
                statutsCount[f.statut]++;
            }
        });

        // 2. Consultations sur la période
        const { data: consultations, error: errConsultations } = await supabase
            .from('consultations')
            .select('id, statut, date_entree')
            .gte('date_entree', `${date_from}T00:00:00`)
            .lte('date_entree', `${date_to}T23:59:59`);

        if (errConsultations) throw errConsultations;

        const totalConsultations = (consultations || []).length;
        const consultationsTerminees = (consultations || []).filter(c => c.statut === 'termine').length;

        // 3. Nouveaux patients enregistrés
        const { count: nouveauxPatients, error: errPatients } = await supabase
            .from('patients')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${date_from}T00:00:00`)
            .lte('created_at', `${date_to}T23:59:59`);

        if (errPatients) throw errPatients;

        // 4. Paiements et modes de règlement
        const { data: paiements, error: errPaiements } = await supabase
            .from('paiements')
            .select('montant, mode_paiement')
            .gte('date_paiement', `${date_from}T00:00:00`)
            .lte('date_paiement', `${date_to}T23:59:59`);

        if (errPaiements) throw errPaiements;

        const modesPaiement = {
            especes: 0,
            carte: 0,
            mobile_money: 0,
            virement: 0,
            cheque: 0
        };

        (paiements || []).forEach(p => {
            const mode = p.mode_paiement || 'especes';
            if (modesPaiement[mode] !== undefined) {
                modesPaiement[mode] += parseFloat(p.montant || 0);
            } else {
                modesPaiement.especes += parseFloat(p.montant || 0);
            }
        });

        res.render('rapports/index', {
            title: 'Rapports d\'Activité & Financiers',
            date_from,
            date_to,
            stats: {
                totalFactureNet,
                totalEncaisse,
                totalResteAPayer,
                totalRemises,
                totalFactures: (factures || []).length,
                statutsCount,
                totalConsultations,
                consultationsTerminees,
                nouveauxPatients: nouveauxPatients || 0,
                modesPaiement
            },
            factures: factures || []
        });

    } catch (error) {
        console.error('Erreur rapports:', error);
        req.flash('error', 'Erreur lors du calcul des rapports d\'activité');
        res.redirect('/dashboard');
    }
});

module.exports = router;
