import { groupMatches } from '../src/lib/alerts/grouping';
import type { RuleMatch, WatchMatch } from '../src/lib/types';

let failures = 0;

function check(label: string, cond: boolean) {
  if (cond) console.log(`PASS ${label}`);
  else { failures++; console.error(`FAIL ${label}`); }
}

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`PASS ${label}`);
  else {
    failures++;
    console.error(`FAIL ${label}`);
    console.error(`  expected: ${e}`);
    console.error(`  actual:   ${a}`);
  }
}

const NOW = new Date('2026-11-08T12:00:00Z');

function ruleMatch(over: Partial<RuleMatch> = {}): RuleMatch {
  return {
    subscriber_id: 1,
    email: 'a@x.com',
    rule_id: 'r1',
    frequency: 'weekly',
    product_id: 100n,
    title: 'Product',
    min_price: 50,
    max_discount_percentage: 20,
    image_url: null,
    product_url: null,
    ...over,
  };
}

function watchMatch(over: Partial<WatchMatch> = {}): WatchMatch {
  return {
    subscriber_id: 1,
    email: 'a@x.com',
    watch_id: 'w1',
    frequency: 'instant',
    product_id: 200n,
    title: 'Watched',
    min_price: 40,
    max_discount_percentage: 10,
    image_url: null,
    product_url: null,
    ...over,
  };
}

// ----------------------------------------------------------------------------
// 1. Empty input -> empty output
// ----------------------------------------------------------------------------
eq('empty -> []', groupMatches([], [], NOW), []);

// ----------------------------------------------------------------------------
// 2. One rule match -> one group, one item, one log entry
// ----------------------------------------------------------------------------
{
  const g = groupMatches([ruleMatch()], [], NOW);
  check('one rule -> one group', g.length === 1);
  eq('one rule -> one item', g[0].items.map(i => i.product_id), ['100']);
  eq('one rule -> log entry', g[0].sent_log_entries, [
    { rule_id: 'r1', product_id: '100', sent_at: NOW.toISOString() },
  ]);
}

// ----------------------------------------------------------------------------
// 3. Two rules, different frequencies -> two groups, not merged
// ----------------------------------------------------------------------------
{
  const g = groupMatches(
    [
      ruleMatch({ rule_id: 'r1', frequency: 'weekly',  product_id: 100n }),
      ruleMatch({ rule_id: 'r2', frequency: 'instant', product_id: 101n }),
    ],
    [],
    NOW
  );
  check('two frequencies -> two groups', g.length === 2);
  const weekly = g.find(x => x.frequency === 'weekly')!;
  const instant = g.find(x => x.frequency === 'instant')!;
  eq('weekly group items', weekly.items.map(i => i.product_id), ['100']);
  eq('instant group items', instant.items.map(i => i.product_id), ['101']);
}

// ----------------------------------------------------------------------------
// 4. Same product caught by two rules -> one item, two log entries
// ----------------------------------------------------------------------------
{
  const g = groupMatches(
    [
      ruleMatch({ rule_id: 'r1', product_id: 100n }),
      ruleMatch({ rule_id: 'r2', product_id: 100n }),
    ],
    [],
    NOW
  );
  check('same product twice -> one group', g.length === 1);
  eq('same product deduped in items', g[0].items.map(i => i.product_id), ['100']);
  eq(
    'same product logged per rule',
    g[0].sent_log_entries.map(e => e.rule_id),
    ['r1', 'r2']
  );
}

// ----------------------------------------------------------------------------
// 5. Same product caught by rule AND watch -> one item, two log entries,
//    watch entry uses `watch:<id>` prefix
// ----------------------------------------------------------------------------
{
  const g = groupMatches(
    [ruleMatch({ rule_id: 'r1', product_id: 100n, frequency: 'weekly' })],
    [watchMatch({ watch_id: 'w1', product_id: 100n, frequency: 'weekly' })],
    NOW
  );
  check('rule+watch same product -> one group', g.length === 1);
  eq('rule+watch same product -> one item', g[0].items.length, 1);
  const ids = g[0].sent_log_entries.map(e => e.rule_id).sort();
  eq('rule+watch both logged', ids, ['r1', 'watch:w1']);
}

// ----------------------------------------------------------------------------
// 6. Rule and watch, different subscribers -> two independent groups
// ----------------------------------------------------------------------------
{
  const g = groupMatches(
    [ruleMatch({ subscriber_id: 1, product_id: 100n })],
    [watchMatch({ subscriber_id: 2, product_id: 200n })],
    NOW
  );
  check('two subscribers -> two groups', g.length === 2);
  eq(
    'per-subscriber items',
    g.map(x => ({ id: x.subscriber_id, items: x.items.map(i => i.product_id) })),
    [
      { id: 1, items: ['100'] },
      { id: 2, items: ['200'] },
    ]
  );
}

// ----------------------------------------------------------------------------
// 7. Items sorted by discount desc, tiebreak by price asc, then product_id
// ----------------------------------------------------------------------------
{
  const g = groupMatches(
    [
      ruleMatch({ product_id: 100n, max_discount_percentage: 20, min_price: 50 }),
      ruleMatch({ product_id: 101n, max_discount_percentage: 50, min_price: 30 }),
      ruleMatch({ product_id: 102n, max_discount_percentage: 20, min_price: 10 }),
      ruleMatch({ product_id: 103n, max_discount_percentage: 20, min_price: 10 }),
    ],
    [],
    NOW
  );
  eq(
    'sort by discount desc, price asc, id asc',
    g[0].items.map(i => i.product_id),
    ['101', '102', '103', '100']
  );
}

// ----------------------------------------------------------------------------
// 8. Bigint product_id serialized as string in both items and log entries
// ----------------------------------------------------------------------------
{
  const g = groupMatches([ruleMatch({ product_id: 9007199254740993n })], [], NOW);
  check('bigint id in items as string', typeof g[0].items[0].product_id === 'string');
  check('bigint id preserved exactly', g[0].items[0].product_id === '9007199254740993');
  check(
    'bigint id in log entry as string',
    g[0].sent_log_entries[0].product_id === '9007199254740993'
  );
}

// ----------------------------------------------------------------------------
// 9. Numeric strings from DB coerced to numbers
// ----------------------------------------------------------------------------
{
  const g = groupMatches(
    [ruleMatch({ min_price: '12.50' as unknown as number, max_discount_percentage: '30' as unknown as number })],
    [],
    NOW
  );
  check('min_price coerced to number', g[0].items[0].min_price === 12.5);
  check('discount coerced to number', g[0].items[0].max_discount_percentage === 30);
}

// ----------------------------------------------------------------------------
// 10. sent_at is the passed-in now, not wall clock
// ----------------------------------------------------------------------------
{
  const earlier = new Date('2020-01-01T00:00:00Z');
  const g = groupMatches([ruleMatch()], [], earlier);
  check('uses provided now', g[0].sent_log_entries[0].sent_at === earlier.toISOString());
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll grouping assertions passed.');