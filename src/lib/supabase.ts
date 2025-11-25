import { createClient } from '@supabase/supabase-js';

type ViteEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
};

type ViteImportMeta = ImportMeta & { env: ViteEnv };

const importMetaEnv = (typeof import.meta !== 'undefined'
  ? (import.meta as ViteImportMeta).env
  : undefined) as ViteEnv | undefined;

const supabaseUrl = importMetaEnv?.VITE_SUPABASE_URL ?? (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined) ?? '';
const supabaseKey = importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ?? (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY : undefined) ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or PUBLISHABLE KEY is not set. Provide via VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY or process.env.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });