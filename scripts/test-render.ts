import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderDigest } from '../src/lib/alerts/render';
import { verifyToken } from '../src/lib/alerts/token';
import type { SubscriberGroup } from '../src/lib/alerts/grouping';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS ${label}`);
  else {
    failures++;
    console.error(`FAIL ${label}`);
    if (detail !== undefined) console.error('  ', detail);
  }
}

function group(over: Partial<SubscriberGroup> = {}): SubscriberGroup {
  return {
    subscriber_id: 42,
    email: 'alice@example.com',
    frequency: 'weekly',
    total_matches: 0,
    rule_filters: null,
    items: [
      {
        product_id: '9000001',
        title: 'Linen Button-Down Shirt',
        shop_name: 'Example Brand',
        min_price: 45.0,
        max_discount_percentage: 40,
        image_url: 'https://example.com/shirt.jpg',
        product_url: 'https://example.com/products/shirt',
      },
      {
        product_id: '9000002',
        title: 'Wool Overcoat',
        shop_name: null,
        min_price: 189.99,
        max_discount_percentage: 25,
        image_url: null,
        product_url: null,
      },
    ],
    sent_log_entries: [],
    ...over,
  };
}

mkdirSync('tmp', { recursive: true });

// ----------------------------------------------------------------------------
// 1. Structure: subject/html/text all present, subject varies with count
// ----------------------------------------------------------------------------
{
  const single = renderDigest(group({ items: [group().items[0]] }));
  check('single item subject mentions title', /Deal alert: .*Linen/.test(single.subject));
  check('single item html non-empty', single.html.length > 500);
  check('single item text non-empty', single.text.length > 40);

  const multi = renderDigest(group());
  check('multi item subject counts deals', /^2 new deals for you$/.test(multi.subject));
}

// ----------------------------------------------------------------------------
// 2. Frequency affects copy
// ----------------------------------------------------------------------------
{
  check('weekly copy', renderDigest(group({ frequency: 'weekly' })).html.includes('this week'));
  check('daily copy', renderDigest(group({ frequency: 'daily' })).html.includes('today'));
  check('instant copy', renderDigest(group({ frequency: 'instant' })).html.includes('just now'));
}

// ----------------------------------------------------------------------------
// 3. Prices and discounts formatted correctly
// ----------------------------------------------------------------------------
{
  const r = renderDigest(group());
  check('price formatted $45.00', r.html.includes('$45.00'));
  check('price formatted $189.99', r.html.includes('$189.99'));
  check('discount rendered -40%', r.html.includes('-40%'));
  check('discount rendered -25%', r.html.includes('-25%'));
}

// ----------------------------------------------------------------------------
// 4. Unsubscribe and manage tokens are valid and decode to the right subscriber
// ----------------------------------------------------------------------------
{
  const r = renderDigest(group());
  const unsubMatch = r.html.match(/\/alerts\/unsubscribe\?token=([^"&]+)/);
  const manageMatch = r.html.match(/\/account\/alerts\?token=([^"&]+)/);
  check('unsubscribe link present', !!unsubMatch);
  check('manage link present', !!manageMatch);

  if (unsubMatch) {
    const p = verifyToken(decodeURIComponent(unsubMatch[1]));
    check('unsubscribe token decodes', !!p);
    check('unsubscribe token subscriber_id', p?.subscriberId === 42);
    check('unsubscribe token purpose', p?.purpose === 'unsubscribe');
  }
  if (manageMatch) {
    const p = verifyToken(decodeURIComponent(manageMatch[1]));
    check('manage token decodes', !!p);
    check('manage token subscriber_id', p?.subscriberId === 42);
    check('manage token purpose', p?.purpose === 'manage');
  }
}

// ----------------------------------------------------------------------------
// 5. Text version contains every product and both links
// ----------------------------------------------------------------------------
{
  const r = renderDigest(group());
  check('text has item 1 title', r.text.includes('Linen Button-Down Shirt'));
  check('text has item 2 title', r.text.includes('Wool Overcoat'));
  check('text has product URLs', r.text.includes('https://example.com/products/shirt'));
  check('text has unsubscribe link', r.text.includes('/alerts/unsubscribe?token='));
  check('text has manage link', r.text.includes('/account/alerts?token='));
}

// ----------------------------------------------------------------------------
// 6. Product with no URL falls back to /product/<id>
// ----------------------------------------------------------------------------
{
  const r = renderDigest(group({ items: [group().items[1]] }));
  check('fallback product URL', r.html.includes('/product/9000002'));
}

// ----------------------------------------------------------------------------
// 7. Escaping: titles with special characters don't break HTML
// ----------------------------------------------------------------------------
{
  const r = renderDigest(group({
    items: [{
      ...group().items[0],
      title: 'Tom & Jerry "Special" <script>alert(1)</script>',
    }],
  }));
  check('ampersand escaped', r.html.includes('Tom &amp; Jerry'));
  check('quote escaped', r.html.includes('&quot;Special&quot;'));
  check('script tag escaped', !r.html.includes('<script>alert'));
  check('script tag escaped form present', r.html.includes('&lt;script&gt;'));
}

// ----------------------------------------------------------------------------
// 8. Writing previews — the point of this test file
// ----------------------------------------------------------------------------
{
  const weekly = group({ frequency: 'weekly' });
  writeFileSync('tmp/preview-weekly.html', renderDigest(weekly).html);

  const instant = group({
    frequency: 'instant',
    items: [group().items[0]],
  });
  writeFileSync('tmp/preview-instant.html', renderDigest(instant).html);

  const single = group({ items: [group().items[0]], frequency: 'daily' });
  writeFileSync('tmp/preview-daily-single.html', renderDigest(single).html);

  const text = renderDigest(weekly).text;
  writeFileSync('tmp/preview-weekly.txt', text);
  check('preview files written', true);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll render assertions passed.');
console.log('Open tmp/preview-weekly.html in a browser to inspect visually.');