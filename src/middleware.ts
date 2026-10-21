import { defineMiddleware } from 'astro:middleware';
import { env, waitUntil } from 'cloudflare:workers';
import { app } from '../server/app';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) {
    const bindings = env as {
      VITE_DATABASE_URL: string;
      DATABASE_URL?: string;
    };

    // Hono only reads waitUntil and passThroughOnException from the
    // ExecutionContext. Delegate waitUntil to the Worker runtime's
    // implementation so background work isn't dropped; passThroughOnException
    // stays a no-op (nothing in this app needs it).
    const ctx = {
      waitUntil,
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    return app.fetch(context.request, bindings, ctx);
  }

  return next();
});