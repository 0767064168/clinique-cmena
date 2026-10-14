const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { supabase } = require('../config/supabase');
const { logAudit } = require('../utils/audit');

// GET /pharmacie — Liste des produits avec filtres et statistiques
router.get('/', async (req, res) => {
    try {
        const { search, categorie, stock_alert, perime } = req.query;
        const today = new Date().toISOString().split('T')[0];

        let query = supabase
            .from('produits_pharmacie')
            .select('*')
            .eq('actif', true)
            .order('designation', { ascending: true })
            .limit(200);

        if (search) {
            query = query.or(`designation.ilike.%${search}%,code.ilike.%${search}%`);
        }
        if (categorie) {
            query = query.eq('categorie', categorie);
        }

        const { data: produits, error } = await query;
        if (error) throw error;

        const allProduits = produits || [];

        // Filtrage côté serveur pour les alertes et produits périmés
        let filteredProduits = allProduits;
        if (stock_alert === 'oui') {
            filteredProduits = filteredProduits.filter(p => p.stock_actuel <= p.stock_minimum);
        }
        if (perime === 'oui') {
            filteredProduits = filteredProduits.filter(p => p.date_peremption && p.date_peremption < today);
        }

        const stats = {
            totalProduits: allProduits.length,
            totalValeurStock: allProduits.reduce((sum, p) => sum + (p.stock_actuel * parseFloat(p.prix_vente || 0)), 0),
            produitsEnAlerte: allProduits.filter(p => p.stock_actuel <= p.stock_minimum).length,
            produitsEnRupture: allProduits.filter(p => p.stock_actuel <= 0).length,
            produitsPerimes: allProduits.filter(p => p.date_peremption && p.date_peremption < today).length
        };

        res.render('pharmacie/index', {
            title: 'Pharmacie & Consommables',
            produits: filteredProduits,
            filters: { search, categorie, stock_alert, perime },
            stats
        });
    } catch (error) {
        console.error('Erreur pharmacie:', error);
        req.flash('error', 'Erreur lors du chargement de la pharmacie');
        res.redirect('/dashboard');
    }
});

// GET /pharmacie/export/csv — Export liste stock pharmacie
router.get('/export/csv', async (req, res) => {
    try {
        const { search, categorie, stock_alert, perime } = req.query;
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
            exportProduits = exportProduits.filter(p => p.stock_actuel <= p.stock_minimum);
        }
        if (perime === 'oui') {
            exportProduits = exportProduits.filter(p => p.date_peremption && p.date_peremption < today);
        }

        const filename = `stock_pharmacie_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const escapeCsv = (value) => {
            const raw = value == null ? '' : String(value);
            return `"${raw.replace(/"/g, '""')}"`;
        };

        let csv = 'Code;Désignation;Catégorie;Forme;Dosage;Unité;Stock actuel;Stock min.;Prix achat;Prix vente;Valeur stock;Emplacement;Fournisseur;Date péremption;Statut\n';

        exportProduits.forEach((p) => {
            const statut = p.stock_actuel <= 0 ? 'Rupture' : p.stock_actuel <= p.stock_minimum ? 'Alerte' : (p.date_peremption && p.date_peremption < today ? 'Périmé' : 'OK');
            const valeurStock = (p.stock_actuel || 0) * parseFloat(p.prix_vente || 0);
            csv += [
                p.code || '',
                p.designation || '',
                p.categorie || '',
                p.forme || '',
                p.dosage || '',
                p.unite || '',
                p.stock_actuel || 0,
                p.stock_minimum || 0,
                p.prix_achat || 0,
                p.prix_vente || 0,
                valeurStock,
                p.emplacement || '',
                p.fournisseur || '',
                p.date_peremption || '',
                statut
            ].map(escapeCsv).join(';') + '\n';
        });

        res.send(csv);
    } catch (error) {
        console.error('Erreur export stock pharmacie:', error);
        req.flash('error', 'Erreur lors de l\'export du stock');
        res.redirect('/pharmacie');
    }
});

// GET /pharmacie/export/excel — Export Excel du stock pharmacie
router.get('/export/excel', async (req, res) => {
    try {
        const { search, categorie, stock_alert, perime } = req.query;
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
        if (perime === 'oui') {
            exportProduits = exportProduits.filter(p => p.date_peremption && p.date_peremption < today);
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        workbook.created = new Date();
        workbook.modified = new Date();

        const sheet = workbook.addWorksheet('Stock Pharmacie', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        sheet.mergeCells('A1:N1');
        const titleRow = sheet.getRow(1);
        titleRow.getCell(1).value = 'CSA 3e COMPAGNIE GSPM BOUAKÉ — STOCK PHARMACIE';
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 24;

        sheet.mergeCells('A2:N2');
        const subtitleRow = sheet.getRow(2);
        subtitleRow.getCell(1).value = `Exporté le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        subtitleRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF555555' } };
        subtitleRow.getCell(1).alignment = { horizontal: 'center' };
        subtitleRow.height = 16;

        const headers = [
            { label: 'Code', key: 'code', width: 16 },
            { label: 'Désignation', key: 'designation', width: 26 },
            { label: 'Catégorie', key: 'categorie', width: 16 },
            { label: 'Forme', key: 'forme', width: 14 },
            { label: 'Dosage', key: 'dosage', width: 14 },
            { label: 'Unité', key: 'unite', width: 12 },
            { label: 'Stock actuel', key: 'stock_actuel', width: 12 },
            { label: 'Stock min.', key: 'stock_minimum', width: 12 },
            { label: 'Prix achat', key: 'prix_achat', width: 12 },
            { label: 'Prix vente', key: 'prix_vente', width: 12 },
            { label: 'Valeur stock', key: 'valeur_stock', width: 14 },
            { label: 'Emplacement', key: 'emplacement', width: 18 },
            { label: 'Fournisseur', key: 'fournisseur', width: 18 },
            { label: 'Date péremption', key: 'date_peremption', width: 16 }
        ];

        const headerRow = sheet.getRow(4);
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
            const row = sheet.getRow(rowIdx + 5);
            const isEven = rowIdx % 2 === 0;

            const values = [
                p.code || '',
                p.designation || '',
                p.categorie || '',
                p.forme || '',
                p.dosage || '',
                p.unite || '',
                Number(p.stock_actuel || 0),
                Number(p.stock_minimum || 0),
                Number(p.prix_achat || 0),
                Number(p.prix_vente || 0),
                Number((Number(p.stock_actuel || 0) * Number(p.prix_vente || 0))),
                p.emplacement || '',
                p.fournisseur || '',
                p.date_peremption ? new Date(p.date_peremption).toLocaleDateString('fr-FR') : ''
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
            });
        });

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
