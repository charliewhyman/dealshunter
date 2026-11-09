# curatedcanada-cron

Cloudflare Worker that hits the Astro `/api/cron/send-alerts` endpoint on schedule.

## Deploy

    npm run deploy

**Always use `npm run deploy`, never `npx wrangler deploy`.** The npm script passes
`-c ./wrangler.toml` to force Wrangler to read this folder's config instead of the
parent Astro project's `dist/server/wrangler.json` redirect. Running `wrangler deploy`
directly from this folder will deploy to `dealshunter-astro` and break the site.