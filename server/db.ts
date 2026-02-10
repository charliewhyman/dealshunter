
import { Kysely } from 'kysely';
import { NeonDialect } from 'kysely-neon';
import { neon } from '@neondatabase/serverless';
import { Database } from '../src/lib/types';

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

