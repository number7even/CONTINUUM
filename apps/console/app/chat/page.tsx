'use client';

/**
 * /chat — Continuum Chat (V1 AaaS demo surface).
 *
 * Vanilla React + manual SSE parser. Posts user messages to /api/chat,
 * reads the streaming response, surfaces text deltas + tool calls +
 * tool results + usage as they arrive.
 *
 * The point of this page is the Progressive Disclosure DEMO — watch
 * the agent autonomously execute Layer 1 (search) → Layer 2 (timeline)
 * → Layer 3 (get_observations) over the public Fly engine, with token
 * economics surfaced inline so the ~10x token-savings moat is visible.
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 */
import { useRef, useState } from 'react';

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: 'pending' | 'complete' | 'error';
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolInvocations: ToolInvocation[];
}

interface UsageBlock {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

const LAYER_LABEL: Record<string, string> = {
  continuum_search_docs: 'Layer 1 · search',
  continuum_timeline: 'Layer 2 · timeline',
  continuum_get_observations: 'Layer 3 · full-fetch',
  continuum_get_state: 'state',
  continuum_get_digest: 'digest',
  continuum_get_todos: 'todos',
  continuum_create_todo: 'todo+',
  continuum_update_todo: 'todo~',
  continuum_record_checkpoint: 'checkpoint',
};

// Claude Sonnet 4.6 pricing: $3/M input, $15/M output. Cached input is ~$0.30/M.
const PRICE_IN_PER_M = 3;
const PRICE_OUT_PER_M = 15;

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionUsage, setSessionUsage] = useState<UsageBlock>({});
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: input,
      toolInvocations: [],
    };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      toolInvocations: [],
    };
    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setInput('');
    setIsStreaming(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role,
            content: m.text,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status} — ${errBody.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const ev of events) {
          if (!ev.startsWith('data: ')) continue;
          const data = ev.slice(6);
          if (data === '[DONE]') continue;
          try {
            const part = JSON.parse(data);
            applyStreamPart(part, assistantId);
          } catch {
            /* keep streaming — skip malformed chunk */
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStreaming(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function applyStreamPart(part: { type: string; [key: string]: unknown }, assistantId: string) {
    setMessages(prev =>
      prev.map(m => {
        if (m.id !== assistantId) return m;
        switch (part.type) {
          case 'text-delta':
          case 'text': {
            const delta =
              (part.text as string | undefined) ??
              (part.delta as string | undefined) ??
              (part.textDelta as string | undefined) ??
              '';
            return { ...m, text: m.text + delta };
          }
          case 'tool-call':
          case 'tool-input-start': {
            const tc: ToolInvocation = {
              toolCallId: (part.toolCallId ?? part.id) as string,
              toolName: part.toolName as string,
              args: part.args ?? part.input,
              state: 'pending',
            };
            if (!tc.toolCallId || !tc.toolName) return m;
            // Replace if exists, else append
            const idx = m.toolInvocations.findIndex(
              x => x.toolCallId === tc.toolCallId,
            );
            const next =
              idx >= 0
                ? m.toolInvocations.map((x, i) => (i === idx ? { ...x, ...tc } : x))
                : [...m.toolInvocations, tc];
            return { ...m, toolInvocations: next };
          }
          case 'tool-result':
          case 'tool-output-available': {
            const id = (part.toolCallId ?? part.id) as string;
            const result = part.result ?? part.output;
            return {
              ...m,
              toolInvocations: m.toolInvocations.map(x =>
                x.toolCallId === id ? { ...x, result, state: 'complete' as const } : x,
              ),
            };
          }
          case 'finish':
          case 'finish-step': {
            const usage = part.usage as UsageBlock | undefined;
            if (usage) {
              setSessionUsage(prev => ({
                inputTokens: (prev.inputTokens ?? 0) + (usage.inputTokens ?? 0),
                outputTokens: (prev.outputTokens ?? 0) + (usage.outputTokens ?? 0),
                totalTokens: (prev.totalTokens ?? 0) + (usage.totalTokens ?? 0),
                cachedInputTokens:
                  (prev.cachedInputTokens ?? 0) + (usage.cachedInputTokens ?? 0),
              }));
            }
            return m;
          }
          case 'error': {
            setError(String(part.error));
            return m;
          }
          default:
            return m;
        }
      }),
    );
  }

  const costUsd =
    ((sessionUsage.inputTokens ?? 0) * PRICE_IN_PER_M +
      (sessionUsage.outputTokens ?? 0) * PRICE_OUT_PER_M) /
    1_000_000;

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', paddingBottom: '6rem' }}>
      <header style={{ borderBottom: '1px solid #2a2f36', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>Continuum Chat</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#8b939b' }}>
          Progressive Disclosure (Layer 1 → 2 → 3) in action · Sonnet 4.6 ·{' '}
          <a href="/" style={{ color: '#9ad2ff' }}>
            operator dashboard
          </a>
        </p>
      </header>

      <section style={{ marginTop: '2rem', minHeight: '40vh' }}>
        {messages.length === 0 && (
          <div
            style={{
              color: '#5f6770',
              padding: '3rem 0',
              borderBottom: '1px solid #1a1e23',
            }}
          >
            <p style={{ margin: 0 }}>
              Ask CONTINUUM anything. The agent autonomously runs Layer 1 (search) →
              Layer 2 (timeline) → Layer 3 (full-fetch) over the 9 MCP tools served
              from <code>continuum-engine.fly.dev</code>, with token economics
              streamed live.
            </p>
            <p style={{ margin: '1rem 0 0', fontSize: '0.85rem' }}>
              Try: <em>"What did we ship today?"</em> ·{' '}
              <em>"Show me the V1 AaaS LIVE checkpoint."</em> ·{' '}
              <em>"How does the V1 HTTP transport wire to storage?"</em>
            </p>
          </div>
        )}

        {messages.map(m => (
          <article
            key={m.id}
            style={{
              padding: '1.25rem 0',
              borderBottom: '1px solid #1a1e23',
            }}
          >
            <div
              style={{
                color: '#8b939b',
                fontSize: '0.85rem',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {m.role === 'user' ? 'You' : 'Continuum'}
            </div>

            {m.toolInvocations.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                {m.toolInvocations.map(ti => (
                  <ToolCard key={ti.toolCallId} ti={ti} />
                ))}
              </div>
            )}

            {m.text && (
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.55,
                  color: '#e6e8eb',
                }}
              >
                {m.text}
              </div>
            )}
          </article>
        ))}
        <div ref={messagesEndRef} />
      </section>

      {error && (
        <div
          style={{
            margin: '1rem 0',
            padding: '0.75rem 1rem',
            background: '#3a1010',
            color: '#ff8585',
            borderRadius: 6,
            fontSize: '0.85rem',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      <UsageBar usage={sessionUsage} costUsd={costUsd} />

      <form
        onSubmit={send}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '2rem',
          right: '2rem',
          maxWidth: 960,
          margin: '0 auto',
          display: 'flex',
          gap: '0.5rem',
          background: '#0b0d10',
          padding: '0.75rem',
          border: '1px solid #2a2f36',
          borderRadius: 8,
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={
            isStreaming ? 'Continuum is thinking…' : 'Ask Continuum…'
          }
          disabled={isStreaming}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            background: '#14181c',
            color: '#e6e8eb',
            border: '1px solid #2a2f36',
            borderRadius: 6,
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            background: isStreaming || !input.trim() ? '#1a1e23' : '#9ad2ff',
            color: isStreaming || !input.trim() ? '#5f6770' : '#0b0d10',
            border: 'none',
            borderRadius: 6,
            cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            minWidth: 80,
          }}
        >
          {isStreaming ? '…' : 'Send'}
        </button>
      </form>
    </main>
  );
}

function ToolCard({ ti }: { ti: ToolInvocation }) {
  const label = LAYER_LABEL[ti.toolName] ?? ti.toolName;
  const stateColor = ti.state === 'complete' ? '#7ddf64' : ti.state === 'error' ? '#ff5c5c' : '#ffb454';
  return (
    <div
      style={{
        margin: '0.5rem 0',
        padding: '0.75rem',
        background: '#0e1216',
        border: `1px solid ${stateColor}`,
        borderRadius: 6,
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.85rem',
      }}
    >
      <div style={{ color: stateColor, marginBottom: '0.25rem' }}>
        {ti.state === 'complete' ? '✓' : ti.state === 'error' ? '✗' : '…'}{' '}
        <span style={{ color: '#9ad2ff' }}>{label}</span>{' '}
        <span style={{ color: '#5f6770', fontSize: '0.75rem' }}>({ti.toolName})</span>
      </div>
      <details>
        <summary
          style={{
            cursor: 'pointer',
            color: '#8b939b',
            fontSize: '0.75rem',
          }}
        >
          args + result
        </summary>
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ color: '#5f6770', fontSize: '0.7rem' }}>args:</div>
          <pre
            style={{
              margin: 0,
              color: '#e6e8eb',
              fontSize: '0.7rem',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(ti.args, null, 2)}
          </pre>
          {ti.result !== undefined && (
            <>
              <div
                style={{ color: '#5f6770', fontSize: '0.7rem', marginTop: '0.5rem' }}
              >
                result:
              </div>
              <pre
                style={{
                  margin: 0,
                  color: '#e6e8eb',
                  fontSize: '0.7rem',
                  maxHeight: 300,
                  overflow: 'auto',
                }}
              >
                {typeof ti.result === 'string' ? ti.result : JSON.stringify(ti.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      </details>
    </div>
  );
}

function UsageBar({ usage, costUsd }: { usage: UsageBlock; costUsd: number }) {
  const inputT = usage.inputTokens ?? 0;
  const outputT = usage.outputTokens ?? 0;
  if (inputT === 0 && outputT === 0) return null;
  return (
    <div
      style={{
        position: 'sticky',
        bottom: '5.5rem',
        margin: '1rem 0',
        padding: '0.6rem 0.9rem',
        background: '#0e1216',
        border: '1px solid #2a2f36',
        borderRadius: 6,
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.8rem',
        display: 'flex',
        gap: '1.5rem',
        flexWrap: 'wrap',
        color: '#8b939b',
      }}
    >
      <span>
        Session:{' '}
        <span style={{ color: '#9ad2ff' }}>{inputT.toLocaleString()}</span> in /{' '}
        <span style={{ color: '#9ad2ff' }}>{outputT.toLocaleString()}</span> out
      </span>
      {usage.cachedInputTokens ? (
        <span>
          Cached:{' '}
          <span style={{ color: '#7ddf64' }}>
            {usage.cachedInputTokens.toLocaleString()}
          </span>
        </span>
      ) : null}
      <span>
        Cost (Sonnet 4.6):{' '}
        <span style={{ color: costUsd > 0.01 ? '#ffb454' : '#7ddf64' }}>
          ${costUsd.toFixed(4)}
        </span>
      </span>
      <span style={{ marginLeft: 'auto', color: '#5f6770', fontSize: '0.7rem' }}>
        Progressive Disclosure: Layer 1 → 2 → 3 instead of full grep+Read
      </span>
    </div>
  );
}
