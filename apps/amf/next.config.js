/**
 * AMF studio — operator-facing content engine. Like the console, this is NOT a
 * public marketing surface: noindex + security headers, x-powered-by stripped.
 */
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,

  // Takes `sharp` off the request path. Next serves /_next/image whenever the image
  // optimizer is enabled — regardless of whether any page renders <Image> — so an
  // attacker can call it directly with arbitrary w/q parameters and make the server
  // re-encode public assets on demand. That is a CPU/memory exhaustion vector, and it
  // is what carries sharp's high-severity advisory into a live route.
  //
  // Verified before setting this: this app renders <Image> nowhere (the only next/image
  // hit in the tree is a skills test fixture), nothing imports sharp directly, and no
  // remotePatterns are configured. So the optimizer serves no purpose here and turning
  // it off costs nothing.
  //
  // Note for whoever reads the audit next: this REMOVES THE RUNTIME RISK but does NOT
  // change `npm audit`. sharp remains a transitive dependency of next, and npm audit
  // scans the dependency tree, not reachability. The advisory count stays at 5. That is
  // the difference between fixing the exposure and satisfying the scanner — this fixes
  // the exposure, and is the evidence that justifies an allowlist entry rather than a
  // substitute for one.
  //
  // If this app ever renders <Image> or accepts uploads, revisit both this flag and the
  // rationale, because the reasoning above stops being true the moment either is added.
  images: { unoptimized: true },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
