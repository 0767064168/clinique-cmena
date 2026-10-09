const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Total patients
        const { count: totalPatients, error: errPatients } = await supabase
            .from('patients')
            .select('*', { count: 'exact', head: true });
        if (errPatients) throw errPatients;

        // Consultations today
        const { count: consultationsToday, error: errConsultations } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true })
            .gte('date_entree', today);
        if (errConsultations) throw errConsultations;

        // Factures en attente / non totalement réglées
        const { count: facturesImpayees, error: errFactures } = await supabase
            .from('factures')
            .select('*', { count: 'exact', head: true })
            .neq('statut', 'payee')
            .neq('statut', 'annulee');
        if (errFactures) throw errFactures;

        // Revenue du mois (simplified for now)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const { data: monthFactures, error: errRevenue } = await supabase
            .from('factures')
            .select('montant_paye')
            .gte('date_facture', startOfMonth.toISOString().split('T')[0]);
        if (errRevenue) throw errRevenue;

        const revenueMois = monthFactures.reduce((acc, curr) => acc + (curr.montant_paye || 0), 0);

        res.render('dashboard', {
            title: 'Tableau de Bord',
            stats: {
                totalPatients: totalPatients || 0,
                consultationsToday: consultationsToday || 0,
                facturesImpayees: facturesImpayees || 0,
                revenueMois: revenueMois
            }
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        req.flash('error', 'Erreur lors du chargement du tableau de bord');
        res.render('dashboard', { title: 'Tableau de Bord', stats: { totalPatients: 0, consultationsToday: 0, facturesImpayees: 0, revenueMois: 0 } });
    }
});

module.exports = router;
