// src/lib/supabase.ts
import type { SupabaseClient } from '@supabase/supabase-js';

type ViteEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
  PUBLIC_SUPABASE_URL?: string;
};

type ViteImportMeta = ImportMeta & { env: ViteEnv };

// Define the specific return type for createClient
type SupabaseClientType = SupabaseClient;

// Store the client with proper typing
let client: SupabaseClientType | null = null;

function readEnv(): { supabaseUrl: string; supabaseKey: string } {
  // Cloudflare Pages uses import.meta.env
  const importMetaEnv = (import.meta as ViteImportMeta).env;

  // Try multiple possible environment variable names
  const supabaseUrl = 
    importMetaEnv?.VITE_SUPABASE_URL || 
    importMetaEnv?.PUBLIC_SUPABASE_URL || // Some projects use this
    '';

  const supabaseKey = 
    importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    importMetaEnv?.VITE_SUPABASE_ANON_KEY || // Alternative name
    '';

  return { supabaseUrl, supabaseKey };
}

export async function getSupabase(): Promise<SupabaseClientType> {
  if (client) return client;

  const { supabaseUrl, supabaseKey } = readEnv();

  console.log('Supabase Config Check:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    url: supabaseUrl ? `${supabaseUrl.substring(0, 20)}...` : 'none',
    key: supabaseKey ? `${supabaseKey.substring(0, 10)}...` : 'none',
  });

  if (!supabaseUrl || !supabaseKey) {
    const errorMsg = `Supabase configuration missing. 
        URL: ${supabaseUrl ? '✓' : '✗'} 
        Key: ${supabaseKey ? '✓' : '✗'}
        
        Please ensure these environment variables are set in Cloudflare Pages:
        1. VITE_SUPABASE_URL=https://your-project.supabase.co
        2. VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
        
        Current values:
        VITE_SUPABASE_URL: ${((import.meta as ViteImportMeta).env.VITE_SUPABASE_URL) ? 'Set' : 'Not set'}
        VITE_SUPABASE_PUBLISHABLE_KEY: ${((import.meta as ViteImportMeta).env.VITE_SUPABASE_PUBLISHABLE_KEY) ? 'Set' : 'Not set'}
      `;
    
    console.error(errorMsg);
    throw new Error('Supabase configuration is missing. Check console for details.');
  }

  // Dynamic import with proper typing
  const { createClient } = await import('@supabase/supabase-js');

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}