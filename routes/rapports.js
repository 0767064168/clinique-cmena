const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { supabase } = require('../config/supabase');

const formatMoney = (value) => `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
const formatPercent = (value) => `${Number(value || 0).toFixed(0)} %`;
const csvSafe = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const asNumber = (value) => Number(value || 0);

// Helper pour générer la série chronologique d'évolution (journalière ou mensuelle)
function buildEvolutionTimeline(date_from, date_to, factures, paiements, consultations, patients) {
    const [yFrom, mFrom, dFrom] = (date_from || '').split('-').map(Number);
    const [yTo, mTo, dTo] = (date_to || '').split('-').map(Number);

    const start = (yFrom && mFrom && dFrom) ? new Date(yFrom, mFrom - 1, dFrom) : new Date();
    const end = (yTo && mTo && dTo) ? new Date(yTo, mTo - 1, dTo) : new Date();

    const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
    const isMonthly = diffDays > 62;

    const map = new Map();

    if (!isMonthly) {
        let cur = new Date(start);
        while (cur <= end) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            const key = `${y}-${m}-${d}`;
            const label = `${d}/${m}`;
            const fullDate = cur.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
            map.set(key, { key, label, fullDate, facturation: 0, encaissement: 0, consultations: 0, patients: 0 });
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        let cur = new Date(start.getFullYear(), start.getMonth(), 1);
        const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
        while (cur <= endMonth) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const key = `${y}-${m}`;
            const label = cur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            const fullDate = cur.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            map.set(key, { key, label, fullDate, facturation: 0, encaissement: 0, consultations: 0, patients: 0 });
            cur.setMonth(cur.getMonth() + 1);
        }
    }

    (factures || []).forEach(f => {
        if (f.statut === 'brouillon' || f.statut === 'annulee') return;
        const d = String(f.date_facture || '').slice(0, isMonthly ? 7 : 10);
        if (map.has(d)) {
            map.get(d).facturation += Number(f.total_net || 0);
        }
    });

    (paiements || []).forEach(p => {
        const d = String(p.date_paiement || '').slice(0, isMonthly ? 7 : 10);
        if (map.has(d)) {
            map.get(d).encaissement += Number(p.montant || 0);
        }
    });

    (consultations || []).forEach(c => {
        const d = String(c.date_entree || '').slice(0, isMonthly ? 7 : 10);
        if (map.has(d)) {
            map.get(d).consultations += 1;
        }
    });

    (patients || []).forEach(pat => {
        const d = String(pat.created_at || '').slice(0, isMonthly ? 7 : 10);
        if (map.has(d)) {
            map.get(d).patients += 1;
        }
    });

    const points = Array.from(map.values());

    let peakFacturation = { montant: 0, date: '-' };
    let peakEncaissement = { montant: 0, date: '-' };
    let peakConsultations = { count: 0, date: '-' };

    points.forEach(p => {
        if (p.facturation > peakFacturation.montant) {
            peakFacturation = { montant: p.facturation, date: p.fullDate };
        }
        if (p.encaissement > peakEncaissement.montant) {
            peakEncaissement = { montant: p.encaissement, date: p.fullDate };
        }
        if (p.consultations > peakConsultations.count) {
            peakConsultations = { count: p.consultations, date: p.fullDate };
        }
    });

    return {
        isMonthly,
        labels: points.map(p => p.label),
        fullDates: points.map(p => p.fullDate),
        facturation: points.map(p => p.facturation),
        encaissement: points.map(p => p.encaissement),
        consultations: points.map(p => p.consultations),
        patients: points.map(p => p.patients),
        peaks: {
            peakFacturation,
            peakEncaissement,
            peakConsultations
        }
    };
}

async function getRapportData(date_from, date_to) {
    const { data: factures, error: errFactures } = await supabase
        .from('factures')
        .select('*, patients(nom, prenom, numero_dossier)')
        .gte('date_facture', `${date_from}T00:00:00.000Z`)
        .lte('date_facture', `${date_to}T23:59:59.999Z`)
        .neq('statut', 'annulee')
        .order('date_facture', { ascending: false });

    if (errFactures) throw errFactures;

    const { data: paiements, error: errPaiements } = await supabase
        .from('paiements')
        .select('montant, mode_paiement, date_paiement, reference, factures!inner(numero_facture, statut, patients(nom, prenom))')
        .neq('factures.statut', 'annulee')
        .gte('date_paiement', `${date_from}T00:00:00.000Z`)
        .lte('date_paiement', `${date_to}T23:59:59.999Z`)
        .order('date_paiement', { ascending: false });

    if (errPaiements) throw errPaiements;

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

    let totalFactureNet = 0;
    let totalFactureBrouillon = 0;
    let totalResteAPayer = 0;
    let totalRemises = 0;
    let totalFacturesValidees = 0;

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

        if (f.statut !== 'brouillon') {
            totalFactureNet += net;
            totalRemises += remise;
            totalResteAPayer += reste;
            totalFacturesValidees += 1;
        } else {
            totalFactureBrouillon += net;
        }
    });

    const moyenneFactureNet = totalFacturesValidees > 0 ? totalFactureNet / totalFacturesValidees : 0;
    const tauxRecouvrement = totalFactureNet > 0 ? (totalEncaisseReel / totalFactureNet) * 100 : 0;

    const { data: consultations, error: errConsultations } = await supabase
        .from('consultations')
        .select('id, statut, date_entree')
        .gte('date_entree', `${date_from}T00:00:00.000Z`)
        .lte('date_entree', `${date_to}T23:59:59.999Z`);

    if (errConsultations) throw errConsultations;

    const totalConsultations = (consultations || []).length;
    const consultationsTerminees = (consultations || []).filter(c => c.statut === 'termine').length;

    const { data: patientsList, count: nouveauxPatients, error: errPatients } = await supabase
        .from('patients')
        .select('id, created_at', { count: 'exact' })
        .gte('created_at', `${date_from}T00:00:00.000Z`)
        .lte('created_at', `${date_to}T23:59:59.999Z`);

    if (errPatients) throw errPatients;

    const evolution = buildEvolutionTimeline(date_from, date_to, factures, paiements, consultations, patientsList);

    return {
        factures: factures || [],
        paiements: paiements || [],
        evolution,
        stats: {
            totalFactureNet,
            totalFactureBrouillon,
            totalEncaisse: totalEncaisseReel,
            totalResteAPayer,
            totalRemises,
            totalFactures: (factures || []).length,
            totalFacturesValidees,
            moyenneFactureNet,
            tauxRecouvrement,
            statutsCount,
            totalConsultations,
            consultationsTerminees,
            nouveauxPatients: nouveauxPatients || 0,
            modesPaiement
        }
    };
}

router.get('/', async (req, res) => {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        const defaultFrom = `${year}-${month}-01`;
        const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0).getDate();
        const defaultTo = `${year}-${month}-${String(lastDayOfMonth).padStart(2, '0')}`;

        const date_from = req.query.date_from || defaultFrom;
        const date_to = req.query.date_to || defaultTo;

        const { factures, stats, evolution } = await getRapportData(date_from, date_to);

        res.render('rapports/index', {
            title: 'Rapports d\'Activité & Financiers',
            date_from,
            date_to,
            stats,
            factures,
            evolution
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

        const { factures, paiements } = await getRapportData(date_from, date_to);

        const filename = `Rapport_Financier_GSPM_${date_from}_au_${date_to}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        let csvContent = '\uFEFF';

        csvContent += `RAPPORTS D'ACTIVITÉ & FINANCIERS\n`;
        csvContent += `CSA 3e COMPAGNIE GSPM BOUAKÉ\n`;
        csvContent += `Période du : ${date_from} au ${date_to}\n`;
        csvContent += `Généré le : ${new Date().toLocaleString('fr-FR')}\n\n`;

        const totalFacturesValides = (factures || []).filter(f => f.statut !== 'brouillon').length;
        const totalFactureNet = (factures || []).reduce((sum, f) => sum + (f.statut !== 'brouillon' ? Number(f.total_net || 0) : 0), 0);
        const totalEncaisse = (paiements || []).reduce((sum, p) => sum + Number(p.montant || 0), 0);
        const totalReste = (factures || []).reduce((sum, f) => sum + (f.statut !== 'brouillon' ? Number(f.reste_a_payer || 0) : 0), 0);

        csvContent += `Indicateurs clés;Valeur\n`;
        csvContent += `Factures validées;${csvSafe(totalFacturesValides)}\n`;
        csvContent += `Total facturé net;${csvSafe(formatMoney(totalFactureNet).replace(' FCFA', ''))}\n`;
        csvContent += `Total encaissé;${csvSafe(formatMoney(totalEncaisse).replace(' FCFA', ''))}\n`;
        csvContent += `Reste à recouvrer;${csvSafe(formatMoney(totalReste).replace(' FCFA', ''))}\n\n`;

        csvContent += `--- SECTION 1 : FACTURES ÉMISES SUR LA PÉRIODE ---\n`;
        csvContent += `N° Facture;Date;N° Dossier;Patient;Statut;Total Brut (FCFA);Remise (FCFA);Total Net (FCFA);Montant Payé (FCFA);Reste à Payer (FCFA)\n`;

        let sumFactureNet = 0;
        let sumReste = 0;

        (factures || []).forEach(f => {
            const pat = f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-';
            const numDos = f.patients ? f.patients.numero_dossier : '-';
            const d = f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '-';
            const brut = asNumber(f.total);
            const remise = asNumber(f.remise);
            const net = asNumber(f.total_net);
            const paye = asNumber(f.montant_paye);
            const reste = asNumber(f.reste_a_payer);

            if (f.statut !== 'brouillon') {
                sumFactureNet += net;
                sumReste += reste;
            }

            csvContent += `${csvSafe(f.numero_facture || '-')};${csvSafe(d)};${csvSafe(numDos)};${csvSafe(pat)};${csvSafe(f.statut || '-')};${csvSafe(brut)};${csvSafe(remise)};${csvSafe(net)};${csvSafe(paye)};${csvSafe(reste)}\n`;
        });

        csvContent += `;;;;TOTAL FACTURE NET VALIDE;;${csvSafe(sumFactureNet)};;${csvSafe(sumReste)}\n\n`;

        csvContent += `--- SECTION 2 : ENCAISSEMENTS RÉELS SUR LA PÉRIODE ---\n`;
        csvContent += `Date Paiement;N° Facture;Patient;Mode de Règlement;Référence;Montant Encaisse (FCFA)\n`;

        let sumEncaisse = 0;
        (paiements || []).forEach(p => {
            const numFac = p.factures ? p.factures.numero_facture : '-';
            const pat = (p.factures && p.factures.patients) ? `${p.factures.patients.nom} ${p.factures.patients.prenom}` : '-';
            const d = p.date_paiement ? new Date(p.date_paiement).toLocaleString('fr-FR') : '-';
            const montant = asNumber(p.montant);
            sumEncaisse += montant;

            csvContent += `${csvSafe(d)};${csvSafe(numFac)};${csvSafe(pat)};${csvSafe(p.mode_paiement || 'especes')};${csvSafe(p.reference || '-')};${csvSafe(montant)}\n`;
        });

        csvContent += `;;;;TOTAL ENCAISSE RÉEL;${csvSafe(sumEncaisse)}\n\n`;

        const modeLabels = {
            especes: 'Espèces',
            carte: 'Carte',
            mobile_money: 'Mobile Money',
            virement: 'Virement',
            cheque: 'Chèque'
        };

        const modeSummary = Object.entries({
            especes: Number((paiements || []).filter(p => (p.mode_paiement || 'especes').toLowerCase() === 'especes').reduce((s, p) => s + Number(p.montant || 0), 0)),
            carte: Number((paiements || []).filter(p => (p.mode_paiement || 'especes').toLowerCase() === 'carte').reduce((s, p) => s + Number(p.montant || 0), 0)),
            mobile_money: Number((paiements || []).filter(p => (p.mode_paiement || 'especes').toLowerCase() === 'mobile_money').reduce((s, p) => s + Number(p.montant || 0), 0)),
            virement: Number((paiements || []).filter(p => (p.mode_paiement || 'especes').toLowerCase() === 'virement').reduce((s, p) => s + Number(p.montant || 0), 0)),
            cheque: Number((paiements || []).filter(p => (p.mode_paiement || 'especes').toLowerCase() === 'cheque').reduce((s, p) => s + Number(p.montant || 0), 0))
        }).filter(([, total]) => total > 0);

        csvContent += `--- SECTION 3 : RÉPARTITION DES MODES DE PAIEMENT ---\n`;
        csvContent += `Mode;Montant;Part (%)\n`;
        modeSummary.forEach(([mode, montant]) => {
            const percent = sumEncaisse > 0 ? ((montant / sumEncaisse) * 100) : 0;
            csvContent += `${csvSafe(modeLabels[mode] || mode)};${csvSafe(montant)};${csvSafe(`${percent.toFixed(1)} %`)}\n`;
        });

        res.send(csvContent);
    } catch (error) {
        console.error('Erreur export CSV:', error);
        req.flash('error', 'Erreur lors de la génération du fichier Excel/CSV');
        res.redirect('/rapports');
    }
});

router.get('/export/excel', async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        if (!date_from || !date_to) {
            req.flash('error', 'Veuillez spécifier une période pour l\'export');
            return res.redirect('/rapports');
        }

        const { factures, paiements, stats } = await getRapportData(date_from, date_to);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        workbook.created = new Date();
        workbook.modified = new Date();

        const generatedAt = new Date();
        const syntheseSheet = workbook.addWorksheet('Synthèse', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        syntheseSheet.mergeCells('A1:K1');
        syntheseSheet.mergeCells('A2:K2');
        syntheseSheet.mergeCells('A3:K3');

        const titleRow = syntheseSheet.getRow(1);
        titleRow.getCell(1).value = 'RAPPORTS D\'ACTIVITÉ & FINANCIERS';
        titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 28;

        const subtitleRow = syntheseSheet.getRow(2);
        subtitleRow.getCell(1).value = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        subtitleRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        subtitleRow.getCell(1).alignment = { horizontal: 'center' };
        subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        subtitleRow.height = 18;

        const subHeaderRow = syntheseSheet.getRow(3);
        subHeaderRow.getCell(1).value = `Période du ${date_from} au ${date_to} — Généré le ${generatedAt.toLocaleDateString('fr-FR')} à ${generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        subHeaderRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF334155' } };
        subHeaderRow.getCell(1).alignment = { horizontal: 'center' };
        subHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        subHeaderRow.height = 18;

        const kpiRows = [
            ['Factures validées', Number(stats.totalFacturesValidees || 0)],
            ['Total facturé net', Number(stats.totalFactureNet || 0)],
            ['Total encaissé', Number(stats.totalEncaisse || 0)],
            ['Reste à recouvrer', Number(stats.totalResteAPayer || 0)],
            ['Consultations', Number(stats.totalConsultations || 0)],
            ['Nouveaux patients', Number(stats.nouveauxPatients || 0)],
            ['Moyenne facture', Number(stats.moyenneFactureNet || 0)],
            ['Taux recouvrement', Number(stats.tauxRecouvrement || 0) / 100]
        ];

        syntheseSheet.getCell('A5').value = 'Indicateur';
        syntheseSheet.getCell('B5').value = 'Valeur';
        syntheseSheet.getCell('A5').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        syntheseSheet.getCell('B5').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        syntheseSheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        syntheseSheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        syntheseSheet.getColumn(1).width = 30;
        syntheseSheet.getColumn(2).width = 24;

        kpiRows.forEach((metric, index) => {
            const row = index + 6;
            const keyCell = syntheseSheet.getCell(row, 1);
            const valueCell = syntheseSheet.getCell(row, 2);
            keyCell.value = metric[0];
            valueCell.value = metric[1];
            keyCell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            valueCell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            keyCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
            valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
            valueCell.font = { bold: true, color: { argb: 'FF0F172A' } };
            if (typeof metric[1] === 'number') {
                if (metric[0] === 'Taux recouvrement') {
                    valueCell.numFmt = '0.0%';
                } else if (metric[0].includes('Total') || metric[0].includes('Moyenne') || metric[0].includes('Reste')) {
                    valueCell.numFmt = '# ##0 "FCFA"';
                } else {
                    valueCell.numFmt = '#,##0';
                }
            }
        });

        const facturesSheet = workbook.addWorksheet('Factures', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        facturesSheet.views = [{ state: 'frozen', ySplit: 4 }];
        facturesSheet.autoFilter = {
            from: 'A4',
            to: 'J4'
        };
        facturesSheet.mergeCells('A1:K1');
        const factHeader = facturesSheet.getRow(1);
        factHeader.getCell(1).value = 'DÉTAIL DES FACTURES';
        factHeader.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        factHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        factHeader.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        factHeader.height = 24;
        facturesSheet.getCell('A2').value = `Période : ${date_from} au ${date_to}`;
        facturesSheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };

        const factureHeaders = [
            'N° Facture', 'Date', 'N° Dossier', 'Patient', 'Statut', 'Total Brut', 'Remise', 'Total Net', 'Montant Payé', 'Reste à Payer'
        ];
        const factureHeaderRow = facturesSheet.getRow(4);
        factureHeaders.forEach((label, index) => {
            const cell = factureHeaderRow.getCell(index + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            facturesSheet.getColumn(index + 1).width = [18, 14, 14, 26, 18, 15, 12, 15, 15, 18][index];
        });

        (factures || []).forEach((f, idx) => {
            const row = facturesSheet.getRow(idx + 5);
            const patient = f.patients ? `${f.patients.nom} ${f.patients.prenom}`.trim() : '-';
            const dossier = f.patients ? f.patients.numero_dossier : '-';
            const values = [
                f.numero_facture || '-',
                f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '-',
                dossier,
                patient,
                f.statut || '-',
                Number(f.total || 0),
                Number(f.remise || 0),
                Number(f.total_net || 0),
                Number(f.montant_paye || 0),
                Number(f.reste_a_payer || 0)
            ];

            values.forEach((value, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = value;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
                cell.border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
                if (typeof value === 'number' && colIdx >= 5) {
                    cell.numFmt = '# ##0 "FCFA"';
                }
            });
        });

        const totalFacturesRow = facturesSheet.getRow((factures || []).length + 6);
        totalFacturesRow.getCell(1).value = 'TOTAL';
        totalFacturesRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalFacturesRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        totalFacturesRow.getCell(8).value = (factures || []).reduce((sum, f) => sum + Number(f.total_net || 0), 0);
        totalFacturesRow.getCell(9).value = (factures || []).reduce((sum, f) => sum + Number(f.montant_paye || 0), 0);
        totalFacturesRow.getCell(10).value = (factures || []).reduce((sum, f) => sum + Number(f.reste_a_payer || 0), 0);
        [8, 9, 10].forEach(col => {
            const cell = totalFacturesRow.getCell(col);
            cell.numFmt = '# ##0 "FCFA"';
            cell.font = { bold: true, color: { argb: 'FF0F172A' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        });

        const encaissementsSheet = workbook.addWorksheet('Encaissements', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        encaissementsSheet.views = [{ state: 'frozen', ySplit: 4 }];
        encaissementsSheet.autoFilter = {
            from: 'A4',
            to: 'F4'
        };
        encaissementsSheet.mergeCells('A1:F1');
        const encHeader = encaissementsSheet.getRow(1);
        encHeader.getCell(1).value = 'DÉTAIL DES ENCAISSEMENTS';
        encHeader.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        encHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        encHeader.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        encHeader.height = 24;
        encaissementsSheet.getCell('A2').value = `Période : ${date_from} au ${date_to}`;
        encaissementsSheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };

        const encHeaders = ['Date', 'N° Facture', 'Patient', 'Mode', 'Référence', 'Montant'];
        const encHeaderRow = encaissementsSheet.getRow(4);
        encHeaders.forEach((label, index) => {
            const cell = encHeaderRow.getCell(index + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
            encaissementsSheet.getColumn(index + 1).width = [16, 18, 28, 18, 26, 18][index];
        });

        (paiements || []).forEach((p, idx) => {
            const row = encaissementsSheet.getRow(idx + 5);
            const patient = p.factures && p.factures.patients ? `${p.factures.patients.nom} ${p.factures.patients.prenom}`.trim() : '-';
            const values = [
                p.date_paiement ? new Date(p.date_paiement).toLocaleString('fr-FR') : '-',
                p.factures ? p.factures.numero_facture : '-',
                patient,
                p.mode_paiement || 'especes',
                p.reference || '-',
                Number(p.montant || 0)
            ];

            values.forEach((value, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = value;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
                cell.border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
                if (typeof value === 'number') {
                    cell.numFmt = '# ##0 "FCFA"';
                }
            });
        });

        const totalEncaisseRow = encaissementsSheet.getRow((paiements || []).length + 6);
        totalEncaisseRow.getCell(1).value = 'TOTAL ENCAISSE';
        totalEncaisseRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalEncaisseRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        totalEncaisseRow.getCell(6).value = (paiements || []).reduce((sum, p) => sum + Number(p.montant || 0), 0);
        totalEncaisseRow.getCell(6).numFmt = '# ##0 "FCFA"';
        totalEncaisseRow.getCell(6).font = { bold: true, color: { argb: 'FF0F172A' } };
        totalEncaisseRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        totalEncaisseRow.getCell(6).border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

        const paymentBreakdownSheet = workbook.addWorksheet('Répartition paiements', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        paymentBreakdownSheet.views = [{ state: 'frozen', ySplit: 4 }];
        paymentBreakdownSheet.autoFilter = {
            from: 'A4',
            to: 'C4'
        };
        paymentBreakdownSheet.mergeCells('A1:D1');
        const paymentHeader = paymentBreakdownSheet.getRow(1);
        paymentHeader.getCell(1).value = 'RÉPARTITION DES MODES DE PAIEMENT';
        paymentHeader.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        paymentHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        paymentHeader.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        paymentHeader.height = 24;
        paymentBreakdownSheet.getCell('A2').value = `Période : ${date_from} au ${date_to}`;
        paymentBreakdownSheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };

        const modeLabels = {
            especes: 'Espèces',
            carte: 'Carte',
            mobile_money: 'Mobile Money',
            virement: 'Virement',
            cheque: 'Chèque'
        };
        const paymentSummary = Object.entries(stats.modesPaiement || {}).filter(([, total]) => Number(total) > 0);
        const totalPaiements = paymentSummary.reduce((sum, [, total]) => sum + Number(total || 0), 0);

        const paymentHeaderRow = paymentBreakdownSheet.getRow(4);
        ['Mode', 'Montant', 'Part (%)'].forEach((label, index) => {
            const cell = paymentHeaderRow.getCell(index + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        });

        paymentSummary.forEach(([mode, total], idx) => {
            const row = paymentBreakdownSheet.getRow(idx + 5);
            const amount = Number(total || 0);
            const percent = totalPaiements > 0 ? (amount / totalPaiements) * 100 : 0;
            row.getCell(1).value = modeLabels[mode] || mode;
            row.getCell(2).value = amount;
            row.getCell(3).value = percent / 100;
            row.getCell(2).numFmt = '# ##0 "FCFA"';
            row.getCell(3).numFmt = '0.0%';
            row.getCell(1).border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
            row.getCell(2).border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
            row.getCell(3).border = { all: { style: 'thin', color: { argb: 'FFDDDDDD' } } };
            row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
            row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
            row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } };
        });

        const totalModeRow = paymentBreakdownSheet.getRow((paymentSummary || []).length + 5);
        totalModeRow.getCell(1).value = 'TOTAL';
        totalModeRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        totalModeRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        totalModeRow.getCell(2).value = totalPaiements;
        totalModeRow.getCell(2).numFmt = '# ##0 "FCFA"';
        totalModeRow.getCell(2).font = { bold: true, color: { argb: 'FF0F172A' } };
        totalModeRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        totalModeRow.getCell(3).value = 1;
        totalModeRow.getCell(3).numFmt = '0.0%';
        totalModeRow.getCell(3).font = { bold: true, color: { argb: 'FF0F172A' } };
        totalModeRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        [1, 2, 3].forEach(col => {
            const cell = totalModeRow.getCell(col);
            cell.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        });

        const filename = `Rapports_Activite_Financiers_${date_from}_au_${date_to}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export Excel rapports:', error);
        req.flash('error', 'Erreur lors de la génération du fichier Excel');
        res.redirect('/rapports');
    }
});

module.exports = router;
