#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

function usage() {
  console.log('Usage: node scripts/prerender.js [--lcp=<image-url>]');
  console.log('Or set environment variable PRERENDER_LCP to the image URL.');
}

const argv = process.argv.slice(2);
let lcpArg = process.env.PRERENDER_LCP || '';
for (const a of argv) {
  if (a.startsWith('--lcp=')) lcpArg = a.slice('--lcp='.length);
  if (a === '--help' || a === '-h') {
    usage();
    process.exit(0);
  }
}

async function tryAutoDetectLcp() {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('Supabase env vars not set; skipping auto-detect.');
    return '';
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { 'x-prerender': '1' } } });
    console.log('Querying Supabase for first product image...');
    const { data, error } = await supabase
      .from('products_with_details')
      .select('images')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn('Supabase query error:', error.message || error);
      return '';
    }
    if (data && data.length > 0) {
      const images = data[0]?.images;
      if (images && Array.isArray(images) && images[0] && images[0].src) {
        return images[0].src;
      }
    }
    return '';
  } catch (err) {
    console.warn('Failed to query Supabase:', err);
    return '';
  }
}

try {
  console.log('Running build...');
  const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);

  if (!lcpArg) {
    // attempt to auto-detect from Supabase
    // eslint-disable-next-line no-await-in-loop
    lcpArg = await tryAutoDetectLcp();
  }

  // Support multiple LCP URLs provided as a comma/pipe/newline-separated list.
  const splitList = (s) => {
    if (!s) return [];
    return String(s)
      .split(/\s*\|\|\s*|\s*,\s*|\s*\n\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
  };

  const lcpList = splitList(lcpArg);
  const lcpSrcSets = splitList(process.env.PRERENDER_LCP_SRCSET || process.env.PRERENDER_LCP_SRC || '');
  const lcpSizes = splitList(process.env.PRERENDER_LCP_SIZES || '');

  const distIndex = path.resolve(process.cwd(), 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('dist/index.html not found — build may have failed');
    process.exit(1);
  }

  let html = fs.readFileSync(distIndex, 'utf8');

  if (lcpList.length > 0) {
    console.log('Injecting preload(s) for LCP image(s):', lcpList.join(', '));

    // Build preload tags for each provided URL. The optional srcset/sizes entries
    // can be provided as comma/pipe/newline-separated lists that map 1:1 to URLs.
    const preloadTags = lcpList.map((url, idx) => {
      const srcset = lcpSrcSets[idx] || '';
      const sizes = lcpSizes[idx] || '';
      let attrs = `href="${url}" fetchPriority="high"`;
      if (srcset) {
        const escSrcSet = String(srcset).replace(/"/g, '&quot;');
        attrs += ` imagesrcset="${escSrcSet}"`;
      }
      if (sizes) {
        const escSizes = String(sizes).replace(/"/g, '&quot;');
        attrs += ` imagesizes="${escSizes}"`;
      }
      return `<link rel="preload" as="image" crossorigin="anonymous" ${attrs}>`;
    });

    // Also create exact-href preloads (no imagesrcset/imagesizes) to improve
    // matching for tools that expect the exact final request URL in HTML.
    const rawPreloadTags = lcpList.map((url) => `<link rel="preload" as="image" crossorigin="anonymous" href="${url}" fetchPriority="high">`);

    // Insert all preload tags before the first <script> or before </head> as fallback.
    const firstScriptIdx = html.search(/<script[\s>]/i);
    if (firstScriptIdx !== -1) {
      // Only inject tags that aren't already present.
      const toInsert = preloadTags.filter((tag, i) => !html.includes(`href="${lcpList[i]}"`)).join('\n') + '\n' + rawPreloadTags.filter((tag, i) => !html.includes(`href="${lcpList[i]}"`)).join('\n') + '\n';
      if (toInsert.trim()) {
        html = html.slice(0, firstScriptIdx) + toInsert + html.slice(firstScriptIdx);
        fs.writeFileSync(distIndex, html, 'utf8');
        console.log('Preload(s) injected before first <script> in dist/index.html');
      } else {
        console.log('All requested preloads already present in HTML — skipping');
      }
    } else {
      const idx = html.indexOf('</head>');
      if (idx !== -1) {
        const toInsert = preloadTags.filter((tag, i) => !html.includes(`href="${lcpList[i]}"`)).join('\n') + '\n' + rawPreloadTags.filter((tag, i) => !html.includes(`href="${lcpList[i]}"`)).join('\n') + '\n';
        if (toInsert.trim()) {
          html = html.slice(0, idx) + toInsert + html.slice(idx);
          fs.writeFileSync(distIndex, html, 'utf8');
          console.log('Preload(s) injected into dist/index.html');
        } else {
          console.log('All requested preloads already present in HTML — skipping');
        }
      } else {
        console.warn('Could not find insertion point to inject preload(s)');
      }
    }
  } else {
    console.log('No LCP image provided or detected. Build completed without injecting preload.');
    usage();
  }
} catch (err) {
  console.error('Prerender failed:', err);
  process.exit(1);
}
