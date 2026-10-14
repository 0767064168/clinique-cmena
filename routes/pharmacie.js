const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { logAudit } = require('../utils/audit');

// GET /pharmacie — Liste des produits avec filtres et statistiques
router.get('/', async (req, res) => {
    try {
        const { search, categorie, stock_alert } = req.query;
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

        // Filtrer côté serveur pour les alertes stock (Supabase ne supporte pas col1 <= col2 directement)
        let filteredProduits = allProduits;
        if (stock_alert === 'oui') {
            filteredProduits = allProduits.filter(p => p.stock_actuel <= p.stock_minimum);
        }

        // Calcul des statistiques
        const stats = {
            totalProduits: allProduits.length,
            totalValeurStock: allProduits.reduce((sum, p) => sum + (p.stock_actuel * parseFloat(p.prix_vente || 0)), 0),
            produitsEnAlerte: allProduits.filter(p => p.stock_actuel <= p.stock_minimum).length,
            produitsPerimes: allProduits.filter(p => p.date_peremption && p.date_peremption < today).length
        };

        res.render('pharmacie/index', {
            title: 'Pharmacie & Consommables',
            produits: filteredProduits,
            filters: { search, categorie, stock_alert },
            stats
        });
    } catch (error) {
        console.error('Erreur pharmacie:', error);
        req.flash('error', 'Erreur lors du chargement de la pharmacie');
        res.redirect('/dashboard');
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

        const stockInit = parseInt(stock_actuel) || 0;

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
                stock_minimum: parseInt(stock_minimum) || 5,
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
                stock_minimum: parseInt(stock_minimum) || 5,
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
