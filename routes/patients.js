const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = supabase.from('patients').select('*', { count: 'exact' });

        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,matricule.ilike.%${search}%`);
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

router.get('/nouveau', (req, res) => res.redirect('/patients/create'));

router.post('/', async (req, res) => {
    try {
        const {
            nom, prenom, sexe, date_naissance, telephone, email, adresse, ville,
            groupe_sanguin, allergies, antecedents,
            contact_urgence_nom, contact_urgence_telephone,
            type_assurance, assureur, souscripteur, numero_police
        } = req.body;

        const patientData = {
            nom,
            prenom,
            sexe: sexe || 'M',
            date_naissance: date_naissance || null,
            telephone: telephone || null,
            adresse: adresse || null,
            ville: ville || null,
            groupe_sanguin: groupe_sanguin || null,
            allergies: allergies || null,
            antecedents: antecedents || null,
            contact_urgence_nom: contact_urgence_nom || null,
            contact_urgence_tel: contact_urgence_telephone || null
        };

        const { data: patient, error } = await supabase
            .from('patients')
            .insert([patientData])
            .select()
            .single();

        if (error) throw error;

        // Si des informations d'assurance ont été saisies
        if (assureur || numero_police || souscripteur) {
            await supabase
                .from('patient_assurances')
                .insert([{
                    patient_id: patient.id,
                    type_assurance: type_assurance || 'PARTICULIER',
                    assureur: assureur || null,
                    souscripteur: souscripteur || null,
                    numero_police: numero_police || null
                }]);
        }

        req.flash('success', 'Patient créé avec succès');
        res.redirect(`/patients/${patient.id}`);
    } catch (error) {
        console.error('Erreur création patient:', error);
        req.flash('error', error.message || 'Erreur lors de la création du patient');
        res.redirect('/patients/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: patient, error: errPatient } = await supabase
            .from('patients')
            .select('*, patient_assurances(*)')
            .eq('id', id)
            .single();

        if (errPatient) throw errPatient;

        // Aplatir l'assurance principale sur l'objet patient pour la vue
        if (patient.patient_assurances && patient.patient_assurances.length > 0) {
            const ass = patient.patient_assurances[0];
            patient.type_assurance = ass.type_assurance;
            patient.assureur = ass.assureur;
            patient.souscripteur = ass.souscripteur;
            patient.numero_police = ass.numero_police;
        }

        const { data: consultations } = await supabase
            .from('consultations')
            .select('*, praticiens(nom, prenom)')
            .eq('patient_id', id)
            .order('date_entree', { ascending: false });

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
            .select('*, patient_assurances(*)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        if (patient.patient_assurances && patient.patient_assurances.length > 0) {
            const ass = patient.patient_assurances[0];
            patient.type_assurance = ass.type_assurance;
            patient.assureur = ass.assureur;
            patient.souscripteur = ass.souscripteur;
            patient.numero_police = ass.numero_police;
        }

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
        const {
            nom, prenom, sexe, date_naissance, telephone, email, adresse, ville,
            groupe_sanguin, allergies, antecedents,
            contact_urgence_nom, contact_urgence_telephone,
            type_assurance, assureur, souscripteur, numero_police
        } = req.body;
        
        const { error } = await supabase
            .from('patients')
            .update({ 
                nom, prenom, sexe, 
                date_naissance: date_naissance || null, 
                telephone: telephone || null,
                adresse: adresse || null,
                ville: ville || null,
                groupe_sanguin: groupe_sanguin || null,
                allergies: allergies || null,
                antecedents: antecedents || null,
                contact_urgence_nom: contact_urgence_nom || null,
                contact_urgence_tel: contact_urgence_telephone || null,
                updated_at: new Date()
            })
            .eq('id', req.params.id);

        if (error) throw error;

        // Mise à jour ou insertion de l'assurance patient
        if (assureur || numero_police || souscripteur) {
            const { data: existingAss } = await supabase
                .from('patient_assurances')
                .select('id')
                .eq('patient_id', req.params.id)
                .limit(1);

            if (existingAss && existingAss.length > 0) {
                await supabase
                    .from('patient_assurances')
                    .update({
                        type_assurance: type_assurance || 'PARTICULIER',
                        assureur: assureur || null,
                        souscripteur: souscripteur || null,
                        numero_police: numero_police || null
                    })
                    .eq('id', existingAss[0].id);
            } else {
                await supabase
                    .from('patient_assurances')
                    .insert([{
                        patient_id: req.params.id,
                        type_assurance: type_assurance || 'PARTICULIER',
                        assureur: assureur || null,
                        souscripteur: souscripteur || null,
                        numero_police: numero_police || null
                    }]);
            }
        }

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
            .delete()
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
