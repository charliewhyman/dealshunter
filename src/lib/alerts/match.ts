import { query } from '../db';
import type { RuleMatch, WatchMatch, AlertFrequency } from '../types';

export type { RuleMatch, WatchMatch };

type MatchFilters = {
  subscriberId?: number;
  frequency?: AlertFrequency;
  /** Cap the number of subscribers processed in one call. Pushed into SQL
   *  so the Worker only parses rows for N subscribers, not all of them.
   *  Default 100 — larger than any realistic subscriber count, effectively
   *  "all". Pass a smaller value (2–10) on the Free plan to stay under the
   *  Worker CPU limit. */
  subscriberLimit?: number;
};

export async function matchRuleAlerts(opts: MatchFilters = {}): Promise<RuleMatch[]> {
  const filterSub = opts.subscriberId ?? null;
  const filterFreq = opts.frequency ?? null;
  const subscriberLimit = opts.subscriberLimit ?? 100;

  return query<RuleMatch>`
    SELECT
      sub.id                    AS subscriber_id,
      sub.email                 AS email,
      (r->>'id')                AS rule_id,
      (r->>'frequency')         AS frequency,
      p.id                      AS product_id,
      p.title                   AS title,
      sh.shop_name              AS shop_name,
      p.min_price               AS min_price,
      p.max_discount_percentage AS max_discount_percentage,
      (CASE
        WHEN jsonb_typeof(p.images) = 'array'
          AND jsonb_array_length(p.images) > 0
          AND (p.images->0) ? 'src'
        THEN (p.images->0->>'src')
        ELSE NULL
      END)                      AS image_url,
      p.url                     AS product_url,
      p.size_groups             AS size_groups,
      r                         AS rule_json
    FROM alert_rules ar
    JOIN subscribers sub ON sub.id = ar.subscriber_id
    CROSS JOIN LATERAL jsonb_array_elements(ar.rules) AS r
    JOIN LATERAL (
      SELECT
        pc.id,
        pc.title,
        pc.min_price,
        pc.max_discount_percentage,
        pc.images,
        pc.url,
        pc.shop_id
      FROM products_with_details_core pc
      WHERE pc.is_archived = false
        AND pc.in_stock = true
        AND pc.on_sale = true
        AND pc.max_discount_percentage >= COALESCE((r->>'min_discount')::numeric, 0)
        AND ((r->>'max_price') IS NULL OR pc.min_price <= (r->>'max_price')::numeric)
        AND (COALESCE((r->>'made_in_canada_only')::boolean, false) = false
             OR pc.tags && ARRAY['made-in-canada'])
        AND (jsonb_array_length(COALESCE(r->'categories', '[]'::jsonb)) = 0
             OR pc.top_level_category = ANY (ARRAY(SELECT jsonb_array_elements_text(r->'categories'))))
        AND (jsonb_array_length(COALESCE(r->'types', '[]'::jsonb)) = 0
             OR pc.grouped_product_type = ANY (ARRAY(SELECT jsonb_array_elements_text(r->'types'))))
        AND (jsonb_array_length(COALESCE(r->'genders', '[]'::jsonb)) = 0
             OR pc.gender_age = ANY (ARRAY(SELECT jsonb_array_elements_text(r->'genders'))))
        AND (jsonb_array_length(COALESCE(r->'shop_ids', '[]'::jsonb)) = 0
             OR pc.shop_id::text = ANY (ARRAY(SELECT jsonb_array_elements_text(r->'shop_ids'))))
        AND (jsonb_array_length(COALESCE(r->'sizes', '[]'::jsonb)) = 0
             OR pc.size_groups && ARRAY(SELECT jsonb_array_elements_text(r->'sizes')))
      ORDER BY pc.max_discount_percentage DESC NULLS LAST
      LIMIT 50
    ) p ON true
    LEFT JOIN shops sh ON sh.id = p.shop_id
    WHERE sub.consent_given = true
      AND (
        (${filterSub}::integer IS NOT NULL AND ar.subscriber_id = ${filterSub})
        OR
        (${filterSub}::integer IS NULL AND ar.subscriber_id IN (
          SELECT id FROM subscribers
          WHERE consent_given = true
          ORDER BY id
          LIMIT ${subscriberLimit}
        ))
      )
      AND (${filterFreq}::text IS NULL OR (r->>'frequency') = ${filterFreq})
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(ar.sent_log) e
        WHERE (e->>'rule_id') = (r->>'id')
          AND (e->>'product_id') = p.id::text
          AND (e->>'sent_at')::timestamptz > now() - interval '7 days'
      )
  `;
}

export async function matchWatchAlerts(opts: MatchFilters = {}): Promise<WatchMatch[]> {
  const filterSub = opts.subscriberId ?? null;
  const filterFreq = opts.frequency ?? null;

  return query<WatchMatch>`
    SELECT
      sub.id                    AS subscriber_id,
      sub.email                 AS email,
      (w->>'id')                AS watch_id,
      (w->>'frequency')         AS frequency,
      p.id                      AS product_id,
      p.title                   AS title,
      sh.shop_name              AS shop_name,
      p.min_price               AS min_price,
      p.max_discount_percentage AS max_discount_percentage,
      (CASE
        WHEN jsonb_typeof(p.images) = 'array'
          AND jsonb_array_length(p.images) > 0
          AND (p.images->0) ? 'src'
        THEN (p.images->0->>'src')
        ELSE NULL
      END)                      AS image_url,
      p.url                     AS product_url,
      p.size_groups             AS size_groups
    FROM alert_rules ar
    JOIN subscribers sub ON sub.id = ar.subscriber_id
    CROSS JOIN LATERAL jsonb_array_elements(ar.watches) AS w
    JOIN products_with_details_core p
      ON p.id = (w->>'product_id')::bigint
     AND p.is_archived = false
     AND p.in_stock = true
     AND (
       ((w->>'target_price') IS NOT NULL AND p.min_price <= (w->>'target_price')::numeric)
       OR ((w->>'target_price') IS NULL AND p.on_sale = true)
     )
    LEFT JOIN shops sh ON sh.id = p.shop_id
    WHERE sub.consent_given = true
      AND (${filterSub}::integer IS NULL OR ar.subscriber_id = ${filterSub})
      AND (${filterFreq}::text IS NULL OR (w->>'frequency') = ${filterFreq})
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(ar.sent_log) e
        WHERE (e->>'rule_id') = ('watch:' || (w->>'id'))
          AND (e->>'product_id') = p.id::text
          AND (e->>'sent_at')::timestamptz > now() - interval '1 day'
      )
  `;
}