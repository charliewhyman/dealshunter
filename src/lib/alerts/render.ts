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

/**
 * Build the "see all" URL from the rule that produced this group. The
 * homepage parses these params via useSearchParams, so the user lands on
 * a pre-filtered grid showing every product their rule matched (not just
 * the 20 that fit in the email).
 *
 * The src param is the attribution channel. Nothing reads it yet, but
 * it's the key a future /api/track endpoint would log to measure which
 * emails drive traffic.
 */
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
  const count = group.items.length;
  if (count === 0) return 'Your Curated Canada deal alert';
  if (count === 1) {
    const title = group.items[0].title;
    const trimmed = title.length > 55 ? title.slice(0, 52) + '…' : title;
    return `Deal alert: ${trimmed}`;
  }
  return `${count} new deal${count === 1 ? '' : 's'} for you`;
}

function trackingHref(item: AlertItem, subscriberId: number, frequency: string): string {
  return `${SITE}/api/out/${item.product_id}?src=email-${subscriberId}-${frequency}`;
}

function renderItemHtml(
  item: AlertItem,
  subscriberId: number,
  frequency: string
): string {
  const price = formatPrice(item.min_price);
  const discount = formatDiscount(item.max_discount_percentage);
  const href = trackingHref(item, subscriberId, frequency);

  const image = item.image_url
    ? `<img src="${esc(item.image_url)}" alt="" width="160" height="160"
            style="display:block;width:160px;height:160px;border-radius:8px;object-fit:cover;background:#f3f4f6;border:0;" />`
    : `<div style="width:160px;height:160px;border-radius:8px;background:#f3f4f6;"></div>`;

  const discountBadge = discount
    ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:600;">${esc(discount)}</span>`
    : '';

  const shopLine = item.shop_name
    ? `<div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">${esc(item.shop_name)}</div>`
    : '';

  return `
    <tr><td style="padding:0 0 16px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="160" valign="top" style="padding-right:16px;">${image}</td>
          <td valign="top" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            ${shopLine}
            <a href="${esc(href)}"
               style="color:#111827;text-decoration:none;font-weight:600;font-size:15px;line-height:1.35;">${esc(item.title)}</a>
            <div style="margin-top:8px;color:#111827;font-size:15px;font-weight:600;">
              ${esc(price)}${discountBadge}
            </div>
            <div style="margin-top:12px;">
              <a href="${esc(href)}"
                 style="display:inline-block;padding:8px 14px;background:#111827;color:#ffffff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">View deal</a>
            </div>
          </td>
        </tr>
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
  return `${shopLine}${item.title}${priceLine ? ` — ${priceLine}` : ''}\n${href}`;
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

  const itemsHtml = group.items
    .map(item => renderItemHtml(item, group.subscriber_id, group.frequency))
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
          <tr><td style="padding:0 32px 8px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${itemsHtml}
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
    ...group.items.map(item => renderItemText(item, group.subscriber_id, group.frequency)),
  ];

  if (showSeeAll && seeAllUrl) {
    textLines.push('');
    textLines.push(`See all ${group.total_matches} matching deals: ${seeAllUrl}`);
  }

  textLines.push('');
  textLines.push('---');
  textLines.push(`Manage alerts: ${manageUrl}`);
  textLines.push(`Unsubscribe:   ${unsubUrl}`);

  return { subject, html, text: textLines.join('\n') };
}