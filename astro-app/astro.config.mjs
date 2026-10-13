import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dealshunter.ca', // ← your real domain
  output: 'static',                // pure SSG — no SSR
  integrations: [react(), tailwind(), sitemap()],
  adapter: cloudflare({ imageService: 'compile' }),
});