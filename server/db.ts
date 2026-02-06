
import { Kysely } from 'kysely';
import { NeonDialect } from 'kysely-neon';
import { neon, neonConfig } from '@neondatabase/serverless';
import { Database } from '../src/lib/types';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });



const connectionString = process.env.VITE_DATABASE_URL || process.env.VITE_POSTGREST_URL || process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('Database connection string is not set. Please set VITE_DATABASE_URL, VITE_POSTGREST_URL, or DATABASE_URL in your .env file.');
}

export const db = new Kysely<Database>({
    dialect: new NeonDialect({
        neon: neon(connectionString),
    }),
});
