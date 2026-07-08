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
          // Graceful fallback — a presence, not a broken tag.
          <div style={fallback}>
            <div style={{ fontSize: 40, opacity: 0.85 }}>◕‿◕</div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: '#cbd5e1', marginTop: 4 }}>ARIAN</div>
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>drop a clip → NEXT_PUBLIC_ARIAN_VIDEO_URL</div>
          </div>
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
const fallback: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 10 };
const captionStyle: React.CSSProperties = { marginBottom: 10, maxWidth: 240, fontSize: 11.5, lineHeight: 1.45, color: '#e5e7eb', background: 'rgba(8,11,16,0.92)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 10, padding: '9px 12px', maxHeight: 160, overflowY: 'auto' };
