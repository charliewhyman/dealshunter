// src/lib/supabase.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

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

let clientPromise: Promise<SupabaseClientType> | null = null;

function readEnv(): { supabaseUrl: string; supabaseKey: string } {
  // Read environment both from `import.meta.env` (Vite/Cloudflare) and
  // from the global process env (local dev / Node). Prefer Vite values
  // but fall back to common process.env names to make local dev easier.
  const importMetaEnv = ((import.meta as ViteImportMeta)?.env) || ({} as ViteEnv);
  type ProcEnv = Record<string, string | undefined>;
  const procEnv = (((globalThis as unknown) as { process?: { env?: ProcEnv } }).process?.env) || ({} as ProcEnv);

  const supabaseUrl =
    importMetaEnv?.VITE_SUPABASE_URL ||
    importMetaEnv?.PUBLIC_SUPABASE_URL ||
    procEnv?.VITE_SUPABASE_URL ||
    procEnv?.PUBLIC_SUPABASE_URL ||
    procEnv?.SUPABASE_URL ||
    '';

  const supabaseKey =
    importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    importMetaEnv?.VITE_SUPABASE_ANON_KEY ||
    procEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    procEnv?.VITE_SUPABASE_ANON_KEY ||
    procEnv?.SUPABASE_ANON_KEY ||
    procEnv?.SUPABASE_KEY ||
    '';

  return { supabaseUrl, supabaseKey };
}

export async function getSupabase(): Promise<SupabaseClientType> {
  if (client) return client;

  // If a creation is already in progress, reuse it so createClient is
  // only invoked once even with concurrent callers.
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      let { supabaseUrl, supabaseKey } = readEnv();

      // If running in Node and values are still missing, try loading `.env`
      // via `dotenv` (if available) so `process.env` gets populated. This is
      // a more standard and robust approach than manual parsing and helps
      // tools/scripts that expect env vars to be available on process.env.
      if ((typeof process !== 'undefined' && (process as unknown as { versions?: { node?: string } }).versions?.node) && (!supabaseUrl || !supabaseKey)) {
        try {
          const path = await import('path');
          const dotenv = await import('dotenv');
          const envPath = path.join(process.cwd(), '.env');
          try {
            dotenv.config?.({ path: envPath });
          } catch {
            // ignore
          }
          const refreshed = readEnv();
          supabaseUrl = supabaseUrl || refreshed.supabaseUrl;
          supabaseKey = supabaseKey || refreshed.supabaseKey;
        } catch {
          // ignore if dotenv isn't installed or import fails
        }
      }

      // Browser runtime fallback: sometimes `import.meta.env` is not populated
      if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseKey)) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 1500);
          const resp = await fetch('/env.json', { signal: controller.signal });
          clearTimeout(timeout);
          if (resp?.ok) {
            const json = await resp.json();
            supabaseUrl = supabaseUrl || json?.VITE_SUPABASE_URL || json?.PUBLIC_SUPABASE_URL || json?.SUPABASE_URL;
            supabaseKey = supabaseKey || json?.VITE_SUPABASE_PUBLISHABLE_KEY || json?.VITE_SUPABASE_ANON_KEY || json?.SUPABASE_KEY;
          }
        } catch {
          // ignore fetch errors — best-effort
        }
      }

      // Node fallback: read a local `.env` file if present
      if ((typeof process !== 'undefined' && (process as unknown as { versions?: { node?: string } }).versions?.node) && (!supabaseUrl || !supabaseKey)) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const envPath = path.join(process.cwd(), '.env');
          if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const parsed = content
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => {
                const m = l.match(/^([^=#]+)\s*=\s*(.*)$/);
                if (!m) return null as null | [string, string];
                const k = m[1].trim();
                let v = m[2].trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                  v = v.slice(1, -1);
                }
                return [k, v] as [string, string];
              })
              .filter(Boolean) as Array<[string, string]>;

            const map = Object.fromEntries(parsed);
            supabaseUrl = supabaseUrl || map['VITE_SUPABASE_URL'] || map['PUBLIC_SUPABASE_URL'] || map['SUPABASE_URL'];
            supabaseKey = supabaseKey || map['VITE_SUPABASE_PUBLISHABLE_KEY'] || map['VITE_SUPABASE_ANON_KEY'] || map['SUPABASE_KEY'] || map['SUPABASE_ANON_KEY'];
          }
        } catch {
          // ignore
        }
      }

      if (!supabaseUrl || !supabaseKey) {
        const importMetaEnv = ((import.meta as ViteImportMeta)?.env) || ({} as ViteEnv);
        type ProcEnv = Record<string, string | undefined>;
        const procEnv = (((globalThis as unknown) as { process?: { env?: ProcEnv } }).process?.env) || ({} as ProcEnv);

        const errorMsg = `Supabase configuration missing.\n\nURL: ${supabaseUrl ? '✓' : '✗'}\nKey: ${supabaseKey ? '✓' : '✗'}\n\nPlease ensure the Supabase variables are provided for your environment.\n- For Vite / Cloudflare Pages: set \`VITE_SUPABASE_URL\` and \`VITE_SUPABASE_PUBLISHABLE_KEY\`.\n- For local dev: you can set \`SUPABASE_URL\` and \`SUPABASE_KEY\` (or the Vite names) in your shell or .env file.\n\nCurrent values (import.meta.env / process.env):\nimport.meta.env.VITE_SUPABASE_URL: ${importMetaEnv?.VITE_SUPABASE_URL ? 'Set' : 'Not set'}\nimport.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY: ${importMetaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ? 'Set' : 'Not set'}\nprocess.env.SUPABASE_URL: ${procEnv?.SUPABASE_URL ? 'Set' : 'Not set'}\nprocess.env.SUPABASE_KEY: ${procEnv?.SUPABASE_KEY ? 'Set' : 'Not set'}\nprocess.env.SUPABASE_ANON_KEY: ${procEnv?.SUPABASE_ANON_KEY ? 'Set' : 'Not set'}\n`;

        console.error(errorMsg);
        throw new Error('Supabase configuration is missing. See console for details.');
      }

      client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });

      return client;
    } catch (err) {
      // Clear the promise so callers can retry on subsequent attempts.
      clientPromise = null;
      throw err;
    }
  })();

  return clientPromise;
}