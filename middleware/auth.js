/**
 * Middleware d'authentification pour la Clinique CMENA
 * Gère le contrôle d'accès basé sur la session utilisateur
 */

const { supabase } = require('../config/supabase');

// Intervalle de re-vérification du statut actif (toutes les 5 minutes)
const ACTIVE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const VALID_ROLES = new Set(['admin', 'medecin', 'receptionniste', 'comptable', 'pharmacien']);

/**
 * Middleware vérifiant que l'utilisateur est authentifié en session
 * Re-vérifie périodiquement que le compte est toujours actif en base
 * Redirige vers /auth/login si non connecté ou désactivé
 */
const requireAuth = async (req, res, next) => {
  if (req.session && req.session.user) {
    if (!VALID_ROLES.has(req.session.user.role)) {
      return req.session.destroy((destroyError) => {
        if (destroyError) console.error('Erreur suppression session invalide:', destroyError.message);
        res.clearCookie('connect.sid');
        return res.redirect('/auth/login');
      });
    }

    // Re-vérifier le statut actif toutes les 5 minutes
    const now = Date.now();
    const lastCheck = req.session._lastActiveCheck || 0;

    if (now - lastCheck > ACTIVE_CHECK_INTERVAL_MS) {
      try {
        const { data: profil, error: profileError } = await supabase
          .from('utilisateurs')
          .select('actif, role')
          .eq('id', req.session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profil || profil.actif === false || !VALID_ROLES.has(profil.role)) {
          return req.session.destroy((destroyError) => {
            if (destroyError) console.error('Erreur suppression session désactivée:', destroyError.message);
            res.clearCookie('connect.sid');
            return res.redirect('/auth/login');
          });
        }

        // Mettre à jour le rôle si changé par l'admin
        if (profil.role !== req.session.user.role) {
          req.session.user.role = profil.role;
        }

        req.session._lastActiveCheck = now;
      } catch (err) {
        console.error('Erreur vérification statut actif:', err.message);
        return res.status(503).send('Le service d’authentification est indisponible. Réessayez plus tard.');
      }
    }

    req.user = req.session.user;
    res.locals.user = req.session.user;
    return next();
  }

  // Si la requête attend du JSON (API / AJAX)
  const isApiRequest = req.xhr || 
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    req.path.startsWith('/api/');

  if (isApiRequest) {
    return res.status(401).json({
      success: false,
      message: 'Authentification requise. Veuillez vous connecter pour accéder à cette ressource.'
    });
  }

  // Sauvegarde de l'URL demandée pour redirection après connexion
  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }

  return res.redirect('/auth/login');
};

/**
 * Middleware optionnel : attache l'utilisateur s'il est connecté,
 * mais autorise l'accès dans tous les cas
 */
const optionalAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    req.user = req.session.user;
    res.locals.user = req.session.user;
  } else {
    req.user = null;
    res.locals.user = null;
  }
  return next();
};

/**
 * Middleware vérifiant que l'utilisateur a le rôle administrateur
 */
const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }

  const isApiRequest = req.xhr || 
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    req.path.startsWith('/api/');

  if (isApiRequest) {
    return res.status(403).json({
      success: false,
      message: 'Accès interdit. Privilèges administrateur requis.'
    });
  }

  if (req.flash) req.flash('error', 'Accès réservé aux administrateurs');
  return res.redirect('/dashboard');
};

/**
 * Middleware vérifiant que l'utilisateur possède l'un des rôles autorisés
 * @param {string[]} roles - Tableau des rôles autorisés (ex: ['admin', 'medecin'])
 */
const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (req.session && req.session.user && roles.includes(req.session.user.role)) {
      return next();
    }

    const isApiRequest = req.xhr || 
      (req.headers.accept && req.headers.accept.includes('application/json')) ||
      req.path.startsWith('/api/');

    if (isApiRequest) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé pour votre profil.'
      });
    }

    if (req.flash) req.flash('error', 'Vous n\'avez pas les permissions nécessaires pour accéder à cette page');
    return res.redirect('/dashboard');
  };
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireRole,
  VALID_ROLES
};
