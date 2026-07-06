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
import { useMemo, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import type { GraphData, GraphNode } from './lib';
import { useVoice, VoiceOrb } from './voice';

// ── Lobe clustering (technique adapted from seo-os) ──────────────────────────
// Nodes aren't force-simulated into a cloud; each is DETERMINISTICALLY placed in
// a brain "lobe" region by domain, so same-domain nodes cluster together. The
// clustering IS the lobe assignment.
type LobeKey = 'frontal' | 'parietal' | 'temporal' | 'occipital' | 'cerebellum';
const LOBES: Record<LobeKey, { name: string; color: string }> = {
  frontal: { name: 'AMF / engine', color: '#D4537E' },        // pink
  parietal: { name: 'deploy / ops', color: '#1D9E75' },       // green
  temporal: { name: 'sprints / process', color: '#BA7517' },  // amber
  occipital: { name: 'concepts', color: '#7F77DD' },          // violet
  cerebellum: { name: 'vision / architecture', color: '#378ADD' }, // blue
};
const colorFor = (lobe: LobeKey) => LOBES[lobe].color;

/** Map one of our nodes to a lobe by source + topic keywords in its label. */
function lobeForNode(n: GraphNode): LobeKey {
  if (n.source === 'concept') return 'occipital';
  const t = (n.label || '').toLowerCase();
  if (/amf|engine|media|content|xenos|vault|produce/.test(t)) return 'frontal';
  if (/deploy|self-host|fly|docker|hybrid|storage|http|sse/.test(t)) return 'parietal';
  if (/sprint|w2|kaizen|status|ledger|handover|partner/.test(t)) return 'temporal';
  if (/vision|architect|unified|nine|roadmap|journey|manifest/.test(t)) return 'cerebellum';
  return 'parietal';
}

/** Stable hash of a string → [0,1). */
function hash(s: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

// Each lobe is its OWN region in space (a pentagon of cluster centers), so the
// five clusters read as distinct lobes you can isolate + fly into — not one
// overlapping cloud. Nodes scatter deterministically around their lobe center.
const LOBE_CENTER: Record<LobeKey, [number, number, number]> = {
  frontal: [190, 40, 20],
  parietal: [-190, 40, -20],
  temporal: [100, -150, 160],
  occipital: [-100, -120, -160],
  cerebellum: [10, 180, -40],
};
const LOBE_SPREAD = 62;
function positionForLobe(id: string, lobe: LobeKey): [number, number, number] {
  const [cx, cy, cz] = LOBE_CENTER[lobe];
  return [
    cx + (hash(id, 2) * 2 - 1) * LOBE_SPREAD,
    cy + (hash(id, 3) * 2 - 1) * LOBE_SPREAD,
    cz + (hash(id, 4) * 2 - 1) * LOBE_SPREAD,
  ];
}

interface FGNode extends GraphNode { __lobe?: LobeKey; fx?: number; fy?: number; fz?: number; }
interface FGLink { source: string | FGNode; target: string | FGNode; verb?: string; }
const endId = (e: string | FGNode) => (typeof e === 'object' ? e.id : e);
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);

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
  const highlightRef = useRef<Set<string> | null>(null);

  // Fly the camera to frame just one lobe's nodes (click a cluster → drill in).
  const focusLobe = (lobe: LobeKey | null) => {
    setFocused(lobe);
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
        setSelected(hit);
        const lb = nodeLobe.get(hit.id) ?? null;
        if (lb) focusLobe(lb);
        voice.speak(`Found ${truncate(hit.label, 60)} in the ${lb ? LOBES[lb].name : 'graph'}.`);
      } else {
        voice.speak(`Nothing matching ${term}.`);
      }
      return;
    }
    voice.setThinking(false); // unrecognized — no reply, return to listening
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
  }, [search, selected, depth, adjacency, data.nodes]);

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
  const graphData = useMemo(() => {
    const visible = data.nodes.filter((n) => !hidden.has(nodeLobe.get(n.id) ?? 'parietal'));
    const visibleIds = new Set(visible.map((n) => n.id));
    return {
      nodes: visible.map((n) => {
        const lobe = nodeLobe.get(n.id) ?? 'parietal';
        const [fx, fy, fz] = positionForLobe(n.id, lobe);
        return { ...n, __lobe: lobe, fx, fy, fz } as FGNode;
      }),
      links: data.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)).map((e) => ({ source: e.source, target: e.target, verb: e.verb })) as FGLink[],
    };
  }, [data.nodes, data.edges, hidden, nodeLobe]);

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
          else { setSelected(node); setPathEnds([]); }
        })
        // Frame the whole graph once the force layout settles → the "brain" snaps
        // into view instead of drifting off-centre.
        .cooldownTicks(120)
        .onEngineStop(() => { try { graphRef.current?.zoomToFit(600, 60); } catch { /* noop */ } });
      graphRef.current = g;
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
    if (selected) {
      const lobe = nodeLobe.get(selected.id) ?? 'parietal';
      const [x, y, z] = positionForLobe(selected.id, lobe);
      const d = Math.hypot(x, y, z) || 1;
      const k = (d + 120) / d;
      try { g.cameraPosition({ x: x * k, y: y * k, z: z * k }, { x, y, z }, 800); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted, pathEnds, tracedPath, selected, ready]);

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
              <span style={{ cursor: 'pointer', color: '#9ca3af', marginLeft: 6 }} onClick={() => setSelected(null)}>✕ clear</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{highlighted ? `${highlighted.size} node(s) highlighted` : ''}</div>
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
                onClick={() => setSelected(data.nodes.find((x) => x.id === h.id) ?? null)}>
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
};
