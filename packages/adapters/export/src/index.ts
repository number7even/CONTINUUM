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
import { createHash } from 'node:crypto';
import chokidar from 'chokidar';
import {
  openStorage,
  type StorageBackend,
  type Observation,
} from '@continuum/core';
import { parseJsonlLine, turnToObservation } from './parser.js';
import { ingestViaHierarchicalSwarm, type TurnInput } from './swarm.js';

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

/** Derive a stable per-turn ID. Used for BFT inputId so multiple agents'
 *  candidates for the same turn group together. The W25 storage path
 *  generates its own UUID for the observation row — this is the BFT
 *  vote key only, not the row ID. */
function turnId(fileBasename: string, observation: Omit<Observation, 'id'>): string {
  const h = createHash('sha256');
  h.update(fileBasename);
  h.update('\x1f');
  h.update(observation.timestamp);
  h.update('\x1f');
  h.update(observation.content.slice(0, 256));
  return h.digest('hex').slice(0, 16);
}

/** Linear file processor — the watch-mode and the offset bookkeeping path.
 *  Used directly for live append (one-turn-at-a-time spawning a swarm is
 *  absurd overhead). Backfill takes a different path that calls
 *  collectBackfillTurns + ingestViaHierarchicalSwarm. */
function processFile(
  storage: StorageBackend,
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
    const result = storage.insertObservationsBulk(observations);
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
  const storage = openStorage(args.project);
  const sourceId = `export:${args.project}`;
  storage.upsertSource(sourceId, 'export', { adapter: '@continuum/adapter-export', version: '0.0.1' });

  const sessionDir = findClaudeSessionDir(args.claudeDir, args.project);
  if (!sessionDir) {
    console.error(`error: no Claude session directory found for project "${args.project}"`);
    console.error(`       searched: ${args.claudeDir}`);
    console.error(`       hint: pass --claude-dir=/abs/path/to/dir for non-standard locations`);
    process.exit(2);
  }

  console.log(`[export] project=${args.project}`);
  console.log(`[export] session dir=${sessionDir}`);
  console.log(`[export] storage=${storage.dataLocation()}`);
  console.log(`[export] mode=${args.mode}`);

  // W26-3-export — backfill path goes through the hierarchical-topology
  // swarm. Watch mode (below) stays linear since spawning a swarm per
  // live turn is absurd overhead.
  const initialFiles = readdirSync(sessionDir).filter(f => f.endsWith('.jsonl'));
  const turns: TurnInput[] = [];
  for (const f of initialFiles) {
    const full = join(sessionDir, f);
    let bytes: Buffer;
    try {
      bytes = readFileSync(full);
    } catch {
      continue;
    }
    const size = bytes.length;
    offsets.set(full, size); // mark whole-file consumed for the watcher
    const fileMtime = new Date(statSync(full).mtimeMs).toISOString();
    const lines = bytes.toString('utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      const turn = parseJsonlLine(line, fileMtime);
      if (!turn) continue;
      const observation = turnToObservation(turn, sourceId);
      const body = observation.content.trim();
      turns.push({
        id: turnId(f, observation),
        fileBasename: f,
        observation,
        features: {
          bodyLength: body.length,
          isToolAcknowledgement: /^(ok|done|sure|got it)\.?$/i.test(body),
          isMetaOnly: body.length < 4,
        },
      });
    }
  }

  const result = await ingestViaHierarchicalSwarm(turns, {
    storage,
    sourceId,
    maxAgents: 4,
    verbose: args.verbose,
  });
  console.log(
    `[export] backfill complete via swarm=${result.swarmId} agents=${result.agentsSpawned} ` +
      `shards=${result.shardsProcessed} turns=${result.turnsScanned} upserted=${result.upserted} ` +
      `voteFiltered=${result.voteFiltered} ` +
      `BFT(unanimous=${result.unanimousIngest}, voted=${result.votedIngest}, noQuorum=${result.noQuorumIngest})`,
  );

  if (args.mode === 'once') {
    storage.close();
    return;
  }

  // Live watch mode — tail every .jsonl in the session dir.
  console.log(`[export] watching for new turns...`);
  const watcher = chokidar.watch(`${sessionDir}/*.jsonl`, {
    persistent: true,
    ignoreInitial: true,
  });

  const handle = (path: string) => {
    processFile(storage, path, sourceId, args.verbose);
  };

  watcher.on('add', handle);
  watcher.on('change', handle);
  watcher.on('error', err => console.error('[export] watcher error:', err));

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[export] shutting down...');
    watcher.close().then(() => {
      storage.close();
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
