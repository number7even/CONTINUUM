'use client';
/**
 * BrainGraph — the 3D "brain" (JARVIS-style AI-WORKSHOP-OS clone).
 *
 * Renders the continuum_graph provenance graph as a force-directed 3D field:
 * nodes colored by source, sized by degree; edges are refs[] links; authored
 * verbs render amber with arrows + hover labels. Left = INSPECTOR (click →
 * focus + read; shift-click a second → trace path). Right = FILTER + TOP HUBS.
 *
 * Drives the VANILLA 3d-force-graph engine imperatively (ref + effects) rather
 * than the React wrapper — sidesteps Next App-Router SSR/hydration/wrapper
 * failure modes that left the canvas blank. Data arrives from the server via
 * fetchGraph() over MCP/SSE.
 */
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import type { GraphData, GraphNode } from './lib';
import { useVoice, VoiceOrb } from './voice';
import { ArianAvatar } from './ArianAvatar';

// ── Lobe clustering (technique adapted from seo-os) ──────────────────────────
// Nodes aren't force-simulated into a cloud; each is DETERMINISTICALLY placed in
// a brain "lobe" region by domain, so same-domain nodes cluster together. The
// clustering IS the lobe assignment.
type LobeKey = 'frontal' | 'parietal' | 'temporal' | 'occipital' | 'cerebellum';
// One lobe per SOURCE — the 5-source aggregation moat made visible.
const LOBES: Record<LobeKey, { name: string; color: string }> = {
  frontal: { name: 'code · symbols', color: '#D4537E' },   // pink   — codegraph
  parietal: { name: 'docs', color: '#1D9E75' },            // green  — docs
  temporal: { name: 'commits · git', color: '#BA7517' },   // amber  — git
  occipital: { name: 'concepts', color: '#7F77DD' },       // violet — extracted nouns
  cerebellum: { name: 'memory · other', color: '#378ADD' },// blue   — mem/sona/export
};
const colorFor = (lobe: LobeKey) => LOBES[lobe].color;

/** Map a node to a lobe by its SOURCE (docs / git / codegraph / concept / …). */
function lobeForNode(n: GraphNode): LobeKey {
  switch (n.source) {
    case 'concept': return 'occipital';
    case 'git': return 'temporal';
    case 'codegraph': return 'frontal';
    case 'docs': return 'parietal';
    default: return 'cerebellum'; // mem / sona / export / anything else
  }
}

/** Stable hash of a string → [0,1). */
function hash(s: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

// Harmonic (cymatics-inspired) layout. Each source is a PHYLLOTAXIS spiral —
// nodes placed by the GOLDEN ANGLE (~137.5°), nature's resonance pattern (the
// sunflower / Chladni order) — and the five spirals arrange into a symmetric
// mandala around the centre. Deterministic + PINNED, so the galaxy is structured
// and CALM (no never-settling force scatter, no jittery travelling nodes), yet
// the clusters stay distinct and drillable.
const LOBE_ORDER: LobeKey[] = ['frontal', 'parietal', 'temporal', 'occipital', 'cerebellum'];
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.507°
const CLUSTER_RING = 430; // radius of the mandala the cluster-spheres sit on
/** Position node #j (of `n`) within its source cluster — a 3D Fibonacci SPHERE
 *  (spherical phyllotaxis): a volumetric ball of nodes, not a flat disk. */
function harmonicPos(lobe: LobeKey, j: number, n: number): [number, number, number] {
  const si = Math.max(0, LOBE_ORDER.indexOf(lobe));
  const clusterAngle = (si / LOBE_ORDER.length) * Math.PI * 2;
  const cx = Math.cos(clusterAngle) * CLUSTER_RING;
  const cy = Math.sin(clusterAngle) * CLUSTER_RING;
  const N = Math.max(2, n);
  const yy = 1 - ((j + 0.5) / N) * 2;            // 1 → -1 (latitude)
  const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
  const theta = j * GOLDEN_ANGLE;                // golden-angle longitude → even
  const CR = 70 + Math.sqrt(N) * 5;              // cluster sphere radius
  return [cx + Math.cos(theta) * rad * CR, cy + yy * CR, Math.sin(theta) * rad * CR];
}

// ── FORM engine: arrange the whole galaxy into a 3D geometric form ────────────
// Each form maps a node → a point on/in a shape. Nodes are ordered by source, so
// same-source nodes sit contiguously → colored bands on the form.
type Vec3 = [number, number, number];
type FormCtx = { gi: number; N: number; lobe: LobeKey; j: number; count: number; id: string };

function fibSphere(i: number, N: number, R: number): Vec3 {
  const y = 1 - ((i + 0.5) / N) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const t = i * GOLDEN_ANGLE;
  return [Math.cos(t) * r * R, y * R, Math.sin(t) * r * R];
}
function torusPos(i: number, N: number): Vec3 {
  const Rmaj = 320, Rmin = 120;
  const u = (i / N) * Math.PI * 2;      // around the ring
  const v = i * GOLDEN_ANGLE;           // around the tube
  return [(Rmaj + Rmin * Math.cos(v)) * Math.cos(u), Rmin * Math.sin(v), (Rmaj + Rmin * Math.cos(v)) * Math.sin(u)];
}
function helixPos(i: number, N: number): Vec3 {
  const H = 820, turns = 7, R = 190;
  const t = i / Math.max(1, N - 1);
  const a = t * Math.PI * 2 * turns;
  return [Math.cos(a) * R, (t - 0.5) * H, Math.sin(a) * R];
}
function conePos(i: number, N: number): Vec3 {
  const H = 720, R = 340;
  const t = (i + 0.5) / N;
  const a = i * GOLDEN_ANGLE;
  const r = R * t;
  return [Math.cos(a) * r, (0.5 - t) * H, Math.sin(a) * r];
}
function cubePos(i: number, N: number): Vec3 {
  const side = Math.max(1, Math.ceil(Math.cbrt(N)));
  const s = 620 / side;
  const x = i % side, y = Math.floor(i / side) % side, z = Math.floor(i / (side * side));
  return [(x - (side - 1) / 2) * s, (y - (side - 1) / 2) * s, (z - (side - 1) / 2) * s];
}
/** Concentric hexagon rings (the hex-map look), lifted into 3D by ring. */
function hexPos(i: number): Vec3 {
  if (i === 0) return [0, 0, 0];
  let ring = 1, start = 1;
  while (i >= start + 6 * ring) { start += 6 * ring; ring += 1; }
  const p = i - start, side = Math.floor(p / ring), t = (p % ring) / ring;
  const A = (k: number): [number, number] => { const ang = (k * Math.PI) / 3; return [Math.cos(ang) * ring * 48, Math.sin(ang) * ring * 48]; };
  const [x0, y0] = A(side), [x1, y1] = A(side + 1);
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.sin(ring * 1.2) * 26];
}
const CHLADNI_SIZE = 640;
const chladni = (x: number, y: number, m: number, n: number) =>
  Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y) - Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y);
/** Project onto the (m,n) Chladni nodal figure — a cymatic form. */
function chladniPos(id: string, m: number, n: number): Vec3 {
  let x = hash(id, 5), y = hash(id, 6);
  const eps = 1e-3;
  for (let i = 0; i < 16; i++) {
    const f = chladni(x, y, m, n);
    const gx = (chladni(x + eps, y, m, n) - f) / eps;
    const gy = (chladni(x, y + eps, m, n) - f) / eps;
    const g2 = gx * gx + gy * gy + 1e-9;
    const step = (f / g2) * 0.75;
    x = Math.min(1, Math.max(0, x - step * gx));
    y = Math.min(1, Math.max(0, y - step * gy));
  }
  return [(x - 0.5) * CHLADNI_SIZE, (y - 0.5) * CHLADNI_SIZE, (hash(id, 7) - 0.5) * 28];
}

// The three top-level VIEW modes: the natural force galaxy, the cymatic
// frequency figures, and the geometric forms.
type ViewMode = 'universe' | 'frequency' | 'form';

// Geometric forms — the whole galaxy snaps into a 3D shape.
const GEO_FORMS: { name: string; place: (c: FormCtx) => Vec3 }[] = [
  { name: '✦ mandala', place: (c) => harmonicPos(c.lobe, c.j, c.count) },
  { name: '● sphere', place: (c) => fibSphere(c.gi, c.N, 340) },
  { name: '◉ torus', place: (c) => torusPos(c.gi, c.N) },
  { name: '⬡ hex', place: (c) => hexPos(c.gi) },
  { name: '⟳ helix', place: (c) => helixPos(c.gi, c.N) },
  { name: '▲ cone', place: (c) => conePos(c.gi, c.N) },
  { name: '▦ cube', place: (c) => cubePos(c.gi, c.N) },
];

// Cymatic frequencies — Solfeggio Hz mapped to Chladni plate modes (m,n).
// Higher Hz = higher mode = more intricate nodal figure.
const FREQS: { hz: string; m: number; n: number }[] = [
  { hz: '174', m: 1, n: 2 },
  { hz: '285', m: 2, n: 3 },
  { hz: '396', m: 2, n: 5 },
  { hz: '432', m: 3, n: 4 },
  { hz: '528', m: 4, n: 5 },
  { hz: '741', m: 5, n: 7 },
  { hz: '852', m: 6, n: 8 },
];

interface FGNode extends GraphNode { __lobe?: LobeKey; fx?: number; fy?: number; fz?: number; x?: number; y?: number; z?: number; }
interface FGLink { source: string | FGNode; target: string | FGNode; verb?: string; }
const endId = (e: string | FGNode) => (typeof e === 'object' ? e.id : e);
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);

/**
 * MatrixRain — the "enter the isolation" transition. The files/labels of the
 * isolated proximity cascade down the screen like the Matrix, then the node
 * materialises center-screen as the rain fades — revealing the isolated graph.
 */
function MatrixRain({ title, lines, onDone }: { title: string; lines: string[]; onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const fontSize = 16;
    const cols = Math.max(1, Math.floor(W / fontSize));
    const kata = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789<>[]{}/=';
    // Half the columns spell a real file/label (legible); the rest are glyphs.
    const streams = Array.from({ length: cols }, (_, i) => ({
      y: Math.floor(Math.random() * -50),
      text: lines.length && Math.random() < 0.55 ? lines[i % lines.length]! + '   ' : '',
      k: 0,
    }));
    const DURATION = 2100, FADE_AT = 1450;
    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.fillStyle = 'rgba(5,7,10,0.12)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `${fontSize}px ui-monospace, monospace`;
      for (let i = 0; i < cols; i++) {
        const st = streams[i]!;
        const ch = st.text ? st.text[st.k % st.text.length]! : kata[Math.floor(Math.random() * kata.length)]!;
        const x = i * fontSize, y = st.y * fontSize;
        ctx.fillStyle = '#c7ffe6';
        ctx.fillText(ch, x, y);
        ctx.fillStyle = st.text ? 'rgba(110,231,183,0.85)' : 'rgba(52,211,153,0.4)';
        ctx.fillText(ch, x, y - fontSize);
        st.y++; st.k++;
        if (y > H && Math.random() > 0.97) { st.y = Math.floor(Math.random() * -20); st.k = 0; }
      }
      if (t > FADE_AT) {
        const p = Math.min(1, (t - FADE_AT) / (DURATION - FADE_AT));
        ctx.fillStyle = `rgba(5,7,10,${0.12 + p * 0.55})`;
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.shadowColor = '#34d399';
        ctx.shadowBlur = 26;
        ctx.font = `bold ${Math.round(28 + p * 12)}px ui-sans-serif, system-ui`;
        ctx.fillStyle = `rgba(198,255,230,${p})`;
        ctx.fillText(truncate(title, 46), W / 2, H / 2);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
      }
      if (t < DURATION) raf = requestAnimationFrame(draw);
      else onDoneRef.current();
    };
    raf = requestAnimationFrame(draw);
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [title, lines]);
  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, zIndex: 9, pointerEvents: 'none' }} />;
}

export function BrainGraph({ data }: { data: GraphData }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<LobeKey | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [pathEnds, setPathEnds] = useState<string[]>([]);
  const [depth, setDepth] = useState(1);
  const [search, setSearch] = useState('');
  const [isolate, setIsolate] = useState(false); // proximity snapshot: show ONLY the neighbourhood
  const [mode, setMode] = useState<ViewMode>('form'); // universe | frequency | form
  const [freqIdx, setFreqIdx] = useState(0); // sub-option index within the active mode
  const [divePath, setDivePath] = useState<string[]>([]); // breadcrumb of the proximity dive
  const [askNodes, setAskNodes] = useState<string[] | null>(null); // nodes an /api/ask answer cited
  const [answer, setAnswer] = useState<{ q: string; text: string; ids: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [menuNode, setMenuNode] = useState<GraphNode | null>(null); // radial functions-menu target
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null); // its screen anchor
  const [reverseNode, setReverseNode] = useState<GraphNode | null>(null); // reverse-engineer diagram target
  const [dossier, setDossier] = useState<{ node: GraphNode; loading: boolean; content: string | null; meta: Record<string, unknown> | null; error?: string } | null>(null);
  const [mindmapOn, setMindmapOn] = useState(false); // dossier: content view ⟷ mindmap view
  const [mermaidText, setMermaidText] = useState<string | null>(null); // dossier: gitreverse-style mermaid map
  const [matrixRain, setMatrixRain] = useState<{ title: string; lines: string[] } | null>(null); // "enter isolation" transition
  const prevIsolateRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const highlightRef = useRef<Set<string> | null>(null);
  const didFitRef = useRef(false); // auto-fit ONCE on load; never yank the camera again

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  // Direct relationships of a node (for the dive panel), with the verb + direction.
  const neighborsOf = (id: string) => {
    const out: { node: GraphNode; verb?: string; dir: '→' | '←' }[] = [];
    for (const e of data.edges) {
      if (e.source === id) { const n = nodeById.get(e.target); if (n) out.push({ node: n, verb: e.verb, dir: '→' }); }
      else if (e.target === id) { const n = nodeById.get(e.source); if (n) out.push({ node: n, verb: e.verb, dir: '←' }); }
    }
    return out.sort((a, b) => b.node.degree - a.node.degree);
  };
  // Reverse-engineer a node's neighbourhood into a Mermaid diagram (gitreverse-style):
  // callers → node → callees, verbs as edge labels. Paste into GitHub / mermaid.live to render.
  const graphToMermaid = (node: GraphNode): string => {
    const rel = neighborsOf(node.id);
    const callers = rel.filter((r) => r.dir === '←').slice(0, 12);
    const callees = rel.filter((r) => r.dir === '→').slice(0, 12);
    const idOf = new Map<string, string>();
    [node, ...callers.map((r) => r.node), ...callees.map((r) => r.node)].forEach((n, i) => {
      if (!idOf.has(n.id)) idOf.set(n.id, 'N' + i);
    });
    const lbl = (s: string) => truncate(s.replace(/["\n|]/g, ' '), 34);
    const vb = (v?: string) => (v || 'refs').replace(/[|"\n]/g, ' ');
    const c = idOf.get(node.id)!;
    const L = ['graph LR', `  ${c}["${lbl(node.label)}"]`];
    callers.forEach(({ node: n, verb }) => L.push(`  ${idOf.get(n.id)}["${lbl(n.label)}"] -->|${vb(verb)}| ${c}`));
    callees.forEach(({ node: n, verb }) => L.push(`  ${c} -->|${vb(verb)}| ${idOf.get(n.id)}["${lbl(n.label)}"]`));
    L.push(`  style ${c} fill:#0b1220,stroke:#38bdf8,stroke-width:2px,color:#e5e7eb`);
    return L.join('\n');
  };
  // Dive into a node — select it, push the breadcrumb, focus its proximity.
  const diveTo = (n: GraphNode, extend: boolean) => {
    setSelected(n);
    setDepth(1);
    setDivePath((prev) => (extend ? [...prev, n.id] : [n.id]));
  };
  const diveBack = (i: number) => {
    setDivePath((prev) => prev.slice(0, i + 1));
    const id = divePath[i];
    const n = id ? nodeById.get(id) : undefined;
    if (n) setSelected(n);
  };

  // Fly the camera to frame just one lobe's nodes (click a cluster → drill in).
  const focusLobe = (lobe: LobeKey | null) => {
    setFocused(lobe);
    setIsolate(false); // flying to a whole cluster exits the proximity snapshot
    const g = graphRef.current;
    if (!g) return;
    try {
      if (lobe) g.zoomToFit(800, 40, (n: FGNode) => n.__lobe === lobe);
      else g.zoomToFit(800, 60);
    } catch { /* noop */ }
  };

  // ── Voice layer ────────────────────────────────────────────────────────────
  const voice = useVoice();
  // Map a spoken lobe name → LobeKey.
  const lobeFromPhrase = (t: string): LobeKey | 'all' | null => {
    if (/\b(all|everything|zoom out|reset|whole|full)\b/.test(t)) return 'all';
    if (/\b(amf|engine|media|content|factory)\b/.test(t)) return 'frontal';
    if (/\b(deploy|ops|operation|infra|self.?host)\b/.test(t)) return 'parietal';
    if (/\b(sprint|process|kaizen|ledger|status)\b/.test(t)) return 'temporal';
    if (/\b(concept|noun|idea)\b/.test(t)) return 'occipital';
    if (/\b(vision|architect|roadmap|unified)\b/.test(t)) return 'cerebellum';
    return null;
  };

  // Resolve ids returned by /api/ask to actual graph nodes (exact, then loose).
  const resolveAskIds = useCallback((ids: string[]): string[] => {
    const out: string[] = [];
    for (const id of ids) {
      if (nodeById.has(id)) { out.push(id); continue; }
      const hit = data.nodes.find(
        (n) => n.id.startsWith(id) || (id.length >= 8 && n.id.slice(0, 8) === id.slice(0, 8)),
      );
      if (hit) out.push(hit.id);
    }
    return [...new Set(out)];
  }, [nodeById, data.nodes]);

  // Plain-language question → /api/ask (LLM + CONTINUUM memory) → grounded answer
  // + the nodes it cited light up and the camera flies to them.
  const askBrain = useCallback(async (question: string) => {
    setAsking(true);
    setAnswer({ q: question, text: '…thinking', ids: [] });
    voice.setThinking(true);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data2 = (await r.json()) as { answer?: string; nodeIds?: string[]; error?: string };
      if (!r.ok || data2.error) throw new Error(data2.error || `ask failed (${r.status})`);
      const text = data2.answer ?? '(no answer)';
      const ids = resolveAskIds(data2.nodeIds ?? []);
      setAnswer({ q: question, text, ids });
      setAskNodes(ids.length ? ids : null);
      if (ids.length) {
        const first = nodeById.get(ids[0]!);
        if (first) setSelected(first);
        const idSet = new Set(ids);
        setTimeout(() => {
          try { graphRef.current?.zoomToFit(900, 90, (n: FGNode) => idSet.has(n.id)); } catch { /* noop */ }
        }, 60);
      }
      voice.speak(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnswer({ q: question, text: `⚠ ${msg}`, ids: [] });
      voice.setThinking(false);
    } finally {
      setAsking(false);
    }
  }, [voice, resolveAskIds, nodeById]);

  // Open the node DOSSIER — fetch its full verified content (Layer-3), no LLM.
  const openDossier = useCallback(async (node: GraphNode) => {
    setDossier({ node, loading: true, content: null, meta: null });
    setMindmapOn(false);
    setMermaidText(null);
    setCopied(false);
    try {
      const r = await fetch('/api/observation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [node.id] }),
      });
      const d = (await r.json()) as { observations?: Array<{ content?: string; metadata?: Record<string, unknown> }>; error?: string };
      if (!r.ok || d.error) throw new Error(d.error || `fetch failed (${r.status})`);
      const obs = (d.observations ?? [])[0];
      setDossier({ node, loading: false, content: obs?.content ?? '(no full content stored for this node)', meta: obs?.metadata ?? null });
    } catch (err) {
      setDossier({ node, loading: false, content: null, meta: null, error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // The node functions menu — "what do I want to see" (the gitreverse idea, live).
  const NODE_ACTIONS: { key: string; icon: string; label: string; color: string; run: (n: GraphNode) => void }[] = [
    { key: 'dossier', icon: '📄', label: 'Dossier', color: '#38bdf8', run: (n) => { void openDossier(n); setSelected(n); } },
    { key: 'explain', icon: '✦', label: 'Explain', color: '#22d3ee', run: (n) => askBrain(`Explain "${n.label}" — what is it, what is its role, and what does it connect to?`) },
    { key: 'reverse', icon: '⊹', label: 'Reverse', color: '#a78bfa', run: (n) => { setReverseNode(n); setSelected(n); } },
    { key: 'relations', icon: '⇄', label: 'Relations', color: '#6ee7b7', run: (n) => { setSelected(n); setDepth(1); setIsolate(true); } },
    { key: 'history', icon: '◷', label: 'History', color: '#f59e0b', run: (n) => askBrain(`What commits, changes, or history relate to "${n.label}"? Cite the relevant commit nodes.`) },
    { key: 'trace', icon: '↝', label: 'Trace…', color: '#f472b6', run: (n) => { setPathEnds([n.id]); } },
  ];

  // Route each final transcript to a graph action + a spoken reply.
  useEffect(() => {
    const t = voice.lastFinal.text.toLowerCase().trim();
    if (!t) return;
    voice.setThinking(true);
    // 1) greeting
    if (/^(hey|hi|hello|jarvis|continuum)\b/.test(t) && t.length < 20) {
      voice.speak(`Online. ${data.stats?.nodeCount ?? 0} nodes across five lobes. Ask me to show a cluster, search, or brief you.`);
      return;
    }
    // 2) status / brief
    if (/\b(status|brief|summary|overview|how many|how big|what.s here)\b/.test(t)) {
      const top = data.stats?.topHubs?.[0];
      voice.speak(`${data.stats?.nodeCount ?? 0} nodes, ${data.stats?.edgeCount ?? 0} connections. The biggest hub is ${top ? truncate(top.label, 40) : 'unknown'}.`);
      return;
    }
    // 3) focus a lobe
    const lobe = lobeFromPhrase(t);
    if (lobe === 'all') { focusLobe(null); voice.speak('Showing all clusters.'); return; }
    if (lobe) { focusLobe(lobe); voice.speak(`Focusing the ${LOBES[lobe].name} cluster — ${lobeCounts[lobe] ?? 0} nodes.`); return; }
    // 4) describe the selected node
    if (/\b(read|describe|what is this|tell me about this|explain this)\b/.test(t)) {
      if (selected) voice.speak(`${selected.source} node, degree ${selected.degree}. ${truncate(selected.label, 120)}`);
      else voice.speak('Nothing selected. Say search, then a term.');
      return;
    }
    // 5) search / show me <term>
    const m = t.match(/\b(?:search|find|show me|look for|go to|open)\s+(.+)$/);
    if (m && m[1]) {
      const term = m[1].replace(/[.?!]+$/, '').trim();
      const hit = data.nodes.find((n) => n.label.toLowerCase().includes(term));
      if (hit) {
        // Proximity snapshot: select it, show its relationships, isolate + frame.
        setSelected(hit);
        setDepth(1);
        setIsolate(true);
        const lb = nodeLobe.get(hit.id);
        const nbrs = adjacency.get(hit.id)?.size ?? 0;
        voice.speak(`Here is ${truncate(hit.label, 60)}${lb ? ' in ' + LOBES[lb].name : ''}, with its ${nbrs} relationship${nbrs === 1 ? '' : 's'}.`);
      } else {
        voice.speak(`Nothing matching ${term}.`);
      }
      return;
    }
    // 6) anything else = a real question → the LLM comprehension agent.
    void askBrain(voice.lastFinal.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.lastFinal.nonce]);

  // Undirected adjacency for path-tracing.
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const e of data.edges) {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
    return adj;
  }, [data.edges]);

  // Shortest path (BFS) between the two shift-clicked endpoints.
  const tracedPath = useMemo(() => {
    if (pathEnds.length !== 2) return { nodes: new Set<string>(), links: new Set<string>() };
    const [a, b] = pathEnds;
    const prev = new Map<string, string>();
    const q = [a!];
    const seen = new Set([a!]);
    while (q.length) {
      const cur = q.shift()!;
      if (cur === b) break;
      for (const nb of adjacency.get(cur) ?? []) if (!seen.has(nb)) { seen.add(nb); prev.set(nb, cur); q.push(nb); }
    }
    const nodes = new Set<string>();
    const links = new Set<string>();
    if (seen.has(b!)) {
      let cur = b!;
      nodes.add(cur);
      while (cur !== a) { const p = prev.get(cur)!; nodes.add(p); links.add(`${p}|${cur}`); links.add(`${cur}|${p}`); cur = p; }
    }
    return { nodes, links };
  }, [pathEnds, adjacency]);

  // Highlight set: search matches, else the selected node + its neighbours out
  // to `depth` hops. null = nothing highlighted (everything shown at full).
  const highlighted = useMemo<Set<string> | null>(() => {
    // An /api/ask answer highlights exactly the nodes it cited (grounded set).
    if (askNodes && askNodes.length) return new Set(askNodes);
    const term = search.trim().toLowerCase();
    if (term) return new Set(data.nodes.filter((n) => n.label.toLowerCase().includes(term)).map((n) => n.id));
    if (!selected) return null;
    const set = new Set<string>([selected.id]);
    let frontier = [selected.id];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const id of frontier) for (const nb of adjacency.get(id) ?? []) if (!set.has(nb)) { set.add(nb); next.push(nb); }
      frontier = next;
    }
    return set;
  }, [askNodes, search, selected, depth, adjacency, data.nodes]);

  // Matrix "enter the isolation" transition — fires when isolate flips false→true.
  useEffect(() => {
    if (isolate && !prevIsolateRef.current && selected) {
      const ids = highlighted ? [...highlighted] : [selected.id];
      const lines = ids.map((id) => nodeById.get(id)?.label ?? id).filter(Boolean).slice(0, 60);
      setMatrixRain({ title: selected.label, lines });
    }
    prevIsolateRef.current = isolate;
  }, [isolate, selected, highlighted, nodeById]);

  // Glue the radial menu to the node's live screen position (follows orbit/zoom).
  useEffect(() => {
    if (!menuNode || !ready) { setMenuPos(null); return; }
    let raf = 0;
    const tick = () => {
      const g = graphRef.current;
      const el = canvasRef.current;
      if (g && el) {
        const live = (g.graphData().nodes as FGNode[]).find((n) => n.id === menuNode.id);
        if (live && typeof live.x === 'number') {
          const sc = g.graph2ScreenCoords(live.x, live.y, live.z);
          const rect = el.getBoundingClientRect();
          setMenuPos({ x: rect.left + sc.x, y: rect.top + sc.y });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [menuNode, ready]);

  // Lobe per node (the cluster assignment) + counts for the legend/filter.
  const nodeLobe = useMemo(() => {
    const m = new Map<string, LobeKey>();
    for (const n of data.nodes) m.set(n.id, lobeForNode(n));
    return m;
  }, [data.nodes]);
  const lobeCounts = useMemo(() => {
    const c = {} as Record<LobeKey, number>;
    for (const l of nodeLobe.values()) c[l] = (c[l] ?? 0) + 1;
    return c;
  }, [nodeLobe]);

  // Filtered graph — nodes DETERMINISTICALLY pinned to their lobe (fx/fy/fz), so
  // they cluster by domain instead of drifting into a uniform force cloud.
  // ISOLATE (proximity snapshot): when on, render ONLY the highlighted neighbourhood.
  const graphData = useMemo(() => {
    const snap = isolate && highlighted ? highlighted : null;
    const visible = data.nodes.filter((n) => !hidden.has(nodeLobe.get(n.id) ?? 'parietal') && (!snap || snap.has(n.id)));
    const visibleIds = new Set(visible.map((n) => n.id));
    return {
      // PINNED FORM layout: every node's (fx,fy,fz) is placed onto the selected
      // geometric form (mandala / sphere / torus / hex / helix / cone / cube /
      // cymatic figure). Deterministic + pinned → the galaxy snaps into the shape
      // and stays CALM (no chaotic never-settling force scatter). Nodes are ordered
      // by source so each form shows colored bands per lobe.
      nodes: (() => {
        const lobeOf = (id: string): LobeKey => nodeLobe.get(id) ?? 'cerebellum';
        // UNIVERSE — no pinning; d3 force lays out the natural connected galaxy
        // (edges pull related nodes together → proximity = actual relationship).
        if (mode === 'universe') {
          return visible.map((n) => ({ ...n, __lobe: lobeOf(n.id) } as FGNode));
        }
        // FREQUENCY / FORM — deterministic pinned placement onto the chosen shape.
        const visLobe = new Map<LobeKey, number>();
        for (const n of visible) { const l = lobeOf(n.id); visLobe.set(l, (visLobe.get(l) ?? 0) + 1); }
        // global order = grouped by lobe (source), so same-color nodes are contiguous.
        const ordered = [...visible].sort(
          (a, b) => LOBE_ORDER.indexOf(lobeOf(a.id)) - LOBE_ORDER.indexOf(lobeOf(b.id)),
        );
        const N = Math.max(1, ordered.length);
        const counters: Partial<Record<LobeKey, number>> = {};
        const pos = new Map<string, Vec3>();
        const freq = FREQS[freqIdx] ?? FREQS[0];
        const form = GEO_FORMS[freqIdx] ?? GEO_FORMS[0];
        ordered.forEach((n, gi) => {
          const lobe = lobeOf(n.id);
          const j = (counters[lobe] = (counters[lobe] ?? 0) + 1) - 1;
          const p: Vec3 = mode === 'frequency'
            ? chladniPos(n.id, freq.m, freq.n)
            : form.place({ gi, N, lobe, j, count: visLobe.get(lobe) ?? 1, id: n.id });
          pos.set(n.id, p);
        });
        return visible.map((n) => {
          const lobe = lobeOf(n.id);
          const [fx, fy, fz] = pos.get(n.id) ?? [0, 0, 0];
          return { ...n, __lobe: lobe, fx, fy, fz } as FGNode;
        });
      })(),
      links: data.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)).map((e) => ({ source: e.source, target: e.target, verb: e.verb })) as FGLink[],
    };
  }, [data.nodes, data.edges, hidden, nodeLobe, isolate, highlighted, mode, freqIdx]);

  // Track canvas size.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Frame the snapshot when isolate turns on (auto-fit is one-time now).
  useEffect(() => {
    if (!ready || !isolate) return;
    const id = setTimeout(() => { try { graphRef.current?.zoomToFit(600, 60); } catch { /* noop */ } }, 500);
    return () => clearTimeout(id);
  }, [isolate, ready]);

  // Reframe when the frequency changes — the resonance figure snaps into view.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => { try { graphRef.current?.zoomToFit(700, 80); } catch { /* noop */ } }, 450);
    return () => clearTimeout(id);
  }, [mode, freqIdx, ready]);

  // Keyboard: i = isolate the snapshot · Esc = clear everything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return; // don't hijack the search box
      if (e.key === 'i' || e.key === 'I') setIsolate((v) => !v);
      else if (e.key === 'Escape') { voice.stop(); setSelected(null); setIsolate(false); setSearch(''); setPathEnds([]); setMenuNode(null); setReverseNode(null); setDossier(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Node renderer — reads highlightRef so it can DIM non-highlighted nodes.
  // Stable identity; re-applied (rebuilds node objects) when the highlight changes.
  const nodeObj = useRef<(n: FGNode) => THREE.Object3D>((n: FGNode) => {
    const hl = highlightRef.current;
    const dim = !!hl && !hl.has(n.id);
    const lobe = n.__lobe ?? 'parietal';
    const r = 1.6 + Math.min(Math.sqrt(n.degree || 0), 9) * 0.42;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(
      new THREE.SphereGeometry(r, 12, 12),
      new THREE.MeshBasicMaterial({ color: colorFor(lobe), transparent: dim, opacity: dim ? 0.1 : 1 }),
    ));
    if (!dim && (n.degree || 0) >= 3) {
      const label = new SpriteText(truncate(n.label || '', 22));
      label.color = 'rgba(210,216,232,0.6)';
      label.fontFace = 'ui-monospace, monospace';
      label.textHeight = 2.4;
      label.position.set(0, r + 3, 0);
      (label.material as THREE.Material).depthWrite = false;
      group.add(label);
    }
    return group;
  }).current;

  // Create the 3d-force-graph engine once, on the canvas element.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !data.ok) return;
    let destroyed = false;
    import('3d-force-graph').then((mod) => {
      if (destroyed || !canvasRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FG = (mod as any).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = new FG(canvasRef.current as HTMLElement)
        .backgroundColor('#05070a')
        .nodeLabel((n: FGNode) => `${n.label} (${n.source}, deg ${n.degree})`)
        // Each node = a lobe-colored sphere (size by degree, dim if not highlighted)
        // + an always-on label on the meaningful nodes.
        .nodeThreeObject(nodeObj)
        .linkLabel((l: FGLink) => (l.verb ? `<b style="color:#f59e0b">${l.verb}</b>` : ''))
        .linkDirectionalArrowLength((l: FGLink) => (l.verb ? 3 : 0))
        .linkDirectionalArrowRelPos(1)
        // Flow particles — animated dots travelling source→target along each edge
        // (shows the relationship direction; typed/verb edges flow brighter).
        .linkDirectionalParticles((l: FGLink) => (l.verb ? 2 : 1))
        .linkDirectionalParticleSpeed(0.006)
        .linkDirectionalParticleWidth((l: FGLink) => (l.verb ? 1.6 : 1.0))
        .linkDirectionalParticleColor((l: FGLink) => (l.verb ? 'rgba(245,158,11,0.95)' : 'rgba(110,231,183,0.8)'))
        .onNodeClick((node: FGNode, event: MouseEvent) => {
          if (event.shiftKey) setPathEnds((prev) => (prev.length >= 2 ? [node.id] : [...prev, node.id]));
          else { setSelected(node); setDepth(1); setDivePath([node.id]); setPathEnds([]); setMenuNode(node); }
        })
        .onBackgroundClick(() => { setMenuNode(null); })
        // Frame the whole graph once the force layout settles → the "brain" snaps
        // into view instead of drifting off-centre.
        .cooldownTicks(120)
        // Fit ONCE, on the first settle — after that the camera is the user's.
        .onEngineStop(() => {
          if (didFitRef.current) return;
          didFitRef.current = true;
          try { graphRef.current?.zoomToFit(700, 90); } catch { /* noop */ }
        });
      graphRef.current = g;
      // Spread the galaxy — more charge repulsion + a bit of link distance so 800+
      // nodes breathe instead of collapsing into a dense ball.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { (g.d3Force('charge') as any)?.strength(-60); (g.d3Force('link') as any)?.distance(28); } catch { /* noop */ }
      setReady(true);
    }).catch((e) => setEngineError(e?.message ? String(e.message) : String(e)));
    return () => {
      destroyed = true;
      try { graphRef.current?._destructor?.(); } catch { /* noop */ }
      graphRef.current = null;
    };
  }, [data.ok]);

  // Push data + size into the engine.
  useEffect(() => {
    const g = graphRef.current;
    if (!g || !ready) return;
    if (dims.w > 0 && dims.h > 0) g.width(dims.w).height(dims.h);
    g.graphData(graphData);
  }, [graphData, dims, ready]);

  // Apply highlight/dim + link emphasis + camera fly. Rebuilds node objects
  // (dim non-highlighted), colors links, and flies to the selected node.
  useEffect(() => {
    highlightRef.current = highlighted;
    const g = graphRef.current;
    if (!g || !ready) return;
    g.nodeThreeObject(nodeObj); // rebuild → applies dim/highlight
    g.linkColor((l: FGLink) => {
      const s = endId(l.source), t = endId(l.target);
      if (pathEnds.length === 2) return tracedPath.links.has(`${s}|${t}`) ? '#34d399' : 'rgba(120,130,150,0.08)';
      if (highlighted) return highlighted.has(s) && highlighted.has(t) ? '#6ee7b7' : 'rgba(120,130,150,0.04)';
      return l.verb ? 'rgba(245,158,11,0.55)' : 'rgba(80,120,110,0.28)';
    }).linkWidth((l: FGLink) => {
      const s = endId(l.source), t = endId(l.target);
      if (pathEnds.length === 2 && tracedPath.links.has(`${s}|${t}`)) return 2;
      if (highlighted && highlighted.has(s) && highlighted.has(t)) return 1.2;
      return l.verb ? 1.5 : 0.5;
    });
    // FLOW FOCUS: when a node/proximity is in focus (isolate, select, search, ask,
    // or a traced path), the flow particles FREEZE everywhere except the focused
    // edges — so the eye follows the direction of flow for THAT node alone.
    g.linkDirectionalParticles((l: FGLink) => {
      const s = endId(l.source), t = endId(l.target);
      if (pathEnds.length === 2) return tracedPath.links.has(`${s}|${t}`) ? 4 : 0;
      if (highlighted) return highlighted.has(s) && highlighted.has(t) ? (l.verb ? 4 : 3) : 0;
      return l.verb ? 2 : 1; // ambient galaxy flow when nothing is focused
    }).linkDirectionalArrowLength((l: FGLink) => {
      const s = endId(l.source), t = endId(l.target);
      if (pathEnds.length === 2) return tracedPath.links.has(`${s}|${t}`) ? 4 : 0;
      if (highlighted) return highlighted.has(s) && highlighted.has(t) && l.verb ? 4 : 0;
      return l.verb ? 3 : 0;
    });
    // NB: deliberately DON'T move the camera on node select — highlight+dim is the
    // focus; the user keeps their own zoom. Camera flight is an explicit action
    // (clicking a lobe name → focusLobe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted, pathEnds, tracedPath, ready]);

  const toggleLobe = (lobe: string) =>
    setHidden((prev) => { const next = new Set(prev); next.has(lobe) ? next.delete(lobe) : next.add(lobe); return next; });

  const stats = data.stats;

  if (!data.ok) {
    return (
      <div style={panel.empty}>
        <h2 style={{ color: '#e5e7eb' }}>Brain unavailable</h2>
        <p style={{ color: '#9ca3af' }}>
          {data.reason === 'login' && 'No tenant token — log in on /dashboard first.'}
          {data.reason === 'unconfigured' && 'Set CONTINUUM_HTTP_URL to the engine SSE endpoint.'}
          {!['login', 'unconfigured'].includes(data.reason ?? '') && `Engine error: ${data.reason}`}
        </p>
      </div>
    );
  }

  return (
    <div style={panel.root}>
      {/* LEFT — inspector */}
      <aside style={panel.left}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: '#6ee7b7' }}>CONTINUUM · BRAIN</div>
        <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
          {stats?.nodeCount ?? 0} nodes · {stats?.edgeCount ?? 0} connections · {data.latencyMs}ms
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search the brain…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: 12, padding: '7px 10px', borderRadius: 6, outline: 'none' }}
        />
        {search && <div style={{ fontSize: 11, color: '#6ee7b7', margin: '6px 0' }}>{highlighted?.size ?? 0} match{(highlighted?.size ?? 0) === 1 ? '' : 'es'} · <span style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setSearch('')}>clear</span></div>}
        {answer && (
          <div style={{ margin: '10px 0', padding: '10px 12px', borderRadius: 8, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)' }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#38bdf8', marginBottom: 4 }}>
              ANSWER {asking && <span style={{ color: '#f59e0b' }}>· thinking…</span>}
            </div>
            <div style={{ fontSize: 11, color: '#7f8ea3', marginBottom: 6, fontStyle: 'italic' }}>“{truncate(answer.q, 90)}”</div>
            <div style={{ fontSize: 12.5, color: '#e5e7eb', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{answer.text}</div>
            {answer.ids.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {answer.ids.map((id) => (
                  <span key={id} onClick={() => { const n = nodeById.get(id); if (n) { setSelected(n); setDepth(1); } }}
                    style={{ cursor: 'pointer', fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(56,189,248,0.15)', color: '#bae6fd', border: '1px solid rgba(56,189,248,0.3)' }}>
                    {truncate(nodeById.get(id)?.label ?? id, 22)}
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280', cursor: 'pointer' }}
              onClick={() => { setAnswer(null); setAskNodes(null); }}>✕ clear answer</div>
          </div>
        )}
        <div style={panel.sectionLabel}>INSPECTOR</div>
        {selected ? (
          <div style={{ fontSize: 13, color: '#e5e7eb' }}>
            <div style={{ color: colorFor(nodeLobe.get(selected.id) ?? 'parietal'), fontWeight: 600 }}>{LOBES[nodeLobe.get(selected.id) ?? 'parietal'].name} · {selected.source}</div>
            <div style={{ margin: '6px 0', lineHeight: 1.4 }}>{selected.label}</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>degree {selected.degree}{selected.timestamp ? ' · ' + selected.timestamp.slice(0, 16) : ''}</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>{selected.id}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
              <span>depth</span>
              {[1, 2, 3].map((d) => (
                <button key={d} type="button" onClick={() => setDepth(d)}
                  style={{ width: 24, height: 22, borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: depth === d ? '#34d399' : 'transparent', color: depth === d ? '#05070a' : '#cbd5e1', fontWeight: 600 }}>{d}</button>
              ))}
              <button type="button" onClick={() => setIsolate((v) => !v)}
                style={{ marginLeft: 4, height: 22, padding: '0 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: isolate ? '#f59e0b' : 'transparent', color: isolate ? '#05070a' : '#cbd5e1', fontWeight: 600, fontSize: 11 }}>isolate</button>
              <span style={{ cursor: 'pointer', color: '#9ca3af', marginLeft: 4 }} onClick={() => { setSelected(null); setIsolate(false); }}>✕</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{highlighted ? `${highlighted.size} node(s) highlighted` : ''}</div>
            {/* Breadcrumb — your proximity dive path. */}
            {divePath.length > 1 && (
              <div style={{ fontSize: 11, margin: '8px 0', lineHeight: 1.5 }}>
                {divePath.map((id, i) => (
                  <span key={id + i}>
                    {i > 0 && <span style={{ color: '#4b5563' }}> › </span>}
                    <span style={{ cursor: 'pointer', color: i === divePath.length - 1 ? '#6ee7b7' : '#9ca3af' }} onClick={() => diveBack(i)}>
                      {truncate(nodeById.get(id)?.label ?? id, 14)}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {/* Relationships — dive deeper, proximity by proximity. */}
            <div style={{ marginTop: 12 }}>
              <div style={panel.sectionLabel}>RELATIONSHIPS ({neighborsOf(selected.id).length})</div>
              {neighborsOf(selected.id).slice(0, 24).map(({ node, verb, dir }, k) => (
                <div key={node.id + k} onClick={() => diveTo(node, true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '3px 0', cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: colorFor(nodeLobe.get(node.id) ?? 'cerebellum'), flexShrink: 0 }} />
                  <span style={{ color: '#6b7280', width: 10, flexShrink: 0 }}>{dir}</span>
                  {verb && <span style={{ color: '#f59e0b', fontSize: 11, flexShrink: 0 }}>{verb}</span>}
                  <span style={{ flex: 1, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(node.label, 26)}</span>
                </div>
              ))}
              {neighborsOf(selected.id).length === 0 && <div style={{ fontSize: 12, color: '#6b7280' }}>no direct relationships</div>}
            </div>
          </div>
        ) : (
          <div style={{ color: '#6b7280', fontSize: 12 }}>Click a node to focus it. Shift-click two nodes to trace the path between them.</div>
        )}
        {pathEnds.length === 2 && (
          <div style={{ marginTop: 10, color: tracedPath.nodes.size ? '#6ee7b7' : '#f87171', fontSize: 12 }}>
            {tracedPath.nodes.size ? `path: ${tracedPath.nodes.size} hops` : 'no path between these two'}
          </div>
        )}
        {stats?.topHubs?.length ? (
          <div style={{ marginTop: 18 }}>
            <div style={panel.sectionLabel}>TOP HUBS</div>
            {stats.topHubs.slice(0, 8).map((h) => (
              <div key={h.id} style={{ fontSize: 12, color: '#cbd5e1', margin: '3px 0', cursor: 'pointer' }}
                onClick={() => { const n = nodeById.get(h.id); if (n) { setSelected(n); void openDossier(n); } }}
                title="open in the right panel">
                <span style={{ color: '#fbbf24' }}>{h.degree}</span> · {h.label.slice(0, 34)}
              </div>
            ))}
          </div>
        ) : null}
        {engineError
          ? <div style={{ marginTop: 18, color: '#f87171', fontSize: 12 }}>3D engine error: {engineError}</div>
          : !ready && <div style={{ marginTop: 18, color: '#6b7280', fontSize: 12 }}>loading 3D engine…</div>}
      </aside>

      {/* CENTER — the 3D field (engine mounts here) */}
      <div ref={canvasRef} style={panel.canvas} />

      {/* RIGHT — lobes (the clusters) */}
      <aside style={panel.right}>
        <div style={{ ...panel.sectionLabel, display: 'flex', justifyContent: 'space-between' }}>
          <span>LOBES</span>
          {focused && <span style={{ cursor: 'pointer', color: '#6ee7b7' }} onClick={() => focusLobe(null)}>← all</span>}
        </div>
        {(Object.keys(LOBES) as LobeKey[]).sort((a, b) => (lobeCounts[b] ?? 0) - (lobeCounts[a] ?? 0)).map((lobe) => (
          <div key={lobe} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '6px 0', opacity: hidden.has(lobe) ? 0.4 : 1, background: focused === lobe ? 'rgba(52,211,153,0.12)' : 'transparent', borderRadius: 4, padding: '2px 4px' }}>
            <input type="checkbox" checked={!hidden.has(lobe)} onChange={() => toggleLobe(lobe)} style={{ cursor: 'pointer' }} />
            <span style={{ width: 10, height: 10, borderRadius: 5, background: colorFor(lobe), display: 'inline-block' }} />
            {/* Click the name → fly into that cluster. */}
            <span style={{ color: '#e5e7eb', flex: 1, cursor: 'pointer' }} onClick={() => focusLobe(focused === lobe ? null : lobe)}>{LOBES[lobe].name}</span>
            <span style={{ color: '#6b7280' }}>{lobeCounts[lobe] ?? 0}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 11, color: '#6b7280' }}>click a lobe name → fly into that cluster · checkbox → show/hide</div>
      </aside>

      {/* VIEW (top-centre) — switch UNIVERSE (natural galaxy) · FREQUENCY (cymatics) · FORM (geometry). */}
      <div style={panel.freqBar}>
        {(['universe', 'frequency', 'form'] as ViewMode[]).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setFreqIdx(0); }}
            style={{ padding: '4px 12px', borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.14)', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace', background: mode === m ? '#38bdf8' : 'transparent', color: mode === m ? '#05070a' : '#cbd5e1', fontWeight: mode === m ? 700 : 400 }}>
            {m}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.14)', margin: '0 4px' }} />
        {mode === 'universe' && (
          <span style={{ color: '#6b7280', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
            natural galaxy · edges pull related nodes together → proximity = real relationship
          </span>
        )}
        {mode === 'frequency' && FREQS.map((f, i) => (
          <button key={f.hz} type="button" onClick={() => setFreqIdx(i)}
            style={{ padding: '4px 11px', borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontFamily: 'ui-monospace, monospace', background: freqIdx === i ? '#6ee7b7' : 'transparent', color: freqIdx === i ? '#05070a' : '#cbd5e1', fontWeight: freqIdx === i ? 700 : 400 }}>
            {f.hz}Hz
          </button>
        ))}
        {mode === 'form' && GEO_FORMS.map((f, i) => (
          <button key={f.name} type="button" onClick={() => setFreqIdx(i)}
            style={{ padding: '4px 11px', borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontFamily: 'ui-monospace, monospace', background: freqIdx === i ? '#6ee7b7' : 'transparent', color: freqIdx === i ? '#05070a' : '#cbd5e1', fontWeight: freqIdx === i ? 700 : 400 }}>
            {f.name}
          </button>
        ))}
      </div>

      {/* Controls hint (bottom-centre) — first-use orientation. */}
      <div style={panel.controls}>scroll = zoom · drag = orbit · click a node = ring menu · i = isolate · esc = clear</div>

      {/* Radial FUNCTIONS MENU — fans out around the clicked node; follows the camera. */}
      {menuNode && menuPos && (
        <div style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, zIndex: 6, pointerEvents: 'none' }}>
          {NODE_ACTIONS.map((a, i) => {
            const ang = (i / NODE_ACTIONS.length) * Math.PI * 2 - Math.PI / 2;
            const R = 66;
            const dx = Math.cos(ang) * R, dy = Math.sin(ang) * R;
            return (
              <button key={a.key} type="button" title={a.label}
                onClick={() => { a.run(menuNode); if (a.key !== 'trace') setMenuNode(null); }}
                style={{ position: 'absolute', left: dx - 27, top: dy - 27, width: 54, height: 54, borderRadius: '50%', pointerEvents: 'auto', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: 'radial-gradient(circle at 50% 40%, rgba(20,28,40,0.96), rgba(6,9,14,0.98))', border: `1px solid ${a.color}`, boxShadow: `0 0 14px ${a.color}55`, color: a.color }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{a.icon}</span>
                <span style={{ fontSize: 8, letterSpacing: 0.5, color: '#cbd5e1' }}>{a.label}</span>
              </button>
            );
          })}
          {/* centre pip on the node */}
          <div style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: 4, background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }} />
        </div>
      )}

      {/* REVERSE-ENGINEER diagram — called-by → node → calls/depends (live gitreverse slice). */}
      {reverseNode && (() => {
        const rel = neighborsOf(reverseNode.id);
        const callers = rel.filter((r) => r.dir === '←');
        const callees = rel.filter((r) => r.dir === '→');
        const col = (title: string, items: typeof rel, accent: string) => (
          <div style={{ minWidth: 150, maxWidth: 220 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: accent, marginBottom: 6 }}>{title} ({items.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}>
              {items.slice(0, 12).map(({ node, verb }, k) => (
                <div key={node.id + k} onClick={() => { setReverseNode(node); setSelected(node); }}
                  style={{ cursor: 'pointer', fontSize: 11, padding: '3px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: colorFor(nodeLobe.get(node.id) ?? 'cerebellum'), flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(node.label, 26)}</span>
                  {verb && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#6b7280' }}>{verb}</span>}
                </div>
              ))}
              {items.length === 0 && <div style={{ fontSize: 11, color: '#6b7280' }}>none</div>}
            </div>
          </div>
        );
        return (
          <div style={{ position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', zIndex: 6, background: 'rgba(8,11,16,0.96)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 20, alignItems: 'flex-start', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
            {col('CALLED BY →', callers, '#f59e0b')}
            <div style={{ minWidth: 150, textAlign: 'center', padding: '0 4px' }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#38bdf8', marginBottom: 6 }}>SYMBOL</div>
              <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600, wordBreak: 'break-word' }}>{truncate(reverseNode.label, 60)}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>{reverseNode.source} · {reverseNode.type} · deg {reverseNode.degree}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 8, cursor: 'pointer' }} onClick={() => setReverseNode(null)}>✕ close</div>
            </div>
            {col('→ CALLS / USES', callees, '#6ee7b7')}
          </div>
        );
      })()}

      {/* DOSSIER — the node's full verified record (content + code refs + relationships).
          The node stays in the galaxy; the details live here (docked right). */}
      {dossier && (
        <div style={dossierStyle.panel}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: colorFor(nodeLobe.get(dossier.node.id) ?? 'cerebellum') }} />
            <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#38bdf8' }}>DOSSIER</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280', cursor: 'pointer' }} onClick={() => setDossier(null)}>✕</span>
          </div>
          <div style={{ fontSize: 15, color: '#e5e7eb', fontWeight: 600, marginTop: 8, wordBreak: 'break-word' }}>{dossier.node.label}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{dossier.node.source} · {dossier.node.type} · degree {dossier.node.degree}</div>
          {typeof dossier.meta?.file === 'string' && (
            <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 4, wordBreak: 'break-all' }}>⌂ {dossier.meta.file as string}</div>
          )}

          {/* action bar */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" style={{ ...dossierStyle.btn, background: voice.state === 'speaking' ? 'rgba(52,211,153,0.2)' : dossierStyle.btn.background }} disabled={!dossier.content}
              onClick={() => { if (voice.state === 'speaking') voice.stop(); else if (dossier.content) voice.speak(dossier.content); }}>
              {voice.state === 'speaking' ? '⏹ Stop' : '🔊 Read aloud'}</button>
            <button type="button" style={{ ...dossierStyle.btn, background: mindmapOn ? 'rgba(56,189,248,0.2)' : dossierStyle.btn.background }}
              onClick={() => { setMindmapOn((v) => !v); setMermaidText(null); }}>🧠 Mindmap</button>
            <button type="button" style={{ ...dossierStyle.btn, background: mermaidText ? 'rgba(56,189,248,0.2)' : dossierStyle.btn.background }}
              onClick={() => { setMermaidText((v) => (v ? null : graphToMermaid(dossier.node))); setMindmapOn(false); setCopied(false); }}>⤓ Mermaid</button>
            <button type="button" style={dossierStyle.btn}
              onClick={() => { setReverseNode(dossier.node); }}>⊹ Reverse</button>
          </div>

          {/* body: content OR mindmap */}
          <div style={{ marginTop: 12, flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {dossier.loading && <div style={{ color: '#f59e0b', fontSize: 12 }}>…loading full record</div>}
            {dossier.error && <div style={{ color: '#f87171', fontSize: 12 }}>⚠ {dossier.error}</div>}
            {!dossier.loading && !dossier.error && !mindmapOn && !mermaidText && (
              <pre style={dossierStyle.content}>{dossier.content}</pre>
            )}
            {!dossier.loading && mermaidText && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, letterSpacing: 1, color: '#38bdf8' }}>MERMAID MAP</span>
                  <button type="button" style={{ ...dossierStyle.btn, fontSize: 10, padding: '3px 8px' }}
                    onClick={() => { navigator.clipboard?.writeText(mermaidText).then(() => { setCopied(true); }); }}>
                    {copied ? '✓ copied' : '⧉ copy'}
                  </button>
                  <a href="https://mermaid.live" target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#a78bfa' }}>open mermaid.live ↗</a>
                </div>
                <pre style={{ ...dossierStyle.content, fontSize: 11, background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6 }}>{mermaidText}</pre>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>paste into GitHub, Notion, or mermaid.live to render the diagram</div>
              </div>
            )}
            {!dossier.loading && mindmapOn && !mermaidText && (() => {
              const rel = neighborsOf(dossier.node.id);
              const grp = (title: string, items: typeof rel, accent: string) => (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: accent, marginBottom: 4 }}>{title}</div>
                  {items.length === 0 && <div style={{ fontSize: 11, color: '#6b7280', paddingLeft: 12 }}>none</div>}
                  {items.slice(0, 20).map(({ node, verb }, k) => (
                    <div key={node.id + k} onClick={() => { void openDossier(node); setSelected(node); }}
                      style={{ cursor: 'pointer', fontSize: 12, color: '#e5e7eb', padding: '2px 0 2px 12px', borderLeft: `2px solid ${accent}`, marginLeft: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: colorFor(nodeLobe.get(node.id) ?? 'cerebellum') }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{truncate(node.label, 32)}</span>
                      {verb && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#6b7280' }}>{verb}</span>}
                    </div>
                  ))}
                </div>
              );
              return (
                <div>
                  <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600, marginBottom: 10 }}>◉ {truncate(dossier.node.label, 40)}</div>
                  {grp('→ CALLS / USES', rel.filter((r) => r.dir === '→'), '#6ee7b7')}
                  {grp('← CALLED BY / REFERS', rel.filter((r) => r.dir === '←'), '#f59e0b')}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Matrix "enter the isolation" transition — files rain, then the node materialises. */}
      {matrixRain && <MatrixRain title={matrixRain.title} lines={matrixRain.lines} onDone={() => setMatrixRain(null)} />}

      {/* ARIAN — the human face of the brain: reacts to the conversation + speaks the
          grounded answers. You converse with her; she knows your project. */}
      <ArianAvatar
        state={voice.state}
        caption={voice.state === 'speaking' ? answer?.text : (voice.interim || undefined)}
      />

      {/* Voice orb — tap to talk. "show me AMF" · "search vault" · "status" · "read this" */}
      <VoiceOrb voice={voice} />
    </div>
  );
}

const panel: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, background: '#05070a', display: 'flex', fontFamily: 'ui-sans-serif, system-ui' },
  left: { width: 300, padding: 20, background: 'rgba(10,14,20,0.85)', overflowY: 'auto', zIndex: 2, borderRight: '1px solid rgba(255,255,255,0.06)' },
  right: { width: 220, padding: 20, background: 'rgba(10,14,20,0.85)', overflowY: 'auto', zIndex: 2, borderLeft: '1px solid rgba(255,255,255,0.06)' },
  canvas: { flex: 1, position: 'relative', minWidth: 0 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5, color: '#6b7280', margin: '14px 0 8px' },
  empty: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#05070a', gap: 8 },
  controls: { position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 4, fontSize: 11, color: 'rgba(203,213,225,0.55)', background: 'rgba(10,14,20,0.72)', padding: '6px 14px', borderRadius: 20, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' },
  freqBar: { position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 4, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(10,14,20,0.82)', padding: '6px 12px', borderRadius: 22, border: '1px solid rgba(255,255,255,0.06)' },
};

const dossierStyle: Record<string, React.CSSProperties> = {
  panel: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 7, background: 'rgba(8,11,16,0.97)', borderLeft: '1px solid rgba(56,189,248,0.25)', padding: '18px 20px 300px', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)', fontFamily: 'ui-sans-serif, system-ui' },
  btn: { fontSize: 11, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' },
  content: { fontSize: 12, lineHeight: 1.55, color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace', margin: 0 },
};
