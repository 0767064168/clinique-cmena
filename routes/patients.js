const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const ExcelJS = require('exceljs');
const { unpackClinicalData, packClinicalData } = require('../utils/vitals');

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';

        let query = supabase.from('patients').select('*', { count: 'exact' });

        if (search) {
            const isNum = !isNaN(parseInt(search, 10));
            if (isNum) {
                query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,telephone.ilike.%${search}%,numero_dossier.eq.${parseInt(search, 10)}`);
            } else {
                query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,telephone.ilike.%${search}%,ville.ilike.%${search}%`);
            }
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
        const { data: praticiens } = await supabase.from('praticiens').select('id, nom, prenom, specialite, matricule').eq('actif', true).order('nom');
        res.render('patients/create', { 
            title: 'Nouveau Patient', 
            assurances: assurances || [],
            praticiens: praticiens || []
        });
    } catch (error) {
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/patients');
    }
});

router.get('/nouveau', (req, res) => res.redirect('/patients/create'));

// GET /patients/export/excel — export Excel de tous les patients
router.get('/export/excel', async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = supabase.from('patients').select('*');
        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%`);
        }
        const { data: patients, error } = await query.order('nom', { ascending: true });
        if (error) throw error;

        // Création du classeur Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        workbook.created = new Date();
        workbook.lastModifiedBy = 'Système GSPM';
        workbook.modified = new Date();

        const sheet = workbook.addWorksheet('Patients', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        // ---- Titre ----
        sheet.mergeCells('A1:J1');
        const titleRow = sheet.getRow(1);
        titleRow.getCell(1).value = 'CSA 3e COMPAGNIE GSPM BOUAKÉ — LISTE DES PATIENTS';
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB22222' } };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 28;

        sheet.mergeCells('A2:J2');
        const subRow = sheet.getRow(2);
        subRow.getCell(1).value = `Exporté le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}${search ? ' — Recherche: ' + search : ''}`;
        subRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF555555' } };
        subRow.getCell(1).alignment = { horizontal: 'center' };
        subRow.height = 16;

        // ---- En-têtes colonnes ----
        const headerRow = sheet.getRow(4);
        const headers = [
            { label: 'N° Dossier',    key: 'numero_dossier',    width: 14 },
            { label: 'Nom',            key: 'nom',               width: 18 },
            { label: 'Prénom',         key: 'prenom',            width: 18 },
            { label: 'Sexe',           key: 'sexe',              width: 8  },
            { label: 'Date naissance', key: 'date_naissance',    width: 16 },
            { label: 'Téléphone',      key: 'telephone',         width: 16 },
            { label: 'Ville',          key: 'ville',             width: 15 },
            { label: 'Gr. Sanguin',    key: 'groupe_sanguin',    width: 12 },
            { label: 'Allergies',      key: 'allergies',         width: 25 },
            { label: 'Date inscription', key: 'created_at',      width: 16 },
        ];

        headers.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h.label;
            cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFAAAAAA' } },
                bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } },
                left: { style: 'thin', color: { argb: 'FFAAAAAA' } },
                right: { style: 'thin', color: { argb: 'FFAAAAAA' } }
            };
            sheet.getColumn(i + 1).width = h.width;
        });
        headerRow.height = 22;

        // ---- Données ----
        (patients || []).forEach((p, rowIdx) => {
            const row = sheet.getRow(rowIdx + 5);
            const bg = rowIdx % 2 === 0 ? 'FFF2F2F2' : 'FFFFFFFF';

            const vals = [
                p.numero_dossier || '',
                p.nom || '',
                p.prenom || '',
                p.sexe || '',
                p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : '',
                p.telephone || '',
                p.ville || '',
                p.groupe_sanguin || '',
                p.allergies || '',
                p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '',
            ];

            vals.forEach((v, ci) => {
                const cell = row.getCell(ci + 1);
                cell.value = v;
                cell.font = { size: 9 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                cell.alignment = { vertical: 'middle', wrapText: true };
                cell.border = {
                    top: { style: 'hair', color: { argb: 'FFCCCCCC' } },
                    bottom: { style: 'hair', color: { argb: 'FFCCCCCC' } },
                    left: { style: 'hair', color: { argb: 'FFCCCCCC' } },
                    right: { style: 'hair', color: { argb: 'FFCCCCCC' } }
                };
            });
            row.height = 15;
        });

        // ---- Ligne de total ----
        const totalRow = sheet.getRow((patients || []).length + 5);
        sheet.mergeCells(`A${totalRow.number}:I${totalRow.number}`);
        totalRow.getCell(1).value = `Total : ${(patients || []).length} patient(s)`;
        totalRow.getCell(1).font = { bold: true, size: 10 };
        totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
        totalRow.height = 18;

        // ---- Envoi ----
        const filename = `patients_${new Date().toISOString().slice(0,10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export Excel patients:', error);
        res.status(500).send('Erreur lors de la génération du fichier Excel');
    }
});

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

        // Si un bilan clinique initial ou des constantes physiques ont été renseignées
        const hasVitals = req.body.tension || req.body.temperature || req.body.poids || req.body.taille || req.body.pouls || req.body.motif_consultation || req.body.diagnostic;
        if (hasVitals) {
            const packedObs = packClinicalData(req.body.observations || 'Bilan initial à l\'enregistrement du patient', {
                ...req.body,
                motif: req.body.motif_consultation || req.body.motif
            });
            await supabase
                .from('consultations')
                .insert([{
                    patient_id: patient.id,
                    praticien_id: req.body.praticien_id || null,
                    date_entree: new Date(),
                    statut: 'en_cours',
                    motif: req.body.motif_consultation || 'Consultation initiale à l\'admission',
                    diagnostic: req.body.diagnostic || null,
                    observations: packedObs
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

        const { data: rawConsultations } = await supabase
            .from('consultations')
            .select('*, praticiens(nom, prenom)')
            .eq('patient_id', id)
            .order('date_entree', { ascending: false });

        const consultations = (rawConsultations || []).map(c => {
            const clinical = unpackClinicalData(c.observations);
            return {
                ...c,
                clinical,
                vitals: clinical,
                observations_clean: clinical.cleanObservations
            };
        });

        const { data: factures } = await supabase
            .from('factures')
            .select('*')
            .eq('patient_id', id)
            .order('date_facture', { ascending: false });

        // Calcul du bilan financier du patient (hors factures annulées)
        const facturesActives = (factures || []).filter(f => f.statut !== 'annulee');
        const bilanPatient = {
            totalFacture: facturesActives.reduce((acc, f) => acc + (parseFloat(f.total_net) || 0), 0),
            totalPaye: facturesActives.reduce((acc, f) => acc + (parseFloat(f.montant_paye) || 0), 0),
            resteTotal: facturesActives.reduce((acc, f) => acc + (parseFloat(f.reste_a_payer) || 0), 0)
        };

        // Historique chronologique des constantes pour graphiques
        const vitalsHistory = (consultations || [])
            .filter(c => c.clinical && (c.clinical.tension || c.clinical.temperature || c.clinical.poids || c.clinical.pouls))
            .sort((a, b) => new Date(a.date_entree) - new Date(b.date_entree))
            .map(c => {
                let systole = null;
                let diastole = null;
                if (c.clinical.tension) {
                    const parts = c.clinical.tension.toString().split(/[\/,\s-]/).map(p => parseFloat(p)).filter(p => !isNaN(p));
                    if (parts.length >= 2) {
                        systole = parts[0] > 30 ? parts[0] : parts[0] * 10;
                        diastole = parts[1] > 30 ? parts[1] : parts[1] * 10;
                    }
                }
                return {
                    date: new Date(c.date_entree).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                    temperature: parseFloat(c.clinical.temperature) || null,
                    poids: parseFloat(c.clinical.poids) || null,
                    pouls: parseFloat(c.clinical.pouls) || null,
                    systole,
                    diastole
                };
            });

        res.render('patients/show', {
            title: 'Détails du Patient',
            patient,
            bilanPatient,
            consultations: consultations || [],
            vitalsHistory: vitalsHistory || [],
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
