'use client';
/**
 * ProjectSwitcher — the one control that makes ONE console roam every product.
 *
 * Fixed top-right chip. Reads /api/projects, shows the active project, and on
 * change POSTs the choice (a cookie) then hard-reloads so the current page
 * (Brain / Board / Timeline) re-fetches against the newly-selected engine DB.
 *
 * Hidden entirely when only one project is declared — no clutter for single-repo
 * deployments.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { useEffect, useRef, useState } from 'react';

export function ProjectSwitcher() {
  const [projects, setProjects] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d: { projects?: string[]; current?: string }) => {
        if (!alive) return;
        setProjects(d.projects ?? []);
        setCurrent(d.current ?? '');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function pick(p: string) {
    if (p === current || busy) { setOpen(false); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: p }),
      });
      if (r.ok) { window.location.reload(); return; }
    } catch { /* noop */ }
    setBusy(false);
    setOpen(false);
  }

  if (projects.length <= 1) return null; // nothing to switch

  return (
    <div ref={ref} style={S.wrap}>
      <button style={S.chip} onClick={() => setOpen((o) => !o)} disabled={busy} title="Switch project">
        <span style={S.dot} />
        <span style={S.label}>{busy ? '…' : current || 'project'}</span>
        <span style={S.caret}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={S.menu}>
          {projects.map((p) => (
            <button
              key={p}
              style={{ ...S.item, ...(p === current ? S.itemActive : {}) }}
              onClick={() => pick(p)}
            >
              {p === current ? '● ' : '○ '}{p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { position: 'fixed', top: 14, right: 16, zIndex: 40, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  chip: {
    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
    background: 'rgba(20,26,28,0.82)', color: '#e9f6ee', border: '1px solid #2f4a40',
    borderRadius: 999, padding: '6px 12px', fontSize: 12, backdropFilter: 'blur(6px)',
  },
  dot: { width: 7, height: 7, borderRadius: 999, background: '#39d98a', boxShadow: '0 0 8px #39d98a' },
  label: { fontWeight: 600, letterSpacing: 0.3, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  caret: { opacity: 0.6, fontSize: 10 },
  menu: {
    position: 'absolute', top: 38, right: 0, minWidth: 180,
    background: 'rgba(16,22,24,0.96)', border: '1px solid #2f4a40', borderRadius: 10,
    padding: 6, display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
  },
  item: {
    textAlign: 'left', cursor: 'pointer', background: 'transparent', color: '#cfe6da',
    border: 'none', borderRadius: 6, padding: '7px 10px', fontSize: 12,
  },
  itemActive: { background: 'rgba(57,217,138,0.12)', color: '#eafff3', fontWeight: 700 },
};
