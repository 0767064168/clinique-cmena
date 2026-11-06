const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { getAllRendezVous } = require('../utils/rendezVousStorage');

// Toutes les actions globales de navigation
const ALL_ACTIONS = [
    { id: 'act-nouveau-patient', label: 'Nouveau Dossier Patient', desc: 'Enregistrer un nouveau patient', url: '/patients/nouveau', icon: 'fas fa-user-plus', color: 'blue', roles: ['admin', 'medecin', 'receptionniste'], keywords: ['patient', 'nouveau', 'creer', 'ajouter', 'dossier', 'fiche'] },
    { id: 'act-nouveau-rdv', label: 'Nouveau Rendez-vous', desc: 'Planifier une consultation dans l\'agenda', url: '/rendez-vous/nouveau', icon: 'fas fa-calendar-plus', color: 'indigo', roles: ['admin', 'medecin', 'receptionniste'], keywords: ['rendez-vous', 'rdv', 'agenda', 'planning', 'calendrier', 'creer', 'nouveau', 'planifier'] },
    { id: 'act-attente', label: 'Salle d\'Attente', desc: 'Gérer la file d\'attente des patients du jour', url: '/consultations/attente', icon: 'fas fa-hourglass-half', color: 'amber', roles: ['admin', 'medecin', 'receptionniste'], keywords: ['salle', 'attente', 'file', 'ordre', 'arrivee', 'patient'] },
    { id: 'act-nouvelle-consultation', label: 'Nouvelle Consultation', desc: 'Ouvrir un examen ou séjour médical', url: '/consultations/nouveau', icon: 'fas fa-stethoscope', color: 'purple', roles: ['admin', 'medecin', 'receptionniste'], keywords: ['consultation', 'examen', 'medecin', 'constantes', 'visite'] },
    { id: 'act-caisse', label: 'Caisse du Jour', desc: 'Bilan des règlements, espèces et clôture', url: '/caisse', icon: 'fas fa-cash-register', color: 'emerald', roles: ['admin', 'comptable'], keywords: ['caisse', 'argent', 'recette', 'depense', 'cloture', 'journaliere', 'especes', 'monnaie'] },
    { id: 'act-nouvelle-facture', label: 'Établir une Facture', desc: 'Créer une facture avec prise en charge', url: '/factures/nouveau', icon: 'fas fa-file-invoice', color: 'cyan', roles: ['admin', 'comptable'], keywords: ['facture', 'facturation', 'compte', 'tiers-payant', 'assurance', 'devis'] },
    { id: 'act-pharmacie', label: 'Pharmacie & Stock', desc: 'Inventaire, mouvements et alertes médicaments', url: '/pharmacie', icon: 'fas fa-pills', color: 'teal', roles: ['admin', 'pharmacien', 'medecin'], keywords: ['pharmacie', 'stock', 'medicament', 'peremption', 'rupture', 'approvisionnement'] },
    { id: 'act-actes', label: 'Tarifs & Actes Médicaux', desc: 'Catalogue officiel des prestations et prix', url: '/actes', icon: 'fas fa-file-medical-alt', color: 'sky', roles: ['admin', 'medecin', 'comptable'], keywords: ['acte', 'tarif', 'prestation', 'prix', 'catalogue'] },
    { id: 'act-assurances', label: 'Assurances & Mutuelles', desc: 'Gestion des organismes conventionnés', url: '/assurances', icon: 'fas fa-building', color: 'blue', roles: ['admin', 'comptable'], keywords: ['assurance', 'mutuelle', 'convention', 'taux', 'prise en charge'] },
    { id: 'act-rapports', label: 'Rapports & Statistiques', desc: 'Graphiques, pathologies et activité', url: '/rapports', icon: 'fas fa-chart-line', color: 'rose', roles: ['admin', 'medecin', 'comptable'], keywords: ['rapport', 'statistique', 'graphe', 'chiffre', 'bilan', 'pathologie'] },
    { id: 'act-audit', label: 'Journal d\'Audit', desc: 'Historique et traçabilité des opérations', url: '/audit', icon: 'fas fa-history', color: 'red', roles: ['admin'], keywords: ['audit', 'journal', 'tracabilite', 'securite', 'historique', 'connexion'] },
    { id: 'act-utilisateurs', label: 'Gestion des Utilisateurs', desc: 'Comptes, mots de passe et rôles RBAC', url: '/utilisateurs', icon: 'fas fa-user-shield', color: 'red', roles: ['admin'], keywords: ['utilisateur', 'compte', 'role', 'admin', 'droits', 'mot de passe'] },
    { id: 'act-settings', label: 'Paramètres du Centre', desc: 'Coordonnées CMENA, devise et entête', url: '/settings', icon: 'fas fa-cog', color: 'slate', roles: ['admin'], keywords: ['parametre', 'configuration', 'clinique', 'cmena', 'gspm', 'taux'] }
];

// GET /api/recherche-globale?q=...
router.get('/', async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        const userRole = (req.user && req.user.role) ? req.user.role : 'receptionniste';

        // Filtrer les actions accessibles selon le rôle
        const allowedActions = ALL_ACTIONS.filter(act => act.roles.includes(userRole));

        // Si la requête est vide ou très courte, renvoyer les suggestions d'actions rapides
        if (!query || query.length < 2) {
            return res.json({
                query,
                results: {
                    actions: allowedActions.slice(0, 6),
                    patients: [],
                    rendezVous: [],
                    pharmacie: [],
                    factures: [],
                    consultations: [],
                    praticiens: []
                },
                totalCount: Math.min(allowedActions.length, 6)
            });
        }

        const qLower = query.toLowerCase();
        const results = {
            actions: [],
            patients: [],
            rendezVous: [],
            pharmacie: [],
            factures: [],
            consultations: [],
            praticiens: []
        };

        // 1. Recherche dans les actions rapides
        results.actions = allowedActions.filter(act => {
            return act.label.toLowerCase().includes(qLower) ||
                   act.desc.toLowerCase().includes(qLower) ||
                   act.keywords.some(k => k.includes(qLower) || qLower.includes(k));
        }).slice(0, 4);

        // 2. Recherche Patients (Accessible: admin, medecin, receptionniste)
        if (['admin', 'medecin', 'receptionniste'].includes(userRole)) {
            try {
                let patQuery = supabase
                    .from('patients')
                    .select('id, numero_dossier, nom, prenom, matricule, telephone, date_naissance, sexe')
                    .or(`nom.ilike.%${query}%,prenom.ilike.%${query}%,matricule.ilike.%${query}%,telephone.ilike.%${query}%`)
                    .limit(5);

                const { data: pts } = await patQuery;
                if (pts) {
                    results.patients = pts.map(p => ({
                        id: p.id,
                        title: `${p.nom} ${p.prenom}`,
                        subtitle: `Dossier N° ${p.numero_dossier || '-'} • ${p.matricule ? 'Mat: ' + p.matricule : (p.telephone || 'Sans tél')}`,
                        badge: p.sexe === 'F' ? 'Femme' : 'Homme',
                        badgeColor: p.sexe === 'F' ? 'pink' : 'blue',
                        url: `/patients/${p.id}`,
                        icon: 'fas fa-user'
                    }));
                }
            } catch (errPat) {
                console.error('Erreur recherche patients:', errPat.message);
            }
        }

        // 3. Recherche Rendez-vous (Accessible: admin, medecin, receptionniste)
        if (['admin', 'medecin', 'receptionniste'].includes(userRole)) {
            try {
                const rdvs = await getAllRendezVous({ search: query });
                if (rdvs && rdvs.length > 0) {
                    results.rendezVous = rdvs.slice(0, 4).map(r => {
                        const dateFormatted = new Date(r.date_heure).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        const patientNom = r.patients ? `${r.patients.nom} ${r.patients.prenom}` : 'Patient non défini';
                        return {
                            id: r.id,
                            title: `${patientNom} — ${r.motif}`,
                            subtitle: `${dateFormatted} • Dr. ${r.praticiens ? r.praticiens.nom : 'Non assigné'}`,
                            badge: r.statut,
                            badgeColor: r.statut === 'confirme' ? 'green' : (r.statut === 'en_attente' ? 'amber' : 'blue'),
                            url: `/rendez-vous#rdv-${r.id}`,
                            icon: 'fas fa-calendar-check'
                        };
                    });
                }
            } catch (errRdv) {
                console.error('Erreur recherche rendez-vous:', errRdv.message);
            }
        }

        // 4. Recherche Pharmacie & Médicaments (Accessible: admin, pharmacien, medecin)
        if (['admin', 'pharmacien', 'medecin'].includes(userRole)) {
            try {
                const { data: prods } = await supabase
                    .from('produits_pharmacie')
                    .select('id, code, designation, categorie, forme, stock_actuel, stock_minimum, prix_vente')
                    .or(`designation.ilike.%${query}%,code.ilike.%${query}%,forme.ilike.%${query}%`)
                    .eq('actif', true)
                    .limit(5);

                if (prods) {
                    results.pharmacie = prods.map(p => {
                        const isAlerte = p.stock_actuel <= p.stock_minimum;
                        return {
                            id: p.id,
                            title: p.designation,
                            subtitle: `${p.code ? '[' + p.code + '] ' : ''}${p.forme || p.categorie} • Stock: ${p.stock_actuel} • ${p.prix_vente ? Number(p.prix_vente).toLocaleString('fr-FR') + ' F' : '-'}`,
                            badge: isAlerte ? (p.stock_actuel <= 0 ? 'Rupture' : 'Stock bas') : 'En stock',
                            badgeColor: isAlerte ? 'red' : 'green',
                            url: `/pharmacie/${p.id}`,
                            icon: 'fas fa-pills'
                        };
                    });
                }
            } catch (errPharm) {
                console.error('Erreur recherche pharmacie:', errPharm.message);
            }
        }

        // 5. Recherche Factures (Accessible: admin, comptable)
        if (['admin', 'comptable'].includes(userRole)) {
            try {
                let factQuery = supabase
                    .from('factures')
                    .select('id, numero_facture, total_net, statut, date_facture, patients(nom, prenom)')
                    .limit(5);

                const numMatch = query.match(/\d+/);
                if (numMatch) {
                    factQuery = factQuery.eq('numero_facture', parseInt(numMatch[0], 10));
                }

                const { data: facts } = await factQuery;
                if (facts) {
                    results.factures = facts.map(f => {
                        const patientNom = f.patients ? `${f.patients.nom} ${f.patients.prenom}` : '-';
                        return {
                            id: f.id,
                            title: `Facture N° ${f.numero_facture} — ${patientNom}`,
                            subtitle: `Total: ${Number(f.total_net || 0).toLocaleString('fr-FR')} FCFA • Date: ${new Date(f.date_facture).toLocaleDateString('fr-FR')}`,
                            badge: f.statut === 'payee' ? 'Payée' : (f.statut === 'partiellement_payee' ? 'Partielle' : f.statut),
                            badgeColor: f.statut === 'payee' ? 'green' : (f.statut === 'validee' ? 'amber' : 'gray'),
                            url: `/factures/${f.id}`,
                            icon: 'fas fa-file-invoice-dollar'
                        };
                    });
                }
            } catch (errFact) {
                console.error('Erreur recherche factures:', errFact.message);
            }
        }

        // 6. Recherche Consultations (Accessible: admin, medecin, receptionniste)
        if (['admin', 'medecin', 'receptionniste'].includes(userRole)) {
            try {
                const { data: consults } = await supabase
                    .from('consultations')
                    .select('id, date_entree, motif, diagnostic, statut, patients(nom, prenom)')
                    .or(`motif.ilike.%${query}%,diagnostic.ilike.%${query}%`)
                    .order('date_entree', { ascending: false })
                    .limit(4);

                if (consults) {
                    results.consultations = consults.map(c => {
                        const patientNom = c.patients ? `${c.patients.nom} ${c.patients.prenom}` : '-';
                        return {
                            id: c.id,
                            title: `Consultation: ${patientNom}`,
                            subtitle: `${c.motif || 'Sans motif'} • ${new Date(c.date_entree).toLocaleDateString('fr-FR')}`,
                            badge: c.statut,
                            badgeColor: c.statut === 'termine' ? 'green' : 'amber',
                            url: `/consultations/${c.id}`,
                            icon: 'fas fa-stethoscope'
                        };
                    });
                }
            } catch (errCons) {
                console.error('Erreur recherche consultations:', errCons.message);
            }
        }

        // 7. Recherche Praticiens (Accessible: admin, medecin, receptionniste)
        if (['admin', 'medecin', 'receptionniste'].includes(userRole)) {
            try {
                const { data: prats } = await supabase
                    .from('praticiens')
                    .select('id, nom, prenom, specialite, telephone')
                    .or(`nom.ilike.%${query}%,prenom.ilike.%${query}%,specialite.ilike.%${query}%`)
                    .limit(3);

                if (prats) {
                    results.praticiens = prats.map(pr => ({
                        id: pr.id,
                        title: `Dr. ${pr.nom} ${pr.prenom}`,
                        subtitle: `${pr.specialite || 'Médecine Générale'} • ${pr.telephone || 'Sans tél'}`,
                        badge: 'Praticien',
                        badgeColor: 'cyan',
                        url: `/praticiens`,
                        icon: 'fas fa-user-md'
                    }));
                }
            } catch (errPrat) {
                console.error('Erreur recherche praticiens:', errPrat.message);
            }
        }

        const totalCount = results.actions.length +
                           results.patients.length +
                           results.rendezVous.length +
                           results.pharmacie.length +
                           results.factures.length +
                           results.consultations.length +
                           results.praticiens.length;

        res.json({
            query,
            results,
            totalCount
        });
    } catch (error) {
        console.error('Erreur endpoint recherche globale:', error);
        res.status(500).json({ error: 'Erreur recherche globale', details: error.message });
    }
});

module.exports = router;
