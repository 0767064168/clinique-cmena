/**
 * Configuration du client Supabase
 * Clinique Médico-Chirurgicale NANAN (CMENA)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Si l'URL fournie est une chaîne de connexion PostgreSQL, extraire l'URL d'API HTTPS Supabase
if (supabaseUrl && (supabaseUrl.startsWith('postgres://') || supabaseUrl.startsWith('postgresql://'))) {
  const match = supabaseUrl.match(/@db\.([a-z0-9_-]+)\.supabase\.co/i);
  if (match) {
    supabaseUrl = `https://${match[1]}.supabase.co`;
  }
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Avertissement : Les variables d\'environnement SUPABASE_URL ou SUPABASE_ANON_KEY ne sont pas configurées.');
  console.warn('   Vérifiez le fichier .env de votre projet.');
}

// Client Supabase standard
const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Client Supabase avec privilèges de service (administrateur)
const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    )
  : supabase;

// Exportation par défaut et nommée pour une flexibilité maximale
module.exports = supabase;
module.exports.supabase = supabase;
module.exports.supabaseAdmin = supabaseAdmin;
