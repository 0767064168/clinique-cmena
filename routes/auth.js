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
        const { email, password } = req.body;
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        if (data.session) {
            req.session.user = {
                id: data.user.id,
                email: data.user.email
            };
            req.flash('success', 'Connexion réussie');
            return res.redirect('/dashboard');
        } else {
            req.flash('error', 'Identifiants invalides');
            res.redirect('/auth/login');
        }
    } catch (error) {
        console.error(error);
        req.flash('error', error.message || 'Erreur de connexion');
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
