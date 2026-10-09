# 🏥 CMENA - Système de Gestion Médicale & Facturation

Application complète de gestion pour la **Clinique Médico-Chirurgicale NANAN (CMENA)** à Bouaké, Côte d'Ivoire.

---

## 🚀 Technologies utilisées
- **Backend** : Node.js, Express.js
- **Base de données** : PostgreSQL via [Supabase](https://supabase.com)
- **Moteur de templates** : EJS + `express-ejs-layouts`
- **Styling UI** : Tailwind CSS (via CDN) + Font Awesome 6 + Alpine.js
- **Devise** : Franc CFA (FCFA / XOF) avec conversion Euro (€) automatique

---

## 📁 Architecture du projet

```text
clinique-cmena/
├── config/
│   └── supabase.js             # Client Supabase (public & admin)
├── database/
│   └── schema.sql              # Schéma PostgreSQL complet (Tables, RLS, Triggers)
├── .env.example                # Modèle de variables d'environnement
├── middleware/
│   └── auth.js                 # Authentification & contrôle d'accès
├── public/
│   ├── css/
│   │   └── styles.css          # Styles personnalisés et gabarit d'impression
│   └── js/
│       └── main.js             # Calculs dynamiques de facture, montants en lettres
├── routes/
│   ├── actes.js                # Catalogue des actes médicaux
│   ├── assurances.js           # Gestion des mutuelles et assurances
│   ├── auth.js                 # Connexion et déconnexion
│   ├── consultations.js        # Gestion des consultations et séjours
│   ├── dashboard.js            # Tableau de bord et métriques
│   ├── factures.js             # Facturation, impression et décomptes
│   ├── paiements.js            # Enregistrement des règlements
│   ├── patients.js             # Dossiers patients et matricules
│   └── praticiens.js           # Médecins et spécialistes
├── views/
│   ├── actes/                  # Vues des actes
│   ├── assurances/             # Vues des assurances
│   ├── auth/                   # Connexion
│   ├── consultations/          # Vues des consultations
│   ├── dashboard.ejs           # Tableau de bord principal
│   ├── factures/               # Vues facturation + print.ejs conforme CMENA
│   ├── layout.ejs              # Gabarit global avec barre latérale rétractable
│   ├── paiements/              # Vues des paiements
│   ├── partials/               # En-tête, barre latérale, pagination
│   ├── patients/               # Vues des patients
│   └── praticiens/             # Vues des praticiens
├── .env                        # Variables d'environnement
├── .env.example                # Modèle de variables
├── package.json
└── server.js                   # Point d'entrée de l'application
```

Le fichier `.env` et le dossier `node_modules/` sont locaux et exclus de Git.

---

## ⚙️ Installation & Démarrage

### 1. Configuration de la base de données (Supabase)
1. Créez un projet gratuit sur [Supabase](https://supabase.com).
2. Rendez-vous dans **SQL Editor** sur votre tableau de bord Supabase.
3. Copiez l'intégralité du contenu du fichier `database/schema.sql` et exécutez-le.
   - Les tables, énumérations, index et triggers de calcul automatique seront créés.
   - Des données initiales (paramètres CMENA, catalogue d'actes type) seront automatiquement insérées.
4. Récupérez vos clés API dans **Project Settings > API** :
   - `Project URL`
   - `anon public key`
   - `service_role secret key`

### 2. Configuration du fichier `.env`
Copiez `.env.example` vers `.env` à la racine, puis remplacez les valeurs d'exemple par votre configuration :
```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=remplacez-par-une-cle-aleatoire-longue

# Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_cle_anon_ici
SUPABASE_SERVICE_ROLE_KEY=votre_cle_service_role_ici
```

### 3. Lancement de l'application
```bash
npm start
```
Ou en mode développement (rechargement automatique) :
```bash
npm run dev
```

Accédez ensuite à l'application dans votre navigateur :
👉 **http://localhost:3000**

---

## 🧾 Fonctionnalités Clés & Facture CMENA
- **Format de Facture Conforme CMENA** : En-tête avec coordonnées de Bouaké, mentions d'assurance, matricule calculé, décomposition par acte (Consultation, Laboratoire, Pharmacie, Soins d'un jour), part assureur et part assuré.
- **Conversion et arrêtés de factures** : Calcul automatique de la contre-valeur en Euro (€) et conversion du montant total en toutes lettres en Francs CFA (ex: *CINQUANTE MILLE SOIXANTE-QUINZE FRANCS CFA*).
- **Gestion des Patients** : N° de dossier unique, génération de matricule (ex: `KOAn2026091816152679`), historique médical, antécédents, groupe sanguin et couverture d'assurance.
- **Impression A4 directe** : Page dédiée `/factures/:id/print` prête à être imprimée ou sauvegardée en PDF avec tampons et visas.
