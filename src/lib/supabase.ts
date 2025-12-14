type ViteEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
};

type ViteImportMeta = ImportMeta & { env: ViteEnv };

let client: any = (typeof globalThis !== 'undefined' ? (globalThis as any).__supabase_client : null) ?? null;
let initPromise: Promise<any> | null = null;

function readEnv() {
  const importMetaEnv = (typeof import.meta !== 'undefined'
    ? (import.meta as ViteImportMeta).env
    : undefined) as ViteEnv | undefined;

  const supabaseUrl = importMetaEnv?.VITE_SUPABASE_URL ?? (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined) ?? '';
  const supabaseKey = importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ?? (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY : undefined) ?? '';

  return { supabaseUrl, supabaseKey };
}

export async function getSupabase() {
  if (client) return client;

  const { supabaseUrl, supabaseKey } = readEnv();

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or PUBLISHABLE KEY is not set. Provide via VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY or process.env.');
  }

  if (initPromise) return await initPromise;

  initPromise = (async () => {
    const mod = await import('@supabase/supabase-js');
    const createClient = (mod as any).createClient as typeof import('@supabase/supabase-js').createClient;

    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__supabase_client = client;
    }

    initPromise = null;
    return client;
  })();

  return await initPromise;
}