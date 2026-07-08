'use client';
/**
 * The Timeline — CONTINUUM's session history. The receipt for "we did X".
 *
 * Day → Session → items (commits / docs / code / concepts / memory), grouped by
 * idle-gap. Click a session or item → jump to /brain and isolate that cluster.
 * This is the retrospective half of the PM loop (history); the board is the
 * prospective half (what's next).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { useCallback, useEffect, useState } from 'react';

type ItemKind = 'commit' | 'doc' | 'code' | 'concept' | 'memory';
interface Item { id: string; kind: ItemKind; title: string; ts: string; refs: string[]; checkpoint: boolean }
interface Session { start: string; end: string; items: Item[]; counts: Record<ItemKind, number>; checkpoints: number }
interface Day { date: string; sessions: Session[]; total: number }

const KIND: Record<ItemKind, { color: string; label: string }> = {
  commit: { color: '#f59e0b', label: 'commit' },
  doc: { color: '#34d399', label: 'doc' },
  code: { color: '#f472b6', label: 'code' },
  concept: { color: '#a78bfa', label: 'concept' },
  memory: { color: '#38bdf8', label: 'memory' },
};

const hhmm = (iso: string) => iso.slice(11, 16);
const dayLabel = (d: string) => {
  try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
};

// ── Sprint lanes — detected from real commit tags (W22, W27…), ISO-week fallback ──
const isoWeekNum = (dateStr: string): number => {
  const d = new Date(dateStr + 'T00:00:00');
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 86400000 / 7);
};
// Pull an explicit sprint tag (W27, W27-3, Sprint W22) from a commit subject.
const tagFrom = (title: string): string | null => {
  const m = title.match(/\bW(\d{1,2})(?:[-.]\d+)?\b/) || title.match(/\bSprint\s+W?(\d{1,2})\b/i);
  return m ? 'W' + m[1] : null;
};
// A day's DOMINANT explicit sprint tag (majority commit tag), or null if untagged.
const dominantTag = (day: Day): string | null => {
  const counts: Record<string, number> = {};
  for (const ss of day.sessions) for (const it of ss.items) {
    if (it.kind !== 'commit' && it.kind !== 'memory') continue;
    const t = tagFrom(it.title);
    if (t) counts[t] = (counts[t] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
};

export default function Timeline() {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000); // never hang on a bare "loading"
    try {
      const r = await fetch('/api/timeline', { cache: 'no-store', signal: ctrl.signal });
      const d = await r.json();
      if (d.error && d.error !== 'login') throw new Error(d.error);
      setDays(d.days ?? []);
      if (d.error === 'login') setError('not authenticated — set CONTINUUM_HTTP_TOKEN');
    } catch (e) {
      setError(e instanceof Error && e.name === 'AbortError'
        ? 'timed out fetching history — the engine may be warming up (dev first-compile). hit ↻ to retry.'
        : (e instanceof Error ? e.message : String(e)));
    } finally { clearTimeout(timer); setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Jump to the brain and isolate the given observation ids.
  const isolateInBrain = (ids: string[]) => {
    if (ids.length) window.location.href = '/brain?focus=' + encodeURIComponent(ids.slice(0, 40).join(','));
  };
  const toggleDay = (d: string) => setCollapsed((p) => { const n = new Set(p); n.has(d) ? n.delete(d) : n.add(d); return n; });

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div>
          <div style={{ fontSize: 14, letterSpacing: 1, color: '#6ee7b7' }}>CONTINUUM · TIMELINE</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            The receipt for "we did X." Click a session → isolate it in the brain.
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <a href="/brain" style={s.navlink}>◉ brain</a>
          <a href="/board" style={s.navlink}>▦ board</a>
          <button type="button" onClick={() => void load()} style={s.navlink}>↻</button>
        </div>
      </header>

      {error && (
        <div style={{ padding: 14, fontSize: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#f87171' }}>⚠ {error}</span>
          <button type="button" onClick={() => void load()} style={s.navlink}>↻ retry</button>
        </div>
      )}
      {loading && (
        <div style={{ ...s.scroll, paddingTop: 22 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 14 }}>reading the session history…</div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ ...s.sprint, marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ ...sk, width: 90, height: 12 }} />
                <span style={{ ...sk, width: 130, height: 10 }} />
                <span style={{ ...sk, marginLeft: 'auto', width: 60, height: 10 }} />
              </div>
              {[0, 1].map((j) => (
                <div key={j} style={{ marginLeft: 12, marginBottom: 10 }}>
                  <span style={{ ...sk, width: 160, height: 11, display: 'block', marginBottom: 8 }} />
                  {[0, 1, 2].map((k) => (
                    <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 6, marginLeft: 12 }}>
                      <span style={{ ...sk, width: 8, height: 8, borderRadius: 4 }} />
                      <span style={{ ...sk, width: `${45 + ((i + j + k) % 4) * 12}%`, height: 10 }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <style>{`@keyframes tlshimmer { 0% { opacity: .35 } 50% { opacity: .7 } 100% { opacity: .35 } }`}</style>
        </div>
      )}
      {!loading && !error && days.length === 0 && (
        <div style={{ color: '#6b7280', padding: 14, fontSize: 13 }}>no history yet — run the git/docs adapters or work a session with CONTINUUM registered.</div>
      )}

      <div style={s.scroll}>
        {(() => {
          // Sprint anchors from explicit tags (first-appearance order) define the
          // real boundaries; untagged days fall into the containing sprint; days
          // after the last tag continue as W28, W29… (weekly, no ISO-week collision).
          const taggedDays = days.map((d) => ({ date: d.date, tag: dominantTag(d) })).filter((x): x is { date: string; tag: string } => !!x.tag);
          taggedDays.sort((a, b) => a.date.localeCompare(b.date));
          const anchors: { date: string; tag: string }[] = [];
          { const seen = new Set<string>(); for (const td of taggedDays) if (!seen.has(td.tag)) { seen.add(td.tag); anchors.push(td); } }
          const firstTagDate = anchors[0]?.date ?? '';
          const lastTagDate = taggedDays.length ? taggedDays[taggedDays.length - 1]!.date : '';
          const maxTagNum = anchors.reduce((m, a) => Math.max(m, parseInt(a.tag.slice(1), 10) || 0), 0);
          const WEEK = 7 * 86400000;
          const sprintForDay = (day: Day): string => {
            const t = dominantTag(day);
            if (t) return t;
            if (!anchors.length) return 'W' + isoWeekNum(day.date);
            if (day.date < firstTagDate) return 'W' + isoWeekNum(day.date);       // pre-era (lower #, no collision)
            if (day.date <= lastTagDate) {                                        // within a tagged sprint window
              let lbl = anchors[0]!.tag;
              for (const a of anchors) { if (a.date <= day.date) lbl = a.tag; else break; }
              return lbl;
            }
            const weeks = Math.floor((new Date(day.date + 'T00:00:00').getTime() - new Date(lastTagDate + 'T00:00:00').getTime()) / WEEK);
            return 'W' + (maxTagNum + 1 + weeks);                                 // post-era: continue numbering
          };
          const byS = new Map<string, Day[]>();
          for (const day of days) { const lbl = sprintForDay(day); if (!byS.has(lbl)) byS.set(lbl, []); byS.get(lbl)!.push(day); }
          const sprints = [...byS.entries()].sort((a, b) => (b[1][0]?.date ?? '').localeCompare(a[1][0]?.date ?? ''));

          const renderDay = (day: Day) => {
            const isCol = collapsed.has(day.date);
            const dayCounts = day.sessions.reduce((acc, ss) => {
              (Object.keys(ss.counts) as ItemKind[]).forEach((k) => (acc[k] = (acc[k] ?? 0) + ss.counts[k]));
              return acc;
            }, {} as Record<ItemKind, number>);
            return (
              <div key={day.date} style={{ marginBottom: 14 }}>
                <div style={s.dayHead} onClick={() => toggleDay(day.date)}>
                  <span style={{ color: '#6b7280', fontSize: 11 }}>{isCol ? '▸' : '▾'}</span>
                  <span style={{ fontSize: 13.5, color: '#e5e7eb', fontWeight: 600 }}>{dayLabel(day.date)}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{day.sessions.length} session{day.sessions.length === 1 ? '' : 's'}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                    {(Object.keys(KIND) as ItemKind[]).filter((k) => dayCounts[k]).map((k) => (
                      <span key={k} style={{ ...s.badge, color: KIND[k].color }}>{dayCounts[k]} {KIND[k].label}</span>
                    ))}
                  </span>
                </div>
                {!isCol && (
                  <div style={{ marginLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 14 }}>
                    {day.sessions.map((ss, si) => (
                      <div key={si} style={s.session}>
                        <div style={s.sessionHead} onClick={() => isolateInBrain(ss.items.map((it) => it.id))}>
                          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#9ca3af' }}>{hhmm(ss.start)}–{hhmm(ss.end)}</span>
                          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            {ss.checkpoints > 0 && <span style={{ ...s.badge, color: '#fbbf24', background: 'rgba(251,191,36,0.12)' }}>◆ {ss.checkpoints}</span>}
                            {(Object.keys(KIND) as ItemKind[]).filter((k) => ss.counts[k]).map((k) => (
                              <span key={k} style={{ ...s.badge, color: KIND[k].color }}>{ss.counts[k]} {KIND[k].label}</span>
                            ))}
                          </span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#38bdf8' }}>isolate ↗</span>
                        </div>
                        <div>
                          {ss.items.map((it) => (
                            it.checkpoint ? (
                              <div key={it.id} style={s.checkpoint} onClick={() => isolateInBrain([it.id, ...it.refs])}>
                                <span style={{ color: '#fbbf24', fontSize: 12, flexShrink: 0 }}>◆</span>
                                <span style={{ fontSize: 8.5, letterSpacing: 1, color: '#fbbf24', flexShrink: 0 }}>CHECKPOINT</span>
                                <span style={{ fontSize: 9, color: '#a16207', width: 34, flexShrink: 0 }}>{hhmm(it.ts)}</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fde68a' }}>{it.title}</span>
                              </div>
                            ) : (
                              <div key={it.id} style={s.item} onClick={() => isolateInBrain([it.id, ...it.refs])}>
                                <span style={{ width: 7, height: 7, borderRadius: 4, background: KIND[it.kind].color, flexShrink: 0 }} />
                                <span style={{ fontSize: 9, color: '#6b7280', width: 34, flexShrink: 0 }}>{hhmm(it.ts)}</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#d1d5db' }}>{it.title}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          };

          return sprints.map(([label, sprintDays]) => {
            const key = 'sprint:' + label;
            const dates = sprintDays.map((d) => d.date).sort();
            const fmt = (ds: string) => new Date(ds + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const range = dates.length ? (dates[0] === dates[dates.length - 1] ? fmt(dates[0]!) : `${fmt(dates[0]!)} – ${fmt(dates[dates.length - 1]!)}`) : '';
            const meta = { label, range };
            const spCol = collapsed.has(key);
            const spCounts = sprintDays.flatMap((d) => d.sessions).reduce((acc, ss) => {
              (Object.keys(ss.counts) as ItemKind[]).forEach((k) => (acc[k] = (acc[k] ?? 0) + ss.counts[k]));
              return acc;
            }, {} as Record<ItemKind, number>);
            const total = sprintDays.reduce((n, d) => n + d.total, 0);
            const spCheckpoints = sprintDays.flatMap((d) => d.sessions).reduce((n, ss) => n + ss.checkpoints, 0);
            const isolateSprint = () => isolateInBrain(sprintDays.flatMap((d) => d.sessions).flatMap((ss) => ss.items.map((it) => it.id)));
            return (
              <div key={key} style={s.sprint}>
                <div style={s.sprintHead} onClick={() => toggleDay(key)}>
                  <span style={{ color: '#a78bfa', fontSize: 12 }}>{spCol ? '▸' : '▾'}</span>
                  <span style={{ fontSize: 12, letterSpacing: 1.5, color: '#a78bfa', fontWeight: 700 }}>SPRINT · {meta.label}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{meta.range} · {total} events</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {spCheckpoints > 0 && <span style={{ ...s.badge, color: '#fbbf24', background: 'rgba(251,191,36,0.12)' }}>◆ {spCheckpoints}</span>}
                    {(Object.keys(KIND) as ItemKind[]).filter((k) => spCounts[k]).map((k) => (
                      <span key={k} style={{ ...s.badge, color: KIND[k].color }}>{spCounts[k]} {KIND[k].label}</span>
                    ))}
                    <span onClick={(e) => { e.stopPropagation(); isolateSprint(); }} style={{ fontSize: 10, color: '#38bdf8', cursor: 'pointer', marginLeft: 4 }}>isolate ↗</span>
                  </span>
                </div>
                {!spCol && <div style={{ marginTop: 12, marginLeft: 4 }}>{sprintDays.map(renderDay)}</div>}
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

const sk: React.CSSProperties = { display: 'inline-block', background: 'rgba(255,255,255,0.08)', borderRadius: 4, animation: 'tlshimmer 1.4s ease-in-out infinite' };

const s: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, background: '#05070a', color: '#e5e7eb', fontFamily: 'ui-sans-serif, system-ui', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  navlink: { fontSize: 12, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#e5e7eb', textDecoration: 'none', cursor: 'pointer' },
  scroll: { flex: 1, overflowY: 'auto', padding: '18px 22px', maxWidth: 900, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  sprint: { marginBottom: 22, border: '1px solid rgba(167,139,250,0.16)', borderRadius: 12, padding: '12px 14px', background: 'rgba(167,139,250,0.03)' },
  sprintHead: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingBottom: 4 },
  dayHead: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 0', marginBottom: 6 },
  badge: { fontSize: 9.5, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.05)' },
  session: { marginBottom: 12 },
  sessionHead: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', marginBottom: 4 },
  item: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 6 },
  checkpoint: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 6, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', margin: '3px 0' },
};
