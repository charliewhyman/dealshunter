import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Resolve the HMAC secret at call time, not at module-load time.
 *
 * The original version threw at module load if ALERT_TOKEN_SECRET was
 * missing. That broke `npm run build` because Astro's prerender step
 * (sitemap-index.xml, etc.) imports this module transitively but never
 * calls signToken/verifyToken. The build environment doesn't have the
 * secret available (that's only injected at Worker runtime), so the
 * build failed with "ALERT_TOKEN_SECRET is not set".
 *
 * Making the check lazy fixes that: importing the module is safe,
 * calling signToken/verifyToken without the secret still throws a
 * clear error.
 */
function getSecret(): string {
  const secret =
    (typeof import.meta !== 'undefined' &&
      (import.meta as { env?: Record<string, string | undefined> }).env?.ALERT_TOKEN_SECRET) ||
    process.env.ALERT_TOKEN_SECRET;

  if (!secret) {
    throw new Error(
      'ALERT_TOKEN_SECRET is not set. ' +
      'Locally: add it to .env. ' +
      'Deployed: run `npx wrangler secret put ALERT_TOKEN_SECRET`.'
    );
  }
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export type TokenPayload = {
  subscriberId: number;
  purpose: 'unsubscribe' | 'manage';
  exp: number;
};

export function signToken(
  payload: Omit<TokenPayload, 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 30
): string {
  const secret = getSecret();
  const full: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const secret = getSecret();
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = createHmac('sha256', secret).update(body).digest();
  let got: Buffer;
  try {
    got = fromB64url(sig);
  } catch {
    return null;
  }
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;

  try {
    const parsed = JSON.parse(fromB64url(body).toString('utf8')) as TokenPayload;
    if (typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (parsed.purpose !== 'unsubscribe' && parsed.purpose !== 'manage') return null;
    if (typeof parsed.subscriberId !== 'number' || !Number.isFinite(parsed.subscriberId)) return null;
    return parsed;
  } catch {
    return null;
  }
}