/**
 * Continuum MCP server FACTORY — transport-agnostic builder.
 *
 * Exposes 10 tools + 4 Resources + 2 Prompts to MCP-aware AI clients
 * (Claude Code, Cursor, Hermes Agent, etc.). The same registry is used
 * by both transports:
 *
 *   - stdio  (./index.ts)  — local AI clients spawn the binary
 *   - http/sse (./http.ts) — remote AI clients connect over the network
 *
 * Progressive Disclosure (ARCHITECTURE.md §5) — 3-layer retrieval pattern:
 *
 *   Layer 1  continuum_search_docs       compact keyword hits (~50-100 tok)
 *   Layer 2  continuum_timeline           chronological context around an
 *                                          anchor (observation ID or ISO ts)
 *   Layer 3  continuum_get_observations   batch full-text fetch by narrowed
 *                                          IDs (~500-2000 tok per obs)
 *
 * Agents are instructed (via continuum.session_start Prompt) to use the
 * layers in order — Layer 1 → 2 → 3 — to keep the token budget lean.
 *
 * Call `buildServer(projectId)` to construct a configured Server +
 * lifecycle handle. Each call creates an independent storage instance
 * so multi-project / multi-session HTTP traffic doesn't share state.
 *
 * Structural note (W22-5 / Issue #12, 2026-05-31): the per-tool /
 * per-resource / per-prompt definitions live in:
 *
 *   src/tools/<each-tool>.ts            (10 files + tools/index.ts dispatcher)
 *   src/resources/<each-resource>.ts    (4 files + resources/index.ts reader)
 *   src/prompts/<each-prompt>.ts        (2 files + prompts/index.ts lookup)
 *   src/briefing.ts                     (composeBriefing + templateDigest helpers)
 *   src/tool-types.ts                   (shared ToolDefinition / Handler / etc.)
 *
 * This file (server.ts) is now the slim factory that wires the registry
 * modules to the four MCP request handlers — adding a new tool no longer
 * means editing this file.
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
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { openStorage, type StorageBackend } from '@continuum/core';

import { TOOL_DEFINITIONS, dispatchTool } from './tools/index.js';
import { RESOURCE_DEFINITIONS, readResource } from './resources/index.js';
import { PROMPTS, findPrompt } from './prompts/index.js';

/** Handle returned by buildServer — pair the Server with its lifecycle. */
export interface ServerHandle {
  server: Server;
  projectId: string;
  storage: StorageBackend;
  close(): void;
}

/**
 * Construct a configured Continuum MCP Server bound to a per-call storage
 * instance. Caller is responsible for connecting it to a transport and
 * invoking `handle.close()` on shutdown.
 */
export function buildServer(projectId: string): ServerHandle {
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

  // ── Tools ────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS as unknown as Array<Record<string, unknown>>,
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    // Cast at the boundary — same reason as the ReadResource handler below.
    // Our ToolResult shape matches the call-tool branch of the SDK's union
    // structurally; TS just can't narrow the union for us.
    type CallToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
    try {
      const result = await dispatchTool(name, args, storage);
      return result as unknown as CallToolResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errored: CallToolResult = {
        content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
        isError: true,
      };
      return errored as unknown as CallToolResult;
    }
  });

  // ── Resources ────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCE_DEFINITIONS as unknown as Array<Record<string, unknown>>,
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    // Cast at the boundary: the MCP SDK's ReadResource return type is a
    // discriminated union with optional fields (_meta, task) that we don't
    // populate; our ResourceContents shape matches the contents-only branch
    // structurally but TS can't narrow the union for us.
    const result = await readResource(request.params.uri, storage, projectId);
    return result as unknown as { contents: Array<{ uri: string; mimeType: string; text: string }> };
  });

  // ── Prompts ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map(p => ({ name: p.name, description: p.description })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async request => {
    const found = findPrompt(request.params.name);
    if (!found) {
      throw new Error(`Unknown prompt: ${request.params.name}`);
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

  // Return the handle. Transport connection is the caller's responsibility
  // (./index.ts wires stdio; ./http.ts wires HTTP + SSE).
  return {
    server,
    projectId,
    storage,
    close() {
      storage.close();
    },
  };
}
