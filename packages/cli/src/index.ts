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
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  computeNextTasks,
  openStorage,
  parseStateMdToCheckpoint,
  type RankedTask,
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
                 --guided : the 5-minute cold start — also writes .mcp.json
                 for you (merges, never clobbers) and records a seed checkpoint
                 so get_state is warm on the very first session.
  start          Run the MCP stdio server for this project.
  serve          Run the MCP HTTP/SSE server (V1 — remote / hosted clients).
                 Requires $CONTINUUM_HTTP_TOKEN (Bearer shared secret).
  status         Print current state, todo counts, and data location.
                 Also nudges if a newer CLI is published (never auto-installs).
  upgrade        Re-sync the ICM "folders over agents" scaffold into this project
                 (idempotent; --force refreshes templates) + report engine updates.
  import-state   Parse a STATE.md and record it as a new checkpoint. Always
                 creates a checkpoint (use this to re-snapshot after edits).
  next           The PM brain — "what should I work on next?" Reads the todo
                 dependency DAG and prints the ACTIONABLE set (unblocked, not
                 done), ordered by downstream leverage, each with its state,
                 verify_command, and dossier refs. --json for the raw payload.
  observe        Capture terminal output as a live 'command' Observation — the
                 capture seam of the qualifying loop. TEEs stdin→stdout (the pipe
                 stays transparent) and flags significant events (non-zero exit,
                 build/test/git). Options: --label, --cmd, --exit, --max-bytes.
                 Example:
                   npm test 2>&1 | continuum observe --label test --exit $?
  verify         Re-run every verify_command in the latest snapshot. Exit code
                 = number of failures (0 = all green). Use this to confirm
                 state-snapshot claims are still true on the current machine.
                 --json : emit {name, section, verifyCommand, exitCode, state}
                 per entry (state = DONE|FAILED|SKIPPED) — feeds the 6-state UI.
  ingest         Repo-drop — turn any repo into the knowledge graph in one shot.
                 Local path: git commits + markdown docs + exported code symbols &
                 call graph (inline codegraph bridge if a .codegraph index exists).
                 Remote URL: the remote-git adapter (gitingest digest).
                 Code engine: CONTINUUM_CODE_ENGINE=cbm (+ CONTINUUM_CBM_BIN) uses
                 codebase-memory-mcp (Hybrid LSP); default = inline codegraph bridge.
                 Project defaults to the repo's basename.
                 Examples:
                   continuum ingest --repo=/path/to/repo
                   continuum ingest --repo=https://github.com/owner/name
                   continuum ingest --repo=. --project=my-repo
  adapter        Run a single source adapter (docs|git) once, or with --watch as a
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
  'If you do not find what you need in this floor, return to the root [`router.md`](../router.md) (the Map). Never guess or hallucinate across floors — come back to the Map.';

function icmFloor(title: string, purpose: string): string {
  return `# ${title} — local context\n\n${purpose}\n\n> **Rebound rule:** ${ICM_REBOUND}\n`;
}

/** The standard ICM file tree Continuum scaffolds into a project on init. */
function icmFiles(projectId: string): Record<string, string> {
  return {
    'agents.md':
      `# ${projectId} — Prime Mission (agents.md)\n\n` +
      `This is the **Lobby**. When you wake up in this workspace, read this file, then the Map ([\`router.md\`](./router.md)).\n\n` +
      `## Identity & laws\n` +
      `- This workspace uses the **Interpretable Context Methodology** — *"folders over agents."* The file system IS the architecture, routing, and memory. No fragile agent framework governs; the folders do.\n` +
      `- **Verify over generate:** nothing is "done" without mechanical proof (a passing command / a checkpoint). The AI shapes language; file-system discipline holds the verifiable truth.\n` +
      `- **Never over-consume context:** fetch skills/reference only when a task needs them (see \`skills/\`).\n\n` +
      `## How to work here\n` +
      `1. Read [\`router.md\`](./router.md) — the Map. It routes you to the right floor by intent.\n` +
      `2. Each floor has its own \`agents.md\` (local context) + the rebound rule (return to the Map if lost).\n\n` +
      `## Memory — "Pick up" / "Hand off" (verifiable, not remembered)\n` +
      `This workspace's memory is **CONTINUUM** (registered as an MCP server via \`.mcp.json\`). It refuses to lie: a state reaches DONE only when its \`verifyCommand\` exits 0. Do NOT keep memory in a plain text file you have to trust.\n` +
      `- **When I say "Pick up"** → read \`continuum://session/briefing\` (the warm brief) + \`continuum_get_state\`, then \`continuum_next_tasks\` for what is actionable right now. Brief me on where we left off. Never start cold.\n` +
      `- **When I say "Hand off"** → call \`continuum_record_checkpoint\` with the current \`active\` / \`dormant\` / \`broken\` state, **each entry carrying a \`verifyCommand\`** (the shell proof). It is hash-sealed + append-only — the audit ledger, not a memory you assert. Also append a one-line human note to [\`artifacts/\`](./artifacts/agents.md).\n` +
      `- If CONTINUUM's MCP server is not registered yet, run \`continuum init --guided\` in this repo first, then restart your AI client.\n`,
    'router.md':
      `# router.md — The Map (Interpretable Context Methodology)\n\n` +
      `> Read \`agents.md\` first (the Prime Mission). This is the Map — it routes you to the right *floor* by intent.\n` +
      `> **Rebound rule:** if a floor's local context doesn't answer your question, return HERE. Never guess across floors.\n\n` +
      `## Session start\n` +
      `If Continuum's MCP server is registered (\`.mcp.json\`), open with \`continuum_get_state\` + \`continuum://session/briefing\` — start warm, not cold. Search before fetching (search → timeline → get_observations).\n\n` +
      `## Floors — route by intent\n` +
      `| If you need to… | Go to |\n|---|---|\n` +
      `| Onboard / see the build plan & validation gates | [01-start-here](./01-start-here/agents.md) |\n` +
      `| The deterministic core / execution logic | [03-code](./03-code/agents.md) |\n` +
      `| The app shell / working artifacts | [app](./app/agents.md) |\n` +
      `| Reference material, schemas, regression fixtures | [reference](./reference/agents.md) |\n` +
      `| Fetch-on-demand know-how (don't preload) | [skills](./skills/README.md) |\n` +
      `| The audit ledger / hand-offs (append-only) | [artifacts](./artifacts/agents.md) |\n\n` +
      `## Lifecycle — spec → ship (routed to agent-skills)\n` +
      `The dev lifecycle runs on the **agent-skills** marketplace (Addy Osmani) — Continuum ROUTES to it, it does not re-implement it (don't reinvent the wheel). Install once:\n` +
      `\`\`\`\n/plugin marketplace add addyosmani/agent-skills\n/plugin install agent-skills@addy-agent-skills\n\`\`\`\n\n` +
      `| Stage | Command | Principle |\n|---|---|---|\n` +
      `| Spec what to build | \`/spec\` | spec before code |\n` +
      `| Plan how to build it | \`/plan\` | small atomic tasks |\n` +
      `| Build a slice | \`/build\` | one slice at a time |\n` +
      `| Prove it works | \`/test\` | tests are proof |\n` +
      `| Review before merge | \`/review\` | improve code health |\n` +
      `| Simplify | \`/code-simplify\` | clarity over cleverness |\n` +
      `| Ship | \`/ship\` | faster is safer |\n\n` +
      `Skills auto-activate on detected work; fetch a skill only when the task needs it ([skills](./skills/README.md)). Continuum records each stage's output as a verifiable artifact (checkpoint / hand-off) — the memory layer beneath the lifecycle.\n\n` +
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
      `How-to knowledge lives here as separate files, **fetched only when a task needs them** — never preloaded. This keeps the context window small and token cost low.\n\n` +
      `## The spec → ship lifecycle (routed, not duplicated)\n` +
      `Continuum routes the dev lifecycle to the **agent-skills** marketplace — see the Map ([\`../router.md\`](../router.md)). Install: \`/plugin marketplace add addyosmani/agent-skills\` then \`/plugin install agent-skills@addy-agent-skills\`. That provides /spec /plan /build /test /review /code-simplify /ship + personas.\n\n` +
      `## Project skills\n` +
      `Add PROJECT-specific skills here as separate files; reference each from a floor's \`agents.md\` when that floor needs it. Rebound to the [Map](../router.md) if unsure.\n`,
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

/** Write or merge the `continuum` MCP server into a project-local `.mcp.json`,
 *  never clobbering other servers. Returns what happened for the operator note. */
function writeOrMergeMcpJson(
  mcpPath: string,
  server: Record<string, unknown>,
): 'created' | 'merged' | 'error' {
  try {
    if (existsSync(mcpPath)) {
      const cfg = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
        mcpServers?: Record<string, unknown>;
      };
      cfg.mcpServers = cfg.mcpServers ?? {};
      cfg.mcpServers.continuum = server;
      writeFileSync(mcpPath, JSON.stringify(cfg, null, 2) + '\n');
      return 'merged';
    }
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { continuum: server } }, null, 2) + '\n');
    return 'created';
  } catch {
    return 'error';
  }
}

function commandInit(projectId: string, stateMdOverride: string | undefined): void {
  // --guided: the 5-minute cold start. Detect the project, auto-write .mcp.json,
  // and seed a checkpoint so the user's very first `get_state` is never empty.
  const guided = process.argv.includes('--guided');
  const storage = openStorage(projectId);
  const dataPath = storage.dataLocation();

  // Auto-import STATE.md as the first checkpoint — only if one is present
  // AND no checkpoints exist yet (avoid noise on re-running init).
  const stateMdPath = resolveStateMdPath(stateMdOverride);
  const existingSnapshots = storage.listSnapshots(1);
  let hasCheckpoint = existingSnapshots.length > 0;
  let stateMdNote = '';
  if (existsSync(stateMdPath) && existingSnapshots.length === 0) {
    const summary = importStateMdInto(storage, stateMdPath, 'continuum init');
    printStateMdSummary(summary, stateMdPath);
    if (summary.imported) {
      hasCheckpoint = true;
      stateMdNote =
        `\n  Auto-imported STATE.md as first checkpoint (${summary.snapshotId!.slice(0, 8)}).`;
    }
  } else if (existsSync(stateMdPath) && existingSnapshots.length > 0) {
    stateMdNote =
      `\n  STATE.md detected but checkpoints already exist — skipping auto-import.\n  Use 'continuum import-state' to force a fresh checkpoint from STATE.md.`;
  }

  // Find the MCP server binary so the registration snippet is copy-paste ready.
  // Resolve through node's module resolution rather than guessing paths — this
  // makes the printed snippet correct whether @number7even/continuum-mcp-server was
  // installed via npx, npm install -g, or as a workspace dep.
  let mcpServerBinPath: string;
  try {
    const main = import.meta.resolve('@number7even/continuum-mcp-server');
    mcpServerBinPath = new URL(main).pathname;
  } catch {
    mcpServerBinPath = '<install-@number7even/continuum-mcp-server-first>';
  }
  const continuumServer = {
    command: 'node',
    args: [mcpServerBinPath],
    env: { CONTINUUM_PROJECT_ID: projectId },
  };
  const mcpSnippet = { mcpServers: { continuum: continuumServer } };

  // GUIDED extras — write .mcp.json for the operator + seed a checkpoint.
  let guidedNote = '';
  if (guided) {
    const mcpPath = joinPath(process.cwd(), '.mcp.json');
    const wrote = writeOrMergeMcpJson(mcpPath, continuumServer);
    guidedNote +=
      wrote === 'created' ? `\n  ✓ Wrote .mcp.json (continuum registered — no hand-editing).`
      : wrote === 'merged' ? `\n  ✓ Merged 'continuum' into your existing .mcp.json (other servers untouched).`
      : `\n  ⚠ Could not write .mcp.json — add the snippet below manually.`;

    // Seed a checkpoint so `get_state` returns something on the first try. Only
    // when there's no checkpoint yet and the .mcp.json registration is in place
    // (its verifyCommand proves that registration — verify-then-dissolve from day one).
    if (!hasCheckpoint && wrote !== 'error') {
      const seeded = storage.recordCheckpoint({
        reason: 'continuum init --guided — seed checkpoint (project initialised, MCP registered)',
        active: [
          {
            name: 'continuum-registered',
            where: mcpPath,
            verifyCommand: `grep -q '"continuum"' .mcp.json`,
            verifiedAt: new Date().toISOString(),
            description:
              'Continuum registered as an MCP server for this project via `continuum init --guided`. This seed checkpoint means get_state is never empty on the first session.',
          },
        ],
      });
      hasCheckpoint = true;
      guidedNote += `\n  ✓ Seed checkpoint recorded (${seeded.id.slice(0, 8)}) — get_state is warm from day one.`;
    }
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

  const nextSteps = guided
    ? [
        `Next steps (guided):`,
        `  1. Restart your AI client so it picks up the new .mcp.json.`,
        `  2. Run \`continuum status\` — you'll already see the seed checkpoint.`,
        `  3. Say "let's pick up where we left off" — your AI opens warm.`,
        ``,
      ]
    : [
        `MCP registration — add to ~/.claude.json or .mcp.json`,
        `(or re-run \`continuum init --guided\` to write it for you):`,
        ``,
        JSON.stringify(mcpSnippet, null, 2),
        ``,
        `Next steps:`,
        `  1. Add the snippet above to your AI client's MCP config.`,
        `  2. Restart the client so it picks up the new server.`,
        `  3. Run \`continuum status\` here to confirm the DB is reachable.`,
        ``,
      ];

  process.stdout.write(
    [
      `✓ Continuum initialised${guided ? ' (guided)' : ''}`,
      ``,
      `  Project ID:  ${projectId}`,
      `  Data path:   ${dataPath}${stateMdNote}${guidedNote}${icmNote}`,
      ``,
      ...nextSteps,
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

/** One verify result row in the 6-state observability model. `verify` produces
 *  DONE / FAILED / SKIPPED; RUNNING / REVIEW / BLOCKED come from the live pipeline. */
type VerifyState = 'DONE' | 'FAILED' | 'SKIPPED';
interface VerifyResult {
  name: string;
  section: 'active' | 'dormant' | 'broken';
  where: string;
  verifyCommand: string | null;
  exitCode: number | string | null;
  state: VerifyState;
  stderr?: string;
}

function commandVerify(projectId: string): void {
  const json = process.argv.includes('--json');
  const storage = openStorage(projectId);
  try {
    const snapshot = storage.getStateAt();
    if (!snapshot) {
      if (json) {
        process.stdout.write(
          JSON.stringify(
            { project: projectId, snapshot: null, summary: { pass: 0, fail: 0, skipped: 0, total: 0 }, entries: [] },
            null,
            2,
          ) + '\n',
        );
      } else {
        process.stdout.write(
          `continuum verify — no snapshot found for project '${projectId}'.\n` +
            `  Capture one via continuum_record_checkpoint inside an AI client,\n` +
            `  or run 'continuum import-state' to import from STATE.md.\n`,
        );
      }
      process.exit(0);
    }

    // Every entry, flagged by section; those without a verify_command are SKIPPED.
    const rows = [
      ...snapshot.active.map(e => ({ section: 'active' as const, name: e.name, where: e.where, verifyCommand: e.verifyCommand })),
      ...snapshot.dormant.map(e => ({ section: 'dormant' as const, name: e.name, where: e.where, verifyCommand: e.verifyCommand })),
      ...snapshot.broken.map(e => ({ section: 'broken' as const, name: e.name, where: e.where, verifyCommand: e.verifyCommand })),
    ];
    const runnable = rows.filter(r => r.verifyCommand?.trim());

    if (runnable.length === 0) {
      if (json) {
        process.stdout.write(
          JSON.stringify(
            {
              project: projectId,
              snapshot: snapshot.id,
              timestamp: snapshot.timestamp,
              reason: snapshot.reason,
              summary: { pass: 0, fail: 0, skipped: rows.length, total: rows.length },
              entries: rows.map(r => ({ name: r.name, section: r.section, where: r.where, verifyCommand: r.verifyCommand ?? null, exitCode: null, state: 'SKIPPED' as const })),
            },
            null,
            2,
          ) + '\n',
        );
        process.exit(0);
      }
      process.stdout.write(
        `continuum verify — snapshot ${snapshot.id.slice(0, 8)} has no entries with verify_command.\n` +
          `  Reason: ${snapshot.reason}\n` +
          `  Add verify_commands to your StateEntry inputs to enable the verify-then-dissolve discipline.\n`,
      );
      process.exit(0);
    }

    if (!json) {
      process.stdout.write(
        `continuum verify — project '${projectId}' · snapshot ${snapshot.id.slice(0, 8)}\n` +
          `  captured ${snapshot.timestamp}\n` +
          `  reason:  ${snapshot.reason}\n` +
          `  running ${runnable.length} verify_command${runnable.length === 1 ? '' : 's'}…\n\n`,
      );
    }

    const results: VerifyResult[] = [];
    let failures = 0;
    for (const r of rows) {
      if (!r.verifyCommand?.trim()) {
        // 6-state model: no proof attached → SKIPPED (a soft state, not a failure).
        results.push({ name: r.name, section: r.section, where: r.where, verifyCommand: null, exitCode: null, state: 'SKIPPED' });
        if (!json) process.stdout.write(`  ⊘ [${r.section}] ${r.name} — skipped (no verify_command)\n`);
        continue;
      }
      try {
        execSync(r.verifyCommand, {
          stdio: 'pipe',
          timeout: 30_000,
          // Run from cwd of the CLI invocation. Verify commands are
          // intentionally repo-relative (grep, curl, fly status, etc.).
        });
        results.push({ name: r.name, section: r.section, where: r.where, verifyCommand: r.verifyCommand, exitCode: 0, state: 'DONE' });
        if (!json) process.stdout.write(`  ✓ [${r.section}] ${r.name}\n`);
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
        results.push({ name: r.name, section: r.section, where: r.where, verifyCommand: r.verifyCommand, exitCode, state: 'FAILED', stderr: stderr || stdoutTail || undefined });
        if (!json) {
          process.stdout.write(
            `  ✗ [${r.section}] ${r.name} — exit ${exitCode}\n` +
              `      where:   ${r.where}\n` +
              `      command: ${r.verifyCommand}\n`,
          );
          if (stderr) {
            process.stdout.write(`      stderr:  ${stderr.slice(-200).replace(/\n/g, '\n               ')}\n`);
          } else if (stdoutTail) {
            process.stdout.write(`      stdout:  ${stdoutTail.slice(-200).replace(/\n/g, '\n               ')}\n`);
          }
        }
      }
    }

    const passes = results.filter(r => r.state === 'DONE').length;
    const skipped = results.filter(r => r.state === 'SKIPPED').length;

    if (json) {
      process.stdout.write(
        JSON.stringify(
          {
            project: projectId,
            snapshot: snapshot.id,
            timestamp: snapshot.timestamp,
            reason: snapshot.reason,
            summary: { pass: passes, fail: failures, skipped, total: results.length },
            entries: results.map(r => ({ name: r.name, section: r.section, where: r.where, verifyCommand: r.verifyCommand, exitCode: r.exitCode, state: r.state })),
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      process.stdout.write(
        `\nSummary: ${passes} pass · ${failures} fail${skipped ? ` · ${skipped} skipped` : ''} (exit ${failures})\n`,
      );
    }
    process.exit(failures);
  } finally {
    storage.close();
  }
}

// ── continuum ingest --repo=<path> (the repo-drop) ───────────────────────────
//
// One command turns a dropped repo into the knowledge graph: git commits +
// markdown docs (via the published adapters) + exported code symbols + call
// graph (inline codegraph bridge, if a .codegraph index is present). The result
// is the "map + dossier" surface the brain renders.

function parseIngestArgs(argv: string[]): { repo?: string; project?: string; docsDir?: string } {
  const args = argv.slice(2);
  const out: { repo?: string; project?: string; docsDir?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a.startsWith('--repo=')) out.repo = a.split('=').slice(1).join('=');
    else if (a === '--repo') out.repo = args[++i];
    else if (a.startsWith('--project=')) out.project = a.split('=').slice(1).join('=');
    else if (a.startsWith('--docs-dir=')) out.docsDir = a.split('=').slice(1).join('=');
  }
  return out;
}

/** Run a published source adapter (docs|git) once against a target dir. */
function runAdapterOnce(name: AdapterName, projectId: string, opts: { docsDir?: string; repoDir?: string }): boolean {
  let bin: string;
  try {
    bin = resolveAdapterBin(name);
  } catch (err) {
    process.stderr.write(`[ingest] ${(err as Error).message}\n`);
    return false;
  }
  const args =
    name === 'docs'
      ? [`--project=${projectId}`, `--docs-dir=${opts.docsDir ?? process.cwd()}`, '--once']
      : [`--project=${projectId}`, `--repo-dir=${opts.repoDir ?? process.cwd()}`, '--once'];
  try {
    execFileSync(process.execPath, [bin, ...args], { stdio: 'inherit' });
    return true;
  } catch (err) {
    process.stderr.write(`[ingest:${name}] failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return false;
  }
}

interface CgNode { id: number; kind: string; name: string; qualified_name: string; file_path: string; signature: string | null; docstring: string | null }
interface CgEdge { source: number; target: number }

/** Inline codegraph bridge — ingest exported symbols + call/import edges from a
 *  repo's .codegraph/codegraph.db as observations (id=`sym:<qn>`), directional
 *  refs = the symbols each one calls/imports. Mirrors scripts/ingest-codegraph.mjs. */
function ingestCodegraph(projectId: string, dbPath: string): { symbols: number; edges: number } {
  const KINDS = ['function', 'class', 'method', 'interface', 'component'];
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, kind, name, qualified_name, file_path, signature, docstring
       FROM nodes WHERE is_exported = 1 AND kind IN (${KINDS.map(() => '?').join(',')})`,
    )
    .all(...KINDS) as CgNode[];
  const idToQn = new Map(rows.map(r => [r.id, r.qualified_name]));
  const symId = (qn: string): string => `sym:${qn}`;
  const refs = new Map<string, Set<string>>();
  const edgeRows = db.prepare(`SELECT source, target FROM edges WHERE kind IN ('calls','imports')`).all() as CgEdge[];
  for (const e of edgeRows) {
    if (idToQn.has(e.source) && idToQn.has(e.target) && e.source !== e.target) {
      const s = symId(idToQn.get(e.source)!), t = symId(idToQn.get(e.target)!);
      if (!refs.has(s)) refs.set(s, new Set());
      refs.get(s)!.add(t);
    }
  }
  db.close();

  const now = new Date().toISOString();
  const storage = openStorage(projectId);
  let symbols = 0, edges = 0;
  try {
    storage.upsertSource(`codegraph:${projectId}`, 'export', { adapter: 'codegraph-bridge', db: dbPath });
    for (const r of rows) {
      const id = symId(r.qualified_name);
      const content = [
        `${r.name}${r.signature ? ' ' + r.signature : ''}`,
        r.file_path,
        (r.docstring ?? '').trim(),
      ].filter(Boolean).join('\n');
      const rr = [...(refs.get(id) ?? [])];
      if (storage.upsertObservation({ id, sourceId: `codegraph:${projectId}`, type: r.kind, content, timestamp: now, refs: rr, metadata: { adapter: 'codegraph-bridge', file: r.file_path, kind: r.kind } })) {
        symbols++;
      }
      edges += rr.length;
    }
  } finally {
    storage.close();
  }
  return { symbols, edges };
}

// ── codebase-memory-mcp bridge (opt-in via CONTINUUM_CODE_ENGINE=cbm) ─────────
// The approved Hybrid-LSP engine. Indexes the repo, then pulls the raw structural
// truth via query_graph (Cypher) — bypassing trace_path's constructor blind spot
// — and maps it into canonical CONTINUUM observations with sym: edges. The inline
// codegraph bridge remains the reversible fallback.

function resolveCbmBin(): string | null {
  const envBin = process.env.CONTINUUM_CBM_BIN;
  if (envBin && existsSync(envBin)) return envBin;
  try {
    const p = execFileSync('which', ['codebase-memory-mcp'], { encoding: 'utf-8' }).trim();
    if (p && existsSync(p)) return p;
  } catch { /* not on PATH */ }
  return null;
}

function runCbmTool(bin: string, tool: string, args: Record<string, unknown>): { rows?: unknown[][]; project?: string } {
  const out = execFileSync(bin, ['cli', tool, JSON.stringify(args)], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'], // logs → stderr (ignored), result JSON → stdout
    maxBuffer: 256 * 1024 * 1024,
    timeout: 300_000,
  });
  return JSON.parse(out) as { rows?: unknown[][]; project?: string };
}

function ingestViaCbm(projectId: string, repoPath: string, bin: string): { symbols: number; edges: number } {
  const idx = runCbmTool(bin, 'index_repository', { repo_path: repoPath });
  const cbmProject = String(idx.project ?? '');
  if (!cbmProject) throw new Error('codebase-memory-mcp index_repository returned no project id');
  const strip = (qn: string): string => (qn.startsWith(cbmProject + '.') ? qn.slice(cbmProject.length + 1) : qn);
  const symId = (qn: string): string => `sym:${strip(qn)}`;

  // Symbols — ONE query for all node kinds (perf: each cbm cli call cold-starts the
  // binary). Keep only code symbols + exported, filtered client-side (Cypher
  // WHERE-on-boolean is unreliable here).
  type Sym = { id: string; name: string; file: string; signature: string; docstring: string; kind: string };
  const CODE_KINDS = ['function', 'method', 'class', 'interface', 'component'];
  const symbols: Sym[] = [];
  const exported = new Set<string>();
  try {
    const res = runCbmTool(bin, 'query_graph', {
      project: cbmProject,
      query: `MATCH (n) RETURN n.qualified_name, n.name, n.file_path, n.signature, n.docstring, n.is_exported, labels(n) LIMIT 50000`,
    });
    for (const row of res.rows ?? []) {
      const [qn, name, file, sig, doc, exp, labels] = row as [string, string, string, string, string, unknown, unknown];
      if (!qn) continue;
      const isExp = exp === true || exp === 1 || exp === 'true' || exp === '1';
      if (!isExp) continue;
      const labelStr = (Array.isArray(labels) ? labels.join(',') : String(labels)).toLowerCase();
      const kind = CODE_KINDS.find(k => labelStr.includes(k));
      if (!kind) continue; // skip Section / Decorator / non-code nodes
      const id = symId(qn);
      symbols.push({ id, name: name ?? '', file: file ?? '', signature: sig ?? '', docstring: doc ?? '', kind });
      exported.add(id);
    }
  } catch { /* leave symbols empty → caller falls back */ }

  // Edges — ONE query, CALLS|IMPORTS union. Kept only among the exported set (no
  // dangling refs), directional a → b as sym: ids.
  const refs = new Map<string, Set<string>>();
  try {
    const res = runCbmTool(bin, 'query_graph', {
      project: cbmProject,
      query: `MATCH (a)-[:CALLS|IMPORTS]->(b) RETURN a.qualified_name, b.qualified_name LIMIT 200000`,
    });
    for (const row of res.rows ?? []) {
      const a = symId(String(row[0] ?? '')), b = symId(String(row[1] ?? ''));
      if (a === 'sym:' || b === 'sym:' || a === b) continue;
      if (!exported.has(a) || !exported.has(b)) continue;
      if (!refs.has(a)) refs.set(a, new Set());
      refs.get(a)!.add(b);
    }
  } catch { /* no edges → symbols still ingest */ }

  const now = new Date().toISOString();
  const storage = openStorage(projectId);
  let count = 0, edgeCount = 0;
  try {
    storage.upsertSource(`codegraph:${projectId}`, 'export', { adapter: 'codebase-memory-mcp', engine: 'cbm', project: cbmProject });
    for (const s of symbols) {
      const content = [`${s.name}${s.signature ? ' ' + s.signature : ''}`, s.file, (s.docstring || '').trim()].filter(Boolean).join('\n');
      const rr = [...(refs.get(s.id) ?? [])];
      if (storage.upsertObservation({ id: s.id, sourceId: `codegraph:${projectId}`, type: s.kind, content, timestamp: now, refs: rr, metadata: { adapter: 'codebase-memory-mcp', engine: 'cbm', file: s.file, kind: s.kind } })) {
        count++;
      }
      edgeCount += rr.length;
    }
  } finally {
    storage.close();
  }
  return { symbols: count, edges: edgeCount };
}

function commandIngest(): void {
  const { repo, project, docsDir } = parseIngestArgs(process.argv);
  if (!repo || !repo.trim()) {
    process.stderr.write(
      `continuum ingest: --repo=<path-or-url> required.\n` +
        `  Drop any repo into the graph:\n` +
        `    continuum ingest --repo=/path/to/repo\n` +
        `    continuum ingest --repo=https://github.com/owner/name\n` +
        `    continuum ingest --repo=. --project=my-repo\n`,
    );
    process.exit(2);
  }
  const raw = repo.trim();

  // A remote URL → the remote-git adapter (gitingest digest → one observation).
  // A local path → the git + docs + codegraph flow below.
  if (/^(https?:\/\/|git@)/i.test(raw)) {
    const projectId = project?.trim() ? project.trim() : basename(raw.replace(/\.git$/, '')).toLowerCase();
    process.stdout.write(`continuum ingest — remote repo '${raw}' → project '${projectId}'\n\n▸ remote-git — gitingest digest\n`);
    let bin: string;
    try {
      bin = fileURLToPath(import.meta.resolve('@number7even/continuum-adapter-remote-git'));
    } catch (err) {
      process.stderr.write(
        `[ingest:remote-git] cannot resolve @number7even/continuum-adapter-remote-git — install it in this workspace. (${err instanceof Error ? err.message : String(err)})\n`,
      );
      process.exit(2);
    }
    try {
      execFileSync(process.execPath, [bin, `--repo=${raw}`, `--project=${projectId}`], { stdio: 'inherit' });
    } catch (err) {
      process.stderr.write(`[ingest:remote-git] failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    process.stdout.write(
      `\n✓ Remote repo ingested into project '${projectId}'.\n` +
        `  Inspect:  continuum status --project-id ${projectId}\n` +
        `  Map + dossier: open the 3D brain against project '${projectId}'.\n`,
    );
    return;
  }

  const repoPath = resolvePath(raw);
  if (!existsSync(repoPath)) {
    process.stderr.write(`continuum ingest: repo not found: ${repoPath}\n`);
    process.exit(2);
  }
  const projectId = project?.trim() ? project.trim() : basename(repoPath).toLowerCase();

  process.stdout.write(`continuum ingest — repo '${repoPath}' → project '${projectId}'\n\n`);

  // 1) git commit history (the temporal spine)
  if (existsSync(joinPath(repoPath, '.git'))) {
    process.stdout.write(`▸ git — commit history\n`);
    runAdapterOnce('git', projectId, { repoDir: repoPath });
  } else {
    process.stdout.write(`▸ git — skipped (no .git at ${repoPath})\n`);
  }

  // 2) markdown docs (RAG surface)
  const docsTarget = docsDir
    ? resolvePath(docsDir)
    : existsSync(joinPath(repoPath, 'docs'))
      ? joinPath(repoPath, 'docs')
      : repoPath;
  process.stdout.write(`\n▸ docs — markdown in ${docsTarget}\n`);
  runAdapterOnce('docs', projectId, { docsDir: docsTarget });

  // 3) code symbols + call graph (the architecture map).
  //    Engine select: CONTINUUM_CODE_ENGINE=cbm → codebase-memory-mcp (Hybrid LSP);
  //    default → inline codegraph bridge (the safe, reversible baseline).
  process.stdout.write(`\n▸ code — exported symbols + call graph\n`);
  const engine = (process.env.CONTINUUM_CODE_ENGINE ?? 'codegraph').toLowerCase();
  let codeDone = false;
  if (engine === 'cbm' || engine === 'codebase-memory') {
    const cbmBin = resolveCbmBin();
    if (cbmBin) {
      try {
        const { symbols, edges } = ingestViaCbm(projectId, repoPath, cbmBin);
        process.stdout.write(`  ✓ [codebase-memory-mcp · Hybrid LSP] ${symbols} symbol(s) · ${edges} cross-file edge(s)\n`);
        codeDone = true;
      } catch (err) {
        process.stderr.write(`  ✗ codebase-memory-mcp ingest failed: ${err instanceof Error ? err.message : String(err)} — falling back to inline codegraph\n`);
      }
    } else {
      process.stdout.write(`  ⚠ CONTINUUM_CODE_ENGINE=cbm but binary not found — set CONTINUUM_CBM_BIN=/path/to/codebase-memory-mcp (or install it on PATH). Falling back to inline codegraph.\n`);
    }
  }
  if (!codeDone) {
    const cgDb = joinPath(repoPath, '.codegraph', 'codegraph.db');
    if (existsSync(cgDb)) {
      try {
        const { symbols, edges } = ingestCodegraph(projectId, cgDb);
        process.stdout.write(`  ✓ [inline codegraph] ${symbols} symbol(s) · ${edges} call/import edge(s) — directional code flow\n`);
      } catch (err) {
        process.stderr.write(`  ✗ codegraph ingest failed: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    } else {
      process.stdout.write(
        `  no code index — for Hybrid LSP set CONTINUUM_CODE_ENGINE=cbm (+ CONTINUUM_CBM_BIN);\n` +
          `  or for the inline bridge run 'codegraph init -i' in the repo, then re-run ingest.\n`,
      );
    }
  }

  process.stdout.write(
    `\n✓ Repo ingested into project '${projectId}'.\n` +
      `  Inspect:  continuum status --project-id ${projectId}\n` +
      `  Map + dossier: open the 3D brain (apps/console → /brain) against project '${projectId}'.\n`,
  );
}

// ── continuum next (the PM brain — "what's next?") ───────────────────────────

const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s);

function stateGlyph(s: RankedTask['state']): string {
  return s === 'READY' ? '○' : s === 'RUNNING' ? '◐' : s === 'BLOCKED' ? '⊘' : '✓';
}

function commandNext(projectId: string): void {
  const json = process.argv.includes('--json');
  const storage = openStorage(projectId);
  try {
    const result = computeNextTasks(storage.listTodos());
    if (json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return;
    }
    if (result.total === 0) {
      process.stdout.write(
        `continuum next — no todos in project '${projectId}'.\n` +
          `  Create tasks via continuum_create_todo inside your AI client.\n`,
      );
      return;
    }
    process.stdout.write(
      `continuum next — project '${projectId}' · ${result.actionable.length} actionable · ` +
        `${result.blocked.length} blocked · ${result.done}/${result.total} done\n\n`,
    );
    if (result.actionable.length === 0) {
      process.stdout.write(`  Nothing actionable — every open task is blocked. See the critical path below.\n\n`);
    } else {
      process.stdout.write(`DO NEXT (unblocked, highest leverage first):\n`);
      for (const t of result.actionable) {
        const lev = t.leverage > 0 ? ` · unblocks ${t.leverage}` : '';
        const dossier = t.refs.length ? ` · dossier ${t.refs.length}` : '';
        process.stdout.write(`  ${stateGlyph(t.state)} [${t.state}] ${truncate(t.title, 60)}${lev}${dossier}\n`);
        const vc = t.hasVerify ? `verify: ${truncate(t.verifyCommand!, 50)}` : '⚠ no verify_command';
        process.stdout.write(`      ${t.id.slice(0, 8)} · ${vc}\n`);
      }
    }
    if (result.blocked.length) {
      process.stdout.write(`\nBLOCKED (waiting on upstream):\n`);
      for (const t of result.blocked.slice(0, 10)) {
        process.stdout.write(
          `  ⊘ ${truncate(t.title, 58)} — needs ${t.blockedByOpen.map(id => id.slice(0, 8)).join(', ')}\n`,
        );
      }
    }
    process.stdout.write(`\n`);
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

// ── continuum observe — capture terminal output as a live Observation ─────────
//
// The CAPTURE seam of the qualifying loop. Pipe any command's output in and it
// becomes a `type='command'` Observation the (separate) qualifying agent can
// later cross-examine against the codebase, spec, and knowledge base.
//
//   npm test 2>&1 | continuum observe --label test --exit $?
//   ./build.sh 2>&1 | continuum observe --label build --cmd "./build.sh" --exit $?
//
// It TEEs stdin → stdout, so the output still shows in your terminal (the pipe
// stays transparent). Content flows through storage.upsertObservation()'s
// privacy-scrub choke-point before it's stored.
//
// Source registration: under the 'export' genre (captured tool/session activity)
// but distinguished by the `terminal:<project>` sourceId prefix — which is what
// the Brain/Timeline color by — plus obs type 'command'. Migration-free until a
// first-class 'terminal' SourceType lands (P4: honest about the reuse).
async function commandObserve(projectId: string): Promise<void> {
  const argv = process.argv.slice(3);
  let label = '', cmd = '', exitCode: number | null = null, maxBytes = 64 * 1024;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    const val = (): string => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : (argv[++i] ?? ''));
    if (a === '--label' || a.startsWith('--label=')) label = val();
    else if (a === '--cmd' || a.startsWith('--cmd=')) cmd = val();
    else if (a === '--exit' || a.startsWith('--exit=')) { const n = Number(val()); exitCode = Number.isFinite(n) ? n : null; }
    else if (a === '--max-bytes' || a.startsWith('--max-bytes=')) { const n = Number(val()); if (Number.isFinite(n) && n > 0) maxBytes = n; }
  }

  // Read piped stdin while TEE-ing to stdout so the pipe stays transparent. Guard
  // the interactive-TTY case (no pipe) so `observe` never hangs waiting on input.
  let output = '';
  let total = 0;
  let truncated = false;
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      process.stdin.on('data', (d: Buffer) => {
        process.stdout.write(d);                    // tee — user still sees it
        total += d.length;
        if (!truncated) {
          chunks.push(d);
          if (Buffer.concat(chunks).length >= maxBytes) truncated = true;
        }
      });
      process.stdin.on('end', () => resolve());
      process.stdin.on('error', () => resolve());
    });
    output = Buffer.concat(chunks).toString('utf8');
    if (output.length > maxBytes) output = output.slice(0, maxBytes);
  }

  // Nothing worth recording (no output AND no command/exit context) → clean no-op.
  if (!output.trim() && !cmd && exitCode === null) process.exit(0);

  const status = exitCode === null ? 'unknown' : exitCode === 0 ? 'ok' : 'fail';
  const storage = openStorage(projectId);
  const sourceId = `terminal:${projectId}`;
  storage.upsertSource(sourceId, 'export', {
    adapter: '@number7even/continuum-cli observe',
    version: '0.0.2',
    note: "terminal capture — genre 'export' pending a first-class 'terminal' SourceType",
  });

  const header = [
    cmd ? `$ ${cmd}` : (label ? `[${label}]` : '$ (command)'),
    exitCode === null ? '' : `→ exit ${exitCode} (${status})`,
  ].filter(Boolean).join(' ');
  const content = `${header}\n${output.trimEnd()}${truncated ? '\n…[truncated]' : ''}`.trimEnd();

  // Significance flag the qualifier keys on (P9: it decides, observe only hints):
  // a non-zero exit, or a build/test/git/deploy-class label/command.
  const significant =
    (exitCode !== null && exitCode !== 0) ||
    /\b(test|build|deploy|release|git|ci|lint|typecheck|migrate|publish)\b/i.test(`${label} ${cmd}`);

  const id = randomUUID();
  storage.upsertObservation({
    id,
    sourceId,
    type: 'command',
    content,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: {
      label: label || undefined,
      cmd: cmd || undefined,
      exitCode,
      status,
      cwd: process.cwd(),
      bytes: total,
      truncated,
      significant: significant || undefined,
    },
  });

  // Confirmation on stderr (never stdout — keep the pipe clean for downstream),
  // then exit explicitly: attaching stdin 'data' listeners refs the event loop,
  // so a leaf capture command must not rely on a natural exit (it would hang).
  process.stderr.write(
    `\x1b[2m[continuum] observed ${status}${label ? ' · ' + label : ''}${significant ? ' · significant' : ''} → ${sourceId} ${id.slice(0, 8)}\x1b[0m\n`,
    () => process.exit(0),
  );
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

    case 'ingest':
      commandIngest();
      return;

    case 'next':
      commandNext(projectId);
      return;

    case 'observe':
      await commandObserve(projectId);
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
