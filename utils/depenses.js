const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const FILE_PATH = path.join(__dirname, '..', 'data', 'depenses_caisse.json');

function ensureDataFile() {
    if (!fs.existsSync(FILE_PATH)) {
        const dir = path.dirname(FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(FILE_PATH, '[]', 'utf8');
    }
}

function readAllLocal() {
    try {
        ensureDataFile();
        const content = fs.readFileSync(FILE_PATH, 'utf8');
        return JSON.parse(content || '[]');
    } catch (err) {
        console.error('Erreur lecture depenses_caisse.json:', err);
        return [];
    }
}

function writeAllLocal(depenses) {
    try {
        ensureDataFile();
        fs.writeFileSync(FILE_PATH, JSON.stringify(depenses, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Erreur ecriture depenses_caisse.json:', err);
        return false;
    }
}

/**
 * Récupère les dépenses par date (depuis PostgreSQL avec repli local)
 */
async function getDepensesByDate(dateStr) {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];

    try {
        const { data, error } = await supabase
            .from('depenses_caisse')
            .select('*')
            .eq('date', targetDate)
            .order('created_at', { ascending: true });

        if (error) {
            // Si la table PostgreSQL n'existe pas encore
            return readAllLocal().filter(d => d.date === targetDate);
        }

        // Si PostgreSQL est vide pour ce jour mais que le fichier local contient des données, migrer automatiquement
        if ((!data || data.length === 0)) {
            const local = readAllLocal().filter(d => d.date === targetDate);
            if (local.length > 0) {
                for (const item of local) {
                    await supabase.from('depenses_caisse').insert([{
                        date: item.date,
                        heure: item.heure || '12:00',
                        motif: item.motif,
                        montant: item.montant,
                        beneficiaire: item.beneficiaire || '-',
                        categorie: item.categorie || 'autre',
                        utilisateur_nom: item.utilisateur_nom || 'Caissier'
                    }]).catch(() => {});
                }
            }
            return local;
        }

        return data;
    } catch (err) {
        return readAllLocal().filter(d => d.date === targetDate);
    }
}

/**
 * Récupère une dépense par son identifiant
 */
async function getDepenseById(id) {
    try {
        const { data, error } = await supabase
            .from('depenses_caisse')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return readAllLocal().find(d => d.id === id) || null;
        }
        return data;
    } catch (err) {
        return readAllLocal().find(d => d.id === id) || null;
    }
}

/**
 * Enregistre une sortie de caisse en base de données PostgreSQL
 */
async function addDepense({ date, motif, montant, beneficiaire, categorie, utilisateur_id, utilisateur_nom, justificatif_ref }) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const heureStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const parsedMontant = Math.max(0, parseFloat(montant) || 0);

    const payload = {
        date: targetDate,
        heure: heureStr,
        motif: (motif || 'Dépense diverse').trim(),
        montant: parsedMontant,
        beneficiaire: (beneficiaire || '-').trim(),
        categorie: categorie || 'autre',
        justificatif_ref: justificatif_ref || null,
        utilisateur_id: utilisateur_id || null,
        utilisateur_nom: utilisateur_nom || 'Caissier'
    };

    let result = null;

    try {
        const { data, error } = await supabase
            .from('depenses_caisse')
            .insert([payload])
            .select()
            .single();

        if (!error && data) {
            result = data;
        }
    } catch (err) {
        console.warn('Sauvegarde depense PostgreSQL échouée, sauvegarde locale de secours:', err.message);
    }

    // Toujours maintenir la synchronisation avec le stockage local
    const all = readAllLocal();
    const localEntry = {
        id: result ? result.id : crypto.randomUUID(),
        ...payload,
        created_at: new Date().toISOString()
    };
    all.push(localEntry);
    writeAllLocal(all);

    return result || localEntry;
}

/**
 * Supprime une sortie de caisse
 */
async function deleteDepense(id) {
    try {
        await supabase
            .from('depenses_caisse')
            .delete()
            .eq('id', id);
    } catch (err) {
        console.warn('Suppression depense PostgreSQL échouée:', err.message);
    }

    const all = readAllLocal();
    const filtered = all.filter(d => d.id !== id);
    writeAllLocal(filtered);
    return true;
}

module.exports = {
    getDepensesByDate,
    getDepenseById,
    addDepense,
    deleteDepense
};
