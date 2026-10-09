/**
 * Middleware d'authentification pour la Clinique CMENA
 * Gère le contrôle d'accès basé sur la session utilisateur
 */

/**
 * Middleware vérifiant que l'utilisateur est authentifié en session
 * Redirige vers /auth/login si non connecté
 */
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
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

module.exports = {
  requireAuth,
  optionalAuth
};
