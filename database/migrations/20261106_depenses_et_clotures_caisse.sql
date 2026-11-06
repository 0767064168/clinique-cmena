-- Migration: Dépenses de Caisse PostgreSQL & Clôtures Z Journalières Formelles Archivées
-- Date: 2026-11-06
-- Clinique Médico-Chirurgicale NANAN (CMENA) / Centre de Santé GSPM 3e Cie Bouaké

-- 1. Table depenses_caisse (Migration depuis JSON local vers PostgreSQL)
CREATE TABLE IF NOT EXISTS depenses_caisse (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    heure VARCHAR(10),
    motif VARCHAR(255) NOT NULL,
    montant DECIMAL(12,2) NOT NULL CHECK (montant > 0),
    beneficiaire VARCHAR(255) DEFAULT '-',
    categorie VARCHAR(100) DEFAULT 'autre',
    justificatif_ref VARCHAR(100),
    utilisateur_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    utilisateur_nom VARCHAR(255) DEFAULT 'Caissier',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_depenses_caisse_date ON depenses_caisse(date);
CREATE INDEX IF NOT EXISTS idx_depenses_caisse_categorie ON depenses_caisse(categorie);

-- 2. Table clotures_caisse (Archivage formel des arrêtés de caisse journaliers)
CREATE TABLE IF NOT EXISTS clotures_caisse (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_cloture VARCHAR(50) UNIQUE NOT NULL,
    date_cloture DATE NOT NULL,
    date_heure TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    caissier_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    caissier_nom VARCHAR(255) NOT NULL,
    total_encaissements DECIMAL(12,2) DEFAULT 0,
    total_especes_theorique DECIMAL(12,2) DEFAULT 0,
    total_mobile_money DECIMAL(12,2) DEFAULT 0,
    total_autres DECIMAL(12,2) DEFAULT 0,
    nb_transactions INTEGER DEFAULT 0,
    total_depenses DECIMAL(12,2) DEFAULT 0,
    nb_depenses INTEGER DEFAULT 0,
    solde_net_theorique DECIMAL(12,2) DEFAULT 0,
    solde_especes_physique DECIMAL(12,2) NOT NULL,
    ecart_caisse DECIMAL(12,2) DEFAULT 0,
    fond_caisse_suivant DECIMAL(12,2) DEFAULT 0,
    billetage JSONB DEFAULT '{}'::jsonb,
    statut VARCHAR(50) DEFAULT 'cloturee' CHECK (statut IN ('cloturee', 'validee', 'reouverte')),
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clotures_caisse_date ON clotures_caisse(date_cloture);
CREATE INDEX IF NOT EXISTS idx_clotures_caisse_numero ON clotures_caisse(numero_cloture);

-- 3. Sécurité RLS
ALTER TABLE depenses_caisse ENABLE ROW LEVEL SECURITY;
ALTER TABLE clotures_caisse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all depenses for authenticated users" ON depenses_caisse FOR ALL USING (true);
CREATE POLICY "Allow all clotures for authenticated users" ON clotures_caisse FOR ALL USING (true);
