const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /assurances — liste
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

// POST /assurances — création
router.post('/', async (req, res) => {
    try {
        const { nom, type, telephone, email, adresse, taux_couverture } = req.body;

        const { error } = await supabase
            .from('assurances')
            .insert([{
                nom,
                type: type || null,
                telephone: telephone || null,
                email: email || null,
                adresse: adresse || null,
                taux_couverture: taux_couverture ? parseFloat(taux_couverture) : 80
            }]);

        if (error) throw error;

        req.flash('success', 'Assurance créée avec succès');
        res.redirect('/assurances');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création');
        res.redirect('/assurances');
    }
});

// PUT /assurances/:id — mise à jour
router.put('/:id', async (req, res) => {
    try {
        const { nom, type, telephone, email, adresse, taux_couverture } = req.body;

        const { error } = await supabase
            .from('assurances')
            .update({
                nom,
                type: type || null,
                telephone: telephone || null,
                email: email || null,
                adresse: adresse || null,
                taux_couverture: taux_couverture ? parseFloat(taux_couverture) : 80
            })
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

// DELETE /assurances/:id — désactivation (soft delete)
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
