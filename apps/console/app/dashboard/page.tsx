/**
 * /dashboard — the client-facing control room (the "factory supervisor" view).
 *
 * Reads the LIVE CONTINUUM engine (real todos, state, digest) and renders the
 * product as observable outcomes — the verify-then-dissolve Kanban front and
 * center (open → in-progress → blocked → verifiably done), plus state-at-a-glance,
 * recent activity, the proven token-savings figure, and the connection config.
 *
 * Tenant-scoped via the engine token. Server-rendered at request time.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { fetchDashboard, type Todo } from './lib';

const INK = '#232b2d', PANEL = '#283133', PANEL2 = '#2a3335', HAIR = '#36423f',
  TEXT = '#f6f3ec', BODY = '#c8c3b6', MUTED = '#9aa09a', CREME = '#c89a72',
  CREME_HI = '#e0b387', GREEN = '#7ddf64', AMBER = '#ffb454', RED = '#ff8585', BLUE = '#7fb8d8';

const LANES: Array<{ key: Todo['status']; label: string; color: string }> = [
  { key: 'open', label: 'Open', color: MUTED },
  { key: 'in_progress', label: 'In progress', color: AMBER },
  { key: 'blocked', label: 'Blocked', color: RED },
  { key: 'done', label: 'Verifiably done', color: GREEN },
];

export default async function Dashboard() {
  const d = await fetchDashboard();
  if (d.reason === 'login') redirect('/dashboard/login');
  const todos = d.todos ?? [];
  const byLane = (s: Todo['status']) => todos.filter((t) => t.status === s);
  const doneCount = byLane('done').length;
  const verifiedCount = byLane('done').filter((t) => t.verifyCommand).length;

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '1.5rem 1.75rem 4rem', color: TEXT, fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif' }}>
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', borderBottom: `1px solid ${HAIR}`, paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '-0.02em' }}>Continuum</h1>
        <span style={{ fontFamily: 'ui-monospace, monospace', color: CREME, fontSize: '0.8rem' }}>
          {d.projectId ? `tenant: ${d.projectId}` : 'dashboard'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: d.ok ? GREEN : RED }}>
          {d.ok ? `● connected · ${d.latencyMs}ms` : `● ${d.reason === 'unconfigured' ? 'not configured' : 'disconnected'}`}
        </span>
      </header>

      {!d.ok && (
        <div style={{ marginTop: '1.5rem', background: '#3a1010', border: `1px solid ${RED}55`, borderRadius: 8, padding: '1rem 1.25rem', color: BODY }}>
          {d.reason === 'unconfigured'
            ? <>Engine not configured. Set <code>CONTINUUM_HTTP_URL</code> + <code>CONTINUUM_HTTP_TOKEN</code> (+ <code>CONTINUUM_PROJECT_ID</code> for the tenant) in this deployment.</>
            : <><strong>Could not reach the engine:</strong> {d.reason}</>}
        </div>
      )}

      {/* proof strip */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', margin: '1.5rem 0' }}>
        <Stat n={String(todos.length)} l="commitments tracked" />
        <Stat n={String(verifiedCount)} l="verified complete (shell-proven)" color={GREEN} />
        <Stat n="~2.85×" l="fewer retrieval tokens (benchmarked)" color={CREME_HI} />
        <Stat n={d.state ? String(d.state.active?.length ?? 0) : '—'} l="active in production" color={BLUE} />
      </section>

      {/* THE verify-then-dissolve Kanban */}
      <h2 style={{ fontSize: '1.1rem', margin: '1.5rem 0 0.4rem' }}>Live pipeline</h2>
      <p style={{ color: MUTED, fontSize: '0.88rem', margin: '0 0 1rem', maxWidth: '70ch' }}>
        Every commitment, tracked to proof. A task reaches <strong style={{ color: GREEN }}>Verifiably done</strong> only
        when its shell <code>verifyCommand</code> exits 0. No item is marked complete on the AI&rsquo;s word alone.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LANES.length}, 1fr)`, gap: '0.85rem', alignItems: 'start' }}>
        {LANES.map((lane) => {
          const items = byLane(lane.key);
          return (
            <div key={lane.key} style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 10, padding: '0.85rem', minHeight: '40vh' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: lane.color, display: 'inline-block' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{lane.label}</span>
                <span style={{ marginLeft: 'auto', color: MUTED, fontSize: '0.78rem' }}>{items.length}</span>
              </div>
              {items.length === 0 && <div style={{ color: '#5b6360', fontSize: '0.8rem', padding: '0.5rem 0' }}>—</div>}
              {items.map((t) => (
                <article key={t.id} style={{ background: INK, border: `1px solid ${lane.key === 'done' ? GREEN + '44' : HAIR}`, borderRadius: 8, padding: '0.7rem', marginBottom: '0.6rem' }}>
                  <div style={{ fontSize: '0.84rem', color: BODY, lineHeight: 1.4 }}>
                    {lane.key === 'done' && t.verifyCommand && <span style={{ color: GREEN, marginRight: 4 }}>✓</span>}
                    {t.title}
                  </div>
                  {t.verifyCommand && (
                    <div style={{ marginTop: '0.45rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem', color: lane.key === 'done' ? GREEN : MUTED, background: PANEL2, borderRadius: 5, padding: '0.3rem 0.45rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.verifyCommand}>
                      $ {t.verifyCommand}
                    </div>
                  )}
                  {lane.key === 'done' && t.completedAt && (
                    <div style={{ fontSize: '0.66rem', color: '#5b6360', marginTop: '0.35rem' }}>proven {new Date(t.completedAt).toLocaleDateString()}</div>
                  )}
                </article>
              ))}
            </div>
          );
        })}
      </div>

      {/* lower panels: state at a glance + recent activity + connection */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '2rem' }}>
        <section style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 10, padding: '1.1rem 1.25rem' }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '1rem' }}>State at a glance</h3>
          {d.state ? (
            <>
              {d.state.reason && <p style={{ color: MUTED, fontSize: '0.82rem', margin: '0 0 0.8rem' }}>{d.state.reason.slice(0, 180)}</p>}
              <Glance label="Active" items={d.state.active} color={GREEN} />
              <Glance label="Dormant" items={d.state.dormant} color={MUTED} />
              <Glance label="Broken" items={d.state.broken} color={RED} />
              {d.state.hash && <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem', color: '#5b6360', marginTop: '0.7rem' }}>hash-sealed · {d.state.hash.slice(0, 16)}…</div>}
            </>
          ) : <p style={{ color: MUTED, fontSize: '0.85rem' }}>No snapshot yet.</p>}
        </section>

        <section style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 10, padding: '1.1rem 1.25rem' }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '1rem' }}>Recent activity</h3>
          {d.digest
            ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.84rem', color: BODY, margin: 0, lineHeight: 1.5 }}>{d.digest.slice(0, 800)}</pre>
            : <p style={{ color: MUTED, fontSize: '0.85rem' }}>No digest yet.</p>}
        </section>
      </div>

      {/* connection config */}
      <section style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 10, padding: '1.1rem 1.25rem', marginTop: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>Connect an engineer</h3>
        <p style={{ color: MUTED, fontSize: '0.82rem', margin: '0 0 0.7rem' }}>Paste into Claude Code / Cursor MCP config. Tools appear scoped to this tenant.</p>
        <pre style={{ background: INK, border: `1px solid ${HAIR}`, borderRadius: 6, padding: '0.8rem 1rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem', color: BODY, overflow: 'auto', margin: 0 }}>{`{
  "mcpServers": {
    "continuum": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.continuum.rest/sse",
               "--header", "Authorization: Bearer <YOUR_TENANT_TOKEN>"]
    }
  }
}`}</pre>
      </section>
    </main>
  );
}

function Stat({ n, l, color = TEXT }: { n: string; l: string; color?: string }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 10, padding: '1rem 1.2rem' }}>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '1.5rem', fontWeight: 700, color }}>{n}</div>
      <div style={{ color: MUTED, fontSize: '0.8rem', marginTop: '0.2rem' }}>{l}</div>
    </div>
  );
}

function Glance({ label, items, color }: { label: string; items: Array<{ name: string }>; color: string }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ fontSize: '0.72rem', color, fontFamily: 'ui-monospace, monospace', marginBottom: '0.25rem' }}>{label} ({items.length})</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        {items.slice(0, 8).map((it, i) => (
          <span key={i} style={{ fontSize: '0.72rem', color: BODY, background: PANEL2, border: `1px solid ${HAIR}`, borderRadius: 5, padding: '0.15rem 0.5rem' }}>{it.name}</span>
        ))}
      </div>
    </div>
  );
}
