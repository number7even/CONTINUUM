'use client';

/**
 * AMF — "Headless Hive" control room (tabbed, full-screen per zone).
 *
 * Top tabs switch between full-width views of each layer of the autonomous
 * media assembly line: The Brain (L2 trend ingestion), Factory Floor
 * (production pipeline), Editing Bay (QC), Distribution & Intent (L5/L7), and
 * Marketing Swarms (L6, the 15-agent hierarchical mesh).
 *
 * HONESTY (The Nine, P4): the agent backend is NOT wired yet. Every figure is
 * illustrative scaffold state, flagged by the banner. Each view is the wiring
 * point for its real backend.
 *
 * Brand CI: Inkwell ground, Au Lait ink, Creme Brulee accent.
 */
import { useState } from 'react';

const INK = '#232b2d';
const PANEL = '#283133';
const PANEL2 = '#2a3335';
const HAIR = '#36423f';
const TEXT = '#f6f3ec';
const BODY = '#c8c3b6';
const MUTED = '#9aa09a';
const CREME = '#c89a72';
const CREME_HI = '#e0b387';
const GREEN = '#7ddf64';
const AMBER = '#ffb454';
const BLUE = '#7fb8d8';
const RED = '#ff8585';

// ── scaffold data (illustrative, NOT live) ───────────────────────────────────
const TRENDS = [
  { topic: 'AI agents that refuse to fake "done"', reddit: 4210, x: 1880, tiktok: '2.1M', yt: '120k', poly: '61%', fun: 94 },
  { topic: 'The 2am deploy that took down prod', reddit: 5120, x: 3300, tiktok: '4.6M', yt: '340k', poly: null, fun: 91 },
  { topic: 'Why your RAG bill is 10x too high', reddit: 2670, x: 940, tiktok: '780k', yt: '88k', poly: null, fun: 88 },
  { topic: 'Local LLMs finally beat the API on cost', reddit: 1980, x: 1240, tiktok: '610k', yt: '52k', poly: '54%', fun: 83 },
  { topic: 'The PR that deleted the database', reddit: 8800, x: 6100, tiktok: '9.2M', yt: '710k', poly: null, fun: 96 },
  { topic: 'Vibe-coding is eating junior dev jobs', reddit: 3400, x: 2900, tiktok: '1.8M', poly: '47%', yt: '210k', fun: 79 },
];

const LANES = [
  { name: 'AI Director', sub: 'storyboard + scene timing', items: [{ id: 'JOB-204', t: 'AI agents refuse "done"', meta: '5 scenes · 47s', pct: 100, st: GREEN }, { id: 'JOB-205', t: 'PR deleted the DB', meta: 'drafting beats', pct: 40, st: AMBER }] },
  { name: 'Audio Synthesis', sub: 'ElevenLabs + word timestamps', items: [{ id: 'JOB-203', t: 'RAG bill 10x', meta: 'VO 0:39 · ts ✓', pct: 100, st: GREEN }] },
  { name: 'Headless GPU Swarm', sub: 'ComfyUI · Hetzner bare-metal', items: [{ id: 'JOB-202', t: '2am deploy', meta: '6/9 clips', pct: 67, st: AMBER }] },
  { name: 'Editing Bay', sub: 'FFmpeg / Remotion', items: [{ id: 'JOB-201', t: 'Local LLMs win', meta: 'ducking + subs', pct: 85, st: AMBER }] },
  { name: 'QC Judge', sub: 'Hermes video judge', items: [{ id: 'JOB-200', t: 'Vibe-coding jobs', meta: 'scored 9.0/10', pct: 100, st: GREEN }] },
];

const JUDGE = [
  { k: 'Hook strength (first 3s)', v: 9 },
  { k: 'Pacing / dead air', v: 8 },
  { k: 'Subtitle sync', v: 10 },
  { k: 'Visual artifacts', v: 9 },
  { k: 'CTA clarity', v: 9 },
  { k: 'Music ducking', v: 9 },
];

const PLATFORMS = [
  { p: 'TikTok', reach: '2.1M', live: true },
  { p: 'YouTube Shorts', reach: '880k', live: true },
  { p: 'Instagram Reels', reach: '640k', live: true },
  { p: 'X', reach: '410k', live: true },
  { p: 'YT Community Tab', reach: '120k', live: false },
  { p: 'LinkedIn', reach: '—', live: false },
];
const INTENT = [
  { who: '@dev_marco', sig: 'how do I try this?', kind: 'buy' },
  { who: '@sara.builds', sig: 'link please 🙏', kind: 'buy' },
  { who: '@nullpointer', sig: 'does it work with Cursor?', kind: 'q' },
  { who: '@shipfast', sig: 'pricing? happy to pay', kind: 'buy' },
  { who: '@late.night.code', sig: 'this is exactly my pain', kind: 'q' },
];

// 15-agent hierarchical mesh (Layer 6). 3+4+3+3+2 = 15.
const TIERS = [
  { tier: 'Tier 1 · Coordination', tag: 'the brain', agents: [
    { n: 'Orchestrator', r: 'routes tasks, balances load', st: GREEN },
    { n: 'Memory', r: 'past campaigns + winning strategies', st: GREEN },
    { n: 'Quality', r: 'gatekeeper — nothing goes live unapproved', st: GREEN },
  ]},
  { tier: 'Tier 2 · Intelligence', tag: 'analysts + forecasters', agents: [
    { n: 'Simulation', r: 'Monte Carlo outcome prediction', st: AMBER },
    { n: 'Historical Memory', r: 'pattern-match prior campaigns', st: GREEN },
    { n: 'Risk Detection', r: 'fraud / waste / pacing traps', st: RED },
    { n: 'Attention Arbitrage', r: 'finds underpriced inventory', st: GREEN },
  ]},
  { tier: 'Tier 3 · Creative', tag: 'creative directors', agents: [
    { n: 'Creative Genome', r: 'extracts hook/promise/proof/CTA DNA', st: GREEN },
    { n: 'Fatigue Forecaster', r: 'predicts decay before it drops', st: AMBER },
    { n: 'Mutation', r: 'breeds winning-ad variants', st: GREEN },
  ]},
  { tier: 'Tier 4 · Attribution', tag: 'truth-seekers', agents: [
    { n: 'Counterfactual', r: 'answers "what if" on changes', st: GREEN },
    { n: 'Causal Graph', r: 'maps cause→effect in the funnel', st: GREEN },
    { n: 'Incrementality', r: 'true lift vs organic baseline', st: AMBER },
  ]},
  { tier: 'Tier 5 · Operations', tag: 'platform managers', agents: [
    { n: 'Account Health', r: 'monitors + diagnoses + fixes', st: GREEN },
    { n: 'Cross-Platform', r: 'syncs budget + strategy everywhere', st: GREEN },
  ]},
];

const TABS = ['The Brain', 'Factory Floor', 'Editing Bay', 'Distribution', 'Marketing Swarms'] as const;
type Tab = (typeof TABS)[number];
const TAB_SUB: Record<Tab, string> = {
  'The Brain': 'Layer 2 · trend ingestion',
  'Factory Floor': 'Layers 3–4 · production pipeline',
  'Editing Bay': 'Layer 5 · assembly + QC',
  'Distribution': 'Layers 5 & 7 · syndication + intent',
  'Marketing Swarms': 'Layer 6 · 15-agent mesh',
};

function Dot({ c }: { c: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />;
}

export default function HeadlessHive() {
  const [tab, setTab] = useState<Tab>('The Brain');
  const [sent, setSent] = useState<Record<number, boolean>>({});

  return (
    <main style={{ maxWidth: 1560, margin: '0 auto', padding: '1.25rem 1.5rem 3rem' }}>
      {/* top bar */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '-0.02em' }}>AMF · Headless Hive</h1>
        <span style={{ fontFamily: 'ui-monospace, monospace', color: CREME, fontSize: '0.78rem' }}>Autonomous Media Factory</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.1rem', fontSize: '0.78rem', color: MUTED, fontFamily: 'ui-monospace, monospace' }}>
          <span><Dot c={GREEN} /> queue 6</span>
          <span><Dot c={AMBER} /> rendering 1</span>
          <span><Dot c={BLUE} /> syndicating 1</span>
        </div>
      </header>

      {/* tabs */}
      <nav style={{ display: 'flex', gap: '0.3rem', borderBottom: `1px solid ${HAIR}`, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = t === tab;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.65rem 1rem 0.8rem', fontSize: '0.92rem',
              color: on ? TEXT : MUTED, fontWeight: on ? 600 : 400,
              borderBottom: `2px solid ${on ? CREME : 'transparent'}`,
              marginBottom: -1, display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: 'flex-start',
            }}>
              <span>{t}</span>
              <span style={{ fontSize: '0.66rem', color: on ? CREME : '#6b736d', fontFamily: 'ui-monospace, monospace' }}>{TAB_SUB[t]}</span>
            </button>
          );
        })}
      </nav>

      {/* honesty banner */}
      <div style={{ background: 'rgba(255,180,84,0.08)', border: `1px solid ${AMBER}55`, borderRadius: 8, padding: '0.5rem 0.9rem', marginBottom: '1.1rem', fontSize: '0.8rem', color: BODY }}>
        <strong style={{ color: AMBER }}>Control-room shell.</strong> The agent backend is not wired yet. Every value below is illustrative state showing the assembly line's structure, not live data.
      </div>

      <div style={{ minHeight: 'calc(100vh - 230px)' }}>
        {/* ── THE BRAIN ─────────────────────────────────────────────────────── */}
        {tab === 'The Brain' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ margin: 0, color: MUTED, fontSize: '0.9rem' }}>Ranked by Fun Judge virality score. Trends ≥ 90 auto-approve into the factory; below that, you send manually.</p>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', color: CREME }}>auto-approve ≥ 90</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' }}>
              {TRENDS.map((t, i) => (
                <article key={i} style={{ background: PANEL, border: `1px solid ${t.fun >= 90 ? CREME + '66' : HAIR}`, borderRadius: 11, padding: '1.1rem 1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 600, fontSize: '1.05rem', color: TEXT }}>{t.topic}</span>
                    <span style={{ flexShrink: 0, textAlign: 'center' }}>
                      <span style={{ display: 'block', fontFamily: 'ui-monospace, monospace', fontSize: '1.4rem', fontWeight: 700, color: t.fun >= 90 ? CREME_HI : BODY }}>{t.fun}</span>
                      <span style={{ fontSize: '0.62rem', color: MUTED }}>FUN</span>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))', gap: '0.5rem', margin: '1rem 0', fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace' }}>
                    <Sig label="reddit" val={'↑' + t.reddit.toLocaleString()} />
                    <Sig label="x" val={'♥' + t.x.toLocaleString()} />
                    <Sig label="tiktok" val={'▶' + t.tiktok} />
                    <Sig label="youtube" val={'▶' + t.yt} />
                    {t.poly && <Sig label="polymarket" val={'◈' + t.poly} accent={GREEN} />}
                  </div>
                  <button onClick={() => setSent((s) => ({ ...s, [i]: true }))} disabled={sent[i]} style={{ padding: '0.5rem 1rem', borderRadius: 7, border: 'none', background: sent[i] ? '#3a4446' : CREME, color: sent[i] ? MUTED : '#1c2224', fontWeight: 600, fontSize: '0.85rem', cursor: sent[i] ? 'default' : 'pointer' }}>
                    {sent[i] ? 'Queued to factory →' : 'Send to factory'}
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* ── FACTORY FLOOR ─────────────────────────────────────────────────── */}
        {tab === 'Factory Floor' && (
          <div>
            <p style={{ margin: '0 0 1rem', color: MUTED, fontSize: '0.9rem' }}>The Unified Execution Document moves left to right across the Redis/BullMQ event loop. Each lane is a specialist agent working without your input.</p>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LANES.length}, 1fr)`, gap: '0.85rem', alignItems: 'start' }}>
              {LANES.map((lane) => (
                <div key={lane.name} style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 10, padding: '0.85rem', minHeight: '60vh' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: TEXT }}>{lane.name}</div>
                  <div style={{ fontSize: '0.7rem', color: MUTED, marginBottom: '0.85rem' }}>{lane.sub}</div>
                  {lane.items.map((it) => (
                    <div key={it.id} style={{ background: INK, border: `1px solid ${HAIR}`, borderRadius: 8, padding: '0.65rem', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem', color: CREME }}>{it.id}</span>
                        <Dot c={it.st} />
                      </div>
                      <div style={{ fontSize: '0.82rem', color: BODY, margin: '0.3rem 0' }}>{it.t}</div>
                      <div style={{ fontSize: '0.7rem', color: MUTED, marginBottom: '0.45rem' }}>{it.meta}</div>
                      <div style={{ height: 4, background: HAIR, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${it.pct}%`, height: '100%', background: it.st }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── EDITING BAY ───────────────────────────────────────────────────── */}
        {tab === 'Editing Bay' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
            <div style={{ background: '#13191a', border: `1px solid ${HAIR}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED, position: 'relative', minHeight: '60vh' }}>
              <div style={{ position: 'absolute', top: 12, left: 14, fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem', color: CREME }}>JOB-201 · 9:16 · 0:47 · h264</div>
              <div style={{ fontSize: '3rem', opacity: 0.5 }}>▶</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>compiled MP4 preview</div>
              <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, height: 4, background: HAIR, borderRadius: 2 }}>
                <div style={{ width: '38%', height: '100%', background: CREME, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '2.4rem', fontWeight: 700, color: GREEN }}>9.0</span>
                <span style={{ color: MUTED, fontSize: '0.9rem' }}>/ 10 · Hermes AI judge</span>
              </div>
              <p style={{ color: MUTED, fontSize: '0.8rem', margin: '0 0 1.2rem' }}>The judge watches the compiled MP4 and recursively forces the editor agent to fix it until it passes. You review last.</p>
              {JUDGE.map((j) => (
                <div key={j.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '0.35rem 0', borderBottom: `1px solid ${HAIR}`, color: BODY }}>
                  <span>{j.k}</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: j.v >= 9 ? GREEN : AMBER }}>{j.v}/10</span>
                </div>
              ))}
              <button style={{ marginTop: '1.2rem', width: '100%', padding: '0.7rem', borderRadius: 8, border: 'none', background: CREME, color: '#1c2224', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}>
                Approve &amp; syndicate
              </button>
            </div>
          </div>
        )}

        {/* ── DISTRIBUTION ──────────────────────────────────────────────────── */}
        {tab === 'Distribution' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', alignItems: 'start' }}>
            <div>
              <h3 style={{ margin: '0 0 0.9rem', fontSize: '1rem' }}>Syndication map</h3>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {PLATFORMS.map((p) => (
                  <div key={p.p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 9, padding: '0.7rem 0.95rem' }}>
                    <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.9rem', color: BODY }}><Dot c={p.live ? GREEN : MUTED} /> {p.p}</span>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem', color: p.live ? CREME_HI : MUTED }}>{p.reach}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.9rem', fontSize: '1rem' }}>Intent ticker · AiToEarn engagement agent</h3>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {INTENT.map((m, i) => (
                  <div key={i} style={{ background: PANEL, border: `1px solid ${m.kind === 'buy' ? GREEN + '55' : HAIR}`, borderRadius: 9, padding: '0.75rem 0.95rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: CREME, fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}>{m.who}</span>
                      {m.kind === 'buy'
                        ? <span style={{ color: GREEN, fontSize: '0.68rem', fontWeight: 600 }}>● BUY-INTENT → lead captured</span>
                        : <span style={{ color: MUTED, fontSize: '0.68rem' }}>question</span>}
                    </div>
                    <div style={{ fontSize: '0.92rem', color: BODY, marginTop: '0.3rem' }}>&ldquo;{m.sig}&rdquo;</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── MARKETING SWARMS (Layer 6 · 15-agent mesh) ─────────────────────── */}
        {tab === 'Marketing Swarms' && (
          <div>
            <p style={{ margin: '0 0 1.25rem', color: MUTED, fontSize: '0.9rem' }}>A 15-agent hierarchical mesh (Claude-Flow V3) running paid amplification 24/7. Five tiers coordinate without conflict; nothing goes live without the Quality gate.</p>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {TIERS.map((tier) => (
                <div key={tier.tier} style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 11, padding: '1rem 1.2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', color: TEXT }}>{tier.tier}</h3>
                    <span style={{ fontSize: '0.74rem', color: CREME, fontFamily: 'ui-monospace, monospace' }}>{tier.tag}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: MUTED }}>{tier.agents.length} agents</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.7rem' }}>
                    {tier.agents.map((a) => (
                      <div key={a.n} style={{ background: PANEL2, border: `1px solid ${HAIR}`, borderRadius: 8, padding: '0.7rem 0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: TEXT }}>{a.n}</span>
                          <Dot c={a.st} />
                        </div>
                        <div style={{ fontSize: '0.76rem', color: MUTED, marginTop: '0.25rem' }}>{a.r}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Sig({ label, val, accent }: { label: string; val: string; accent?: string }) {
  return (
    <div style={{ background: '#2a3335', borderRadius: 6, padding: '0.4rem 0.55rem' }}>
      <div style={{ color: accent ?? '#c8c3b6', fontSize: '0.8rem' }}>{val}</div>
      <div style={{ color: '#9aa09a', fontSize: '0.6rem' }}>{label}</div>
    </div>
  );
}
