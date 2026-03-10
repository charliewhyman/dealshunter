import { getDb } from '../server/db.js';
import dotenv from 'dotenv';
import { sql } from 'kysely';

dotenv.config();

async function checkSubscribers() {
    const dbUrl = process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Database connection string is missing');
    }

    const db = getDb(dbUrl);

    try {
        console.log('Inserting test subscriber...');

        await db.insertInto('subscribers')
            .values({
                email: 'test_subscribe@example.com',
                source: 'test_script',
                ip_address: '127.0.0.1',
                consent_given: true
            })
            // @ts-ignore
            .onConflict((oc) => oc.column('email').doNothing())
            .execute();

        console.log('Querying subscribers table...');
        const subscribers = await db.selectFrom('subscribers')
            .selectAll()
            // @ts-ignore
            .orderBy('created_at', 'desc')
            .limit(5)
            .execute();

        console.log('Latest subscribers:', subscribers);

    } catch (error) {
        console.error('Error querying table:', error);
    } finally {
        await db.destroy();
    }
}

checkSubscribers();
