const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const { date, praticien_id, statut, search } = req.query;
        let query = supabase.from('consultations').select('*, patients!inner(nom, prenom, matricule), praticiens(nom, prenom)');

        if (date) query = query.eq('date_consultation', date);
        if (praticien_id) query = query.eq('praticien_id', praticien_id);
        if (statut) query = query.eq('statut', statut);
        if (search) query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%`, { foreignTable: 'patients' });

        const { data: consultations, error } = await query.order('date_consultation', { ascending: false }).order('heure_debut', { ascending: false });
        if (error) throw error;

        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom').eq('actif', true);

        res.render('consultations/index', {
            title: 'Consultations',
            consultations: consultations || [],
            praticiens: praticiens || [],
            filters: { date, praticien_id, statut, search }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des consultations');
        res.redirect('/dashboard');
    }
});

router.get('/create', async (req, res) => {
    try {
        const { data: patients } = await supabase.from('patients').select('id, nom, prenom, matricule').eq('actif', true).order('nom');
        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom, specialite').eq('actif', true).order('nom');
        
        res.render('consultations/create', { 
            title: 'Nouvelle Consultation',
            patients: patients || [],
            praticiens: praticiens || [],
            selectedPatientId: req.query.patient_id || null
        });
    } catch (error) {
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/consultations');
    }
});

router.get(['/nouveau', '/nouvelle'], (req, res) => res.redirect('/consultations/create'));

router.post('/', async (req, res) => {
    try {
        const { patient_id, praticien_id, date_consultation, heure_debut, heure_fin, motif, observations } = req.body;
        
        let nombre_jours = 1;
        if (date_consultation) {
            const dateObj = new Date(date_consultation);
            const today = new Date();
            const diffTime = Math.abs(today - dateObj);
            nombre_jours = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        const { data: consultation, error } = await supabase
            .from('consultations')
            .insert([{ 
                patient_id, praticien_id, date_consultation, heure_debut, heure_fin, motif, observations, nombre_jours, statut: 'planifiee'
            }])
            .select()
            .single();

        if (error) throw error;

        req.flash('success', 'Consultation planifiée avec succès');
        res.redirect(`/consultations/${consultation.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la planification');
        res.redirect('/consultations/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { data: consultation, error } = await supabase
            .from('consultations')
            .select('*, patients(*), praticiens(*)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.render('consultations/show', {
            title: 'Détails de la Consultation',
            consultation
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Consultation introuvable');
        res.redirect('/consultations');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: consultation, error } = await supabase
            .from('consultations')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        const { data: patients } = await supabase.from('patients').select('id, nom, prenom').eq('actif', true).order('nom');
        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom').eq('actif', true).order('nom');

        res.render('consultations/edit', { 
            title: 'Modifier Consultation', 
            consultation,
            patients: patients || [],
            praticiens: praticiens || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Consultation introuvable');
        res.redirect('/consultations');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { date_consultation, heure_debut, heure_fin, motif, observations, statut } = req.body;
        
        const { error } = await supabase
            .from('consultations')
            .update({ date_consultation, heure_debut, heure_fin, motif, observations, statut })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Consultation mise à jour avec succès');
        res.redirect(`/consultations/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour de la consultation');
        res.redirect(`/consultations/${req.params.id}/edit`);
    }
});

router.put('/:id/terminer', async (req, res) => {
    try {
        const { error } = await supabase
            .from('consultations')
            .update({ statut: 'terminee', heure_fin: new Date().toTimeString().split(' ')[0] })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Consultation marquée comme terminée');
        res.redirect(`/consultations/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur');
        res.redirect(`/consultations/${req.params.id}`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('consultations')
            .update({ statut: 'annulee' })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Consultation annulée avec succès');
        res.redirect('/consultations');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'annulation');
        res.redirect('/consultations');
    }
});

module.exports = router;
