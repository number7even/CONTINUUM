#!/usr/bin/env node
/**
 * @continuum/adapter-export
 *
 * Tails Claude session JSONL transcripts in ~/.claude/projects/ and writes
 * each turn into the Continuum DB as an Observation.
 *
 * USAGE
 *
 *   # Watch a project's session directory forever, writing new turns live:
 *   node dist/index.js --project=vc-hospitality --watch
 *
 *   # One-shot backfill: ingest everything currently in the project dir, exit:
 *   node dist/index.js --project=vc-hospitality --once
 *
 *   # Defaults: --watch, --project=$CONTINUUM_PROJECT_ID, claude root=~/.claude
 *
 * MAPPING (project → Claude session directory)
 *
 *   Continuum project name      Claude session directory
 *   --------------------       -----------------------------------------
 *   vc-hospitality              ~/.claude/projects/-Users-...VC-Hospitality
 *   continuum                   ~/.claude/projects/-Users-...CONTINUUM
 *   number7evencrm              ~/.claude/projects/-Users-...number7evencrm
 *
 * The adapter discovers the directory by matching the project name against
 * the encoded path segment. Override with --claude-dir for full control.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chokidar from 'chokidar';
import {
  openDb,
  upsertSource,
  insertObservationsBulk,
  type Observation,
} from '@continuum/core';
import { parseJsonlLine, turnToObservation } from './parser.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

interface Args {
  project: string;
  mode: 'watch' | 'once';
  claudeDir: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    project: process.env.CONTINUUM_PROJECT_ID ?? '',
    mode: 'watch',
    claudeDir: join(homedir(), '.claude', 'projects'),
    verbose: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--project=')) args.project = a.split('=')[1] ?? '';
    else if (a === '--once') args.mode = 'once';
    else if (a === '--watch') args.mode = 'watch';
    else if (a.startsWith('--claude-dir=')) args.claudeDir = a.split('=')[1] ?? args.claudeDir;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
  }
  if (!args.project) {
    console.error('error: --project=<continuum-project-id> required (or set CONTINUUM_PROJECT_ID)');
    process.exit(1);
  }
  return args;
}

// ── Locate Claude session directory for a Continuum project ──────────────────

function findClaudeSessionDir(claudeRoot: string, projectName: string): string | null {
  if (!existsSync(claudeRoot)) return null;
  const dirs = readdirSync(claudeRoot);
  // The encoded format is "-Users-...-<RepoName>". Match case-insensitively
  // on the trailing path segment, since Continuum project names are usually
  // a kebab-case version of the repo dir name.
  const normalized = projectName.toLowerCase().replace(/-/g, '');
  const candidate = dirs.find(d => d.toLowerCase().replace(/-/g, '').endsWith(normalized));
  if (!candidate) return null;
  return join(claudeRoot, candidate);
}

// ── Per-file offset tracking ─────────────────────────────────────────────────
//
// JSONL is append-only. To avoid re-ingesting on every change, we track the
// last byte offset read per file. Reset to 0 if file shrank (unusual but
// can happen if Claude truncates or rotates).

const offsets = new Map<string, number>();

function processFile(
  db: ReturnType<typeof openDb>,
  filePath: string,
  sourceId: string,
  verbose: boolean,
): { added: number; dropped: number } {
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return { added: 0, dropped: 0 };
  }
  const lastOffset = offsets.get(filePath) ?? 0;
  if (size <= lastOffset) {
    // File didn't grow (or was rotated). If shrunk, reset to read from start.
    if (size < lastOffset) offsets.set(filePath, 0);
    return { added: 0, dropped: 0 };
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(filePath);
  } catch {
    return { added: 0, dropped: 0 };
  }
  const newBytes = bytes.slice(lastOffset);

  const text = newBytes.toString('utf-8');
  // Split into lines but keep track of which were complete (terminated by \n).
  // The LAST line may be partial if Claude wrote it mid-line — re-read next tick.
  const lines = text.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  // If lastLine is empty, the buffer ended cleanly on \n → all lines complete.
  // Otherwise the last line is partial → exclude it, rewind offset to before it.
  const completeLines = lastLine === '' ? lines.slice(0, -1) : lines.slice(0, -1);
  const consumedBytes = lastLine === ''
    ? bytes.length
    : bytes.length - Buffer.byteLength(lastLine, 'utf-8');

  if (completeLines.length === 0) {
    offsets.set(filePath, lastOffset);
    return { added: 0, dropped: 0 };
  }

  const fileMtime = new Date(statSync(filePath).mtimeMs).toISOString();
  const observations: Array<Omit<Observation, 'id'>> = [];

  for (const line of completeLines) {
    if (!line.trim()) continue;
    const turn = parseJsonlLine(line, fileMtime);
    if (!turn) continue;
    if (turn.content.trim().length < 4) continue; // skip empty / meta-only lines
    observations.push(turnToObservation(turn, sourceId));
  }

  let added = 0;
  let dropped = 0;
  if (observations.length > 0) {
    const result = insertObservationsBulk(db, observations);
    added = result.inserted;
    dropped = result.dropped;
  }

  offsets.set(filePath, consumedBytes);

  if (verbose && (added > 0 || dropped > 0)) {
    const name = filePath.split('/').pop();
    console.log(`[export] ${name}: +${added} observation${added === 1 ? '' : 's'}${dropped > 0 ? ` (${dropped} dropped by privacy filter)` : ''}`);
  }

  return { added, dropped };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const db = openDb(args.project);
  const sourceId = `export:${args.project}`;
  upsertSource(db, sourceId, 'export', { adapter: '@continuum/adapter-export', version: '0.0.1' });

  const sessionDir = findClaudeSessionDir(args.claudeDir, args.project);
  if (!sessionDir) {
    console.error(`error: no Claude session directory found for project "${args.project}"`);
    console.error(`       searched: ${args.claudeDir}`);
    console.error(`       hint: pass --claude-dir=/abs/path/to/dir for non-standard locations`);
    process.exit(2);
  }

  console.log(`[export] project=${args.project}`);
  console.log(`[export] session dir=${sessionDir}`);
  console.log(`[export] db=${(db as any).name ?? '~/.continuum/' + args.project + '/continuum.db'}`);
  console.log(`[export] mode=${args.mode}`);

  // Initial backfill pass — read every existing .jsonl file from offset 0.
  const initialFiles = readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
  let totalAdded = 0;
  let totalDropped = 0;
  for (const f of initialFiles) {
    const full = join(sessionDir, f);
    const { added, dropped } = processFile(db, full, sourceId, args.verbose);
    totalAdded += added;
    totalDropped += dropped;
  }
  console.log(`[export] backfill complete: ${totalAdded} observation${totalAdded === 1 ? '' : 's'} added from ${initialFiles.length} file${initialFiles.length === 1 ? '' : 's'}${totalDropped > 0 ? ` (${totalDropped} dropped by privacy filter)` : ''}`);

  if (args.mode === 'once') {
    db.close();
    return;
  }

  // Live watch mode — tail every .jsonl in the session dir.
  console.log(`[export] watching for new turns...`);
  const watcher = chokidar.watch(`${sessionDir}/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,
  });

  const handle = (path: string) => {
    processFile(db, path, sourceId, args.verbose);
  };

  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('error', err => console.error('[export] watcher error:', err));

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[export] shutting down...');
    watcher.close().then(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[export] fatal:', err);
  process.exit(1);
});
