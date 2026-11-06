const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const FILE_PATH = path.join(__dirname, '..', 'data', 'clotures_caisse.json');

function ensureDataFile() {
    if (!fs.existsSync(FILE_PATH)) {
        const dir = path.dirname(FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(FILE_PATH, '[]', 'utf8');
    }
}

function readAllFallback() {
    try {
        ensureDataFile();
        const content = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(content || '[]');
    } catch (err) {
        console.error('Erreur lecture clotures_caisse.json:', err);
        return [];
    }
}

function writeAllFallback(items) {
    try {
        ensureDataFile();
        fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Erreur écriture clotures_caisse.json:', err);
        return false;
    }
}

/**
 * Récupère la clôture formelle d'une date
 */
async function getClotureByDate(dateStr) {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];

    try {
        const { data, error } = await supabase
            .from('clotures_caisse')
            .select('*')
            .eq('date_cloture', targetDate)
            .order('date_heure', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            return readAllFallback().find(c => c.date_cloture === targetDate) || null;
        }

        if (data) return data;
        return readAllFallback().find(c => c.date_cloture === targetDate) || null;
    } catch (err) {
        return readAllFallback().find(c => c.date_cloture === targetDate) || null;
    }
}

/**
 * Récupère une clôture par son ID
 */
async function getClotureById(id) {
    try {
        const { data, error } = await supabase
            .from('clotures_caisse')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return readAllFallback().find(c => c.id === id) || null;
        }
        return data;
    } catch (err) {
        return readAllFallback().find(c => c.id === id) || null;
    }
}

/**
 * Récupère l'historique complet des clôtures de caisse
 */
async function getAllClotures({ dateDebut, dateFin, limit = 50 } = {}) {
    try {
        let query = supabase
            .from('clotures_caisse')
            .select('*')
            .order('date_cloture', { ascending: false })
            .limit(limit);

        if (dateDebut) query = query.gte('date_cloture', dateDebut);
        if (dateFin) query = query.lte('date_cloture', dateFin);

        const { data, error } = await query;
        if (error) {
            return getAllFallback({ dateDebut, dateFin, limit });
        }
        return data || [];
    } catch (err) {
        return getAllFallback({ dateDebut, dateFin, limit });
    }
}

function getAllFallback({ dateDebut, dateFin, limit = 50 } = {}) {
    let items = readAllFallback();
    if (dateDebut) items = items.filter(c => c.date_cloture >= dateDebut);
    if (dateFin) items = items.filter(c => c.date_cloture <= dateFin);
    items.sort((a, b) => new Date(b.date_cloture) - new Date(a.date_cloture));
    return items.slice(0, limit);
}

/**
 * Enregistre une clôture de caisse formelle
 */
async function createCloture(payload) {
    const todayStr = payload.date_cloture || new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const numeroCloture = payload.numero_cloture || `Z-${todayStr.replace(/-/g, '')}-${String(timestamp).slice(-4)}`;

    const dataToSave = {
        numero_cloture: numeroCloture,
        date_cloture: todayStr,
        date_heure: new Date().toISOString(),
        caissier_id: payload.caissier_id || null,
        caissier_nom: payload.caissier_nom || 'Caissier',
        total_encaissements: parseFloat(payload.total_encaissements) || 0,
        total_especes_theorique: parseFloat(payload.total_especes_theorique) || 0,
        total_mobile_money: parseFloat(payload.total_mobile_money) || 0,
        total_autres: parseFloat(payload.total_autres) || 0,
        nb_transactions: parseInt(payload.nb_transactions, 10) || 0,
        total_depenses: parseFloat(payload.total_depenses) || 0,
        nb_depenses: parseInt(payload.nb_depenses, 10) || 0,
        solde_net_theorique: parseFloat(payload.solde_net_theorique) || 0,
        solde_especes_physique: parseFloat(payload.solde_especes_physique) || 0,
        ecart_caisse: parseFloat(payload.ecart_caisse) || 0,
        fond_caisse_suivant: parseFloat(payload.fond_caisse_suivant) || 0,
        billetage: payload.billetage || {},
        statut: 'cloturee',
        observations: (payload.observations || '').trim() || null
    };

    let saved = null;
    try {
        const { data, error } = await supabase
            .from('clotures_caisse')
            .insert([dataToSave])
            .select()
            .single();

        if (!error && data) {
            saved = data;
        }
    } catch (err) {
        console.warn('Sauvegarde clôture caisse PostgreSQL échouée, fallback local:', err.message);
    }

    const all = readAllFallback();
    const localEntry = {
        id: saved ? saved.id : crypto.randomUUID(),
        ...dataToSave,
        created_at: new Date().toISOString()
    };
    // Remplacer si déjà présent pour cette date, sinon ajouter
    const existingIdx = all.findIndex(c => c.date_cloture === todayStr);
    if (existingIdx !== -1) {
        all[existingIdx] = localEntry;
    } else {
        all.unshift(localEntry);
    }
    writeAllFallback(all);

    return saved || localEntry;
}

module.exports = {
    getClotureByDate,
    getClotureById,
    getAllClotures,
    createCloture
};
