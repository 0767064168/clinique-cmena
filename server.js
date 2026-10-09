/**
 * Clinique Médico-Chirurgicale NANAN (CMENA)
 * Serveur Principal Express
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const methodOverride = require('method-override');

// Importation des routes de l'application
const dashboardRoutes = require('./routes/dashboard');
const patientsRoutes = require('./routes/patients');
const praticiensRoutes = require('./routes/praticiens');
const facturesRoutes = require('./routes/factures');
const consultationsRoutes = require('./routes/consultations');
const actesRoutes = require('./routes/actes');
const assurancesRoutes = require('./routes/assurances');
const paiementsRoutes = require('./routes/paiements');
const authRoutes = require('./routes/auth');

// Initialisation de l'application Express
const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Configuration du moteur de rendu EJS avec express-ejs-layouts
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Fichiers statiques depuis le dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Analyseurs de corps de requête (Body parsers)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Remplacement de méthode HTTP pour supporter PUT et DELETE via formulaires
app.use(methodOverride('_method'));

// Configuration de la gestion de sessions
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'cmena-secret-session-key-ci',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 heures
    }
  })
);

// Middleware pour les variables globales et utilitaires de vue
app.use((req, res, next) => {
  // Utilisateur connecté
  res.locals.user = req.session ? req.session.user : null;
  res.locals.currentPath = req.path;

  // Formatage des montants financiers en Francs CFA (XOF)
  res.locals.formatMoney = (amount) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0 FCFA';
    return new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 0
    }).format(Number(amount)) + ' FCFA';
  };

  // Formatage des dates au format français
  res.locals.formatDate = (date, options = {}) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    
    const defaultOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    };
    return new Intl.DateTimeFormat('fr-FR', { ...defaultOptions, ...options }).format(d);
  };

  // Formatage date et heure
  res.locals.formatDateTime = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  };

  // Informations générales de la clinique
  res.locals.clinicInfo = {
    nom: 'Clinique Médico-Chirurgicale NANAN',
    sigle: 'CMENA',
    pays: 'Côte d\'Ivoire',
    devise: 'FCFA'
  };

  // Support req.flash pour les contrôleurs/routes
  req.flash = (type, msg) => {
    if (req.session) {
      if (type === 'success') req.session.flash_success = msg;
      if (type === 'error') req.session.flash_error = msg;
    }
  };

  // Gestion des messages flash (succès / erreur)
  res.locals.messages = {
    success: (req.session && req.session.flash_success) ? req.session.flash_success : null,
    error: (req.session && req.session.flash_error) ? req.session.flash_error : null
  };
  // Supprimer les messages flash après lecture
  if (req.session) {
    delete req.session.flash_success;
    delete req.session.flash_error;
  }

  next();
});

// Enregistrement des routes de l'application
app.use('/', dashboardRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/patients', patientsRoutes);
app.use('/praticiens', praticiensRoutes);
app.use('/factures', facturesRoutes);
app.use('/consultations', consultationsRoutes);
app.use('/actes', actesRoutes);
app.use('/assurances', assurancesRoutes);
app.use('/paiements', paiementsRoutes);
app.use('/auth', authRoutes);

// Middleware pour la gestion de la route 404 (Ressource non trouvée)
app.use((req, res) => {
  res.status(404);

  // Réponse JSON si demandé
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json({
      success: false,
      message: 'Page ou ressource introuvable (404)'
    });
  }

  // Rendu de la vue 404
  res.render('errors/404', {
    title: 'Page non trouvée - 404 | CMENA',
    layout: 'layouts/main',
    url: req.originalUrl
  }, (err, html) => {
    if (err) {
      // Fallback si la vue errors/404 n'existe pas encore
      return res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>404 - Page non trouvée | Clinique CMENA</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 flex items-center justify-center min-h-screen p-4">
          <div class="bg-white p-8 rounded-xl shadow-md max-w-md w-full text-center">
            <h1 class="text-6xl font-bold text-red-500 mb-2">404</h1>
            <h2 class="text-xl font-semibold text-gray-800 mb-4">Page non trouvée</h2>
            <p class="text-gray-600 mb-6">La page demandée n'existe pas ou a été déplacée.</p>
            <a href="/" class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">Retour au tableau de bord</a>
          </div>
        </body>
        </html>
      `);
    }
    res.send(html);
  });
});

// Middleware global de gestion des erreurs (500)
app.use((err, req, res, next) => {
  console.error('Erreur Serveur:', err);
  res.status(err.status || 500);

  // Réponse JSON si demandée
  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json({
      success: false,
      message: 'Une erreur interne est survenue sur le serveur.',
      error: !isProd ? err.message : undefined
    });
  }

  // Rendu de la vue 500
  res.render('errors/500', {
    title: 'Erreur Serveur - 500 | CMENA',
    layout: 'layouts/main',
    error: !isProd ? err : {}
  }, (renderErr, html) => {
    if (renderErr) {
      // Fallback HTML en cas d'absence de la vue errors/500
      return res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Erreur Serveur | Clinique CMENA</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-100 flex items-center justify-center min-h-screen p-4">
          <div class="bg-white p-8 rounded-xl shadow-md max-w-lg w-full text-center">
            <h1 class="text-5xl font-bold text-red-600 mb-2">500</h1>
            <h2 class="text-xl font-semibold text-gray-800 mb-4">Erreur interne du serveur</h2>
            <p class="text-gray-600 mb-6">Un problème inattendu est survenu. Veuillez réessayer ultérieurement.</p>
            ${!isProd ? `<pre class="text-left bg-gray-50 p-4 rounded text-xs text-red-700 overflow-x-auto mb-6">${err.stack || err.message}</pre>` : ''}
            <a href="/" class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">Retour à l'accueil</a>
          </div>
        </body>
        </html>
      `);
    }
    res.send(html);
  });
});

// Démarrage de l'écoute du serveur
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🏥 Clinique Médico-Chirurgicale NANAN (CMENA)`);
  console.log(`🚀 Serveur actif sur : http://localhost:${PORT}`);
  console.log(`⚙️  Environnement     : ${process.env.NODE_ENV || 'development'}`);
  console.log(`====================================================`);
});

module.exports = app;
