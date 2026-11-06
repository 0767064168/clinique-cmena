const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { 
    getAllInventaires, 
    getInventaireById, 
    createInventaire, 
    updateComptages, 
    validerInventaire 
} = require('../utils/inventaireStorage');
const { logAudit } = require('../utils/audit');

// GET /pharmacie/inventaires — Liste des sessions d'inventaire
router.get('/', async (req, res) => {
    try {
        const inventaires = await getAllInventaires();

        const stats = {
            total: inventaires.length,
            enCours: inventaires.filter(i => i.statut === 'en_cours').length,
            valides: inventaires.filter(i => i.statut === 'valide').length,
            totalEcartsFinanciers: inventaires
                .filter(i => i.statut === 'valide')
                .reduce((acc, i) => acc + (parseFloat(i.valeur_ecart) || 0), 0)
        };

        res.render('pharmacie/inventaires/index', {
            title: 'Inventaires Physiques & Gestion des Écarts',
            inventaires: inventaires || [],
            stats
        });
    } catch (error) {
        console.error('Erreur chargement inventaires:', error);
        req.flash('error', 'Erreur lors du chargement des inventaires: ' + error.message);
        res.redirect('/pharmacie');
    }
});

// GET /pharmacie/inventaires/nouveau — Lancement d'un inventaire
router.get('/nouveau', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        res.render('pharmacie/inventaires/nouveau', {
            title: 'Lancer un Nouvel Inventaire de Pharmacie',
            todayStr
        });
    } catch (error) {
        console.error('Erreur ouverture nouveau inventaire:', error);
        req.flash('error', error.message);
        res.redirect('/pharmacie/inventaires');
    }
});

// POST /pharmacie/inventaires — Traitement de création
router.post('/', async (req, res) => {
    try {
        const { titre, categorie_cible, notes } = req.body;
        const user = req.session && req.session.user ? req.session.user : null;
        const responsable_nom = user ? `${user.prenom} ${user.nom}` : 'Pharmacien';
        const responsable_id = user ? user.id : null;

        const inv = await createInventaire({
            titre: (titre || '').trim(),
            categorie_cible: categorie_cible || 'toutes',
            responsable_id,
            responsable_nom,
            notes
        });

        await logAudit({
            req,
            action: 'INVENTAIRE_CREATION',
            entite: 'inventaires_pharmacie',
            entite_id: inv.id,
            description: `Session d'inventaire ${inv.numero_inventaire} initiée (${inv.total_articles} articles ciblés)`,
            details: { numero: inv.numero_inventaire, categorie_cible, total_articles: inv.total_articles }
        });

        req.flash('success', `Session d'inventaire ${inv.numero_inventaire} créée avec succès. Vous pouvez imprimer la feuille de comptage ou saisir les stocks.`);
        res.redirect(`/pharmacie/inventaires/${inv.id}`);
    } catch (error) {
        console.error('Erreur création inventaire:', error);
        req.flash('error', 'Erreur lors de la création de l\'inventaire: ' + error.message);
        res.redirect('/pharmacie/inventaires/nouveau');
    }
});

// GET /pharmacie/inventaires/:id — Bilan et détail de l'inventaire
router.get('/:id', async (req, res) => {
    try {
        const inv = await getInventaireById(req.params.id);
        if (!inv) {
            req.flash('error', 'Inventaire introuvable.');
            return res.redirect('/pharmacie/inventaires');
        }

        // Statistiques des lignes
        const lignes = inv.lignes || [];
        const nbComptes = lignes.filter(l => l.stock_physique !== null && l.stock_physique !== undefined).length;
        const nbConformes = lignes.filter(l => l.ecart === 0).length;
        const nbSurplus = lignes.filter(l => l.ecart > 0).length;
        const nbManquants = lignes.filter(l => l.ecart < 0).length;

        const totalPerteValeur = lignes
            .filter(l => l.ecart < 0)
            .reduce((acc, l) => acc + Math.abs(Number(l.valeur_ecart || 0)), 0);

        const totalSurplusValeur = lignes
            .filter(l => l.ecart > 0)
            .reduce((acc, l) => acc + Number(l.valeur_ecart || 0), 0);

        res.render('pharmacie/inventaires/bilan', {
            title: `Inventaire ${inv.numero_inventaire} — Bilan`,
            inv,
            stats: {
                totalArticles: lignes.length,
                nbComptes,
                nbConformes,
                nbSurplus,
                nbManquants,
                totalPerteValeur,
                totalSurplusValeur
            }
        });
    } catch (error) {
        console.error('Erreur bilan inventaire:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect('/pharmacie/inventaires');
    }
});

// GET /pharmacie/inventaires/:id/saisie — Écran de saisie des comptages physiques
router.get('/:id/saisie', async (req, res) => {
    try {
        const inv = await getInventaireById(req.params.id);
        if (!inv) {
            req.flash('error', 'Inventaire introuvable.');
            return res.redirect('/pharmacie/inventaires');
        }

        if (inv.statut === 'valide') {
            req.flash('error', 'Cet inventaire est déjà validé et ne peut plus être modifié.');
            return res.redirect(`/pharmacie/inventaires/${inv.id}`);
        }

        res.render('pharmacie/inventaires/saisie', {
            title: `Saisie de Comptage — ${inv.numero_inventaire}`,
            inv
        });
    } catch (error) {
        console.error('Erreur écran saisie inventaire:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect('/pharmacie/inventaires');
    }
});

// POST /pharmacie/inventaires/:id/saisie — Sauvegarder les comptages physiques
router.post('/:id/saisie', async (req, res) => {
    try {
        const { comptages } = req.body;
        // comptages can be array or JSON string
        let parsedComptages = [];
        if (typeof comptages === 'string') {
            parsedComptages = JSON.parse(comptages || '[]');
        } else if (Array.isArray(comptages)) {
            parsedComptages = comptages;
        } else if (req.body.lignes) {
            // Format formulaire standard: lignes[id][stock_physique]
            parsedComptages = Object.keys(req.body.lignes).map(k => ({
                ligne_id: k,
                stock_physique: req.body.lignes[k].stock_physique,
                date_peremption_reelle: req.body.lignes[k].date_peremption_reelle,
                notes: req.body.lignes[k].notes
            }));
        }

        await updateComptages(req.params.id, parsedComptages);

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json({ success: true, message: 'Comptages enregistrés avec succès' });
        }

        req.flash('success', 'Comptages physiques enregistrés avec succès.');
        res.redirect(`/pharmacie/inventaires/${req.params.id}`);
    } catch (error) {
        console.error('Erreur enregistrement comptages:', error);
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(500).json({ error: error.message });
        }
        req.flash('error', 'Erreur lors de l\'enregistrement des comptages: ' + error.message);
        res.redirect(`/pharmacie/inventaires/${req.params.id}/saisie`);
    }
});

// POST /pharmacie/inventaires/:id/valider — Régularisation automatique des stocks
router.post('/:id/valider', async (req, res) => {
    try {
        const user = req.session && req.session.user ? req.session.user : null;
        const resVal = await validerInventaire(req.params.id, user);

        await logAudit({
            req,
            action: 'INVENTAIRE_VALIDATION',
            entite: 'inventaires_pharmacie',
            entite_id: req.params.id,
            description: `Validation finale de l'inventaire ${resVal.numero_inventaire} : ${resVal.nbRegularises || 0} article(s) régularisé(s)`,
            details: {
                numero: resVal.numero_inventaire,
                articles_avec_ecart: resVal.articles_avec_ecart,
                valeur_ecart: resVal.valeur_ecart
            }
        });

        req.flash('success', `L'inventaire ${resVal.numero_inventaire} a été validé ! ${resVal.nbRegularises || 0} mouvement(s) de régularisation automatique ont été inscrits au journal de stock.`);
        res.redirect(`/pharmacie/inventaires/${req.params.id}`);
    } catch (error) {
        console.error('Erreur validation inventaire:', error);
        req.flash('error', 'Erreur lors de la validation: ' + error.message);
        res.redirect(`/pharmacie/inventaires/${req.params.id}`);
    }
});

// GET /pharmacie/inventaires/:id/feuille-comptage — Fiche vierge A4 imprimable pour passage en rayon
router.get('/:id/feuille-comptage', async (req, res) => {
    try {
        const inv = await getInventaireById(req.params.id);
        if (!inv) {
            req.flash('error', 'Inventaire introuvable');
            return res.redirect('/pharmacie/inventaires');
        }

        res.render('pharmacie/inventaires/feuille_comptage', {
            layout: false,
            title: `Feuille de Comptage - ${inv.numero_inventaire}`,
            inv
        });
    } catch (error) {
        console.error('Erreur feuille comptage:', error);
        req.flash('error', error.message);
        res.redirect('/pharmacie/inventaires');
    }
});

// GET /pharmacie/inventaires/:id/export/excel — Export officiel du bilan
router.get('/:id/export/excel', async (req, res) => {
    try {
        const inv = await getInventaireById(req.params.id);
        if (!inv) {
            return res.status(404).send('Inventaire non trouvé');
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e Compagnie GSPM Bouaké';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Bilan Inventaire', {
            views: [{ showGridLines: true }]
        });

        // En-tête
        sheet.mergeCells('A1:I1');
        sheet.getCell('A1').value = 'CSA 3e COMPAGNIE GSPM BOUAKÉ - RAPPORT OFFICIEL D\'INVENTAIRE PHARMACIE';
        sheet.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(1).height = 30;

        sheet.mergeCells('A2:I2');
        sheet.getCell('A2').value = `N° ${inv.numero_inventaire} - Date : ${inv.date_inventaire} - Responsable : ${inv.responsable_nom} - Statut : ${inv.statut.toUpperCase()}`;
        sheet.getCell('A2').font = { size: 10, italic: true, bold: true };
        sheet.getCell('A2').alignment = { horizontal: 'center' };
        sheet.getRow(2).height = 20;

        sheet.addRow([]);

        // Entêtes colonnes
        const headerRow = sheet.addRow([
            'Code',
            'Désignation Médicament / Consommable',
            'Catégorie',
            'Emplacement',
            'Prix Vente (FCFA)',
            'Stock Théorique',
            'Stock Réel Compté',
            'Écart Quantité',
            'Impact Financier (FCFA)'
        ]);
        headerRow.height = 25;
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Lignes
        (inv.lignes || []).forEach(l => {
            const ecart = (l.stock_physique !== null) ? Number(l.ecart) : 0;
            const row = sheet.addRow([
                l.code || '-',
                l.designation,
                l.categorie || '-',
                l.emplacement || '-',
                Number(l.prix_vente || 0),
                Number(l.stock_theorique || 0),
                l.stock_physique !== null ? Number(l.stock_physique) : 'Non compté',
                l.stock_physique !== null ? ecart : '-',
                l.stock_physique !== null ? Number(l.valeur_ecart || 0) : '-'
            ]);

            row.getCell(5).numFmt = '#,##0';
            if (l.stock_physique !== null) {
                row.getCell(6).alignment = { horizontal: 'center' };
                row.getCell(7).alignment = { horizontal: 'center' };
                row.getCell(8).alignment = { horizontal: 'center' };
                row.getCell(9).numFmt = '#,##0';

                if (ecart < 0) {
                    row.getCell(8).font = { color: { argb: 'FFDC2626' }, bold: true };
                    row.getCell(9).font = { color: { argb: 'FFDC2626' }, bold: true };
                } else if (ecart > 0) {
                    row.getCell(8).font = { color: { argb: 'FF0D9488' }, bold: true };
                    row.getCell(9).font = { color: { argb: 'FF0D9488' }, bold: true };
                }
            }
        });

        // Largeurs colonnes
        sheet.columns = [
            { width: 14 },
            { width: 38 },
            { width: 18 },
            { width: 16 },
            { width: 18 },
            { width: 16 },
            { width: 18 },
            { width: 16 },
            { width: 22 }
        ];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=inventaire_${inv.numero_inventaire}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export Excel inventaire:', error);
        res.status(500).send('Erreur génération fichier Excel: ' + error.message);
    }
});

module.exports = router;
