const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
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

// GET /assurances/:id/bordereau/export/excel — Export Excel (.xlsx) professionnel du bordereau de facturation
router.get('/:id/bordereau/export/excel', async (req, res) => {
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

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CSA 3e COMPAGNIE GSPM BOUAKÉ';
        workbook.created = new Date();
        workbook.modified = new Date();

        const worksheet = workbook.addWorksheet('Bordereau', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
        });

        // Largeurs des colonnes (10 colonnes : A à J)
        const columnWidths = [6, 14, 18, 30, 18, 16, 18, 18, 18, 14];
        columnWidths.forEach((width, idx) => {
            worksheet.getColumn(idx + 1).width = width;
        });

        // Ligne 1 : Titre principal fusionné avec fond sarcelle (FF0F766E), texte blanc gras
        worksheet.mergeCells('A1:J1');
        const titleRow = worksheet.getRow(1);
        titleRow.getCell(1).value = 'BORDEREAU RÉCAPITULATIF DE TRANSMISSION';
        titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        for (let c = 2; c <= 10; c++) {
            titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        }

        // Ligne 2 : Sous-titre institutionnel centré
        worksheet.mergeCells('A2:J2');
        const subtitleRow = worksheet.getRow(2);
        subtitleRow.getCell(1).value = 'MINISTÈRE DE LA DÉFENSE — GROUPEMENT DE SAPEURS-POMPIERS MILITAIRES';
        subtitleRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
        subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        subtitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        subtitleRow.height = 20;
        for (let c = 2; c <= 10; c++) {
            subtitleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        }

        // Ligne 3 : Informations assurance et période (italique)
        worksheet.mergeCells('A3:J3');
        const infoRow = worksheet.getRow(3);
        const tauxCouvertureVal = assurance.taux_couverture != null ? assurance.taux_couverture : 80;
        infoRow.getCell(1).value = `Assurance : ${assurance.nom} | Taux : ${tauxCouvertureVal}% | Période : du ${dateFrom} au ${dateTo}`;
        infoRow.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF334155' } };
        infoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        infoRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        infoRow.height = 18;
        for (let c = 2; c <= 10; c++) {
            infoRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        }

        // Ligne 4 : Date de génération
        worksheet.mergeCells('A4:J4');
        const dateGenRow = worksheet.getRow(4);
        const dateGen = new Date();
        dateGenRow.getCell(1).value = `Généré le ${dateGen.toLocaleDateString('fr-FR')} à ${dateGen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        dateGenRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
        dateGenRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        dateGenRow.height = 18;

        // Ligne 5 : Espacement
        worksheet.getRow(5).height = 10;

        // Ligne 6 : En-têtes avec autoFilter et volets figés (ySplit: 6)
        worksheet.views = [{ state: 'frozen', ySplit: 6 }];
        worksheet.autoFilter = { from: 'A6', to: 'J6' };

        const headers = [
            'N°',
            'Date Facture',
            'N° Facture',
            'Nom & Prénoms Assuré',
            'N° Police',
            'Matricule',
            'Total Facturé (FCFA)',
            'Part Assurance (FCFA)',
            'Part Patient (FCFA)',
            'Statut'
        ];

        const headerRow = worksheet.getRow(6);
        headerRow.height = 26;
        headers.forEach((label, idx) => {
            const cell = headerRow.getCell(idx + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        });

        // Lignes de données (à partir de la ligne 7)
        const thinBorder = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        facturesBordereau.forEach((f, idx) => {
            const rowIndex = idx + 7;
            const row = worksheet.getRow(rowIndex);
            row.height = 20;
            const isEven = idx % 2 === 0;
            const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

            const dateStr = f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '-';
            const values = [
                idx + 1,
                dateStr,
                f.numero_facture || '-',
                f.patient_nom || '-',
                f.numero_police || '-',
                f.matricule || '-',
                Math.round(f.total_facture),
                Math.round(f.part_assurance),
                Math.round(f.part_patient),
                f.statut || '-'
            ];

            values.forEach((val, colIdx) => {
                const cell = row.getCell(colIdx + 1);
                cell.value = val;
                cell.border = thinBorder;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.font = { size: 10, color: { argb: 'FF0F172A' } };

                // Alignements spécifiques et formats numériques
                if (colIdx === 0 || colIdx === 1 || colIdx === 2 || colIdx === 4 || colIdx === 5) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                } else if (colIdx === 3) {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                } else if (colIdx >= 6 && colIdx <= 8) {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    cell.numFmt = '# ##0 "FCFA"';
                } else if (colIdx === 9) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });

            // Coloration conditionnelle pour la colonne Statut
            const statusCell = row.getCell(10);
            const statusLower = (f.statut || '').toLowerCase().trim();
            if (statusLower === 'payee') {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Vert
                statusCell.font = { bold: true, size: 10, color: { argb: 'FF166534' } };
            } else if (statusLower === 'partiellement_payee') {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Orange
                statusCell.font = { bold: true, size: 10, color: { argb: 'FFB45309' } };
            } else if (statusLower === 'validee') {
                statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // Bleu
                statusCell.font = { bold: true, size: 10, color: { argb: 'FF1E40AF' } };
            }
        });

        // Ligne de total général
        const totalRowIndex = 7 + facturesBordereau.length;
        const totalRow = worksheet.getRow(totalRowIndex);
        totalRow.height = 24;

        // Fusion A..F pour le libellé TOTAL GÉNÉRAL
        worksheet.mergeCells(`A${totalRowIndex}:F${totalRowIndex}`);
        const totalLabelCell = totalRow.getCell(1);
        totalLabelCell.value = 'TOTAL GÉNÉRAL';
        totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const totalFactureCell = totalRow.getCell(7);
        totalFactureCell.value = facturesBordereau.length > 0
            ? { formula: `SUM(G7:G${totalRowIndex - 1})`, result: Math.round(totalFacture) }
            : Math.round(totalFacture);
        totalFactureCell.numFmt = '# ##0 "FCFA"';
        totalFactureCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const totalAssuranceCell = totalRow.getCell(8);
        totalAssuranceCell.value = facturesBordereau.length > 0
            ? { formula: `SUM(H7:H${totalRowIndex - 1})`, result: Math.round(totalPartAssurance) }
            : Math.round(totalPartAssurance);
        totalAssuranceCell.numFmt = '# ##0 "FCFA"';
        totalAssuranceCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const totalPatientCell = totalRow.getCell(9);
        totalPatientCell.value = facturesBordereau.length > 0
            ? { formula: `SUM(I7:I${totalRowIndex - 1})`, result: Math.round(totalPartPatient) }
            : Math.round(totalPartPatient);
        totalPatientCell.numFmt = '# ##0 "FCFA"';
        totalPatientCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const totalStatutCell = totalRow.getCell(10);
        totalStatutCell.value = '';

        // Style de la ligne de total : fond bleu foncé (FF1F4E79), texte blanc gras
        for (let c = 1; c <= 10; c++) {
            const cell = totalRow.getCell(c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
            cell.border = {
                top: { style: 'medium', color: { argb: 'FFFFFFFF' } },
                bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } },
                left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
                right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
            };
        }

        // Ligne récapitulative finale : MONTANT TOTAL À RECOUVRER AUPRÈS DE ...
        const summaryRowIndex = totalRowIndex + 2;
        worksheet.mergeCells(`A${summaryRowIndex}:J${summaryRowIndex}`);
        const summaryRow = worksheet.getRow(summaryRowIndex);
        summaryRow.height = 28;
        const summaryCell = summaryRow.getCell(1);
        summaryCell.value = `MONTANT TOTAL À RECOUVRER AUPRÈS DE ${assurance.nom} : ${totalPartAssurance} FCFA`;
        summaryCell.font = { bold: true, size: 11, color: { argb: 'FF14532D' } };
        summaryCell.alignment = { horizontal: 'center', vertical: 'middle' };

        for (let c = 1; c <= 10; c++) {
            const cell = summaryRow.getCell(c);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9F99D' } };
            cell.border = {
                top: { style: 'medium', color: { argb: 'FF84CC16' } },
                bottom: { style: 'medium', color: { argb: 'FF84CC16' } },
                left: { style: 'medium', color: { argb: 'FF84CC16' } },
                right: { style: 'medium', color: { argb: 'FF84CC16' } }
            };
        }

        const cleanName = assurance.nom.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `bordereau_${cleanName}_${dateFrom}_${dateTo}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erreur export Excel bordereau assurance:', error);
        req.flash('error', 'Erreur lors de l\'export Excel du bordereau');
        res.redirect('/assurances');
    }
});

module.exports = router;
