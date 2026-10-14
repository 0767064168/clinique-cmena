const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { requireAdmin } = require('../middleware/auth');

const client = supabaseAdmin || supabase;

// GET /audit — Consultation du Journal d'Audit & Traçabilité (ADMIN UNIQUEMENT)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const { action, date_from, date_to, search } = req.query;

        let query = client
            .from('journal_activites')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (action) {
            query = query.eq('action', action);
        }
        if (date_from) {
            query = query.gte('created_at', `${date_from}T00:00:00.000Z`);
        }
        if (date_to) {
            query = query.lte('created_at', `${date_to}T23:59:59.999Z`);
        }
        if (search) {
            query = query.or(`description.ilike.%${search}%,utilisateur_nom.ilike.%${search}%`);
        }

        const { data: logs, error } = await query;

        res.render('audit/index', {
            title: 'Journal d\'Audit & Traçabilité',
            currentPath: '/audit',
            logs: logs || [],
            filters: { action, date_from, date_to, search },
            hasTableError: !!error
        });
    } catch (err) {
        console.error('Erreur audit:', err);
        req.flash('error', 'Erreur lors du chargement du journal d\'audit');
        res.redirect('/dashboard');
    }
});

module.exports = router;
