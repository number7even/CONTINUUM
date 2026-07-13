'use client';
/**
 * The Board — CONTINUUM's verifiable Kanban.
 *
 * Six columns = the 6-state model. Cards = todos, classified by the PROOF GATE
 * (see /api/board): a task reaches DONE only with a green verifyCommand; an
 * unproven "done" falls to SKIPPED; a done-but-red task is caught in FAILED.
 * Click a card → its auto-compiled dossier (refs → verified observations).
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { useCallback, useEffect, useState } from 'react';

type Column = 'RUNNING' | 'REVIEW' | 'DONE' | 'SKIPPED' | 'BLOCKED' | 'FAILED';
type LedgerVerdict = 'PROVEN' | 'PENDING_HUMAN' | 'CONTESTED' | 'REFUTED' | 'UNVERIFIED' | 'INVALID' | null;
interface Card {
  id: string; title: string; status: string; column: Column; ledgerVerdict: LedgerVerdict;
  verifyCommand: string | null; hasVerify: boolean; refs: string[];
  leverage: number; blockedByOpen: string[]; createdAt: string | null;
}
interface SprintFilter { label: string; from: string; to: string }

const COLUMNS: { key: Column; label: string; color: string; hint: string }[] = [
  { key: 'BLOCKED', label: 'BLOCKED', color: '#f59e0b', hint: 'waiting on upstream' },
  { key: 'RUNNING', label: 'RUNNING', color: '#38bdf8', hint: 'actionable now' },
  { key: 'REVIEW', label: 'REVIEW', color: '#a78bfa', hint: 'A+V+T green · awaiting YOUR signature (P9)' },
  { key: 'DONE', label: 'DONE', color: '#34d399', hint: 'PROVEN — full A·V·T·H TruthBlock' },
  { key: 'SKIPPED', label: 'SKIPPED', color: '#94a3b8', hint: 'done without proof — not accepted' },
  { key: 'FAILED', label: 'FAILED', color: '#f87171', hint: 'V disputed or T failed — the veto' },
];

// The one-line reason a card sits where it does — the true ledger verdict, in operator words.
const VERDICT_NOTE: Record<string, { text: string; color: string }> = {
  PENDING_HUMAN: { text: '⚖ needs your signature', color: '#a78bfa' },
  REFUTED: { text: '✗ T failed — mechanical veto', color: '#f87171' },
  CONTESTED: { text: '✗ V disputed the claim', color: '#f87171' },
  INVALID: { text: '✗ signature/collusion invalid', color: '#f87171' },
  PROVEN: { text: '✓ A·V·T·H proven', color: '#34d399' },
  UNVERIFIED: { text: '· not yet validated/tested', color: '#6b7280' },
};

interface Obs { id: string; type?: string; content?: string; metadata?: Record<string, unknown> }

export default function Board() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);
  const [dossier, setDossier] = useState<{ loading: boolean; obs: Obs[] } | null>(null);
  // Sprint focus arrives from a timeline sprint click: /board?sprint=W27&from=…&to=…
  const [sprint, setSprint] = useState<SprintFilter | null>(null);
  const [attesting, setAttesting] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const label = p.get('sprint'), from = p.get('from'), to = p.get('to');
    if (label && from && to) setSprint({ label, from, to });
  }, []);
  const clearSprint = () => { setSprint(null); window.history.replaceState(null, '', '/board'); };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/board', { cache: 'no-store' });
      const d = await r.json();
      if (d.error && d.error !== 'login') throw new Error(d.error);
      setCards(d.cards ?? []);
      if (d.error === 'login') setError('not authenticated — set CONTINUUM_HTTP_TOKEN');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The P9 leap, from the Board. Signs a decision with the operator's LOCAL key (server-side
  // via /api/attest) and calls continuum_attest. On success the card jumps PENDING_HUMAN → DONE.
  const attest = useCallback(async (id: string) => {
    setAttesting(id); setError(null);
    try {
      const r = await fetch('/api/attest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todoId: id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'attest failed');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAttesting(null); }
  }, [load]);

  const openDossier = useCallback(async (card: Card) => {
    setSelected(card);
    if (!card.refs.length) { setDossier({ loading: false, obs: [] }); return; }
    setDossier({ loading: true, obs: [] });
    try {
      const r = await fetch('/api/observation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: card.refs }),
      });
      const d = await r.json();
      setDossier({ loading: false, obs: d.observations ?? [] });
    } catch { setDossier({ loading: false, obs: [] }); }
  }, []);

  // A task belongs to a sprint if it came into being inside that sprint's date
  // window (P4: an honest, defensible binding — not an invented sprint↔task field).
  const inSprint = (c: Card) => {
    if (!sprint) return true;
    const d = (c.createdAt ?? '').slice(0, 10);
    return d >= sprint.from && d <= sprint.to;
  };
  const visible = cards.filter(inSprint);
  const boundable = cards.filter(k => k.createdAt).length;
  const byCol = (c: Column) => visible.filter(k => k.column === c);
  const doneWithProof = visible.filter(k => k.column === 'DONE').length;
  const totalDoneClaims = visible.filter(k => k.status === 'done').length;

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div>
          <div style={{ fontSize: 14, letterSpacing: 1, color: '#6ee7b7' }}>CONTINUUM · THE BOARD</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            Done is not a button — it&apos;s a PROVEN multi-signature TruthBlock (A·V·T·H).
            {' '}{doneWithProof} proven · {totalDoneClaims || 0} “done” claims.
            {' · '}<span style={{ color: '#a78bfa' }}>ledger-gated</span>
          </div>
        </div>
        <button type="button" onClick={() => void load()} style={s.refresh}>↻ refresh</button>
      </header>

      {sprint && (
        <div style={s.sprintBanner}>
          <span style={{ color: '#6ee7b7', fontWeight: 700, letterSpacing: 0.5 }}>▦ SPRINT {sprint.label}</span>
          <span style={{ color: '#9ca3af' }}>{sprint.from} → {sprint.to}</span>
          <span style={{ color: '#e5e7eb' }}>{visible.length} task{visible.length === 1 ? '' : 's'} created in-window</span>
          {boundable < cards.length && (
            <span style={{ color: '#6b7280', fontSize: 11 }} title="tasks with no createdAt can't be bound to a sprint">
              ({cards.length - boundable} undated, unbindable)
            </span>
          )}
          <button type="button" onClick={clearSprint} style={s.clear}>✕ clear · all sprints</button>
        </div>
      )}

      {error && <div style={{ color: '#f87171', padding: 12, fontSize: 13 }}>⚠ {error}</div>}
      {loading && <div style={{ color: '#f59e0b', padding: 12, fontSize: 13 }}>…loading the plan</div>}

      <div style={s.columns}>
        {COLUMNS.map(col => {
          const items = byCol(col.key);
          return (
            <div key={col.key} style={s.column}>
              <div style={{ ...s.colHead, borderColor: col.color }}>
                <span style={{ color: col.color, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>{col.label}</span>
                <span style={{ color: '#6b7280', fontSize: 11 }}>{items.length}</span>
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>{col.hint}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(card => (
                  <div key={card.id} onClick={() => void openDossier(card)}
                    style={{ ...s.card, borderLeft: `3px solid ${col.color}`, outline: selected?.id === card.id ? `1px solid ${col.color}` : 'none' }}>
                    <div style={{ fontSize: 12.5, color: '#e5e7eb', lineHeight: 1.4 }}>{card.title}</div>
                    <div style={s.cardMeta}>
                      {card.leverage > 0 && <span style={s.badge}>unblocks {card.leverage}</span>}
                      {card.refs.length > 0 && <span style={s.badge}>dossier {card.refs.length}</span>}
                      {card.hasVerify
                        ? <span style={{ ...s.badge, color: '#6ee7b7' }} title={card.verifyCommand ?? ''}>✓ verify</span>
                        : <span style={{ ...s.badge, color: '#f59e0b' }}>⚠ no proof</span>}
                    </div>
                    {card.column === 'BLOCKED' && card.blockedByOpen.length > 0 && (
                      <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>needs {card.blockedByOpen.map(x => x.slice(0, 8)).join(', ')}</div>
                    )}
                    {card.ledgerVerdict && VERDICT_NOTE[card.ledgerVerdict] && (
                      <div style={{ fontSize: 10, color: VERDICT_NOTE[card.ledgerVerdict].color, marginTop: 5 }}>
                        {VERDICT_NOTE[card.ledgerVerdict].text}
                      </div>
                    )}
                    {card.ledgerVerdict === 'PENDING_HUMAN' && (
                      <button
                        type="button"
                        disabled={attesting === card.id}
                        onClick={(e) => { e.stopPropagation(); void attest(card.id); }}
                        style={{ ...s.attest, opacity: attesting === card.id ? 0.6 : 1 }}
                        title="Sign the P9 leap with your local key — mints acceptance, moves the card to DONE"
                      >
                        {attesting === card.id ? '⧗ signing…' : '⚖ Attest — sign to accept (P9)'}
                      </button>
                    )}
                  </div>
                ))}
                {items.length === 0 && <div style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <aside style={s.dossier}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#38bdf8' }}>DOSSIER</span>
            <span style={{ marginLeft: 'auto', cursor: 'pointer', color: '#6b7280' }} onClick={() => { setSelected(null); setDossier(null); }}>✕</span>
          </div>
          <div style={{ fontSize: 14, color: '#e5e7eb', fontWeight: 600, margin: '8px 0' }}>{selected.title}</div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>{selected.status} · {selected.column} · {selected.id.slice(0, 8)}</div>
          {selected.verifyCommand && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: '#6b7280' }}>PROOF GATE</div>
              <pre style={s.code}>{selected.verifyCommand}</pre>
            </div>
          )}
          <div style={{ fontSize: 10, letterSpacing: 1, color: '#6b7280', margin: '12px 0 6px' }}>CONTEXT ({selected.refs.length})</div>
          {dossier?.loading && <div style={{ color: '#f59e0b', fontSize: 12 }}>…loading</div>}
          {!dossier?.loading && dossier?.obs.length === 0 && <div style={{ fontSize: 12, color: '#6b7280' }}>no linked observations</div>}
          {dossier?.obs.map(o => (
            <div key={o.id} style={s.obs}>
              <div style={{ fontSize: 10, color: '#a78bfa' }}>{o.type ?? 'obs'} · {o.id.slice(0, 8)}</div>
              <pre style={s.code}>{(o.content ?? '').slice(0, 500)}</pre>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, background: '#05070a', color: '#e5e7eb', fontFamily: 'ui-sans-serif, system-ui', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  refresh: { marginLeft: 'auto', fontSize: 12, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#e5e7eb' },
  columns: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: 16, overflowX: 'auto', minHeight: 0 },
  column: { background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 12, overflowY: 'auto', minWidth: 180 },
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid', paddingBottom: 6, marginBottom: 4 },
  card: { background: 'rgba(20,28,40,0.7)', borderRadius: 8, padding: '9px 11px', cursor: 'pointer' },
  cardMeta: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  badge: { fontSize: 9.5, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#9ca3af' },
  attest: { marginTop: 8, width: '100%', fontSize: 11, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', fontWeight: 600, background: 'rgba(167,139,250,0.16)', border: '1px solid rgba(167,139,250,0.5)', color: '#c4b5fd' },
  dossier: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'rgba(8,11,16,0.97)', borderLeft: '1px solid rgba(56,189,248,0.25)', padding: 18, overflowY: 'auto', zIndex: 5, boxShadow: '-8px 0 40px rgba(0,0,0,0.6)' },
  code: { fontSize: 11, color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 6, margin: '4px 0 0' },
  obs: { marginBottom: 10 },
  sprintBanner: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '9px 20px', fontSize: 12, background: 'rgba(52,211,153,0.06)', borderBottom: '1px solid rgba(52,211,153,0.18)' },
  clear: { marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#e5e7eb' },
};
