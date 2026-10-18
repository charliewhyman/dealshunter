const SIX_HOURS = 6 * 60 * 60 * 1000;
const MAX_TRACKED = 200;

interface Snapshot {
  id: string;
  onSale: boolean;
  discount: number;
}

interface Stored {
  last: { at: number; items: Snapshot[] } | null;
  base: { at: number; items: Snapshot[] } | null;
}

function keyFor(scope: string): string {
  return `curated-canada:visit:${scope}`;
}

function read(scope: string): Stored {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    if (!raw) return { last: null, base: null };
    const parsed = JSON.parse(raw);
    return { last: parsed?.last ?? null, base: parsed?.base ?? null };
  } catch {
    return { last: null, base: null };
  }
}

function write(scope: string, stored: Stored): void {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(stored));
  } catch {
    /* private mode / full — ignore */
  }
}

export interface DealSignals {
  newDeals: Set<string>;
  deeperDeals: Set<string>;
  baselineAt: number | null;
}

/**
 * Diff the current product list's *sale state* against the user's previous
 * visit. Compares `on_sale` and `max_discount_percentage`, not IDs — so a
 * product that's been on sale for weeks doesn't get re-flagged as "new."
 *
 * The baseline is promoted from `last` → `base` only when >6h have elapsed
 * since the previous visit. Until then `base` is null and both sets are
 * empty, so first-time visitors and same-session reloads see nothing.
 */
export function computeNewDealsSinceVisit(
  current: Snapshot[],
  scope: string,
): DealSignals {
  const now = Date.now();
  const { last, base } = read(scope);

  const nextBase = last && now - last.at > SIX_HOURS ? last : base;

  write(scope, {
    last: { at: now, items: current.slice(0, MAX_TRACKED) },
    base: nextBase,
  });

  if (!nextBase) {
    return { newDeals: new Set(), deeperDeals: new Set(), baselineAt: null };
  }

  const prevById = new Map(nextBase.items.map(i => [i.id, i]));
  const newDeals = new Set<string>();
  const deeperDeals = new Set<string>();

  for (const p of current) {
    const prev = prevById.get(p.id);
    if (!prev) continue;
    if (p.onSale && !prev.onSale) {
      newDeals.add(p.id);
    } else if (p.onSale && prev.onSale && p.discount > prev.discount + 4) {
      deeperDeals.add(p.id);
    }
  }

  return { newDeals, deeperDeals, baselineAt: nextBase.at };
}