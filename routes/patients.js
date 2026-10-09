const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = supabase.from('patients').select('*', { count: 'exact' }).eq('actif', true);

        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,numero_dossier.ilike.%${search}%`);
        }

        const { data: patients, count, error } = await query
            .range(offset, offset + limit - 1)
            .order('nom', { ascending: true });

        if (error) throw error;

        const totalPages = Math.ceil((count || 0) / limit);

        res.render('patients/index', {
            title: 'Liste des Patients',
            patients: patients || [],
            currentPage: page,
            totalPages,
            search
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des patients');
        res.redirect('/dashboard');
    }
});

router.get('/create', async (req, res) => {
    try {
        const { data: assurances } = await supabase.from('assurances').select('*').order('nom');
        res.render('patients/create', { title: 'Nouveau Patient', assurances: assurances || [] });
    } catch (error) {
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/patients');
    }
});

router.post('/', async (req, res) => {
    try {
        const { nom, prenom, sexe, date_naissance, telephone, email, adresse, assurance_id, numero_assure } = req.body;
        
        // Generate matricule
        const prefix = (nom || 'XX').substring(0, 2).toUpperCase();
        const now = new Date();
        const timestamp = now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        const randomDigits = Math.floor(10 + Math.random() * 90).toString();
        const matricule = `${prefix}An${timestamp}${randomDigits}`;

        const { data: patient, error } = await supabase
            .from('patients')
            .insert([{ 
                nom, prenom, sexe, 
                date_naissance: date_naissance || null, 
                telephone, email, adresse, 
                assurance_id: assurance_id || null, 
                numero_assure, 
                matricule, 
                numero_dossier: matricule 
            }])
            .select()
            .single();

        if (error) throw error;

        req.flash('success', 'Patient créé avec succès');
        res.redirect(`/patients/${patient.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création du patient');
        res.redirect('/patients/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: patient, error: errPatient } = await supabase
            .from('patients')
            .select('*, assurances (nom)')
            .eq('id', id)
            .single();

        if (errPatient) throw errPatient;

        const { data: consultations } = await supabase
            .from('consultations')
            .select('*, praticiens(nom, prenom)')
            .eq('patient_id', id)
            .order('date_consultation', { ascending: false });

        const { data: factures } = await supabase
            .from('factures')
            .select('*')
            .eq('patient_id', id)
            .order('date_facture', { ascending: false });

        res.render('patients/show', {
            title: 'Détails du Patient',
            patient,
            consultations: consultations || [],
            factures: factures || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Patient introuvable');
        res.redirect('/patients');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: patient, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        const { data: assurances } = await supabase.from('assurances').select('*').order('nom');

        res.render('patients/edit', { title: 'Modifier Patient', patient, assurances: assurances || [] });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Patient introuvable');
        res.redirect('/patients');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { nom, prenom, sexe, date_naissance, telephone, email, adresse, assurance_id, numero_assure } = req.body;
        
        const { error } = await supabase
            .from('patients')
            .update({ 
                nom, prenom, sexe, 
                date_naissance: date_naissance || null, 
                telephone, email, adresse, 
                assurance_id: assurance_id || null, 
                numero_assure 
            })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Patient mis à jour avec succès');
        res.redirect(`/patients/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour du patient');
        res.redirect(`/patients/${req.params.id}/edit`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('patients')
            .update({ actif: false })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Patient supprimé avec succès');
        res.redirect('/patients');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la suppression du patient');
        res.redirect('/patients');
    }
});

module.exports = router;
