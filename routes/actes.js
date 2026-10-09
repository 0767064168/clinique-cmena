const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const { data: actes, error } = await supabase
            .from('actes_medicaux')
            .select('*')
            .eq('actif', true)
            .order('categorie')
            .order('libelle');

        if (error) throw error;

        res.render('actes/index', {
            title: 'Catalogue des Actes Médicaux',
            actes: actes || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des actes');
        res.redirect('/dashboard');
    }
});

router.get('/create', (req, res) => {
    res.render('actes/create', { title: 'Nouvel Acte Médical' });
});

router.post('/', async (req, res) => {
    try {
        const { code, libelle, categorie, prix_unitaire } = req.body;
        const cat = categorie ? categorie.toLowerCase() : 'consultation';
        
        const { error } = await supabase
            .from('actes_medicaux')
            .insert([{ code, libelle, categorie: cat, prix_unitaire: parseFloat(prix_unitaire || 0) }]);

        if (error) throw error;

        req.flash('success', 'Acte créé avec succès');
        res.redirect('/actes');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création de l\'acte');
        res.redirect('/actes');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: acte, error } = await supabase
            .from('actes_medicaux')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.render('actes/edit', { title: 'Modifier Acte', acte });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Acte introuvable');
        res.redirect('/actes');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { code, libelle, categorie, prix_unitaire } = req.body;
        const cat = categorie ? categorie.toLowerCase() : 'consultation';
        
        const { error } = await supabase
            .from('actes_medicaux')
            .update({ code, libelle, categorie: cat, prix_unitaire: parseFloat(prix_unitaire || 0) })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Acte mis à jour avec succès');
        res.redirect('/actes');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour');
        res.redirect(`/actes/${req.params.id}/edit`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('actes_medicaux')
            .update({ actif: false })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Acte supprimé avec succès');
        res.redirect('/actes');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la suppression de l\'acte');
        res.redirect('/actes');
    }
});

module.exports = router;
