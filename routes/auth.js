const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/login', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('auth/login', { layout: false });
});

router.post('/login', async (req, res) => {
    try {
        let { email, password } = req.body;
        email = (email || '').trim();

        // Si l'utilisateur saisit un identifiant sans '@' (ex: 'admin' ou 'ADMIN'), convertir automatiquement
        if (email && !email.includes('@')) {
            email = `${email.toLowerCase()}@gspm.ci`;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            req.flash('error', 'Identifiant ou mot de passe incorrect');
            return res.redirect('/auth/login');
        }

        if (data.session && data.user) {
            // Récupérer les informations du profil utilisateur
            const { data: profil } = await supabase
                .from('utilisateurs')
                .select('nom, prenom, role')
                .eq('id', data.user.id)
                .single();

            req.session.user = {
                id: data.user.id,
                email: data.user.email,
                nom: profil ? profil.nom : 'Utilisateur',
                prenom: profil ? profil.prenom : 'GSPM',
                role: profil ? profil.role : 'agent'
            };

            const returnTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;

            req.flash('success', `Bienvenue ${req.session.user.prenom} ${req.session.user.nom}`);
            return res.redirect(returnTo);
        } else {
            req.flash('error', 'Identifiants invalides');
            return res.redirect('/auth/login');
        }
    } catch (error) {
        console.error('Erreur login:', error);
        req.flash('error', 'Erreur de connexion. Veuillez réessayer.');
        res.redirect('/auth/login');
    }
});

const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');

router.get('/logout', async (req, res) => {
    try {
        await supabase.auth.signOut();
        req.session.destroy();
        res.redirect('/auth/login');
    } catch (error) {
        console.error(error);
        res.redirect('/dashboard');
    }
});

// GET /profile — Fiche personnelle de l'agent connecté
router.get('/profile', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/login');
        }

        const { data: utilisateur, error } = await supabase
            .from('utilisateurs')
            .select('*')
            .eq('id', req.session.user.id)
            .single();

        res.render('auth/profile', {
            title: 'Mon Profil',
            user: utilisateur || req.session.user
        });
    } catch (error) {
        console.error('Erreur profile:', error);
        res.redirect('/dashboard');
    }
});

// POST /profile/password — Modification de son propre mot de passe
router.post('/profile/password', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.redirect('/auth/login');
        }

        const { current_password, new_password, confirm_password } = req.body;

        if (!new_password || new_password.length < 6) {
            req.flash('error', 'Le nouveau mot de passe doit comporter au moins 6 caractères');
            return res.redirect('/profile');
        }

        if (new_password !== confirm_password) {
            req.flash('error', 'Les deux mots de passe ne correspondent pas');
            return res.redirect('/profile');
        }

        // Vérification de l'ancien mot de passe via Supabase Auth
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: req.session.user.email,
            password: current_password
        });

        if (signInError) {
            req.flash('error', 'Mot de passe actuel incorrect');
            return res.redirect('/profile');
        }

        // 1. Mettre à jour dans Supabase Auth
        await supabaseAdmin.auth.admin.updateUserById(req.session.user.id, {
            password: new_password
        });

        // 2. Mettre à jour dans la table utilisateurs
        const hashedPassword = await bcrypt.hash(new_password, 10);
        await supabase
            .from('utilisateurs')
            .update({ mot_de_passe: hashedPassword, updated_at: new Date() })
            .eq('id', req.session.user.id);

        req.flash('success', 'Votre mot de passe a été modifié avec succès');
        res.redirect('/profile');
    } catch (error) {
        console.error('Erreur changement mot de passe:', error);
        req.flash('error', 'Erreur lors du changement de mot de passe');
        res.redirect('/profile');
    }
});

module.exports = router;
