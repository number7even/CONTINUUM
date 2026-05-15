#!/usr/bin/env node
/**
 * Continuum MCP stdio server (V0).
 *
 * Exposes 7 tools + 1 resource to MCP-aware AI clients (Claude Code, Cursor,
 * Hermes Agent, etc.):
 *
 *   1. continuum_record_checkpoint  — write immutable state snapshot
 *   2. continuum_get_state           — fetch state at timestamp (or now)
 *   3. continuum_get_digest          — fetch composed narrative for window
 *   4. continuum_search_docs         — FTS5 keyword search over observations
 *   5. continuum_get_todos           — list todos, optional status filter
 *   6. continuum_create_todo         — create a new todo in the pipeline
 *   7. continuum_update_todo         — mutate status/title/etc. on a todo
 *
 * Resources:
 *   continuum://todos/open — JSON list of all open + in_progress todos.
 *
 * Progressive Disclosure scaffolding (ARCHITECTURE.md §5) is in place — V0
 * ships layer-1 (search returning compact hits) only. Layer-2 timeline +
 * Layer-3 batch get_observations land in V0.5.
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
// V0 ships one Resource — continuum://todos/open — the live open-pipeline view.
// V0 polish will add continuum://state/current, continuum://digest/latest,
// continuum://session/briefing once Aggregator + Digest writers land.

const OPEN_TODOS_URI = 'continuum://todos/open';

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: OPEN_TODOS_URI,
      name: 'Open Todos',
      description:
        'Live list of todos with status="open" or "in_progress". Cheap polling surface ' +
        'for scheduled clients (e.g. cron-driven Hermes runs) to check what work is queued.',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async request => {
  const { uri } = request.params;
  if (uri !== OPEN_TODOS_URI) {
    throw new Error(`Unknown resource: ${uri}`);
  }
  const open = storage.listTodos({ status: 'open' });
  const inProgress = storage.listTodos({ status: 'in_progress' });
  const todos = [...open, ...inProgress];
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            count: todos.length,
            todos,
          },
          null,
          2,
        ),
      },
    ],
  };
});

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
