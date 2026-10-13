import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { app } from '../server/app';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) {
    console.log('[middleware] env keys:', Object.keys(env || {}));
    console.log('[middleware] DATABASE_URL present:', !!(env as any)?.DATABASE_URL);
    console.log('[middleware] VITE_DATABASE_URL present:', !!(env as any)?.VITE_DATABASE_URL);

    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    };

    return app.fetch(context.request, env as any, ctx as any);
  }

  return next();
});