'use client';
/**
 * AskConsole — ask your knowledge, get grounded, TIER-CITED results.
 *
 * The conversational surface over Semantic SONA: type a question → the tier-aware
 * retrieval (continuum_ask_context) returns cited nodes, each rendered as a grounded
 * window that shows its trust tier (§5) — proven · authored · reference · external ·
 * claimed. Hover a card for the full excerpt. Filter by tier. No dead words: every
 * result proves its own standing, and nothing leaves the machine.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { useCallback, useRef, useState } from 'react';

type Tier = 'proven' | 'authored' | 'reference' | 'external' | 'claimed';
interface Node { id: string; title: string; source: string; type: string; tier: Tier; score: number; excerpt: string }
interface Turn { query: string; nodes: Node[]; error?: string; loading: boolean }

const TIER: Record<Tier, { color: string; label: string; hint: string }> = {
  proven: { color: '#34d399', label: 'PROVEN', hint: 'passed a verifyCommand (exit 0)' },
  authored: { color: '#22d3ee', label: 'AUTHORED', hint: 'a human P9 decision (the ledger)' },
  reference: { color: '#9ca3af', label: 'REFERENCE', hint: 'human/adapter-authored record — data to verify' },
  external: { color: '#f59e0b', label: 'EXTERNAL', hint: 'ingested, untrusted until checked' },
  claimed: { color: '#f87171', label: 'CLAIMED', hint: 'ungrounded until it cites a node' },
};
const TIERS: Tier[] = ['proven', 'authored', 'reference', 'external', 'claimed'];

export default function AskConsole() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<Set<Tier>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = useCallback(async (query: string) => {
    if (!query.trim()) return;
    const idx = turns.length;
    setTurns((t) => [...t, { query, nodes: [], loading: true }]);
    setQ('');
    try {
      const r = await fetch('/api/ask/context', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, limit: 16 }),
      });
      const d = await r.json();
      setTurns((t) => t.map((turn, i) => i === idx
        ? { query, nodes: d.nodes ?? [], loading: false, error: d.error === 'login' ? 'not authenticated — set CONTINUUM_HTTP_TOKEN' : d.error }
        : turn));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
    } catch (e) {
      setTurns((t) => t.map((turn, i) => i === idx ? { query, nodes: [], loading: false, error: e instanceof Error ? e.message : String(e) } : turn));
    }
  }, [turns.length]);

  const toggle = (tr: Tier) => setOnly((s) => { const n = new Set(s); n.has(tr) ? n.delete(tr) : n.add(tr); return n; });
  const visible = (nodes: Node[]) => (only.size === 0 ? nodes : nodes.filter((n) => only.has(n.tier)));

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div>
          <div style={{ fontSize: 14, letterSpacing: 1, color: '#6ee7b7' }}>CONTINUUM · ASK YOUR KNOWLEDGE</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Grounded, trust-tiered, local. Every result proves its own standing — no dead words.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TIERS.map((tr) => (
            <button key={tr} type="button" onClick={() => toggle(tr)}
              title={TIER[tr].hint}
              style={{ ...s.tierChip, borderColor: TIER[tr].color, color: TIER[tr].color, opacity: only.size === 0 || only.has(tr) ? 1 : 0.35 }}>
              {TIER[tr].label}
            </button>
          ))}
        </div>
      </header>

      <div ref={scrollRef} style={s.scroll}>
        {turns.length === 0 && (
          <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
            Ask anything about your knowledge — &ldquo;the authorship seal&rdquo;, &ldquo;how does the referee verify&rdquo;, &ldquo;what did we decide about audio&rdquo;…
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} style={{ marginBottom: 26 }}>
            <div style={s.qRow}><span style={s.qMark}>?</span><span style={s.qText}>{turn.query}</span></div>
            {turn.loading && <div style={{ color: '#f59e0b', fontSize: 12, marginLeft: 30 }}>…retrieving grounded context</div>}
            {turn.error && <div style={{ color: '#f87171', fontSize: 12, marginLeft: 30 }}>⚠ {turn.error}</div>}
            {!turn.loading && !turn.error && (
              <div style={{ marginLeft: 30 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                  {visible(turn.nodes).length} grounded source{visible(turn.nodes).length === 1 ? '' : 's'}
                  {only.size > 0 ? ` (filtered · ${turn.nodes.length} total)` : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visible(turn.nodes).map((n) => {
                    const t = TIER[n.tier] ?? TIER.claimed;
                    return (
                      <div key={n.id} style={{ ...s.card, borderLeft: `3px solid ${t.color}` }} title={n.excerpt}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ ...s.tierBadge, background: t.color + '22', color: t.color }} title={t.hint}>{t.label}</span>
                          <span style={{ fontSize: 10, color: '#6b7280' }}>{n.source} · {n.type} · {n.id.slice(0, 8)}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: '#e5e7eb', lineHeight: 1.4 }}>{n.title}</div>
                        {n.excerpt && <div style={s.excerpt}>{n.excerpt}</div>}
                      </div>
                    );
                  })}
                  {visible(turn.nodes).length === 0 && <div style={{ fontSize: 12, color: '#4b5563', fontStyle: 'italic' }}>no sources at this tier</div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form style={s.inputBar} onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your knowledge…" style={s.input} autoFocus />
        <button type="submit" style={s.send} disabled={!q.trim()}>Ask →</button>
      </form>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, background: '#05070a', color: '#e5e7eb', fontFamily: 'ui-sans-serif, system-ui', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' },
  tierChip: { fontSize: 9.5, letterSpacing: 0.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'transparent', border: '1px solid', cursor: 'pointer' },
  scroll: { flex: 1, overflowY: 'auto', padding: '18px 22px', maxWidth: 820, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  qRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  qMark: { width: 20, height: 20, borderRadius: 999, background: 'rgba(110,231,183,0.15)', color: '#6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  qText: { fontSize: 14.5, color: '#f3f4f6', fontWeight: 600 },
  card: { background: 'rgba(20,28,40,0.6)', borderRadius: 8, padding: '9px 11px', cursor: 'default' },
  tierBadge: { fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '1px 6px', borderRadius: 6 },
  excerpt: { fontSize: 11, color: '#9ca3af', lineHeight: 1.45, marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 66, overflow: 'hidden' },
  inputBar: { display: 'flex', gap: 10, padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', maxWidth: 820, width: '100%', margin: '0 auto', boxSizing: 'border-box' },
  input: { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '11px 14px', color: '#e5e7eb', fontSize: 14, outline: 'none' },
  send: { fontSize: 13, padding: '0 18px', borderRadius: 10, cursor: 'pointer', background: 'rgba(110,231,183,0.14)', border: '1px solid rgba(110,231,183,0.4)', color: '#6ee7b7', fontWeight: 600 },
};
