const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { packVitals, unpackVitals } = require('../utils/vitals');

router.get('/', async (req, res) => {
    try {
        const { date_from, date_to, praticien_id, statut, search } = req.query;
        let query = supabase.from('consultations').select('*, patients(nom, prenom), praticiens(nom, prenom)');

        if (date_from) query = query.gte('date_entree', `${date_from}T00:00:00`);
        if (date_to) query = query.lte('date_entree', `${date_to}T23:59:59`);
        if (praticien_id) query = query.eq('praticien_id', praticien_id);
        if (statut) query = query.eq('statut', statut);

        const { data: rawConsultations, error } = await query.order('date_entree', { ascending: false });
        if (error) throw error;

        let consultations = (rawConsultations || []).map(c => ({
            ...c,
            patient_nom: c.patients ? c.patients.nom : '-',
            patient_prenom: c.patients ? c.patients.prenom : '',
            praticien_nom: c.praticiens ? `${c.praticiens.nom} ${c.praticiens.prenom}` : '-'
        }));

        if (search) {
            const s = search.toLowerCase();
            consultations = consultations.filter(c => 
                (c.patient_nom && c.patient_nom.toLowerCase().includes(s)) ||
                (c.patient_prenom && c.patient_prenom.toLowerCase().includes(s)) ||
                (c.motif && c.motif.toLowerCase().includes(s))
            );
        }

        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom').eq('actif', true);

        res.render('consultations/index', {
            title: 'Consultations',
            consultations: consultations || [],
            praticiens: praticiens || [],
            query: req.query
        });
    } catch (error) {
        console.error('Erreur consultations:', error);
        req.flash('error', 'Erreur lors de la récupération des consultations');
        res.redirect('/dashboard');
    }
});

router.get('/create', async (req, res) => {
    try {
        const { data: patients } = await supabase.from('patients').select('id, nom, prenom, numero_dossier').order('nom');
        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom, specialite, matricule').eq('actif', true).order('nom');
        
        res.render('consultations/create', { 
            title: 'Nouvelle Consultation',
            patients: patients || [],
            praticiens: praticiens || [],
            query: req.query
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/consultations');
    }
});

router.get(['/nouveau', '/nouvelle'], (req, res) => res.redirect('/consultations/create'));

router.post('/', async (req, res) => {
    try {
        const { 
            patient_id, praticien_id, date_entree, date_sortie, statut, motif, observations, diagnostic,
            tension, temperature, poids, taille, pouls
        } = req.body;
        
        let nombre_jours = 1;
        if (date_entree && date_sortie) {
            const entree = new Date(date_entree);
            const sortie = new Date(date_sortie);
            const diffTime = Math.max(0, sortie - entree);
            nombre_jours = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        }

        const packedObs = packVitals(observations, { tension, temperature, poids, taille, pouls });

        const { data: consultation, error } = await supabase
            .from('consultations')
            .insert([{ 
                patient_id, 
                praticien_id: praticien_id || null, 
                date_entree: date_entree ? new Date(date_entree) : new Date(), 
                date_sortie: date_sortie ? new Date(date_sortie) : null, 
                statut: statut || 'en_cours',
                motif: motif || null, 
                observations: packedObs || null, 
                diagnostic: diagnostic || null,
                nombre_jours
            }])
            .select()
            .single();

        if (error) throw error;

        req.flash('success', 'Consultation enregistrée avec succès');
        res.redirect(`/consultations/${consultation.id}`);
    } catch (error) {
        console.error('Erreur enregistrement consultation:', error);
        req.flash('error', error.message || 'Erreur lors de l\'enregistrement de la consultation');
        res.redirect('/consultations/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { data: consultation, error } = await supabase
            .from('consultations')
            .select('*, patients(*, patient_assurances(*)), praticiens(*)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        if (consultation) {
            if (consultation.patients) {
                consultation.patient_nom = consultation.patients.nom;
                consultation.patient_prenom = consultation.patients.prenom;
                consultation.numero_dossier = consultation.patients.numero_dossier;
                const ass = consultation.patients.patient_assurances && consultation.patients.patient_assurances[0];
                consultation.type_assurance = ass ? `${ass.type_assurance} ${ass.assureur ? '- ' + ass.assureur : ''}` : 'Sans assurance';
            }
            if (consultation.praticiens) {
                consultation.praticien_nom = `${consultation.praticiens.nom} ${consultation.praticiens.prenom}`;
                consultation.praticien_specialite = consultation.praticiens.specialite || '-';
                consultation.praticien_matricule = consultation.praticiens.matricule || null;
            }

            // Décodage des constantes vitales
            const unpacked = unpackVitals(consultation.observations);
            consultation.vitals = {
                tension: unpacked.tension,
                temperature: unpacked.temperature,
                poids: unpacked.poids,
                taille: unpacked.taille,
                pouls: unpacked.pouls
            };
            consultation.observations_clean = unpacked.cleanObservations;
        }

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

// GET /consultations/:id/ordonnance — Impression de l'ordonnance médicale
router.get('/:id/ordonnance', async (req, res) => {
    try {
        const { id } = req.params;
        const { data: consultation, error } = await supabase
            .from('consultations')
            .select('*, patients(*), praticiens(*)')
            .eq('id', id)
            .single();

        if (error || !consultation) {
            req.flash('error', 'Consultation introuvable');
            return res.redirect('/consultations');
        }

        const patient = consultation.patients || null;
        if (consultation.praticiens) {
            consultation.praticien_nom = `${consultation.praticiens.nom} ${consultation.praticiens.prenom}`;
            consultation.praticien_specialite = consultation.praticiens.specialite;
            consultation.praticien_matricule = consultation.praticiens.matricule;
        }

        const unpacked = unpackVitals(consultation.observations);
        consultation.vitals = unpacked;
        consultation.observations_clean = unpacked.cleanObservations;

        res.render('consultations/ordonnance', {
            layout: false,
            title: `Ordonnance - ${patient ? patient.nom : 'Patient'}`,
            consultation,
            patient
        });
    } catch (err) {
        console.error('Erreur ordonnance:', err);
        req.flash('error', 'Erreur lors de la génération de l\'ordonnance');
        res.redirect(`/consultations/${req.params.id}`);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: consultation, error } = await supabase
            .from('consultations')
            .select('*, patients(nom, prenom)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        if (consultation) {
            if (consultation.patients) {
                consultation.patient_nom = consultation.patients.nom;
                consultation.patient_prenom = consultation.patients.prenom;
            }
            // Décodage des constantes vitales pour le formulaire
            const unpacked = unpackVitals(consultation.observations);
            consultation.vitals = {
                tension: unpacked.tension,
                temperature: unpacked.temperature,
                poids: unpacked.poids,
                taille: unpacked.taille,
                pouls: unpacked.pouls
            };
            consultation.observations_clean = unpacked.cleanObservations;
        }

        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom, specialite, matricule').eq('actif', true).order('nom');

        res.render('consultations/edit', { 
            title: 'Modifier Consultation', 
            consultation,
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
        const { 
            praticien_id, date_entree, date_sortie, statut, motif, observations, diagnostic,
            tension, temperature, poids, taille, pouls
        } = req.body;
        
        let nombre_jours = 1;
        if (date_entree && date_sortie) {
            const diffTime = Math.max(0, new Date(date_sortie) - new Date(date_entree));
            nombre_jours = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        }

        const packedObs = packVitals(observations, { tension, temperature, poids, taille, pouls });

        const { error } = await supabase
            .from('consultations')
            .update({ 
                praticien_id: praticien_id || null,
                date_entree: date_entree ? new Date(date_entree) : undefined, 
                date_sortie: date_sortie ? new Date(date_sortie) : null, 
                statut: statut || 'en_cours',
                motif: motif || null, 
                observations: packedObs || null, 
                diagnostic: diagnostic || null,
                nombre_jours,
                updated_at: new Date()
            })
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
            .update({ 
                statut: 'termine', 
                date_sortie: new Date(),
                updated_at: new Date()
            })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Consultation marquée comme terminée');
        res.redirect(`/consultations/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la clôture de la consultation');
        res.redirect(`/consultations/${req.params.id}`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('consultations')
            .update({ statut: 'annule', updated_at: new Date() })
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
