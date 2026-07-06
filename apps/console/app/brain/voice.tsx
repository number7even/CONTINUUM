'use client';
/**
 * voice.tsx — the JARVIS-style voice layer for the brain.
 *
 * KEY-FREE first version: uses the browser's native Web Speech API —
 * SpeechRecognition (listen) + speechSynthesis (speak). No API keys, works in
 * Chrome today. The VoiceCosmos realtime stack (OpenAI/Grok WebRTC) can swap in
 * later for latency/quality; this proves the loop and the graph interactions.
 *
 * useVoice() owns speech I/O + state; the consumer (BrainGraph) owns command
 * semantics (it watches `lastFinal` and routes it to graph actions).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

export interface Voice {
  supported: boolean;
  listening: boolean;
  state: VoiceState;
  /** Last FINAL transcript — bump `nonce` distinguishes repeats. */
  lastFinal: { text: string; nonce: number };
  /** Live interim transcript for the orb caption. */
  interim: string;
  toggle: () => void;
  speak: (text: string) => void;
  setThinking: (on: boolean) => void;
}

export function useVoice(): Voice {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [lastFinal, setLastFinal] = useState<{ text: string; nonce: number }>({ text: '', nonce: 0 });
  const recRef = useRef<AnyRec>(null);
  const listeningRef = useRef(false);
  const nonceRef = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    setSupported(true);
    const rec: AnyRec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const text = String(r[0].transcript || '').trim();
          if (text) { nonceRef.current += 1; setLastFinal({ text, nonce: nonceRef.current }); }
          setInterim('');
        } else {
          interimText += r[0].transcript;
        }
      }
      if (interimText) setInterim(interimText);
    };
    rec.onend = () => { if (listeningRef.current) { try { rec.start(); } catch { /* already started */ } } };
    rec.onerror = () => { /* transient — onend will restart if still listening */ };
    recRef.current = rec;
    return () => { try { rec.stop(); } catch { /* noop */ } recRef.current = null; };
  }, []);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (listeningRef.current) {
      listeningRef.current = false;
      setListening(false);
      setState('idle');
      setInterim('');
      try { rec.stop(); } catch { /* noop */ }
    } else {
      listeningRef.current = true;
      setListening(true);
      setState('listening');
      try { rec.start(); } catch { /* already started */ }
    }
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const backToRest = useCallback(() => setState(listeningRef.current ? 'listening' : 'idle'), []);

  const speakBrowser = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { backToRest(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1.0;
      u.onstart = () => setState('speaking');
      u.onend = backToRest;
      window.speechSynthesis.speak(u);
    } catch { backToRest(); }
  }, [backToRest]);

  const speak = useCallback(async (text: string) => {
    setState('speaking');
    // 1) OUR voice — Supertonic via same-origin proxy. 503 when the server's off.
    try {
      const r = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const blob = await r.blob();
        try { audioRef.current?.pause(); } catch { /* noop */ }
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = backToRest;
        audio.onerror = () => speakBrowser(text);
        await audio.play();
        return;
      }
    } catch { /* fall through to browser voice */ }
    // 2) fallback — the browser's built-in voice (key-free, always available).
    speakBrowser(text);
  }, [backToRest, speakBrowser]);

  const setThinking = useCallback((on: boolean) => {
    setState(on ? 'thinking' : (listeningRef.current ? 'listening' : 'idle'));
  }, []);

  return { supported, listening, state, lastFinal, interim, toggle, speak, setThinking };
}

/* ── the orb ─────────────────────────────────────────────────────────────── */

const STATE_STYLE: Record<VoiceState, { ring: string; label: string; glow: string }> = {
  idle: { ring: '#3a4557', label: 'TAP TO SPEAK', glow: 'rgba(80,90,110,0.25)' },
  listening: { ring: '#22d3ee', label: 'LISTENING', glow: 'rgba(34,211,238,0.45)' },
  thinking: { ring: '#f59e0b', label: 'THINKING', glow: 'rgba(245,158,11,0.5)' },
  speaking: { ring: '#34d399', label: 'SPEAKING', glow: 'rgba(52,211,153,0.5)' },
};

export function VoiceOrb({ voice }: { voice: Voice }) {
  const s = STATE_STYLE[voice.state];
  const active = voice.state !== 'idle';
  if (!voice.supported) {
    return (
      <div style={orb.wrap}>
        <div style={{ ...orb.caption, color: '#f87171' }}>voice unsupported in this browser (use Chrome)</div>
      </div>
    );
  }
  return (
    <div style={orb.wrap}>
      {(voice.interim || active) && (
        <div style={orb.caption}>{voice.interim || s.label}</div>
      )}
      <button
        type="button"
        onClick={voice.toggle}
        aria-label="toggle voice"
        style={{
          ...orb.button,
          borderColor: s.ring,
          boxShadow: `0 0 ${active ? 34 : 14}px ${s.glow}, inset 0 0 20px ${s.glow}`,
          animation: active ? 'brainpulse 1.6s ease-in-out infinite' : 'none',
        }}
      >
        <span style={{ ...orb.dot, background: s.ring }} />
      </button>
      <style>{`@keyframes brainpulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>
    </div>
  );
}

const orb: Record<string, React.CSSProperties> = {
  wrap: { position: 'fixed', right: 28, bottom: 28, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  caption: { fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 1.5, color: '#cbd5e1', background: 'rgba(10,14,20,0.85)', padding: '4px 10px', borderRadius: 12, maxWidth: 320, textAlign: 'center' },
  button: { width: 64, height: 64, borderRadius: '50%', background: 'radial-gradient(circle at 50% 40%, rgba(20,28,40,0.9), rgba(6,9,14,0.95))', border: '2px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'box-shadow 200ms' },
  dot: { width: 14, height: 14, borderRadius: '50%', display: 'block' },
};
