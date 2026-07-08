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
  /** Last recognition error (mic denied, no-speech, etc.), surfaced to the UI. */
  error: string | null;
  toggle: () => void;
  speak: (text: string) => void;
  /** Stop any in-progress speech (Supertonic audio + browser TTS). */
  stop: () => void;
  setThinking: (on: boolean) => void;
  /** Route a TYPED command through the same pipeline as a spoken one. */
  submitText: (text: string) => void;
}

export function useVoice(): Voice {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastFinal, setLastFinal] = useState<{ text: string; nonce: number }>({ text: '', nonce: 0 });
  const recRef = useRef<AnyRec>(null);
  const listeningRef = useRef(false);
  const nonceRef = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Pick the best available system voice for ARIAN (avoid the default robot).
  // Prefer natural/premium/neural, then known-good female names, then Google,
  // then any en-US. Voices load async → also listen for voiceschanged.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const en = voices.filter((v) => /^en/i.test(v.lang));
      const pool = en.length ? en : voices;
      const score = (v: SpeechSynthesisVoice): number => {
        const n = v.name.toLowerCase();
        let s = 0;
        if (/natural|premium|enhanced|neural/.test(n)) s += 100;
        if (/samantha|ava|allison|serena|zoe|karen|susan|moira|tessa|nicky|joanna|female/.test(n)) s += 50;
        if (/google/.test(n)) s += 30;
        if (/en[-_]us/i.test(v.lang)) s += 10;
        if (v.localService) s += 5;
        return s;
      };
      voiceRef.current = pool.slice().sort((a, b) => score(b) - score(a))[0] ?? null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; } catch { /* noop */ } };
  }, []);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const err = String(e?.error || 'error');
      if (err === 'no-speech' || err === 'aborted') return; // transient
      setError(err === 'not-allowed' || err === 'service-not-allowed'
        ? 'microphone blocked — click the address-bar lock and allow it'
        : `mic error: ${err}`);
      listeningRef.current = false; setListening(false); setState('idle');
    };
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
      if (voiceRef.current) u.voice = voiceRef.current;   // the chosen non-robot voice
      u.rate = 0.98; u.pitch = 1.06;                       // slightly warmer, less flat
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

  const stop = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    try { audioRef.current?.pause(); } catch { /* noop */ }
    audioRef.current = null;
    setState(listeningRef.current ? 'listening' : 'idle');
  }, []);

  const setThinking = useCallback((on: boolean) => {
    setState(on ? 'thinking' : (listeningRef.current ? 'listening' : 'idle'));
  }, []);

  // Route a TYPED command through the same pipeline as a spoken one.
  const submitText = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    nonceRef.current += 1;
    setLastFinal({ text: t, nonce: nonceRef.current });
  }, []);

  return { supported, listening, state, lastFinal, interim, error, toggle, speak, stop, setThinking, submitText };
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
  const [text, setText] = useState('');
  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); voice.submitText(text); setText(''); };
  return (
    <div style={orb.wrap}>
      {voice.error && <div style={{ ...orb.caption, color: '#f87171' }}>{voice.error}</div>}
      {(voice.interim || active) && <div style={orb.caption}>{voice.interim || s.label}</div>}
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='ask, or "show me X"…'
          style={orb.input}
        />
        {voice.supported && (
          <button
            type="button"
            onClick={voice.toggle}
            aria-label="toggle voice"
            style={{
              ...orb.button,
              borderColor: s.ring,
              boxShadow: `0 0 ${active ? 30 : 12}px ${s.glow}, inset 0 0 16px ${s.glow}`,
              animation: active ? 'brainpulse 1.6s ease-in-out infinite' : 'none',
            }}
          >
            <span style={{ ...orb.dot, background: s.ring }} />
          </button>
        )}
      </form>
      <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', maxWidth: 300 }}>
        {voice.supported ? 'type · or tap 🎙 to speak · "show me X" · "status"' : 'type a command · voice mic needs Chrome'}
      </div>
      <style>{`@keyframes brainpulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>
    </div>
  );
}

const orb: Record<string, React.CSSProperties> = {
  wrap: { position: 'fixed', right: 28, bottom: 28, zIndex: 9, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  caption: { fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: 1.5, color: '#cbd5e1', background: 'rgba(10,14,20,0.85)', padding: '4px 10px', borderRadius: 12, maxWidth: 320, textAlign: 'center' },
  button: { width: 56, height: 56, borderRadius: '50%', background: 'radial-gradient(circle at 50% 40%, rgba(20,28,40,0.9), rgba(6,9,14,0.95))', border: '2px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'box-shadow 200ms', flexShrink: 0 },
  dot: { width: 13, height: 13, borderRadius: '50%', display: 'block' },
  input: { width: 240, background: 'rgba(10,14,20,0.9)', border: '1px solid rgba(255,255,255,0.14)', color: '#e5e7eb', fontSize: 13, padding: '9px 12px', borderRadius: 20, outline: 'none' },
};
