const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const { data: assurances, error } = await supabase
            .from('assurances')
            .select('*')
            .eq('actif', true)
            .order('nom');

        if (error) throw error;

        res.render('assurances/index', {
            title: 'Assurances Partenaires',
            assurances: assurances || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des assurances');
        res.redirect('/dashboard');
    }
});

router.post('/', async (req, res) => {
    try {
        const { nom, contact, email, adresse, taux_couverture_defaut } = req.body;
        
        const { error } = await supabase
            .from('assurances')
            .insert([{ nom, contact, email, adresse, taux_couverture_defaut: taux_couverture_defaut || 80 }]);

        if (error) throw error;

        req.flash('success', 'Assurance créée avec succès');
        res.redirect('/assurances');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création');
        res.redirect('/assurances');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { nom, contact, email, adresse, taux_couverture_defaut } = req.body;
        
        const { error } = await supabase
            .from('assurances')
            .update({ nom, contact, email, adresse, taux_couverture_defaut })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Assurance mise à jour avec succès');
        res.redirect('/assurances');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour');
        res.redirect('/assurances');
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('assurances')
            .update({ actif: false })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Assurance supprimée avec succès');
        res.redirect('/assurances');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la suppression');
        res.redirect('/assurances');
    }
});

module.exports = router;
