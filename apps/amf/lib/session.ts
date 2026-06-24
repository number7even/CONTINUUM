/**
 * AMF session signing — HMAC-SHA256 over Web Crypto (Edge + Node compatible).
 *
 * The session cookie is an HMAC-signed token the client cannot forge (it never
 * learns AMF_SESSION_SECRET; it only holds the signature). This is a real
 * server-issued gate, not a client-side check.
 *
 * Gate activation (P1/P9 — operator-controlled):
 *   - AMF_SESSION_SECRET unset  → gating INACTIVE (middleware passes through).
 *     Avoids locking the live site out before the operator configures it.
 *   - AMF_SESSION_SECRET set     → gating ENFORCED. Login needs AMF_ACCESS_PASSWORD.
 */
const enc = new TextEncoder();
const PREFIX = 'amf.v1.';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function b64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function signSession(secret: string, now = Date.now()): Promise<string> {
  const payload = `${PREFIX}${now}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${payload}.${b64(sig)}`;
}

export async function verifySession(token: string, secret: string, now = Date.now()): Promise<boolean> {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!payload.startsWith(PREFIX)) return false;
  const issued = Number(payload.slice(PREFIX.length));
  if (!Number.isFinite(issued) || now - issued > MAX_AGE_MS) return false;
  try {
    const key = await hmacKey(secret);
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sig, enc.encode(payload));
  } catch {
    return false;
  }
}

/** Constant-time string compare (avoids password timing leaks). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
