
import { Kysely } from 'kysely';
import { NeonDialect } from 'kysely-neon';
import { neon, neonConfig } from '@neondatabase/serverless';
import { Database } from '../src/lib/types';
// Load environment variables
// dotenv is loaded by the runner (local) or platform (Cloudflare)
// dotenv.config({ path: path.resolve(process.cwd(), '.env') });




let cachedDb: Kysely<Database> | null = null;

export const getDb = (connectionUrl: string) => {
    if (cachedDb) return cachedDb;

    cachedDb = new Kysely<Database>({
        dialect: new NeonDialect({
            neon: neon(connectionUrl),
        }),
    });

    return cachedDb;
};

export const initDb = (url: string) => {
    console.log('initDb called with URL length:', url?.length);
    getDb(url);
};

// For backward compatibility / local dev where process.env is available
export const db = new Proxy({} as Kysely<Database>, {
    get: (_target, prop) => {
        // If initialized explicitly (e.g. by Cloudflare middleware), use it
        if (cachedDb) return (cachedDb as any)[prop];

        // Fallback to process.env for Node.js
        const url = process.env.VITE_DATABASE_URL || process.env.VITE_POSTGREST_URL || process.env.DATABASE_URL;
        if (!url) {
            throw new Error('Database connection string is not set.');
        }
        const instance = getDb(url);
        return (instance as any)[prop];
    }
});

