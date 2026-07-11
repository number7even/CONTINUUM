'use client';
/**
 * ArianAvatar — the human face of the brain.
 *
 * ARIAN (the VoiceCosmos Voice-OS presenter) made present inside CONTINUUM: she
 * reacts to the conversation state and speaks the grounded /api/ask answers, so
 * you're not typing at a graph — you're *conversing* with a presence that knows
 * your project. This markets the ARIAN Voice Layer by making it the interface.
 *
 * Delivery (per CONTENT_ENGINE_AVATAR_TECH_HANDOFF §MAILING_MODE): a pre-rendered
 * idle/talking clip played back + the existing voice layer for lines. Drop the
 * clip at NEXT_PUBLIC_ARIAN_VIDEO_URL (default /arian-idle.mp4 in public/). If no
 * clip is present it degrades to a tasteful animated portrait — never broken.
 * Real-time lip-sync (HeyGen/Tavus/Cartesia) is the upgrade path, not this MVP.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { useEffect, useRef, useState } from 'react';
import type { VoiceState } from './voice';

const STATE: Record<VoiceState, { ring: string; label: string; glow: string }> = {
  idle: { ring: '#3a4557', label: 'ARIAN · ready', glow: 'rgba(80,90,110,0.25)' },
  listening: { ring: '#22d3ee', label: 'ARIAN · listening', glow: 'rgba(34,211,238,0.5)' },
  thinking: { ring: '#f59e0b', label: 'ARIAN · thinking', glow: 'rgba(245,158,11,0.55)' },
  speaking: { ring: '#34d399', label: 'ARIAN · speaking', glow: 'rgba(52,211,153,0.55)' },
};

export function ArianAvatar({ state, caption }: { state: VoiceState; caption?: string }) {
  const s = STATE[state];
  const active = state !== 'idle';
  const videoUrl = process.env.NEXT_PUBLIC_ARIAN_VIDEO_URL ?? '/arian-idle.mp4';
  const [hasVideo, setHasVideo] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Play the loop while she's active (speaking/listening/thinking); rest when idle.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (active) v.play().catch(() => {});
    else try { v.pause(); } catch { /* noop */ }
  }, [active, hasVideo]);

  return (
    <div style={wrap}>
      {caption && <div style={captionStyle}>{caption}</div>}
      <div
        style={{
          ...frame,
          borderColor: s.ring,
          boxShadow: `0 0 ${active ? 34 : 14}px ${s.glow}, inset 0 0 20px ${s.glow}`,
          animation: state === 'speaking' ? 'arianpulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {hasVideo ? (
          <video
            ref={videoRef}
            src={videoUrl}
            loop
            muted
            playsInline
            onError={() => setHasVideo(false)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          // No clip → a live, state-reactive canvas presence (0-egress, no asset needed).
          <ReactivePresence state={state} color={s.ring} />
        )}
      </div>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: 1.5, color: s.ring, marginTop: 8, textAlign: 'center' }}>
        {s.label}
      </div>
      <style>{`@keyframes arianpulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }`}</style>
    </div>
  );
}

// Bottom-right: ARIAN sits directly above the ask box so together they ARE the
// chat window — you converse with her face + voice, not a text field at a graph.
const wrap: React.CSSProperties = { position: 'fixed', right: 22, bottom: 150, zIndex: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 180 };
const frame: React.CSSProperties = { width: 150, height: 190, borderRadius: 18, overflow: 'hidden', border: '2px solid', background: 'radial-gradient(circle at 50% 35%, rgba(20,28,40,0.9), rgba(6,9,14,0.96))', transition: 'box-shadow 220ms', display: 'flex', alignItems: 'center', justifyContent: 'center' };
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * ReactivePresence — ARIAN made present with NO video asset (Avatar Gap #1 closed).
 * A 0-egress <canvas> "face" that reacts to voice state:
 *   idle → a slow breathing ring · listening → expanding ripples ·
 *   thinking → orbiting particles · speaking → a live circular waveform.
 */
function ReactivePresence({ state, color }: { state: VoiceState; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const { r, g, b } = hexToRgb(color);
    const c = (a: number) => `rgba(${r},${g},${b},${a})`;
    let raf = 0, start = 0, running = true;
    const frame = (now: number) => {
      if (!running) return;
      if (!start) start = now;
      const t = (now - start) / 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight, cx = w / 2, cy = h / 2;
      const base = Math.min(w, h) * 0.2;
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 2.4);
      grad.addColorStop(0, c(0.5)); grad.addColorStop(1, c(0));
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, base * 2.4, 0, Math.PI * 2); ctx.fill();
      if (state === 'idle') {
        ctx.strokeStyle = c(0.4); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, base * (1 + 0.05 * Math.sin(t * 1.6)), 0, Math.PI * 2); ctx.stroke();
      } else if (state === 'listening') {
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.6 + i / 3) % 1;
          ctx.strokeStyle = c((1 - p) * 0.6); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx, cy, base * (0.6 + p * 1.7), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = c(0.75); ctx.beginPath(); ctx.arc(cx, cy, base * 0.5, 0, Math.PI * 2); ctx.fill();
      } else if (state === 'thinking') {
        const n = 6;
        for (let i = 0; i < n; i++) {
          const a = t * 2 + (i / n) * Math.PI * 2, rr = base * (1.15 + 0.15 * Math.sin(t * 3 + i));
          ctx.fillStyle = c(0.85 - (i / n) * 0.45);
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = c(0.2); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, base, 0, Math.PI * 2); ctx.stroke();
      } else {
        const pts = 80;
        ctx.strokeStyle = c(0.9); ctx.lineWidth = 2.5; ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const amp = 0.16 * (Math.sin(a * 6 + t * 9) * 0.5 + Math.sin(a * 3 - t * 6) * 0.5);
          const rr = base * (1 + amp), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = c(0.45); ctx.beginPath(); ctx.arc(cx, cy, base * 0.55, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [state, color]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
const captionStyle: React.CSSProperties = { marginBottom: 10, maxWidth: 240, fontSize: 11.5, lineHeight: 1.45, color: '#e5e7eb', background: 'rgba(8,11,16,0.92)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 10, padding: '9px 12px', maxHeight: 160, overflowY: 'auto' };
