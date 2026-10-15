# 🚒 CSA 3e COMPAGNIE GSPM BOUAKE - Système de Gestion Médicale, Facturation & Pharmacie

Application web complète de gestion médicale, hospitalière, de facturation et de pharmacie pour le **Centre de Santé (CSA) de la 3e Compagnie du Groupement de Sapeurs-Pompiers Militaires (GSPM)** à Bouaké, République de Côte d'Ivoire (Ministère de la Défense).

---

## 🚀 Technologies utilisées
- **Backend** : Node.js (v18+), Express.js
- **Base de données** : PostgreSQL hébergé sur [Supabase](https://supabase.com)
- **Sessions & Sécurité** : `express-session`, `connect-pg-simple` (stockage persistant des sessions en base PostgreSQL), `helmet`, `express-rate-limit`, `bcryptjs`
- **Moteur de templates** : EJS + `express-ejs-layouts`
- **Styling UI** : Tailwind CSS + Font Awesome 6 + Alpine.js
- **Génération de documents & Exports** : `exceljs` (classeurs Excel multi-onglets stylisés), `pdfkit` (documents et fiches PDF), CSV encodé en UTF-8 BOM
- **Devise** : Franc CFA (FCFA / XOF) avec conversion Euro (€) automatique et montants en toutes lettres

---

## 📁 Architecture du projet

```text
clinique-cmena/
├── config/
│   └── supabase.js             # Client Supabase (public & admin service role)
├── database/
│   ├── schema.sql              # Schéma PostgreSQL complet (Tables, RLS, Triggers)
│   └── migrations/             # Migrations et fonctions SQL complémentaires
│       ├── 20261015_private_sessions.sql      # Table pour le stockage persistant des sessions
│       └── 20261015_pharmacy_pagination.sql   # Procédure de pagination et stats pharmacie
├── .env.example                # Modèle des variables d'environnement
├── middleware/
│   └── auth.js                 # Authentification, sessions et contrôle des accès par rôle
├── public/
│   ├── css/
│   │   ├── styles.css          # Styles personnalisés et gabarit d'impression
│   │   └── tailwind.min.css    # Build Tailwind CSS compilé
│   ├── js/
│   │   └── main.js             # Calculs dynamiques de facture, montants en toutes lettres
│   └── img/                    # Logos et médias statiques
├── routes/
│   ├── actes.js                # Catalogue des actes et tarifs médicaux
│   ├── assurances.js           # Gestion des mutuelles et assurances partenaires
│   ├── audit.js                # Journal d'audit et traçabilité des opérations
│   ├── auth.js                 # Connexion, déconnexion et profil utilisateur
│   ├── consultations.js        # Consultations médicales, constantes et séjours
│   ├── dashboard.js            # Tableau de bord général et indicateurs de performance
│   ├── factures.js             # Facturation conforme CMENA, décomptes et impression
│   ├── paiements.js            # Règlements, modes de paiement et suivi de caisse
│   ├── patients.js             # Dossiers médicaux, immatriculation et antécédents
│   ├── pharmacie.js            # Pharmacie, stock, alertes péremption et exports
│   ├── praticiens.js           # Personnel soignant, médecins et spécialistes
│   ├── rapports.js             # Rapports financiers, statistiques et graphiques
│   ├── settings.js             # Paramètres généraux du Centre de Santé (CSA)
│   └── utilisateurs.js         # Administration des comptes et attribution des rôles
├── views/
│   ├── actes/                  # Vues du catalogue d'actes
│   ├── assurances/             # Vues des assurances et taux de couverture
│   ├── audit/                  # Vues du journal d'activités
│   ├── auth/                   # Formulaire de connexion
│   ├── consultations/          # Vues des consultations et ordonnances
│   ├── dashboard.ejs           # Tableau de bord principal
│   ├── factures/               # Vues factures, décomptes + print.ejs conforme A4
│   ├── layouts/                # Gabarit général
│   ├── paiements/              # Vues des reçus et règlements
│   ├── partials/               # En-tête, navigation latérale rétractable, pagination
│   ├── patients/               # Vues des dossiers patients et historique
│   ├── pharmacie/              # Vues de la pharmacie (catalogue, fiche, mouvements)
│   ├── praticiens/             # Vues du personnel soignant
│   ├── rapports/               # Vues des bilans et statistiques
│   ├── settings/               # Vues de configuration du centre
│   ├── utilisateurs/           # Vues de gestion des comptes
│   └── layout.ejs              # Structure de base des pages
├── package.json
└── server.js                   # Point d'entrée de l'application Express
```

---

## ⚙️ Installation & Configuration

### 1. Prérequis
- **Node.js** v18 ou supérieur
- **npm** v9 ou supérieur
- Un compte et un projet sur [Supabase](https://supabase.com) (PostgreSQL)

### 2. Configuration de la base de données (Supabase)
1. Dans votre console Supabase, ouvrez l'onglet **SQL Editor**.
2. Exécutez le script complet `database/schema.sql` pour créer les tables, index, règles de sécurité (RLS) et données d'initialisation.
3. Exécutez les migrations recommandées dans `database/migrations/` :
   - `20261015_private_sessions.sql` : Initialise le schéma `private` pour le stockage PostgreSQL des sessions utilisateur.
   - `20261015_pharmacy_pagination.sql` : Crée la procédure stockée `get_pharmacy_products_page` pour la pagination et les statistiques de stock globales (un mécanisme de secours par requête directe est également actif côté code).
4. Récupérez vos paramètres dans **Project Settings > API** et **Project Settings > Database**.

### 3. Fichier des variables d'environnement (`.env`)
Créez un fichier `.env` à la racine à partir du modèle `.env.example` :

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=cle_aleatoire_securisee_d_au_moins_32_octets

# Clés API Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_cle_anon_publique
SUPABASE_SERVICE_ROLE_KEY=votre_cle_service_role_secrete

# Chaîne de connexion PostgreSQL directe (obligatoire en production pour connect-pg-simple)
DATABASE_URL=postgresql://postgres:[VOTRE_MOT_DE_PASSE]@db.[VOTRE_PROJECT_REF].supabase.co:5432/postgres?sslmode=require
```

> [!TIP]
> Pour générer un `SESSION_SECRET` cryptographiquement sécurisé, vous pouvez exécuter :
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### 4. Démarrage de l'application
Installez les dépendances :
```bash
npm install
```

Pour lancer en environnement de développement :
```bash
npm run dev
```

Pour lancer en environnement de production :
```bash
npm start
```

Accédez à l'application dans votre navigateur :
👉 **http://localhost:3000**

---

## 🏥 Modules & Fonctionnalités Clés

### 1. Facturation Médicale Conforme CMENA / CSA
- **En-tête officiel** : Identification du Centre de Santé de la 3e Compagnie GSPM Bouaké.
- **Répartition tiers-payant** : Prise en charge automatique de la part assurance/mutuelle et de la part patient selon le pourcentage convenu.
- **Arrêté de facture en lettres** : Traduction automatique du total net en toutes lettres en Francs CFA (ex: *CENT VINGT-CINQ MILLE FRANCS CFA*).
- **Contre-valeur Euro (€)** : Calcul et affichage en temps réel de l'équivalent monétaire en Euro.
- **Impression A4 / PDF dédiée** : Route d'impression `/factures/:id/print` formatée pour édition papier ou export PDF avec signatures, visas et tampons réglementaires.

### 2. Pharmacie & Consommables Médicaux
- **Gestion des stocks & valorisation financière** : Suivi des quantités, seuils d'alerte minimums, prix d'achat, prix de vente et calcul de la valeur globale du stock en stock d'alerte ou normal.
- **Surveillance avancée des péremptions** :
  - Identification immédiate des produits déjà périmés (alerte rouge et consigne de mise au rebut).
  - Alertes visuelles graduelles : **Périme &le; 30 jours** (alerte critique avec préconisation de dispensation prioritaire FEFO), **&le; 60 jours** et **&le; 90 jours**.
  - Filtre rapide dédié dans la barre d'outils pour isoler instantanément les lots à surveiller.
  - Statistiques en direct sur le tableau de bord de la pharmacie.
- **Exports comptables et d'inventaire complets** :
  - **Export CSV universel** : Doté du préfixe UTF-8 BOM (`\uFEFF`) garantissant une ouverture sans altération des accents sous Microsoft Excel sur Windows.
  - **Export Excel (`.xlsx`) multi-onglets** :
    - *Feuille 1 (Synthèse)* : 6 cartes d'indicateurs financiers et de volumétrie.
    - *Feuille 2 (Inventaire Détaillé)* : Tableau formaté avec styles professionnels, colonnes monétaires en FCFA et colorisation conditionnelle selon l'urgence de péremption.

### 3. Dossiers Médicaux & Suivi des Patients
- **Génération automatique de matricule unique** (ex: `KOAn2026091816152679`).
- Suivi des données biométriques, groupe sanguin, antécédents médicaux/chirurgicaux et allergies.
- Historique chronologique complet des consultations, examens et factures rattachées au patient.

### 4. Consultations & Dossier de Soins
- Recueil des constantes cliniques (tension, température, poids, pouls).
- Enregistrement des diagnostics, prescriptions d'actes et ordonnances de pharmacie avec décompte automatique des stocks.

### 5. Encaissements & Règlements
- Gestion des modes de paiement : Espèces, Mobile Money (Orange Money, MTN MoMo, Moov Money), Chèque, Virement.
- Suivi des restes à recouvrer et historiques des reçus de caisse.

### 6. Traçabilité & Journal d'Audit
- Enregistrement automatique de toutes les actions sensibles (créations, modifications de tarifs, annulations de factures, ajustements de stocks).
- Journal consultable par les administrateurs avec horodatage, utilisateur responsable et détails techniques.

---

## 🔒 Sécurité & Déploiement

- **Gestion des sessions** : En production, les sessions sont sauvegardées dans PostgreSQL (`connect-pg-simple`) dans la table `private.app_sessions`, évitant les pertes de session lors des redémarrages ou sur les architectures serverless (Vercel, Render, Railway).
- **Protection HTTP** : En-têtes sécurisés injectés via `helmet` et protection contre les attaques par force brute via `express-rate-limit`.
- **Politiques RLS Supabase** : Les données sensibles sont protégées au niveau de la base de données.
