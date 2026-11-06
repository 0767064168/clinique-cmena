const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { 
    getAllRendezVous, 
    getRendezVousById, 
    checkConflict, 
    createRendezVous, 
    updateRendezVous, 
    updateStatutRendezVous, 
    deleteRendezVous 
} = require('../utils/rendezVousStorage');
const { logAudit } = require('../utils/audit');

// Motifs médicaux courants pour pré-remplissage rapide
const MOTIFS_COURANTS = [
    'Consultation Médecine Générale',
    'Consultation Spécialisée',
    'Suivi & Contrôle Tension / Diabète',
    'Pansement & Soins Infirmiers',
    'Consultation Pédiatrique',
    'Visite Médicale d\'Aptitude / GSPM',
    'Examen Post-Opératoire',
    'Renouvellement d\'Ordonnance',
    'Certificat Médical'
];

// Helper: Formater les dates pour l'affichage
function formatDateFR(isoDate) {
    if (!isoDate) return '-';
    const d = new Date(isoDate);
    return d.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function formatHeure(isoDate) {
    if (!isoDate) return '-';
    const d = new Date(isoDate);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// GET /rendez-vous - Liste et Agenda
router.get('/', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const dateSelected = req.query.date || todayStr;
        const vue = req.query.vue || 'agenda'; // 'agenda' ou 'liste'
        const praticien_id = req.query.praticien_id || '';
        const statut = req.query.statut || '';
        const search = req.query.search || '';

        // Récupérer les praticiens pour les filtres et sélecteurs
        const { data: praticiens } = await supabase
            .from('praticiens')
            .select('id, nom, prenom, specialite')
            .eq('actif', true)
            .order('nom');

        // Récupérer les rendez-vous selon la sélection
        let rendezVous = [];
        if (vue === 'agenda') {
            // Vue journalière ciblée
            rendezVous = await getAllRendezVous({
                date: dateSelected,
                praticien_id: praticien_id || undefined,
                statut: statut || undefined,
                search: search || undefined
            });
        } else {
            // Vue liste : 30 jours à venir ou par date
            rendezVous = await getAllRendezVous({
                date: req.query.date ? dateSelected : undefined,
                dateDebut: !req.query.date ? todayStr : undefined,
                praticien_id: praticien_id || undefined,
                statut: statut || undefined,
                search: search || undefined
            });
        }

        // Statistiques du jour
        const rdvsJour = await getAllRendezVous({ date: dateSelected });
        const stats = {
            total: rdvsJour.length,
            programmes: rdvsJour.filter(r => r.statut === 'programme').length,
            confirmes: rdvsJour.filter(r => r.statut === 'confirme').length,
            enAttente: rdvsJour.filter(r => r.statut === 'en_attente').length,
            termines: rdvsJour.filter(r => r.statut === 'termine').length,
            annulesOuAbsents: rdvsJour.filter(r => ['annule', 'absent'].includes(r.statut)).length
        };

        // Créneaux horaires de référence pour l'agenda (07h30 à 18h00)
        const creneauxHoraires = [
            '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
            '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00',
            '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
        ];

        // Associer les rendez-vous aux créneaux pour la vue agenda
        const agendaSlots = creneauxHoraires.map(slot => {
            const matches = rendezVous.filter(r => {
                const heureRdv = formatHeure(r.date_heure);
                return heureRdv === slot || heureRdv.startsWith(slot.substring(0, 4));
            });
            return {
                heure: slot,
                rendezVous: matches
            };
        });

        res.render('rendez_vous/index', {
            title: 'Agenda & Rendez-vous Médicaux',
            rendezVous,
            agendaSlots,
            praticiens: praticiens || [],
            dateSelected,
            todayStr,
            vue,
            praticien_id,
            statut,
            search,
            stats,
            formatDateFR,
            formatHeure
        });
    } catch (error) {
        console.error('Erreur chargement rendez-vous:', error);
        req.flash('error', 'Erreur lors du chargement des rendez-vous: ' + error.message);
        res.redirect('/dashboard');
    }
});

// GET /rendez-vous/nouveau - Formulaire de prise de rendez-vous
router.get('/nouveau', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const preselectedPatientId = req.query.patient_id || '';
        const preselectedDate = req.query.date || todayStr;
        const preselectedHeure = req.query.heure || '08:30';
        const preselectedPraticienId = req.query.praticien_id || '';

        // Charger patients récents ou tous pour sélection rapide
        const { data: patients } = await supabase
            .from('patients')
            .select('id, nom, prenom, numero_dossier, telephone, matricule')
            .order('nom')
            .limit(100);

        // Charger praticiens actifs
        const { data: praticiens } = await supabase
            .from('praticiens')
            .select('id, nom, prenom, specialite')
            .eq('actif', true)
            .order('nom');

        res.render('rendez_vous/form', {
            title: 'Nouveau Rendez-vous Médical',
            isEdit: false,
            rdv: {
                patient_id: preselectedPatientId,
                praticien_id: preselectedPraticienId,
                date: preselectedDate,
                heure: preselectedHeure,
                duree_minutes: 30,
                motif: '',
                notes: '',
                statut: 'programme'
            },
            patients: patients || [],
            praticiens: praticiens || [],
            motifsCourants: MOTIFS_COURANTS,
            conflit: null
        });
    } catch (error) {
        console.error('Erreur ouverture formulaire rdv:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect('/rendez-vous');
    }
});

// POST /rendez-vous - Enregistrer un nouveau rendez-vous
router.post('/', async (req, res) => {
    try {
        const { 
            patient_id, 
            praticien_id, 
            date, 
            heure, 
            duree_minutes, 
            motif, 
            statut, 
            notes, 
            forcer_conflit,
            nouveau_patient_nom,
            nouveau_patient_prenom,
            nouveau_patient_telephone
        } = req.body;

        let finalPatientId = patient_id;

        // Si création rapide de patient
        if ((!finalPatientId || finalPatientId === 'nouveau') && nouveau_patient_nom) {
            const { data: newPat, error: errNewPat } = await supabase
                .from('patients')
                .insert([{
                    nom: nouveau_patient_nom.trim().toUpperCase(),
                    prenom: (nouveau_patient_prenom || '').trim(),
                    telephone: nouveau_patient_telephone || null
                }])
                .select()
                .single();

            if (errNewPat) throw errNewPat;
            finalPatientId = newPat.id;
        }

        if (!finalPatientId) {
            req.flash('error', 'Veuillez sélectionner ou créer un patient.');
            return res.redirect('/rendez-vous/nouveau');
        }

        if (!date || !heure) {
            req.flash('error', 'Veuillez spécifier la date et l\'heure du rendez-vous.');
            return res.redirect('/rendez-vous/nouveau');
        }

        const dateHeureStr = `${date}T${heure}:00`;
        const dureeInt = parseInt(duree_minutes, 10) || 30;

        // Contrôle de chevauchement d'horaire pour le médecin
        if (praticien_id && !forcer_conflit) {
            const conflit = await checkConflict(praticien_id, dateHeureStr, dureeInt);
            if (conflit) {
                req.flash('error', `Attention : Le praticien sélectionné a déjà un rendez-vous prévu sur ce créneau (${formatHeure(conflit.date_heure)} avec ${conflit.patients ? conflit.patients.nom : 'un patient'}). Cochez "Forcer la planification" pour passer outre.`);
                return res.redirect(`/rendez-vous/nouveau?patient_id=${finalPatientId}&praticien_id=${praticien_id}&date=${date}&heure=${heure}`);
            }
        }

        const newRdv = await createRendezVous({
            patient_id: finalPatientId,
            praticien_id: praticien_id || null,
            date_heure: dateHeureStr,
            duree_minutes: dureeInt,
            motif: (motif || 'Consultation').trim(),
            statut: statut || 'programme',
            notes: notes || null,
            created_by: req.user ? req.user.id : null
        });

        await logAudit({
            req,
            action: 'RDV_CREATION',
            entite: 'rendez_vous',
            entite_id: newRdv.id,
            description: `Rendez-vous programmé le ${date} à ${heure} pour le patient ID ${finalPatientId}`,
            details: { date, heure, motif, praticien_id }
        });

        req.flash('success', 'Rendez-vous programmé avec succès.');
        res.redirect(`/rendez-vous?date=${date}`);
    } catch (error) {
        console.error('Erreur création rendez-vous:', error);
        req.flash('error', 'Erreur lors de la programmation du rendez-vous: ' + error.message);
        res.redirect('/rendez-vous/nouveau');
    }
});

// GET /rendez-vous/:id/edit - Modifier un rendez-vous
router.get('/:id/edit', async (req, res) => {
    try {
        const { id } = req.params;
        const rdv = await getRendezVousById(id);

        if (!rdv) {
            req.flash('error', 'Rendez-vous introuvable.');
            return res.redirect('/rendez-vous');
        }

        const [date, heureFull] = (rdv.date_heure || '').split('T');
        const heure = heureFull ? heureFull.substring(0, 5) : '08:00';

        const { data: patients } = await supabase
            .from('patients')
            .select('id, nom, prenom, numero_dossier, telephone')
            .order('nom')
            .limit(100);

        const { data: praticiens } = await supabase
            .from('praticiens')
            .select('id, nom, prenom, specialite')
            .eq('actif', true)
            .order('nom');

        res.render('rendez_vous/form', {
            title: 'Modifier le Rendez-vous',
            isEdit: true,
            rdv: {
                id: rdv.id,
                patient_id: rdv.patient_id,
                praticien_id: rdv.praticien_id,
                date: date,
                heure: heure,
                duree_minutes: rdv.duree_minutes || 30,
                motif: rdv.motif,
                notes: rdv.notes || '',
                statut: rdv.statut
            },
            patientActuel: rdv.patients,
            patients: patients || [],
            praticiens: praticiens || [],
            motifsCourants: MOTIFS_COURANTS,
            conflit: null
        });
    } catch (error) {
        console.error('Erreur édition rdv:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect('/rendez-vous');
    }
});

// POST /rendez-vous/:id/edit - Valider la modification
router.post('/:id/edit', async (req, res) => {
    try {
        const { id } = req.params;
        const { patient_id, praticien_id, date, heure, duree_minutes, motif, statut, notes, forcer_conflit } = req.body;

        const dateHeureStr = `${date}T${heure}:00`;
        const dureeInt = parseInt(duree_minutes, 10) || 30;

        if (praticien_id && !forcer_conflit) {
            const conflit = await checkConflict(praticien_id, dateHeureStr, dureeInt, id);
            if (conflit) {
                req.flash('error', `Attention : Conflit d'horaire avec un autre rendez-vous prévu le ${date} à ${formatHeure(conflit.date_heure)}.`);
                return res.redirect(`/rendez-vous/${id}/edit`);
            }
        }

        await updateRendezVous(id, {
            patient_id,
            praticien_id: praticien_id || null,
            date_heure: dateHeureStr,
            duree_minutes: dureeInt,
            motif: (motif || 'Consultation').trim(),
            statut: statut || 'programme',
            notes: notes || null
        });

        await logAudit({
            req,
            action: 'RDV_MODIFICATION',
            entite: 'rendez_vous',
            entite_id: id,
            description: `Mise à jour du rendez-vous ID ${id} (${date} à ${heure})`,
            details: { date, heure, motif, statut }
        });

        req.flash('success', 'Rendez-vous mis à jour avec succès.');
        res.redirect(`/rendez-vous?date=${date}`);
    } catch (error) {
        console.error('Erreur mise à jour rendez-vous:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect(`/rendez-vous/${req.params.id}/edit`);
    }
});

// POST /rendez-vous/:id/statut - Changement rapide de statut
router.post('/:id/statut', async (req, res) => {
    try {
        const { id } = req.params;
        const { statut } = req.body;

        if (!['programme', 'confirme', 'en_attente', 'termine', 'annule', 'absent'].includes(statut)) {
            return res.status(400).json({ error: 'Statut invalide' });
        }

        await updateStatutRendezVous(id, statut);

        await logAudit({
            req,
            action: 'RDV_STATUT',
            entite: 'rendez_vous',
            entite_id: id,
            description: `Changement de statut du rendez-vous vers ${statut}`,
            details: { statut }
        });

        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.json({ success: true, statut });
        }

        req.flash('success', `Statut mis à jour : ${statut}`);
        res.redirect(req.headers.referer || '/rendez-vous');
    } catch (error) {
        console.error('Erreur changement statut rdv:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect('/rendez-vous');
    }
});

// POST /rendez-vous/:id/envoyer-attente - Transférer directement en Salle d'Attente
router.post('/:id/envoyer-attente', async (req, res) => {
    try {
        const { id } = req.params;
        const rdv = await getRendezVousById(id);

        if (!rdv) {
            req.flash('error', 'Rendez-vous introuvable.');
            return res.redirect('/rendez-vous');
        }

        const today = new Date().toISOString();

        // 1. Créer une consultation en cours dans la salle d'attente
        const { data: consultation, error: errCons } = await supabase
            .from('consultations')
            .insert([{
                patient_id: rdv.patient_id,
                praticien_id: rdv.praticien_id || null,
                date_entree: today,
                statut: 'en_cours',
                motif: rdv.motif || 'Rendez-vous programmé',
                observations: rdv.notes ? `[Rendez-vous programmé] Notes: ${rdv.notes}` : '[Rendez-vous programmé]'
            }])
            .select()
            .single();

        if (errCons) throw errCons;

        // 2. Mettre à jour le rendez-vous vers 'en_attente' et lier l'ID de consultation
        await updateRendezVous(id, {
            statut: 'en_attente',
            consultation_id: consultation.id
        });

        await logAudit({
            req,
            action: 'RDV_ENVOI_ATTENTE',
            entite: 'rendez_vous',
            entite_id: id,
            description: `Patient transféré en salle d'attente depuis le rendez-vous (Consultation ID ${consultation.id})`,
            details: { rdv_id: id, consultation_id: consultation.id }
        });

        req.flash('success', `Patient ${rdv.patients ? rdv.patients.nom : ''} placé en Salle d'Attente avec succès !`);
        res.redirect('/consultations/attente');
    } catch (error) {
        console.error('Erreur envoi en salle d\'attente:', error);
        req.flash('error', 'Erreur lors du transfert en salle d\'attente: ' + error.message);
        res.redirect('/rendez-vous');
    }
});

// POST /rendez-vous/:id/supprimer - Supprimer un rendez-vous
router.post('/:id/supprimer', async (req, res) => {
    try {
        const { id } = req.params;
        await deleteRendezVous(id);

        await logAudit({
            req,
            action: 'RDV_SUPPRESSION',
            entite: 'rendez_vous',
            entite_id: id,
            description: `Suppression du rendez-vous ID ${id}`
        });

        req.flash('success', 'Rendez-vous supprimé.');
        res.redirect(req.headers.referer || '/rendez-vous');
    } catch (error) {
        console.error('Erreur suppression rdv:', error);
        req.flash('error', 'Erreur: ' + error.message);
        res.redirect('/rendez-vous');
    }
});

module.exports = router;
