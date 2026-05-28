/**
 * POST /api/chat — Vercel AI SDK + Anthropic + CONTINUUM MCP bridge.
 *
 * Receives { messages: [{ role, content }] } from the client. Opens an SSE
 * connection to the public CONTINUUM engine on Fly, fetches the 9 MCP tools,
 * converts them to AI SDK tool() helpers, then streams a Claude Sonnet 4.6
 * response back to the client as Server-Sent Events.
 *
 * Stream events emitted to client (each as `data: <json>\n\n`):
 *   - { type: 'text-delta', textDelta: string }
 *   - { type: 'tool-call', toolCallId, toolName, args }
 *   - { type: 'tool-result', toolCallId, result }
 *   - { type: 'finish', usage: { inputTokens, outputTokens, totalTokens } }
 *   - { type: 'error', error: string }
 *
 * Bound by The Nine (AGENTS.md at repo root, v0.1.0). The system prompt
 * below explicitly enforces the Progressive Disclosure Layer 1 → 2 → 3
 * discipline so the LLM doesn't skip straight to expensive full-fetch.
 */
import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool, jsonSchema, stepCountIs } from 'ai';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CONTINUUM_SYSTEM_PROMPT = `You are an AI assistant working inside a CONTINUUM-enabled session, bound by The Nine (a discipline of verifiable trust — see AGENTS.md, schema v0.1.0).

Your responses must follow the **Progressive Disclosure** retrieval pattern when answering questions about project state. NEVER skip layers; the economic moat depends on you using them in order.

## The protocol — Layer 1 → 2 → 3, in order

1. **Layer 0 — Briefing.** If the user's question might be answered by current project state, FIRST read the resource \`continuum://session/briefing\` (via the MCP resource read, if available). It is a single cheap read (~2–5 KB) that combines current state + open todos + recent activity. Most opening questions are answered from this alone.

2. **Layer 1 — Search.** If Layer 0 doesn't answer the question, call \`continuum_search_docs\` with specific keywords. Returns compact hits — IDs + titles, ~50–100 tokens each. Do NOT fetch full content yet.

3. **Layer 2 — Timeline.** If you need causal context around a specific observation found in Layer 1, call \`continuum_timeline\` with \`aroundId\` set to that observation's ID. Returns chronological context — what happened just before/after.

4. **Layer 3 — Full fetch.** After narrowing with Layers 1 + 2, call \`continuum_get_observations\` with the specific IDs you need full content for. This is the EXPENSIVE step (~500–2000 tokens per observation). Never use as the first retrieval step. Batch IDs into a single call when possible.

## Citation discipline (P2 — prove, don't grant)

When asserting facts about the project, cite the Observation IDs that prove them. Format: \`Claim X [obs:abc12345]\`. If no citation is possible, say so explicitly — do not assert unverified claims.

## Honest uncertainty (P4 — never claim more than you can verify)

When you don't know, say so. Name what you did and didn't verify. A confident overreach is worth less than a correct refusal. End substantive answers with a brief "what I checked / what I did not" if non-trivial.

## The human keeps the leap (P9)

You authenticate and propose. When you produce a commitment the user wants tracked, call \`continuum_create_todo\` with a concrete \`verifyCommand\`. Do not mark todos done yourself — that is the human's leap (or the verify_command's automatic proof).

## Available tools

You have 9 CONTINUUM MCP tools (record_checkpoint, get_state, get_digest, search_docs, get_todos, create_todo, update_todo, timeline, get_observations) plus 4 Resources and 2 Prompts. Use them in the disciplined order above.

Be concise. Cite Observation IDs. Stay in scope.`;

interface SimpleMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(req: Request): Promise<Response> {
  let mcpClient: McpClient | null = null;

  try {
    const body = (await req.json()) as { messages: SimpleMessage[] };
    const messages = body.messages ?? [];

    const flyUrl = process.env.CONTINUUM_HTTP_URL ?? 'https://continuum-engine.fly.dev/sse';
    const token = process.env.CONTINUUM_HTTP_TOKEN;
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'CONTINUUM_HTTP_TOKEN not set in env' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in env' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 1. Open MCP client to public CONTINUUM engine
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Continuum-Project': process.env.CONTINUUM_PROJECT_ID ?? 'continuum',
    };
    const transport = new SSEClientTransport(new URL(flyUrl), {
      requestInit: { headers },
      eventSourceInit: {
        fetch: (u, init) =>
          fetch(u, { ...init, headers: { ...init?.headers, ...headers } }),
      },
    });
    mcpClient = new McpClient(
      { name: 'continuum-console-chat', version: '0.0.1' },
      { capabilities: {} },
    );
    await mcpClient.connect(transport);

    // 2. Fetch CONTINUUM's MCP tool surface and convert to AI SDK tools
    const { tools: mcpTools } = await mcpClient.listTools();
    const aiTools = Object.fromEntries(
      mcpTools.map(t => [
        t.name,
        tool({
          description: t.description ?? '',
          // MCP tools carry JSON Schema as inputSchema; jsonSchema() wraps it
          // for the AI SDK without us re-typing every shape.
          inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
          execute: async (args: unknown) => {
            const callResult = await mcpClient!.callTool({
              name: t.name,
              arguments: args as Record<string, unknown>,
            });
            // MCP returns { content: [{type:'text',text:'...'}, ...] }
            const content = (callResult.content ?? []) as Array<{
              type: string;
              text?: string;
            }>;
            const textOnly = content
              .filter(c => c.type === 'text')
              .map(c => c.text ?? '')
              .join('\n');
            return textOnly || JSON.stringify(callResult);
          },
        }),
      ]),
    );

    // 3. Run streamText with Anthropic + the MCP-derived tools
    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: CONTINUUM_SYSTEM_PROMPT,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })) as never, // ai@6 accepts simple {role, content} for prompts
      tools: aiTools,
      stopWhen: stepCountIs(10),
    });

    // 4. Stream the typed fullStream back to the client as SSE events
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            // part has a `type` field — pass it through verbatim. Client
            // filters/renders based on type.
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(part)}\n\n`),
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`,
            ),
          );
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          try {
            await mcpClient?.close();
          } catch {
            /* swallow — connection likely already torn down */
          }
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    try {
      await mcpClient?.close();
    } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
