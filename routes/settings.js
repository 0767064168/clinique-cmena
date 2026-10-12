const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

// GET /settings — Affichage des paramètres de l'établissement
router.get('/', async (req, res) => {
    try {
        const { data: parametres, error } = await supabase
            .from('parametres_clinique')
            .select('*')
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Erreur get parametres:', error);
        }

        res.render('settings/index', {
            title: 'Paramètres de l\'Établissement',
            settings: parametres || {
                nom_clinique: 'CSA 3e COMPAGNIE GSPM BOUAKE',
                adresse: 'Bouaké, Quartier Commerce / Camp GSPM',
                bp: 'BP 125 Bouaké',
                telephone: '+225 07 00 00 00 00',
                email: 'contact@gspm.ci',
                ville: 'Bouaké',
                pays: 'Côte d\'Ivoire',
                devise: 'FCFA'
            }
        });
    } catch (error) {
        console.error('Erreur route settings:', error);
        req.flash('error', 'Erreur lors du chargement des paramètres');
        res.redirect('/dashboard');
    }
});

// POST /settings — Mise à jour des paramètres
router.post('/', async (req, res) => {
    try {
        const { nom_clinique, adresse, bp, telephone, mobile, email, ville, pays, devise } = req.body;

        const { data: existing } = await supabase
            .from('parametres_clinique')
            .select('id')
            .limit(1);

        let error;
        if (existing && existing.length > 0) {
            const resUpdate = await supabase
                .from('parametres_clinique')
                .update({
                    nom_clinique,
                    adresse,
                    bp,
                    telephone,
                    mobile,
                    email,
                    ville,
                    pays,
                    devise: devise || 'FCFA'
                })
                .eq('id', existing[0].id);
            error = resUpdate.error;
        } else {
            const resInsert = await supabase
                .from('parametres_clinique')
                .insert([{
                    nom_clinique,
                    adresse,
                    bp,
                    telephone,
                    mobile,
                    email,
                    ville,
                    pays,
                    devise: devise || 'FCFA'
                }]);
            error = resInsert.error;
        }

        if (error) throw error;

        req.flash('success', 'Paramètres de l\'établissement enregistrés avec succès');
        res.redirect('/settings');
    } catch (error) {
        console.error('Erreur save settings:', error);
        req.flash('error', 'Erreur lors de l\'enregistrement des paramètres');
        res.redirect('/settings');
    }
});

module.exports = router;
