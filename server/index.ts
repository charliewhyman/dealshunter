
import { serve } from '@hono/node-server';
import { app } from './app';
import dotenv from 'dotenv';

// Load .env explicitly if needed, though dotenv.config() typically finds it in cwd
dotenv.config();

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
    fetch: (request) => {
        // Pass process.env as the environment to Hono
        // This ensures c.env is populated in the middleware
        return app.fetch(request, { ...process.env } as any);
    },
    port
});
