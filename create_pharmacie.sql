-- ==============================================================================
-- Script SQL de création des tables Pharmacie & Consommables
-- Centre de Secours d'Urgence / CSA 3e Compagnie GSPM Bouaké
-- ==============================================================================

-- 1. Table des produits pharmaceutiques et consommables
CREATE TABLE IF NOT EXISTS public.produits_pharmacie (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE,                       -- Code produit (MED-001, CONS-015)
    designation VARCHAR(255) NOT NULL,              -- Nom / Désignation du produit
    categorie VARCHAR(100) NOT NULL DEFAULT 'medicament' CHECK (categorie IN ('medicament', 'consommable', 'materiel', 'dispositif_medical')),
    forme VARCHAR(100),                            -- Forme pharmaceutique (Comprimé, Sirop, Injectable, Pommade)
    dosage VARCHAR(100),                           -- Dosage (500mg, 10ml, etc.)
    unite VARCHAR(50) DEFAULT 'unité',             -- Unité de mesure (boîte, flacon, tube, sachet, unité)
    prix_achat DECIMAL(12,2) DEFAULT 0,            -- Prix d'achat HT
    prix_vente DECIMAL(12,2) NOT NULL DEFAULT 0,   -- Prix de vente en FCFA
    stock_actuel INTEGER DEFAULT 0 CHECK (stock_actuel >= 0), -- Quantité en stock
    stock_minimum INTEGER DEFAULT 5 CHECK (stock_minimum >= 0), -- Seuil d'alerte stock bas
    emplacement VARCHAR(100),                      -- Lieu de stockage (Étagère A, Armoire 2)
    fournisseur VARCHAR(255),                      -- Nom du fournisseur
    date_peremption DATE,                          -- Date de péremption
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Table de l'historique des mouvements de stock
CREATE TABLE IF NOT EXISTS public.mouvements_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produit_id UUID NOT NULL REFERENCES public.produits_pharmacie(id) ON DELETE CASCADE,
    type_mouvement VARCHAR(20) NOT NULL CHECK (type_mouvement IN ('entree', 'sortie')),
    quantite INTEGER NOT NULL CHECK (quantite > 0), -- Quantité du mouvement
    stock_avant INTEGER NOT NULL CHECK (stock_avant >= 0), -- Stock avant le mouvement
    stock_apres INTEGER NOT NULL CHECK (stock_apres >= 0), -- Stock après le mouvement
    motif VARCHAR(255),                            -- Motif (Approvisionnement, Dispensation patient, Périmé, Casse, Inventaire)
    reference VARCHAR(100),                        -- Référence (N° commande, nom du patient)
    utilisateur_id UUID,                           -- ID de l'utilisateur ayant effectué le mouvement
    utilisateur_nom VARCHAR(255),                  -- Nom de l'opérateur
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour des recherches rapides
CREATE INDEX IF NOT EXISTS idx_produits_code ON public.produits_pharmacie(code);
CREATE INDEX IF NOT EXISTS idx_produits_categorie ON public.produits_pharmacie(categorie);
CREATE INDEX IF NOT EXISTS idx_produits_stock ON public.produits_pharmacie(stock_actuel);
CREATE INDEX IF NOT EXISTS idx_produits_actif ON public.produits_pharmacie(actif);
CREATE INDEX IF NOT EXISTS idx_mouvements_produit ON public.mouvements_stock(produit_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_type ON public.mouvements_stock(type_mouvement);
CREATE INDEX IF NOT EXISTS idx_mouvements_created ON public.mouvements_stock(created_at DESC);

-- Activation de la sécurité RLS
ALTER TABLE public.produits_pharmacie ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mouvements_stock ENABLE ROW LEVEL SECURITY;

-- Politiques d'accès permissives pour l'application
CREATE POLICY "Permettre accès complet produits_pharmacie" ON public.produits_pharmacie
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Permettre accès complet mouvements_stock" ON public.mouvements_stock
    FOR ALL USING (true) WITH CHECK (true);

-- 3. Trigger pour mettre à jour la date de modification
CREATE OR REPLACE FUNCTION public.update_produits_pharmacie_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_produits_pharmacie_timestamp
BEFORE UPDATE ON public.produits_pharmacie
FOR EACH ROW
EXECUTE FUNCTION public.update_produits_pharmacie_timestamp();

-- 4. Trigger de validation des mouvements de stock
CREATE OR REPLACE FUNCTION public.validate_stock_mouvement()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantite <= 0 THEN
        RAISE EXCEPTION 'La quantité du mouvement doit être supérieure à 0';
    END IF;

    IF NEW.type_mouvement = 'sortie' AND NEW.stock_apres > NEW.stock_avant THEN
        RAISE EXCEPTION 'Un mouvement de sortie ne peut pas augmenter le stock';
    END IF;

    IF NEW.stock_apres < 0 THEN
        RAISE EXCEPTION 'Le stock final ne peut pas être négatif';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_stock_mouvement
BEFORE INSERT OR UPDATE ON public.mouvements_stock
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_mouvement();
