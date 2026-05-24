import type { ReactNode } from 'react';

export const metadata = {
  title: 'Continuum Console',
  description: 'Operator console for a Continuum HTTP/SSE engine.',
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
          background: '#0b0d10',
          color: '#e6e8eb',
          lineHeight: 1.5,
        }}
      >
        {children}
      </body>
    </html>
  );
}
