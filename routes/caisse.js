const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /caisse — Bilan de caisse du jour (ou date sélectionnée)
router.get('/', async (req, res) => {
    try {
        const dateStr = req.query.date || new Date().toISOString().split('T')[0];
        const dateDebut = `${dateStr}T00:00:00`;
        const dateFin = `${dateStr}T23:59:59`;

        // Paiements du jour
        const { data: paiements, error: errPaiements } = await supabase
            .from('paiements')
            .select('*, factures(numero_facture, patients(nom, prenom))')
            .gte('date_paiement', dateDebut)
            .lte('date_paiement', dateFin)
            .order('date_paiement', { ascending: true });

        if (errPaiements) throw errPaiements;

        const listePaiements = (paiements || []).map(p => ({
            ...p,
            facture_numero: p.factures ? p.factures.numero_facture : '-',
            patient_nom: p.factures && p.factures.patients ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-'
        }));

        // Calculs par mode de paiement
        let totalEspeces = 0;
        let totalMobileMoney = 0;
        let totalAutres = 0;
        let nbEspeces = 0;
        let nbMobileMoney = 0;
        let nbAutres = 0;

        listePaiements.forEach(p => {
            const montant = parseFloat(p.montant) || 0;
            if (p.mode_paiement === 'especes') {
                totalEspeces += montant;
                nbEspeces++;
            } else if (p.mode_paiement === 'mobile_money') {
                totalMobileMoney += montant;
                nbMobileMoney++;
            } else {
                totalAutres += montant;
                nbAutres++;
            }
        });

        const totalJour = totalEspeces + totalMobileMoney + totalAutres;
        const nbTotal = listePaiements.length;

        // Factures créées le jour
        const { data: facturesJour } = await supabase
            .from('factures')
            .select('id, numero_facture, total_net, statut')
            .gte('date_facture', dateDebut)
            .lte('date_facture', dateFin)
            .neq('statut', 'annulee');

        const totalFacture = (facturesJour || []).reduce((acc, f) => acc + (parseFloat(f.total_net) || 0), 0);
        const nbFactures = (facturesJour || []).length;

        // Consultations du jour
        const { count: nbConsultations } = await supabase
            .from('consultations')
            .select('*', { count: 'exact', head: true })
            .gte('date_entree', dateDebut)
            .lte('date_entree', dateFin);

        res.render('caisse/index', {
            title: 'Caisse du Jour',
            dateSelected: dateStr,
            paiements: listePaiements,
            totalEspeces,
            totalMobileMoney,
            totalAutres,
            totalJour,
            nbEspeces,
            nbMobileMoney,
            nbAutres,
            nbTotal,
            totalFacture,
            nbFactures,
            nbConsultations: nbConsultations || 0
        });
    } catch (error) {
        console.error('Erreur caisse:', error);
        req.flash('error', 'Erreur lors du chargement de la caisse');
        res.redirect('/dashboard');
    }
});

// GET /caisse/print — PV de caisse imprimable
router.get('/print', async (req, res) => {
    try {
        const dateStr = req.query.date || new Date().toISOString().split('T')[0];
        const dateDebut = `${dateStr}T00:00:00`;
        const dateFin = `${dateStr}T23:59:59`;

        const { data: paiements } = await supabase
            .from('paiements')
            .select('*, factures(numero_facture, patients(nom, prenom))')
            .gte('date_paiement', dateDebut)
            .lte('date_paiement', dateFin)
            .order('date_paiement', { ascending: true });

        const listePaiements = (paiements || []).map(p => ({
            ...p,
            facture_numero: p.factures ? p.factures.numero_facture : '-',
            patient_nom: p.factures && p.factures.patients ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-'
        }));

        let totalEspeces = 0, totalMobileMoney = 0, totalAutres = 0;
        let nbEspeces = 0, nbMobileMoney = 0, nbAutres = 0;

        listePaiements.forEach(p => {
            const montant = parseFloat(p.montant) || 0;
            if (p.mode_paiement === 'especes') { totalEspeces += montant; nbEspeces++; }
            else if (p.mode_paiement === 'mobile_money') { totalMobileMoney += montant; nbMobileMoney++; }
            else { totalAutres += montant; nbAutres++; }
        });

        const totalJour = totalEspeces + totalMobileMoney + totalAutres;

        res.render('caisse/print', {
            layout: false,
            title: 'PV de Caisse',
            dateSelected: dateStr,
            paiements: listePaiements,
            totalEspeces,
            totalMobileMoney,
            totalAutres,
            totalJour,
            nbEspeces,
            nbMobileMoney,
            nbAutres,
            nbTotal: listePaiements.length,
            user: (req.session && req.session.user) ? req.session.user : null
        });
    } catch (error) {
        console.error('Erreur impression PV caisse:', error);
        req.flash('error', 'Erreur lors de la génération du PV de caisse');
        res.redirect('/caisse');
    }
});

module.exports = router;
