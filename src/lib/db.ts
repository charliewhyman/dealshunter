
import { Kysely } from 'kysely';
import { NeonDialect } from 'kysely-neon';
import { neon, neonConfig } from '@neondatabase/serverless';
import { Database } from './types';

neonConfig.disableWarningInBrowsers = true;

const connectionString = import.meta.env.VITE_DATABASE_URL;

if (!connectionString) {
    throw new Error('VITE_DATABASE_URL is not set in environment variables');
}

export const db = new Kysely<Database>({
    dialect: new NeonDialect({
        neon: neon(connectionString),
    }),
});
