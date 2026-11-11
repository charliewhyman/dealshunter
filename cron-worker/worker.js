export default {
  async scheduled(event, env, ctx) {
    const BATCH = 10; // the max batch that fits the CPU budget
    let totalSent = 0;
    let totalErrors = 0;

    for (let i = 0; i < 50; i++) {  // upper bound to prevent infinite loops
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
        console.error(`[cron] batch ${i} failed: ${res.status}`);
        break;
      }

      const body = await res.json();
      totalSent += body.sent ?? 0;
      totalErrors += body.errors ?? 0;

      // If this batch sent fewer than BATCH, we've drained the queue.
      if ((body.sent ?? 0) < BATCH) {
        console.log(`[cron] done: ${totalSent} sent, ${totalErrors} errors`);
        return;
      }
    }

    console.error(`[cron] hit loop limit: ${totalSent} sent, ${totalErrors} errors`);
  },
};