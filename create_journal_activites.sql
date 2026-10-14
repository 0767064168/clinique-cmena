-- ==============================================================================
-- Script SQL d'initialisation de la table d'Audit (Journal de Traçabilité)
-- Centre de Secours d'Urgence / CSA 3e Compagnie GSPM Bouaké
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.journal_activites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,              -- Ex: FACTURE_VALIDEE, FACTURE_ANNULATION, PAIEMENT_ENCAISSE
    entite VARCHAR(50) NOT NULL,              -- Ex: facture, paiement, patient, utilisateur
    entite_id VARCHAR(100),                   -- ID de la facture ou du paiement concerné
    description TEXT NOT NULL,                -- Explication détaillée en français
    utilisateur_id UUID,                      -- ID du compte Supabase ou profil
    utilisateur_nom VARCHAR(255),             -- Nom complet de l'opérateur ou du médecin
    utilisateur_role VARCHAR(50),             -- Rôle (admin, caissier, agent, medecin)
    adresse_ip VARCHAR(50),                   -- Adresse IP de la requête
    details JSONB DEFAULT '{}'::jsonb,        -- Données d'audit additionnelles
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour des recherches instantanées sur les filtres
CREATE INDEX IF NOT EXISTS idx_journal_action ON public.journal_activites(action);
CREATE INDEX IF NOT EXISTS idx_journal_created_at ON public.journal_activites(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entite ON public.journal_activites(entite, entite_id);

-- Activation de RLS si nécessaire
ALTER TABLE public.journal_activites ENABLE ROW LEVEL SECURITY;

-- Politique d'accès : Seul le service_role ou l'administrateur peut lire et écrire
CREATE POLICY "Permettre lecture service_role et admin" ON public.journal_activites
    FOR ALL
    USING (true)
    WITH CHECK (true);
