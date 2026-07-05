'use client';
/**
 * BrainGraph — the 3D "brain" (JARVIS-style AI-WORKSHOP-OS clone).
 *
 * Renders the continuum_graph provenance graph as a force-directed 3D field:
 * nodes colored by source, sized by degree; edges are refs[] links. Left =
 * INSPECTOR (click a node → focus + read; shift-click a second → trace the
 * path). Right = FILTER (per-source toggles with counts) + TOP HUBS.
 *
 * react-force-graph-3d is WebGL/three.js → client-only, dynamically imported
 * with ssr:false. Data arrives from the server via fetchGraph() over MCP/SSE.
 */
import dynamic from 'next/dynamic';
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { GraphData, GraphNode } from './lib';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as any;

const SOURCE_COLOR: Record<string, string> = {
  docs: '#34d399',       // emerald
  git: '#60a5fa',        // blue
  mem: '#a78bfa',        // violet
  sona: '#fbbf24',       // amber
  export: '#f472b6',     // pink
  googlenews: '#22d3ee', // cyan
  concept: '#f59e0b',    // amber — the noun/entity layer
};
const colorFor = (source: string) => SOURCE_COLOR[source] ?? '#9ca3af';

interface FGNode extends GraphNode { }
interface FGLink { source: string; target: string; verb?: string; }

export function BrainGraph({ data }: { data: GraphData }) {
  const fgRef = useRef<unknown>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [pathEnds, setPathEnds] = useState<string[]>([]);

  // Explicit canvas dimensions — react-force-graph-3d measures its container
  // once at mount and, inside a flex child, often reads 0×0 and renders nothing.
  // A ResizeObserver keeps width/height correct through layout + window resize.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Adjacency (undirected) for path-tracing + fast neighbour lookups.
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
      for (const nb of adjacency.get(cur) ?? []) {
        if (!seen.has(nb)) { seen.add(nb); prev.set(nb, cur); q.push(nb); }
      }
    }
    const nodes = new Set<string>();
    const links = new Set<string>();
    if (seen.has(b!)) {
      let cur = b!;
      nodes.add(cur);
      while (cur !== a) {
        const p = prev.get(cur)!;
        nodes.add(p);
        links.add(`${p}|${cur}`);
        links.add(`${cur}|${p}`);
        cur = p;
      }
    }
    return { nodes, links };
  }, [pathEnds, adjacency]);

  // Filtered graph — fresh objects every render (react-force-graph mutates links).
  const graphData = useMemo(() => {
    const visible = data.nodes.filter((n) => !hidden.has(n.source));
    const visibleIds = new Set(visible.map((n) => n.id));
    const nodes: FGNode[] = visible.map((n) => ({ ...n }));
    const links: FGLink[] = data.edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, verb: e.verb }));
    return { nodes, links };
  }, [data.nodes, data.edges, hidden]);

  const onNodeClick = useCallback((node: FGNode, event: MouseEvent) => {
    if (event.shiftKey) {
      setPathEnds((prev) => (prev.length >= 2 ? [node.id] : [...prev, node.id]));
    } else {
      setSelected(node);
      setPathEnds([]);
    }
  }, []);

  const toggleSource = (src: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(src) ? next.delete(src) : next.add(src);
      return next;
    });

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
        <div style={panel.sectionLabel}>INSPECTOR</div>
        {selected ? (
          <div style={{ fontSize: 13, color: '#e5e7eb' }}>
            <div style={{ color: colorFor(selected.source), fontWeight: 600 }}>{selected.source} · {selected.type}</div>
            <div style={{ margin: '6px 0', lineHeight: 1.4 }}>{selected.label}</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>degree {selected.degree} · {selected.timestamp?.slice(0, 16)}</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>{selected.id}</div>
          </div>
        ) : (
          <div style={{ color: '#6b7280', fontSize: 12 }}>
            Click a node to focus it. Shift-click two nodes to trace the path between them.
          </div>
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
                onClick={() => { const n = data.nodes.find((x) => x.id === h.id) ?? null; setSelected(n); }}>
                <span style={{ color: '#fbbf24' }}>{h.degree}</span> · {h.label.slice(0, 34)}
              </div>
            ))}
          </div>
        ) : null}
      </aside>

      {/* CENTER — the 3D field */}
      <div ref={canvasRef} style={panel.canvas}>
        {dims.w > 0 && dims.h > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          graphData={graphData}
          backgroundColor="#05070a"
          nodeLabel={(n: FGNode) => `${n.label} (${n.source}, deg ${n.degree})`}
          nodeVal={(n: FGNode) => 1 + Math.sqrt(n.degree) * 2}
          nodeColor={(n: FGNode) =>
            pathEnds.length === 2
              ? (tracedPath.nodes.has(n.id) ? '#ffffff' : 'rgba(120,130,150,0.25)')
              : colorFor(n.source)
          }
          linkColor={(l: FGLink) => {
            const s = typeof l.source === 'object' ? (l.source as FGNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as FGNode).id : l.target;
            if (pathEnds.length === 2) return tracedPath.links.has(`${s}|${t}`) ? '#34d399' : 'rgba(120,130,150,0.15)';
            return l.verb ? 'rgba(245,158,11,0.55)' : 'rgba(80,120,110,0.28)'; // verbs = amber, meaningful
          }}
          linkWidth={(l: FGLink) => {
            const s = typeof l.source === 'object' ? (l.source as FGNode).id : l.source;
            const t = typeof l.target === 'object' ? (l.target as FGNode).id : l.target;
            if (pathEnds.length === 2 && tracedPath.links.has(`${s}|${t}`)) return 2;
            return l.verb ? 1.5 : 0.5; // typed edges stand out
          }}
          linkLabel={(l: FGLink) => (l.verb ? `<b style="color:#f59e0b">${l.verb}</b>` : '')}
          linkDirectionalArrowLength={(l: FGLink) => (l.verb ? 3 : 0)}
          linkDirectionalArrowRelPos={1}
          onNodeClick={onNodeClick}
        />
        )}
      </div>

      {/* RIGHT — filter */}
      <aside style={panel.right}>
        <div style={panel.sectionLabel}>FILTER</div>
        {stats && Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
          <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0', cursor: 'pointer', opacity: hidden.has(src) ? 0.4 : 1 }}>
            <input type="checkbox" checked={!hidden.has(src)} onChange={() => toggleSource(src)} />
            <span style={{ width: 10, height: 10, borderRadius: 5, background: colorFor(src), display: 'inline-block' }} />
            <span style={{ color: '#e5e7eb', flex: 1 }}>{src}</span>
            <span style={{ color: '#6b7280' }}>{count}</span>
          </label>
        ))}
      </aside>
    </div>
  );
}

const panel: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, background: '#05070a', display: 'flex', fontFamily: 'ui-sans-serif, system-ui' },
  left: { width: 300, padding: 20, background: 'rgba(10,14,20,0.85)', overflowY: 'auto', zIndex: 2, borderRight: '1px solid rgba(255,255,255,0.06)' },
  right: { width: 220, padding: 20, background: 'rgba(10,14,20,0.85)', overflowY: 'auto', zIndex: 2, borderLeft: '1px solid rgba(255,255,255,0.06)' },
  canvas: { flex: 1, position: 'relative' },
  sectionLabel: { fontSize: 11, letterSpacing: 1.5, color: '#6b7280', margin: '14px 0 8px' },
  empty: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#05070a', gap: 8 },
};
