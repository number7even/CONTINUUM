import type { MetadataRoute } from 'next';

/**
 * Operator-only control plane — disallow ALL crawling.
 *
 * Generates /robots.txt:
 *   User-Agent: *
 *   Disallow: /
 *
 * Deliberately NO sitemap directive: we do not map a private control plane
 * for search engines (per the 2026-06-18 audit verdict). Paired with the
 * app-wide X-Robots-Tag header (next.config.js) and the <meta name="robots">
 * no-index in layout.tsx.
 *
 * Bound by The Nine v0.1.0.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
