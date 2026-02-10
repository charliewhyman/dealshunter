import * as path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { Migrator, FileMigrationProvider } from 'kysely';
import { getDb } from './db';
import dotenv from 'dotenv';

// Load env vars
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
    const dbUrl = process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('Database connection string is missing');
    }

    // Initialize DB client for migration
    const db = getDb(dbUrl);

    const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
            fs,
            path,
            // Migrations folder is at project root/migrations, so go up one level from server/
            migrationFolder: path.join(__dirname, '../migrations'),
        }),
    });

    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((it) => {
        if (it.status === 'Success') {
            console.log(`Migration "${it.migrationName}" was executed successfully`);
        } else if (it.status === 'Error') {
            console.error(`failed to execute migration "${it.migrationName}"`);
        }
    });

    if (error) {
        console.error('failed to migrate');
        console.error(error);
        process.exit(1);
    }

    await db.destroy();
}

migrate();
