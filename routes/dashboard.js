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

        // Factures en attente / non totalement réglées (nombre et montant total dû)
        const { data: impayeesData, error: errFactures } = await supabase
            .from('factures')
            .select('reste_a_payer, statut')
            .neq('statut', 'payee')
            .neq('statut', 'annulee');
        if (errFactures) throw errFactures;

        const facturesImpayees = (impayeesData || []).length;
        const totalMontantImpaye = (impayeesData || []).reduce((acc, curr) => acc + (parseFloat(curr.reste_a_payer) || 0), 0);

        // Revenue du mois (exclure factures annulées)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        const { data: monthFactures, error: errRevenue } = await supabase
            .from('factures')
            .select('montant_paye')
            .neq('statut', 'annulee')
            .gte('date_facture', startOfMonth.toISOString().split('T')[0]);
        if (errRevenue) throw errRevenue;

        const revenueMois = (monthFactures || []).reduce((acc, curr) => acc + (parseFloat(curr.montant_paye) || 0), 0);

        // Pharmacie & stock : produits actifs, alertes et valeur
        const { data: stockProduits, error: errStock } = await supabase
            .from('produits_pharmacie')
            .select('id, designation, stock_actuel, stock_minimum, prix_vente, date_peremption, categorie')
            .eq('actif', true);
        if (errStock) throw errStock;

        const pharmacieTotal = (stockProduits || []).length;
        const pharmacieAlerte = (stockProduits || []).filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0)).length;
        const pharmacieValeur = (stockProduits || []).reduce((acc, p) => acc + ((Number(p.stock_actuel || 0) * Number(p.prix_vente || 0)) || 0), 0);
        const produitsPerimes = (stockProduits || []).filter(p => p.date_peremption && new Date(p.date_peremption) < new Date(today)).length;
        const stockAlerts = (stockProduits || [])
            .filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0))
            .sort((a, b) => (Number(a.stock_actuel || 0) - Number(a.stock_minimum || 0)) - (Number(b.stock_actuel || 0) - Number(b.stock_minimum || 0)))
            .slice(0, 5)
            .map(p => ({
                ...p,
                stock_disponible: Number(p.stock_actuel || 0),
                seuil: Number(p.stock_minimum || 0)
            }));

        const recentProducts = (stockProduits || [])
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, 5);

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
                totalMontantImpaye: totalMontantImpaye || 0,
                revenueMois: revenueMois,
                revenusMois: revenueMois,
                pharmacieTotal: pharmacieTotal || 0,
                pharmacieAlerte: pharmacieAlerte || 0,
                pharmacieValeur: pharmacieValeur || 0,
                produitsPerimes: produitsPerimes || 0
            },
            stockAlerts,
            recentProducts: recentProducts || [],
            recentPatients: recentPatients || [],
            recentFactures: recentFactures || []
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        req.flash('error', 'Erreur lors du chargement du tableau de bord');
        res.render('dashboard', {
            title: 'Tableau de Bord',
            stats: {
                totalPatients: 0,
                consultationsToday: 0,
                facturesImpayees: 0,
                totalMontantImpaye: 0,
                revenueMois: 0,
                revenusMois: 0,
                pharmacieTotal: 0,
                pharmacieAlerte: 0,
                pharmacieValeur: 0,
                produitsPerimes: 0
            },
            stockAlerts: [],
            recentProducts: [],
            recentPatients: [],
            recentFactures: []
        });
    }
});

module.exports = router;
