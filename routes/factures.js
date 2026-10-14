const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { numberToFrenchWords } = require('../utils/helpers');
const { logAudit } = require('../utils/audit');
const PDFDocument = require('pdfkit');
const path = require('path');

// GET /factures — liste
router.get('/', async (req, res) => {
    try {
        const { statut, date_from, date_to, search } = req.query;
        let query = supabase.from('factures').select('*, patients!inner(nom, prenom)');

        if (statut) query = query.eq('statut', statut);
        if (date_from) query = query.gte('date_facture', date_from);
        if (date_to) query = query.lte('date_facture', date_to);

        if (search) {
            query = query.or(
                `nom.ilike.%${search}%,prenom.ilike.%${search}%`,
                { foreignTable: 'patients' }
            );
        }

        const { data: factures, error } = await query.order('date_facture', { ascending: false });
        if (error) throw error;

        res.render('factures/index', {
            title: 'Factures',
            factures: factures || [],
            filters: { statut, date_from, date_to, search }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des factures');
        res.redirect('/dashboard');
    }
});

// GET /factures/create — formulaire création
router.get('/create', async (req, res) => {
    try {
        const { consultation_id } = req.query;
        let selectedConsultation = null;

        if (consultation_id) {
            const { data } = await supabase
                .from('consultations')
                .select('*, patients(nom, prenom)')
                .eq('id', consultation_id)
                .single();
            selectedConsultation = data;
        }

        // Consultations terminées sans facture (ou toutes si pas de filtre)
        const { data: consultations } = await supabase
            .from('consultations')
            .select('*, patients(nom, prenom)')
            .eq('statut', 'termine')
            .order('date_entree', { ascending: false })
            .limit(50);

        // Patients actifs
        const { data: patients } = await supabase
            .from('patients')
            .select('id, nom, prenom')
            .order('nom');

        // Actes disponibles
        const { data: actes } = await supabase
            .from('actes_medicaux')
            .select('*')
            .eq('actif', true)
            .order('libelle');

        res.render('factures/create', {
            title: 'Nouvelle Facture',
            selectedConsultation,
            consultations: consultations || [],
            patients: patients || [],
            actes: actes || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors du chargement du formulaire');
        res.redirect('/factures');
    }
});

router.get(['/nouveau', '/nouvelle'], (req, res) => res.redirect('/factures/create'));

// GET /factures/export/pdf — export PDF de la liste des factures
router.get('/export/pdf', async (req, res) => {
    try {
        const { statut, date_from, date_to, search } = req.query;
        let query = supabase.from('factures').select('*, patients!inner(nom, prenom)');

        if (statut) query = query.eq('statut', statut);
        if (date_from) query = query.gte('date_facture', date_from);
        if (date_to) query = query.lte('date_facture', date_to);
        if (search) {
            query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%`, { foreignTable: 'patients' });
        }

        const { data: factures, error } = await query.order('date_facture', { ascending: false });
        if (error) throw error;

        // Création du document PDF
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const filename = `factures_${new Date().toISOString().slice(0,10)}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);

        // ---- EN-TÊTE ----
        const logoGSPM = path.join(__dirname, '../public/images/logo_gspm.jpg');
        const logoDefense = path.join(__dirname, '../public/images/logo_defense.jpg');

        try { doc.image(logoGSPM, 50, 30, { width: 60 }); } catch(e) { /* logo absent */ }
        try { doc.image(logoDefense, 490, 30, { width: 60 }); } catch(e) { /* logo absent */ }

        doc.fontSize(11).font('Helvetica-Bold')
           .text('REPUBLIQUE DE CÔTE D\'IVOIRE', 0, 35, { align: 'center' })
           .text('MINISTERE DE LA DEFENSE', { align: 'center' })
           .text('GROUPEMENT DE SAPEURS POMPIERS MILITAIRES', { align: 'center' });
        doc.fontSize(10).font('Helvetica')
           .text('CSA 3e COMPAGNIE GSPM BOUAKÉ', { align: 'center' });

        // Bande tricolore (Orange / Blanc / Vert)
        const bandY = 110;
        doc.rect(50, bandY, 495, 5).fill('#FF6600');
        doc.rect(50, bandY + 5, 495, 5).fill('#FFFFFF').stroke('#CCCCCC');
        doc.rect(50, bandY + 10, 495, 5).fill('#009900');

        // Titre du document
        doc.moveDown(2.5);
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a1a1a')
           .text('LISTE DES FACTURES', { align: 'center' });
        doc.fontSize(9).font('Helvetica').fillColor('#555555')
           .text(`Exporté le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`, { align: 'center' });
        if (statut || date_from || date_to || search) {
            const filtres = [];
            if (statut) filtres.push(`Statut: ${statut}`);
            if (date_from) filtres.push(`Du: ${new Date(date_from).toLocaleDateString('fr-FR')}`);
            if (date_to) filtres.push(`Au: ${new Date(date_to).toLocaleDateString('fr-FR')}`);
            if (search) filtres.push(`Recherche: ${search}`);
            doc.text(`Filtres appliqués: ${filtres.join(' | ')}`, { align: 'center' });
        }
        doc.moveDown(1);

        // ---- TABLEAU ----
        const tableTop = doc.y;
        const colX = { num: 50, date: 145, patient: 230, total: 360, reste: 430, statut: 500 };
        const colW = { num: 90, date: 80, patient: 125, total: 65, reste: 65, statut: 55 };

        // En-tête du tableau
        doc.rect(50, tableTop, 505, 18).fill('#B22222');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('N° Facture',   colX.num,     tableTop + 5, { width: colW.num });
        doc.text('Date',         colX.date,    tableTop + 5, { width: colW.date });
        doc.text('Patient',      colX.patient, tableTop + 5, { width: colW.patient });
        doc.text('Total TTC',    colX.total,   tableTop + 5, { width: colW.total, align: 'right' });
        doc.text('Reste',        colX.reste,   tableTop + 5, { width: colW.reste, align: 'right' });
        doc.text('Statut',       colX.statut,  tableTop + 5, { width: colW.statut });

        let y = tableTop + 18;
        const rowH = 16;

        const statutLabel = { brouillon:'Brouillon', validee:'Validée', payee:'Payée', partiellement_payee:'Part.Payée', annulee:'Annulée' };
        let totalGeneral = 0;

        (factures || []).forEach((f, i) => {
            if (y > 760) {
                doc.addPage();
                y = 50;
            }
            const bg = i % 2 === 0 ? '#F9F9F9' : '#FFFFFF';
            doc.rect(50, y, 505, rowH).fill(bg);

            const patNom = f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-';
            const dateStr = f.date_facture ? new Date(f.date_facture).toLocaleDateString('fr-FR') : '-';
            const totalNet = f.total_net || 0;
            const reste = f.reste_a_payer || 0;
            totalGeneral += totalNet;

            doc.fontSize(7.5).font('Helvetica').fillColor('#333333');
            doc.text(f.numero_facture || '-',       colX.num,     y + 4, { width: colW.num });
            doc.text(dateStr,                        colX.date,    y + 4, { width: colW.date });
            doc.text(patNom,                         colX.patient, y + 4, { width: colW.patient });
            doc.text(totalNet.toLocaleString('fr-FR') + ' FCFA', colX.total, y + 4, { width: colW.total, align: 'right' });
            doc.text(reste.toLocaleString('fr-FR') + ' FCFA',    colX.reste, y + 4, { width: colW.reste, align: 'right' });
            doc.text(statutLabel[f.statut] || f.statut || '-', colX.statut, y + 4, { width: colW.statut });

            y += rowH;
        });

        // Ligne de total
        doc.rect(50, y, 505, 18).fill('#F0F0F0');
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a1a1a');
        doc.text(`TOTAL (${(factures||[]).length} factures)`, colX.num, y + 5, { width: 300 });
        doc.text(totalGeneral.toLocaleString('fr-FR') + ' FCFA', colX.total, y + 5, { width: colW.total, align: 'right' });

        // Pied de page
        doc.fontSize(7).font('Helvetica').fillColor('#888888')
           .text('CSA 3e COMPAGNIE GSPM BOUAKÉ — Document généré automatiquement — SAUVER OU PERIR',
               50, 800, { align: 'center', width: 505 });

        doc.end();
    } catch (error) {
        console.error('Erreur export PDF factures:', error);
        res.status(500).send('Erreur lors de la génération du PDF');
    }
});

// POST /factures — création
router.post('/', async (req, res) => {
    try {
        const {
            patient_id, consultation_id, remise,
            libelle, acte_id, prix_unitaire, quantite, pourcentage,
            nom_praticien, action
        } = req.body;

        const statut = action === 'valider' ? 'validee' : 'brouillon';
        const remiseVal = parseFloat(remise || 0);

        // Créer la facture — numero_facture généré automatiquement par la séquence DB
        const editeParId = (req.session && req.session.user && req.session.user.id) ? req.session.user.id : null;
        const { data: facture, error: errFacture } = await supabase
            .from('factures')
            .insert([{
                patient_id,
                consultation_id: consultation_id || null,
                date_facture: new Date(),
                remise: remiseVal,
                statut,
                edite_par: editeParId
            }])
            .select()
            .single();

        if (errFacture) throw errFacture;

        // Normaliser les entrées pour supporter 1 ou plusieurs lignes
        const libelles = Array.isArray(libelle) ? libelle : (libelle ? [libelle] : []);
        const pus = Array.isArray(prix_unitaire) ? prix_unitaire : (prix_unitaire !== undefined ? [prix_unitaire] : []);
        const qtes = Array.isArray(quantite) ? quantite : (quantite !== undefined ? [quantite] : []);
        const pcts = Array.isArray(pourcentage) ? pourcentage : (pourcentage !== undefined ? [pourcentage] : []);
        const actes = Array.isArray(acte_id) ? acte_id : (acte_id ? [acte_id] : []);
        const praticiens = Array.isArray(nom_praticien) ? nom_praticien : (nom_praticien ? [nom_praticien] : []);

        if (libelles.length > 0) {
            let total = 0;
            const lignes = libelles.map((l, index) => {
                const pu = parseFloat(pus[index] !== undefined ? pus[index] : 0) || 0;
                const qte = parseInt(qtes[index] !== undefined ? qtes[index] : 1, 10) || 1;
                const pct = parseFloat(pcts[index] !== undefined ? pcts[index] : 100) || 100;
                const montant = pu * qte * (pct / 100);
                total += montant;

                return {
                    facture_id: facture.id,
                    acte_id: actes[index] || null,
                    libelle: l,
                    nom_praticien: praticiens[index] || null,
                    prix_unitaire: pu,
                    quantite: qte,
                    pourcentage: pct,
                    montant,
                    part_assure: montant  // par défaut 100% à la charge du patient
                };
            });

            const { error: errLignes } = await supabase.from('facture_lignes').insert(lignes);
            if (errLignes) throw errLignes;

            // Recalculer les totaux (le trigger DB le fait aussi, mais on met à jour au cas où)
            const total_net = total - remiseVal;
            const taux_euro = 655.957;
            const total_euro = total_net / taux_euro;
            const reste_a_payer = total_net;

            await supabase
                .from('factures')
                .update({ total, total_net, total_euro, reste_a_payer })
                .eq('id', facture.id);
        }

        req.flash('success', 'Facture créée avec succès');
        res.redirect(`/factures/${facture.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création de la facture');
        res.redirect('/factures/create');
    }
});

// GET /factures/:id — affichage
router.get('/:id', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .select('*, patients(*), consultations(id, date_entree, date_sortie, motif, praticiens(nom, prenom, specialite, matricule))')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        let editeur = null;
        if (facture.edite_par) {
            const { data: user } = await supabase
                .from('utilisateurs')
                .select('nom, prenom')
                .eq('id', facture.edite_par)
                .single();
            editeur = user;
        }

        const { data: lignes } = await supabase
            .from('facture_lignes')
            .select('*')
            .eq('facture_id', req.params.id)
            .order('created_at');

        const { data: paiements } = await supabase
            .from('paiements')
            .select('*')
            .eq('facture_id', req.params.id)
            .order('date_paiement', { ascending: false });

        res.render('factures/show', {
            title: `Facture N°${facture.numero_facture}`,
            facture,
            editeur,
            lignes: lignes || [],
            paiements: paiements || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Facture introuvable');
        res.redirect('/factures');
    }
});

// GET /factures/:id/print — impression
router.get('/:id/print', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .select('*, patients(*), consultations(id, date_entree, date_sortie, motif, praticiens(nom, prenom, specialite, matricule))')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        // Charger l'éditeur si edite_par est renseigné
        let editeur = null;
        if (facture.edite_par) {
            const { data: user } = await supabase
                .from('utilisateurs')
                .select('nom, prenom')
                .eq('id', facture.edite_par)
                .single();
            editeur = user;
        }

        const { data: lignes } = await supabase
            .from('facture_lignes')
            .select('*')
            .eq('facture_id', req.params.id)
            .order('created_at');

        const { data: params } = await supabase
            .from('parametres_clinique')
            .select('*')
            .single();

        res.render('factures/print', {
            layout: false,
            facture,
            lignes: lignes || [],
            clinique: params || {},
            editeur,
            numberToFrenchWords
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'impression');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// Helper — recalcul des totaux (les triggers DB font déjà ce travail, mais au cas où)
async function recalculateFactureTotals(factureId) {
    const { data: facture } = await supabase.from('factures').select('*').eq('id', factureId).single();
    const { data: lignes } = await supabase.from('facture_lignes').select('montant').eq('facture_id', factureId);

    let total = 0;
    if (lignes) {
        total = lignes.reduce((acc, l) => acc + parseFloat(l.montant || 0), 0);
    }

    const remise = parseFloat(facture.remise || 0);
    const total_net = total - remise;
    const taux_euro = 655.957;
    const total_euro = total_net / taux_euro;
    const reste_a_payer = total_net - parseFloat(facture.montant_paye || 0);

    let statut = facture.statut;
    if (statut !== 'brouillon' && statut !== 'annulee') {
        if (reste_a_payer <= 0) statut = 'payee';
        else if (parseFloat(facture.montant_paye || 0) > 0) statut = 'partiellement_payee';
        else statut = 'validee';
    }

    await supabase
        .from('factures')
        .update({ total, total_net, total_euro, reste_a_payer, statut })
        .eq('id', factureId);
}

// GET /factures/:id/edit
router.get('/:id/edit', async (req, res) => {
    try {
        const { data: facture, error } = await supabase
            .from('factures')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        if (facture.statut !== 'brouillon') {
            req.flash('error', 'Seules les factures en brouillon peuvent être modifiées');
            return res.redirect(`/factures/${req.params.id}`);
        }

        res.render('factures/edit', { title: 'Modifier Facture', facture });
    } catch (error) {
        console.error(error);
        res.redirect('/factures');
    }
});

// PUT /factures/:id — mise à jour remise
router.put('/:id', async (req, res) => {
    try {
        const { remise } = req.body;

        const { error } = await supabase
            .from('factures')
            .update({ remise: parseFloat(remise || 0) })
            .eq('id', req.params.id);

        if (error) throw error;

        await recalculateFactureTotals(req.params.id);

        req.flash('success', 'Facture mise à jour avec succès');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour');
        res.redirect(`/factures/${req.params.id}/edit`);
    }
});

// POST /factures/:id/lignes — ajout d'une ligne
router.post('/:id/lignes', async (req, res) => {
    try {
        const { libelle, acte_id, nom_praticien, prix_unitaire, quantite, pourcentage } = req.body;
        const pu = parseFloat(prix_unitaire || 0);
        const qte = parseInt(quantite || 1);
        const pct = parseFloat(pourcentage || 100);
        const montant = pu * qte * (pct / 100);

        const { error } = await supabase
            .from('facture_lignes')
            .insert([{
                facture_id: req.params.id,
                acte_id: acte_id || null,
                libelle,
                nom_praticien: nom_praticien || null,
                prix_unitaire: pu,
                quantite: qte,
                pourcentage: pct,
                montant,
                part_assure: montant
            }]);

        if (error) throw error;

        await recalculateFactureTotals(req.params.id);

        req.flash('success', 'Ligne ajoutée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'ajout de la ligne');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// DELETE /factures/:id/lignes/:ligneId — suppression d'une ligne
router.delete('/:id/lignes/:ligneId', async (req, res) => {
    try {
        const { error } = await supabase.from('facture_lignes').delete().eq('id', req.params.ligneId);
        if (error) throw error;

        await recalculateFactureTotals(req.params.id);

        req.flash('success', 'Ligne supprimée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// PUT /factures/:id/valider — valider la facture (brouillon → validee)
router.put('/:id/valider', async (req, res) => {
    try {
        const { error } = await supabase
            .from('factures')
            .update({ statut: 'validee' })
            .eq('id', req.params.id)
            .eq('statut', 'brouillon');  // sécurité : uniquement depuis brouillon

        if (error) throw error;

        await logAudit({
            req,
            action: 'FACTURE_VALIDEE',
            entite: 'facture',
            entite_id: req.params.id,
            description: `Validation de la facture ID ${req.params.id}`
        });

        req.flash('success', 'Facture validée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur de validation');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// PUT /factures/:id/brouillon — Repasser en brouillon (ADMIN UNIQUEMENT, si aucun paiement enregistré)
router.put('/:id/brouillon', async (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Action réservée aux administrateurs');
            return res.redirect(`/factures/${req.params.id}`);
        }

        const { data: facture, error: errGet } = await supabase
            .from('factures')
            .select('numero_facture, montant_paye, statut')
            .eq('id', req.params.id)
            .single();

        if (errGet || !facture) {
            req.flash('error', 'Facture introuvable');
            return res.redirect('/factures');
        }

        if (parseFloat(facture.montant_paye || 0) > 0) {
            req.flash('error', 'Impossible de repasser en brouillon une facture ayant des paiements enregistrés');
            return res.redirect(`/factures/${req.params.id}`);
        }

        const { error } = await supabase
            .from('factures')
            .update({ statut: 'brouillon' })
            .eq('id', req.params.id);

        if (error) throw error;

        await logAudit({
            req,
            action: 'FACTURE_RETOUR_BROUILLON',
            entite: 'facture',
            entite_id: req.params.id,
            description: `Facture N° ${facture.numero_facture || req.params.id} repassée en brouillon par l'administrateur`
        });

        req.flash('success', 'Facture repassée en brouillon avec succès');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error('Erreur repassage brouillon:', error);
        req.flash('error', 'Erreur lors du changement de statut');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// PUT /factures/:id/marquer-payee — Marquer la facture comme payée (ADMIN UNIQUEMENT)
router.put('/:id/marquer-payee', async (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Action réservée aux administrateurs');
            return res.redirect(`/factures/${req.params.id}`);
        }

        const { mode_paiement, reference } = req.body;

        const { data: facture, error: errGet } = await supabase
            .from('factures')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (errGet || !facture) {
            req.flash('error', 'Facture introuvable');
            return res.redirect('/factures');
        }

        if (facture.statut === 'payee') {
            req.flash('error', 'Cette facture est déjà payée');
            return res.redirect(`/factures/${req.params.id}`);
        }

        const reste = parseFloat(facture.reste_a_payer !== undefined ? facture.reste_a_payer : (facture.total_net - (facture.montant_paye || 0)));

        if (reste > 0) {
            // Créer le paiement pour solder la facture
            const { error: errPaiement } = await supabase
                .from('paiements')
                .insert([{
                    facture_id: req.params.id,
                    montant: reste,
                    mode_paiement: mode_paiement || 'especes',
                    reference: reference || 'Régularisation Admin',
                    date_paiement: new Date()
                }]);

            if (errPaiement) {
                console.error('Erreur insertion paiement régularisation:', errPaiement);
            }
        }

        // Mettre à jour la facture au statut "payee" avec montant_paye = total_net et reste_a_payer = 0
        const totalNet = parseFloat(facture.total_net || 0);
        const { error: errUpdate } = await supabase
            .from('factures')
            .update({
                statut: 'payee',
                montant_paye: totalNet,
                reste_a_payer: 0
            })
            .eq('id', req.params.id);

        if (errUpdate) throw errUpdate;

        await logAudit({
            req,
            action: 'FACTURE_SOLDEE_ADMIN',
            entite: 'facture',
            entite_id: req.params.id,
            description: `Facture N° ${facture.numero_facture || req.params.id} marquée comme PAYÉE par l'administrateur (${reste} FCFA soldés)`,
            details: { mode_paiement, reference, solde_regle: reste }
        });

        req.flash('success', 'Facture marquée comme PAYÉE avec succès');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error('Erreur marquer payee:', error);
        req.flash('error', 'Erreur lors de la validation du paiement');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// POST ou DELETE /factures/:id/annuler — Annuler la facture (ADMIN UNIQUEMENT)
router.post('/:id/annuler', async (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
            req.flash('error', 'Seul l\'administrateur est autorisé à annuler une facture');
            return res.redirect(`/factures/${req.params.id}`);
        }

        const { motif } = req.body;

        const { data: facture } = await supabase
            .from('factures')
            .select('numero_facture')
            .eq('id', req.params.id)
            .single();

        const { error } = await supabase
            .from('factures')
            .update({ 
                statut: 'annulee',
                reste_a_payer: 0
            })
            .eq('id', req.params.id);

        if (error) throw error;

        await logAudit({
            req,
            action: 'FACTURE_ANNULATION',
            entite: 'facture',
            entite_id: req.params.id,
            description: `Annulation de la facture N° ${facture ? facture.numero_facture : req.params.id}. Motif: ${motif || 'Non précisé'}`,
            details: { motif }
        });

        req.flash('success', 'Facture annulée avec succès');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'annulation');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// DELETE /factures/:id — annuler la facture
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('factures')
            .update({ 
                statut: 'annulee',
                reste_a_payer: 0 
            })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Facture annulée');
        res.redirect('/factures');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de l\'annulation');
        res.redirect(`/factures/${req.params.id}`);
    }
});

module.exports = router;
