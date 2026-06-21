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
import {
  openStorage,
  sanitiseTenantId,
  type StorageBackend,
} from '@number7even/continuum-core';

import { TOOL_DEFINITIONS, dispatchTool } from './tools/index.js';
import { RESOURCE_DEFINITIONS, readResource } from './resources/index.js';
import { PROMPTS, findPrompt } from './prompts/index.js';

/** Handle returned by buildServer — pair the Server with its lifecycle. */
export interface ServerHandle {
  server: Server;
  /** The tenant the server was bound to (after sanitisation). */
  tenantId: string;
  storage: StorageBackend;
  /** Close the Server; close the storage too IFF this handle owns it
   *  (i.e. opts.storage was not passed to buildServer). When the
   *  caller passes a borrowed storage (e.g. from TenantRegistry), the
   *  registry owns the storage lifecycle and close() is a no-op on
   *  storage. */
  close(): void;
}

/** Options for buildServer. When `storage` is provided, the caller
 *  RETAINS ownership of the storage lifecycle — close() on the handle
 *  will NOT close the storage. Used by the W27-5 TenantRegistry which
 *  caches StorageBackend instances across multiple sessions. */
export interface BuildServerOptions {
  storage?: StorageBackend;
}

/**
 * Construct a configured Continuum MCP Server bound to a per-call,
 * TENANT-SCOPED storage instance.
 *
 * W27-2: the parameter semantically widens from "project name" to
 * "tenant identifier." `openStorage(tenantId)` sanitises at the boundary
 * — adversarial input throws here (caller maps to HTTP 400 on the
 * HTTP/SSE path, exit 1 on CLI). Different `tenantId` arguments produce
 * different `Server` instances bound to different filesystem paths;
 * nothing is shared across tenants except read-only static config
 * (tool definitions, prompt registry, resource registry).
 *
 * **Architectural invariant (W27-2 static grep gate):** no file under
 * `packages/mcp-server/src/tools/` may call `openStorage` directly.
 * Every tool handler reaches storage through the `ServerHandle.storage`
 * passed in by this factory. Bypassing this rule means a tool could
 * read/write a different tenant's data than the one the caller
 * authenticated for — exactly the leak Path A is built to prevent.
 *
 * @throws Error('continuum: invalid tenant identifier') if the input
 *         fails sanitiseTenantId.
 */
export function buildServer(
  tenantId: string,
  opts: BuildServerOptions = {},
): ServerHandle {
  // Sanitise ONCE here so we can expose the canonical identifier on
  // ServerHandle.tenantId (callers downstream — logging, request
  // context, audit trails — see the same string that became the
  // filesystem segment). openStorage also sanitises, so a bypass at
  // either layer still throws. P2 multi-proof discipline.
  const canonicalTenantId = sanitiseTenantId(tenantId);
  if (canonicalTenantId === null) {
    throw new Error('continuum: invalid tenant identifier');
  }
  // W27-5: borrowed-storage path. When the caller passes opts.storage,
  // we treat it as a lease — close() on the returned handle won't
  // touch it. Used by TenantRegistry to share one open backend across
  // multiple concurrent /sse sessions for the same tenant.
  const ownsStorage = opts.storage === undefined;
  const storage: StorageBackend = opts.storage ?? openStorage(canonicalTenantId);

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
    const result = await readResource(request.params.uri, storage, canonicalTenantId);
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
    tenantId: canonicalTenantId,
    storage,
    close() {
      // W27-5: only close storage if buildServer opened it. When the
      // caller passed opts.storage (TenantRegistry path), the registry
      // owns the lifecycle.
      if (ownsStorage) storage.close();
    },
  };
}
