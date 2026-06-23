import type { ReactNode } from 'react';

export const metadata = {
  title: 'Continuum Console',
  description: 'Operator console for a Continuum HTTP/SSE engine.',
  // Operator-only control plane — defense-in-depth no-index alongside the
  // X-Robots-Tag header (next.config.js) and robots.ts Disallow: /.
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: '2rem',
          background: '#232b2d',
          color: '#f6f3ec',
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  );
}
