import { getDb } from '../server/db.js';
import dotenv from 'dotenv';
import { sql } from 'kysely';

dotenv.config();

async function createTable() {
    const dbUrl = process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Database connection string is missing');
    }

    const db = getDb(dbUrl);

    try {
        console.log('Creating subscribers table...');

        await sql`
            CREATE TABLE IF NOT EXISTS subscribers (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                ip_address TEXT,
                source TEXT,
                consent_given BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `.execute(db);

        console.log('Successfully created subscribers table.');
    } catch (error) {
        console.error('Error creating table:', error);
    } finally {
        await db.destroy();
    }
}

createTable();
