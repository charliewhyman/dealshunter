// src/lib/supabase.ts
type ViteEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
};

type ViteImportMeta = ImportMeta & { env: ViteEnv };

let client: ReturnType<any> | null = null;

function readEnv() {
  // Cloudflare Pages uses import.meta.env
  const importMetaEnv = (import.meta as ViteImportMeta).env;

  // Try multiple possible environment variable names
  const supabaseUrl = 
    importMetaEnv?.VITE_SUPABASE_URL || 
    importMetaEnv?.PUBLIC_SUPABASE_URL || // Some projects use this
    '';

  const supabaseKey = 
    importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';

  return { supabaseUrl, supabaseKey };
}

export async function getSupabase() {
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
      VITE_SUPABASE_URL: ${import.meta.env.VITE_SUPABASE_URL ? 'Set' : 'Not set'}
      VITE_SUPABASE_PUBLISHABLE_KEY: ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'Set' : 'Not set'}
    `;
    
    console.error(errorMsg);
    throw new Error('Supabase configuration is missing. Check console for details.');
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