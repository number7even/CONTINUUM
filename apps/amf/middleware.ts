/**
 * AMF access gate.
 *
 * Enforces login on the whole app WHEN AMF_SESSION_SECRET is configured. If it
 * is not set, the gate is inactive (pass-through) so the site is never
 * accidentally locked out before the operator configures it (P9 — the operator
 * activates the gate by injecting the secret).
 *
 * Pages → redirect to /login when unauthenticated. API routes → 401.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from './lib/session';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.AMF_SESSION_SECRET;
  if (!secret) return NextResponse.next(); // gating not configured → open

  const { pathname } = req.nextUrl;
  // Always allow the login page + auth endpoint.
  if (pathname === '/login' || pathname.startsWith('/api/auth')) return NextResponse.next();
  // Auphonic webhook is server-to-server (Auphonic-called) — must stay reachable.
  if (pathname === '/api/audio/webhook') return NextResponse.next();

  const token = req.cookies.get('amf_session')?.value;
  if (token && (await verifySession(token, secret))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
