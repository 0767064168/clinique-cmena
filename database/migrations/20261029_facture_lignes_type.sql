-- Migration: Ajout du type de ligne de facturation ('prestation' ou 'ordonnance')
-- Date: 2026-10-29

ALTER TABLE facture_lignes 
ADD COLUMN IF NOT EXISTS type_ligne VARCHAR(50) DEFAULT 'prestation';

COMMENT ON COLUMN facture_lignes.type_ligne IS 'Type de ligne: prestation (acte médical) ou ordonnance (produit/médicament délivré)';
