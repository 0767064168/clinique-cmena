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

        // Revenue du mois
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const { data: monthFactures, error: errRevenue } = await supabase
            .from('factures')
            .select('montant_paye')
            .gte('date_facture', startOfMonth.toISOString().split('T')[0]);
        if (errRevenue) throw errRevenue;

        const revenueMois = (monthFactures || []).reduce((acc, curr) => acc + (parseFloat(curr.montant_paye) || 0), 0);

        // Patients récents (5 derniers)
        const { data: recentPatients } = await supabase
            .from('patients')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        // Dernières factures (5 dernières)
        const { data: rawRecentFactures } = await supabase
            .from('factures')
            .select('*, patients(nom, prenom)')
            .order('date_facture', { ascending: false })
            .limit(5);

        const recentFactures = (rawRecentFactures || []).map(f => ({
            ...f,
            patient_nom: f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-'
        }));

        res.render('dashboard', {
            title: 'Tableau de Bord',
            stats: {
                totalPatients: totalPatients || 0,
                consultationsToday: consultationsToday || 0,
                facturesImpayees: facturesImpayees || 0,
                revenueMois: revenueMois,
                revenusMois: revenueMois
            },
            recentPatients: recentPatients || [],
            recentFactures: recentFactures || []
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        req.flash('error', 'Erreur lors du chargement du tableau de bord');
        res.render('dashboard', {
            title: 'Tableau de Bord',
            stats: { totalPatients: 0, consultationsToday: 0, facturesImpayees: 0, revenueMois: 0, revenusMois: 0 },
            recentPatients: [],
            recentFactures: []
        });
    }
});

module.exports = router;
