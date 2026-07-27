import { createClient } from '@supabase/supabase-js';

// Pull the environment variables you set up in your .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A quick safety check: If Vite can't find the .env file, it will throw an error here 
// instead of failing silently later!
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables! Please check your .env file.");
}

// 🚀 Create and export the Supabase client with robust offline-first session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage, // Locks session into local storage across window switches
  },
});