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

module.exports = router;
