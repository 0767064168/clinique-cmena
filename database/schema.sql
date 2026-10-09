-- schema.sql pour Clinique Médico-Chirurgicale NANAN - CMENA
-- Généré pour Supabase (PostgreSQL)

-- Activer l'extension pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. ENUMS
-- ==========================================
CREATE TYPE role_utilisateur AS ENUM ('admin', 'medecin', 'receptionniste', 'comptable', 'pharmacien');
CREATE TYPE sexe_patient AS ENUM ('M', 'F');
CREATE TYPE categorie_acte AS ENUM ('consultation', 'laboratoire', 'pharmacie', 'soins', 'chirurgie', 'imagerie', 'hospitalisation');
CREATE TYPE statut_consultation AS ENUM ('en_cours', 'termine', 'annule');
CREATE TYPE statut_facture AS ENUM ('brouillon', 'validee', 'payee', 'partiellement_payee', 'annulee');
CREATE TYPE mode_paiement AS ENUM ('especes', 'carte', 'virement', 'mobile_money', 'cheque');
CREATE TYPE type_assurance AS ENUM ('PARTICULIER', 'ENTREPRISE', 'MUTUELLE');

-- ==========================================
-- 2. TABLES
-- ==========================================

-- 1. utilisateurs
CREATE TABLE utilisateurs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    mot_de_passe VARCHAR(255) NOT NULL,
    role role_utilisateur NOT NULL,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. praticiens
CREATE TABLE praticiens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    specialite VARCHAR(150),
    telephone VARCHAR(20),
    email VARCHAR(255),
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. patients
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_dossier SERIAL UNIQUE NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    date_naissance DATE,
    sexe sexe_patient,
    telephone VARCHAR(20),
    adresse TEXT,
    ville VARCHAR(100),
    matricule VARCHAR(50) UNIQUE,
    groupe_sanguin VARCHAR(5),
    allergies TEXT,
    antecedents TEXT,
    contact_urgence_nom VARCHAR(150),
    contact_urgence_tel VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. assurances
CREATE TABLE assurances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom VARCHAR(150) NOT NULL,
    type VARCHAR(50),
    adresse TEXT,
    telephone VARCHAR(20),
    email VARCHAR(255),
    taux_couverture DECIMAL(5,2) DEFAULT 100,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. patient_assurances
CREATE TABLE patient_assurances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    assurance_id UUID REFERENCES assurances(id) ON DELETE SET NULL,
    type_assurance type_assurance DEFAULT 'PARTICULIER',
    assureur VARCHAR(150),
    souscripteur VARCHAR(150),
    numero_police VARCHAR(100),
    date_debut DATE,
    date_fin DATE,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. actes_medicaux
CREATE TABLE actes_medicaux (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE,
    libelle VARCHAR(255) NOT NULL,
    categorie categorie_acte NOT NULL,
    prix_unitaire DECIMAL(12,2) NOT NULL,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. consultations
CREATE TABLE consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    praticien_id UUID REFERENCES praticiens(id) ON DELETE SET NULL,
    date_entree TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    date_sortie TIMESTAMP WITH TIME ZONE,
    nombre_jours INTEGER DEFAULT 1,
    motif TEXT,
    observations TEXT,
    diagnostic TEXT,
    statut statut_consultation DEFAULT 'en_cours',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. factures
CREATE SEQUENCE seq_numero_facture START WITH 300000;

CREATE TABLE factures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_facture INTEGER DEFAULT nextval('seq_numero_facture') UNIQUE NOT NULL,
    consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    date_facture TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(12,2) DEFAULT 0,
    remise DECIMAL(12,2) DEFAULT 0,
    total_net DECIMAL(12,2) DEFAULT 0,
    taux_euro DECIMAL(10,5) DEFAULT 655.957,
    total_euro DECIMAL(12,2) DEFAULT 0,
    montant_paye DECIMAL(12,2) DEFAULT 0,
    reste_a_payer DECIMAL(12,2) DEFAULT 0,
    statut statut_facture DEFAULT 'brouillon',
    edite_par UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. facture_lignes
CREATE TABLE facture_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    acte_id UUID REFERENCES actes_medicaux(id) ON DELETE SET NULL,
    libelle VARCHAR(255) NOT NULL,
    nom_praticien VARCHAR(200),
    prix_unitaire DECIMAL(12,2) NOT NULL,
    quantite INTEGER NOT NULL DEFAULT 1,
    pourcentage DECIMAL(5,2) DEFAULT 100,
    montant DECIMAL(12,2) NOT NULL,
    part_assureur DECIMAL(12,2) DEFAULT 0,
    part_assure DECIMAL(12,2) NOT NULL,
    ordre INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. paiements
CREATE TABLE paiements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
    montant DECIMAL(12,2) NOT NULL,
    date_paiement TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    mode_paiement mode_paiement NOT NULL,
    reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. parametres_clinique
CREATE TABLE parametres_clinique (
    id SERIAL PRIMARY KEY,
    nom_clinique VARCHAR(255) NOT NULL,
    adresse TEXT,
    bp VARCHAR(100),
    telephone VARCHAR(100),
    mobile VARCHAR(100),
    email VARCHAR(255),
    ville VARCHAR(100),
    pays VARCHAR(100),
    logo_url TEXT,
    devise VARCHAR(20) DEFAULT 'FCFA',
    taux_euro DECIMAL(10,5) DEFAULT 655.957
);

-- ==========================================
-- 3. INDEXES
-- ==========================================
CREATE INDEX idx_patients_numero_dossier ON patients(numero_dossier);
CREATE INDEX idx_patients_matricule ON patients(matricule);
CREATE INDEX idx_consultations_patient_id ON consultations(patient_id);
CREATE INDEX idx_factures_patient_id ON factures(patient_id);
CREATE INDEX idx_factures_numero_facture ON factures(numero_facture);
CREATE INDEX idx_facture_lignes_facture_id ON facture_lignes(facture_id);
CREATE INDEX idx_paiements_facture_id ON paiements(facture_id);

-- ==========================================
-- 4. FONCTIONS ET TRIGGERS
-- ==========================================

-- Fonction pour générer le matricule patient
CREATE OR REPLACE FUNCTION generer_matricule_patient()
RETURNS TRIGGER AS $$
DECLARE
    prefix VARCHAR(2);
    time_part VARCHAR(20);
    random_part VARCHAR(5);
BEGIN
    -- Prendre les 2 premières lettres du nom, ou 'XX' si trop court
    IF length(NEW.nom) >= 2 THEN
        prefix := upper(substring(NEW.nom from 1 for 2));
    ELSE
        prefix := upper(NEW.nom) || 'X';
    END IF;
    
    -- Format: AnYYYYMMDDHHMISS
    time_part := 'An' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS');
    
    -- Random 3 digits
    random_part := lpad(floor(random() * 1000)::text, 3, '0');
    
    NEW.matricule := prefix || time_part || random_part;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generer_matricule
BEFORE INSERT ON patients
FOR EACH ROW
WHEN (NEW.matricule IS NULL)
EXECUTE FUNCTION generer_matricule_patient();


-- Fonction pour mettre à jour les totaux d'une facture
CREATE OR REPLACE FUNCTION update_facture_totals()
RETURNS TRIGGER AS $$
DECLARE
    f_id UUID;
    v_total DECIMAL(12,2) := 0;
    v_remise DECIMAL(12,2) := 0;
BEGIN
    IF TG_OP = 'DELETE' THEN
        f_id := OLD.facture_id;
    ELSE
        f_id := NEW.facture_id;
    END IF;

    -- Calculer le total des lignes
    SELECT COALESCE(SUM(part_assure), 0) INTO v_total
    FROM facture_lignes
    WHERE facture_id = f_id;

    -- Mettre à jour la facture (on garde la remise actuelle pour calculer le net)
    UPDATE factures
    SET 
        total = v_total,
        total_net = v_total - remise,
        total_euro = (v_total - remise) / taux_euro,
        reste_a_payer = (v_total - remise) - montant_paye,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = f_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_facture_totals
AFTER INSERT OR UPDATE OR DELETE ON facture_lignes
FOR EACH ROW
EXECUTE FUNCTION update_facture_totals();


-- Fonction pour mettre à jour le reste à payer suite à un paiement
CREATE OR REPLACE FUNCTION update_facture_payments()
RETURNS TRIGGER AS $$
DECLARE
    f_id UUID;
    v_montant_paye DECIMAL(12,2) := 0;
BEGIN
    IF TG_OP = 'DELETE' THEN
        f_id := OLD.facture_id;
    ELSE
        f_id := NEW.facture_id;
    END IF;

    -- Calculer le total payé
    SELECT COALESCE(SUM(montant), 0) INTO v_montant_paye
    FROM paiements
    WHERE facture_id = f_id;

    -- Mettre à jour la facture
    UPDATE factures
    SET 
        montant_paye = v_montant_paye,
        reste_a_payer = total_net - v_montant_paye,
        statut = CASE 
                    WHEN (total_net - v_montant_paye) <= 0 THEN 'payee'::statut_facture
                    WHEN v_montant_paye > 0 THEN 'partiellement_payee'::statut_facture
                    ELSE 'validee'::statut_facture
                 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = f_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_facture_payments
AFTER INSERT OR UPDATE OR DELETE ON paiements
FOR EACH ROW
EXECUTE FUNCTION update_facture_payments();

-- ==========================================
-- 5. DONNÉES PAR DÉFAUT
-- ==========================================

INSERT INTO parametres_clinique (
    nom_clinique, adresse, bp, telephone, mobile, email, ville, pays
) VALUES (
    'Clinique Médico-Chirurgicale NANAN - CMENA',
    'Bouaké',
    'BP1339 Bouaké 01',
    '(+225) 2731633563',
    '0505022777',
    'cmenabke@hotmail.fr',
    'Bouaké',
    'Côte d''Ivoire'
);

INSERT INTO actes_medicaux (code, libelle, categorie, prix_unitaire) VALUES
('CONS_GEN', 'Consultation Généraliste', 'consultation', 5000),
('CONS_SPE', 'Consultation Spécialiste', 'consultation', 10000),
('LAB_SANG', 'Analyses Laboratoire (Sang)', 'laboratoire', 2000),
('LAB_URINE', 'Analyses Laboratoire (Urine)', 'laboratoire', 1500),
('PHARM_01', 'Produits de pharmacie', 'pharmacie', 1000),
('SOINS_J', 'SOINS D''UN JOUR', 'soins', 15000),
('MEO_06', 'Mise en Observation MEO -06h de temps', 'hospitalisation', 10000);

-- ==========================================
-- 6. POLITIQUES RLS (Row Level Security)
-- ==========================================

-- Activation RLS sur toutes les tables
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE praticiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_assurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE actes_medicaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres_clinique ENABLE ROW LEVEL SECURITY;

-- Politiques de base (à affiner selon les besoins de l'application)
CREATE POLICY "Allow all for authenticated users" ON utilisateurs FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON praticiens FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON patients FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON assurances FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON patient_assurances FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON actes_medicaux FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON consultations FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON factures FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON facture_lignes FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON paiements FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON parametres_clinique FOR ALL USING (true);
