export default {
  async scheduled(event, env, ctx) {
    const url = new URL('/api/cron/send-alerts', env.SITE_URL);
    url.searchParams.set('frequency', 'weekly');
    url.searchParams.set('limit', '50');

    const res = await fetch(url.toString(), {
      headers: {
        'x-cron-secret': env.CRON_SECRET,
        'user-agent': 'CuratedCanada-Cron/1.0',
      },
    });

    if (!res.ok) {
      console.error(`[cron] failed: ${res.status} ${await res.text()}`);
      return;
    }

    const body = await res.json();
    console.log(
      `[cron] sent=${body.sent} errors=${body.errors} ` +
      `dry_run=${body.dry_run} results=${body.results?.length ?? 0}`
    );
  },
};