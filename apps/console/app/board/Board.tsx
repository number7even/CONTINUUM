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
  commitShas: string[]; testExitCode: number | null;
  leverage: number; blockedByOpen: string[]; createdAt: string | null;
  depth: number; onCriticalPath: boolean;
}
interface CriticalNode { id: string; title: string; column: Column; blocked: boolean }
interface Orphan { sha: string; title: string }
interface Sprint {
  label: string; from: string; to: string; cards: Card[];
  commitCount: number; linkedCount: number; orphanCount: number; orphans: Orphan[];
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

const COL_COLOR: Record<Column, string> = Object.fromEntries(
  [
    ['BLOCKED', '#f59e0b'], ['RUNNING', '#38bdf8'], ['REVIEW', '#a78bfa'],
    ['DONE', '#34d399'], ['SKIPPED', '#94a3b8'], ['FAILED', '#f87171'],
  ],
) as Record<Column, string>;

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
  const [criticalPath, setCriticalPath] = useState<CriticalNode[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [commitCount, setCommitCount] = useState(0);
  const [showOrphans, setShowOrphans] = useState<Set<string>>(new Set());
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
      setCriticalPath(d.criticalPath ?? []);
      setSprints(d.sprints ?? []);
      setCommitCount(d.commitCount ?? 0);
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

  const doneWithProof = cards.filter(k => k.column === 'DONE').length;
  const totalDoneClaims = cards.filter(k => k.status === 'done').length;
  // Timeline sprint-click narrows to one lane; otherwise every sprint lane shows.
  const lanes = sprints.filter(sp => !sprint || sp.label === sprint.label);
  const laneTaskCount = lanes.reduce((n, l) => n + l.cards.length, 0);
  const toggleOrphans = (label: string) => setShowOrphans(p => { const n = new Set(p); n.has(label) ? n.delete(label) : n.add(label); return n; });

  // One card — the git↔task tie: verifyCommand, the commit hashes T ran, the verdict, the attest button.
  const renderCard = (card: Card, colColor: string) => (
    <div key={card.id} onClick={() => void openDossier(card)}
      style={{ ...s.card, borderLeft: `3px solid ${colColor}`, outline: selected?.id === card.id ? `1px solid ${colColor}` : 'none' }}>
      <div style={{ fontSize: 12.5, color: '#e5e7eb', lineHeight: 1.4 }}>{card.title}</div>
      <div style={s.cardMeta}>
        {card.onCriticalPath && <span style={{ ...s.badge, color: '#fca5a5', borderColor: 'rgba(248,113,113,0.4)', border: '1px solid rgba(248,113,113,0.4)' }} title={`On the critical path · depth ${card.depth}`}>▚ critical</span>}
        {card.leverage > 0 && <span style={s.badge}>unblocks {card.leverage}</span>}
        {card.hasVerify
          ? <span style={{ ...s.badge, color: '#6ee7b7' }} title={card.verifyCommand ?? ''}>✓ verify{card.testExitCode != null ? ` · exit ${card.testExitCode}` : ''}</span>
          : <span style={{ ...s.badge, color: '#f59e0b' }}>⚠ no proof</span>}
        {card.refs.length > 0 && <span style={s.badge}>dossier {card.refs.length}</span>}
      </div>
      {card.commitShas.length > 0 && (
        <div style={s.cardMeta} title="the commits this task landed (from the claim's evidence)">
          {card.commitShas.slice(0, 4).map(sha => <span key={sha} style={s.commit}>⎇ {sha.slice(0, 7)}</span>)}
          {card.commitShas.length > 4 && <span style={s.commit}>+{card.commitShas.length - 4}</span>}
        </div>
      )}
      {card.column === 'BLOCKED' && card.blockedByOpen.length > 0 && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>needs {card.blockedByOpen.map(x => x.slice(0, 8)).join(', ')}</div>
      )}
      {card.ledgerVerdict && VERDICT_NOTE[card.ledgerVerdict] && (
        <div style={{ fontSize: 10, color: VERDICT_NOTE[card.ledgerVerdict].color, marginTop: 5 }}>{VERDICT_NOTE[card.ledgerVerdict].text}</div>
      )}
      {card.ledgerVerdict === 'PENDING_HUMAN' && (
        <button type="button" disabled={attesting === card.id}
          onClick={(e) => { e.stopPropagation(); void attest(card.id); }}
          style={{ ...s.attest, opacity: attesting === card.id ? 0.6 : 1 }}
          title="Sign the P9 leap with your local key — mints acceptance, moves the card to DONE">
          {attesting === card.id ? '⧗ signing…' : '⚖ Attest — sign to accept (P9)'}
        </button>
      )}
    </div>
  );

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div>
          <div style={{ fontSize: 14, letterSpacing: 1, color: '#6ee7b7' }}>CONTINUUM · THE BOARD</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            Done is not a button — it&apos;s a PROVEN multi-signature TruthBlock (A·V·T·H).
            {' '}{doneWithProof} proven · {totalDoneClaims || 0} “done” claims · {commitCount} commits across {sprints.length} sprint{sprints.length === 1 ? '' : 's'}.
            {' · '}<span style={{ color: '#a78bfa' }}>ledger-gated</span>
          </div>
        </div>
        <button type="button" onClick={() => void load()} style={s.refresh}>↻ refresh</button>
      </header>

      {criticalPath.length > 1 && (
        <div style={s.critWrap} title="The critical path — the longest chain of blockedBy dependencies. A downstream task cannot reach DONE until every upstream link is PROVEN.">
          <span style={s.critLabel}>▚ CRITICAL PATH · {criticalPath.length} deep</span>
          <div style={s.critChain}>
            {criticalPath.map((n, i) => (
              <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && (
                  <span style={{ color: n.blocked ? '#f59e0b' : '#34d399', margin: '0 2px', fontSize: 13 }}>
                    {n.blocked ? '⊸' : '→'}
                  </span>
                )}
                <span
                  onClick={() => { const c = cards.find(k => k.id === n.id); if (c) void openDossier(c); }}
                  style={{ ...s.critNode, borderColor: COL_COLOR[n.column], color: COL_COLOR[n.column] }}
                  title={`${n.title} · ${n.column}${n.blocked ? ' · still gated by upstream' : ''}`}>
                  {n.column === 'DONE' ? '✓ ' : n.blocked ? '🔒 ' : ''}{n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {sprint && (
        <div style={s.sprintBanner}>
          <span style={{ color: '#6ee7b7', fontWeight: 700, letterSpacing: 0.5 }}>▦ SPRINT {sprint.label}</span>
          <span style={{ color: '#e5e7eb' }}>{laneTaskCount} task{laneTaskCount === 1 ? '' : 's'}</span>
          <button type="button" onClick={clearSprint} style={s.clear}>✕ clear · all sprints</button>
        </div>
      )}

      {error && <div style={{ color: '#f87171', padding: 12, fontSize: 13 }}>⚠ {error}</div>}
      {loading && <div style={{ color: '#f59e0b', padding: 12, fontSize: 13 }}>…loading the plan</div>}
      {!loading && !error && lanes.length === 0 && (
        <div style={{ color: '#6b7280', padding: 16, fontSize: 13 }}>no sprints yet — commits + tasks group here by sprint as they land.</div>
      )}

      <div style={s.laneScroll}>
        {lanes.map(lane => {
          const byCol = (c: Column) => lane.cards.filter(k => k.column === c);
          return (
            <section key={lane.label} style={s.lane}>
              <div style={s.laneHead}>
                <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>SPRINT · {lane.label}</span>
                {lane.from && <span style={{ color: '#6b7280', fontSize: 11 }}>{lane.from} → {lane.to}</span>}
                <span style={{ color: '#9ca3af', fontSize: 11 }}>{lane.cards.length} task{lane.cards.length === 1 ? '' : 's'} · {lane.commitCount} commit{lane.commitCount === 1 ? '' : 's'}</span>
                {lane.orphanCount > 0 && (
                  <span onClick={() => toggleOrphans(lane.label)} style={s.orphanChip} title="commits in this sprint with no task claiming them — unclaimed work">
                    ⚠ {lane.orphanCount} unclaimed → open a claim
                  </span>
                )}
              </div>
              {showOrphans.has(lane.label) && lane.orphans.length > 0 && (
                <div style={s.orphanList}>
                  {lane.orphans.map(o => (
                    <div key={o.sha} style={{ fontSize: 11, color: '#cbd5e1', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ color: '#f59e0b', fontFamily: 'ui-monospace, monospace' }}>⎇ {o.sha}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={s.laneCols}>
                {COLUMNS.map(col => {
                  const items = byCol(col.key);
                  return (
                    <div key={col.key} style={s.column}>
                      <div style={{ ...s.colHead, borderColor: col.color }}>
                        <span style={{ color: col.color, fontWeight: 700, fontSize: 11.5, letterSpacing: 1 }}>{col.label}</span>
                        <span style={{ color: '#6b7280', fontSize: 11 }}>{items.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map(card => renderCard(card, col.color))}
                        {items.length === 0 && <div style={{ fontSize: 11, color: '#3b4655', fontStyle: 'italic' }}>—</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
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
  commit: { fontSize: 9.5, padding: '1px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#fbbf24', fontFamily: 'ui-monospace, monospace' },
  laneScroll: { flex: 1, overflowY: 'auto', padding: '6px 16px 48px', minHeight: 0 },
  lane: { marginBottom: 20, border: '1px solid rgba(167,139,250,0.14)', borderRadius: 12, padding: 12, background: 'rgba(167,139,250,0.03)' },
  laneHead: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 },
  orphanChip: { fontSize: 10.5, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '2px 8px', cursor: 'pointer' },
  orphanList: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', marginBottom: 10, background: 'rgba(245,158,11,0.05)', borderRadius: 8 },
  laneCols: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, overflowX: 'auto' },
  dossier: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 380, background: 'rgba(8,11,16,0.97)', borderLeft: '1px solid rgba(56,189,248,0.25)', padding: 18, overflowY: 'auto', zIndex: 5, boxShadow: '-8px 0 40px rgba(0,0,0,0.6)' },
  code: { fontSize: 11, color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace', background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 6, margin: '4px 0 0' },
  obs: { marginBottom: 10 },
  critWrap: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 20px', background: 'rgba(248,113,113,0.05)', borderBottom: '1px solid rgba(248,113,113,0.16)' },
  critLabel: { color: '#fca5a5', fontWeight: 700, fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' },
  critChain: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, rowGap: 6 },
  critNode: { fontSize: 11, padding: '3px 8px', borderRadius: 7, border: '1px solid', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', whiteSpace: 'nowrap' },
  sprintBanner: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '9px 20px', fontSize: 12, background: 'rgba(52,211,153,0.06)', borderBottom: '1px solid rgba(52,211,153,0.18)' },
  clear: { marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#e5e7eb' },
};
