#!/usr/bin/env node
/**
 * Continuum MCP — stdio transport entry point.
 *
 * Local AI clients (Claude Code, Cursor, Hermes) spawn this binary as a
 * child process and speak the MCP protocol over stdio. For HTTP/SSE
 * (remote / hosted) see ./http.ts.
 *
 * Registration example (~/.claude.json or .mcp.json):
 *
 *   {
 *     "mcpServers": {
 *       "continuum": {
 *         "command": "node",
 *         "args": ["/abs/path/to/dist/index.js"],
 *         "env": { "CONTINUUM_PROJECT_ID": "vc-hospitality" }
 *       }
 *     }
 *   }
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';

const projectId = process.env.CONTINUUM_PROJECT_ID ?? 'default';
const handle = buildServer(projectId);

const shutdown = (): void => {
  handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await handle.server.connect(transport);

// stdout is reserved for MCP protocol — any diagnostic must go to stderr.
process.stderr.write(
  `[continuum-mcp] project=${projectId} storage=${handle.storage.dataLocation()} transport=stdio\n`,
);
