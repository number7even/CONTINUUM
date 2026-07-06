/**
 * POST /api/ask — the brain's codebase-comprehension agent.
 *
 * Reuses the /api/chat wiring (Vercel AI SDK + Anthropic + CONTINUUM MCP
 * bridge) but is single-shot and STRUCTURED: it answers one question about the
 * codebase using CONTINUUM's own memory tools, then returns
 *
 *     { answer: string, nodeIds: string[], citations: string[] }
 *
 * `nodeIds` are the graph node IDs the answer actually leaned on — the brain
 * highlights them and flies the camera there, so an answer is never a wall of
 * text: it's grounded IN the galaxy you're looking at (P2 — prove, don't grant).
 *
 * Same env as /api/chat: ANTHROPIC_API_KEY + CONTINUUM_HTTP_URL/TOKEN/PROJECT_ID.
 * With .env.local set to the local engine (:7878, graph-demo), this queries the
 * exact store the brain renders, so cited IDs resolve against on-screen nodes.
 *
 * Bound by The Nine (AGENTS.md, v0.1.0).
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool, jsonSchema, stepCountIs } from 'ai';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ASK_SYSTEM = `You are CONTINUUM's codebase-comprehension agent, embedded in a live 3D knowledge-graph ("the brain"). The user is looking at a galaxy of nodes across five sources: code symbols, docs, git commits, concepts, and memory. Your job is to help them UNDERSTAND the codebase — its structure, relationships, and history — grounded in real evidence.

## How to answer (Progressive Disclosure — cheap → expensive, in order)
1. Call \`continuum_search\` (or \`continuum_search_docs\`) with focused keywords → compact hits (IDs + titles). Start here.
2. Need the graph neighborhood or how things connect? Call \`continuum_graph\`.
3. Need causal history around a hit? Call \`continuum_timeline\` with its ID.
4. Only then, for the few IDs you truly need in full, call \`continuum_get_observations\`.
Never jump straight to full fetch. Batch IDs into one call.

## Grounding (P4 — never claim more than you can verify)
Answer ONLY from what the tools return. If the tools don't support a claim, say so plainly. Prefer a correct "I couldn't find that" over a confident guess. Be concise — 2–5 sentences, plain language, no filler.

## The MOST IMPORTANT output rule
After your answer, on a FINAL line by itself, list the exact node IDs from the tool results that your answer is grounded in, so the brain can fly the camera to them:

NODES: id1, id2, id3

Use the verbatim \`id\` values as they appear in tool results (e.g. \`sym:packages/core/src/graph.ts:buildObservationGraph\`, a 40-char commit SHA, a doc/concept id). List 1–12 of the most relevant. If none apply, write \`NODES:\` with nothing after it. Do not invent IDs.`;

// ── id extraction ────────────────────────────────────────────────────────────
// Pull candidate graph node IDs out of raw tool-result text: JSON "id" fields,
// sym: qualified names, and 40-hex commit SHAs.
function extractIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/"id"\s*:\s*"([^"]+)"/g)) ids.add(m[1]!);
  for (const m of text.matchAll(/\bsym:[^\s"'`,)\]}]+/g)) ids.add(m[0]!);
  for (const m of text.matchAll(/\b[0-9a-f]{40}\b/g)) ids.add(m[0]!);
  return [...ids];
}

// Parse the model's trailing `NODES: a, b, c` line.
function parseNodesLine(answer: string): { clean: string; ids: string[] } {
  const m = answer.match(/\n?NODES:\s*([^\n]*)\s*$/i);
  if (!m) return { clean: answer.trim(), ids: [] };
  const ids = (m[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { clean: answer.slice(0, m.index).trim(), ids };
}

export async function POST(req: Request): Promise<Response> {
  let mcpClient: McpClient | null = null;
  try {
    const body = (await req.json()) as { question?: string };
    const question = (body.question ?? '').trim();
    if (!question) {
      return Response.json({ error: 'question required' }, { status: 400 });
    }

    const url = process.env.CONTINUUM_HTTP_URL ?? 'http://localhost:7878/sse';
    const token = process.env.CONTINUUM_HTTP_TOKEN;
    if (!token) return Response.json({ error: 'CONTINUUM_HTTP_TOKEN not set' }, { status: 500 });
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Continuum-Project': process.env.CONTINUUM_PROJECT_ID ?? 'graph-demo',
    };
    const transport = new SSEClientTransport(new URL(url), {
      requestInit: { headers },
      eventSourceInit: {
        fetch: (u, init) => fetch(u, { ...init, headers: { ...init?.headers, ...headers } }),
      },
    });
    mcpClient = new McpClient({ name: 'continuum-brain-ask', version: '0.0.1' }, { capabilities: {} });
    await mcpClient.connect(transport);

    // Every id we see flow through a tool result — the grounded candidate set.
    const seenIds = new Set<string>();

    const { tools: mcpTools } = await mcpClient.listTools();
    const aiTools = Object.fromEntries(
      mcpTools.map((t) => [
        t.name,
        tool({
          description: t.description ?? '',
          inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
          execute: async (args: unknown) => {
            const callResult = await mcpClient!.callTool({
              name: t.name,
              arguments: args as Record<string, unknown>,
            });
            const content = (callResult.content ?? []) as Array<{ type: string; text?: string }>;
            const textOnly = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
            for (const id of extractIds(textOnly)) seenIds.add(id);
            return textOnly || JSON.stringify(callResult);
          },
        }),
      ]),
    );

    const result = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: ASK_SYSTEM,
      prompt: question,
      tools: aiTools,
      stopWhen: stepCountIs(8),
    });

    const { clean, ids: citedIds } = parseNodesLine(result.text);
    // Prefer the model's explicit NODES: list; keep only ids we actually saw in
    // tool results (guards against hallucinated ids). Fall back to seen ids.
    const grounded = citedIds.filter((id) => seenIds.has(id));
    const nodeIds = (grounded.length ? grounded : [...seenIds]).slice(0, 12);

    await mcpClient.close().catch(() => {});
    return Response.json({ answer: clean || result.text, nodeIds, citations: nodeIds });
  } catch (err) {
    await mcpClient?.close().catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
