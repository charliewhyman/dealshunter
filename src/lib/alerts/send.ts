import { Resend } from 'resend';
import { sql } from '../db';
import { matchRuleAlerts, matchWatchAlerts } from './match';
import { groupMatches, type SubscriberGroup } from './grouping';
import { renderDigest } from './render';
import type { AlertFrequency } from '../types';

const FROM = process.env.ALERT_FROM_EMAIL ?? 'deals@curatedcanada.ca';
const DEFAULT_LIMIT = 100;

export type SendStatus = 'sent' | 'dry-run' | 'error' | 'skipped';

export type SendResult = {
  subscriber_id: number;
  email: string;
  frequency: AlertFrequency;
  item_count: number;
  status: SendStatus;
  error?: string;
};

export type SendOptions = {
  frequency?: AlertFrequency;
  subscriberId?: number;
  dryRun?: boolean;
  limit?: number;
};

export type SendReport = {
  results: SendResult[];
  /** True when the loop stopped early because Resend returned 429. */
  rateLimited: boolean;
  /** Human-readable rate-limit message if applicable. */
  rateLimitMessage?: string;
};

/**
 * Send alert emails for the given frequency (or all frequencies if unset).
 *
 * Design notes baked into this function:
 * - Groups are sorted by item count desc before applying `limit`, so a capped
 *   batch prioritizes the subscribers with the most content to show.
 * - Per-subscriber try/catch — one bad email address does not abort the batch.
 * - Resend 429 breaks the loop *without* marking remaining groups as sent, so
 *   the next cron run picks them up. Duplicate risk is preferable to a dropped
 *   alert because the dedupe window is 7 days and a duplicate weekly email is
 *   a minor annoyance.
 * - `recordSent` runs *after* a successful send. If it fails, we log and
 *   continue — the email was delivered, accept the duplicate-on-retry risk.
 */
export async function sendAlerts(opts: SendOptions = {}): Promise<SendReport> {
  const dryRun = opts.dryRun ?? false;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const [ruleMatches, watchMatches] = await Promise.all([
    matchRuleAlerts({ subscriberId: opts.subscriberId, frequency: opts.frequency }),
    matchWatchAlerts({ subscriberId: opts.subscriberId, frequency: opts.frequency }),
  ]);

  if (ruleMatches.length === 0 && watchMatches.length === 0) {
    return { results: [], rateLimited: false };
  }

  // Sort groups so the highest-value subscribers survive the `limit` cap.
  const groups = groupMatches(ruleMatches, watchMatches).sort(
    (a, b) => b.items.length - a.items.length
  );

  const capped = groups.slice(0, limit);
  const skippedByCap = groups.length - capped.length;

  const results: SendResult[] = [];

  // Record any groups we didn't get to because of the limit, so the caller
  // (and the dry-run output) can see that the cap was hit.
  if (skippedByCap > 0) {
    for (const g of groups.slice(limit)) {
      results.push({
        subscriber_id: g.subscriber_id,
        email: g.email,
        frequency: g.frequency,
        item_count: g.items.length,
        status: 'skipped',
        error: `limit reached (${limit})`,
      });
    }
  }

  const resend = dryRun ? null : new Resend(process.env.RESEND_API_KEY ?? '');

  for (const group of capped) {
    const rendered = renderDigest(group);

    if (!resend) {
      results.push({
        subscriber_id: group.subscriber_id,
        email: group.email,
        frequency: group.frequency,
        item_count: group.items.length,
        status: 'dry-run',
      });
      continue;
    }

    try {
      const res = await resend.emails.send({
        from: FROM,
        to: group.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (res.error) {
        // Resend returns errors in the response body, not as thrown errors.
        const msg = res.error.message ?? 'unknown resend error';
        const isRateLimit =
          (res.error as { name?: string }).name === 'rate_limit_exceeded' ||
          /rate.?limit/i.test(msg) ||
          res.error.statusCode === 429;

        if (isRateLimit) {
          results.push({
            subscriber_id: group.subscriber_id,
            email: group.email,
            frequency: group.frequency,
            item_count: group.items.length,
            status: 'error',
            error: 'rate limited by Resend; remaining groups will retry next run',
          });
          return { results, rateLimited: true, rateLimitMessage: msg };
        }

        results.push({
          subscriber_id: group.subscriber_id,
          email: group.email,
          frequency: group.frequency,
          item_count: group.items.length,
          status: 'error',
          error: msg,
        });
        continue;
      }

      // Success path: log the send. If recordSent fails, log to console and
      // continue — the email was delivered, and next run may resend. See the
      // design note in the docblock.
      try {
        await recordSent(group);
      } catch (err) {
        console.error(
          `[alerts] recordSent failed for subscriber ${group.subscriber_id} — email was delivered but sent_log was not updated:`,
          err
        );
      }

      results.push({
        subscriber_id: group.subscriber_id,
        email: group.email,
        frequency: group.frequency,
        item_count: group.items.length,
        status: 'sent',
      });
    } catch (err) {
      // Anything thrown by the SDK itself (network, DNS, serialization).
      const msg = (err as Error).message ?? 'unknown send error';
      const isRateLimit = /rate.?limit|429/i.test(msg);
      if (isRateLimit) {
        results.push({
          subscriber_id: group.subscriber_id,
          email: group.email,
          frequency: group.frequency,
          item_count: group.items.length,
          status: 'error',
          error: 'rate limited by Resend; remaining groups will retry next run',
        });
        return { results, rateLimited: true, rateLimitMessage: msg };
      }
      results.push({
        subscriber_id: group.subscriber_id,
        email: group.email,
        frequency: group.frequency,
        item_count: group.items.length,
        status: 'error',
        error: msg,
      });
      // continue to next group — one failure must not abort the batch
    }
  }

  return { results, rateLimited: false };
}

/**
 * Append a group's sent_log_entries to alert_rules.sent_log, then trim to
 * the most recent 200 entries by sent_at desc.
 *
 * The JSON.stringify(...)::jsonb pattern is required because the Neon HTTP
 * driver serializes a JS Array as a Postgres array literal (text[]), not JSON.
 * Explicit ::jsonb cast tells Postgres how to interpret the string.
 */
async function recordSent(group: SubscriberGroup): Promise<void> {
  const entriesJson = JSON.stringify(group.sent_log_entries);

  await sql`
    UPDATE alert_rules
    SET sent_log = (
      SELECT jsonb_agg(e)
      FROM (
        SELECT e
        FROM jsonb_array_elements(sent_log || ${entriesJson}::jsonb) e
        ORDER BY (e->>'sent_at')::timestamptz DESC
        LIMIT 200
      ) t
    ),
    updated_at = now()
    WHERE subscriber_id = ${group.subscriber_id}
  `;
}

/**
 * Trim sent_log entries older than `days` across all subscribers.
 * Call once per day from the endpoint, not per-run.
 */
export async function pruneSentLogs(days = 30): Promise<number> {
  const rows = await sql`
    UPDATE alert_rules
    SET sent_log = (
      SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
      FROM jsonb_array_elements(sent_log) e
      WHERE (e->>'sent_at')::timestamptz > now() - ${days}::int * interval '1 day'
    )
    WHERE jsonb_array_length(sent_log) > 0
    RETURNING subscriber_id
  `;
  return rows.length;
}