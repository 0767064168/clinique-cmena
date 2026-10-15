const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res) => {
    try {
        const search = typeof req.query.search === 'string'
            ? req.query.search.trim().replace(/[^a-zA-Z0-9À-ÿ\s-]/g, ' ').replace(/\s+/g, ' ').trim()
            : '';
        const pageValue = Number.parseInt(req.query.page, 10);
        const requestedPage = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 1000000 ? pageValue : 1;
        const pageSize = 25;

        const buildQuery = () => {
            let query = supabase.from('praticiens').select('*', { count: 'exact' }).eq('actif', true);
            if (search) {
                query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,specialite.ilike.%${search}%`);
            }
            return query;
        };
        const fetchPage = page => buildQuery()
            .order('nom')
            .range((page - 1) * pageSize, page * pageSize - 1);

        let currentPage = requestedPage;
        let { data: praticiens, count, error } = await fetchPage(currentPage);
        if (error) throw error;

        const totalCount = count || 0;
        const totalPages = Math.ceil(totalCount / pageSize);
        currentPage = totalPages ? Math.min(currentPage, totalPages) : 1;
        if (currentPage !== requestedPage) {
            ({ data: praticiens, error } = await fetchPage(currentPage));
            if (error) throw error;
        }

        res.render('praticiens/index', {
            title: 'Liste des Praticiens',
            praticiens: praticiens || [],
            search,
            currentPage,
            totalPages,
            totalCount,
            pageSize,
            baseUrl: '/praticiens',
            paginationFilters: { search }
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la récupération des praticiens');
        res.redirect('/dashboard');
    }
});

router.get('/create', (req, res) => {
    res.render('praticiens/create', { title: 'Nouveau Praticien' });
});

router.get('/nouveau', (req, res) => res.redirect('/praticiens/create'));

router.post('/', async (req, res) => {
    try {
        const { nom, prenom, matricule, specialite, specialite_autre, telephone, email } = req.body;
        const finalSpecialite = (specialite === 'Autre' && specialite_autre && specialite_autre.trim()) 
            ? specialite_autre.trim() 
            : specialite;
        
        const { error } = await supabase
            .from('praticiens')
            .insert([{ nom, prenom, matricule, specialite: finalSpecialite, telephone, email }]);

        if (error) throw error;

        req.flash('success', 'Praticien créé avec succès');
        res.redirect('/praticiens');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la création du praticien');
        res.redirect('/praticiens/create');
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { data: praticien, error } = await supabase
            .from('praticiens')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        const { data: consultations } = await supabase
            .from('consultations')
            .select('*, patients(nom, prenom)')
            .eq('praticien_id', req.params.id)
            .order('date_entree', { ascending: false })
            .limit(50);

        res.render('praticiens/show', {
            title: 'Détails du Praticien',
            praticien,
            consultations: consultations || []
        });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Praticien introuvable');
        res.redirect('/praticiens');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const { data: praticien, error } = await supabase
            .from('praticiens')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        res.render('praticiens/edit', { title: 'Modifier Praticien', praticien });
    } catch (error) {
        console.error(error);
        req.flash('error', 'Praticien introuvable');
        res.redirect('/praticiens');
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { nom, prenom, matricule, specialite, specialite_autre, telephone, email } = req.body;
        const finalSpecialite = (specialite === 'Autre' && specialite_autre && specialite_autre.trim()) 
            ? specialite_autre.trim() 
            : specialite;
        
        const { error } = await supabase
            .from('praticiens')
            .update({ nom, prenom, matricule, specialite: finalSpecialite, telephone, email })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Praticien mis à jour avec succès');
        res.redirect(`/praticiens/${req.params.id}`);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la mise à jour du praticien');
        res.redirect(`/praticiens/${req.params.id}/edit`);
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('praticiens')
            .update({ actif: false })
            .eq('id', req.params.id);

        if (error) throw error;

        req.flash('success', 'Praticien supprimé avec succès');
        res.redirect('/praticiens');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erreur lors de la suppression du praticien');
        res.redirect('/praticiens');
    }
});

module.exports = router;
