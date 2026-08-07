'use client';
/**
 * MermaidDiagram — render a mermaid definition to SVG, draggable + zoomable.
 *
 * The dossier's Mermaid + Mindmap views produce a mermaid graph; this renders it
 * as an actual diagram (not raw code) that you can drag to pan and wheel to zoom.
 * mermaid is dynamically imported (client-only, heavy) so it never touches SSR.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { useEffect, useRef, useState } from 'react';

export function MermaidDiagram({ code, height = 360 }: { code: string; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Render the diagram whenever the code changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'ui-sans-serif, system-ui' });
        const id = 'mmd-' + Math.floor(Math.random() * 1e9).toString(36);
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = svg;
          setError(null);
          setView({ x: 0, y: 0, s: 1 });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  // Non-passive wheel so we can preventDefault (zoom, not scroll the sidebar).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, s: Math.min(4, Math.max(0.3, v.s * (e.deltaY < 0 ? 1.1 : 0.9))) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onDown = (e: React.MouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y }; };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const d = drag.current;
    setView((v) => ({ ...v, x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  };
  const onUp = () => { drag.current = null; };

  return (
    <div
      ref={wrapRef}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      style={{ position: 'relative', height, overflow: 'hidden', background: 'rgba(255,255,255,0.02)', borderRadius: 8, cursor: drag.current ? 'grabbing' : 'grab', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {error ? (
        <div style={{ padding: 12, color: '#f87171', fontSize: 11, whiteSpace: 'pre-wrap' }}>diagram error: {error}</div>
      ) : (
        <div
          ref={hostRef}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: '0 0', transition: drag.current ? 'none' : 'transform 80ms', padding: 10 }}
        />
      )}
      <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 9, color: '#6b7280', pointerEvents: 'none' }}>drag = pan · wheel = zoom</div>
      {!error && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setView({ x: 0, y: 0, s: 1 }); }}
          style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 9, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#cbd5e1', cursor: 'pointer' }}
        >
          reset
        </button>
      )}
    </div>
  );
}
