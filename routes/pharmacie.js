const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { supabase } = require('../config/supabase');
const { logAudit } = require('../utils/audit');

// GET /pharmacie — Liste des produits avec filtres et statistiques
// Helpers pour l'analyse des délais de péremption
const getExpiryDaysDiff = (dateStr, todayStr) => {
    if (!dateStr) return null;
    const t = new Date(todayStr || new Date().toISOString().split('T')[0]);
    t.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
};

const getExpiryLabel = (dateStr, todayStr) => {
    const diff = getExpiryDaysDiff(dateStr, todayStr);
    if (diff === null) return 'Non définie';
    if (diff < 0) return `Périmé (depuis ${Math.abs(diff)}j)`;
    if (diff === 0) return "Expire aujourd'hui";
    if (diff <= 30) return `Expire dans ${diff}j (Urgent)`;
    if (diff <= 60) return `Expire dans ${diff}j`;
    if (diff <= 90) return `Expire dans ${diff}j`;
    return `Valide (${diff}j)`;
};

// GET /pharmacie — Liste des produits avec filtres et statistiques avancées
router.get('/', async (req, res) => {
    try {
        const search = typeof req.query.search === 'string'
            ? req.query.search.trim().replace(/[^a-zA-Z0-9À-ÿ\s-]/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        const categorie = typeof req.query.categorie === 'string' ? req.query.categorie : '';
        const stock_alert = req.query.stock_alert === 'oui' ? 'oui' : '';
        const perime = req.query.perime === 'oui' ? 'oui' : '';
        const delai_peremption = req.query.delai_peremption || (perime === 'oui' ? 'perime' : '');
        const today = new Date().toISOString().split('T')[0];
        const pageValue = Number.parseInt(req.query.page, 10);
        const requestedPage = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 1000000 ? pageValue : 1;
        const pageSize = 25;

        let products = [];
        let totalCount = 0;
        let stats = {
            totalProduits: 0,
            totalValeurStock: 0,
            produitsEnAlerte: 0,
            produitsEnRupture: 0,
            produitsPerimes: 0,
            produitsBientotPerimes: 0,
            produitsExpirent30j: 0
        };

        // 1. Calcul des statistiques globales sur le stock actif
        const { data: allActive, error: errAll } = await supabase
            .from('produits_pharmacie')
            .select('stock_actuel, stock_minimum, prix_vente, date_peremption')
            .eq('actif', true);

        if (!errAll && allActive) {
            stats.totalProduits = allActive.length;
            stats.totalValeurStock = allActive.reduce((acc, p) => acc + (Number(p.stock_actuel || 0) * Number(p.prix_vente || 0)), 0);
            stats.produitsEnAlerte = allActive.filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0)).length;
            stats.produitsEnRupture = allActive.filter(p => Number(p.stock_actuel || 0) <= 0).length;
            stats.produitsPerimes = allActive.filter(p => p.date_peremption && p.date_peremption < today).length;
            stats.produitsExpirent30j = allActive.filter(p => {
                const diff = getExpiryDaysDiff(p.date_peremption, today);
                return diff !== null && diff >= 0 && diff <= 30;
            }).length;
            stats.produitsBientotPerimes = allActive.filter(p => {
                const diff = getExpiryDaysDiff(p.date_peremption, today);
                return diff !== null && diff >= 0 && diff <= 90;
            }).length;
        }

        // 2. Requête filtrée pour la page courante
        let query = supabase
            .from('produits_pharmacie')
            .select('*', { count: 'exact' })
            .eq('actif', true);

        if (search) {
            query = query.or(`designation.ilike.%${search}%,code.ilike.%${search}%`);
        }
        if (categorie) {
            query = query.eq('categorie', categorie);
        }

        if (delai_peremption === 'perime') {
            query = query.not('date_peremption', 'is', null).lt('date_peremption', today);
        } else if (delai_peremption === '30' || delai_peremption === '60' || delai_peremption === '90') {
            const days = parseInt(delai_peremption, 10);
            const maxDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            query = query.not('date_peremption', 'is', null).gte('date_peremption', today).lte('date_peremption', maxDate);
        }

        const { data: pageItems, count: queryCount, error: pageErr } = await query
            .order('designation', { ascending: true })
            .order('id', { ascending: true });

        if (pageErr) throw pageErr;

        let filteredItems = pageItems || [];

        // Filtre stock alert côté serveur pour comparaison stock_actuel <= stock_minimum
        if (stock_alert === 'oui') {
            filteredItems = filteredItems.filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0));
        }

        totalCount = filteredItems.length;
        const totalPages = Math.ceil(totalCount / pageSize) || 1;
        const currentPage = Math.min(requestedPage, totalPages);
        const startIndex = (currentPage - 1) * pageSize;
        products = filteredItems.slice(startIndex, startIndex + pageSize);

        res.render('pharmacie/index', {
            title: 'Pharmacie & Consommables',
            produits: products,
            filters: { search, categorie, stock_alert, perime, delai_peremption },
            stats,
            currentPage,
            totalPages,
            totalCount,
            pageSize,
            baseUrl: '/pharmacie',
            paginationFilters: { search, categorie, stock_alert, perime, delai_peremption },
            getExpiryDaysDiff,
            getExpiryLabel
        });
    } catch (error) {
        console.error('Erreur pharmacie:', error);
        req.flash('error', 'Erreur lors du chargement de la pharmacie');
        res.redirect('/dashboard');
    }
});

// GET /pharmacie/export/csv — Export liste stock pharmacie avec BOM UTF-8 et gestion des péremptions
router.get('/export/csv', async (req, res) => {
    try {
        const { search, categorie, stock_alert, perime, delai_peremption: delaiParam } = req.query;
        const delai_peremption = delaiParam || (perime === 'oui' ? 'perime' : '');
        const today = new Date().toISOString().split('T')[0];

        let query = supabase
            .from('produits_pharmacie')
            .select('*')
            .eq('actif', true)
            .order('designation', { ascending: true });

        if (search) {
            query = query.or(`designation.ilike.%${search}%,code.ilike.%${search}%`);
        }
        if (categorie) {
            query = query.eq('categorie', categorie);
        }

        const { data: produits, error } = await query;
        if (error) throw error;

        let exportProduits = produits || [];
        if (stock_alert === 'oui') {
            exportProduits = exportProduits.filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0));
        }

        if (delai_peremption === 'perime') {
            exportProduits = exportProduits.filter(p => p.date_peremption && p.date_peremption < today);
        } else if (delai_peremption === '30' || delai_peremption === '60' || delai_peremption === '90') {
            const days = parseInt(delai_peremption, 10);
            const maxDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            exportProduits = exportProduits.filter(p => p.date_peremption && p.date_peremption >= today && p.date_peremption <= maxDate);
        }

        const filename = `stock_pharmacie_GSPM_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const escapeCsv = (value) => {
            const raw = value == null ? '' : String(value);
            return `"${raw.replace(/"/g, '""')}"`;
        };

        // Ajout du BOM UTF-8 (\uFEFF) pour compatibilité totale avec Microsoft Excel Windows
        let csv = '\uFEFF';
        csv += 'Code;Désignation;Catégorie;Forme;Dosage;Unité;Stock actuel;Stock min.;Prix achat (FCFA);Prix vente (FCFA);Valeur stock (FCFA);Emplacement;Fournisseur;Date péremption;Statut stock;Délai péremption\n';

        exportProduits.forEach((p) => {
            const stockActuel = Number(p.stock_actuel || 0);
            const stockMin = Number(p.stock_minimum || 0);
            const statutStock = stockActuel <= 0 ? 'Rupture' : stockActuel <= stockMin ? 'Alerte' : 'OK';
            const valeurStock = stockActuel * parseFloat(p.prix_vente || 0);
            const delaiLabel = getExpiryLabel(p.date_peremption, today);

            csv += [
                p.code || '',
                p.designation || '',
                p.categorie || '',
                p.forme || '',
                p.dosage || '',
                p.unite || '',
                stockActuel,
                stockMin,
                p.prix_achat || 0,
                p.prix_vente || 0,
                valeurStock,
                p.emplacement || '',
                p.fournisseur || '',
                p.date_peremption ? new Date(p.date_peremption).toLocaleDateString('fr-FR') : '',
                statutStock,
                delaiLabel
            ].map(escapeCsv).join(';') + '\n';
        });

        res.send(csv);
    } catch (error) {
        console.error('Erreur export stock pharmacie:', error);
        req.flash('error', 'Erreur lors de l\'export du stock');
        res.redirect('/pharmacie');
    }
});

// GET /pharmacie/export/excel — Export Excel du stock pharmacie avec gestion des péremptions
router.get('/export/excel', async (req, res) => {
    try {
        const { search, categorie, stock_alert, perime, delai_peremption: delaiParam } = req.query;
        const delai_peremption = delaiParam || (perime === 'oui' ? 'perime' : '');
        const today = new Date().toISOString().split('T')[0];

        let query = supabase
            .from('produits_pharmacie')
            .select('*')
            .eq('actif', true)
            .order('designation', { ascending: true });

        if (search) {
            query = query.or(`designation.ilike.%${search}%,code.ilike.%${search}%`);
        }
        if (categorie) {
            query = query.eq('categorie', categorie);
        }

        const { data: produits, error } = await query;
        if (error) throw error;

        let exportProduits = produits || [];
        if (stock_alert === 'oui') {
            exportProduits = exportProduits.filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0));
        }

        if (delai_peremption === 'perime') {
            exportProduits = exportProduits.filter(p => p.date_peremption && p.date_peremption < today);
        } else if (delai_peremption === '30' || delai_peremption === '60' || delai_peremption === '90') {
            const days = parseInt(delai_peremption, 10);
            const maxDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            exportProduits = exportProduits.filter(p => p.date_peremption && p.date_peremption >= today && p.date_peremption <= maxDate);
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        workbook.created = new Date();
        workbook.modified = new Date();

        const totalValeurStock = exportProduits.reduce((sum, p) => sum + (Number(p.stock_actuel || 0) * Number(p.prix_vente || 0)), 0);
        const totalAlertes = exportProduits.filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0)).length;
        const totalRuptures = exportProduits.filter(p => Number(p.stock_actuel || 0) <= 0).length;
        const totalPerimes = exportProduits.filter(p => p.date_peremption && p.date_peremption < today).length;
        const totalExpire30 = exportProduits.filter(p => {
            const diff = getExpiryDaysDiff(p.date_peremption, today);
            return diff !== null && diff >= 0 && diff <= 30;
        }).length;
        const totalExpire90 = exportProduits.filter(p => {
            const diff = getExpiryDaysDiff(p.date_peremption, today);
            return diff !== null && diff >= 0 && diff <= 90;
        }).length;

        const syntheseSheet = workbook.addWorksheet('Synthèse', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        syntheseSheet.mergeCells('A1:K1');
        syntheseSheet.mergeCells('A2:K2');
        syntheseSheet.mergeCells('A3:K3');

        const syntheseTitleRow = syntheseSheet.getRow(1);
        syntheseTitleRow.getCell(1).value = 'RAPPORTS D\'ACTIVITÉ & FINANCIERS';
        syntheseTitleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        syntheseTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        syntheseTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        syntheseTitleRow.height = 28;

        const syntheseSubtitleRow = syntheseSheet.getRow(2);
        syntheseSubtitleRow.getCell(1).value = 'MINISTÈRE DE LA DÉFENSE — GROUPEMENT DE SAPEURS-POMPIERS MILITAIRES';
        syntheseSubtitleRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        syntheseSubtitleRow.getCell(1).alignment = { horizontal: 'center' };
        syntheseSubtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        syntheseSubtitleRow.height = 18;

        const syntheseInstitutionRow = syntheseSheet.getRow(3);
        const generatedAt = new Date();
        syntheseInstitutionRow.getCell(1).value = `CSA 3e COMPAGNIE GSPM BOUAKÉ — Pharmacie | Rapport généré le ${generatedAt.toLocaleDateString('fr-FR')} à ${generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        syntheseInstitutionRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF334155' } };
        syntheseInstitutionRow.getCell(1).alignment = { horizontal: 'center' };
        syntheseInstitutionRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        syntheseInstitutionRow.height = 18;

        const metrics = [
            ['Produits répertoriés', exportProduits.length],
            ['Valeur totale du stock', `${totalValeurStock.toLocaleString('fr-FR')} FCFA`],
            ['Alertes stock bas', totalAlertes],
            ['Ruptures de stock', totalRuptures],
            ['Produits déjà périmés', totalPerimes],
            ['Péremption imminente (≤ 30 jours)', totalExpire30],
            ['Péremption proche (≤ 90 jours)', totalExpire90],
            ['Moyenne prix vente', `${(exportProduits.reduce((sum, p) => sum + Number(p.prix_vente || 0), 0) / Math.max(exportProduits.length, 1)).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`]
        ];

        syntheseSheet.getCell('A5').value = 'Indicateur';
        syntheseSheet.getCell('B5').value = 'Valeur';
        syntheseSheet.getCell('A5').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        syntheseSheet.getCell('B5').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        syntheseSheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        syntheseSheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        syntheseSheet.getCell('A5').border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        syntheseSheet.getCell('B5').border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        syntheseSheet.getColumn(1).width = 34;
        syntheseSheet.getColumn(2).width = 30;

        metrics.forEach((metric, index) => {
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
        });

        const noteCell = syntheseSheet.getCell('A' + (metrics.length + 7));
        noteCell.value = 'Note : ce rapport officiel constitue un état d\'inventaire certifié pour le suivi pharmaceutique du CSA GSPM.';
        noteCell.font = { italic: true, color: { argb: 'FF475569' } };

        const sheet = workbook.addWorksheet('Stock Pharmacie', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6 }];
        sheet.autoFilter = { from: 'A6', to: 'P6' };
        sheet.mergeCells('A1:P1');
        sheet.mergeCells('A2:P2');

        const titleRow = sheet.getRow(1);
        titleRow.getCell(1).value = 'RAPPORTS D\'ACTIVITÉ & FINANCIERS';
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 24;

        const subtitleRow = sheet.getRow(2);
        subtitleRow.getCell(1).value = `CSA 3e COMPAGNIE GSPM BOUAKÉ — INVENTAIRE PHARMACIE & PÉREMPTIONS | Généré le ${generatedAt.toLocaleDateString('fr-FR')} à ${generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        subtitleRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF374151' } };
        subtitleRow.getCell(1).alignment = { horizontal: 'center' };
        subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        subtitleRow.height = 18;

        const summaryLabels = ['Produits', 'Valeur stock', 'Alertes', 'Ruptures', 'Périmés', 'Expire ≤ 30j'];
        const summaryValues = [exportProduits.length, totalValeurStock, totalAlertes, totalRuptures, totalPerimes, totalExpire30];

        summaryLabels.forEach((label, index) => {
            const cellLabel = sheet.getCell(4, index * 2 + 1);
            const cellValue = sheet.getCell(4, index * 2 + 2);
            cellLabel.value = label;
            cellLabel.font = { bold: true, size: 9, color: { argb: 'FF334155' } };
            cellLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
            cellLabel.alignment = { horizontal: 'center' };
            cellLabel.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

            cellValue.value = summaryValues[index];
            cellValue.font = { bold: true, size: 10, color: { argb: index === 1 ? 'FF0F766E' : (index === 4 && totalPerimes > 0 ? 'FFB91C1C' : (index === 5 && totalExpire30 > 0 ? 'FFC2410C' : 'FF1E293B')) } };
            cellValue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            cellValue.alignment = { horizontal: 'center' };
            cellValue.border = { all: { style: 'thin', color: { argb: 'FFCBD5E1' } } };

            if (index === 1) {
                cellValue.numFmt = '# ##0 "FCFA"';
            }
        });

        const headers = [
            { label: 'Code', key: 'code', width: 14 },
            { label: 'Désignation', key: 'designation', width: 32 },
            { label: 'Catégorie', key: 'categorie', width: 16 },
            { label: 'Forme', key: 'forme', width: 14 },
            { label: 'Dosage', key: 'dosage', width: 14 },
            { label: 'Unité', key: 'unite', width: 10 },
            { label: 'Stock actuel', key: 'stock_actuel', width: 12 },
            { label: 'Stock min.', key: 'stock_minimum', width: 12 },
            { label: 'Prix achat (FCFA)', key: 'prix_achat', width: 14 },
            { label: 'Prix vente (FCFA)', key: 'prix_vente', width: 14 },
            { label: 'Valeur stock (FCFA)', key: 'valeur_stock', width: 16 },
            { label: 'Emplacement', key: 'emplacement', width: 16 },
            { label: 'Fournisseur', key: 'fournisseur', width: 18 },
            { label: 'Date péremption', key: 'date_peremption', width: 15 },
            { label: 'Statut stock', key: 'statut', width: 13 },
            { label: 'Délai péremption', key: 'delai_peremption', width: 22 }
        ];

        const headerRow = sheet.getRow(6);
        headers.forEach((h, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = h.label;
            cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFAAAAAA' } },
                bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
                left: { style: 'thin', color: { argb: 'FFAAAAAA' } },
                right: { style: 'thin', color: { argb: 'FFAAAAAA' } }
            };
            sheet.getColumn(index + 1).width = h.width;
        });
        headerRow.height = 22;

        exportProduits.forEach((p, rowIdx) => {
            const row = sheet.getRow(rowIdx + 7);
            const isEven = rowIdx % 2 === 0;
            const stockActuel = Number(p.stock_actuel || 0);
            const stockMinimum = Number(p.stock_minimum || 0);
            const prixVente = Number(p.prix_vente || 0);
            const prixAchat = Number(p.prix_achat || 0);
            const valeurStock = stockActuel * prixVente;
            const statut = stockActuel <= 0 ? 'Rupture' : stockActuel <= stockMinimum ? 'Alerte' : 'OK';
            const diffDays = getExpiryDaysDiff(p.date_peremption, today);
            const delaiLabel = getExpiryLabel(p.date_peremption, today);

            const values = [
                p.code || '',
                p.designation || '',
                p.categorie || '',
                p.forme || '',
                p.dosage || '',
                p.unite || '',
                stockActuel,
                stockMinimum,
                prixAchat,
                prixVente,
                valeurStock,
                p.emplacement || '',
                p.fournisseur || '',
                p.date_peremption ? new Date(p.date_peremption).toLocaleDateString('fr-FR') : '',
                statut,
                delaiLabel
            ];

            values.forEach((value, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = value;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' } };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
                    bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
                    left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
                    right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
                };
                cell.alignment = { vertical: 'middle', wrapText: true };

                if (typeof value === 'number' && (colIdx === 6 || colIdx === 7 || colIdx === 8 || colIdx === 9 || colIdx === 10)) {
                    cell.numFmt = colIdx === 10 ? '# ##0 "FCFA"' : '# ##0';
                    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
                }

                if (colIdx === 14) {
                    if (statut === 'Rupture' || statut === 'Alerte') {
                        cell.font = { bold: true, color: { argb: statut === 'Rupture' ? 'FFDC2626' : 'FFD97706' } };
                    } else {
                        cell.font = { bold: true, color: { argb: 'FF16A34A' } };
                    }
                }

                if (colIdx === 15 && diffDays !== null) {
                    if (diffDays < 0) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
                        cell.font = { bold: true, color: { argb: 'FFDC2626' } };
                    } else if (diffDays <= 30) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEDD5' } };
                        cell.font = { bold: true, color: { argb: 'FFEA580C' } };
                    } else if (diffDays <= 90) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
                        cell.font = { bold: true, color: { argb: 'FFCA8A04' } };
                    }
                }
            });
        });

        const totalRowNumber = exportProduits.length + 7;
        const totalRow = sheet.getRow(totalRowNumber);
        const totalSummary = `Total général : ${exportProduits.length} produit(s) | Valeur totale stock : ${totalValeurStock.toLocaleString('fr-FR')} FCFA`;
        sheet.mergeCells(`A${totalRowNumber}:P${totalRowNumber}`);
        totalRow.getCell(1).value = totalSummary;
        totalRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
        totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F99D' } };
        totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
        totalRow.height = 20;

        sheet.getRow(1).height = 26;
        sheet.getRow(2).height = 18;

        const filename = `stock_pharmacie_${new Date().toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export Excel pharmacie:', error);
        req.flash('error', 'Erreur lors de l\'export Excel du stock');
        res.redirect('/pharmacie');
    }
});

// GET /pharmacie/create — Formulaire nouveau produit
router.get('/create', (req, res) => {
    res.render('pharmacie/create', { title: 'Nouveau Produit' });
});

// POST /pharmacie — Créer un produit
router.post('/', async (req, res) => {
    try {
        const { code, designation, categorie, forme, dosage, unite, prix_achat, prix_vente, stock_actuel, stock_minimum, emplacement, fournisseur, date_peremption } = req.body;

        const stockInit = Math.max(0, parseInt(stock_actuel) || 0);
        const stockMin = Math.max(0, parseInt(stock_minimum) || 0);

        if (!designation || !designation.trim()) {
            req.flash('error', 'La désignation du produit est obligatoire');
            return res.redirect('/pharmacie/create');
        }

        const { data: produit, error } = await supabase
            .from('produits_pharmacie')
            .insert([{
                code: code || null,
                designation,
                categorie: categorie || 'medicament',
                forme: forme || null,
                dosage: dosage || null,
                unite: unite || 'unité',
                prix_achat: parseFloat(prix_achat) || 0,
                prix_vente: parseFloat(prix_vente) || 0,
                stock_actuel: stockInit,
                stock_minimum: stockMin || 5,
                emplacement: emplacement || null,
                fournisseur: fournisseur || null,
                date_peremption: date_peremption || null
            }])
            .select()
            .single();

        if (error) throw error;

        // Enregistrer le mouvement de stock initial si stock > 0
        if (stockInit > 0 && produit) {
            await supabase
                .from('mouvements_stock')
                .insert([{
                    produit_id: produit.id,
                    type_mouvement: 'entree',
                    quantite: stockInit,
                    stock_avant: 0,
                    stock_apres: stockInit,
                    motif: 'Stock initial',
                    reference: 'Création du produit',
                    utilisateur_id: req.session.user ? req.session.user.id : null,
                    utilisateur_nom: req.session.user ? `${req.session.user.nom} ${req.session.user.prenom}` : 'Système'
                }]);
        }

        await logAudit({
            req,
            action: 'PRODUIT_CREATION',
            entite: 'produit_pharmacie',
            entite_id: produit ? produit.id : null,
            description: `Création du produit "${designation}" (${categorie}) — Stock initial: ${stockInit}`,
            details: { code, designation, categorie, prix_vente, stock_actuel: stockInit }
        });

        req.flash('success', `Produit "${designation}" créé avec succès`);
        res.redirect('/pharmacie');
    } catch (error) {
        console.error('Erreur création produit:', error);
        req.flash('error', 'Erreur lors de la création du produit');
        res.redirect('/pharmacie/create');
    }
});

// GET /pharmacie/:id — Détail d'un produit avec historique des mouvements
router.get('/:id', async (req, res) => {
    try {
        const { data: produit, error: errProduit } = await supabase
            .from('produits_pharmacie')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (errProduit || !produit) {
            req.flash('error', 'Produit introuvable');
            return res.redirect('/pharmacie');
        }

        const { data: mouvements } = await supabase
            .from('mouvements_stock')
            .select('*')
            .eq('produit_id', req.params.id)
            .order('created_at', { ascending: false })
            .limit(50);

        res.render('pharmacie/show', {
            title: produit.designation,
            produit,
            mouvements: mouvements || []
        });
    } catch (error) {
        console.error('Erreur détail produit:', error);
        req.flash('error', 'Erreur lors du chargement du produit');
        res.redirect('/pharmacie');
    }
});

// GET /pharmacie/:id/edit — Formulaire de modification
router.get('/:id/edit', async (req, res) => {
    try {
        const { data: produit, error } = await supabase
            .from('produits_pharmacie')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !produit) {
            req.flash('error', 'Produit introuvable');
            return res.redirect('/pharmacie');
        }

        res.render('pharmacie/edit', { title: 'Modifier le Produit', produit });
    } catch (error) {
        console.error('Erreur édition produit:', error);
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/pharmacie');
    }
});

// PUT /pharmacie/:id — Modifier un produit
router.put('/:id', async (req, res) => {
    try {
        const { code, designation, categorie, forme, dosage, unite, prix_achat, prix_vente, stock_minimum, emplacement, fournisseur, date_peremption } = req.body;

        if (!designation || !designation.trim()) {
            req.flash('error', 'La désignation du produit est obligatoire');
            return res.redirect(`/pharmacie/${req.params.id}/edit`);
        }

        const { error } = await supabase
            .from('produits_pharmacie')
            .update({
                code: code || null,
                designation,
                categorie: categorie || 'medicament',
                forme: forme || null,
                dosage: dosage || null,
                unite: unite || 'unité',
                prix_achat: parseFloat(prix_achat) || 0,
                prix_vente: parseFloat(prix_vente) || 0,
                stock_minimum: Math.max(0, parseInt(stock_minimum) || 0) || 5,
                emplacement: emplacement || null,
                fournisseur: fournisseur || null,
                date_peremption: date_peremption || null,
                updated_at: new Date()
            })
            .eq('id', req.params.id);

        if (error) throw error;

        await logAudit({
            req,
            action: 'PRODUIT_MODIFICATION',
            entite: 'produit_pharmacie',
            entite_id: req.params.id,
            description: `Modification du produit "${designation}"`,
            details: { code, designation, categorie, prix_vente }
        });

        req.flash('success', 'Produit mis à jour avec succès');
        res.redirect('/pharmacie');
    } catch (error) {
        console.error('Erreur mise à jour produit:', error);
        req.flash('error', 'Erreur lors de la mise à jour');
        res.redirect(`/pharmacie/${req.params.id}/edit`);
    }
});

// POST /pharmacie/:id/mouvement — Enregistrer un mouvement de stock
router.post('/:id/mouvement', async (req, res) => {
    try {
        const { type_mouvement, quantite, motif, reference } = req.body;
        const qte = parseInt(quantite);

        if (!qte || qte <= 0) {
            req.flash('error', 'La quantité doit être supérieure à 0');
            return res.redirect(`/pharmacie/${req.params.id}`);
        }

        // Récupérer le produit actuel
        const { data: produit, error: errGet } = await supabase
            .from('produits_pharmacie')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (errGet || !produit) {
            req.flash('error', 'Produit introuvable');
            return res.redirect('/pharmacie');
        }

        const stockAvant = produit.stock_actuel;
        let stockApres;

        if (type_mouvement === 'entree') {
            stockApres = stockAvant + qte;
        } else if (type_mouvement === 'sortie') {
            if (qte > stockAvant) {
                req.flash('error', `Stock insuffisant. Stock disponible : ${stockAvant} ${produit.unite}`);
                return res.redirect(`/pharmacie/${req.params.id}`);
            }
            stockApres = stockAvant - qte;
        } else {
            req.flash('error', 'Type de mouvement invalide');
            return res.redirect(`/pharmacie/${req.params.id}`);
        }

        // Insérer le mouvement
        const { error: errMvt } = await supabase
            .from('mouvements_stock')
            .insert([{
                produit_id: req.params.id,
                type_mouvement,
                quantite: qte,
                stock_avant: stockAvant,
                stock_apres: stockApres,
                motif: motif || null,
                reference: reference || null,
                utilisateur_id: req.session.user ? req.session.user.id : null,
                utilisateur_nom: req.session.user ? `${req.session.user.nom} ${req.session.user.prenom}` : 'Système'
            }]);

        if (errMvt) throw errMvt;

        // Mettre à jour le stock du produit
        const { error: errUpdate } = await supabase
            .from('produits_pharmacie')
            .update({ stock_actuel: stockApres, updated_at: new Date() })
            .eq('id', req.params.id);

        if (errUpdate) throw errUpdate;

        await logAudit({
            req,
            action: 'STOCK_MOUVEMENT',
            entite: 'produit_pharmacie',
            entite_id: req.params.id,
            description: `${type_mouvement === 'entree' ? 'Entrée' : 'Sortie'} de ${qte} ${produit.unite} — ${produit.designation} (${stockAvant} → ${stockApres})`,
            details: { type_mouvement, quantite: qte, motif, reference, stock_avant: stockAvant, stock_apres: stockApres }
        });

        req.flash('success', `Mouvement enregistré : ${type_mouvement === 'entree' ? '+' : '-'}${qte} ${produit.unite} (Stock: ${stockApres})`);
        res.redirect(`/pharmacie/${req.params.id}`);
    } catch (error) {
        console.error('Erreur mouvement stock:', error);
        req.flash('error', 'Erreur lors de l\'enregistrement du mouvement');
        res.redirect(`/pharmacie/${req.params.id}`);
    }
});

// DELETE /pharmacie/:id — Désactiver un produit (suppression logique)
router.delete('/:id', async (req, res) => {
    try {
        const { data: produit } = await supabase
            .from('produits_pharmacie')
            .select('designation')
            .eq('id', req.params.id)
            .single();

        const { error } = await supabase
            .from('produits_pharmacie')
            .update({ actif: false, updated_at: new Date() })
            .eq('id', req.params.id);

        if (error) throw error;

        await logAudit({
            req,
            action: 'PRODUIT_SUPPRESSION',
            entite: 'produit_pharmacie',
            entite_id: req.params.id,
            description: `Suppression du produit "${produit ? produit.designation : req.params.id}"`,
            details: {}
        });

        req.flash('success', 'Produit supprimé avec succès');
        res.redirect('/pharmacie');
    } catch (error) {
        console.error('Erreur suppression produit:', error);
        req.flash('error', 'Erreur lors de la suppression');
        res.redirect('/pharmacie');
    }
});

module.exports = router;
