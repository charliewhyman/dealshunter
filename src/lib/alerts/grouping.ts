import type { RuleMatch, WatchMatch } from '../types';

export type AlertItem = {
  product_id: string;
  title: string;
  min_price: number;
  max_discount_percentage: number;
  image_url: string | null;
  product_url: string | null;
};

export type SentLogEntry = {
  rule_id: string;
  product_id: string;
  sent_at: string;
};

export type SubscriberGroup = {
  subscriber_id: number;
  email: string;
  frequency: 'instant' | 'daily' | 'weekly';
  items: AlertItem[];
  sent_log_entries: SentLogEntry[];
};

function toItem(m: RuleMatch | WatchMatch): AlertItem {
  return {
    product_id: m.product_id.toString(),
    title: m.title,
    min_price: Number(m.min_price),
    max_discount_percentage: Number(m.max_discount_percentage),
    image_url: m.image_url,
    product_url: m.product_url,
  };
}

export function groupMatches(
  ruleMatches: RuleMatch[],
  watchMatches: WatchMatch[],
  now: Date = new Date()
): SubscriberGroup[] {
  const groups = new Map<string, SubscriberGroup>();
  const sentAt = now.toISOString();

  const push = (
    subscriberId: number,
    email: string,
    frequency: 'instant' | 'daily' | 'weekly',
    item: AlertItem,
    logRuleId: string
  ) => {
    const key = `${subscriberId}:${frequency}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        subscriber_id: subscriberId,
        email,
        frequency,
        items: [],
        sent_log_entries: [],
      };
      groups.set(key, group);
    }

    // Dedupe items by product_id — one entry in the email no matter how many
    // rules matched it.
    if (!group.items.some(i => i.product_id === item.product_id)) {
      group.items.push(item);
    }

    // Always log every (rule_id, product_id) pair that fired, so the next
    // run's dedupe suppresses both the rule and the watch that caught it.
    group.sent_log_entries.push({
      rule_id: logRuleId,
      product_id: item.product_id,
      sent_at: sentAt,
    });
  };

  for (const m of ruleMatches) {
    push(m.subscriber_id, m.email, m.frequency, toItem(m), m.rule_id);
  }
  for (const m of watchMatches) {
    push(m.subscriber_id, m.email, m.frequency, toItem(m), `watch:${m.watch_id}`);
  }

  // Sort items within each group by discount desc so the best deal is on top.
  for (const g of groups.values()) {
    g.items.sort((a, b) => {
      const byDiscount = b.max_discount_percentage - a.max_discount_percentage;
      if (byDiscount !== 0) return byDiscount;
      // Stable tiebreak: cheaper first, then by id for determinism.
      const byPrice = a.min_price - b.min_price;
      if (byPrice !== 0) return byPrice;
      return a.product_id.localeCompare(b.product_id);
    });
  }

  return [...groups.values()];
}