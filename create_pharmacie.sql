-- ==============================================================================
-- Script SQL de création des tables Pharmacie & Consommables
-- Centre de Secours d'Urgence / CSA 3e Compagnie GSPM Bouaké
-- ==============================================================================

-- Activer l'extension UUID compatible avec le schéma principal du projet
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table des produits pharmaceutiques et consommables
CREATE TABLE IF NOT EXISTS public.produits_pharmacie (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- 3. Données de démonstration
INSERT INTO public.produits_pharmacie (
    id, code, designation, categorie, forme, dosage, unite,
    prix_achat, prix_vente, stock_actuel, stock_minimum,
    emplacement, fournisseur, date_peremption, actif
) VALUES
('11111111-1111-4111-8111-111111111111', 'MED-001', 'Paracétamol 500 mg', 'medicament', 'Comprimé', '500 mg', 'boîte', 350.00, 500.00, 80, 20, 'Étagère A1', 'Pharmacie Centrale', '2027-12-31', true),
('22222222-2222-4222-8222-222222222222', 'MED-002', 'Amoxicilline 500 mg', 'medicament', 'Capsule', '500 mg', 'boîte', 900.00, 1300.00, 40, 10, 'Étagère B2', 'Pharmacie Centrale', '2026-11-30', true),
('33333333-3333-4333-8333-333333333333', 'CONS-001', 'Gaze Stérile 10x10', 'consommable', 'Pansement', '10x10 cm', 'boîte', 1800.00, 2600.00, 30, 8, 'Armoire C3', 'Fournisseur Médical SA', '2028-06-15', true),
('44444444-4444-4444-8444-444444444444', 'MAT-001', 'Set de perfusion', 'materiel', 'Kit', '1 unité', 'kit', 4500.00, 7200.00, 15, 5, 'Armoire D1', 'Matériel Clinique', '2029-09-01', true),
('55555555-5555-4555-8555-555555555555', 'DIS-001', 'Masque chirurgical', 'dispositif_medical', 'Masque', 'FFP2', 'boîte', 2500.00, 3800.00, 12, 6, 'Stock de sécurité', 'Protection Santé', '2028-03-21', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mouvements_stock (
    id, produit_id, type_mouvement, quantite, stock_avant, stock_apres,
    motif, reference, utilisateur_nom
) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'entree', 80, 0, 80, 'Stock initial', 'Achat initial', 'Système'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'entree', 40, 0, 40, 'Stock initial', 'Achat initial', 'Système'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'entree', 30, 0, 30, 'Stock initial', 'Achat initial', 'Système'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 'entree', 15, 0, 15, 'Stock initial', 'Achat initial', 'Système'),
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '55555555-5555-4555-8555-555555555555', 'entree', 12, 0, 12, 'Stock initial', 'Achat initial', 'Système')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.produits_pharmacie (
    id, code, designation, categorie, forme, dosage, unite,
    prix_achat, prix_vente, stock_actuel, stock_minimum,
    emplacement, fournisseur, date_peremption, actif
) VALUES
('66666666-6666-4666-8666-666666666666', 'MED-003', 'Sérum physiologique 500 ml', 'medicament', 'Solution', '500 ml', 'flacon', 1200.00, 1750.00, 3, 10, 'Frigo A2', 'Laboratoire Santé', '2026-10-01', true),
('77777777-7777-4777-8777-777777777777', 'CONS-002', 'Compresses stériles', 'consommable', 'Pansement', '10 cm', 'boîte', 900.00, 1400.00, 2, 8, 'Armoire B1', 'Fournisseur Médical SA', '2026-09-15', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.mouvements_stock (
    id, produit_id, type_mouvement, quantite, stock_avant, stock_apres,
    motif, reference, utilisateur_nom
) VALUES
('ffffffff-ffff-4fff-8fff-ffffffffffff', '66666666-6666-4666-8666-666666666666', 'entree', 3, 0, 3, 'Stock initial', 'Achat initial', 'Système'),
('10101010-1010-4101-8101-101010101010', '77777777-7777-4777-8777-777777777777', 'entree', 2, 0, 2, 'Stock initial', 'Achat initial', 'Système')
ON CONFLICT (id) DO NOTHING;

CREATE VIEW public.v_pharmacie_stock AS
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
FROM public.produits_pharmacie p
WHERE p.actif = TRUE;

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
BEFORE INSERT OR UPDATE ON public.mouvements_stock
FOR EACH ROW
EXECUTE FUNCTION public.validate_stock_mouvement();

-- 5. Trigger pour synchroniser automatiquement le stock du produit
CREATE OR REPLACE FUNCTION public.sync_produit_stock_from_mouvement()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.produits_pharmacie
    SET stock_actuel = NEW.stock_apres,
        updated_at = NOW()
    WHERE id = NEW.produit_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_produit_stock_from_mouvement
AFTER INSERT OR UPDATE OF stock_apres, quantite, type_mouvement ON public.mouvements_stock
FOR EACH ROW
EXECUTE FUNCTION public.sync_produit_stock_from_mouvement();
