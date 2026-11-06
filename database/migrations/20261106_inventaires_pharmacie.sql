-- Migration: Inventaires Physiques Périodiques & Gestion des Écarts de Stock Pharmacie
-- Date: 2026-11-06
-- Clinique Médico-Chirurgicale NANAN (CMENA) / Centre de Santé GSPM 3e Cie Bouaké

-- 1. Table inventaires_pharmacie (Sessions d'inventaire)
CREATE TABLE IF NOT EXISTS inventaires_pharmacie (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_inventaire VARCHAR(50) UNIQUE NOT NULL,
    date_inventaire DATE NOT NULL DEFAULT CURRENT_DATE,
    titre VARCHAR(255) NOT NULL,
    categorie_cible VARCHAR(100) DEFAULT 'toutes',
    responsable_id UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    responsable_nom VARCHAR(255) NOT NULL,
    statut VARCHAR(50) DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'valide', 'annule')),
    total_articles INTEGER DEFAULT 0,
    articles_comptes INTEGER DEFAULT 0,
    articles_avec_ecart INTEGER DEFAULT 0,
    valeur_theorique DECIMAL(12,2) DEFAULT 0,
    valeur_physique DECIMAL(12,2) DEFAULT 0,
    valeur_ecart DECIMAL(12,2) DEFAULT 0,
    date_validation TIMESTAMP WITH TIME ZONE,
    valide_par_nom VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventaires_numero ON inventaires_pharmacie(numero_inventaire);
CREATE INDEX IF NOT EXISTS idx_inventaires_date ON inventaires_pharmacie(date_inventaire);
CREATE INDEX IF NOT EXISTS idx_inventaires_statut ON inventaires_pharmacie(statut);

-- 2. Table inventaire_lignes (Détail produit par produit du comptage)
CREATE TABLE IF NOT EXISTS inventaire_lignes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventaire_id UUID NOT NULL REFERENCES inventaires_pharmacie(id) ON DELETE CASCADE,
    produit_id UUID NOT NULL REFERENCES produits_pharmacie(id) ON DELETE CASCADE,
    designation VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    categorie VARCHAR(100),
    forme VARCHAR(100),
    emplacement VARCHAR(100),
    prix_achat DECIMAL(12,2) DEFAULT 0,
    prix_vente DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_theorique INTEGER NOT NULL DEFAULT 0,
    stock_physique INTEGER,
    ecart INTEGER,
    valeur_ecart DECIMAL(12,2) DEFAULT 0,
    date_peremption_theorique DATE,
    date_peremption_reelle DATE,
    notes TEXT,
    statut VARCHAR(50) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'conforme', 'surplus', 'manquant')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_lignes_inventaire ON inventaire_lignes(inventaire_id);
CREATE INDEX IF NOT EXISTS idx_inv_lignes_produit ON inventaire_lignes(produit_id);

-- 3. Sécurité RLS
ALTER TABLE inventaires_pharmacie ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventaire_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all inventaires for authenticated users" ON inventaires_pharmacie FOR ALL USING (true);
CREATE POLICY "Allow all inventaire_lignes for authenticated users" ON inventaire_lignes FOR ALL USING (true);
