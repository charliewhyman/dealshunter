import { useMemo, useSyncExternalStore } from 'react';
import { apiClient } from '../lib/api-client';

interface ProductPricing {
  variantPrice: number | null;
  compareAtPrice: number | null;
}

// ── Module-level external store ────────────────────────────────────────────
// The cache lives outside React. `useSyncExternalStore` reads from it during
// render (no effect-driven setState) and re-renders subscribers when a
// pricing row lands.
const batchQueue = new Set<string>();
const listeners = new Map<string, Set<() => void>>();
const pricingCache = new Map<string, ProductPricing>();
let batchTimer: number | null = null;

const BATCH_DELAY_MS = 50;

// Shared singleton for "no pricing known yet". Must be a stable reference —
// useSyncExternalStore compares snapshots with Object.is.
const EMPTY: ProductPricing = { variantPrice: null, compareAtPrice: null };

function notify(pid: string) {
  const subs = listeners.get(pid);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb();
    } catch {
      /* ignore listener errors */
    }
  }
}

async function flushBatch() {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  const ids = Array.from(batchQueue);
  batchQueue.clear();
  if (ids.length === 0) return;

  try {
    const uniq = Array.from(new Set(ids.map(String)));
    const vRes = await apiClient.fetchPricing(uniq);

    // Group variants by product, keep the cheapest price (and its compare-at).
    const resultMap: Record<string, ProductPricing> = {};
    for (const row of vRes) {
      const pid = String(row.product_id);
      const price = row.price;
      const compare = row.compare_at_price;
      if (!resultMap[pid]) {
        resultMap[pid] = { variantPrice: price, compareAtPrice: compare };
      } else {
        const existing = resultMap[pid];
        if (
          price !== null &&
          (existing.variantPrice === null || price < existing.variantPrice)
        ) {
          existing.variantPrice = price;
          existing.compareAtPrice = compare ?? existing.compareAtPrice;
        }
      }
    }

    // Any requested id with no variant rows gets the empty snapshot so
    // subscribers don't wait forever.
    for (const id of uniq) {
      if (!resultMap[id]) resultMap[id] = EMPTY;
    }

    for (const [pid, pricing] of Object.entries(resultMap)) {
      pricingCache.set(pid, pricing);
      notify(pid);
    }
  } catch (err) {
    // On error, notify with the empty snapshot so hooks stop waiting.
    // (Consumers see nulls; a retry will re-schedule on next subscribe.)
    for (const id of ids) {
      pricingCache.set(id, EMPTY);
      notify(id);
    }
    console.error('Batched pricing fetch failed', err);
  }
}

function scheduleFetchFor(id: string) {
  batchQueue.add(id);
  if (batchTimer) return;
  batchTimer = window.setTimeout(() => void flushBatch(), BATCH_DELAY_MS);
}

// ── Snapshot + subscription factories ──────────────────────────────────────
// `getSnapshot` must return a stable reference until the underlying data
// changes; returning `pricingCache.get(id) ?? EMPTY` satisfies that because
// the cache stores the exact object it returns.

function getSnapshot(id: string): ProductPricing {
  return pricingCache.get(id) ?? EMPTY;
}

function subscribeToId(id: string): (onChange: () => void) => () => void {
  return (onChange) => {
    let subs = listeners.get(id);
    if (!subs) {
      subs = new Set();
      listeners.set(id, subs);
    }
    subs.add(onChange);

    // Kick off a batched fetch if we don't already have cached pricing.
    // Duplicate calls for the same id (many cards on screen) coalesce in
    // `batchQueue` + `batchTimer`, so at most one HTTP request per batch window.
    if (!pricingCache.has(id)) {
      scheduleFetchFor(id);
    }

    return () => {
      const s = listeners.get(id);
      if (s) {
        s.delete(onChange);
        if (s.size === 0) listeners.delete(id);
      }
    };
  };
}

// Stable no-op subscribe/snapshot used when `enabled === false`.
const noopSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProductPricing(
  productId: number | string,
  enabled = true
): ProductPricing {
  const id = String(productId);

  // Memoize the closures so useSyncExternalStore gets stable functions
  // across renders (React bails out of resubscribing if the identity is
  // unchanged, which is what we want).
  const subscribe = useMemo(
    () => (enabled ? subscribeToId(id) : noopSubscribe),
    [id, enabled]
  );
  const getClientSnapshot = useMemo(
    () => (enabled ? () => getSnapshot(id) : emptySnapshot),
    [id, enabled]
  );

  // Server snapshot: no cache on the server, and the client's first paint
  // must match it to avoid a hydration mismatch. `EMPTY` is the same
  // reference the client renders before any fetch resolves, so they agree.
  const getServerSnapshot = useMemo(() => emptySnapshot, []);

  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}