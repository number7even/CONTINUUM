/**
 * POST /api/auth — AMF login / logout.
 *
 * { password } → verify against AMF_ACCESS_PASSWORD → set an HMAC-signed
 * HttpOnly session cookie (signed with AMF_SESSION_SECRET).
 * { action: 'logout' } → clear the cookie.
 *
 * Gated on the two operator secrets (P1/P9): 503 until both are set.
 */
import { signSession, safeEqual } from '../../../lib/session';

export const runtime = 'nodejs';

const COOKIE = 'amf_session';

function cookieHeader(value: string, maxAgeSec: number): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAgeSec}`;
}

export async function POST(req: Request): Promise<Response> {
  let body: { password?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  if (body.action === 'logout') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader('', 0) },
    });
  }

  const secret = process.env.AMF_SESSION_SECRET;
  const password = process.env.AMF_ACCESS_PASSWORD;
  if (!secret || !password) {
    return new Response('Access gating is not configured. Set AMF_ACCESS_PASSWORD + AMF_SESSION_SECRET in the deployment env to enable login.', { status: 503 });
  }
  if (typeof body.password !== 'string' || !safeEqual(body.password, password)) {
    return new Response('Invalid password.', { status: 401 });
  }

  const token = await signSession(secret);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookieHeader(token, 7 * 24 * 60 * 60) },
  });
}
