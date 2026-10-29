-- schema.sql pour Clinique Médico-Chirurgicale NANAN - CMENA
-- Généré pour Supabase (PostgreSQL)

-- Activer l'extension pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Espace privé utilisé pour les données internes du serveur (sessions, etc.)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

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
    type_ligne VARCHAR(50) DEFAULT 'prestation',
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
 
-- 12. produits_pharmacie
CREATE TABLE produits_pharmacie (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE,
    designation VARCHAR(255) NOT NULL,
    categorie VARCHAR(100) NOT NULL DEFAULT 'medicament' CHECK (categorie IN ('medicament', 'consommable', 'materiel', 'dispositif_medical')),
    forme VARCHAR(100),
    dosage VARCHAR(100),
    unite VARCHAR(50) DEFAULT 'unite',
    prix_achat DECIMAL(12,2) DEFAULT 0,
    prix_vente DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_actuel INTEGER DEFAULT 0 CHECK (stock_actuel >= 0),
    stock_minimum INTEGER DEFAULT 5 CHECK (stock_minimum >= 0),
    emplacement VARCHAR(100),
    fournisseur VARCHAR(255),
    date_peremption DATE,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. mouvements_stock
CREATE TABLE mouvements_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produit_id UUID NOT NULL REFERENCES produits_pharmacie(id) ON DELETE CASCADE,
    type_mouvement VARCHAR(20) NOT NULL CHECK (type_mouvement IN ('entree', 'sortie')),
    quantite INTEGER NOT NULL CHECK (quantite > 0),
    stock_avant INTEGER NOT NULL CHECK (stock_avant >= 0),
    stock_apres INTEGER NOT NULL CHECK (stock_apres >= 0),
    motif VARCHAR(255),
    reference VARCHAR(100),
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    utilisateur_nom VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX idx_produits_pharmacie_code ON produits_pharmacie(code);
CREATE INDEX idx_produits_pharmacie_categorie ON produits_pharmacie(categorie);
CREATE INDEX idx_produits_pharmacie_stock ON produits_pharmacie(stock_actuel);
CREATE INDEX idx_produits_pharmacie_actif ON produits_pharmacie(actif);
CREATE INDEX idx_produits_pharmacie_actif_designation ON produits_pharmacie(designation, id) WHERE actif = true;
CREATE INDEX idx_mouvements_stock_produit ON mouvements_stock(produit_id);
CREATE INDEX idx_mouvements_stock_type ON mouvements_stock(type_mouvement);
CREATE INDEX idx_mouvements_stock_created ON mouvements_stock(created_at DESC);

-- Paginated pharmacy list and global stock statistics
CREATE OR REPLACE FUNCTION get_pharmacy_products_page(
    p_search TEXT DEFAULT NULL,
    p_category TEXT DEFAULT NULL,
    p_stock_alert BOOLEAN DEFAULT false,
    p_expired BOOLEAN DEFAULT false,
    p_today DATE DEFAULT CURRENT_DATE,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    WITH
    stock_stats AS (
        SELECT
            COUNT(*) AS total_products,
            COALESCE(SUM(stock_actuel * prix_vente), 0) AS total_stock_value,
            COUNT(*) FILTER (WHERE stock_actuel <= stock_minimum) AS low_stock_products,
            COUNT(*) FILTER (WHERE stock_actuel <= 0) AS out_of_stock_products,
            COUNT(*) FILTER (WHERE date_peremption IS NOT NULL AND date_peremption < p_today) AS expired_products
        FROM produits_pharmacie
        WHERE actif = true
          AND (p_search IS NULL OR designation ILIKE '%' || p_search || '%' OR code ILIKE '%' || p_search || '%')
          AND (p_category IS NULL OR categorie = p_category)
    ),
    filtered_count AS (
        SELECT COUNT(*) AS total_count
        FROM produits_pharmacie
        WHERE actif = true
          AND (p_search IS NULL OR designation ILIKE '%' || p_search || '%' OR code ILIKE '%' || p_search || '%')
          AND (p_category IS NULL OR categorie = p_category)
          AND (NOT p_stock_alert OR stock_actuel <= stock_minimum)
          AND (NOT p_expired OR (date_peremption IS NOT NULL AND date_peremption < p_today))
    ),
    page_rows AS (
        SELECT *
        FROM produits_pharmacie
        WHERE actif = true
          AND (p_search IS NULL OR designation ILIKE '%' || p_search || '%' OR code ILIKE '%' || p_search || '%')
          AND (p_category IS NULL OR categorie = p_category)
          AND (NOT p_stock_alert OR stock_actuel <= stock_minimum)
          AND (NOT p_expired OR (date_peremption IS NOT NULL AND date_peremption < p_today))
        ORDER BY designation ASC, id ASC
        LIMIT LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100)
        OFFSET (LEAST(GREATEST(COALESCE(p_page, 1), 1), 1000000) - 1)
            * LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100)
    )
    SELECT jsonb_build_object(
        'products', COALESCE((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY designation ASC, id ASC) FROM page_rows), '[]'::jsonb),
        'total_count', (SELECT total_count FROM filtered_count),
        'stats', (SELECT jsonb_build_object(
            'totalProduits', total_products,
            'totalValeurStock', total_stock_value,
            'produitsEnAlerte', low_stock_products,
            'produitsEnRupture', out_of_stock_products,
            'produitsPerimes', expired_products
        ) FROM stock_stats)
    );
$$;

GRANT EXECUTE ON FUNCTION get_pharmacy_products_page(TEXT, TEXT, BOOLEAN, BOOLEAN, DATE, INTEGER, INTEGER)
    TO anon, authenticated;

-- ==========================================
-- 4. FONCTIONS ET TRIGGERS
-- ==========================================

-- Fonction pour mettre à jour le timestamp d'un produit pharmaceutique
CREATE OR REPLACE FUNCTION update_produits_pharmacie_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_produits_pharmacie_timestamp
BEFORE UPDATE ON produits_pharmacie
FOR EACH ROW
EXECUTE FUNCTION update_produits_pharmacie_timestamp();

-- Fonction pour valider les mouvements de stock
CREATE OR REPLACE FUNCTION validate_stock_mouvement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantite <= 0 THEN
        RAISE EXCEPTION 'La quantité du mouvement doit être supérieure à 0';
    END IF;

    IF NEW.type_mouvement = 'entree' AND NEW.stock_apres <> NEW.stock_avant + NEW.quantite THEN
        RAISE EXCEPTION 'Pour une entrée, le stock final doit être égal au stock initial + quantité';
    END IF;

    IF NEW.type_mouvement = 'sortie' AND NEW.stock_apres <> NEW.stock_avant - NEW.quantite THEN
        RAISE EXCEPTION 'Pour une sortie, le stock final doit être égal au stock initial - quantité';
    END IF;

    IF NEW.stock_apres < 0 THEN
        RAISE EXCEPTION 'Le stock final ne peut pas être négatif';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_stock_mouvement
BEFORE INSERT OR UPDATE ON mouvements_stock
FOR EACH ROW
EXECUTE FUNCTION validate_stock_mouvement();

-- Fonction pour synchroniser le stock du produit après chaque mouvement
CREATE OR REPLACE FUNCTION sync_produit_stock_from_mouvement()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE produits_pharmacie
    SET stock_actuel = NEW.stock_apres,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.produit_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_produit_stock_from_mouvement
AFTER INSERT OR UPDATE OF stock_apres, quantite, type_mouvement ON mouvements_stock
FOR EACH ROW
EXECUTE FUNCTION sync_produit_stock_from_mouvement();

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

INSERT INTO produits_pharmacie (
    id, code, designation, categorie, forme, dosage, unite,
    prix_achat, prix_vente, stock_actuel, stock_minimum,
    emplacement, fournisseur, date_peremption, actif
) VALUES
('11111111-1111-4111-8111-111111111111', 'MED-001', 'Paracétamol 500 mg', 'medicament', 'Comprimé', '500 mg', 'boîte', 350.00, 500.00, 80, 20, 'Étagère A1', 'Pharmacie Centrale', '2027-12-31', true),
('22222222-2222-4222-8222-222222222222', 'MED-002', 'Amoxicilline 500 mg', 'medicament', 'Capsule', '500 mg', 'boîte', 900.00, 1300.00, 40, 10, 'Étagère B2', 'Pharmacie Centrale', '2026-11-30', true),
('33333333-3333-4333-8333-333333333333', 'CONS-001', 'Gaze Stérile 10x10', 'consommable', 'Pansement', '10x10 cm', 'boîte', 1800.00, 2600.00, 30, 8, 'Armoire C3', 'Fournisseur Médical SA', '2028-06-15', true),
('44444444-4444-4444-8444-444444444444', 'MAT-001', 'Set de perfusion', 'materiel', 'Kit', '1 unité', 'kit', 4500.00, 7200.00, 15, 5, 'Armoire D1', 'Matériel Clinique', '2029-09-01', true),
('55555555-5555-4555-8555-555555555555', 'DIS-001', 'Masque chirurgical', 'dispositif_medical', 'Masque', 'FFP2', 'boîte', 2500.00, 3800.00, 12, 6, 'Stock de sécurité', 'Protection Santé', '2028-03-21', true);

INSERT INTO mouvements_stock (
    id, produit_id, type_mouvement, quantite, stock_avant, stock_apres,
    motif, reference, utilisateur_nom
) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'entree', 80, 0, 80, 'Stock initial', 'Achat initial', 'Système'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'entree', 40, 0, 40, 'Stock initial', 'Achat initial', 'Système'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'entree', 30, 0, 30, 'Stock initial', 'Achat initial', 'Système'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 'entree', 15, 0, 15, 'Stock initial', 'Achat initial', 'Système'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555', 'entree', 12, 0, 12, 'Stock initial', 'Achat initial', 'Système');

INSERT INTO produits_pharmacie (
    id, code, designation, categorie, forme, dosage, unite,
    prix_achat, prix_vente, stock_actuel, stock_minimum,
    emplacement, fournisseur, date_peremption, actif
) VALUES
('66666666-6666-4666-8666-666666666666', 'MED-003', 'Sérum physiologique 500 ml', 'medicament', 'Solution', '500 ml', 'flacon', 1200.00, 1750.00, 3, 10, 'Frigo A2', 'Laboratoire Santé', '2026-10-01', true),
('77777777-7777-4777-8777-777777777777', 'CONS-002', 'Compresses stériles', 'consommable', 'Pansement', '10 cm', 'boîte', 900.00, 1400.00, 2, 8, 'Armoire B1', 'Fournisseur Médical SA', '2026-09-15', true);

INSERT INTO mouvements_stock (
    id, produit_id, type_mouvement, quantite, stock_avant, stock_apres,
    motif, reference, utilisateur_nom
) VALUES
('ffffffff-ffff-4fff-8fff-ffffffffffff', '66666666-6666-4666-8666-666666666666', 'entree', 3, 0, 3, 'Stock initial', 'Achat initial', 'Système'),
('10101010-1010-4101-8101-101010101010', '77777777-7777-4777-8777-777777777777', 'entree', 2, 0, 2, 'Stock initial', 'Achat initial', 'Système');

CREATE VIEW v_pharmacie_stock AS
SELECT
    p.id,
    p.code,
    p.designation,
    p.categorie,
    p.forme,
    p.unite,
    p.stock_actuel,
    p.stock_minimum,
    p.date_peremption,
    COALESCE((p.stock_actuel * p.prix_vente), 0) AS valeur_stock,
    CASE
        WHEN p.stock_actuel <= p.stock_minimum THEN TRUE
        ELSE FALSE
    END AS est_en_alerte,
    CASE
        WHEN p.date_peremption IS NOT NULL AND p.date_peremption < CURRENT_DATE THEN TRUE
        ELSE FALSE
    END AS est_perime,
    CASE
        WHEN p.stock_actuel <= p.stock_minimum THEN 'Alerte'
        WHEN p.stock_actuel <= 0 THEN 'Rupture'
        ELSE 'OK'
    END AS statut_stock
FROM produits_pharmacie p
WHERE p.actif = TRUE;

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
ALTER TABLE produits_pharmacie ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements_stock ENABLE ROW LEVEL SECURITY;

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
CREATE POLICY "Allow all for authenticated users" ON produits_pharmacie FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated users" ON mouvements_stock FOR ALL USING (true);
