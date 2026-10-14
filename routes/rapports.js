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

        // 1. Factures sur la période (exclure annulées)
        const { data: factures, error: errFactures } = await supabase
            .from('factures')
            .select('*, patients(nom, prenom, numero_dossier)')
            .gte('date_facture', date_from)
            .lte('date_facture', date_to)
            .neq('statut', 'annulee')
            .order('date_facture', { ascending: false });

        if (errFactures) throw errFactures;

        // 2. Paiements réels enregistrés sur la période (en excluant les paiements des factures annulées)
        const { data: paiements, error: errPaiements } = await supabase
            .from('paiements')
            .select('montant, mode_paiement, date_paiement, factures!inner(statut)')
            .neq('factures.statut', 'annulee')
            .gte('date_paiement', `${date_from}T00:00:00.000Z`)
            .lte('date_paiement', `${date_to}T23:59:59.999Z`);

        if (errPaiements) throw errPaiements;

        // Répartition par mode de règlement
        const modesPaiement = {
            especes: 0,
            carte: 0,
            mobile_money: 0,
            virement: 0,
            cheque: 0
        };

        let totalEncaisseReel = 0;
        (paiements || []).forEach(p => {
            const montant = parseFloat(p.montant || 0);
            totalEncaisseReel += montant;

            const mode = (p.mode_paiement || 'especes').toLowerCase();
            if (modesPaiement[mode] !== undefined) {
                modesPaiement[mode] += montant;
            } else {
                modesPaiement.especes += montant;
            }
        });

        // Calculs des factures
        let totalFactureNet = 0;      // Factures validées ou payées (chiffre d'affaires effectif)
        let totalFactureBrouillon = 0; // Montant des brouillons
        let totalResteAPayer = 0;      // Créances en attente sur ces factures
        let totalRemises = 0;

        const statutsCount = {
            payee: 0,
            validee: 0,
            partiellement_payee: 0,
            brouillon: 0
        };

        (factures || []).forEach(f => {
            const net = parseFloat(f.total_net || 0);
            const remise = parseFloat(f.remise || 0);
            const reste = parseFloat(f.reste_a_payer || 0);

            if (statutsCount[f.statut] !== undefined) {
                statutsCount[f.statut]++;
            }

            // Seules les factures validées, payées ou partiellement payées comptent dans le CA
            if (f.statut !== 'brouillon') {
                totalFactureNet += net;
                totalRemises += remise;
                totalResteAPayer += reste;
            } else {
                totalFactureBrouillon += net;
            }
        });

        // 3. Consultations sur la période
        const { data: consultations, error: errConsultations } = await supabase
            .from('consultations')
            .select('id, statut, date_entree')
            .gte('date_entree', date_from)
            .lte('date_entree', date_to);

        if (errConsultations) throw errConsultations;

        const totalConsultations = (consultations || []).length;
        const consultationsTerminees = (consultations || []).filter(c => c.statut === 'termine').length;

        // 4. Nouveaux patients enregistrés
        const { count: nouveauxPatients, error: errPatients } = await supabase
            .from('patients')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', `${date_from}T00:00:00.000Z`)
            .lte('created_at', `${date_to}T23:59:59.999Z`);

        if (errPatients) throw errPatients;

        res.render('rapports/index', {
            title: 'Rapports d\'Activité & Financiers',
            date_from,
            date_to,
            stats: {
                totalFactureNet,
                totalFactureBrouillon,
                totalEncaisse: totalEncaisseReel,
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

// GET /rapports/export/csv — Export Excel / CSV du rapport financier et des encaissements
router.get('/export/csv', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        if (!date_from || !date_to) {
            req.flash('error', 'Veuillez spécifier une période pour l\'export');
            return res.redirect('/rapports');
        }

        // Récupérer les factures de la période
        const { data: factures, error: errFactures } = await supabase
            .from('factures')
            .select('*, patients(nom, prenom, numero_dossier)')
            .gte('date_facture', date_from)
            .lte('date_facture', date_to)
            .neq('statut', 'annulee')
            .order('date_facture', { ascending: false });

        if (errFactures) throw errFactures;

        // Récupérer les paiements de la période (exclure factures annulées)
        const { data: paiements, error: errPaiements } = await supabase
            .from('paiements')
            .select('*, factures!inner(numero_facture, statut, patients(nom, prenom))')
            .neq('factures.statut', 'annulee')
            .gte('date_paiement', `${date_from}T00:00:00.000Z`)
            .lte('date_paiement', `${date_to}T23:59:59.999Z`)
            .order('date_paiement', { ascending: false });

        if (errPaiements) throw errPaiements;

        const filename = `Rapport_Financier_GSPM_${date_from}_au_${date_to}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // BOM UTF-8 pour ouverture parfaite dans Microsoft Excel
        let csvContent = '\uFEFF';

        csvContent += `RAPPORT FINANCIER & D'ACTIVITE - CSA 3e CIE GSPM BOUAKE\n`;
        csvContent += `Periode du : ${date_from} au ${date_to}\n`;
        csvContent += `Genere le : ${new Date().toLocaleString('fr-FR')}\n\n`;

        // Section 1 : Détail des Factures
        csvContent += `--- SECTION 1 : FACTURES EMISES SUR LA PERIODE ---\n`;
        csvContent += `N° Facture;Date;N° Dossier;Patient;Statut;Total Brut (FCFA);Remise (FCFA);Total Net (FCFA);Montant Paye (FCFA);Reste a Payer (FCFA)\n`;

        let sumFactureNet = 0;
        let sumReste = 0;

        (factures || []).forEach(f => {
            const pat = f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-';
            const numDos = f.patients ? f.patients.numero_dossier : '-';
            const d = f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '-';
            const brut = Number(f.total || 0);
            const remise = Number(f.remise || 0);
            const net = Number(f.total_net || 0);
            const paye = Number(f.montant_paye || 0);
            const reste = Number(f.reste_a_payer || 0);

            if (f.statut !== 'brouillon') {
                sumFactureNet += net;
                sumReste += reste;
            }

            csvContent += `"${f.numero_facture || '-'}";"${d}";"${numDos}";"${pat}";"${f.statut}";"${brut}";"${remise}";"${net}";"${paye}";"${reste}"\n`;
        });

        csvContent += `;;;;TOTAL FACTURE NET VALIDE;;;"${sumFactureNet}";;"${sumReste}"\n\n`;

        // Section 2 : Détail des Encaissements Réels
        csvContent += `--- SECTION 2 : ENCAISSEMENTS REELS SUR LA PERIODE ---\n`;
        csvContent += `Date Paiement;N° Facture;Patient;Mode de Reglement;Reference;Montant Encaisse (FCFA)\n`;

        let sumEncaisse = 0;
        (paiements || []).forEach(p => {
            const numFac = p.factures ? p.factures.numero_facture : '-';
            const pat = (p.factures && p.factures.patients) ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-';
            const d = p.date_paiement ? new Date(p.date_paiement).toLocaleString('fr-FR') : '-';
            const montant = Number(p.montant || 0);
            sumEncaisse += montant;

            csvContent += `"${d}";"${numFac}";"${pat}";"${p.mode_paiement || 'especes'}";"${p.reference || '-'}";"${montant}"\n`;
        });

        csvContent += `;;;;TOTAL ENCAISSE REEL;"${sumEncaisse}"\n`;

        res.send(csvContent);
    } catch (error) {
        console.error('Erreur export CSV:', error);
        req.flash('error', 'Erreur lors de la génération du fichier Excel/CSV');
        res.redirect('/rapports');
    }
});

module.exports = router;
