/**
 * CriticalPathRibbon — the visible DAG critical path (Workspace D1).
 *
 * Renders the longest chain of blockedBy dependencies as a left→right ribbon: each node is a
 * task in its live column colour; the link between two nodes is amber ⊸ while the downstream
 * task is still gated by an unfinished upstream, green → once that upstream is PROVEN. A DONE
 * node shows ✓, a still-gated node shows 🔒. This is the proof-gate made visible — you can see
 * a task locked out of DONE until its whole upstream chain proves out.
 *
 * Pure + presentational (no hooks, no fetch) so it renders identically in the browser and in the
 * paint proof-gate (scripts/verify-ribbon-paint.mjs). Board.tsx feeds it the criticalPath.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { CSSProperties } from 'react';

export type RibbonColumn = 'RUNNING' | 'REVIEW' | 'DONE' | 'SKIPPED' | 'BLOCKED' | 'FAILED';
export interface CriticalNode { id: string; title: string; column: RibbonColumn; blocked: boolean }

export const COL_COLOR: Record<RibbonColumn, string> = {
  BLOCKED: '#f59e0b', RUNNING: '#38bdf8', REVIEW: '#a78bfa',
  DONE: '#34d399', SKIPPED: '#94a3b8', FAILED: '#f87171',
};

export default function CriticalPathRibbon({ nodes, onOpen }: { nodes: CriticalNode[]; onOpen?: (id: string) => void }) {
  if (nodes.length < 2) return null;   // a single task is not a "path" — nothing to draw
  return (
    <div style={st.wrap} title="The critical path — the longest chain of blockedBy dependencies. A downstream task cannot reach DONE until every upstream link is PROVEN.">
      <span style={st.label}>▚ CRITICAL PATH · {nodes.length} deep</span>
      <div style={st.chain}>
        {nodes.map((n, i) => (
          <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && (
              <span style={{ color: n.blocked ? '#f59e0b' : '#34d399', margin: '0 2px', fontSize: 13 }}>
                {n.blocked ? '⊸' : '→'}
              </span>
            )}
            <span
              onClick={() => onOpen?.(n.id)}
              style={{ ...st.node, borderColor: COL_COLOR[n.column], color: COL_COLOR[n.column] }}
              title={`${n.title} · ${n.column}${n.blocked ? ' · still gated by upstream' : ''}`}>
              {n.column === 'DONE' ? '✓ ' : n.blocked ? '🔒 ' : ''}{n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 20px', background: 'rgba(248,113,113,0.05)', borderBottom: '1px solid rgba(248,113,113,0.16)' },
  label: { color: '#fca5a5', fontWeight: 700, fontSize: 11, letterSpacing: 1, whiteSpace: 'nowrap' },
  chain: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, rowGap: 6 },
  node: { fontSize: 11, padding: '3px 8px', borderRadius: 7, border: '1px solid', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', whiteSpace: 'nowrap' },
};
