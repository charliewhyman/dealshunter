import 'dotenv/config';
import { sendAlerts } from '../src/lib/alerts/send';
import { verifyToken } from '../src/lib/alerts/token';
import { sql } from '../src/lib/db';

const SUBSCRIBER_ID = Number(process.argv[2] ?? 50);
const TARGET_EMAIL = process.argv[3]; // required when domain is unverified
const FROM_OVERRIDE = process.argv[4] ?? 'onboarding@resend.dev';

if (!TARGET_EMAIL) {
  console.error(
    'Usage: npx tsx scripts/test-send.ts <subscriberId> <targetEmail> [fromEmail]\n' +
    '\n' +
    '  targetEmail MUST be the email you signed up to Resend with if the\n' +
    '  sending domain is unverified. Use onboarding@resend.dev as fromEmail\n' +
    '  until curatedcanada.ca is verified.'
  );
  process.exit(1);
}

async function main() {
  console.log('Test send');
  console.log('  subscriber_id:', SUBSCRIBER_ID);
  console.log('  target email: ', TARGET_EMAIL);
  console.log('  from override:', FROM_OVERRIDE);
  console.log('');

  // 1. Show what would match before we send
  console.log('[1/5] Checking current match state...');
  const before = await sql`
    SELECT sent_log
    FROM alert_rules
    WHERE subscriber_id = ${SUBSCRIBER_ID}
  `;
  if (before.length === 0) {
    console.error(`No alert_rules row for subscriber ${SUBSCRIBER_ID}. Seed one first.`);
    process.exit(1);
  }
  const beforeLog = before[0].sent_log as Array<{ rule_id: string; product_id: string; sent_at: string }>;
  console.log(`      sent_log entries before: ${beforeLog.length}`);

  // 2. Override FROM just for this test
  process.env.ALERT_FROM_EMAIL = FROM_OVERRIDE;

  // 3. Send for real (dryRun: false), capped at 1 group
  console.log('[2/5] Calling sendAlerts (live)...');
  const report = await sendAlerts({
    subscriberId: SUBSCRIBER_ID,
    limit: 1,
    dryRun: false,
  });

  if (report.results.length === 0) {
    console.log('      No matches. Nothing was sent (probably deduped from a prior run).');
    console.log('      To reset: UPDATE alert_rules SET sent_log = \'[]\'::jsonb WHERE subscriber_id = ' + SUBSCRIBER_ID + ';');
    process.exit(0);
  }

  const r = report.results[0];
  console.log(`      status:       ${r.status}`);
  console.log(`      item_count:   ${r.item_count}`);
  if (r.error) console.log(`      error:        ${r.error}`);
  console.log('');

  if (r.status === 'error') {
    if (/domain.*not verified/i.test(r.error ?? '')) {
      console.log('FAIL: Domain not verified. Two options:');
      console.log('  1. Verify curatedcanada.ca in Resend (DNS records, ~10 min propagation)');
      console.log('  2. Re-run with target = your Resend account email, from = onboarding@resend.dev');
      console.log('');
      console.log(`     npx tsx scripts/test-send.ts ${SUBSCRIBER_ID} <your-resend-signup-email> onboarding@resend.dev`);
    } else if (/testing emails to your own email/i.test(r.error ?? '')) {
      console.log('FAIL: Resend is rejecting because the target is not your account email.');
      console.log('      Re-run with target = the email you signed up to Resend with.');
    } else {
      console.log('FAIL: unknown Resend error — see message above.');
    }
    process.exit(1);
  }

  // 4. Read sent_log back to prove recordSent ran
  console.log('[3/5] Reading sent_log after send...');
  const after = await sql`
    SELECT sent_log
    FROM alert_rules
    WHERE subscriber_id = ${SUBSCRIBER_ID}
  `;
  const afterLog = after[0].sent_log as Array<{ rule_id: string; product_id: string; sent_at: string }>;
  console.log(`      sent_log entries after:  ${afterLog.length}`);
  const newEntries = afterLog.slice(0, afterLog.length - beforeLog.length);
  console.log(`      new entries:             ${newEntries.length}`);
  for (const e of newEntries) {
    console.log(`        - rule_id=${e.rule_id} product_id=${e.product_id}`);
  }
  console.log('');

  if (newEntries.length !== r.item_count) {
    console.log(`WARN: expected ${r.item_count} new log entries, got ${newEntries.length}.`);
    console.log('      recordSent may have trimmed older entries or written a different shape.');
  }

  // 5. Re-run to prove dedupe
  console.log('[4/5] Re-calling sendAlerts to prove dedupe...');
  const second = await sendAlerts({
    subscriberId: SUBSCRIBER_ID,
    limit: 1,
    dryRun: false,
  });
  console.log(`      second result count: ${second.results.length}`);
  if (second.results.length === 0) {
    console.log('      PASS — dedupe suppressed the second send.');
  } else {
    console.log('      FAIL — a second email would have been sent (dedupe broken).');
    process.exit(1);
  }
  console.log('');

  // 6. Verify the unsubscribe token from the sent group would decode
  //    (render.ts already signed it; we re-sign for a known subscriberId and
  //    verify, so we prove the token machinery end-to-end.)
  console.log('[5/5] Verifying token machinery on this subscriber...');
  const { signToken } = await import('../src/lib/alerts/token');
  const tok = signToken({ subscriberId: SUBSCRIBER_ID, purpose: 'unsubscribe' });
  const decoded = verifyToken(tok);
  if (decoded && decoded.subscriberId === SUBSCRIBER_ID && decoded.purpose === 'unsubscribe') {
    console.log('      PASS — token round-trips for this subscriber.');
  } else {
    console.log('      FAIL — token verify mismatch.');
    process.exit(1);
  }

  console.log('');
  console.log('All checks passed. Check your inbox for a message from', FROM_OVERRIDE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});