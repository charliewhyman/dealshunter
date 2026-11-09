export default {
  async scheduled(event, env, ctx) {
    const url = new URL('/api/cron/send-alerts', env.SITE_URL);
    url.searchParams.set('frequency', event.cron.includes('*') && event.cron.split(' ')[1] === '*' ? 'instant' : 'weekly');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-cron-secret': env.CRON_SECRET,
        'user-agent': 'CuratedCanada-Cron/1.0',
      },
    });

    if (!res.ok) {
      console.error(`[curatedcanada-cron] failed: ${res.status} ${await res.text()}`);
    } else {
      console.log(`[curatedcanada-cron] ok: ${await res.text()}`);
    }
  },
};