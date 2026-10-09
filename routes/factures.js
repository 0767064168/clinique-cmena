const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /factures — liste
router.get('/', async (req, res) => {
    try {
        const { statut, date_from, date_to, search } = req.query;
        let query = supabase.from('factures').select('*, patients!inner(nom, prenom, matricule)');

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
                .select('*, patients(nom, prenom, matricule)')
                .eq('id', consultation_id)
                .single();
            selectedConsultation = data;
        }

        // Consultations terminées sans facture (ou toutes si pas de filtre)
        const { data: consultations } = await supabase
            .from('consultations')
            .select('*, patients(nom, prenom, matricule)')
            .eq('statut', 'termine')
            .order('date_entree', { ascending: false })
            .limit(50);

        // Patients actifs
        const { data: patients } = await supabase
            .from('patients')
            .select('id, nom, prenom, matricule')
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
        const { data: facture, error: errFacture } = await supabase
            .from('factures')
            .insert([{
                patient_id,
                consultation_id: consultation_id || null,
                date_facture: new Date(),
                remise: remiseVal,
                statut
            }])
            .select()
            .single();

        if (errFacture) throw errFacture;

        // Traiter les lignes si présentes
        if (libelle && Array.isArray(libelle)) {
            let total = 0;
            const lignes = libelle.map((l, index) => {
                const pu = parseFloat(prix_unitaire[index] || 0);
                const qte = parseInt(quantite[index] || 1);
                const pct = parseFloat(pourcentage[index] || 100);
                const montant = pu * qte * (pct / 100);
                total += montant;

                return {
                    facture_id: facture.id,
                    acte_id: (acte_id && acte_id[index]) ? acte_id[index] : null,
                    libelle: l,
                    nom_praticien: (nom_praticien && nom_praticien[index]) ? nom_praticien[index] : null,
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
            .select('*, patients(*), consultations(id, date_entree, motif)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

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
            .select('*, patients(*), consultations(id, date_entree, motif)')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

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
            clinique: params || {}
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

        req.flash('success', 'Facture validée');
        res.redirect(`/factures/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur de validation');
        res.redirect(`/factures/${req.params.id}`);
    }
});

// DELETE /factures/:id — annuler la facture
router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('factures')
            .update({ statut: 'annulee' })
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
