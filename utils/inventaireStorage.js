const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

const FILE_PATH = path.join(__dirname, '..', 'data', 'inventaires_pharmacie.json');

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
        console.error('Erreur lecture inventaires_pharmacie.json:', err);
        return [];
    }
}

function writeAllFallback(items) {
    try {
        ensureDataFile();
        fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Erreur écriture inventaires_pharmacie.json:', err);
        return false;
    }
}

/**
 * Récupère tous les inventaires avec résumé
 */
async function getAllInventaires() {
    try {
        const { data, error } = await supabase
            .from('inventaires_pharmacie')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            return readAllFallback();
        }
        return data || [];
    } catch (err) {
        return readAllFallback();
    }
}

/**
 * Récupère un inventaire complet avec ses lignes
 */
async function getInventaireById(id) {
    try {
        const { data: inv, error: errInv } = await supabase
            .from('inventaires_pharmacie')
            .select('*')
            .eq('id', id)
            .single();

        if (errInv || !inv) {
            return getFallbackById(id);
        }

        const { data: lignes, error: errLignes } = await supabase
            .from('inventaire_lignes')
            .select('*')
            .eq('inventaire_id', id)
            .order('designation', { ascending: true });

        return {
            ...inv,
            lignes: lignes || []
        };
    } catch (err) {
        return getFallbackById(id);
    }
}

function getFallbackById(id) {
    const all = readAllFallback();
    return all.find(i => i.id === id) || null;
}

/**
 * Crée une nouvelle session d'inventaire
 */
async function createInventaire({ titre, categorie_cible = 'toutes', responsable_id = null, responsable_nom = 'Pharmacien', notes = '' }) {
    const todayStr = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const numero = `INV-${todayStr.replace(/-/g, '').slice(0, 6)}-${String(timestamp).slice(-3)}`;

    // 1. Charger les produits ciblés
    let prodQuery = supabase
        .from('produits_pharmacie')
        .select('*')
        .eq('actif', true)
        .order('designation', { ascending: true });

    if (categorie_cible && categorie_cible !== 'toutes') {
        prodQuery = prodQuery.eq('categorie', categorie_cible);
    }

    const { data: produits, error: errProd } = await prodQuery;
    const prodsList = produits || [];

    const totalArticles = prodsList.length;
    const valeurTheorique = prodsList.reduce((acc, p) => acc + (Number(p.stock_actuel || 0) * Number(p.prix_vente || 0)), 0);

    const invPayload = {
        numero_inventaire: numero,
        date_inventaire: todayStr,
        titre: titre || `Inventaire ${categorie_cible === 'toutes' ? 'Général' : categorie_cible} du ${todayStr}`,
        categorie_cible,
        responsable_id,
        responsable_nom,
        statut: 'en_cours',
        total_articles: totalArticles,
        articles_comptes: 0,
        articles_avec_ecart: 0,
        valeur_theorique: valeurTheorique,
        valeur_physique: 0,
        valeur_ecart: 0,
        notes
    };

    let savedInv = null;
    let savedLignes = [];

    try {
        const { data: createdInv, error: errCreate } = await supabase
            .from('inventaires_pharmacie')
            .insert([invPayload])
            .select()
            .single();

        if (!errCreate && createdInv) {
            savedInv = createdInv;

            // Insérer les lignes d'inventaire
            const lignesPayload = prodsList.map(p => ({
                inventaire_id: createdInv.id,
                produit_id: p.id,
                designation: p.designation,
                code: p.code || null,
                categorie: p.categorie || null,
                forme: p.forme || null,
                emplacement: p.emplacement || null,
                prix_achat: parseFloat(p.prix_achat) || 0,
                prix_vente: parseFloat(p.prix_vente) || 0,
                stock_theorique: parseInt(p.stock_actuel, 10) || 0,
                stock_physique: null,
                ecart: null,
                valeur_ecart: 0,
                date_peremption_theorique: p.date_peremption || null,
                date_peremption_reelle: p.date_peremption || null,
                statut: 'en_attente'
            }));

            if (lignesPayload.length > 0) {
                const { data: createdLignes } = await supabase
                    .from('inventaire_lignes')
                    .insert(lignesPayload)
                    .select();
                savedLignes = createdLignes || lignesPayload;
            }
        }
    } catch (err) {
        console.warn('Erreur création inventaire Supabase, fallback local:', err.message);
    }

    // Sauvegarde de secours locale
    const all = readAllFallback();
    const newLocalInv = {
        id: savedInv ? savedInv.id : crypto.randomUUID(),
        ...invPayload,
        created_at: new Date().toISOString(),
        lignes: (savedLignes && savedLignes.length > 0) ? savedLignes : prodsList.map(p => ({
            id: crypto.randomUUID(),
            inventaire_id: savedInv ? savedInv.id : 'local',
            produit_id: p.id,
            designation: p.designation,
            code: p.code || null,
            categorie: p.categorie || null,
            forme: p.forme || null,
            emplacement: p.emplacement || null,
            prix_achat: parseFloat(p.prix_achat) || 0,
            prix_vente: parseFloat(p.prix_vente) || 0,
            stock_theorique: parseInt(p.stock_actuel, 10) || 0,
            stock_physique: null,
            ecart: null,
            valeur_ecart: 0,
            date_peremption_theorique: p.date_peremption || null,
            date_peremption_reelle: p.date_peremption || null,
            statut: 'en_attente'
        }))
    };

    all.unshift(newLocalInv);
    writeAllFallback(all);

    return savedInv ? { ...savedInv, lignes: savedLignes } : newLocalInv;
}

/**
 * Met à jour les comptages physiques saisis
 */
async function updateComptages(inventaireId, comptages) {
    // comptages = [{ ligne_id, stock_physique, date_peremption_reelle, notes }]
    const inv = await getInventaireById(inventaireId);
    if (!inv) throw new Error('Inventaire introuvable');
    if (inv.statut !== 'en_cours') throw new Error('Cet inventaire est déjà validé ou clôturé');

    let updatedLignes = [...(inv.lignes || [])];
    let articlesComptes = 0;
    let articlesAvecEcart = 0;
    let valeurPhysiqueTotale = 0;
    let valeurEcartTotale = 0;

    for (const c of comptages) {
        const idx = updatedLignes.findIndex(l => String(l.id) === String(c.ligne_id) || String(l.produit_id) === String(c.produit_id));
        if (idx !== -1) {
            const ligne = updatedLignes[idx];
            let phys = (c.stock_physique !== undefined && c.stock_physique !== null && c.stock_physique !== '') 
                ? parseInt(c.stock_physique, 10) 
                : null;
            if (phys !== null && isNaN(phys)) phys = null;

            let ecart = (phys !== null) ? (phys - ligne.stock_theorique) : null;
            let valEcart = (ecart !== null) ? (ecart * Number(ligne.prix_vente || 0)) : 0;
            
            let statutLigne = 'en_attente';
            if (phys !== null) {
                if (ecart === 0) statutLigne = 'conforme';
                else if (ecart > 0) statutLigne = 'surplus';
                else statutLigne = 'manquant';
            }

            const updatedLigneData = {
                stock_physique: phys,
                ecart: ecart,
                valeur_ecart: valEcart,
                date_peremption_reelle: c.date_peremption_reelle || ligne.date_peremption_theorique,
                notes: c.notes !== undefined ? c.notes : ligne.notes,
                statut: statutLigne
            };

            updatedLignes[idx] = { ...ligne, ...updatedLigneData };

            // Mise à jour Supabase si dispo
            try {
                await supabase
                    .from('inventaire_lignes')
                    .update(updatedLigneData)
                    .eq('id', ligne.id);
            } catch (err) {}
        }
    }

    // Recalculer les totaux globaux
    updatedLignes.forEach(l => {
        if (l.stock_physique !== null && l.stock_physique !== undefined) {
            articlesComptes++;
            valeurPhysiqueTotale += (Number(l.stock_physique) * Number(l.prix_vente || 0));
            if (l.ecart !== 0) {
                articlesAvecEcart++;
                valeurEcartTotale += Number(l.valeur_ecart || 0);
            }
        }
    });

    const headerUpdates = {
        articles_comptes: articlesComptes,
        articles_avec_ecart: articlesAvecEcart,
        valeur_physique: valeurPhysiqueTotale,
        valeur_ecart: valeurEcartTotale,
        updated_at: new Date().toISOString()
    };

    try {
        await supabase
            .from('inventaires_pharmacie')
            .update(headerUpdates)
            .eq('id', inventaireId);
    } catch (err) {}

    // Mise à jour fallback local
    const all = readAllFallback();
    const invIdx = all.findIndex(i => i.id === inventaireId);
    if (invIdx !== -1) {
        all[invIdx] = {
            ...all[invIdx],
            ...headerUpdates,
            lignes: updatedLignes
        };
        writeAllFallback(all);
    }

    return {
        ...inv,
        ...headerUpdates,
        lignes: updatedLignes
    };
}

/**
 * Valide l'inventaire et régularise automatiquement les stocks dans produits_pharmacie et mouvements_stock
 */
async function validerInventaire(inventaireId, utilisateur) {
    const inv = await getInventaireById(inventaireId);
    if (!inv) throw new Error('Inventaire introuvable');
    if (inv.statut === 'valide') throw new Error('Cet inventaire a déjà été validé');

    const userName = utilisateur ? `${utilisateur.prenom} ${utilisateur.nom}` : 'Pharmacien';
    const userId = utilisateur ? utilisateur.id : null;
    const now = new Date().toISOString();

    // Parcourir toutes les lignes ayant un comptage physique
    const lignesAvecEcart = (inv.lignes || []).filter(l => l.stock_physique !== null && l.stock_physique !== undefined && l.ecart !== 0);

    for (const ligne of lignesAvecEcart) {
        const ecart = ligne.ecart;
        const typeMouv = ecart > 0 ? 'entree' : 'sortie';
        const qte = Math.abs(ecart);
        const stockAvant = ligne.stock_theorique;
        const stockApres = ligne.stock_physique;

        const motif = `Régularisation inventaire ${inv.numero_inventaire} (${ecart > 0 ? 'Surplus +' + qte : 'Déficit/Perte -' + qte})`;

        try {
            // 1. Mettre à jour produits_pharmacie
            await supabase
                .from('produits_pharmacie')
                .update({
                    stock_actuel: stockApres,
                    updated_at: now
                })
                .eq('id', ligne.produit_id);

            // 2. Insérer le mouvement de stock
            await supabase
                .from('mouvements_stock')
                .insert([{
                    produit_id: ligne.produit_id,
                    type_mouvement: typeMouv,
                    quantite: qte,
                    stock_avant: stockAvant,
                    stock_apres: stockApres,
                    motif: motif,
                    reference: inv.numero_inventaire,
                    utilisateur_id: userId,
                    utilisateur_nom: userName,
                    created_at: now
                }]);
        } catch (err) {
            console.warn(`Erreur régularisation produit ${ligne.designation}:`, err.message);
        }
    }

    const headerFinal = {
        statut: 'valide',
        date_validation: now,
        valide_par_nom: userName,
        updated_at: now
    };

    try {
        await supabase
            .from('inventaires_pharmacie')
            .update(headerFinal)
            .eq('id', inventaireId);
    } catch (err) {}

    // Mise à jour fallback
    const all = readAllFallback();
    const invIdx = all.findIndex(i => i.id === inventaireId);
    if (invIdx !== -1) {
        all[invIdx] = {
            ...all[invIdx],
            ...headerFinal
        };
        writeAllFallback(all);
    }

    return {
        ...inv,
        ...headerFinal,
        nbRegularises: lignesAvecEcart.length
    };
}

module.exports = {
    getAllInventaires,
    getInventaireById,
    createInventaire,
    updateComptages,
    validerInventaire
};
