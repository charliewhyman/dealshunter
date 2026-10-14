import type { APIRoute } from 'astro';

const COLLECTIONS = [
  'womens-clothing', 'mens-clothing', 'clothing',
  'womens-footwear', 'mens-footwear', 'footwear',
  'jewelry', 'accessories', 'home-living', 'made-in-canada',
];

const STATIC_PAGES = ['/about', '/contact', '/privacy', '/terms'];

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString().replace(/\/$/, '')) ?? 'https://curatedcanada.ca';

  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    ...COLLECTIONS.map(slug => ({ loc: `${base}/collections/${slug}`, priority: '0.8' })),
    ...STATIC_PAGES.map(p => ({ loc: `${base}${p}`, priority: '0.4' })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};