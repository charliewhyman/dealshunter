import 'dotenv/config';
import { sendAlerts, type SendResult } from '../src/lib/alerts/send';
import type { AlertFrequency } from '../src/lib/types';

const SITE = process.env.ALERT_SITE_URL ?? 'https://curatedcanada.ca';

function printGroup(r: SendResult): void {
  const freq = r.frequency.padEnd(7);
  const items = `${r.item_count} item${r.item_count === 1 ? '' : 's'}`.padEnd(9);
  console.log(`  subscriber ${String(r.subscriber_id).padEnd(6)} <${r.email}> [${freq}] ${items}${r.error ? `  ${r.error}` : ''}`);
}

async function main() {
  const freqArg = process.argv[2];
  const frequency: AlertFrequency | undefined =
    freqArg === 'instant' || freqArg === 'daily' || freqArg === 'weekly'
      ? freqArg
      : undefined;

  const limitArg = process.argv[3];
  const limit = limitArg ? Number(limitArg) : undefined;

  if (process.env.RESEND_API_KEY === undefined) {
    console.error('RESEND_API_KEY is not set — dry-run does not need it, but the endpoint will.');
  }
  if (process.env.ALERT_TOKEN_SECRET === undefined) {
    console.error('ALERT_TOKEN_SECRET is not set — render.ts will fail at sign time.');
    process.exit(1);
  }

  console.log(`DRY RUN ${frequency ?? '(all frequencies)'}${limit ? ` limit=${limit}` : ''}`);
  console.log(`Site: ${SITE}\n`);

  const report = await sendAlerts({ frequency, limit, dryRun: true });

  if (report.results.length === 0) {
    console.log('No subscribers would be emailed right now.');
    return;
  }

  const byStatus = {
    'dry-run': report.results.filter(r => r.status === 'dry-run'),
    skipped:   report.results.filter(r => r.status === 'skipped'),
    sent:      report.results.filter(r => r.status === 'sent'),
    error:     report.results.filter(r => r.status === 'error'),
  };

  console.log(`${byStatus['dry-run'].length + byStatus.sent.length + byStatus.error.length} subscriber(s) would be emailed:\n`);
  for (const r of [...byStatus['dry-run'], ...byStatus.sent, ...byStatus.error]) {
    printGroup(r);
  }

  if (byStatus.skipped.length > 0) {
    console.log(`\n${byStatus.skipped.length} skipped (limit reached):`);
    for (const r of byStatus.skipped) printGroup(r);
  }

  console.log('\nNo emails sent (dry run).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});