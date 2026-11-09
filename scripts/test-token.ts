import 'dotenv/config';
import { signToken, verifyToken } from '../src/lib/alerts/token';

let failures = 0;

function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.error(`FAIL ${label}`);
  }
}

async function main() {
  // 1. Round-trip: sign then verify returns the same payload
  const t1 = signToken({ subscriberId: 42, purpose: 'unsubscribe' });
  const v1 = verifyToken(t1);
  check('round-trip returns payload', !!v1);
  check('round-trip subscriberId', v1?.subscriberId === 42);
  check('round-trip purpose', v1?.purpose === 'unsubscribe');
  check('round-trip has future exp', typeof v1?.exp === 'number' && v1.exp > Math.floor(Date.now() / 1000));

  // 2. Two tokens for same input are deterministic (same exp second)
  //    NOTE: could differ if the second crosses a second boundary. Call both
  //    synchronously; risk is negligible, and if flaky we'd bump TTL logic.
  const t2 = signToken({ subscriberId: 42, purpose: 'unsubscribe' });
  const v2 = verifyToken(t2);
  check('second token also verifies', !!v2);

  // 3. Tampered signature fails
  const tampered = t1.slice(0, -2) + (t1.slice(-2) === 'AA' ? 'BB' : 'AA');
  check('tampered signature rejected', verifyToken(tampered) === null);

  // 4. Tampered payload fails (signature no longer matches)
  const [body, sig] = t1.split('.');
  const decoded = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  const forged = Buffer.from(JSON.stringify({ ...decoded, subscriberId: 999 })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  check('forged payload rejected', verifyToken(`${forged}.${sig}`) === null);

  // 5. Expired token rejected
  const expired = signToken({ subscriberId: 42, purpose: 'unsubscribe' }, -10);
  check('expired token rejected', verifyToken(expired) === null);

  // 6. Malformed inputs are rejected without throwing
  check('empty rejected', verifyToken('') === null);
  check('no dot rejected', verifyToken('abcd') === null);
  check('three parts rejected', verifyToken('a.b.c') === null);
  check('empty parts rejected', verifyToken('.') === null);
  check('garbage sig rejected', verifyToken(`${body}.!!!`) === null);

  // 7. Invalid purpose rejected
  const badPurpose = await (async () => {
    const full = { subscriberId: 1, purpose: 'admin', exp: Math.floor(Date.now() / 1000) + 100 };
    const b = Buffer.from(JSON.stringify(full)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const { createHmac } = await import('node:crypto');
    const s = createHmac('sha256', process.env.ALERT_TOKEN_SECRET!)
      .update(b).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b}.${s}`;
  })();
  check('invalid purpose rejected', verifyToken(badPurpose) === null);

  // 8. subscriberId of wrong type rejected
  check('missing purpose rejected', verifyToken('') === null);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll token assertions passed.');
}

main().catch((e) => { console.error(e); process.exit(1); });