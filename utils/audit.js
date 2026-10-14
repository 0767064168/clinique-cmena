/**
 * Service de journalisation d'audit (Traçabilité des actions sensibles)
 * CSA 3e Compagnie GSPM Bouaké
 */

const { supabase, supabaseAdmin } = require('../config/supabase');

const client = supabaseAdmin || supabase;

/**
 * Enregistre une action d'audit dans la base de données
 * @param {Object} params
 * @param {Object} params.req - Objet Request Express (pour extraire l'utilisateur, l'IP, etc.)
 * @param {string} params.action - Code action (ex: 'FACTURE_CREATION', 'FACTURE_ANNULATION', 'PAIEMENT_ENCAISSE')
 * @param {string} params.entite - Type d'entité ('facture', 'paiement', 'patient', 'utilisateur')
 * @param {string} [params.entite_id] - ID de l'entité concernée
 * @param {string} params.description - Explication claire et lisible
 * @param {Object} [params.details] - Données additionnelles en JSON
 */
async function logAudit({ req, action, entite, entite_id = null, description, details = {} }) {
    try {
        const user = (req && req.session && req.session.user) ? req.session.user : null;
        const utilisateur_id = user ? user.id : null;
        const utilisateur_nom = user ? `${user.nom || ''} ${user.prenom || ''}`.trim() || user.email : 'Système';
        const utilisateur_role = user ? user.role : 'system';
        const adresse_ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip) : null;

        await client
            .from('journal_activites')
            .insert([{
                action,
                entite,
                entite_id,
                description,
                utilisateur_id,
                utilisateur_nom,
                utilisateur_role,
                adresse_ip,
                details,
                created_at: new Date()
            }]);
    } catch (err) {
        // En cas d'erreur ou si la table n'est pas encore créée, ne pas bloquer l'application
        console.warn('⚠️ Erreur journal audit (non-bloquant):', err.message);
    }
}

module.exports = {
    logAudit
};
