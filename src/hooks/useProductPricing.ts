import { useState, useEffect } from 'react';
import { db } from '../lib/db';

interface ProductPricing {
  variantPrice: number | null;
  compareAtPrice: number | null;
}

// Module-level batching/cache structures so multiple hook instances
// can be served by a single batched Supabase request.
const batchQueue = new Set<string>();
const listeners = new Map<string, Set<(p: ProductPricing) => void>>();
const pricingCache = new Map<string, ProductPricing>();
let batchTimer: number | null = null;

const BATCH_DELAY_MS = 50;

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

    // Fetch variants for all ids in one query
    const vRes = await db
      .selectFrom('variants')
      .select(['product_id', 'price', 'compare_at_price'])
      .where('product_id', 'in', uniq)
      .execute();

    const resultMap: Record<string, ProductPricing> = {};

    for (const row of vRes) {
      const pid = String(row.product_id);
      const price = row.price != null ? Number(row.price) : null;
      const compare = row.compare_at_price != null ? Number(row.compare_at_price) : null;
      if (!resultMap[pid]) resultMap[pid] = { variantPrice: price, compareAtPrice: compare };
      else {
        const existing = resultMap[pid];
        if (price !== null && (existing.variantPrice === null || price < existing.variantPrice)) {
          existing.variantPrice = price;
          existing.compareAtPrice = compare ?? existing.compareAtPrice;
        }
      }
    }

    // Ensure all requested ids have an entry
    for (const id of uniq) {
      if (!resultMap[id]) resultMap[id] = { variantPrice: null, compareAtPrice: null };
    }

    // Cache and notify listeners
    for (const [pid, pricing] of Object.entries(resultMap)) {
      pricingCache.set(pid, pricing);
      const subs = listeners.get(pid);
      if (subs) {
        for (const cb of subs) {
          try { cb(pricing); } catch { /* ignore listener errors */ }
        }
        // clear listeners once notified - future hooks will read from cache
        listeners.delete(pid);
      }
    }
  } catch (err) {
    // On error, notify listeners with nulls so hooks can fall back or retry.
    for (const id of ids) {
      const pricing = { variantPrice: null, compareAtPrice: null };
      pricingCache.set(id, pricing);
      const subs = listeners.get(id);
      if (subs) {
        for (const cb of subs) {
          try { cb(pricing); } catch { /* ignore */ }
        }
        listeners.delete(id);
      }
    }
    console.error('Batched pricing fetch failed', err);
  }
}

function scheduleFetchFor(id: string) {
  batchQueue.add(id);
  if (batchTimer) return;
  batchTimer = window.setTimeout(() => void flushBatch(), BATCH_DELAY_MS);
}

export function useProductPricing(productId: number | string, enabled = true): ProductPricing {
  const id = String(productId);
  const cached = pricingCache.get(id);

  const [variantPrice, setVariantPrice] = useState<number | null>(cached ? cached.variantPrice : null);
  const [compareAtPrice, setCompareAtPrice] = useState<number | null>(cached ? cached.compareAtPrice : null);

  useEffect(() => {
    if (!enabled) return;

    // If we have cached pricing, we're done
    const cachedNow = pricingCache.get(id);
    if (cachedNow) {
      setVariantPrice(cachedNow.variantPrice);
      setCompareAtPrice(cachedNow.compareAtPrice);
      return;
    }

    // Otherwise, subscribe for the batched result
    const cb = (p: ProductPricing) => {
      setVariantPrice(p.variantPrice);
      setCompareAtPrice(p.compareAtPrice);
    };

    let subs = listeners.get(id);
    if (!subs) {
      subs = new Set();
      listeners.set(id, subs);
    }
    subs.add(cb);

    // Schedule a batched fetch (many hooks will schedule the same fetch)
    scheduleFetchFor(id);

    return () => {
      const s = listeners.get(id);
      if (s) {
        s.delete(cb);
        if (s.size === 0) listeners.delete(id);
      }
    };
  }, [id, enabled]);

  return { variantPrice, compareAtPrice };
}