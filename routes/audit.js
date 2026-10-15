const express = require('express');
const router = express.Router();
const { supabase, supabaseAdmin } = require('../config/supabase');
const { requireAdmin } = require('../middleware/auth');

const client = supabaseAdmin || supabase;

// GET /audit — Consultation du Journal d'Audit & Traçabilité (ADMIN UNIQUEMENT)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
        const date_from = typeof req.query.date_from === 'string' ? req.query.date_from : '';
        const date_to = typeof req.query.date_to === 'string' ? req.query.date_to : '';
        const search = typeof req.query.search === 'string'
            ? req.query.search.trim().replace(/[^a-zA-Z0-9À-ÿ\s_-]/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        const pageValue = Number.parseInt(req.query.page, 10);
        const requestedPage = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 1000000 ? pageValue : 1;
        const pageSize = 25;

        const buildQuery = () => {
            let query = client.from('journal_activites').select('*', { count: 'exact' });
            if (action) query = query.eq('action', action);
            if (date_from) query = query.gte('created_at', `${date_from}T00:00:00.000Z`);
            if (date_to) query = query.lte('created_at', `${date_to}T23:59:59.999Z`);
            if (search) query = query.or(`description.ilike.%${search}%,utilisateur_nom.ilike.%${search}%`);
            return query;
        };
        const fetchPage = page => buildQuery()
            .order('created_at', { ascending: false })
            .range((page - 1) * pageSize, page * pageSize - 1);

        let currentPage = requestedPage;
        let { data: logs, count, error } = await fetchPage(currentPage);
        let totalCount = 0;
        let totalPages = 0;
        if (!error) {
            totalCount = count || 0;
            totalPages = Math.ceil(totalCount / pageSize);
            currentPage = totalPages ? Math.min(currentPage, totalPages) : 1;
            if (currentPage !== requestedPage) {
                ({ data: logs, error } = await fetchPage(currentPage));
            }
        }

        res.render('audit/index', {
            title: 'Journal d\'Audit & Traçabilité',
            currentPath: '/audit',
            logs: logs || [],
            filters: { action, date_from, date_to, search },
            hasTableError: !!error,
            currentPage,
            totalPages,
            totalCount,
            pageSize,
            baseUrl: '/audit',
            paginationFilters: { action, date_from, date_to, search }
        });
    } catch (err) {
        console.error('Erreur audit:', err);
        req.flash('error', 'Erreur lors du chargement du journal d\'audit');
        res.redirect('/dashboard');
    }
});

module.exports = router;
