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
import { basename, dirname, join as joinPath, resolve as resolvePath } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, watch as fsWatch, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import {
  openStorage,
  parseStateMdToCheckpoint,
  type StorageBackend,
} from '@number7even/continuum-core';

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
                 Also nudges if a newer CLI is published (never auto-installs).
  upgrade        Re-sync the ICM "folders over agents" scaffold into this project
                 (idempotent; --force refreshes templates) + report engine updates.
  import-state   Parse a STATE.md and record it as a new checkpoint. Always
                 creates a checkpoint (use this to re-snapshot after edits).
  verify         Re-run every verify_command in the latest snapshot. Exit code
                 = number of failures (0 = all green). Use this to confirm
                 state-snapshot claims are still true on the current machine.
  adapter        Run a source adapter (docs|git) once, or with --watch as a
                 long-running daemon that re-syncs on file change.
                 Examples:
                   continuum adapter docs
                   continuum adapter docs --watch --docs-dir=./docs
                   continuum adapter git  --watch --repo-dir=.
  reindex        Rebuild the hybrid backend's vector store from the SQLite
                 ground-truth. Idempotent — safe to re-run. Required after
                 corruption, ruvector.db deletion, or upgrading the
                 embedding model.
  migrate        One-time migration of a V0 SQLite-only project DB into the
                 V0.5 hybrid backend. Backs up the SQLite file first, then
                 builds the vector store from existing observations.
                 Examples:
                   continuum migrate --backend hybrid

OPTIONS
  --project-id, -p <id>   Project ID (default: $CONTINUUM_PROJECT_ID or cwd basename).
  --state-md <path>       Path to STATE.md (default: ./STATE.md). Used by
                          init (auto-import) and import-state (manual).
  --help, -h              Show this help.

EXAMPLES
  continuum init --project-id my-project
  continuum status
  continuum verify                              # exit 0 if every verify_command passes
  continuum import-state --state-md=./STATE.md
  continuum adapter docs --watch                # daemon mode, 2s debounce
  continuum adapter git --watch --repo-dir=.    # re-ingest on every commit
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

// ── ICM scaffold — "folders over agents" (created by `continuum init`) ───────────

const ICM_REBOUND =
  'If you do not find what you need in this floor, return to the root `router.md` (the Map). Never guess or hallucinate across floors — come back to the Map.';

function icmFloor(title: string, purpose: string): string {
  return `# ${title} — local context\n\n${purpose}\n\n> **Rebound rule:** ${ICM_REBOUND}\n`;
}

/** The standard ICM file tree Continuum scaffolds into a project on init. */
function icmFiles(projectId: string): Record<string, string> {
  return {
    'agents.md':
      `# ${projectId} — Prime Mission (agents.md)\n\n` +
      `This is the **Lobby**. When you wake up in this workspace, read this file, then the Map (\`router.md\`).\n\n` +
      `## Identity & laws\n` +
      `- This workspace uses the **Interpretable Context Methodology** — *"folders over agents."* The file system IS the architecture, routing, and memory. No fragile agent framework governs; the folders do.\n` +
      `- **Verify over generate:** nothing is "done" without mechanical proof (a passing command / a checkpoint). The AI shapes language; file-system discipline holds the verifiable truth.\n` +
      `- **Never over-consume context:** fetch skills/reference only when a task needs them (see \`skills/\`).\n\n` +
      `## How to work here\n` +
      `1. Read \`router.md\` — the Map. It routes you to the right floor by intent.\n` +
      `2. Each floor has its own \`agents.md\` (local context) + the rebound rule.\n` +
      `3. "Pick up" = read the current state (\`continuum_get_state\` if the MCP server is registered) + the relevant floor.\n` +
      `4. "Hand off" = write progress to an artifact + (optionally) stamp a checkpoint.\n`,
    'router.md':
      `# router.md — The Map (Interpretable Context Methodology)\n\n` +
      `> Read \`agents.md\` first (the Prime Mission). This is the Map — it routes you to the right *floor* by intent.\n` +
      `> **Rebound rule:** if a floor's local context doesn't answer your question, return HERE. Never guess across floors.\n\n` +
      `## Session start\n` +
      `If Continuum's MCP server is registered (\`.mcp.json\`), open with \`continuum_get_state\` + \`continuum://session/briefing\` — start warm, not cold. Search before fetching (search → timeline → get_observations).\n\n` +
      `## Floors — route by intent\n` +
      `| If you need to… | Go to |\n|---|---|\n` +
      `| Onboard / see the build plan & validation gates | \`01-start-here/\` |\n` +
      `| The deterministic core / execution logic | \`03-code/\` |\n` +
      `| The app shell / working artifacts | \`app/\` |\n` +
      `| Reference material, schemas, regression fixtures | \`reference/\` |\n` +
      `| Fetch-on-demand know-how (don't preload) | \`skills/\` |\n` +
      `| The audit ledger / hand-offs (append-only) | \`artifacts/\` |\n\n` +
      `## Artifacts & hand-offs\n` +
      `Working outputs are written to the file that owns them. A hand-off is a documented artifact (+ a checkpoint) so state is verifiable, not remembered.\n`,
    '01-start-here/agents.md': icmFloor('01-start-here (Lobby)', 'Onboarding + the phased build plan. New here? Read `BUILD-PLAN.md`, then return to the Map.'),
    '01-start-here/BUILD-PLAN.md':
      `# Build Plan — phased ledger (validation gates)\n\n` +
      `> The master feature-status ledger. **No new code is written until the current phase is validated.**\n` +
      `> Append-only. Each phase lists: goal · hard precondition · deliverables · the gate that must pass to advance.\n\n` +
      `## Phase 0 — <name>\n- [ ] goal:\n- [ ] gate (verify):\n`,
    '03-code/agents.md': icmFloor('03-code (Execution Floor)', 'The deterministic core — hard-coded logic that maintains verifiable truth. Keep AI generation OUT of this floor; it is protected from hallucination by construction.'),
    'app/agents.md': icmFloor('app (Working Artifacts / Shell)', 'The application shell + human-in-the-loop surfaces (auth, UI, consent gates). Working artifacts land here.'),
    'skills/README.md':
      `# skills — fetch on demand\n\n` +
      `How-to knowledge lives here as separate files, **fetched only when a task needs them** — never preloaded. This keeps the context window small and token cost low. Add one skill per file; reference it from a floor's \`agents.md\` when that floor needs it.\n`,
    'reference/agents.md': icmFloor('reference (Reference Material & Regression)', 'Input schemas, config, and `fixtures/` — the append-only deterministic baseline for regression testing.'),
    'reference/fixtures/.gitkeep': '',
    'artifacts/agents.md': icmFloor('artifacts (Audit Ledger)', 'Append-only working outputs, run metrics, and hand-off documents. The audit trail of what was produced and proven.'),
  };
}

/**
 * Write the ICM tree into `root`. Idempotent by default (never clobbers existing files);
 * `force` refreshes the structural templates. `CLAUDE.md` is NEVER force-overwritten — it may
 * be the client's customised entry (P8: do not extract/overwrite what's theirs).
 */
function scaffoldIcm(root: string, projectId: string, opts: { force?: boolean } = {}): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of Object.entries(icmFiles(projectId))) {
    const abs = joinPath(root, rel);
    if (existsSync(abs) && !opts.force) { skipped.push(rel); continue; }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    created.push(rel);
  }
  const claudeAbs = joinPath(root, 'CLAUDE.md'); // only-if-absent, even under --force
  if (!existsSync(claudeAbs)) {
    writeFileSync(
      claudeAbs,
      `# ${projectId}\n\n> This workspace uses the Interpretable Context Methodology (*"folders over agents"*).\n` +
        `> **Read [\`agents.md\`](./agents.md) first** (the Prime Mission), then [\`router.md\`](./router.md) (the Map).\n`,
    );
    created.push('CLAUDE.md');
  } else skipped.push('CLAUDE.md');
  return { created, skipped };
}

// ── update nudge + `continuum upgrade` ───────────────────────────────────────
function installedCliVersion(): string {
  try {
    const pkg = joinPath(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return (JSON.parse(readFileSync(pkg, 'utf8')).version as string) ?? '0.0.0';
  } catch { return '0.0.0'; }
}
async function latestCliVersion(timeoutMs = 2500): Promise<string | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch('https://registry.npmjs.org/@number7even/continuum-cli/latest', { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === 'string' ? body.version : null;
  } catch { return null; }
}
function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true; if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false; }
  return false;
}
/** Non-blocking, fail-safe update nudge — prints a one-liner, NEVER auto-installs (P7). */
async function updateNudge(): Promise<void> {
  const cur = installedCliVersion();
  const latest = await latestCliVersion();
  if (latest && semverGt(latest, cur)) {
    process.stderr.write(
      `\n  ⬆ Update available: @number7even/continuum-cli ${cur} → ${latest}\n` +
        `    npm i -g @number7even/continuum-cli@latest   (or run: continuum upgrade)\n`,
    );
  }
}
async function commandUpgrade(projectId: string): Promise<void> {
  const force = process.argv.includes('--force');
  const { created, skipped } = scaffoldIcm(process.cwd(), projectId, { force });
  process.stdout.write(`✓ ICM scaffold ${force ? 'refreshed (--force)' : 'synced'} — ${created.length} written, ${skipped.length} kept\n`);
  for (const f of created) process.stdout.write(`    + ${f}\n`);
  const cur = installedCliVersion();
  const latest = await latestCliVersion();
  if (latest && semverGt(latest, cur)) {
    process.stdout.write(
      `\n  ⬆ Engine update available: ${cur} → ${latest}\n` +
        `    npm:    npm i -g @number7even/continuum-cli@latest\n` +
        `    source: git pull && npm install && npm run build   (in the CONTINUUM checkout)\n` +
        `    then restart your AI client to reload the MCP server.\n`,
    );
  } else {
    process.stdout.write(`\n  Engine ${cur} is current${latest ? '' : ' (npm check offline)'}.\n`);
  }
}

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

  // ICM scaffold — "folders over agents" is Continuum's standard project structure.
  // Idempotent (never clobbers existing files); opt out with `continuum init --no-icm`.
  let icmNote = '';
  if (!process.argv.includes('--no-icm')) {
    const { created, skipped } = scaffoldIcm(process.cwd(), projectId);
    icmNote = created.length
      ? `\n  ICM structure scaffolded (${created.length} new: agents.md · router.md · CLAUDE.md · 01-start-here · 03-code · app · skills · reference · artifacts).`
      : `\n  ICM structure already present (${skipped.length} files) — left untouched.`;
  }

  // Find the MCP server binary so the registration snippet is copy-paste ready.
  // Resolve through node's module resolution rather than guessing paths — this
  // makes the printed snippet correct whether @number7even/continuum-mcp-server was
  // installed via npx, npm install -g, or as a workspace dep.
  let mcpServerBinPath: string;
  try {
    // Resolve the package's main entry; the bin file in dist/index.js sits
    // next to it (the package.json `bin` field points there).
    const main = import.meta.resolve('@number7even/continuum-mcp-server');
    mcpServerBinPath = new URL(main).pathname;
  } catch {
    mcpServerBinPath = '<install-@number7even/continuum-mcp-server-first>';
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
      `  Data path:   ${dataPath}${stateMdNote}${icmNote}`,
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

async function commandStatus(projectId: string): Promise<void> {
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
  await updateNudge(); // fail-safe update nudge (never auto-installs — P7)
}

// ── continuum adapter <name> [--watch] ────────────────────────────────────────
//
// Issue #16 / W23-5. Operator-facing wrapper over the two existing adapter
// binaries (@number7even/continuum-adapter-docs, @number7even/continuum-adapter-git). Two modes:
//
//   continuum adapter docs                — run once, exit
//   continuum adapter docs --watch        — run once, then watch + debounce
//
// Why a CLI wrapper instead of `--watch` inside each adapter?
//
//   1. Keeps adapter packages simple — they remain pure "sync once and
//      exit" tools. The lifecycle concern (watch / debounce / signal
//      handling) lives in the operator surface, not the data layer.
//   2. One debounce policy across all adapters. Future adapters
//      (claude-mem, sona, taskmaster) drop in by name without rewriting
//      watch logic each time.
//   3. The adapter sub-process is short-lived per cycle — a crash on one
//      sync doesn't kill the watcher.
//
// Watch targets:
//   docs → docs-dir, recursive, .md/.mdx files only
//   git  → .git/logs/HEAD (single-file watch, fires on commit/checkout/reset)
//
// Debounce: 2 seconds (spec), single timer reset per change event.
// Idempotency: provided by the adapters' upsertObservation primitive —
// re-running on the same content is a no-op at the DB row level.

const ADAPTER_NAMES = ['docs', 'git'] as const;
type AdapterName = (typeof ADAPTER_NAMES)[number];

interface AdapterOpts {
  watch: boolean;
  docsDir?: string;
  repoDir?: string;
}

function parseAdapterArgs(argv: string[]): { name: AdapterName | undefined; opts: AdapterOpts } {
  // argv has already been sliced past 'node' + 'index.js'. Find the
  // 'adapter' positional, then scan everything after it.
  const args = argv.slice(2);
  const start = args.indexOf('adapter');
  const opts: AdapterOpts = { watch: false };
  let name: AdapterName | undefined;
  if (start === -1) return { name, opts };
  for (let i = start + 1; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === '--watch') opts.watch = true;
    else if (a.startsWith('--docs-dir=')) opts.docsDir = resolvePath(a.split('=').slice(1).join('='));
    else if (a.startsWith('--repo-dir=')) opts.repoDir = resolvePath(a.split('=').slice(1).join('='));
    else if (!a.startsWith('-') && name === undefined) {
      if ((ADAPTER_NAMES as readonly string[]).includes(a)) name = a as AdapterName;
    }
  }
  return { name, opts };
}

function resolveAdapterBin(name: AdapterName): string {
  const pkg = `@number7even/continuum-adapter-${name}`;
  try {
    return fileURLToPath(import.meta.resolve(pkg));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`cannot resolve ${pkg} bin — is it installed in this workspace? (${msg})`);
  }
}

function commandAdapter(projectId: string): void {
  const { name, opts } = parseAdapterArgs(process.argv);
  if (!name) {
    process.stderr.write(
      `continuum adapter: name required — one of ${ADAPTER_NAMES.join(', ')}\n` +
        `  examples:\n` +
        `    continuum adapter docs\n` +
        `    continuum adapter docs --watch --docs-dir=./docs\n` +
        `    continuum adapter git --watch --repo-dir=.\n`,
    );
    process.exit(2);
  }

  let bin: string;
  try {
    bin = resolveAdapterBin(name);
  } catch (err) {
    process.stderr.write(`continuum adapter: ${(err as Error).message}\n`);
    process.exit(2);
  }

  const docsDir = opts.docsDir ?? resolvePath(process.cwd(), 'docs');
  const repoDir = opts.repoDir ?? process.cwd();

  const adapterArgs =
    name === 'docs'
      ? [`--project=${projectId}`, `--docs-dir=${docsDir}`, '--once']
      : [`--project=${projectId}`, `--repo-dir=${repoDir}`, '--once'];

  const runOnce = (): void => {
    try {
      execFileSync(process.execPath, [bin, ...adapterArgs], { stdio: 'inherit' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[adapter:${name}] sync failed: ${msg}\n`);
      // In watch mode we continue — don't die on a transient error.
    }
  };

  // Always sync once at startup so the operator gets the same baseline
  // whether they passed --watch or not.
  runOnce();

  if (!opts.watch) return;

  // Resolve watch target. docs = directory (recursive); git = single file.
  let watchTarget: string;
  let recursive: boolean;
  if (name === 'docs') {
    watchTarget = docsDir;
    recursive = true;
  } else {
    watchTarget = joinPath(repoDir, '.git', 'logs', 'HEAD');
    recursive = false;
  }
  if (!existsSync(watchTarget)) {
    process.stderr.write(`[adapter:${name}] watch target not found: ${watchTarget}\n`);
    process.exit(2);
  }

  process.stdout.write(
    `\n[adapter:${name}] watching ${watchTarget} (debounce 2000ms, Ctrl-C to stop)\n`,
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const watcher = fsWatch(watchTarget, { recursive }, (_eventType, filename) => {
    // Filter: docs only cares about markdown changes; git's single-file
    // watch already filters by construction.
    if (
      name === 'docs' &&
      typeof filename === 'string' &&
      !/\.(md|mdx)$/i.test(filename)
    ) {
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const label = typeof filename === 'string' ? filename : '<unnamed>';
      process.stdout.write(`[adapter:${name}] change detected (${label}), re-syncing…\n`);
      runOnce();
    }, 2000);
  });

  const shutdown = (sig: NodeJS.Signals): void => {
    process.stdout.write(`\n[adapter:${name}] caught ${sig}, shutting down\n`);
    watcher.close();
    if (debounceTimer) clearTimeout(debounceTimer);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ── continuum reindex / migrate (W23-1 sub-deliverables 2 + 3) ───────────────
//
// reindex — rebuild the hybrid backend's vector store from the SQLite
//           ground-truth. Idempotent. Use when ruvector.db is corrupted,
//           manually deleted, or after upgrading the embedding model.
//
// migrate — one-time backfill of a V0 SQLite-only project DB into the
//           V0.5 hybrid backend. Backs up the SQLite file first
//           (defensive — SQLite isn't modified, but the operator's
//           project directory gains a ruvector.db sidecar, which is
//           worth a snapshot in case something goes wrong).
//
// Both forces CONTINUUM_STORAGE_BACKEND=hybrid for this invocation so
// they work even when the default is sqlite (e.g. ops on a V0 project).
// HybridStorageBackend opens the existing continuum.db AND creates the
// ruvector.db sidecar; rebuildVectorStore() walks every SQLite row,
// re-embeds via the worker pool, and inserts into the vector store.

async function commandReindex(projectId: string): Promise<void> {
  process.env.CONTINUUM_STORAGE_BACKEND = 'hybrid';
  const { HybridStorageBackend } = await import('@number7even/continuum-core');
  const storage = new HybridStorageBackend(projectId);

  process.stdout.write(
    `continuum reindex — project '${projectId}'\n` +
      `  SQLite: ${storage.dataLocation()}\n` +
      `  reading observation IDs from SQLite and re-embedding…\n\n`,
  );

  const t0 = Date.now();
  let lastReportedPct = -1;
  const result = await storage.rebuildVectorStore({
    onProgress: (done, total) => {
      if (total === 0) return;
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastReportedPct && pct % 10 === 0) {
        lastReportedPct = pct;
        process.stdout.write(`  ${pct}%  (${done}/${total})\n`);
      }
    },
  });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

  const vectorCount = await storage.vectorCount();
  storage.close();

  process.stdout.write(
    `\n  ✓ reindex complete in ${elapsedSec}s\n` +
      `    rebuilt: ${result.rebuilt} / ${result.total}\n` +
      `    failed:  ${result.failed}\n` +
      `    vectors now in index: ${vectorCount}\n`,
  );

  if (result.failed > 0) {
    process.stderr.write(
      `\n  ⚠ ${result.failed} observation(s) failed to embed — re-run reindex to retry.\n`,
    );
    process.exit(1);
  }
  // Force-terminate after admin op completes. The hybrid backend's RuVector
  // native binding holds resources that don't release cleanly on natural
  // event-loop drain — without this exit, the CLI process hangs forever
  // (observed 2026-06-01 with the first smoke run of migrate).
  process.exit(0);
}

async function commandMigrate(projectId: string): Promise<void> {
  // Parse --backend flag; only 'hybrid' is a valid migration target today.
  const args = process.argv.slice(2);
  const backendIdx = args.indexOf('--backend');
  const backendArg = backendIdx >= 0 ? args[backendIdx + 1] : 'hybrid';
  if (backendArg !== 'hybrid') {
    process.stderr.write(
      `continuum migrate: only --backend hybrid is supported today (got: ${backendArg})\n`,
    );
    process.exit(2);
  }

  // Defensive backup of the SQLite file before we open hybrid (which
  // creates the ruvector.db sidecar in the same project directory).
  // The SQLite file itself isn't modified, but a backup lets the
  // operator roll back the whole project-dir state if anything in the
  // hybrid backend's index-building goes sideways.
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
  const { openStorage } = await import('@number7even/continuum-core');
  const probe = openStorage(projectId);
  const sqlitePath = probe.dataLocation();
  probe.close();

  if (!existsSync(sqlitePath)) {
    process.stderr.write(
      `continuum migrate: SQLite file not found at ${sqlitePath}\n` +
        `  Run 'continuum init' first to create the project DB.\n`,
    );
    process.exit(2);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${sqlitePath}.backup-${ts}`;
  copyFileSync(sqlitePath, backupPath);
  process.stdout.write(
    `continuum migrate — project '${projectId}'\n` +
      `  source:  ${sqlitePath}\n` +
      `  backup:  ${backupPath}\n` +
      `  target:  hybrid (SQLite + RuVector + MiniLM-L6-v2)\n\n`,
  );

  // Now open hybrid and rebuild the vector store from the SQLite ground-truth.
  process.env.CONTINUUM_STORAGE_BACKEND = 'hybrid';
  const { HybridStorageBackend } = await import('@number7even/continuum-core');
  const storage = new HybridStorageBackend(projectId);
  process.stdout.write(`  vector store: ${storage.vectorDataLocation()}\n`);

  const t0 = Date.now();
  let lastReportedPct = -1;
  const result = await storage.rebuildVectorStore({
    onProgress: (done, total) => {
      if (total === 0) return;
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastReportedPct && pct % 10 === 0) {
        lastReportedPct = pct;
        process.stdout.write(`  ${pct}%  (${done}/${total})\n`);
      }
    },
  });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  const vectorCount = await storage.vectorCount();
  storage.close();

  process.stdout.write(
    `\n  ✓ migration complete in ${elapsedSec}s\n` +
      `    rebuilt:    ${result.rebuilt} / ${result.total}\n` +
      `    failed:     ${result.failed}\n` +
      `    vectors:    ${vectorCount}\n` +
      `    backup:     ${backupPath}\n\n` +
      `  Your project is now V0.5-hybrid. The MCP surface is unchanged;\n` +
      `  Layer-1 search continues to use FTS5 (no behavior change).\n` +
      `  Vector search becomes available via future RRF-fusion work.\n` +
      `  To roll back: rm ${storage.vectorDataLocation()} && cp ${backupPath} ${sqlitePath}\n`,
  );

  if (result.failed > 0) {
    process.stderr.write(
      `\n  ⚠ ${result.failed} observation(s) failed to embed — re-run 'continuum reindex' to retry.\n`,
    );
    process.exit(1);
  }
  // Same hang-on-natural-exit as commandReindex — force-terminate.
  process.exit(0);
}

// ── continuum verify ──────────────────────────────────────────────────────────
//
// Issue #13 / W23-3. Pulls the latest snapshot, walks every entry with a
// verifyCommand, runs each via execSync with a 30s per-command timeout, and
// reports pass/fail. Exit code == number of failures so it can chain into
// scripts (`continuum verify && fly deploy ...`).
//
// Surface decisions:
//   - Section labels preserve grouping (active / dormant / broken) so the
//     operator sees the WHY of a failure in context. A "broken" entry that
//     fails verify is expected; an "active" entry that fails verify is a
//     regression. Same numeric exit, but the per-line label tells you which.
//   - On failure: show exit code + last 200 chars of stderr inline. Do NOT
//     abort the loop — operator wants to see EVERY failure, not just the
//     first one. "Surfaces the exact failing command + its stderr on first
//     failure" in SPRINT-W22 §W23-3 reads as "show the cmd + stderr WHEN a
//     failure occurs", not "stop after the first failure". Defensive default
//     is to keep running so a single broken verify_command doesn't mask the
//     rest of the snapshot's health.
//   - Empty snapshot / no verify_commands → exit 0 with a clear note.

interface VerifyEntry {
  section: 'active' | 'dormant' | 'broken';
  name: string;
  where: string;
  verifyCommand: string;
}

function commandVerify(projectId: string): void {
  const storage = openStorage(projectId);
  try {
    const snapshot = storage.getStateAt();
    if (!snapshot) {
      process.stdout.write(
        `continuum verify — no snapshot found for project '${projectId}'.\n` +
          `  Capture one via continuum_record_checkpoint inside an AI client,\n` +
          `  or run 'continuum import-state' to import from STATE.md.\n`,
      );
      process.exit(0);
    }

    const entries: VerifyEntry[] = [
      ...snapshot.active
        .filter(e => e.verifyCommand?.trim())
        .map(e => ({ section: 'active' as const, name: e.name, where: e.where, verifyCommand: e.verifyCommand! })),
      ...snapshot.dormant
        .filter(e => e.verifyCommand?.trim())
        .map(e => ({ section: 'dormant' as const, name: e.name, where: e.where, verifyCommand: e.verifyCommand! })),
      ...snapshot.broken
        .filter(e => e.verifyCommand?.trim())
        .map(e => ({ section: 'broken' as const, name: e.name, where: e.where, verifyCommand: e.verifyCommand! })),
    ];

    if (entries.length === 0) {
      process.stdout.write(
        `continuum verify — snapshot ${snapshot.id.slice(0, 8)} has no entries with verify_command.\n` +
          `  Reason: ${snapshot.reason}\n` +
          `  Add verify_commands to your StateEntry inputs to enable the verify-then-dissolve discipline.\n`,
      );
      process.exit(0);
    }

    process.stdout.write(
      `continuum verify — project '${projectId}' · snapshot ${snapshot.id.slice(0, 8)}\n` +
        `  captured ${snapshot.timestamp}\n` +
        `  reason:  ${snapshot.reason}\n` +
        `  running ${entries.length} verify_command${entries.length === 1 ? '' : 's'}…\n\n`,
    );

    let failures = 0;
    for (const entry of entries) {
      try {
        execSync(entry.verifyCommand, {
          stdio: 'pipe',
          timeout: 30_000,
          // Run from cwd of the CLI invocation. Verify commands are
          // intentionally repo-relative (grep, curl, fly status, etc.).
        });
        process.stdout.write(`  ✓ [${entry.section}] ${entry.name}\n`);
      } catch (err) {
        failures++;
        const e = err as NodeJS.ErrnoException & {
          status?: number | null;
          stderr?: Buffer;
          stdout?: Buffer;
          signal?: string;
        };
        const exitCode = e.status ?? (e.signal ? `signal=${e.signal}` : 'unknown');
        const stderr = e.stderr?.toString().trim() ?? '';
        const stdoutTail = e.stdout?.toString().trim() ?? '';
        process.stdout.write(
          `  ✗ [${entry.section}] ${entry.name} — exit ${exitCode}\n` +
            `      where:   ${entry.where}\n` +
            `      command: ${entry.verifyCommand}\n`,
        );
        if (stderr) {
          process.stdout.write(
            `      stderr:  ${stderr.slice(-200).replace(/\n/g, '\n               ')}\n`,
          );
        } else if (stdoutTail) {
          // No stderr but stdout might explain — show tail.
          process.stdout.write(
            `      stdout:  ${stdoutTail.slice(-200).replace(/\n/g, '\n               ')}\n`,
          );
        }
      }
    }

    const passes = entries.length - failures;
    process.stdout.write(
      `\nSummary: ${passes} pass · ${failures} fail (exit ${failures})\n`,
    );
    process.exit(failures);
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
  await import('@number7even/continuum-mcp-server');
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
  await import('@number7even/continuum-mcp-server/dist/http.js');
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
      await commandStatus(projectId);
      return;

    case 'upgrade':
      await commandUpgrade(projectId);
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

    case 'verify':
      commandVerify(projectId);
      return;

    case 'adapter':
      commandAdapter(projectId);
      return;

    case 'reindex':
      await commandReindex(projectId);
      return;

    case 'migrate':
      await commandMigrate(projectId);
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
