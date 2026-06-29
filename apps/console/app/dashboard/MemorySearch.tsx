'use client';

/**
 * Memory search panel — web UI for Progressive Disclosure Layer-1 over the
 * tenant's 5-source memory (docs / git / transcripts / feedback / observations).
 * Returns compact hits cheaply — search without burning LLM tokens.
 */
import { useState } from 'react';

const INK = '#232b2d', PANEL2 = '#2a3335', HAIR = '#36423f', TEXT = '#f6f3ec',
  BODY = '#c8c3b6', MUTED = '#9aa09a', CREME = '#c89a72', RED = '#ff8585';

interface Hit { id: string; source?: string; type?: string; timestamp?: string; title?: string }

export default function MemorySearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/dashboard/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q.trim() }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setHits(j.hits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={search} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search project memory — git, docs, transcripts…"
          style={{ flex: 1, background: PANEL2, color: TEXT, border: `1px solid ${HAIR}`, borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.9rem', outline: 'none' }}
        />
        <button type="submit" disabled={busy || !q.trim()} style={{ padding: '0.6rem 1.1rem', borderRadius: 8, border: 'none', background: busy || !q.trim() ? '#3a4446' : CREME, color: busy || !q.trim() ? MUTED : '#1c2224', fontWeight: 600, fontSize: '0.88rem', cursor: busy || !q.trim() ? 'not-allowed' : 'pointer' }}>
          {busy ? '…' : 'Search'}
        </button>
      </form>

      {error && <div style={{ background: '#3a1010', border: `1px solid ${RED}55`, borderRadius: 8, padding: '0.7rem 0.9rem', color: RED, fontSize: '0.82rem' }}>{error}</div>}

      {hits && !error && (
        <div>
          <div style={{ color: MUTED, fontSize: '0.78rem', marginBottom: '0.6rem' }}>{hits.length} hit{hits.length === 1 ? '' : 's'} · Layer-1 (compact, token-cheap)</div>
          <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '40vh', overflow: 'auto' }}>
            {hits.length === 0 && <div style={{ color: MUTED, fontSize: '0.85rem' }}>No matches.</div>}
            {hits.map((h) => (
              <div key={h.id} style={{ background: INK, border: `1px solid ${HAIR}`, borderRadius: 7, padding: '0.6rem 0.8rem' }}>
                <div style={{ fontSize: '0.85rem', color: BODY }}>{h.title || '(untitled)'}</div>
                <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.3rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem', color: MUTED }}>
                  {h.source && <span style={{ color: CREME }}>{h.source}</span>}
                  {h.type && <span>{h.type}</span>}
                  {h.timestamp && <span>{new Date(h.timestamp).toLocaleDateString()}</span>}
                  <span style={{ marginLeft: 'auto' }}>{h.id.slice(0, 8)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
