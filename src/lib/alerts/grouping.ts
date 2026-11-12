import type { RuleMatch, WatchMatch } from './match';

export type AlertItem = {
  product_id: string;
  title: string;
  shop_name: string | null;
  min_price: number;
  max_discount_percentage: number;
  image_url: string | null;
  product_url: string | null;
  size_groups: string[] | null;
};

export type SentLogEntry = {
  rule_id: string;
  product_id: string;
  sent_at: string;
};

export type RuleFilterSummary = {
  categories: string[];
  types: string[];
  genders: string[];
  sizes: string[];
  shop_ids: string[];
  min_discount: number;
  max_price: number | null;
  made_in_canada_only: boolean;
};

export type SubscriberGroup = {
  subscriber_id: number;
  email: string;
  frequency: 'instant' | 'daily' | 'weekly';
  items: AlertItem[];
  sent_log_entries: SentLogEntry[];
  /** Number of products that matched before the per-email cap was applied. */
  total_matches: number;
  /** Filters from the first rule that matched, used to build the "see all" URL. */
  rule_filters: RuleFilterSummary | null;
};

export const MAX_ITEMS_PER_EMAIL = 10;

function toItem(m: RuleMatch | WatchMatch): AlertItem {
  return {
    product_id: m.product_id.toString(),
    title: m.title,
    shop_name: m.shop_name,
    min_price: Number(m.min_price),
    max_discount_percentage: Number(m.max_discount_percentage),
    image_url: m.image_url,
    product_url: m.product_url,
    size_groups: m.size_groups
  };
}

function extractFilters(m: RuleMatch): RuleFilterSummary {
  const r = m.rule_json;
  return {
    categories: r.categories ?? [],
    types: r.types ?? [],
    genders: r.genders ?? [],
    sizes: r.sizes ?? [],
    shop_ids: r.shop_ids ?? [],
    min_discount: r.min_discount ?? 0,
    max_price: r.max_price ?? null,
    made_in_canada_only: r.made_in_canada_only ?? false,
  };
}

export function groupMatches(
  ruleMatches: RuleMatch[],
  watchMatches: WatchMatch[],
  now: Date = new Date()
): SubscriberGroup[] {
  const groups = new Map<string, SubscriberGroup>();
  const sentAt = now.toISOString();

  const getOrCreate = (
    subscriberId: number,
    email: string,
    frequency: 'instant' | 'daily' | 'weekly'
  ): SubscriberGroup => {
    const key = `${subscriberId}:${frequency}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        subscriber_id: subscriberId,
        email,
        frequency,
        items: [],
        sent_log_entries: [],
        total_matches: 0,
        rule_filters: null,
      };
      groups.set(key, group);
    }
    return group;
  };

  for (const m of ruleMatches) {
    const group = getOrCreate(m.subscriber_id, m.email, m.frequency);

    // Record the first rule's filters for the "see all" URL. Multi-rule
    // subscribers get one link from their first rule; per-rule CTAs are
    // a future enhancement.
    if (!group.rule_filters) {
      group.rule_filters = extractFilters(m);
    }

    const item = toItem(m);

    // Dedupe items by product_id — one card in the email per product.
    if (!group.items.some(i => i.product_id === item.product_id)) {
      group.items.push(item);
    }

    // Log every (rule_id, product_id) pair that fired so the next run's
    // dedupe suppresses each source independently.
    group.sent_log_entries.push({
      rule_id: m.rule_id,
      product_id: item.product_id,
      sent_at: sentAt,
    });
  }

  for (const m of watchMatches) {
    const group = getOrCreate(m.subscriber_id, m.email, m.frequency);
    const item = toItem(m);

    if (!group.items.some(i => i.product_id === item.product_id)) {
      group.items.push(item);
    }

    group.sent_log_entries.push({
      rule_id: `watch:${m.watch_id}`,
      product_id: item.product_id,
      sent_at: sentAt,
    });
  }

  // Sort each group by discount desc, then price asc, then product_id asc.
  // Tiebreaks keep the output deterministic across runs.
  for (const g of groups.values()) {
    g.items.sort((a, b) => {
      const byDiscount = b.max_discount_percentage - a.max_discount_percentage;
      if (byDiscount !== 0) return byDiscount;
      const byPrice = a.min_price - b.min_price;
      if (byPrice !== 0) return byPrice;
      return a.product_id.localeCompare(b.product_id);
    });

    // Record the pre-cap count before slicing — this is what the "see all"
    // link advertises.
    g.total_matches = g.items.length;

    // Cap the email at MAX_ITEMS_PER_EMAIL. Products beyond the cap are
    // NOT added to sent_log, so they'll match again next week and surface
    // in a future batch (assuming their discount stays above the rule's
    // threshold).
    if (g.items.length > MAX_ITEMS_PER_EMAIL) {
      g.items = g.items.slice(0, MAX_ITEMS_PER_EMAIL);

      // Prune sent_log_entries to only the products actually shown, so
      // unshown products aren't suppressed for the dedupe window.
      const shownIds = new Set(g.items.map(i => i.product_id));
      g.sent_log_entries = g.sent_log_entries.filter(e =>
        shownIds.has(e.product_id)
      );
    }

    // Group items by shop
    const shopCount = new Map<string, number>();
    const diversified: AlertItem[] = [];
    const overflow: AlertItem[] = [];

    for (const item of g.items) {
      const key = item.shop_name ?? 'unknown';
      const count = shopCount.get(key) ?? 0;
      if (count < 3) {
        diversified.push(item);
        shopCount.set(key, count + 1);
      } else {
        overflow.push(item);
      }
    }

    // If diversification left room, fill with overflow
    const finalItems = diversified.slice(0, MAX_ITEMS_PER_EMAIL);
    if (finalItems.length < MAX_ITEMS_PER_EMAIL) {
      finalItems.push(...overflow.slice(0, MAX_ITEMS_PER_EMAIL - finalItems.length));
    }

    g.items = finalItems;
  }

  return [...groups.values()];
}