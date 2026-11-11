import { Resend } from 'resend';
import { sql } from '../db';
import { matchRuleAlerts, matchWatchAlerts } from './match';
import { groupMatches, type SubscriberGroup } from './grouping';
import { renderDigest } from './render';
import type { AlertFrequency } from '../types';
import { signToken } from './token';

const DEFAULT_LIMIT = 100;
const SITE = process.env.ALERT_SITE_URL ?? 'https://curatedcanada.ca';

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
  emailAllowlist?: string[];
  resendApiKey?: string;
  fromEmail?: string;
};

export type SendReport = {
  results: SendResult[];
  rateLimited: boolean;
  rateLimitMessage?: string;
};

export async function sendAlerts(opts: SendOptions = {}): Promise<SendReport> {
  const dryRun = opts.dryRun ?? false;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const fromEmail = opts.fromEmail ?? process.env.ALERT_FROM_EMAIL ?? 'deals@curatedcanada.ca';
  const apiKey = opts.resendApiKey ?? process.env.RESEND_API_KEY ?? '';

  const [ruleMatches, watchMatches] = await Promise.all([
    matchRuleAlerts({
      subscriberId: opts.subscriberId,
      frequency: opts.frequency,
      subscriberLimit: limit,  // pass through as SQL-level limit
    }),
    matchWatchAlerts({ subscriberId: opts.subscriberId, frequency: opts.frequency }),
  ]);

  if (ruleMatches.length === 0 && watchMatches.length === 0) {
    return { results: [], rateLimited: false };
  }

  const allGroups = groupMatches(ruleMatches, watchMatches);

  // Apply the allowlist filter *before* the limit so a small allowlist is
  // never accidentally suppressed by sorting (e.g., allowlisted subscriber
  // has 1 item, non-allowlisted has 10 — without pre-filter, limit=5 would
  // drop the allowlisted one).
  const allowlist = (opts.emailAllowlist ?? [])
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const groups =
    allowlist.length > 0
      ? allGroups.filter(g => allowlist.includes(g.email.toLowerCase()))
      : allGroups;

  if (groups.length === 0) {
    return { results: [], rateLimited: false };
  }

  const sorted = groups.sort((a, b) => b.items.length - a.items.length);
  const capped = sorted.slice(0, limit);
  const skippedByCap = sorted.length - capped.length;

  const results: SendResult[] = [];

  if (skippedByCap > 0) {
    for (const g of sorted.slice(limit)) {
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

  const resend = dryRun ? null : new Resend(apiKey);

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
      await new Promise(r => setTimeout(r, 200));
      const unsubToken = signToken({ subscriberId: group.subscriber_id, purpose: 'unsubscribe' });
      const unsubUrl = `${SITE}/alerts/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
      
      const res = await resend.emails.send({
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>, <mailto:hello@curatedcanada.ca?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        from: fromEmail,
        to: group.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (res.error) {
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

      try {
        await recordSent(group);
      } catch (err) {
        console.error(
          `[alerts] recordSent failed for subscriber ${group.subscriber_id}. email was delivered but sent_log was not updated:`,
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
    }
  }

  return { results, rateLimited: false };
}

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