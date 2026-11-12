import { signToken } from './token';
import type { SubscriberGroup, AlertItem } from './grouping';
import type { AlertFrequency } from '../types';

const SITE = process.env.ALERT_SITE_URL ?? 'https://curatedcanada.ca';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '';
  return `$${n.toFixed(2)}`;
}

function formatDiscount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return `-${Math.round(n)}%`;
}

function frequencyLabel(f: AlertFrequency): string {
  switch (f) {
    case 'instant': return 'just now';
    case 'daily':   return 'today';
    case 'weekly':  return 'this week';
  }
}

function buildSeeAllUrl(group: SubscriberGroup): string {
  const f = group.rule_filters;
  if (!f) return `${SITE}/`;

  const params = new URLSearchParams();
  if (f.categories.length) params.set('category', f.categories.join(','));
  if (f.types.length) params.set('type', f.types.join(','));
  if (f.genders.length) params.set('gender', f.genders.join(','));
  if (f.sizes.length) params.set('size', f.sizes.join(','));
  if (f.shop_ids.length) params.set('shop', f.shop_ids.join(','));
  if (f.min_discount > 0) params.set('sale', 'true');
  if (f.max_price != null) params.set('price', `0-${f.max_price}`);
  if (f.made_in_canada_only) params.set('made_in_canada', 'true');
  params.set('sort', 'discount_desc');
  params.set('src', `email-${group.subscriber_id}-${group.frequency}`);
  return `${SITE}/?${params.toString()}`;
}

function subjectFor(group: SubscriberGroup): string {
  const shownCount = group.items.length;
  const isCapped = group.total_matches > shownCount;

  if (shownCount === 0) return 'Your Curated Canada deal alert';
  if (shownCount === 1 && !isCapped) {
    const title = group.items[0].title;
    const trimmed = title.length > 55 ? title.slice(0, 52) + '…' : title;
    return `Deal alert: ${trimmed}`;
  }

  if (isCapped) {
    return `New deals matching your alerts`;
  }

  return `${shownCount} new deal${shownCount === 1 ? '' : 's'} for you`;
}

function trackingHref(item: AlertItem, subscriberId: number, frequency: string): string {
  return `${SITE}/api/out/${item.product_id}?src=email-${subscriberId}-${frequency}`;
}

function renderProductCell(
  item: AlertItem,
  subscriberId: number,
  frequency: string,
  width: string,
  isLast: boolean
): string {
  const price = formatPrice(item.min_price);
  const discount = formatDiscount(item.max_discount_percentage);
  const href = trackingHref(item, subscriberId, frequency);

  const image = item.image_url
    ? `<img src="${esc(item.image_url)}" alt="" width="160" height="160"
            style="display:block;width:160px;height:160px;border-radius:8px;object-fit:cover;background:#f3f4f6;border:0;" />`
    : `<div style="width:160px;height:160px;border-radius:8px;background:#f3f4f6;"></div>`;

  const discountBadge = discount
    ? `<div style="margin-top:4px;display:inline-block;padding:1px 6px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:600;">${esc(discount)}</div>`
    : '';

  const sizes = (item.size_groups ?? []).filter((s): s is string => !!s);
  const shownSizes = sizes.slice(0, 4);
  const extraSizes = sizes.length > 4 ? ` +${sizes.length - 4}` : '';
  const sizeLine = sizes.length > 0
    ? `<div style="margin-top:3px;font-size:11px;color:#9ca3af;">${shownSizes.map(esc).join(', ')}${extraSizes}</div>`
    : '';

  return `
    <td width="${width}" valign="top" style="padding:0 ${isLast ? '0' : '8px'} 12px 0;">
      <a href="${esc(href)}" style="text-decoration:none;">
        ${image}
        <div style="margin-top:8px;font-size:12px;font-weight:600;color:#111827;line-height:1.3;">${esc(item.title)}</div>
        <div style="margin-top:4px;font-size:12px;font-weight:600;color:#111827;">${esc(price)}</div>
        ${discountBadge}
        ${sizeLine}
      </a>
    </td>
  `;
}
/**
 * Render one shop section: shop name header + a horizontal row of 1-3
 * product cells. If a shop has more than 3 items in the group, only the
 * first 3 are shown (the diversification in groupMatches already caps
 * at 3 per shop, so this is a defensive safeguard).
 */
function renderShopSection(
  shopName: string,
  items: AlertItem[],
  subscriberId: number,
  frequency: string
): string {
  const shown = items.slice(0, 3);
  const count = shown.length;
  const width = count === 1 ? '100%' : count === 2 ? '50%' : '33.33%';

  const cells = shown.map((item, i) =>
    renderProductCell(item, subscriberId, frequency, width, i === count - 1)
  ).join('');

  return `
    <tr><td style="padding:0 0 20px 0;">
      <div style="font-size:12px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">
        ${esc(shopName)}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>${cells}</tr>
      </table>
    </td></tr>
  `;
}

function renderItemText(
  item: AlertItem,
  subscriberId: number,
  frequency: string
): string {
  const href = trackingHref(item, subscriberId, frequency);
  const price = formatPrice(item.min_price);
  const discount = formatDiscount(item.max_discount_percentage);
  const priceLine = [price, discount].filter(Boolean).join(' ');
  const shopLine = item.shop_name ? `${item.shop_name} — ` : '';
  const sizes = (item.size_groups ?? []).filter((s): s is string => !!s);
  const sizeLine = sizes.length > 0
    ? `\nSizes: ${sizes.slice(0, 6).join(', ')}${sizes.length > 6 ? ` +${sizes.length - 6} more` : ''}`
    : '';
  return `${shopLine}${item.title}${priceLine ? ` — ${priceLine}` : ''}${sizeLine}\n${href}`;
}

export function renderDigest(group: SubscriberGroup): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = subjectFor(group);
  const when = frequencyLabel(group.frequency);
  const count = group.items.length;
  const showSeeAll = group.total_matches > group.items.length;
  const seeAllUrl = showSeeAll ? buildSeeAllUrl(group) : null;

  const unsubscribeToken = signToken({
    subscriberId: group.subscriber_id,
    purpose: 'unsubscribe',
  });
  const manageToken = signToken({
    subscriberId: group.subscriber_id,
    purpose: 'manage',
  });

  const unsubUrl = `${SITE}/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const manageUrl = `${SITE}/account/alerts?token=${encodeURIComponent(manageToken)}`;

  // Group products by shop. Preserve first-seen order so the shops that
  // matched the strongest discounts appear first (groupMatches already
  // sorted by discount within each shop).
  const byShop = new Map<string, AlertItem[]>();
  for (const item of group.items) {
    const key = item.shop_name ?? 'Other';
    if (!byShop.has(key)) byShop.set(key, []);
    byShop.get(key)!.push(item);
  }

  const shopSectionsHtml = [...byShop.entries()]
    .map(([shopName, items]) =>
      renderShopSection(shopName, items, group.subscriber_id, group.frequency)
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="display:none;font-size:1px;color:#f9fafb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${esc(`${count} new deal${count === 1 ? '' : 's'} ${when} from brands you're watching.`)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9fafb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;">
          <tr><td style="padding:32px 32px 8px 32px;">
            <div style="font-size:13px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;">
              Curated Canada
            </div>
            <h1 style="margin:8px 0 8px 0;font-size:22px;line-height:1.3;font-weight:700;">
              ${count === 1 ? 'A new deal for you' : `${count} new deals for you`}
            </h1>
            <p style="margin:0 0 24px 0;color:#6b7280;font-size:14px;line-height:1.5;">
              Matching your alerts ${esc(when)}.
            </p>
          </td></tr>
          <tr><td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${shopSectionsHtml}
            </table>
          </td></tr>
          ${showSeeAll ? `
          <tr><td style="padding:8px 32px 16px 32px;text-align:center;">
            <a href="${esc(seeAllUrl!)}"
               style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
              See all matching deals →
            </a>
          </td></tr>
          ` : ''}
          <tr><td style="padding:8px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0 20px 0;" />
            <p style="margin:0 0 8px 0;font-size:12px;color:#6b7280;line-height:1.5;">
              You're receiving this because you asked Curated Canada to alert you about deals.
            </p>
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
              <a href="${esc(manageUrl)}" style="color:#2563eb;text-decoration:underline;">Manage alerts</a>
              &nbsp;·&nbsp;
              <a href="${esc(unsubUrl)}" style="color:#2563eb;text-decoration:underline;">Unsubscribe</a>
            </p>
            <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
              Curated Canada · curatedcanada.ca
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [
    `Curated Canada — ${count === 1 ? '1 new deal' : `${count} new deals`} for you`,
    `Matching your alerts ${when}.`,
    '',
  ];

  for (const [shopName, items] of byShop.entries()) {
    textLines.push(`— ${shopName} —`);
    for (const item of items) {
      textLines.push(renderItemText(item, group.subscriber_id, group.frequency));
    }
    textLines.push('');
  }

  if (showSeeAll && seeAllUrl) {
    textLines.push(`See all matching deals: ${seeAllUrl}`);
    textLines.push('');
  }

  textLines.push('---');
  textLines.push(`Manage alerts: ${manageUrl}`);
  textLines.push(`Unsubscribe:   ${unsubUrl}`);

  return { subject, html, text: textLines.join('\n') };
}