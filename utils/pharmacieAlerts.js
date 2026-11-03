/**
 * Utilitaire de cache pour les alertes de stock et péremption de la pharmacie
 * CMENA - GSPM
 */
const { supabase } = require('../config/supabase');

let cache = {
    timestamp: 0,
    data: {
        totalAlertes: 0,
        enAlerte: 0,
        enRupture: 0,
        perimes: 0,
        expire30j: 0
    }
};

const CACHE_TTL_MS = 60 * 1000; // 60 secondes

async function getPharmacieAlerts() {
    const now = Date.now();
    if (now - cache.timestamp < CACHE_TTL_MS) {
        return cache.data;
    }

    try {
        const { data: produits, error } = await supabase
            .from('produits_pharmacie')
            .select('id, stock_actuel, stock_minimum, date_peremption')
            .eq('actif', true);

        if (error || !produits) return cache.data;

        const today = new Date().toISOString().slice(0, 10);
        const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        let enAlerte = 0;
        let enRupture = 0;
        let perimes = 0;
        let expire30j = 0;

        produits.forEach(p => {
            const stock = Number(p.stock_actuel || 0);
            const min = Number(p.stock_minimum || 0);

            if (stock <= 0) {
                enRupture++;
                enAlerte++;
            } else if (stock <= min) {
                enAlerte++;
            }

            if (p.date_peremption) {
                if (p.date_peremption < today) {
                    perimes++;
                } else if (p.date_peremption <= in30Days) {
                    expire30j++;
                }
            }
        });

        const totalAlertes = enAlerte + perimes + expire30j;

        cache = {
            timestamp: now,
            data: {
                totalAlertes,
                enAlerte,
                enRupture,
                perimes,
                expire30j
            }
        };

        return cache.data;
    } catch (err) {
        console.error('Erreur getPharmacieAlerts:', err.message);
        return cache.data;
    }
}

module.exports = { getPharmacieAlerts };
