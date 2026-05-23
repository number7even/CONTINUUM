#!/usr/bin/env node
/**
 * Continuum CLI (V0 polish).
 *
 * Three commands for new operators — get Continuum running without
 * hand-editing `.mcp.json` or memorising paths:
 *
 *   continuum init    — create the project DB + print MCP registration snippet
 *   continuum start   — run the MCP stdio server for the current project
 *   continuum status  — print current state + todo counts + data location
 *
 * Project-id resolution (highest precedence first):
 *   1. --project-id <id>     CLI flag
 *   2. CONTINUUM_PROJECT_ID  env var
 *   3. basename of CWD       (e.g. "vc-hospitality" if invoked from there)
 *   4. "default"             final fallback
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { basename } from 'node:path';
import { openStorage } from '@continuum/core';

// ── Argv parsing ──────────────────────────────────────────────────────────────

interface ParsedArgs {
  command: string | undefined;
  projectId: string | undefined;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command: string | undefined;
  let projectId: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') {
      help = true;
    } else if (a === '--project-id' || a === '-p') {
      projectId = args[++i];
    } else if (a !== undefined && !a.startsWith('-') && command === undefined) {
      command = a;
    }
  }

  return { command, projectId, help };
}

function resolveProjectId(flagValue?: string): string {
  if (flagValue && flagValue.trim()) return flagValue.trim();
  const envValue = process.env.CONTINUUM_PROJECT_ID;
  if (envValue && envValue.trim()) return envValue.trim();
  const cwdBase = basename(process.cwd());
  if (cwdBase && cwdBase !== '/' && cwdBase !== '.') return cwdBase;
  return 'default';
}

// ── help / usage ──────────────────────────────────────────────────────────────

const USAGE = `continuum — persistent intelligence layer for AI coding assistants

USAGE
  continuum <command> [options]

COMMANDS
  init        Create the project DB and print MCP registration snippet.
  start       Run the MCP stdio server for this project.
  status      Print current state, todo counts, and data location.

OPTIONS
  --project-id, -p <id>   Project ID (default: $CONTINUUM_PROJECT_ID or cwd basename).
  --help, -h              Show this help.

EXAMPLES
  continuum init --project-id my-project
  continuum status
  CONTINUUM_PROJECT_ID=vc-hospitality continuum start

LEARN MORE
  https://github.com/number7even/CONTINUUM
`;

function printUsage(): void {
  process.stdout.write(USAGE);
}

// ── continuum init ────────────────────────────────────────────────────────────

function commandInit(projectId: string): void {
  const storage = openStorage(projectId);
  const dataPath = storage.dataLocation();
  storage.close();

  // Find the MCP server binary so the registration snippet is copy-paste ready.
  // Resolve through node's module resolution rather than guessing paths — this
  // makes the printed snippet correct whether @continuum/mcp-server was
  // installed via npx, npm install -g, or as a workspace dep.
  let mcpServerBinPath: string;
  try {
    // Resolve the package's main entry; the bin file in dist/index.js sits
    // next to it (the package.json `bin` field points there).
    const main = import.meta.resolve('@continuum/mcp-server');
    mcpServerBinPath = new URL(main).pathname;
  } catch {
    mcpServerBinPath = '<install-@continuum/mcp-server-first>';
  }

  const mcpSnippet = {
    mcpServers: {
      continuum: {
        command: 'node',
        args: [mcpServerBinPath],
        env: { CONTINUUM_PROJECT_ID: projectId },
      },
    },
  };

  process.stdout.write(
    [
      `✓ Continuum initialised`,
      ``,
      `  Project ID:  ${projectId}`,
      `  Data path:   ${dataPath}`,
      ``,
      `MCP registration — add to ~/.claude.json or .mcp.json:`,
      ``,
      JSON.stringify(mcpSnippet, null, 2),
      ``,
      `Next steps:`,
      `  1. Add the snippet above to your AI client's MCP config.`,
      `  2. Restart the client so it picks up the new server.`,
      `  3. Run \`continuum status\` here to confirm the DB is reachable.`,
      `  4. (Optional) Capture the first checkpoint with the`,
      `     continuum_record_checkpoint tool inside your AI client,`,
      `     or wait for the V0-polish STATE.md parser (next ship).`,
      ``,
    ].join('\n'),
  );
}

// ── continuum status ──────────────────────────────────────────────────────────

function commandStatus(projectId: string): void {
  const storage = openStorage(projectId);
  try {
    const snapshot = storage.getStateAt();
    const open = storage.listTodos({ status: 'open' });
    const inProgress = storage.listTodos({ status: 'in_progress' });
    const blocked = storage.listTodos({ status: 'blocked' });
    const done = storage.listTodos({ status: 'done' });
    const dataPath = storage.dataLocation();

    const lines = [
      `Continuum status — project: ${projectId}`,
      ``,
      `  Data path:   ${dataPath}`,
    ];

    if (snapshot) {
      lines.push(
        ``,
        `  Latest snapshot:`,
        `    id:         ${snapshot.id.slice(0, 8)}`,
        `    timestamp:  ${snapshot.timestamp}`,
        `    reason:     ${snapshot.reason}`,
        `    active:     ${snapshot.active.length}`,
        `    dormant:    ${snapshot.dormant.length}`,
        `    broken:     ${snapshot.broken.length}`,
      );
    } else {
      lines.push(``, `  Latest snapshot:  (none — run continuum_record_checkpoint to capture one)`);
    }

    lines.push(
      ``,
      `  Todos:`,
      `    open:         ${open.length}`,
      `    in_progress:  ${inProgress.length}`,
      `    blocked:      ${blocked.length}`,
      `    done:         ${done.length}`,
      ``,
    );
    process.stdout.write(lines.join('\n'));
  } finally {
    storage.close();
  }
}

// ── continuum start ───────────────────────────────────────────────────────────

async function commandStart(projectId: string): Promise<void> {
  // Set env var BEFORE importing the MCP server — the server reads it at
  // module init time when it constructs the storage backend.
  process.env.CONTINUUM_PROJECT_ID = projectId;

  // Import the MCP server module — it auto-connects to stdio via top-level
  // await. The process stays alive on stdin reads after the import resolves.
  await import('@continuum/mcp-server');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, projectId: projectIdFlag, help } = parseArgs(process.argv);

  if (help || !command) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  const projectId = resolveProjectId(projectIdFlag);

  switch (command) {
    case 'init':
      commandInit(projectId);
      return;

    case 'status':
      commandStatus(projectId);
      return;

    case 'start':
      await commandStart(projectId);
      return;

    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printUsage();
      process.exit(1);
  }
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`continuum: ${message}\n`);
  process.exit(1);
});
