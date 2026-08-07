'use client';
/**
 * ViewSwitcher — the jumbotron nav. One persistent bar so every console surface is
 * reachable from every other: Brain · Board · Timeline · Ask (Sources · Studio land
 * as they ship). Fixes "I can't reach the Timeline / Ask from the Brain."
 *
 * Fixed top-center (ProjectSwitcher owns top-right). Highlights the active view.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { usePathname } from 'next/navigation';

const VIEWS = [
  { href: '/brain', label: 'Brain', icon: '◉' },
  { href: '/board', label: 'Board', icon: '▦' },
  { href: '/timeline', label: 'Timeline', icon: '⧗' },
  { href: '/ask', label: 'Ask', icon: '✦' },
];

export function ViewSwitcher() {
  const path = usePathname() ?? '';
  // Only surface on the app views (not the root landing).
  if (!VIEWS.some((v) => path === v.href || path.startsWith(v.href + '/'))) return null;

  return (
    <nav style={S.wrap}>
      {VIEWS.map((v) => {
        const active = path === v.href || path.startsWith(v.href + '/');
        return (
          <a key={v.href} href={v.href} style={{ ...S.link, ...(active ? S.active : {}) }} title={v.label}>
            <span style={{ opacity: 0.85 }}>{v.icon}</span>
            <span style={S.label}>{v.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 41,
    display: 'flex', gap: 4, padding: 4, borderRadius: 999,
    background: 'rgba(12,16,20,0.82)', border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(8px)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  link: {
    display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none',
    color: '#9ca3af', fontSize: 12, padding: '5px 12px', borderRadius: 999, transition: 'all 140ms',
  },
  active: { background: 'rgba(52,211,153,0.14)', color: '#6ee7b7', fontWeight: 700 },
  label: { letterSpacing: 0.3 },
};
