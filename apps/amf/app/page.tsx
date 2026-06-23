'use client';

/**
 * AMF — "Headless Hive" control room.
 *
 * An observability dashboard for an autonomous media assembly line, NOT a
 * prompt box. Four zones: (1) trend ingestion feed, (2) factory-floor Kanban,
 * (3) editing bay + AI judge, (4) distribution + intent mining.
 *
 * HONESTY (The Nine, P4): the live agent backend (real trend scraping, ComfyUI
 * GPU swarm, ElevenLabs, FFmpeg, AiToEarn distribution, ad swarms) is NOT wired
 * yet. Every figure on this screen is illustrative scaffold state, flagged as
 * such by the banner. Each zone is the wiring point for its real backend.
 *
 * Brand CI: Inkwell ground, Au Lait ink, Creme Brulee accent.
 */
import { useState } from 'react';

// ── palette ──────────────────────────────────────────────────────────────────
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

// ── illustrative scaffold data (NOT live) ────────────────────────────────────
const TRENDS = [
  { topic: 'AI agents that refuse to fake "done"', reddit: 4210, x: 1880, tiktok: '2.1M', poly: '61%', fun: 94 },
  { topic: 'Why your RAG bill is 10x too high', reddit: 2670, x: 940, tiktok: '780k', poly: null, fun: 88 },
  { topic: 'The 2am deploy that took down prod', reddit: 5120, x: 3300, tiktok: '4.6M', poly: null, fun: 91 },
  { topic: 'Local LLMs finally beat the API on cost', reddit: 1980, x: 1240, tiktok: '610k', poly: '54%', fun: 83 },
];

const LANES = [
  { key: 'director', name: 'AI Director', sub: 'storyboard + timing', items: [{ id: 'JOB-204', t: 'AI agents refuse "done"', meta: '5 scenes · 47s' }] },
  { key: 'audio', name: 'Audio Synthesis', sub: 'ElevenLabs + timestamps', items: [{ id: 'JOB-203', t: 'RAG bill 10x', meta: 'VO 0:39 · word-ts ✓' }] },
  { key: 'render', name: 'Headless GPU Swarm', sub: 'ComfyUI · bare metal', items: [{ id: 'JOB-202', t: '2am deploy', meta: '6/9 clips · 67%' }] },
  { key: 'assembly', name: 'Editing Bay', sub: 'FFmpeg / Remotion', items: [{ id: 'JOB-201', t: 'Local LLMs win', meta: 'ducking + subs' }] },
];

const JUDGE = [
  { k: 'Hook strength (first 3s)', v: 9 },
  { k: 'Pacing / dead air', v: 8 },
  { k: 'Subtitle sync', v: 10 },
  { k: 'Visual artifacts', v: 9 },
  { k: 'CTA clarity', v: 9 },
];

const PLATFORMS = ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'X', 'YT Community', 'LinkedIn'];
const INTENT = [
  { who: '@dev_marco', sig: 'how do I try this?', kind: 'buy-intent' },
  { who: '@sara.builds', sig: 'link please 🙏', kind: 'buy-intent' },
  { who: '@nullpointer', sig: 'does it work with Cursor?', kind: 'question' },
];

// ── small UI atoms ───────────────────────────────────────────────────────────
function Zone({ n, title, sub, children }: { n: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 12, padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.9rem' }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', color: CREME, fontSize: '0.8rem' }}>{n}</span>
        <h2 style={{ margin: 0, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>{title}</h2>
        <span style={{ color: MUTED, fontSize: '0.78rem', marginLeft: 'auto' }}>{sub}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </section>
  );
}

function Dot({ c }: { c: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />;
}

export default function HeadlessHive() {
  const [sent, setSent] = useState<Record<number, boolean>>({});

  return (
    <main style={{ maxWidth: 1480, margin: '0 auto', padding: '1.5rem 1.5rem 3rem' }}>
      {/* top bar */}
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.35rem', letterSpacing: '-0.02em' }}>AMF · Headless Hive</h1>
        <span style={{ fontFamily: 'ui-monospace, monospace', color: CREME, fontSize: '0.8rem' }}>Autonomous Media Factory</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.1rem', fontSize: '0.8rem', color: MUTED, fontFamily: 'ui-monospace, monospace' }}>
          <span><Dot c={GREEN} /> queue 4</span>
          <span><Dot c={AMBER} /> rendering 1</span>
          <span><Dot c={BLUE} /> syndicating 1</span>
        </div>
      </header>

      {/* honesty banner — this is scaffold, not a running factory */}
      <div style={{ background: 'rgba(255,180,84,0.08)', border: `1px solid ${AMBER}55`, borderRadius: 8, padding: '0.55rem 0.9rem', marginBottom: '1.25rem', fontSize: '0.82rem', color: BODY }}>
        <strong style={{ color: AMBER }}>Control-room shell.</strong> The agent backend (live trend scraping, ComfyUI GPU render, ElevenLabs, FFmpeg, AiToEarn distribution, ad swarms) is not wired yet. Every value below is illustrative state showing the assembly line's structure, not live data. Each zone is the wiring point for its real backend.
      </div>

      {/* 2x2 zone grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '1.25rem', height: 'calc(100vh - 180px)' }}>

        {/* ZONE 1 — Brain */}
        <Zone n="01" title="The Brain" sub="Layer 2 · trend ingestion">
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {TRENDS.map((t, i) => (
              <article key={i} style={{ background: PANEL2, border: `1px solid ${t.fun >= 90 ? CREME + '66' : HAIR}`, borderRadius: 9, padding: '0.8rem 0.95rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem', color: TEXT }}>{t.topic}</span>
                  <span title="Fun Judge virality score" style={{ flexShrink: 0, fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', color: t.fun >= 90 ? CREME_HI : BODY }}>fun {t.fun}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0.55rem 0 0.7rem', fontSize: '0.76rem', color: MUTED, fontFamily: 'ui-monospace, monospace' }}>
                  <span>↑ {t.reddit.toLocaleString()} reddit</span>
                  <span>♥ {t.x.toLocaleString()} x</span>
                  <span>▶ {t.tiktok} tiktok</span>
                  {t.poly && <span style={{ color: GREEN }}>◈ {t.poly} polymarket</span>}
                </div>
                <button
                  onClick={() => setSent((s) => ({ ...s, [i]: true }))}
                  disabled={sent[i]}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', background: sent[i] ? '#3a4446' : CREME, color: sent[i] ? MUTED : '#1c2224', fontWeight: 600, fontSize: '0.8rem', cursor: sent[i] ? 'default' : 'pointer' }}
                >
                  {sent[i] ? 'Queued →' : 'Send to factory'}
                </button>
              </article>
            ))}
          </div>
        </Zone>

        {/* ZONE 2 — Factory Floor */}
        <Zone n="02" title="Factory Floor" sub="Redis/BullMQ · production lanes">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LANES.length}, 1fr)`, gap: '0.6rem', height: '100%' }}>
            {LANES.map((lane) => (
              <div key={lane.key} style={{ background: PANEL2, border: `1px solid ${HAIR}`, borderRadius: 8, padding: '0.55rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: TEXT }}>{lane.name}</div>
                <div style={{ fontSize: '0.68rem', color: MUTED, marginBottom: '0.55rem' }}>{lane.sub}</div>
                {lane.items.map((it) => (
                  <div key={it.id} style={{ background: INK, border: `1px solid ${HAIR}`, borderRadius: 6, padding: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem', color: CREME }}>{it.id}</div>
                    <div style={{ fontSize: '0.76rem', color: BODY, margin: '0.15rem 0' }}>{it.t}</div>
                    <div style={{ fontSize: '0.68rem', color: MUTED }}>{it.meta}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Zone>

        {/* ZONE 3 — Editing Bay + Judge */}
        <Zone n="03" title="Editing Bay · QC" sub="Hermes AI Video Judge">
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1rem', height: '100%' }}>
            <div style={{ background: '#13191a', border: `1px solid ${HAIR}`, borderRadius: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED, position: 'relative', minHeight: 160 }}>
              <div style={{ position: 'absolute', top: 8, left: 10, fontFamily: 'ui-monospace, monospace', fontSize: '0.66rem', color: CREME }}>JOB-201 · 9:16 · 0:47</div>
              <div style={{ fontSize: '2rem', opacity: 0.5 }}>▶</div>
              <div style={{ fontSize: '0.74rem' }}>compiled MP4 preview</div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1.8rem', fontWeight: 700, color: GREEN }}>9.0</span>
                <span style={{ color: MUTED, fontSize: '0.8rem' }}>/ 10 judge</span>
              </div>
              {JUDGE.map((j) => (
                <div key={j.k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', padding: '0.22rem 0', color: BODY }}>
                  <span>{j.k}</span>
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: j.v >= 9 ? GREEN : AMBER }}>{j.v}</span>
                </div>
              ))}
              <button style={{ marginTop: '0.7rem', width: '100%', padding: '0.55rem', borderRadius: 7, border: 'none', background: CREME, color: '#1c2224', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                Approve &amp; syndicate
              </button>
            </div>
          </div>
        </Zone>

        {/* ZONE 4 — Distribution + Intent */}
        <Zone n="04" title="Distribution · Intent" sub="AiToEarn · syndication + CRM">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '1rem', height: '100%' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: MUTED, marginBottom: '0.5rem' }}>Syndication</div>
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {PLATFORMS.map((p, i) => (
                  <div key={p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: PANEL2, border: `1px solid ${HAIR}`, borderRadius: 6, padding: '0.35rem 0.6rem', fontSize: '0.76rem', color: BODY }}>
                    <span>{p}</span>
                    <Dot c={i < 4 ? GREEN : MUTED} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.74rem', color: MUTED, marginBottom: '0.5rem' }}>Intent ticker</div>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {INTENT.map((m, i) => (
                  <div key={i} style={{ background: PANEL2, border: `1px solid ${m.kind === 'buy-intent' ? GREEN + '55' : HAIR}`, borderRadius: 7, padding: '0.5rem 0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                      <span style={{ color: CREME, fontFamily: 'ui-monospace, monospace' }}>{m.who}</span>
                      {m.kind === 'buy-intent' && <span style={{ color: GREEN, fontSize: '0.66rem' }}>● buy-intent</span>}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: BODY, marginTop: '0.2rem' }}>&ldquo;{m.sig}&rdquo;</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Zone>
      </div>
    </main>
  );
}
