export default {
  async scheduled(event, env, ctx) {
    const BATCH = 10;
    let totalSent = 0;
    let totalErrors = 0;

    for (let i = 0; i < 10; i++) {
      const url = new URL('/api/cron/send-alerts', env.SITE_URL);
      url.searchParams.set('frequency', 'weekly');
      url.searchParams.set('limit', String(BATCH));

      const res = await fetch(url.toString(), {
        headers: {
          'x-cron-secret': env.CRON_SECRET,
          'user-agent': 'CuratedCanada-Cron/1.0',
        },
      });

      if (!res.ok) {
        console.error(`[cron] batch ${i} failed: ${res.status} ${await res.text()}`);
        break;
      }

      const body = await res.json();
      totalSent += body.sent ?? 0;
      totalErrors += body.errors ?? 0;

      console.log(`[cron] batch ${i}: sent=${body.sent} errors=${body.errors}`);

      // If a batch returned fewer than BATCH groups, we've drained the queue.
      if ((body.results?.length ?? 0) < BATCH) {
        console.log(`[cron] done: ${totalSent} sent, ${totalErrors} errors`);
        return;
      }
    }

    console.warn(`[cron] hit loop limit: ${totalSent} sent, ${totalErrors} errors`);
  },
};