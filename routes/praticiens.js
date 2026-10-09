const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = supabase.from('praticiens').select('*').eq('actif', true);

        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,specialite.ilike.%${search}%`);
        }

        const { data: praticiens, error } = await query.order('nom');
        if (error) throw error;

        res.render('praticiens/index', {
            title: 'Liste des Praticiens',
            praticiens: praticiens || [],
            search
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des praticiens');
        res.redirect('/dashboard');
    }
});

router.get('/create', (req, res) => {
    res.render('praticiens/create', { title: 'Nouveau Praticien' });
});

router.get('/nouveau', (req, res) => res.redirect('/praticiens/create'));

router.post('/', async (req, res) => {
    try {
        const { nom, prenom, specialite, telephone, email } = req.body;
        
        const { error } = await supabase
            .from('praticiens')
            .insert([{ nom, prenom, specialite, telephone, email }]);

        if (error) throw error;

        req.flash('success', 'Praticien créé avec succès');
        res.redirect('/praticiens');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création du praticien');
        res.redirect('/praticiens/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { data: praticien, error } = await supabase
            .from('praticiens')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        const { data: consultations } = await supabase
            .from('consultations')
            .select('*, patients(nom, prenom, matricule)')
            .eq('praticien_id', req.params.id)
            .order('date_consultation', { ascending: false })
            .limit(50);

        res.render('praticiens/show', {
            title: 'Détails du Praticien',
            praticien,
            consultations: consultations || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Praticien introuvable');
        res.redirect('/praticiens');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: praticien, error } = await supabase
            .from('praticiens')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.render('praticiens/edit', { title: 'Modifier Praticien', praticien });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Praticien introuvable');
        res.redirect('/praticiens');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { nom, prenom, specialite, telephone, email } = req.body;
        
        const { error } = await supabase
            .from('praticiens')
            .update({ nom, prenom, specialite, telephone, email })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Praticien mis à jour avec succès');
        res.redirect(`/praticiens/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour du praticien');
        res.redirect(`/praticiens/${req.params.id}/edit`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('praticiens')
            .update({ actif: false })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Praticien supprimé avec succès');
        res.redirect('/praticiens');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la suppression du praticien');
        res.redirect('/praticiens');
    }
});

module.exports = router;
