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
 *   1. --project-id <id>     CLI flag         (preserved as given)
 *   2. CONTINUUM_PROJECT_ID  env var          (preserved as given)
 *   3. basename of CWD       LOWERCASED       (silent-foot-gun fix per Issue #9)
 *   4. "default"             final fallback
 *
 * Why lowercase only the cwd fallback? Explicit values (flag, env) are
 * user-typed — preserve whatever case the operator chose. The CWD basename
 * is *implicit* — if the user happens to clone the repo into "MyProject"
 * on one machine and "myproject" on another, both should resolve to the
 * same Continuum DB. Folder-case is a filesystem accident, not an intent.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { basename, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  openStorage,
  parseStateMdToCheckpoint,
  type StorageBackend,
} from '@continuum/core';

// ── Argv parsing ──────────────────────────────────────────────────────────────

interface ParsedArgs {
  command: string | undefined;
  projectId: string | undefined;
  stateMd: string | undefined;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let command: string | undefined;
  let projectId: string | undefined;
  let stateMd: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-h' || a === '--help') {
      help = true;
    } else if (a === '--project-id' || a === '-p') {
      projectId = args[++i];
    } else if (a === '--state-md') {
      stateMd = args[++i];
    } else if (a !== undefined && a.startsWith('--state-md=')) {
      stateMd = a.split('=').slice(1).join('=');
    } else if (a !== undefined && !a.startsWith('-') && command === undefined) {
      command = a;
    }
  }

  return { command, projectId, stateMd, help };
}

export function resolveProjectId(flagValue?: string, opts?: { cwd?: string }): string {
  if (flagValue && flagValue.trim()) return flagValue.trim();
  const envValue = process.env.CONTINUUM_PROJECT_ID;
  if (envValue && envValue.trim()) return envValue.trim();
  // Issue #9 — lowercase the implicit cwd-basename fallback so folder-case
  // accidents (cloning into MyProject vs myproject) don't silently fork the DB.
  // Explicit flag / env values are preserved above; this normalisation
  // applies only to the implicit derivation.
  const cwdBase = basename(opts?.cwd ?? process.cwd()).toLowerCase();
  if (cwdBase && cwdBase !== '/' && cwdBase !== '.') return cwdBase;
  return 'default';
}

// ── help / usage ──────────────────────────────────────────────────────────────

const USAGE = `continuum — persistent intelligence layer for AI coding assistants

USAGE
  continuum <command> [options]

COMMANDS
  init           Create the project DB and print MCP registration snippet.
                 Auto-imports ./STATE.md as the first checkpoint if found
                 and no checkpoints exist yet.
  start          Run the MCP stdio server for this project.
  serve          Run the MCP HTTP/SSE server (V1 — remote / hosted clients).
                 Requires $CONTINUUM_HTTP_TOKEN (Bearer shared secret).
  status         Print current state, todo counts, and data location.
  import-state   Parse a STATE.md and record it as a new checkpoint. Always
                 creates a checkpoint (use this to re-snapshot after edits).

OPTIONS
  --project-id, -p <id>   Project ID (default: $CONTINUUM_PROJECT_ID or cwd basename).
  --state-md <path>       Path to STATE.md (default: ./STATE.md). Used by
                          init (auto-import) and import-state (manual).
  --help, -h              Show this help.

EXAMPLES
  continuum init --project-id my-project
  continuum status
  continuum import-state --state-md=./STATE.md
  CONTINUUM_PROJECT_ID=vc-hospitality continuum start
  CONTINUUM_HTTP_TOKEN=$(openssl rand -hex 32) continuum serve

LEARN MORE
  https://github.com/number7even/CONTINUUM
`;

function printUsage(): void {
  process.stdout.write(USAGE);
}

// ── STATE.md helpers ─────────────────────────────────────────────────────────

function resolveStateMdPath(override?: string): string {
  return override ? resolvePath(override) : resolvePath(process.cwd(), 'STATE.md');
}

interface StateMdImportSummary {
  imported: boolean;
  reason?: string;
  snapshotId?: string;
  totals?: { active: number; dormant: number; broken: number };
  warnings?: string[];
  skipReason?: string;
}

function importStateMdInto(
  storage: StorageBackend,
  stateMdPath: string,
  triggerLabel: string,
): StateMdImportSummary {
  if (!existsSync(stateMdPath)) {
    return { imported: false, skipReason: `no STATE.md found at ${stateMdPath}` };
  }
  let text: string;
  try {
    text = readFileSync(stateMdPath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { imported: false, skipReason: `could not read ${stateMdPath}: ${msg}` };
  }
  const reason = `STATE.md import (${triggerLabel}) — ${stateMdPath}`;
  const { input, warnings, totals } = parseStateMdToCheckpoint(text, reason);
  if (totals.active + totals.dormant + totals.broken === 0) {
    return {
      imported: false,
      skipReason: `STATE.md parsed but produced zero entries (warnings: ${warnings.length})`,
      warnings,
    };
  }
  const snapshot = storage.recordCheckpoint(input);
  return {
    imported: true,
    reason,
    snapshotId: snapshot.id,
    totals,
    warnings,
  };
}

function printStateMdSummary(summary: StateMdImportSummary, stateMdPath: string): void {
  if (summary.imported) {
    process.stdout.write(
      [
        `✓ Imported ${stateMdPath} → checkpoint ${summary.snapshotId!.slice(0, 8)}`,
        `    active: ${summary.totals!.active}  dormant: ${summary.totals!.dormant}  broken: ${summary.totals!.broken}`,
      ].join('\n') + '\n',
    );
    if (summary.warnings && summary.warnings.length > 0) {
      for (const w of summary.warnings) {
        process.stderr.write(`  warning: ${w}\n`);
      }
    }
  } else if (summary.skipReason) {
    process.stderr.write(`  STATE.md: ${summary.skipReason}\n`);
  }
}

// ── continuum init ────────────────────────────────────────────────────────────

function commandInit(projectId: string, stateMdOverride: string | undefined): void {
  const storage = openStorage(projectId);
  const dataPath = storage.dataLocation();

  // Auto-import STATE.md as the first checkpoint — only if one is present
  // AND no checkpoints exist yet (avoid noise on re-running init).
  const stateMdPath = resolveStateMdPath(stateMdOverride);
  const existingSnapshots = storage.listSnapshots(1);
  let stateMdNote = '';
  if (existsSync(stateMdPath) && existingSnapshots.length === 0) {
    const summary = importStateMdInto(storage, stateMdPath, 'continuum init');
    printStateMdSummary(summary, stateMdPath);
    if (summary.imported) {
      stateMdNote =
        `\n  Auto-imported STATE.md as first checkpoint (${summary.snapshotId!.slice(0, 8)}).`;
    }
  } else if (existsSync(stateMdPath) && existingSnapshots.length > 0) {
    stateMdNote =
      `\n  STATE.md detected but checkpoints already exist — skipping auto-import.\n  Use 'continuum import-state' to force a fresh checkpoint from STATE.md.`;
  }

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
      `  Data path:   ${dataPath}${stateMdNote}`,
      ``,
      `MCP registration — add to ~/.claude.json or .mcp.json:`,
      ``,
      JSON.stringify(mcpSnippet, null, 2),
      ``,
      `Next steps:`,
      `  1. Add the snippet above to your AI client's MCP config.`,
      `  2. Restart the client so it picks up the new server.`,
      `  3. Run \`continuum status\` here to confirm the DB is reachable.`,
      `  4. (Optional) If STATE.md was not auto-imported, run`,
      `     'continuum import-state --state-md=./STATE.md' to capture`,
      `     a fresh checkpoint, or use continuum_record_checkpoint from`,
      `     inside your AI client.`,
      ``,
    ].join('\n'),
  );
}

// ── continuum import-state ───────────────────────────────────────────────────

function commandImportState(projectId: string, stateMdOverride: string | undefined): void {
  const stateMdPath = resolveStateMdPath(stateMdOverride);
  if (!existsSync(stateMdPath)) {
    process.stderr.write(
      `continuum: STATE.md not found at ${stateMdPath}\n` +
      `           pass --state-md=/abs/path to point at a different file.\n`,
    );
    process.exit(2);
  }
  const storage = openStorage(projectId);
  try {
    const summary = importStateMdInto(storage, stateMdPath, 'continuum import-state');
    printStateMdSummary(summary, stateMdPath);
    if (!summary.imported) process.exit(1);
  } finally {
    storage.close();
  }
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

// ── continuum serve (V1 HTTP/SSE) ────────────────────────────────────────────

async function commandServe(projectId: string): Promise<void> {
  if (!process.env.CONTINUUM_HTTP_TOKEN || !process.env.CONTINUUM_HTTP_TOKEN.trim()) {
    process.stderr.write(
      'continuum serve: $CONTINUUM_HTTP_TOKEN required. Generate one with `openssl rand -hex 32` ' +
        'and re-launch, e.g.\n  CONTINUUM_HTTP_TOKEN=$(openssl rand -hex 32) continuum serve\n',
    );
    process.exit(1);
  }
  process.env.CONTINUUM_PROJECT_ID = projectId;
  // The http.ts module is the bin entry — importing it boots Express +
  // SSEServerTransport and listens on $CONTINUUM_HTTP_PORT (default 7878).
  await import('@continuum/mcp-server/dist/http.js');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, projectId: projectIdFlag, stateMd, help } = parseArgs(process.argv);

  if (help || !command) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  const projectId = resolveProjectId(projectIdFlag);

  switch (command) {
    case 'init':
      commandInit(projectId, stateMd);
      return;

    case 'status':
      commandStatus(projectId);
      return;

    case 'start':
      await commandStart(projectId);
      return;

    case 'serve':
      await commandServe(projectId);
      return;

    case 'import-state':
      commandImportState(projectId, stateMd);
      return;

    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printUsage();
      process.exit(1);
  }
}

// Only auto-execute when invoked as the entry point (not when imported by
// tests / consumers). Without this gate, importing `./index.js` in a test
// would unconditionally run the CLI and print USAGE to stdout.
const isEntryPoint =
  process.argv[1] !== undefined &&
  process.argv[1] === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  main().catch(err => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`continuum: ${message}\n`);
    process.exit(1);
  });
}
