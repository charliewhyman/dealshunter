type ViteEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
};

type ViteImportMeta = ImportMeta & { env: ViteEnv };

let client: ReturnType<any> | null = null;

function readEnv() {
  // Cloudflare Pages only has import.meta.env, not process.env
  const importMetaEnv = (import.meta as ViteImportMeta).env;

  const supabaseUrl = importMetaEnv?.VITE_SUPABASE_URL ?? '';
  const supabaseKey = importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

  return { supabaseUrl, supabaseKey };
}

export async function getSupabase() {
  if (client) return client;

  const { supabaseUrl, supabaseKey } = readEnv();

  if (!supabaseUrl || !supabaseKey) {
    const errorMsg = 'Supabase URL or PUBLISHABLE KEY is not set. ' +
      'Provide via VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ' +
      'in Cloudflare Pages environment variables.';
    
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const mod = await import('@supabase/supabase-js');
  const createClient = (mod as any).createClient as typeof import('@supabase/supabase-js').createClient;

  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return client;
}