import type { APIRoute } from 'astro';
import { sendAlerts, pruneSentLogs } from '../../../lib/alerts/send';
import type { AlertFrequency } from '../../../lib/types';

export const prerender = false;

/**
 * Cron endpoint hit by the curatedcanada-cron Worker every Monday.
 *
 * Safety gates (checked in order):
 *   1. CRON_SECRET must match the request's x-cron-secret header or
 *      ?secret= query parameter. This prevents arbitrary clients from
 *      triggering sends.
 *   2. LIVE_SEND_ENABLED must be "true" to actually deliver emails. When
 *      unset or "false", the endpoint forces dryRun and no email is sent,
 *      no matter how many subscribers match.
 *   3. When LIVE_SEND_ENABLED is true and ALERT_TEST_RECIPIENTS is set,
 *      only subscribers whose email appears in that comma-separated list
 *      can receive emails. This is the "test with real sender but don't
 *      touch real users" gate. Remove ALERT_TEST_RECIPIENTS to send to
 *      everyone.
 */
export const GET: APIRoute = async ({ request, url }) => {
  // Gate 1: auth
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ ok: false, error: 'CRON_SECRET unset on server' }, 500);
  }
  const provided =
    request.headers.get('x-cron-secret') ?? url.searchParams.get('secret') ?? '';
  if (provided !== secret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  // Gate 2: kill switch
  const liveSend = process.env.LIVE_SEND_ENABLED === 'true';

  // Gate 3: allowlist (only enforced when liveSend is on)
  const allowlist = (process.env.ALERT_TEST_RECIPIENTS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  // If the kill switch is off, force dry-run regardless of the ?dry param.
  // If the kill switch is on, honor ?dry=1 for manual dry-runs.
  const dryRun = !liveSend || url.searchParams.get('dry') === '1';

  const freqParam = url.searchParams.get('frequency');
  const frequency: AlertFrequency | undefined =
    freqParam === 'instant' || freqParam === 'daily' || freqParam === 'weekly'
      ? freqParam
      : undefined;

  try {
    const report = await sendAlerts({
      frequency,
      dryRun,
      emailAllowlist: allowlist.length > 0 ? allowlist : undefined,
    });

    // Prune sent_log once per day. The 'daily' frequency run is the
    // natural place — it's the only one that fires once per day, so this
    // avoids running the prune on every instant/weekly call.
    const pruned =
      frequency === 'daily' && liveSend ? await pruneSentLogs(30) : 0;

    return json({
      ok: true,
      frequency: frequency ?? 'all',
      live_send_enabled: liveSend,
      dry_run: dryRun,
      allowlist_active: allowlist.length > 0,
      allowlist_size: allowlist.length,
      sent: report.results.filter(r => r.status === 'sent').length,
      skipped: report.results.filter(
        r => r.status === 'dry-run' || r.status === 'skipped'
      ).length,
      errors: report.results.filter(r => r.status === 'error').length,
      rate_limited: report.rateLimited,
      rate_limit_message: report.rateLimitMessage,
      pruned_subscribers: pruned,
      results: report.results,
    });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
};

/**
 * Small helper so every response has a consistent content type and the
 * happy path doesn't repeat `, 200`. Error paths pass an explicit status.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}