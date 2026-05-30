#!/usr/bin/env node
/**
 * scripts/run-canonical-queries.mjs
 *
 * SPRINT-2026-W22 · W22-1 live-fire verification probe.
 *
 * POSTs each of the 5 canonical queries to the live /chat API at the
 * configured CHAT_URL (default https://continuum-kohl.vercel.app/api/chat),
 * parses the SSE stream, and reports:
 *   - ordered tool-call sequence
 *   - usage (input/output tokens + USD cost @ Sonnet 4.6 pricing)
 *   - assistant reply text
 *   - pass/fail vs the W22-1 pass criterion (Layer-1 before Layer-3)
 *
 * Outputs:
 *   - human-readable progress to stderr
 *   - machine-readable JSON array to stdout (for piping to a Markdown formatter)
 *
 * Pass criterion (from SPRINT-2026-W22.md §W22-1):
 *   "at least 3 of 5 runs show a Layer-1 card (continuum_search_docs)
 *    BEFORE any Layer-3 card (continuum_get_observations). One run
 *    without Layer-3 at all is acceptable. Zero runs where Layer-3
 *    fires before Layer-1."
 *
 * Bound by The Nine v0.1.0 (AGENTS.md).
 */

const ENDPOINT = process.env.CHAT_URL ?? 'https://continuum-kohl.vercel.app/api/chat';
const PRICE_IN_PER_M = 3;
const PRICE_OUT_PER_M = 15;

const QUERIES = [
  'What did we ship today?',
  'Show me the V1 AaaS LIVE checkpoint.',
  'How does the V1 HTTP transport wire to storage?',
  "What's the privacy filter doing differently after Issue #8?",
  "What's broken right now?",
];

const LAYER_OF = name => {
  if (name === 'continuum_search_docs') return 1;
  if (name === 'continuum_timeline') return 2;
  if (name === 'continuum_get_observations') return 3;
  return 0; // not a discovery-disclosure tool
};

async function runQuery(query, idx) {
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: query }] }),
    });
  } catch (e) {
    return { idx, query, error: `fetch failed: ${e.message}`, elapsedMs: Date.now() - t0 };
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    return {
      idx,
      query,
      error: `HTTP ${res.status} — ${text.slice(0, 500)}`,
      elapsedMs: Date.now() - t0,
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolCalls = [];
  let assistantText = '';
  let usage = null;
  const errors = [];

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
      let part;
      try {
        part = JSON.parse(data);
      } catch {
        continue;
      }
      switch (part.type) {
        case 'text-delta':
        case 'text':
          assistantText += part.text ?? part.delta ?? part.textDelta ?? '';
          break;
        case 'tool-call':
        case 'tool-input-start':
          if (part.toolName) {
            toolCalls.push({
              name: part.toolName,
              args: part.args ?? part.input ?? {},
            });
          }
          break;
        case 'finish':
        case 'finish-step':
          if (part.usage) usage = part.usage;
          break;
        case 'error':
          errors.push(String(part.error ?? 'unknown'));
          break;
      }
    }
  }

  // Verdict per W22-1 pass criterion
  const layers = toolCalls.map(t => LAYER_OF(t.name)).filter(l => l > 0);
  const firstL1Idx = layers.indexOf(1);
  const firstL3Idx = layers.indexOf(3);
  let verdict;
  if (firstL3Idx === -1 && firstL1Idx >= 0) {
    verdict = 'PASS (L1 hit, L3 not needed)';
  } else if (firstL3Idx === -1 && firstL1Idx === -1) {
    verdict = 'NO-DISCOVERY (no L1/L3 tool calls — answered from briefing or hallucinated)';
  } else if (firstL1Idx >= 0 && firstL3Idx > firstL1Idx) {
    verdict = 'PASS (L1 before L3)';
  } else if (firstL3Idx >= 0 && firstL1Idx === -1) {
    verdict = 'LEAK (L3 fired with no L1)';
  } else if (firstL3Idx >= 0 && firstL1Idx > firstL3Idx) {
    verdict = 'LEAK (L3 fired before L1)';
  } else {
    verdict = 'UNCLEAR';
  }

  const costUsd =
    usage
      ? ((usage.inputTokens ?? 0) * PRICE_IN_PER_M +
          (usage.outputTokens ?? 0) * PRICE_OUT_PER_M) /
        1_000_000
      : null;

  return {
    idx,
    query,
    toolCalls,
    toolSequence: toolCalls.map(t => t.name),
    assistantText,
    usage,
    costUsd,
    errors,
    verdict,
    elapsedMs: Date.now() - t0,
  };
}

const results = [];
for (let i = 0; i < QUERIES.length; i++) {
  const q = QUERIES[i];
  process.stderr.write(`\n[${i + 1}/${QUERIES.length}] ${q}\n`);
  const r = await runQuery(q, i + 1);
  results.push(r);
  if (r.error) {
    process.stderr.write(`    ✗ ERROR ${r.elapsedMs}ms — ${r.error}\n`);
  } else {
    const seq = r.toolSequence.length ? r.toolSequence.join(' → ') : '(no tools)';
    process.stderr.write(`    tools: ${seq}\n`);
    process.stderr.write(
      `    usage: in=${r.usage?.inputTokens ?? '?'} out=${r.usage?.outputTokens ?? '?'} · $${r.costUsd?.toFixed(4) ?? '?'}\n`,
    );
    process.stderr.write(`    verdict: ${r.verdict} · ${r.elapsedMs}ms\n`);
  }
}

// Sprint pass criterion roll-up
const passes = results.filter(r => /^PASS/.test(r.verdict ?? '')).length;
const leaks = results.filter(r => /^LEAK/.test(r.verdict ?? '')).length;
const noDisc = results.filter(r => /^NO-DISCOVERY/.test(r.verdict ?? '')).length;
const errored = results.filter(r => r.error).length;

const sprintVerdict = passes >= 3 && leaks === 0
  ? 'SPRINT_PASS'
  : leaks > 0
    ? 'SPRINT_LEAK'
    : 'SPRINT_INCONCLUSIVE';

const summary = {
  endpoint: ENDPOINT,
  timestamp: new Date().toISOString(),
  totalQueries: QUERIES.length,
  passes,
  leaks,
  noDiscovery: noDisc,
  errored,
  sprintVerdict,
  totalUsageUsd: results.reduce((s, r) => s + (r.costUsd ?? 0), 0),
  results,
};

process.stderr.write(`\n=== Sprint W22-1 verdict: ${sprintVerdict} ===\n`);
process.stderr.write(
  `    ${passes} pass · ${leaks} leak · ${noDisc} no-discovery · ${errored} error\n`,
);
process.stderr.write(`    total cost this run: $${summary.totalUsageUsd.toFixed(4)}\n\n`);

console.log(JSON.stringify(summary, null, 2));
