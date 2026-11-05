const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
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

// GET /caisse/ticket — Ticket thermique 80mm de clôture journalière (Z de Caisse)
router.get('/ticket', async (req, res) => {
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

        const depenses = getDepensesByDate(dateStr);
        const totalDepenses = depenses.reduce((acc, d) => acc + (parseFloat(d.montant) || 0), 0);
        const soldeNetEspeces = totalEspeces - totalDepenses;

        res.render('caisse/ticket', {
            layout: false,
            title: `Z de Caisse — ${dateStr}`,
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
        console.error('Erreur impression ticket caisse:', error);
        req.flash('error', 'Erreur lors de la génération du ticket de caisse');
        res.redirect('/caisse');
    }
});

// GET /caisse/export/excel — Export Excel (.xlsx) complet du journal de caisse
router.get('/export/excel', async (req, res) => {
    try {
        const dateStr = req.query.date || new Date().toISOString().split('T')[0];
        const dateDebut = `${dateStr}T00:00:00`;
        const dateFin = `${dateStr}T23:59:59`;

        // Récupération des paiements
        const { data: paiements, error: errPaiements } = await supabase
            .from('paiements')
            .select('*, factures(numero_facture, patients(nom, prenom))')
            .gte('date_paiement', dateDebut)
            .lte('date_paiement', dateFin)
            .order('date_paiement', { ascending: true });

        if (errPaiements) throw errPaiements;

        // Récupération des dépenses
        const depenses = getDepensesByDate(dateStr) || [];

        // Totaux par mode de paiement
        let totalEspeces = 0;
        let totalMobileMoney = 0;
        let totalAutres = 0;

        (paiements || []).forEach(p => {
            const m = parseFloat(p.montant) || 0;
            if (p.mode_paiement === 'especes') totalEspeces += m;
            else if (p.mode_paiement === 'mobile_money') totalMobileMoney += m;
            else totalAutres += m;
        });

        const totalEncaisse = totalEspeces + totalMobileMoney + totalAutres;
        const totalDepenses = depenses.reduce((acc, d) => acc + (parseFloat(d.montant) || 0), 0);
        const soldeNet = totalEspeces - totalDepenses;

        // Initialisation du classeur Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        workbook.created = new Date();
        workbook.modified = new Date();

        const generatedAt = new Date();
        const dateSousTitre = `CSA 3e COMPAGNIE GSPM BOUAKÉ — ${dateStr}`;
        const infoGeneration = `Généré le ${generatedAt.toLocaleDateString('fr-FR')} à ${generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

        const formatMode = (m) => {
            if (!m) return '-';
            const lower = m.toLowerCase();
            if (lower === 'mobile_money') return 'Mobile Money';
            if (lower === 'especes') return 'Espèces';
            if (lower === 'carte') return 'Carte Bancaire';
            if (lower === 'virement') return 'Virement';
            if (lower === 'cheque') return 'Chèque';
            return m;
        };

        // -------------------------------------------------------------
        // Onglet 1 : Encaissements
        // -------------------------------------------------------------
        const encaissementsSheet = workbook.addWorksheet('Encaissements', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        encaissementsSheet.views = [{ state: 'frozen', ySplit: 4 }];
        encaissementsSheet.autoFilter = { from: 'A4', to: 'F4' };

        // Titre & En-tête
        encaissementsSheet.mergeCells('A1:F1');
        const encTitleRow = encaissementsSheet.getRow(1);
        encTitleRow.getCell(1).value = 'JOURNAL DE CAISSE — ENCAISSEMENTS';
        encTitleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        encTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        encTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        encTitleRow.height = 26;

        encaissementsSheet.mergeCells('A2:F2');
        const encSubRow = encaissementsSheet.getRow(2);
        encSubRow.getCell(1).value = dateSousTitre;
        encSubRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        encSubRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        encSubRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        encSubRow.height = 18;

        encaissementsSheet.mergeCells('A3:F3');
        const encGenRow = encaissementsSheet.getRow(3);
        encGenRow.getCell(1).value = infoGeneration;
        encGenRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF475569' } };
        encGenRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        encGenRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        encGenRow.height = 18;

        // Ligne d'en-têtes colonnes
        const encColHeaders = ['Heure', 'N° Facture', 'Patient', 'Mode de Paiement', 'Référence', 'Montant (FCFA)'];
        const encColWidths = [12, 18, 26, 18, 20, 16];
        const encHeaderRow = encaissementsSheet.getRow(4);
        encHeaderRow.height = 22;

        encColHeaders.forEach((lbl, idx) => {
            const cell = encHeaderRow.getCell(idx + 1);
            cell.value = lbl;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            encaissementsSheet.getColumn(idx + 1).width = encColWidths[idx];
        });

        // Données
        (paiements || []).forEach((p, idx) => {
            const rowIdx = idx + 5;
            const row = encaissementsSheet.getRow(rowIdx);
            row.height = 20;

            const heure = p.date_paiement
                ? new Date(p.date_paiement).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : '-';
            const numFacture = p.factures ? p.factures.numero_facture : '-';
            const patient = (p.factures && p.factures.patients)
                ? `${p.factures.patients.nom} ${p.factures.patients.prenom}`.trim()
                : '-';
            const mode = formatMode(p.mode_paiement);
            const ref = p.reference || '-';
            const montant = Math.round(parseFloat(p.montant) || 0);

            const values = [heure, numFacture, patient, mode, ref, montant];

            values.forEach((val, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = val;
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' }
                };
                cell.border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };

                if (colIdx === 0 || colIdx === 1 || colIdx === 3 || colIdx === 4) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else if (colIdx === 2) {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                } else if (colIdx === 5) {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    cell.numFmt = '# ##0 "FCFA"';
                }
            });
        });

        // Ligne de total
        const totalEncRowIdx = (paiements || []).length + 5;
        const totalEncRow = encaissementsSheet.getRow(totalEncRowIdx);
        totalEncRow.height = 22;

        encaissementsSheet.mergeCells(`A${totalEncRowIdx}:E${totalEncRowIdx}`);
        const totalEncLabelCell = totalEncRow.getCell(1);
        totalEncLabelCell.value = 'TOTAL ENCAISSÉ';
        totalEncLabelCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalEncLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        totalEncLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        for (let c = 1; c <= 5; c++) {
            totalEncRow.getCell(c).border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        }

        const totalEncValCell = totalEncRow.getCell(6);
        const encDataEnd = (paiements || []).length + 4;
        if ((paiements || []).length > 0) {
            totalEncValCell.value = { formula: `SUM(F5:F${encDataEnd})`, result: totalEncaisse };
        } else {
            totalEncValCell.value = 0;
        }
        totalEncValCell.font = { bold: true, color: { argb: 'FF0F172A' } };
        totalEncValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        totalEncValCell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        totalEncValCell.alignment = { horizontal: 'right', vertical: 'middle' };
        totalEncValCell.numFmt = '# ##0 "FCFA"';

        // -------------------------------------------------------------
        // Onglet 2 : Dépenses
        // -------------------------------------------------------------
        const depensesSheet = workbook.addWorksheet('Dépenses', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        depensesSheet.views = [{ state: 'frozen', ySplit: 4 }];
        depensesSheet.autoFilter = { from: 'A4', to: 'F4' };

        // Titre & En-tête
        depensesSheet.mergeCells('A1:F1');
        const depTitleRow = depensesSheet.getRow(1);
        depTitleRow.getCell(1).value = 'SORTIES DE CAISSE (DÉPENSES)';
        depTitleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        depTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC2410C' } };
        depTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        depTitleRow.height = 26;

        depensesSheet.mergeCells('A2:F2');
        const depSubRow = depensesSheet.getRow(2);
        depSubRow.getCell(1).value = dateSousTitre;
        depSubRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        depSubRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        depSubRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        depSubRow.height = 18;

        depensesSheet.mergeCells('A3:F3');
        const depGenRow = depensesSheet.getRow(3);
        depGenRow.getCell(1).value = infoGeneration;
        depGenRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF475569' } };
        depGenRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        depGenRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        depGenRow.height = 18;

        // Ligne d'en-têtes colonnes
        const depColHeaders = ['Heure', 'Motif', 'Bénéficiaire', 'Catégorie', 'Enregistré par', 'Montant (FCFA)'];
        const depColWidths = [12, 30, 20, 16, 18, 16];
        const depHeaderRow = depensesSheet.getRow(4);
        depHeaderRow.height = 22;

        depColHeaders.forEach((lbl, idx) => {
            const cell = depHeaderRow.getCell(idx + 1);
            cell.value = lbl;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC2410C' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            depensesSheet.getColumn(idx + 1).width = depColWidths[idx];
        });

        // Données
        (depenses || []).forEach((d, idx) => {
            const rowIdx = idx + 5;
            const row = depensesSheet.getRow(rowIdx);
            row.height = 20;

            const heure = d.heure || (d.created_at ? new Date(d.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-');
            const motif = d.motif || '-';
            const beneficiaire = d.beneficiaire || '-';
            const categorie = d.categorie || '-';
            const utilisateur = d.utilisateur_nom || '-';
            const montant = Math.round(parseFloat(d.montant) || 0);

            const values = [heure, motif, beneficiaire, categorie, utilisateur, montant];

            values.forEach((val, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = val;
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' }
                };
                cell.border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };

                if (colIdx === 0 || colIdx === 3) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else if (colIdx === 1 || colIdx === 2 || colIdx === 4) {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                } else if (colIdx === 5) {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    cell.numFmt = '# ##0 "FCFA"';
                }
            });
        });

        // Ligne de total
        const totalDepRowIdx = (depenses || []).length + 5;
        const totalDepRow = depensesSheet.getRow(totalDepRowIdx);
        totalDepRow.height = 22;

        depensesSheet.mergeCells(`A${totalDepRowIdx}:E${totalDepRowIdx}`);
        const totalDepLabelCell = totalDepRow.getCell(1);
        totalDepLabelCell.value = 'TOTAL DÉPENSES';
        totalDepLabelCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalDepLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC2410C' } };
        totalDepLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        for (let c = 1; c <= 5; c++) {
            totalDepRow.getCell(c).border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        }

        const totalDepValCell = totalDepRow.getCell(6);
        const depDataEnd = (depenses || []).length + 4;
        if ((depenses || []).length > 0) {
            totalDepValCell.value = { formula: `SUM(F5:F${depDataEnd})`, result: totalDepenses };
        } else {
            totalDepValCell.value = 0;
        }
        totalDepValCell.font = { bold: true, color: { argb: 'FF0F172A' } };
        totalDepValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        totalDepValCell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        totalDepValCell.alignment = { horizontal: 'right', vertical: 'middle' };
        totalDepValCell.numFmt = '# ##0 "FCFA"';

        // -------------------------------------------------------------
        // Onglet 3 : Synthèse
        // -------------------------------------------------------------
        const syntheseSheet = workbook.addWorksheet('Synthèse', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        syntheseSheet.mergeCells('A1:B1');
        const synTitleRow = syntheseSheet.getRow(1);
        synTitleRow.getCell(1).value = 'SYNTHÈSE DES SOLDES DU JOUR';
        synTitleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        synTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        synTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        synTitleRow.height = 28;

        syntheseSheet.mergeCells('A2:B2');
        const synSubRow = syntheseSheet.getRow(2);
        synSubRow.getCell(1).value = dateSousTitre;
        synSubRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        synSubRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        synSubRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        synSubRow.height = 18;

        syntheseSheet.mergeCells('A3:B3');
        const synGenRow = syntheseSheet.getRow(3);
        synGenRow.getCell(1).value = infoGeneration;
        synGenRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF334155' } };
        synGenRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        synGenRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        synGenRow.height = 18;

        // Tableau KPI
        syntheseSheet.getCell('A5').value = 'Indicateur';
        syntheseSheet.getCell('B5').value = 'Valeur';
        syntheseSheet.getCell('A5').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        syntheseSheet.getCell('B5').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        syntheseSheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        syntheseSheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        syntheseSheet.getCell('A5').alignment = { horizontal: 'left', vertical: 'middle' };
        syntheseSheet.getCell('B5').alignment = { horizontal: 'right', vertical: 'middle' };
        syntheseSheet.getCell('A5').border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        syntheseSheet.getCell('B5').border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        syntheseSheet.getRow(5).height = 22;

        syntheseSheet.getColumn(1).width = 34;
        syntheseSheet.getColumn(2).width = 24;

        const kpiRows = [
            ['Total Espèces Encaissées', Number(totalEspeces || 0)],
            ['Total Mobile Money', Number(totalMobileMoney || 0)],
            ['Total Autres modes', Number(totalAutres || 0)],
            ['TOTAL GLOBAL ENCAISSÉ', Number(totalEncaisse || 0)],
            ['Total Sorties de Caisse', Number(totalDepenses || 0)],
            ['SOLDE NET ESPÈCES EN CAISSE', Number(soldeNet || 0)]
        ];

        kpiRows.forEach((metric, index) => {
            const rowNum = index + 6;
            const keyCell = syntheseSheet.getCell(rowNum, 1);
            const valueCell = syntheseSheet.getCell(rowNum, 2);
            syntheseSheet.getRow(rowNum).height = 20;

            keyCell.value = metric[0];
            valueCell.value = metric[1];
            keyCell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            valueCell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

            const isHighlight = metric[0] === 'TOTAL GLOBAL ENCAISSÉ' || metric[0] === 'SOLDE NET ESPÈCES EN CAISSE';
            if (isHighlight) {
                keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
                keyCell.font = { bold: true, color: { argb: 'FF0F172A' } };
                const isNegative = metric[0] === 'SOLDE NET ESPÈCES EN CAISSE' && metric[1] < 0;
                valueCell.font = {
                    bold: true,
                    color: { argb: isNegative ? 'FFDC2626' : (metric[0] === 'SOLDE NET ESPÈCES EN CAISSE' ? 'FF16A34A' : 'FF0F172A') }
                };
            } else {
                keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
                valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
                keyCell.font = { bold: false, color: { argb: 'FF334155' } };
                valueCell.font = { bold: true, color: { argb: 'FF0F172A' } };
            }

            keyCell.alignment = { horizontal: 'left', vertical: 'middle' };
            valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
            valueCell.numFmt = '# ##0 "FCFA"';
        });

        // Règle de mise en forme conditionnelle pour le solde net (rouge si < 0)
        syntheseSheet.addConditionalFormatting({
            ref: 'B11',
            rules: [
                {
                    type: 'cellIs',
                    operator: 'lessThan',
                    formulae: ['0'],
                    style: {
                        font: { color: { argb: 'FFDC2626' }, bold: true }
                    }
                }
            ]
        });

        // Envoi du fichier Excel généré
        const filename = `caisse_GSPM_${dateStr}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export Excel caisse:', error);
        req.flash('error', 'Erreur lors de l\'export Excel du journal de caisse');
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
