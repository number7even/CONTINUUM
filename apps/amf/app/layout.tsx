import type { ReactNode } from 'react';

export const metadata = {
  title: 'AMF · Headless Hive',
  description: 'Autonomous Media Factory content studio.',
  robots: { index: false, follow: false },
};

// Brand CI: Inkwell #2C3639 / Lunar Eclipse #3F4E4F / Creme Brulee #A27B5B / Au Lait #DCD7C9
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          padding: 0,
          background: '#232b2d',
          color: '#f6f3ec',
          lineHeight: 1.55,
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
