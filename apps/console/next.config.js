/**
 * Continuum Console — operator-only control plane / private demo surface.
 *
 * This app is NEVER a public site. It is the AaaS operator dashboard +
 * H-MARA Gateway demo chat, reached over Bearer-authenticated SSE to
 * continuum-engine.fly.dev. Config goals (per the 2026-06-18 audit verdict):
 *   1. Keep it OUT of every search index (X-Robots-Tag + robots.ts + meta).
 *   2. Harden against client-side attack (CSP, clickjacking, sniffing).
 *   3. Strip the x-powered-by info leak.
 *
 * Bound by The Nine v0.1.0.
 */

// CSP tuned to the app's real surface (verified against app/ source):
//   - React inline style={{}} → style attributes → style-src 'unsafe-inline'
//   - Next.js App Router streaming injects inline bootstrap <script> → script-src
//     'unsafe-inline'. The STRICTER option is a nonce + 'strict-dynamic' issued
//     from middleware; not used here to avoid blanking the live demo if the
//     nonce propagation misfires. Flagged for operator override.
//   - Browser only calls same-origin /api/chat; the Fly engine is reached
//     server-side. Fly origin allowlisted defensively for any future client SSE.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://continuum-engine.fly.dev",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
  // Operator-only: authoritative, app-wide no-index. Belt to robots.ts'
  // braces and the <meta name="robots"> in layout.tsx.
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strip `x-powered-by: Next.js` (information leak flagged in the audit).
  poweredByHeader: false,
  // Default to Node runtime everywhere (the MCP SDK SSE client needs
  // Node's EventSource + fetch surface; Edge runtime is incompatible).
  experimental: {},
  async headers() {
    // /brain runs a WebGL force-graph engine (3d-force-graph + three) that uses
    // eval()/new Function() and blob: workers — the strict script-src blocks it,
    // leaving the canvas blank. Relax ONLY /brain (operator-only, non-public);
    // every other route keeps the hardened CSP via the negative-lookahead source.
    const brainCsp =
      contentSecurityPolicy.replace(
        "script-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      ) + "; worker-src 'self' blob:";
    // /brain also hosts the voice orb (Web Speech API) → needs the microphone,
    // which the app-wide Permissions-Policy disables. Grant it to self on /brain only.
    const brainHeaders = securityHeaders.map((h) => {
      if (h.key === 'Content-Security-Policy') return { key: h.key, value: brainCsp };
      if (h.key === 'Permissions-Policy') return { key: h.key, value: h.value.replace('microphone=()', 'microphone=(self)') };
      return h;
    });
    return [
      { source: '/brain', headers: brainHeaders },
      { source: '/((?!brain).*)', headers: securityHeaders },
    ];
  },
};

module.exports = nextConfig;
