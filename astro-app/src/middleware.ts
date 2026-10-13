import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { app } from '../server/app';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/')) {
    // Astro v6 on Cloudflare: env comes from the cloudflare:workers module.
    // In dev/preview, wrangler reads .dev.vars and populates this too.
    const ctx = {
      waitUntil: () => {},
      passThroughOnException: () => {},
    };

    return app.fetch(context.request, env as any, ctx as any);
  }

  return next();
});