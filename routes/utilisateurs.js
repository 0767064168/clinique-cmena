const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase, supabaseAdmin } = require('../config/supabase');

// Middleware vérifiant que l'utilisateur connecté est administrateur
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Accès réservé aux administrateurs');
    return res.redirect('/dashboard');
};

// Appliquer la vérification admin à toutes les routes utilisateurs
router.use(requireAdmin);

// GET /utilisateurs — Liste de tous les utilisateurs
router.get('/', async (req, res) => {
    try {
        const { search, role, actif } = req.query;
        let query = supabase.from('utilisateurs').select('*');

        if (role) query = query.eq('role', role);
        if (actif !== undefined && actif !== '') query = query.eq('actif', actif === 'true');

        const { data: utilisateurs, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        let filtered = utilisateurs || [];
        if (search) {
            const s = search.toLowerCase();
            filtered = filtered.filter(u => 
                (u.nom && u.nom.toLowerCase().includes(s)) ||
                (u.prenom && u.prenom.toLowerCase().includes(s)) ||
                (u.email && u.email.toLowerCase().includes(s))
            );
        }

        res.render('utilisateurs/index', {
            title: 'Gestion des Utilisateurs',
            utilisateurs: filtered,
            query: req.query
        });
    } catch (error) {
        console.error('Erreur liste utilisateurs:', error);
        req.flash('error', 'Erreur lors du chargement des utilisateurs');
        res.redirect('/dashboard');
    }
});

// GET /utilisateurs/create — Formulaire de création
router.get('/create', (req, res) => {
    res.render('utilisateurs/create', {
        title: 'Nouvel Utilisateur'
    });
});

// POST /utilisateurs — Création d'un nouvel utilisateur (Supabase Auth + table utilisateurs)
router.post('/', async (req, res) => {
    try {
        let { nom, prenom, email, password, role, actif } = req.body;
        nom = (nom || '').trim().toUpperCase();
        prenom = (prenom || '').trim();
        email = (email || '').trim().toLowerCase();

        // Si l'administrateur entre un identifiant sans '@' (ex: "koffi"), lui attribuer @gspm.ci
        if (email && !email.includes('@')) {
            email = `${email}@gspm.ci`;
        }

        if (!password || password.length < 6) {
            req.flash('error', 'Le mot de passe doit contenir au moins 6 caractères');
            return res.redirect('/utilisateurs/create');
        }

        // 1. Création du compte dans Supabase Auth via supabaseAdmin
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { nom, prenom, role }
        });

        if (authError) {
            console.error('Auth error:', authError);
            req.flash('error', `Erreur création compte: ${authError.message}`);
            return res.redirect('/utilisateurs/create');
        }

        const userId = authData.user.id;

        // 2. Hash du mot de passe pour la table utilisateurs
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Insertion dans la table `utilisateurs`
        const isActif = actif === 'true' || actif === 'on' || actif === true;
        const { error: userError } = await supabaseAdmin
            .from('utilisateurs')
            .upsert([{
                id: userId,
                nom,
                prenom,
                email,
                mot_de_passe: hashedPassword,
                role: role || 'receptionniste',
                actif: isActif
            }]);

        if (userError) {
            console.error('User table error:', userError);
            req.flash('error', `Utilisateur Auth créé, mais erreur table: ${userError.message}`);
            return res.redirect('/utilisateurs');
        }

        req.flash('success', `L'utilisateur ${prenom} ${nom} (${email}) a été créé avec succès`);
        res.redirect('/utilisateurs');
    } catch (error) {
        console.error('Exception création utilisateur:', error);
        req.flash('error', error.message || 'Erreur lors de la création de l\'utilisateur');
        res.redirect('/utilisateurs/create');
    }
});

// GET /utilisateurs/:id/edit — Formulaire d'édition
router.get('/:id/edit', async (req, res) => {
    try {
        const { data: utilisateur, error } = await supabase
            .from('utilisateurs')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !utilisateur) {
            req.flash('error', 'Utilisateur introuvable');
            return res.redirect('/utilisateurs');
        }

        res.render('utilisateurs/edit', {
            title: `Modifier Utilisateur — ${utilisateur.nom} ${utilisateur.prenom}`,
            utilisateur
        });
    } catch (error) {
        console.error('Erreur edit utilisateur:', error);
        res.redirect('/utilisateurs');
    }
});

// PUT /utilisateurs/:id — Mise à jour
router.put('/:id', async (req, res) => {
    try {
        let { nom, prenom, role, actif, password } = req.body;
        nom = (nom || '').trim().toUpperCase();
        prenom = (prenom || '').trim();
        const isActif = actif === 'true' || actif === 'on' || actif === true;

        const updateData = {
            nom,
            prenom,
            role: role || 'receptionniste',
            actif: isActif,
            updated_at: new Date()
        };

        // Si modification du mot de passe demandée
        if (password && password.trim().length >= 6) {
            const hashedPassword = await bcrypt.hash(password.trim(), 10);
            updateData.mot_de_passe = hashedPassword;

            // Mise à jour également dans Supabase Auth
            await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
                password: password.trim()
            });
        }

        const { error } = await supabase
            .from('utilisateurs')
            .update(updateData)
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', `Informations de ${prenom} ${nom} mises à jour avec succès`);
        res.redirect('/utilisateurs');
    } catch (error) {
        console.error('Erreur mise à jour utilisateur:', error);
        req.flash('error', 'Erreur lors de la mise à jour');
        res.redirect(`/utilisateurs/${req.params.id}/edit`);
    }
});

// POST /utilisateurs/:id/toggle-actif — Activer/Désactiver un compte en un clic
router.post('/:id/toggle-actif', async (req, res) => {
    try {
        // Empêcher l'auto-désactivation
        if (req.session.user && req.session.user.id === req.params.id) {
            req.flash('error', 'Vous ne pouvez pas désactiver votre propre compte');
            return res.redirect('/utilisateurs');
        }

        const { data: user } = await supabase
            .from('utilisateurs')
            .select('actif, nom, prenom')
            .eq('id', req.params.id)
            .single();

        if (user) {
            const newStatus = !user.actif;
            await supabase
                .from('utilisateurs')
                .update({ actif: newStatus })
                .eq('id', req.params.id);

            req.flash('success', `Compte de ${user.prenom} ${user.nom} ${newStatus ? 'activé' : 'désactivé'}`);
        }
        res.redirect('/utilisateurs');
    } catch (error) {
        console.error('Erreur toggle actif:', error);
        res.redirect('/utilisateurs');
    }
});

// DELETE /utilisateurs/:id — Suppression d'un utilisateur
router.delete('/:id', async (req, res) => {
    try {
        // Empêcher l'auto-suppression
        if (req.session.user && req.session.user.id === req.params.id) {
            req.flash('error', 'Vous ne pouvez pas supprimer votre propre compte');
            return res.redirect('/utilisateurs');
        }

        // Supprimer de la table utilisateurs
        await supabase.from('utilisateurs').delete().eq('id', req.params.id);
        
        // Supprimer de Supabase Auth
        await supabaseAdmin.auth.admin.deleteUser(req.params.id);

        req.flash('success', 'Utilisateur supprimé avec succès');
        res.redirect('/utilisateurs');
    } catch (error) {
        console.error('Erreur suppression utilisateur:', error);
        req.flash('error', 'Erreur lors de la suppression');
        res.redirect('/utilisateurs');
    }
});

module.exports = router;
