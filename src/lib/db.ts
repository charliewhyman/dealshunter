// src/lib/db.ts
import { neon } from '@neondatabase/serverless';

/**
 * Resolve DATABASE_URL across three runtimes:
 *
 * - Astro / Cloudflare Workers: `import.meta.env.DATABASE_URL` is populated
 *   by Astro's build-time env loader. This is the primary path.
 * - tsx scripts (`npx tsx scripts/*.ts`): `import.meta.env` doesn't exist,
 *   and `dotenv/config` puts the value in `process.env`. Fall through.
 * - Anywhere else (tests, REPL): `process.env` is the only source.
 *
 * The `typeof import.meta.env !== 'undefined'` guard prevents a ReferenceError
 * in runtimes where `import.meta.env` is not defined (e.g., bare Node with
 * tsx, which does not inject Vite env).
 */
const url =
  (typeof import.meta.env !== 'undefined' && import.meta.env.DATABASE_URL) ||
  process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    'DATABASE_URL is not set. In Astro/Cloudflare it must be provided as an ' +
    'environment variable (or a Cloudflare secret). For local scripts, ensure ' +
    '.env contains DATABASE_URL and that the script imports "dotenv/config".'
  );
}

/**
 * Neon serverless driver over HTTP.
 *
 * Use the POOLED connection string from the Neon Console (the hostname ends
 * in `-pooler`). PgBouncer-backed pooling prevents connection exhaustion when
 * many concurrent requests hit the DB (e.g., a cron job sending N emails, each
 * issuing a query). Direct (non-pooled) connections are fine for one-off
 * scripts but should not be used by the deployed Worker.
 */
export const sql = neon(url);

/**
 * Typed query wrapper.
 *
 * The Neon HTTP driver's tagged template has no generic type argument — the
 * promise resolves to `Record<string, unknown>[]` regardless of the SQL.
 * This wrapper casts the result to `T[]` at the call site so callers get
 * column-name types without reaching into driver internals.
 *
 * The cast is `as unknown as` because the driver's tagged-template signature
 * (NeonQueryFunction) is complex enough that a direct `as` fails to narrow.
 * Keeping the double-cast confined to this function means no other module
 * has to think about the driver's transport generics.
 *
 * Usage:
 *   const rows = await query<MyRow>`
 *     SELECT id, title FROM products WHERE id = ${id}
 *   `;
 */
export async function query<T>(
  template: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  return (await (sql as unknown as (
    t: TemplateStringsArray,
    ...v: unknown[]
  ) => Promise<unknown[]>)(template, ...values)) as T[];
}