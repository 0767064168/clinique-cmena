/**
 * Utilitaire centralisé de gestion des alertes & notifications de la clinique
 * CSA 3e COMPAGNIE GSPM BOUAKÉ — Clinique CMENA
 * 
 * Regroupe en temps réel avec cache court (45s) :
 * 1. Salle d'attente & consultations (attente prolongée > 30 min, consultations en cours)
 * 2. Pharmacie & stocks (ruptures, stock bas, périmés, péremption imminente)
 * 3. Facturation & créances (factures impayées, montants en souffrance)
 */

const { supabase } = require('../config/supabase');

let notificationsCache = {
    timestamp: 0,
    data: {
        totalCount: 0,
        criticalCount: 0,
        warningCount: 0,
        items: [],
        summary: {
            pharmacie: 0,
            attente: 0,
            facturation: 0
        }
    }
};

const CACHE_TTL_MS = 45 * 1000; // 45 secondes

async function getSystemNotifications() {
    const now = Date.now();
    if (now - notificationsCache.timestamp < CACHE_TTL_MS) {
        return notificationsCache.data;
    }

    const items = [];
    let criticalCount = 0;
    let warningCount = 0;
    const summary = {
        pharmacie: 0,
        attente: 0,
        facturation: 0
    };

    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfToday = `${todayStr}T00:00:00`;
    const in30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
        // -------------------------------------------------------------
        // 1. Alertes Pharmacie & Stocks
        // -------------------------------------------------------------
        const { data: produits } = await supabase
            .from('produits_pharmacie')
            .select('id, designation, code, stock_actuel, stock_minimum, date_peremption, unite')
            .eq('actif', true);

        if (produits && produits.length > 0) {
            let ruptures = [];
            let stockBas = [];
            let perimes = [];
            let exp30 = [];

            produits.forEach(p => {
                const stock = Number(p.stock_actuel || 0);
                const min = Number(p.stock_minimum || 0);

                if (stock <= 0) {
                    ruptures.push(p);
                } else if (stock <= min) {
                    stockBas.push(p);
                }

                if (p.date_peremption) {
                    if (p.date_peremption < todayStr) {
                        perimes.push(p);
                    } else if (p.date_peremption <= in30DaysStr) {
                        exp30.push(p);
                    }
                }
            });

            // Notification Rupture Totale
            if (ruptures.length > 0) {
                criticalCount++;
                summary.pharmacie++;
                const sample = ruptures.slice(0, 2).map(r => r.designation).join(', ');
                const extra = ruptures.length > 2 ? ` et ${ruptures.length - 2} autre(s)` : '';
                items.push({
                    id: 'pharma_rupture',
                    category: 'pharmacie',
                    level: 'critical',
                    title: `${ruptures.length} produit(s) en rupture totale`,
                    description: `Stock épuisé : ${sample}${extra}. Réapprovisionnement urgent requis.`,
                    actionLabel: 'Gérer les ruptures',
                    actionUrl: '/pharmacie?stock_alert=oui',
                    icon: 'fas fa-times-circle',
                    iconColor: 'text-red-600',
                    bgColor: 'bg-red-50/80',
                    borderColor: 'border-red-200',
                    badgeText: 'Critique',
                    badgeColor: 'bg-red-100 text-red-800'
                });
            }

            // Notification Médicaments Périmés
            if (perimes.length > 0) {
                criticalCount++;
                summary.pharmacie++;
                const sample = perimes.slice(0, 2).map(r => r.designation).join(', ');
                items.push({
                    id: 'pharma_perimes',
                    category: 'pharmacie',
                    level: 'critical',
                    title: `${perimes.length} médicament(s) périmé(s)`,
                    description: `Date dépassée pour : ${sample}. À retirer immédiatement du stock actif.`,
                    actionLabel: 'Retirer du stock',
                    actionUrl: '/pharmacie?delai_peremption=perime',
                    icon: 'fas fa-calendar-times',
                    iconColor: 'text-rose-600',
                    bgColor: 'bg-rose-50/80',
                    borderColor: 'border-rose-200',
                    badgeText: 'Périmé',
                    badgeColor: 'bg-rose-100 text-rose-800'
                });
            }

            // Notification Stock Bas / Alerte
            if (stockBas.length > 0) {
                warningCount++;
                summary.pharmacie++;
                const sample = stockBas.slice(0, 2).map(r => r.designation).join(', ');
                const extra = stockBas.length > 2 ? ` (+${stockBas.length - 2})` : '';
                items.push({
                    id: 'pharma_alerte',
                    category: 'pharmacie',
                    level: 'warning',
                    title: `${stockBas.length} produit(s) sous le seuil d'alerte`,
                    description: `Niveau faible : ${sample}${extra}. Prévoir une commande fournisseur.`,
                    actionLabel: 'Voir le stock bas',
                    actionUrl: '/pharmacie?stock_alert=oui',
                    icon: 'fas fa-exclamation-triangle',
                    iconColor: 'text-amber-600',
                    bgColor: 'bg-amber-50/80',
                    borderColor: 'border-amber-200',
                    badgeText: 'Stock bas',
                    badgeColor: 'bg-amber-100 text-amber-800'
                });
            }

            // Notification Péremption Imminente (≤ 30 jours)
            if (exp30.length > 0) {
                warningCount++;
                summary.pharmacie++;
                items.push({
                    id: 'pharma_exp30',
                    category: 'pharmacie',
                    level: 'warning',
                    title: `${exp30.length} produit(s) expirent dans ≤ 30 jours`,
                    description: 'Péremption imminente. Privilégier la délivrance de ces lots en priorité.',
                    actionLabel: 'Examiner les lots',
                    actionUrl: '/pharmacie?delai_peremption=30',
                    icon: 'fas fa-hourglass-half',
                    iconColor: 'text-orange-600',
                    bgColor: 'bg-orange-50/80',
                    borderColor: 'border-orange-200',
                    badgeText: '≤ 30 jours',
                    badgeColor: 'bg-orange-100 text-orange-800'
                });
            }
        }

        // -------------------------------------------------------------
        // 2. Alertes Salle d'Attente & Patients
        // -------------------------------------------------------------
        const { data: consultationsAttente } = await supabase
            .from('consultations')
            .select('id, date_entree, statut, diagnostic, patients(nom, prenom, numero_dossier)')
            .gte('date_entree', startOfToday)
            .neq('statut', 'annule');

        if (consultationsAttente && consultationsAttente.length > 0) {
            // Patients en attente sans diagnostic posé
            const enAttente = consultationsAttente.filter(c => c.statut === 'en_cours' && !c.diagnostic);
            
            // Attente prolongée (> 30 minutes)
            const maintenantMs = Date.now();
            const attenteLongue = enAttente.filter(c => {
                const entreeMs = new Date(c.date_entree).getTime();
                return (maintenantMs - entreeMs) > (30 * 60 * 1000);
            });

            if (attenteLongue.length > 0) {
                criticalCount++;
                summary.attente++;
                const premierAttente = attenteLongue[0];
                const nomPatient = premierAttente.patients ? `${premierAttente.patients.nom} ${premierAttente.patients.prenom}` : 'Patient';
                const minutesWait = Math.round((maintenantMs - new Date(premierAttente.date_entree).getTime()) / 60000);

                items.push({
                    id: 'attente_longue',
                    category: 'attente',
                    level: 'critical',
                    title: `${attenteLongue.length} patient(s) en attente prolongée (>30 min)`,
                    description: `Ex: ${nomPatient} attend depuis ${minutesWait} min. Prise en charge prioritaire requise.`,
                    actionLabel: "Ouvrir Salle d'Attente",
                    actionUrl: '/consultations/attente',
                    icon: 'fas fa-user-clock',
                    iconColor: 'text-purple-600',
                    bgColor: 'bg-purple-50/80',
                    borderColor: 'border-purple-200',
                    badgeText: 'Urgence Attente',
                    badgeColor: 'bg-purple-100 text-purple-800'
                });
            } else if (enAttente.length > 0) {
                warningCount++;
                summary.attente++;
                items.push({
                    id: 'attente_normale',
                    category: 'attente',
                    level: 'warning',
                    title: `${enAttente.length} patient(s) en salle d'attente`,
                    description: 'Patients enregistrés aujourd\'hui en cours d\'attente de consultation médicale.',
                    actionLabel: "Voir l'attente",
                    actionUrl: '/consultations/attente',
                    icon: 'fas fa-hospital-user',
                    iconColor: 'text-indigo-600',
                    bgColor: 'bg-indigo-50/80',
                    borderColor: 'border-indigo-200',
                    badgeText: "En attente",
                    badgeColor: 'bg-indigo-100 text-indigo-800'
                });
            }
        }

        // -------------------------------------------------------------
        // 3. Alertes Facturation & Créances en souffrance
        // -------------------------------------------------------------
        const { data: facturesImpayees } = await supabase
            .from('factures')
            .select('id, numero_facture, total_net, reste_a_payer, statut, date_facture, patients(nom, prenom)')
            .neq('statut', 'payee')
            .neq('statut', 'annulee')
            .neq('statut', 'brouillon');

        if (facturesImpayees && facturesImpayees.length > 0) {
            const totalDu = facturesImpayees.reduce((acc, f) => acc + (parseFloat(f.reste_a_payer) || 0), 0);
            
            if (facturesImpayees.length > 0 && totalDu > 0) {
                warningCount++;
                summary.facturation++;
                items.push({
                    id: 'factures_impayees',
                    category: 'facturation',
                    level: 'warning',
                    title: `${facturesImpayees.length} facture(s) en attente de règlement`,
                    description: `Total créances non recouvrées : ${Math.round(totalDu).toLocaleString('fr-FR')} FCFA. Relance des règlements recommandée.`,
                    actionLabel: 'Gérer les impayés',
                    actionUrl: '/factures',
                    icon: 'fas fa-file-invoice-dollar',
                    iconColor: 'text-blue-600',
                    bgColor: 'bg-blue-50/80',
                    borderColor: 'border-blue-200',
                    badgeText: 'Recouvrement',
                    badgeColor: 'bg-blue-100 text-blue-800'
                });
            }
        }

        const totalCount = items.length;

        notificationsCache = {
            timestamp: now,
            data: {
                totalCount,
                criticalCount,
                warningCount,
                items,
                summary,
                // Rétrocompatibilité avec pharmacieAlerts
                pharmacieAlerts: {
                    totalAlertes: summary.pharmacie,
                    enAlerte: items.filter(i => i.id === 'pharma_alerte' || i.id === 'pharma_rupture').length,
                    enRupture: items.filter(i => i.id === 'pharma_rupture').length,
                    perimes: items.filter(i => i.id === 'pharma_perimes').length,
                    expire30j: items.filter(i => i.id === 'pharma_exp30').length
                }
            }
        };

        return notificationsCache.data;
    } catch (err) {
        console.error('Erreur getSystemNotifications:', err.message);
        return notificationsCache.data;
    }
}

// Fonction de purge manuelle du cache (après action utilisateur)
function clearNotificationsCache() {
    notificationsCache.timestamp = 0;
}

module.exports = {
    getSystemNotifications,
    clearNotificationsCache
};
