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
        let { nom, type, type_autre, telephone, email, adresse, taux_couverture } = req.body;
        nom = (nom || '').trim();

        // Si l'utilisateur choisit 'AUTRE', utiliser la précision fournie
        let finalType = type || null;
        if (type === 'AUTRE') {
            finalType = (type_autre && type_autre.trim()) ? type_autre.trim() : 'Autre';
        }

        const { error } = await supabase
            .from('assurances')
            .insert([{
                nom,
                type: finalType,
                telephone: telephone ? telephone.trim() : null,
                email: email ? email.trim() : null,
                adresse: adresse ? adresse.trim() : null,
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

// GET /assurances/:id/edit — Formulaire d'édition
router.get('/:id/edit', async (req, res) => {
    try {
        const { data: assurance, error } = await supabase
            .from('assurances')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !assurance) {
            req.flash('error', 'Assurance introuvable');
            return res.redirect('/assurances');
        }

        res.render('assurances/edit', {
            title: `Modifier l'assurance — ${assurance.nom}`,
            assurance
        });
    } catch (error) {
        console.error('Erreur edit assurance:', error);
        req.flash('error', 'Erreur lors de la récupération de l\'assurance');
        res.redirect('/assurances');
    }
});

// PUT /assurances/:id — mise à jour
router.put('/:id', async (req, res) => {
    try {
        let { nom, type, type_autre, telephone, email, adresse, taux_couverture } = req.body;
        nom = (nom || '').trim();

        // Si l'utilisateur choisit 'AUTRE', utiliser la précision fournie
        let finalType = type || null;
        if (type === 'AUTRE') {
            finalType = (type_autre && type_autre.trim()) ? type_autre.trim() : 'Autre';
        }

        const { error } = await supabase
            .from('assurances')
            .update({
                nom,
                type: finalType,
                telephone: telephone ? telephone.trim() : null,
                email: email ? email.trim() : null,
                adresse: adresse ? adresse.trim() : null,
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

// GET /assurances/:id/bordereau — Bordereau de facturation par assurance
router.get('/:id/bordereau', async (req, res) => {
    try {
        const { id } = req.params;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const dateFrom = req.query.date_from || startOfMonth;
        const dateTo = req.query.date_to || endOfMonth;

        const { data: assurance, error: errAssurance } = await supabase
            .from('assurances')
            .select('*')
            .eq('id', id)
            .single();

        if (errAssurance || !assurance) throw errAssurance || new Error('Assurance introuvable');

        // Récupérer les patients affiliés à cette assurance
        const { data: patientAssurances } = await supabase
            .from('patient_assurances')
            .select('patient_id, numero_police, assureur')
            .ilike('assureur', `%${assurance.nom}%`);

        const patientMap = {};
        (patientAssurances || []).forEach(pa => {
            patientMap[pa.patient_id] = pa.numero_police || '-';
        });

        const patientIds = Object.keys(patientMap);

        let facturesBordereau = [];
        if (patientIds.length > 0) {
            const { data: factures } = await supabase
                .from('factures')
                .select('id, numero_facture, date_facture, total_net, statut, patient_id, patients(nom, prenom, matricule), facture_lignes(part_assureur, part_assure, montant)')
                .in('patient_id', patientIds)
                .gte('date_facture', `${dateFrom}T00:00:00`)
                .lte('date_facture', `${dateTo}T23:59:59`)
                .neq('statut', 'annulee')
                .order('date_facture', { ascending: true });

            const tauxCouverture = parseFloat(assurance.taux_couverture) || 80;

            facturesBordereau = (factures || []).map(f => {
                const totalLignesAssureur = (f.facture_lignes || []).reduce((acc, l) => acc + (parseFloat(l.part_assureur) || 0), 0);
                const partAssurance = totalLignesAssureur > 0 ? totalLignesAssureur : Math.round((parseFloat(f.total_net) || 0) * (tauxCouverture / 100));
                const partPatient = (parseFloat(f.total_net) || 0) - partAssurance;

                return {
                    id: f.id,
                    numero_facture: f.numero_facture,
                    date_facture: f.date_facture,
                    patient_nom: f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-',
                    matricule: f.patients ? f.patients.matricule : null,
                    numero_police: patientMap[f.patient_id] || '-',
                    total_facture: parseFloat(f.total_net) || 0,
                    part_assurance: partAssurance,
                    part_patient: partPatient,
                    statut: f.statut
                };
            });
        }

        const totalFacture = facturesBordereau.reduce((acc, f) => acc + f.total_facture, 0);
        const totalPartAssurance = facturesBordereau.reduce((acc, f) => acc + f.part_assurance, 0);
        const totalPartPatient = facturesBordereau.reduce((acc, f) => acc + f.part_patient, 0);

        res.render('assurances/bordereau', {
            title: `Bordereau — ${assurance.nom}`,
            assurance,
            factures: facturesBordereau,
            totalFacture,
            totalPartAssurance,
            totalPartPatient,
            dateFrom,
            dateTo
        });
    } catch (error) {
        console.error('Erreur bordereau assurance:', error);
        req.flash('error', 'Erreur lors de la génération du bordereau');
        res.redirect('/assurances');
    }
});

// GET /assurances/:id/bordereau/print — Impression A4 du bordereau
router.get('/:id/bordereau/print', async (req, res) => {
    try {
        const { id } = req.params;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const dateFrom = req.query.date_from || startOfMonth;
        const dateTo = req.query.date_to || endOfMonth;

        const { data: assurance, error: errAssurance } = await supabase
            .from('assurances')
            .select('*')
            .eq('id', id)
            .single();

        if (errAssurance || !assurance) throw errAssurance || new Error('Assurance introuvable');

        const { data: patientAssurances } = await supabase
            .from('patient_assurances')
            .select('patient_id, numero_police, assureur')
            .ilike('assureur', `%${assurance.nom}%`);

        const patientMap = {};
        (patientAssurances || []).forEach(pa => {
            patientMap[pa.patient_id] = pa.numero_police || '-';
        });

        const patientIds = Object.keys(patientMap);

        let facturesBordereau = [];
        if (patientIds.length > 0) {
            const { data: factures } = await supabase
                .from('factures')
                .select('id, numero_facture, date_facture, total_net, statut, patient_id, patients(nom, prenom, matricule), facture_lignes(part_assureur, part_assure, montant)')
                .in('patient_id', patientIds)
                .gte('date_facture', `${dateFrom}T00:00:00`)
                .lte('date_facture', `${dateTo}T23:59:59`)
                .neq('statut', 'annulee')
                .order('date_facture', { ascending: true });

            const tauxCouverture = parseFloat(assurance.taux_couverture) || 80;

            facturesBordereau = (factures || []).map(f => {
                const totalLignesAssureur = (f.facture_lignes || []).reduce((acc, l) => acc + (parseFloat(l.part_assureur) || 0), 0);
                const partAssurance = totalLignesAssureur > 0 ? totalLignesAssureur : Math.round((parseFloat(f.total_net) || 0) * (tauxCouverture / 100));
                const partPatient = (parseFloat(f.total_net) || 0) - partAssurance;

                return {
                    id: f.id,
                    numero_facture: f.numero_facture,
                    date_facture: f.date_facture,
                    patient_nom: f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-',
                    matricule: f.patients ? f.patients.matricule : null,
                    numero_police: patientMap[f.patient_id] || '-',
                    total_facture: parseFloat(f.total_net) || 0,
                    part_assurance: partAssurance,
                    part_patient: partPatient,
                    statut: f.statut
                };
            });
        }

        const totalFacture = facturesBordereau.reduce((acc, f) => acc + f.total_facture, 0);
        const totalPartAssurance = facturesBordereau.reduce((acc, f) => acc + f.part_assurance, 0);
        const totalPartPatient = facturesBordereau.reduce((acc, f) => acc + f.part_patient, 0);

        res.render('assurances/print', {
            layout: false,
            title: `Bordereau — ${assurance.nom}`,
            assurance,
            factures: facturesBordereau,
            totalFacture,
            totalPartAssurance,
            totalPartPatient,
            dateFrom,
            dateTo,
            user: (req.session && req.session.user) ? req.session.user : null
        });
    } catch (error) {
        console.error('Erreur impression bordereau assurance:', error);
        req.flash('error', 'Erreur lors de la génération du bordereau');
        res.redirect('/assurances');
    }
});

// GET /assurances/:id/bordereau/export — Export CSV / Excel du bordereau de facturation
router.get('/:id/bordereau/export', async (req, res) => {
    try {
        const { id } = req.params;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const dateFrom = req.query.date_from || startOfMonth;
        const dateTo = req.query.date_to || endOfMonth;

        const { data: assurance, error: errAssurance } = await supabase
            .from('assurances')
            .select('*')
            .eq('id', id)
            .single();

        if (errAssurance || !assurance) throw errAssurance || new Error('Assurance introuvable');

        const { data: patientAssurances } = await supabase
            .from('patient_assurances')
            .select('patient_id, numero_police, assureur')
            .ilike('assureur', `%${assurance.nom}%`);

        const patientMap = {};
        (patientAssurances || []).forEach(pa => {
            patientMap[pa.patient_id] = pa.numero_police || '-';
        });

        const patientIds = Object.keys(patientMap);

        let facturesBordereau = [];
        if (patientIds.length > 0) {
            const { data: factures } = await supabase
                .from('factures')
                .select('id, numero_facture, date_facture, total_net, statut, patient_id, patients(nom, prenom, matricule), facture_lignes(part_assureur, part_assure, montant)')
                .in('patient_id', patientIds)
                .gte('date_facture', `${dateFrom}T00:00:00`)
                .lte('date_facture', `${dateTo}T23:59:59`)
                .neq('statut', 'annulee')
                .order('date_facture', { ascending: true });

            const tauxCouverture = parseFloat(assurance.taux_couverture) || 80;

            facturesBordereau = (factures || []).map(f => {
                const totalLignesAssureur = (f.facture_lignes || []).reduce((acc, l) => acc + (parseFloat(l.part_assureur) || 0), 0);
                const partAssurance = totalLignesAssureur > 0 ? totalLignesAssureur : Math.round((parseFloat(f.total_net) || 0) * (tauxCouverture / 100));
                const partPatient = (parseFloat(f.total_net) || 0) - partAssurance;

                return {
                    id: f.id,
                    numero_facture: f.numero_facture,
                    date_facture: f.date_facture,
                    patient_nom: f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-',
                    matricule: f.patients ? f.patients.matricule : null,
                    numero_police: patientMap[f.patient_id] || '-',
                    total_facture: parseFloat(f.total_net) || 0,
                    part_assurance: partAssurance,
                    part_patient: partPatient,
                    statut: f.statut
                };
            });
        }

        const totalFacture = facturesBordereau.reduce((acc, f) => acc + f.total_facture, 0);
        const totalPartAssurance = facturesBordereau.reduce((acc, f) => acc + f.part_assurance, 0);
        const totalPartPatient = facturesBordereau.reduce((acc, f) => acc + f.part_patient, 0);

        const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

        const lines = [
            `BORDEREAU RÉCAPITULATIF DE TRANSMISSION — CSA 3e COMPAGNIE GSPM BOUAKÉ`,
            `Assurance / Organisme Payeur :;${assurance.nom}`,
            `Type :;${assurance.type || 'Assurance'}`,
            `Période :;Du ${new Date(dateFrom).toLocaleDateString('fr-FR')} au ${new Date(dateTo).toLocaleDateString('fr-FR')}`,
            `Taux de couverture conventionnel :;${assurance.taux_couverture || 80}%`,
            `Date d'émission :;${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
            ``,
            `N°;Date Facture;N° Facture;Nom & Prénoms Assuré / Bénéficiaire;N° Police / Affiliation;Matricule Militaire;Total Facturé (FCFA);Part Assurance (FCFA);Part Patient (FCFA);Statut`
        ];

        facturesBordereau.forEach((f, idx) => {
            const dateStr = new Date(f.date_facture).toLocaleDateString('fr-FR');
            lines.push([
                idx + 1,
                escapeCsv(dateStr),
                escapeCsv(f.numero_facture),
                escapeCsv(f.patient_nom),
                escapeCsv(f.numero_police),
                escapeCsv(f.matricule || '-'),
                Math.round(f.total_facture),
                Math.round(f.part_assurance),
                Math.round(f.part_patient),
                escapeCsv(f.statut)
            ].join(';'));
        });

        lines.push(``);
        lines.push(`;;;;;TOTAL GÉNÉRAL;${Math.round(totalFacture)};${Math.round(totalPartAssurance)};${Math.round(totalPartPatient)};`);
        lines.push(``);
        lines.push(`MONTANT TOTAL À RECOUVRER AUPRÈS DE ${assurance.nom} :;${Math.round(totalPartAssurance)} FCFA`);

        const cleanName = assurance.nom.replace(/[^a-zA-Z0-9]/g, '_');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="bordereau_${cleanName}_${dateFrom}_${dateTo}.csv"`);
        res.send('\uFEFF' + lines.join('\r\n'));
    } catch (error) {
        console.error('Erreur export bordereau assurance:', error);
        req.flash('error', 'Erreur lors de l\'export du bordereau');
        res.redirect('/assurances');
    }
});

module.exports = router;
