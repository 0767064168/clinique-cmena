-- Migration: Table de gestion des rendez-vous médicaux et agenda praticiens
-- Date: 2026-11-06
-- Clinique Médico-Chirurgicale NANAN (CMENA) / Centre de Santé GSPM 3e Cie Bouaké

-- 1. Table rendez_vous
CREATE TABLE IF NOT EXISTS rendez_vous (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    praticien_id UUID REFERENCES praticiens(id) ON DELETE SET NULL,
    date_heure TIMESTAMP WITH TIME ZONE NOT NULL,
    duree_minutes INTEGER DEFAULT 30 CHECK (duree_minutes > 0),
    motif VARCHAR(255) NOT NULL,
    statut VARCHAR(50) DEFAULT 'programme' CHECK (statut IN ('programme', 'confirme', 'en_attente', 'termine', 'annule', 'absent')),
    notes TEXT,
    consultation_id UUID REFERENCES consultations(id) ON DELETE SET NULL,
    rappel_envoye BOOLEAN DEFAULT false,
    created_by UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_rendez_vous_patient ON rendez_vous(patient_id);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_praticien ON rendez_vous(praticien_id);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_date_heure ON rendez_vous(date_heure);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_statut ON rendez_vous(statut);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_consultation ON rendez_vous(consultation_id);

-- 3. Sécurité RLS
ALTER TABLE rendez_vous ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture autorisee pour utilisateurs authentifies" 
ON rendez_vous FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Insertion autorisee pour utilisateurs authentifies" 
ON rendez_vous FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Modification autorisee pour utilisateurs authentifies" 
ON rendez_vous FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Suppression autorisee pour utilisateurs authentifies" 
ON rendez_vous FOR DELETE 
TO authenticated 
USING (true);

-- 4. Trigger de mise à jour timestamp
CREATE OR REPLACE FUNCTION update_rendez_vous_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_rendez_vous_timestamp ON rendez_vous;
CREATE TRIGGER trigger_update_rendez_vous_timestamp
BEFORE UPDATE ON rendez_vous
FOR EACH ROW
EXECUTE FUNCTION update_rendez_vous_timestamp();
