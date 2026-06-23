'use client';

/**
 * L4 Audio affordance — record or upload a human voice recording and submit it
 * to the Auphonic enhancement pipeline (/api/audio/submit).
 *
 * Front-end ready ahead of the backend secret gates (P6): if AUPHONIC_API_KEY
 * is unset, the submit returns 503 and we surface the exact message — no crash,
 * no fake success. Human-in-the-loop recording per the locked voice decision.
 *
 * Brand CI: Inkwell ground, Au Lait ink, Creme Brulee accent.
 */
import { useRef, useState } from 'react';

const PANEL = '#283133';
const PANEL2 = '#2a3335';
const HAIR = '#36423f';
const TEXT = '#f6f3ec';
const BODY = '#c8c3b6';
const MUTED = '#9aa09a';
const CREME = '#c89a72';
const GREEN = '#7ddf64';
const AMBER = '#ffb454';
const RED = '#ff8585';

type Status = 'idle' | 'recording' | 'ready' | 'submitting' | 'submitted' | 'error';

export default function L4Audio() {
  const [status, setStatus] = useState<Status>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [filename, setFilename] = useState<string>('recording.webm');
  const [result, setResult] = useState<{ jobId: string; auphonicUuid: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setFilename('recording.webm');
        setStatus('ready');
        stream.getTracks().forEach((t) => t.stop());
      };
      recRef.current = rec;
      rec.start();
      setStatus('recording');
    } catch (e) {
      setError(`Microphone unavailable: ${e instanceof Error ? e.message : String(e)}. Upload a file instead.`);
      setStatus('idle');
    }
  }

  function stopRecording() {
    recRef.current?.stop();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioBlob(f);
    setAudioUrl(URL.createObjectURL(f));
    setFilename(f.name);
    setStatus('ready');
    setError(null);
  }

  async function submit() {
    if (!audioBlob) return;
    setStatus('submitting');
    setError(null);
    try {
      const form = new FormData();
      form.append('audio', audioBlob, filename);
      form.append('jobId', `job_${Date.now().toString(36)}`);
      const res = await fetch('/api/audio/submit', { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(res.status === 503 ? msg : `HTTP ${res.status}: ${msg}`);
      }
      const j = await res.json();
      setResult({ jobId: j.jobId, auphonicUuid: j.auphonicUuid });
      setStatus('submitted');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  function reset() {
    setStatus('idle');
    setAudioUrl(null);
    setAudioBlob(null);
    setResult(null);
    setError(null);
  }

  return (
    <div style={{ background: PANEL, border: `1px solid ${HAIR}`, borderRadius: 11, padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>L4 · Audio Synthesis</h3>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem', color: CREME }}>human voice → Auphonic</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: GREEN }}>● real route wired</span>
      </div>
      <p style={{ margin: '0 0 1rem', fontSize: '0.84rem', color: MUTED }}>
        Record your voiceover (reading the L3 script) or upload a take. It is sent to Auphonic for
        studio enhancement + word-timestamp extraction. No AI voice — human voice protects monetisation.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'recording' ? (
          <button onClick={stopRecording} style={btn(RED)}>■ Stop recording</button>
        ) : (
          <button onClick={startRecording} disabled={status === 'submitting'} style={btn(CREME)}>● Record</button>
        )}
        <label style={{ ...btn(PANEL2), color: BODY, border: `1px solid ${HAIR}`, cursor: 'pointer' }}>
          Upload file
          <input type="file" accept="audio/*,video/quicktime,.m4a,.wav,.mp3,.mov" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {status === 'recording' && <span style={{ color: RED, fontSize: '0.85rem' }}>● recording…</span>}
      </div>

      {audioUrl && (
        <div style={{ marginTop: '1rem' }}>
          <audio src={audioUrl} controls style={{ width: '100%', maxWidth: 460 }} />
          <div style={{ fontSize: '0.74rem', color: MUTED, marginTop: '0.3rem' }}>{filename}</div>
        </div>
      )}

      {status === 'ready' && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
          <button onClick={submit} style={btn(CREME)}>Send to Auphonic →</button>
          <button onClick={reset} style={{ ...btn(PANEL2), color: BODY, border: `1px solid ${HAIR}` }}>Discard</button>
        </div>
      )}

      {status === 'submitting' && <div style={{ marginTop: '1rem', color: AMBER, fontSize: '0.85rem' }}>● submitting to Auphonic…</div>}

      {status === 'submitted' && result && (
        <div style={{ marginTop: '1rem', background: 'rgba(125,223,100,0.08)', border: `1px solid ${GREEN}55`, borderRadius: 8, padding: '0.8rem 1rem', fontSize: '0.85rem', color: BODY }}>
          <strong style={{ color: GREEN }}>Enhancing.</strong> job <code>{result.jobId}</code> · Auphonic <code>{result.auphonicUuid.slice(0, 8)}</code>. The webhook will return the enhanced audio + timestamps.{' '}
          <button onClick={reset} style={{ background: 'none', border: 'none', color: CREME, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>new take</button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '1rem', background: '#3a1010', border: `1px solid ${RED}55`, borderRadius: 8, padding: '0.8rem 1rem', fontSize: '0.85rem', color: RED }}>
          {error.includes('AUPHONIC_API_KEY') ? (
            <><strong>Backend gate:</strong> {error} The UI is ready; it produces enhanced audio the moment the key is injected.</>
          ) : (
            <><strong>Error:</strong> {error}</>
          )}
        </div>
      )}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return {
    padding: '0.55rem 1.05rem',
    borderRadius: 7,
    border: 'none',
    background: bg,
    color: bg === CREME || bg === RED ? '#1c2224' : TEXT,
    fontWeight: 600,
    fontSize: '0.88rem',
    cursor: 'pointer',
  };
}
