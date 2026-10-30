const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { getDepensesByDate, getDepenseById, addDepense, deleteDepense } = require('../utils/depenses');

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

        // Dépenses / Décaissements du jour
        const depenses = getDepensesByDate(dateStr);
        const totalDepenses = depenses.reduce((acc, d) => acc + (parseFloat(d.montant) || 0), 0);
        const soldeNetEspeces = totalEspeces - totalDepenses;

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
            depenses,
            totalDepenses,
            soldeNetEspeces,
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

// POST /caisse/depenses — Enregistrer une sortie de caisse
router.post('/depenses', async (req, res) => {
    try {
        const { date, motif, montant, beneficiaire, categorie } = req.body;
        const user = req.session && req.session.user ? req.session.user : null;
        const utilisateur_nom = user ? `${user.prenom} ${user.nom}` : 'Caissier';

        if (!motif || !montant || parseFloat(montant) <= 0) {
            req.flash('error', 'Le motif et un montant valide sont obligatoires pour enregistrer une sortie de caisse.');
            return res.redirect(`/caisse?date=${date || ''}`);
        }

        addDepense({
            date: date || new Date().toISOString().split('T')[0],
            motif,
            montant: parseFloat(montant),
            beneficiaire,
            categorie,
            utilisateur_nom
        });

        req.flash('success', 'Sortie de caisse enregistrée avec succès');
        res.redirect(`/caisse?date=${date || ''}`);
    } catch (error) {
        console.error('Erreur enregistrement depense:', error);
        req.flash('error', 'Erreur lors de l\'enregistrement de la sortie de caisse');
        res.redirect('/caisse');
    }
});

// POST /caisse/depenses/:id/delete — Annuler une sortie de caisse
router.post('/depenses/:id/delete', async (req, res) => {
    try {
        const { date } = req.body;
        deleteDepense(req.params.id);
        req.flash('success', 'Sortie de caisse supprimée');
        res.redirect(`/caisse?date=${date || ''}`);
    } catch (error) {
        console.error('Erreur suppression depense:', error);
        req.flash('error', 'Erreur lors de la suppression de la dépense');
        res.redirect('/caisse');
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

        // Dépenses
        const depenses = getDepensesByDate(dateStr);
        const totalDepenses = depenses.reduce((acc, d) => acc + (parseFloat(d.montant) || 0), 0);
        const soldeNetEspeces = totalEspeces - totalDepenses;

        res.render('caisse/print', {
            layout: false,
            title: 'PV de Caisse',
            dateSelected: dateStr,
            paiements: listePaiements,
            depenses,
            totalDepenses,
            soldeNetEspeces,
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

// GET /caisse/export — Export CSV / Excel du journal de caisse
router.get('/export', async (req, res) => {
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

        const depenses = getDepensesByDate(dateStr);

        let totalEspeces = 0;
        let totalMobileMoney = 0;
        let totalAutres = 0;

        (paiements || []).forEach(p => {
            const m = parseFloat(p.montant) || 0;
            if (p.mode_paiement === 'especes') totalEspeces += m;
            else if (p.mode_paiement === 'mobile_money') totalMobileMoney += m;
            else totalAutres += m;
        });

        const totalEncaise = totalEspeces + totalMobileMoney + totalAutres;
        const totalDepenses = depenses.reduce((acc, d) => acc + (parseFloat(d.montant) || 0), 0);
        const soldeNet = totalEspeces - totalDepenses;

        const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

        const lines = [
            `JOURNAL DE CAISSE JOURNALIER — CSA 3e COMPAGNIE GSPM BOUAKÉ`,
            `Date :;${dateStr}`,
            `Généré le :;${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
            ``,
            `1. ENCAISSEMENTS`,
            `Heure;N° Facture;Patient;Mode de Paiement;Référence;Montant (FCFA)`
        ];

        (paiements || []).forEach(p => {
            const heure = new Date(p.date_paiement).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const numFacture = p.factures ? p.factures.numero_facture : '-';
            const patient = p.factures && p.factures.patients ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-';
            const mode = p.mode_paiement === 'mobile_money' ? 'Mobile Money' : (p.mode_paiement === 'especes' ? 'Espèces' : p.mode_paiement);
            const ref = p.reference || '-';
            const montant = Math.round(parseFloat(p.montant) || 0);

            lines.push([escapeCsv(heure), escapeCsv(numFacture), escapeCsv(patient), escapeCsv(mode), escapeCsv(ref), montant].join(';'));
        });

        lines.push(`;;;;TOTAL ENCAISSÉ;${totalEncaise}`);
        lines.push(``);
        lines.push(`2. SORTIES DE CAISSE (DÉPENSES)`);
        lines.push(`Heure;Motif de la dépense;Bénéficiaire;Catégorie;Enregistré par;Montant (FCFA)`);

        depenses.forEach(d => {
            const montant = Math.round(parseFloat(d.montant) || 0);
            lines.push([escapeCsv(d.heure || '-'), escapeCsv(d.motif), escapeCsv(d.beneficiaire), escapeCsv(d.categorie), escapeCsv(d.utilisateur_nom), montant].join(';'));
        });

        lines.push(`;;;;TOTAL DÉPENSES;${totalDepenses}`);
        lines.push(``);
        lines.push(`3. SYNTHÈSE DES SOLDES DU JOUR`);
        lines.push(`Libellé;Montant (FCFA)`);
        lines.push(`Total Espèces Encaissées;${totalEspeces}`);
        lines.push(`Total Sorties de Caisse (Espèces);-${totalDepenses}`);
        lines.push(`SOLDE NET EN ESPÈCES EN CAISSE;${soldeNet}`);
        lines.push(`Total Mobile Money (Wave / Orange / MTN);${totalMobileMoney}`);
        lines.push(`TOTAL GLOBAL ENCAISSÉ DU JOUR;${totalEncaise}`);

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="caisse_GSPM_${dateStr}.csv"`);
        res.send('\uFEFF' + lines.join('\r\n'));
    } catch (error) {
        console.error('Erreur export caisse:', error);
        req.flash('error', 'Erreur lors de l\'export du journal de caisse');
        res.redirect('/caisse');
    }
});

// GET /caisse/depenses/:id/print — Bon de sortie de caisse imprimable
router.get('/depenses/:id/print', (req, res) => {
    try {
        const { id } = req.params;
        const depense = getDepenseById(id);

        if (!depense) {
            req.flash('error', 'Bon de sortie introuvable');
            return res.redirect('/caisse');
        }

        res.render('caisse/depense_print', {
            layout: false,
            title: `Bon de Sortie — ${depense.motif}`,
            depense,
            user: (req.session && req.session.user) ? req.session.user : null
        });
    } catch (error) {
        console.error('Erreur impression bon de sortie:', error);
        req.flash('error', 'Erreur lors de la génération du bon de sortie');
        res.redirect('/caisse');
    }
});

module.exports = router;
