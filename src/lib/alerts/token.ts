import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.ALERT_TOKEN_SECRET;
if (!SECRET) throw new Error('ALERT_TOKEN_SECRET is not set');

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
  const full: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const sig = b64url(createHmac('sha256', SECRET!).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = createHmac('sha256', SECRET!).update(body).digest();
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