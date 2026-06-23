'use client';

/**
 * AMF Studio — Layer-3 content engine MVP.
 *
 * Topic + format + angle -> streamed structured content (Addictive Storytelling).
 * Brand CI: Inkwell ground, Au Lait ink, Creme Brulee accent.
 */
import { useRef, useState } from 'react';

const INK = '#232b2d';
const PANEL = '#283133';
const HAIRLINE = '#36423f';
const INK_TEXT = '#f6f3ec';
const BODY = '#c8c3b6';
const MUTED = '#9aa09a';
const CREME = '#c89a72';
const CREME_BRIGHT = '#e0b387';

const FORMATS = [
  { id: 'video-script', label: 'Video script', hint: '45–90s short-form' },
  { id: 'social-thread', label: 'Social thread', hint: '5–7 posts' },
  { id: 'blog-outline', label: 'Blog outline', hint: 'skimmable structure' },
] as const;

type FormatId = (typeof FORMATS)[number]['id'];

export default function Studio() {
  const [topic, setTopic] = useState('');
  const [angle, setAngle] = useState('');
  const [format, setFormat] = useState<FormatId>('video-script');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    setOutput('');
    setCopied(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, format, angle }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text().catch(() => res.statusText)) || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput((o) => o + dec.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function copyOut() {
    navigator.clipboard.writeText(output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '2.5rem 2rem 5rem' }}>
      <header style={{ borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '1.25rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '1.6rem', letterSpacing: '-0.02em' }}>AMF Studio</h1>
          <span style={{ color: CREME, fontSize: '0.85rem', fontFamily: 'ui-monospace, monospace' }}>
            Autonomous Media Factory · Layer 3
          </span>
        </div>
        <p style={{ margin: '0.5rem 0 0', color: MUTED, fontSize: '0.95rem', maxWidth: '60ch' }}>
          A topic in, a structured piece out. Built on the Addictive Storytelling
          structure (Stakes, Big Question, Head Fake, Rehook). The engine does not
          invent statistics; anything it cannot stand behind is left as a{' '}
          <code style={{ color: BODY }}>[STAT: …]</code> placeholder for you to verify.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Controls */}
        <form onSubmit={generate} style={{ display: 'grid', gap: '1.25rem' }}>
          <label style={{ display: 'grid', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', color: BODY }}>Topic</span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Why most AI memory tools quietly lose your context"
              rows={3}
              style={fieldStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', color: BODY }}>Angle / audience <span style={{ color: MUTED }}>(optional)</span></span>
            <input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              placeholder="e.g. solo founders shipping with Claude Code"
              style={fieldStyle}
            />
          </label>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: BODY }}>Format</span>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {FORMATS.map((f) => {
                const on = format === f.id;
                return (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    style={{
                      textAlign: 'left',
                      padding: '0.7rem 0.9rem',
                      borderRadius: 8,
                      border: `1px solid ${on ? CREME : HAIRLINE}`,
                      background: on ? 'rgba(200,154,114,0.10)' : PANEL,
                      color: INK_TEXT,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: on ? 600 : 400 }}>{f.label}</span>
                    <span style={{ color: MUTED, fontSize: '0.78rem' }}>{f.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !topic.trim()}
            style={{
              padding: '0.8rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: busy || !topic.trim() ? '#3a4446' : CREME,
              color: busy || !topic.trim() ? MUTED : '#1c2224',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: busy || !topic.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Generating…' : 'Generate content'}
          </button>
        </form>

        {/* Output */}
        <section
          style={{
            background: PANEL,
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 10,
            minHeight: '50vh',
            padding: '1.5rem 1.75rem',
            position: 'relative',
          }}
        >
          {output && (
            <button
              onClick={copyOut}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                padding: '0.35rem 0.7rem',
                borderRadius: 6,
                border: `1px solid ${HAIRLINE}`,
                background: INK,
                color: copied ? '#7ddf64' : BODY,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}

          {error && (
            <div style={{ color: '#ff8585', background: '#3a1010', padding: '0.75rem 1rem', borderRadius: 6, fontSize: '0.9rem', marginBottom: '1rem' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {!output && !busy && !error && (
            <div style={{ color: MUTED, paddingTop: '15vh', textAlign: 'center' }}>
              <p style={{ margin: 0 }}>Your generated {FORMATS.find((f) => f.id === format)?.label.toLowerCase()} appears here.</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>Enter a topic and press Generate.</p>
            </div>
          )}

          {(output || busy) && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                fontSize: '0.98rem',
                lineHeight: 1.6,
                color: INK_TEXT,
                margin: 0,
              }}
            >
              {output}
              {busy && <span style={{ color: CREME_BRIGHT }}>▍</span>}
            </pre>
          )}
        </section>
      </div>
    </main>
  );
}

const fieldStyle: React.CSSProperties = {
  background: '#2a3335',
  color: '#f6f3ec',
  border: '1px solid #36423f',
  borderRadius: 8,
  padding: '0.7rem 0.9rem',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  outline: 'none',
  resize: 'vertical',
};
