const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const FILE_PATH = path.join(__dirname, '..', 'data', 'rendez_vous.json');

// Assurer l'existence du fichier JSON de secours
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
        console.error('Erreur lecture rendez_vous.json:', err);
        return [];
    }
}

function writeAllFallback(items) {
    try {
        ensureDataFile();
        fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Erreur écriture rendez_vous.json:', err);
        return false;
    }
}

/**
 * Récupère les rendez-vous avec filtres
 */
async function getAllRendezVous({ date, dateDebut, dateFin, praticien_id, statut, search } = {}) {
    try {
        // Essai Supabase
        let query = supabase
            .from('rendez_vous')
            .select(`
                *,
                patients (id, nom, prenom, telephone, numero_dossier),
                praticiens (id, nom, prenom, specialite)
            `)
            .order('date_heure', { ascending: true });

        if (date) {
            query = query.gte('date_heure', `${date}T00:00:00`).lte('date_heure', `${date}T23:59:59`);
        } else {
            if (dateDebut) query = query.gte('date_heure', `${dateDebut}T00:00:00`);
            if (dateFin) query = query.lte('date_heure', `${dateFin}T23:59:59`);
        }

        if (praticien_id) query = query.eq('praticien_id', praticien_id);
        if (statut) query = query.eq('statut', statut);

        const { data, error } = await query;

        if (error) {
            // Si la table n'existe pas encore dans Supabase (PGRST205)
            if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
                return await getAllFromFallback({ date, dateDebut, dateFin, praticien_id, statut, search });
            }
            throw error;
        }

        let results = data || [];
        if (search) {
            const s = search.toLowerCase();
            results = results.filter(r => {
                const patientNom = r.patients ? `${r.patients.nom} ${r.patients.prenom}`.toLowerCase() : '';
                const patientNum = r.patients && r.patients.numero_dossier ? String(r.patients.numero_dossier) : '';
                const motif = (r.motif || '').toLowerCase();
                return patientNom.includes(s) || patientNum.includes(s) || motif.includes(s);
            });
        }

        return results;
    } catch (err) {
        console.warn('Supabase rendez_vous non disponible ou erreur, utilisation du stockage local:', err.message);
        return await getAllFromFallback({ date, dateDebut, dateFin, praticien_id, statut, search });
    }
}

/**
 * Fallback local avec enrichissement des données patients/praticiens
 */
async function getAllFromFallback({ date, dateDebut, dateFin, praticien_id, statut, search } = {}) {
    let items = readAllFallback();

    // Filtres date
    if (date) {
        items = items.filter(r => (r.date_heure || '').startsWith(date));
    } else {
        if (dateDebut) items = items.filter(r => (r.date_heure || '').slice(0, 10) >= dateDebut);
        if (dateFin) items = items.filter(r => (r.date_heure || '').slice(0, 10) <= dateFin);
    }

    if (praticien_id) {
        items = items.filter(r => r.praticien_id === praticien_id);
    }
    if (statut) {
        items = items.filter(r => r.statut === statut);
    }

    // Récupérer la liste des patients et praticiens pour l'enrichissement
    const patientIds = [...new Set(items.map(r => r.patient_id).filter(Boolean))];
    const praticienIds = [...new Set(items.map(r => r.praticien_id).filter(Boolean))];

    let patientsMap = {};
    let praticiensMap = {};

    if (patientIds.length > 0) {
        const { data: pts } = await supabase.from('patients').select('id, nom, prenom, telephone, numero_dossier').in('id', patientIds);
        if (pts) {
            pts.forEach(p => { patientsMap[p.id] = p; });
        }
    }

    if (praticienIds.length > 0) {
        const { data: prats } = await supabase.from('praticiens').select('id, nom, prenom, specialite').in('id', praticienIds);
        if (prats) {
            prats.forEach(p => { praticiensMap[p.id] = p; });
        }
    }

    let enriched = items.map(r => ({
        ...r,
        patients: patientsMap[r.patient_id] || r.patients || null,
        praticiens: praticiensMap[r.praticien_id] || r.praticiens || null
    }));

    if (search) {
        const s = search.toLowerCase();
        enriched = enriched.filter(r => {
            const patientNom = r.patients ? `${r.patients.nom} ${r.patients.prenom}`.toLowerCase() : '';
            const patientNum = r.patients && r.patients.numero_dossier ? String(r.patients.numero_dossier) : '';
            const motif = (r.motif || '').toLowerCase();
            return patientNom.includes(s) || patientNum.includes(s) || motif.includes(s);
        });
    }

    // Trier par date_heure croissant
    enriched.sort((a, b) => new Date(a.date_heure) - new Date(b.date_heure));
    return enriched;
}

/**
 * Récupère un rendez-vous par son identifiant
 */
async function getRendezVousById(id) {
    try {
        const { data, error } = await supabase
            .from('rendez_vous')
            .select(`
                *,
                patients (id, nom, prenom, telephone, numero_dossier, sexe, date_naissance, allergies),
                praticiens (id, nom, prenom, specialite)
            `)
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
                return await getByIdFromFallback(id);
            }
            throw error;
        }
        return data;
    } catch (err) {
        return await getByIdFromFallback(id);
    }
}

async function getByIdFromFallback(id) {
    const items = readAllFallback();
    const item = items.find(r => r.id === id);
    if (!item) return null;

    let patient = null;
    let praticien = null;

    if (item.patient_id) {
        const { data: pt } = await supabase.from('patients').select('id, nom, prenom, telephone, numero_dossier, sexe, date_naissance, allergies').eq('id', item.patient_id).single();
        patient = pt;
    }
    if (item.praticien_id) {
        const { data: pr } = await supabase.from('praticiens').select('id, nom, prenom, specialite').eq('id', item.praticien_id).single();
        praticien = pr;
    }

    return {
        ...item,
        patients: patient || item.patients || null,
        praticiens: praticien || item.praticiens || null
    };
}

/**
 * Vérifie si un praticien a un conflit d'horaire
 */
async function checkConflict(praticien_id, date_heure, duree_minutes = 30, excludeId = null) {
    if (!praticien_id || !date_heure) return null;

    const debut = new Date(date_heure).getTime();
    const fin = debut + duree_minutes * 60 * 1000;
    const dateStr = new Date(date_heure).toISOString().split('T')[0];

    const all = await getAllRendezVous({ date: dateStr, praticien_id });

    const conflict = all.find(r => {
        if (excludeId && r.id === excludeId) return false;
        if (['annule', 'absent'].includes(r.statut)) return false;

        const rDebut = new Date(r.date_heure).getTime();
        const rFin = rDebut + (r.duree_minutes || 30) * 60 * 1000;

        return Math.max(debut, rDebut) < Math.min(fin, rFin);
    });

    return conflict || null;
}

/**
 * Création d'un rendez-vous
 */
async function createRendezVous(rdvData) {
    const payload = {
        patient_id: rdvData.patient_id,
        praticien_id: rdvData.praticien_id || null,
        date_heure: rdvData.date_heure,
        duree_minutes: parseInt(rdvData.duree_minutes, 10) || 30,
        motif: (rdvData.motif || 'Consultation').trim(),
        statut: rdvData.statut || 'programme',
        notes: (rdvData.notes || '').trim() || null,
        created_by: rdvData.created_by || null
    };

    try {
        const { data, error } = await supabase
            .from('rendez_vous')
            .insert([payload])
            .select(`
                *,
                patients (id, nom, prenom, telephone, numero_dossier),
                praticiens (id, nom, prenom, specialite)
            `)
            .single();

        if (error) {
            if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
                return createFallback(payload);
            }
            throw error;
        }
        return data;
    } catch (err) {
        return createFallback(payload);
    }
}

function createFallback(payload) {
    const items = readAllFallback();
    const newRdv = {
        id: crypto.randomUUID(),
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    items.push(newRdv);
    writeAllFallback(items);
    return newRdv;
}

/**
 * Mise à jour d'un rendez-vous
 */
async function updateRendezVous(id, updates) {
    try {
        const payload = {
            ...updates,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('rendez_vous')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
                return updateFallback(id, payload);
            }
            throw error;
        }
        return data;
    } catch (err) {
        return updateFallback(id, updates);
    }
}

function updateFallback(id, updates) {
    const items = readAllFallback();
    const index = items.findIndex(r => r.id === id);
    if (index === -1) return null;

    items[index] = {
        ...items[index],
        ...updates,
        updated_at: new Date().toISOString()
    };
    writeAllFallback(items);
    return items[index];
}

/**
 * Mise à jour rapide du statut
 */
async function updateStatutRendezVous(id, statut) {
    return await updateRendezVous(id, { statut });
}

/**
 * Suppression d'un rendez-vous
 */
async function deleteRendezVous(id) {
    try {
        const { error } = await supabase
            .from('rendez_vous')
            .delete()
            .eq('id', id);

        if (error) {
            if (error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'))) {
                return deleteFallback(id);
            }
            throw error;
        }
        return true;
    } catch (err) {
        return deleteFallback(id);
    }
}

function deleteFallback(id) {
    const items = readAllFallback();
    const filtered = items.filter(r => r.id !== id);
    writeAllFallback(filtered);
    return true;
}

module.exports = {
    getAllRendezVous,
    getRendezVousById,
    checkConflict,
    createRendezVous,
    updateRendezVous,
    updateStatutRendezVous,
    deleteRendezVous
};
