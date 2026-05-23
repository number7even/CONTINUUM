#!/usr/bin/env node
/**
 * Continuum MCP stdio server (V0 + V0 polish).
 *
 * Exposes 7 tools + 4 Resources + 2 Prompts to MCP-aware AI clients
 * (Claude Code, Cursor, Hermes Agent, etc.).
 *
 * Tools:
 *   1. continuum_record_checkpoint   — write immutable state snapshot
 *   2. continuum_get_state            — fetch state at timestamp (or now)
 *   3. continuum_get_digest           — fetch composed narrative for window
 *   4. continuum_search_docs          — FTS5 keyword search (Layer-1)
 *   5. continuum_get_todos            — list todos, optional status filter
 *   6. continuum_create_todo          — create a new todo in the pipeline
 *   7. continuum_update_todo          — mutate status/title/etc. on a todo
 *
 * Resources:
 *   continuum://todos/open            — live open + in_progress todos
 *   continuum://state/current         — most recent StateSnapshot
 *   continuum://digest/latest         — composed narrative for last 24h
 *   continuum://session/briefing      — Layer-0 pre-rendered session brief
 *
 * Prompts:
 *   continuum.session_start           — Layer-0 → Layer-1 → Layer-3 workflow
 *   continuum.cite                    — Observation-ID citation discipline
 *
 * Progressive Disclosure (ARCHITECTURE.md §5) — V0 polish ships:
 *   • Layer-0 (briefing resource — eliminates round-trips for warm-up)
 *   • Layer-1 (continuum_search_docs — compact hits)
 *   Layer-2 timeline + Layer-3 batch get_observations land in V0.5.
 *
 * Transport: stdio (V0). HTTP/SSE/WebSocket land in V1 per §6.
 *
 * Registration: add to ~/.claude.json or per-project .mcp.json:
 *
 *   {
 *     "mcpServers": {
 *       "continuum": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/dist/index.js"],
 *         "env": {
 *           "CONTINUUM_PROJECT_ID": "vc-hospitality"
 *         }
 *       }
 *     }
 *   }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  openStorage,
  type StorageBackend,
  type CheckpointInput,
  type StateEntry,
  type CreateTodoInput,
  type UpdateTodoInput,
  type Todo,
} from '@continuum/core';

// ── Boot ──────────────────────────────────────────────────────────────────────

const projectId = process.env.CONTINUUM_PROJECT_ID ?? 'default';
const storage: StorageBackend = openStorage(projectId);

const server = new Server(
  {
    name: 'continuum-mcp',
    version: '0.0.1',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
);

// ── Tool registry ─────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'continuum_record_checkpoint',
      description:
        'Write an immutable state snapshot. Provide active/dormant/broken entries and a reason. ' +
        'Returns the persisted snapshot with hash. Use this at session end, after significant ' +
        'commits, or when state has materially changed.',
      inputSchema: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Why this checkpoint — manual reason or auto-trigger label.',
          },
          active: {
            type: 'array',
            description: 'Entries currently active in production.',
            items: { $ref: '#/definitions/StateEntry' },
          },
          dormant: {
            type: 'array',
            description: 'Entries built but not the active path.',
            items: { $ref: '#/definitions/StateEntry' },
          },
          broken: {
            type: 'array',
            description: 'Known failures with repro.',
            items: { $ref: '#/definitions/StateEntry' },
          },
        },
        required: ['reason', 'active'],
        definitions: {
          StateEntry: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              where: { type: 'string' },
              verifyCommand: { type: 'string' },
              landedAt: { type: 'string' },
              verifiedAt: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name', 'where', 'verifyCommand', 'verifiedAt'],
          },
        },
      },
    },
    {
      name: 'continuum_get_state',
      description:
        'Fetch the StateSnapshot in effect at the given ISO-8601 timestamp (or now if omitted). ' +
        'Answers "what was true on May 14?" — returns the most recent snapshot at or before ' +
        'the requested time. Returns null if no snapshots exist yet.',
      inputSchema: {
        type: 'object',
        properties: {
          at: {
            type: 'string',
            description: 'ISO-8601 timestamp. Defaults to now.',
          },
        },
      },
    },
    {
      name: 'continuum_get_digest',
      description:
        'Fetch a composed narrative for a time window. V0 returns template-based digests ' +
        'derived from recent checkpoints + observations. V0.5+ adds ruvllm/ruv-FANN local-AI ' +
        'narrative generation.',
      inputSchema: {
        type: 'object',
        properties: {
          window: {
            type: 'string',
            enum: ['24h', '7d', 'session'],
            description: 'Time window. Default 24h.',
          },
        },
      },
    },
    {
      name: 'continuum_search_docs',
      description:
        'Full-text keyword search across indexed observations. V0 uses SQLite FTS5 for ' +
        'high-precision exact/code-snippet matching. V0.5+ adds semantic vector fusion (RuVector). ' +
        'Returns Progressive Disclosure Layer-1 hits — compact, ~50-100 tokens per result.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search terms. FTS5 syntax supported (e.g., "voice AND cutoff").',
          },
          limit: {
            type: 'number',
            description: 'Max results. Default 20.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'continuum_get_todos',
      description:
        'List todos in the live pipeline. Pass status="open" (or "in_progress" / "blocked" / "done") ' +
        'to filter, or omit to return all. Newest first. The continuum://todos/open resource is ' +
        'the cheap polling surface; this tool is for filtered lookups.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'in_progress', 'blocked', 'done'],
            description: 'Filter by status. Omit for all statuses.',
          },
          limit: {
            type: 'number',
            description: 'Max results. Default 100.',
          },
        },
      },
    },
    {
      name: 'continuum_create_todo',
      description:
        'Create a new todo in the pipeline. Use this when a discussion produces a commitment that ' +
        'should be tracked through to verification. refs[] links to observation IDs that motivated ' +
        'the todo; verifyCommand is a shell command that proves the todo is satisfied when it returns 0. ' +
        'IMPORTANT: for deployment, release, migration, or "ship" todos, you MUST populate verifyCommand — ' +
        'it is the gate that proves the change actually landed (e.g. health-check curl, smoke test, ' +
        'grep for the deployed artifact). Todos without verifyCommand cannot be auto-resolved by ' +
        'scheduled clients (e.g. cron-driven Hermes) and must be closed manually.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          refs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Observation IDs that motivated this todo.',
          },
          verifyCommand: {
            type: 'string',
            description:
              'Shell command that exits 0 when satisfied. REQUIRED for any deploy/release/migration ' +
              'todo so the verify-then-dissolve loop can close it without human approval.',
          },
          blockedBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'Other Todo IDs that must complete first.',
          },
          status: {
            type: 'string',
            enum: ['open', 'in_progress', 'blocked', 'done'],
            description: 'Initial status. Default "open".',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'continuum_update_todo',
      description:
        'Update mutable fields on a todo — status transitions, title edits, verifyCommand changes, ' +
        'blockedBy dependencies. Transitioning to status="done" stamps completedAt automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: {
            type: 'string',
            enum: ['open', 'in_progress', 'blocked', 'done'],
          },
          title: { type: 'string' },
          verifyCommand: { type: ['string', 'null'] },
          blockedBy: { type: 'array', items: { type: 'string' } },
          refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
    },
  ],
}));

// ── Tool dispatcher ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async request => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'continuum_record_checkpoint': {
        const input = args as unknown as CheckpointInput;
        if (!input?.reason || !Array.isArray(input?.active)) {
          throw new Error('reason and active[] are required');
        }
        const snapshot = storage.recordCheckpoint(input);
        return {
          content: [
            { type: 'text', text: JSON.stringify(snapshot, null, 2) },
          ],
        };
      }

      case 'continuum_get_state': {
        const at = (args as { at?: string })?.at;
        const snapshot = storage.getStateAt(at);
        if (!snapshot) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: 'No checkpoints recorded yet. Use continuum_record_checkpoint to create the first one.',
                }),
              },
            ],
          };
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify(snapshot, null, 2) },
          ],
        };
      }

      case 'continuum_get_digest': {
        const window = (args as { window?: string })?.window ?? '24h';
        const snapshots = storage.listSnapshots(10);
        const hoursWindow = window === '7d' ? 168 : window === 'session' ? 8 : 24;
        const cutoff = new Date(Date.now() - hoursWindow * 3600 * 1000).toISOString();
        const recent = snapshots.filter(s => s.timestamp >= cutoff);

        const narrative = templateDigest(recent, window);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                window,
                windowStart: cutoff,
                windowEnd: new Date().toISOString(),
                narrative,
                snapshotsInWindow: recent.length,
              }, null, 2),
            },
          ],
        };
      }

      case 'continuum_search_docs': {
        const { query, limit } = args as { query: string; limit?: number };
        if (!query?.trim()) throw new Error('query is required');
        const hits = storage.searchObservations(query, limit);
        return {
          content: [
            { type: 'text', text: JSON.stringify({ query, count: hits.length, hits }, null, 2) },
          ],
        };
      }

      case 'continuum_get_todos': {
        const { status, limit } = (args ?? {}) as { status?: Todo['status']; limit?: number };
        const todos = storage.listTodos({ status, limit });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ count: todos.length, todos }, null, 2) },
          ],
        };
      }

      case 'continuum_create_todo': {
        const input = args as unknown as CreateTodoInput;
        if (!input?.title?.trim()) {
          throw new Error('title is required');
        }
        const todo = storage.createTodo(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
        };
      }

      case 'continuum_update_todo': {
        const input = args as unknown as UpdateTodoInput;
        if (!input?.id) {
          throw new Error('id is required');
        }
        const todo = storage.updateTodo(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(todo, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

// ── Resource registry ────────────────────────────────────────────────────────
//
// V0 polish ships 4 Resources:
//
//   continuum://todos/open         — live open + in_progress todos
//   continuum://state/current      — most recent state snapshot
//   continuum://digest/latest      — composed narrative for last 24h
//   continuum://session/briefing   — Layer-0 Progressive Disclosure brief
//                                    (combines state + open todos + recent
//                                    activity in one cheap read so the AI
//                                    can warm-start without tool calls)

const RESOURCE_URIS = {
  openTodos: 'continuum://todos/open',
  stateCurrent: 'continuum://state/current',
  digestLatest: 'continuum://digest/latest',
  sessionBriefing: 'continuum://session/briefing',
} as const;

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: RESOURCE_URIS.openTodos,
      name: 'Open Todos',
      description:
        'Live list of todos with status="open" or "in_progress". Cheap polling surface ' +
        'for scheduled clients (e.g. cron-driven Hermes runs) to check what work is queued.',
      mimeType: 'application/json',
    },
    {
      uri: RESOURCE_URIS.stateCurrent,
      name: 'Current State',
      description:
        'Most recent StateSnapshot — what is active in production, what is dormant, and ' +
        'what is known broken right now. For historical state queries, use the ' +
        'continuum_get_state tool with an ISO timestamp.',
      mimeType: 'application/json',
    },
    {
      uri: RESOURCE_URIS.digestLatest,
      name: 'Latest Digest',
      description:
        'Composed narrative for the last 24 hours. V0 returns a template-based summary ' +
        'of recent checkpoints; V0.5+ adds ruvllm/ruv-FANN local-AI narratives.',
      mimeType: 'application/json',
    },
    {
      uri: RESOURCE_URIS.sessionBriefing,
      name: 'Session Briefing',
      description:
        'Layer-0 Progressive Disclosure — a pre-rendered markdown document combining ' +
        'current state, open todos, and recent activity. AI clients should read this ' +
        'FIRST at the start of every session: it is a single cheap read (~2–5 KB) that ' +
        'often answers a session\'s opening questions without any further tool calls. ' +
        'Pair with the continuum.session_start Prompt.',
      mimeType: 'text/markdown',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async request => {
  const { uri } = request.params;
  switch (uri) {
    case RESOURCE_URIS.openTodos: {
      const open = storage.listTodos({ status: 'open' });
      const inProgress = storage.listTodos({ status: 'in_progress' });
      const todos = [...open, ...inProgress];
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              { generatedAt: new Date().toISOString(), count: todos.length, todos },
              null,
              2,
            ),
          },
        ],
      };
    }

    case RESOURCE_URIS.stateCurrent: {
      const snapshot = storage.getStateAt();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              snapshot ?? {
                message:
                  'No checkpoints recorded yet. Use continuum_record_checkpoint to capture the first state.',
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case RESOURCE_URIS.digestLatest: {
      const snapshots = storage.listSnapshots(10);
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const recent = snapshots.filter(s => s.timestamp >= cutoff);
      const narrative = templateDigest(recent, '24h');
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                generatedAt: new Date().toISOString(),
                window: '24h',
                windowStart: cutoff,
                windowEnd: new Date().toISOString(),
                narrative,
                snapshotsInWindow: recent.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case RESOURCE_URIS.sessionBriefing: {
      const text = composeBriefing(storage, projectId);
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// ── Prompt registry ──────────────────────────────────────────────────────────
//
// V0 polish ships 2 Prompts that encode the Progressive Disclosure + citation
// disciplines the architecture depends on:
//
//   continuum.session_start  — Layer-0 → Layer-1 → Layer-3 warm-up workflow
//   continuum.cite           — Observation-ID citation discipline

const PROMPTS = [
  {
    name: 'continuum.session_start',
    description:
      'Canonical session warm-up. Instructs the AI to read continuum://session/briefing ' +
      'first (Layer-0), then use continuum_search_docs to filter by IDs (Layer-1) before ' +
      'fetching full content (Layer-3). Enforces the ~10x token-savings retrieval pattern.',
    text:
      'You are starting a session in a Continuum-enabled project. Before any other ' +
      'action, follow this protocol:\n\n' +
      '1. Read the resource `continuum://session/briefing` FIRST. It is a single cheap ' +
      'read (~2–5 KB) that combines current state, open todos, and recent activity. ' +
      'Most sessions can answer their opening question from this alone.\n\n' +
      '2. If the briefing answers the user\'s question, proceed. Otherwise use ' +
      '`continuum_search_docs` with specific keywords — that returns Layer-1 hits ' +
      '(compact IDs + titles, ~50–100 tokens each). Do NOT fetch full content yet.\n\n' +
      '3. Narrow the result set to the specific Observation IDs you actually need. For ' +
      'historical state queries use `continuum_get_state` with an ISO timestamp.\n\n' +
      '4. Only after narrowing should you fetch full content (Layer-3) — and only for ' +
      'the specific IDs you identified.\n\n' +
      '5. When asserting any fact about this project, cite the Observation ID(s) that ' +
      'prove it. See the `continuum.cite` Prompt for the format.\n\n' +
      '6. When you produce a commitment the user wants tracked, call ' +
      '`continuum_create_todo` with a concrete `verifyCommand` — a shell command that ' +
      'exits 0 when the commitment is satisfied. Todos without `verifyCommand` cannot ' +
      'be auto-resolved.\n\n' +
      'You may now proceed with the user\'s request.',
  },
  {
    name: 'continuum.cite',
    description:
      'Citation discipline. When asserting any fact about the project, cite the ' +
      'Observation ID(s) that prove it. If no citation is possible, say so explicitly ' +
      'rather than asserting unverified claims.',
    text:
      'When asserting any fact about this project, cite the Observation ID that proves ' +
      'it.\n\n' +
      'Format:\n\n' +
      '  > The voice cutoff bug was fixed in commit 2aa4f96a5 ' +
      '[obs:81223c05-4465-480c-a56d-14f665ffb581].\n\n' +
      '  > The StorageBackend abstraction was materialised on 2026-05-15 in commit ' +
      'e725ae7 [obs:<id>].\n\n' +
      'If you cannot cite an Observation ID for a claim, say so explicitly:\n\n' +
      '  > I don\'t have a Continuum observation that proves this — recommend recording ' +
      'one via `continuum_record_checkpoint`, or surface the question to the operator.\n\n' +
      'Never claim a fact about project state without either an Observation cite or an ' +
      'explicit "uncited" admission. The verify-then-dissolve discipline depends on ' +
      'provenance — facts without it cannot be re-verified later.',
  },
] as const;

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: PROMPTS.map(p => ({ name: p.name, description: p.description })),
}));

server.setRequestHandler(GetPromptRequestSchema, async request => {
  const { name } = request.params;
  const found = PROMPTS.find(p => p.name === name);
  if (!found) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return {
    description: found.description,
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: found.text },
      },
    ],
  };
});

// ── Briefing composer (Layer-0 Progressive Disclosure) ──────────────────────
//
// Composes current state + open todos + recent activity into a single markdown
// document the AI reads at session start. Token cost: ~2–5 KB depending on
// project size; replaces 3–5 tool calls the AI would otherwise make to warm up.

function composeBriefing(storage: StorageBackend, projectId: string): string {
  const now = new Date().toISOString();
  const snapshot = storage.getStateAt();
  const openTodos = storage.listTodos({ status: 'open' });
  const inProgressTodos = storage.listTodos({ status: 'in_progress' });
  const allSnapshots = storage.listSnapshots(10);
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = allSnapshots.filter(s => s.timestamp >= cutoff);

  const lines: string[] = [
    '# Continuum Session Briefing',
    '',
    `_Generated: ${now}_  `,
    `_Project: ${projectId}_`,
    '',
    '## Current State',
    '',
  ];

  if (snapshot) {
    lines.push(
      `**Snapshot:** \`${snapshot.id.slice(0, 8)}\`  `,
      `**Captured:** ${snapshot.timestamp}  `,
      `**Reason:** ${snapshot.reason}`,
      '',
      `### Active in production (${snapshot.active.length})`,
      '',
    );
    if (snapshot.active.length === 0) {
      lines.push('_(none recorded)_', '');
    } else {
      for (const e of snapshot.active) {
        lines.push(`- **${e.name}** — \`${e.where}\` — verifies via \`${e.verifyCommand}\``);
      }
      lines.push('');
    }

    lines.push(`### Known broken (${snapshot.broken.length})`, '');
    if (snapshot.broken.length === 0) {
      lines.push('_(none)_', '');
    } else {
      for (const e of snapshot.broken) {
        lines.push(`- **${e.name}** — \`${e.where}\` — ${e.description ?? 'no description'}`);
      }
      lines.push('');
    }
  } else {
    lines.push(
      '_No checkpoints recorded yet. Use `continuum_record_checkpoint` to capture the first state._',
      '',
    );
  }

  lines.push(
    '## Open Todos',
    '',
    `_${openTodos.length} open · ${inProgressTodos.length} in progress_`,
    '',
  );
  const allOpen = [...openTodos, ...inProgressTodos];
  if (allOpen.length === 0) {
    lines.push('_(pipeline empty)_', '');
  } else {
    for (const t of allOpen.slice(0, 20)) {
      const verify = t.verifyCommand ? ` — verifies: \`${t.verifyCommand}\`` : '';
      lines.push(`- [${t.status}] \`${t.id.slice(0, 8)}\` ${t.title}${verify}`);
    }
    if (allOpen.length > 20) {
      lines.push(`- _… ${allOpen.length - 20} more (use \`continuum_get_todos\`)_`);
    }
    lines.push('');
  }

  lines.push(
    '## Recent Activity (last 24h)',
    '',
    `_${recent.length} checkpoint${recent.length === 1 ? '' : 's'} in window_`,
    '',
  );
  if (recent.length === 0) {
    lines.push('_(no recent checkpoints)_', '');
  } else {
    for (const s of recent.slice(0, 10)) {
      lines.push(`- \`${s.timestamp.slice(0, 19)}Z\` — ${s.reason}`);
    }
    lines.push('');
  }

  lines.push(
    '## How to use this briefing',
    '',
    '1. If the answer is here, proceed directly — no further tool calls needed.',
    '2. Otherwise `continuum_search_docs` for Layer-1 hits (compact IDs + titles).',
    '3. Use `continuum_get_state` for historical state queries (ISO timestamp).',
    '4. Only fetch full content for narrowed-down IDs (Layer-3 — not yet shipped; coming V0.5).',
    '5. New commitments → `continuum_create_todo` with a concrete `verifyCommand`.',
    '6. Asserting facts → cite Observation IDs (see `continuum.cite` Prompt).',
    '',
  );

  return lines.join('\n');
}

// ── Template digest (V0 — replaced by ruvllm/ruv-FANN in V0.5) ────────────────

function templateDigest(snapshots: Array<{ timestamp: string; reason: string; active: StateEntry[]; broken: StateEntry[] }>, window: string): string {
  if (snapshots.length === 0) {
    return `No state snapshots in window "${window}". Use continuum_record_checkpoint to capture state.`;
  }
  const latest = snapshots[0]!;
  const lines = [
    `Continuum digest (${window}, ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}):`,
    '',
    `Latest checkpoint: ${latest.timestamp} — ${latest.reason}`,
    `Active in production: ${latest.active.length} entries`,
    `Known broken: ${latest.broken.length} entries`,
    '',
  ];
  if (snapshots.length > 1) {
    lines.push('Checkpoint history (newest → oldest):');
    for (const s of snapshots) {
      lines.push(`  - ${s.timestamp.slice(0, 19)}Z — ${s.reason}`);
    }
  }
  return lines.join('\n');
}

// ── Connect to stdio ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Suppress stdout — MCP communicates over stdio, console.log would corrupt protocol
process.stderr.write(`[continuum-mcp] project=${projectId} storage=${storage.dataLocation()}\n`);
