#!/usr/bin/env node
/**
 * @number7even/continuum-adapter-git
 *
 * Ingests git commits into the Continuum observation index. One Observation
 * per commit with `type='commit'` and the raw 40-char SHA as the stable ID —
 * matches git's own short-hash convention so the briefing's slice(0,8) gives
 * the recognisable short-form (e.g. `0125675`).
 *
 * USAGE
 *
 *   # One-shot backfill — read last N commits from a repo and upsert each:
 *   node dist/index.js --project=continuum --repo-dir=. --max-count=500 --once
 *
 *   # Default mode is --once. (Watch mode lands in V0.5 via a git post-commit
 *   # hook installed by `continuum init`.)
 *
 *   # Project resolution: --project= flag > $CONTINUUM_PROJECT_ID > error.
 *   # Repo dir resolution: --repo-dir= flag > cwd.
 *
 * CONTENT SHAPE
 *
 *   Observation.content = "<subject>\n\n<body>" (body omitted if empty).
 *   Observation.metadata = { adapter, sha, author, email, files (optional) }.
 *   Observation.timestamp = author date (ISO 8601, RFC3339).
 *
 *   Full diffs are intentionally NOT stored — privacy risk + token bloat,
 *   and `git show <sha>` recovers them on demand.
 *
 * PRIVACY
 *
 *   The core privacy filter runs on every upsert. Commits referencing API
 *   keys / PEM blobs / <private>...</private> blocks are scrubbed or
 *   dropped per the §8 invariant.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStorage } from '@number7even/continuum-core';
import { ingestViaRingSwarm, probePostTerminate, type ParsedCommit } from './swarm.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

interface Args {
  project: string;
  repoDir: string;
  maxCount: number;
  mode: 'once';
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    project: process.env.CONTINUUM_PROJECT_ID ?? '',
    repoDir: process.cwd(),
    maxCount: 500,
    mode: 'once',
    verbose: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--project=')) args.project = a.split('=')[1] ?? '';
    else if (a.startsWith('--repo-dir=')) args.repoDir = resolve(a.split('=')[1] ?? args.repoDir);
    else if (a.startsWith('--max-count=')) {
      const n = Number.parseInt(a.split('=')[1] ?? '500', 10);
      if (Number.isFinite(n) && n > 0) args.maxCount = n;
    } else if (a === '--once') args.mode = 'once';
    else if (a === '--verbose' || a === '-v') args.verbose = true;
  }
  if (!args.project) {
    console.error('error: --project=<continuum-project-id> required (or set CONTINUUM_PROJECT_ID)');
    process.exit(1);
  }
  return args;
}

// ── git log invocation ───────────────────────────────────────────────────────
//
// Format string:  %H \x1f %aI \x1f %an \x1f %ae \x1f %s \x1f %b
//   %H   = full SHA
//   %aI  = author date (ISO 8601 / RFC3339)
//   %an  = author name
//   %ae  = author email
//   %s   = subject line
//   %b   = body (multi-line)
//
// `-z` makes commits NUL-terminated (\x00) and disables newline normalisation
// inside %b, so multi-line commit messages survive. Field separator is the
// ASCII Unit Separator (\x1f) — guaranteed never to appear in commit text.

// ParsedCommit type is re-exported from ./swarm.ts so the swarm-ingest
// module and this file agree on shape.

function readCommits(repoDir: string, maxCount: number): ParsedCommit[] {
  const buf = execFileSync(
    'git',
    [
      '-C',
      repoDir,
      'log',
      '-z',
      `--max-count=${maxCount}`,
      '--pretty=format:%H%x1f%aI%x1f%an%x1f%ae%x1f%s%x1f%b',
    ],
    { encoding: 'buffer', maxBuffer: 1024 * 1024 * 64 },
  );

  const text = buf.toString('utf-8');
  if (!text) return [];

  const records = text.split('\x00').filter(r => r.length > 0);
  const commits: ParsedCommit[] = [];
  for (const r of records) {
    const fields = r.split('\x1f');
    if (fields.length < 5) continue;
    const [sha, isoDate, authorName, authorEmail, subject, body] = fields as [
      string,
      string,
      string,
      string,
      string,
      string | undefined,
    ];
    if (!/^[0-9a-f]{40}$/.test(sha)) continue;
    commits.push({
      sha,
      isoDate,
      authorName,
      authorEmail,
      subject,
      body: body ?? '',
    });
  }
  return commits;
}

// ── Per-commit normalisation moved into ./swarm.ts (the swarm-ingest path).
// Linear ingestCommit removed in W26-3; ingestViaRingSwarm now owns the
// shard-and-upsert work. The behaviour is observably identical for a
// single-shard run (one agent, one ring node), which keeps the existing
// idempotent-SHA contract intact.

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!existsSync(args.repoDir)) {
    console.error(`error: repo directory does not exist: ${args.repoDir}`);
    process.exit(2);
  }

  // Quick sanity check — is this actually a git repo?
  try {
    execFileSync('git', ['-C', args.repoDir, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf-8',
    });
  } catch {
    console.error(`error: not a git repository: ${args.repoDir}`);
    process.exit(2);
  }

  const storage = openStorage(args.project);
  const sourceId = `git:${args.project}`;
  storage.upsertSource(sourceId, 'git', {
    adapter: '@number7even/continuum-adapter-git',
    version: '0.0.1',
    repoDir: args.repoDir,
  });

  console.log(`[git] project=${args.project}`);
  console.log(`[git] repo dir=${args.repoDir}`);
  console.log(`[git] storage=${storage.dataLocation()}`);
  console.log(`[git] mode=${args.mode} max-count=${args.maxCount}`);

  const commits = readCommits(args.repoDir, args.maxCount);
  console.log(`[git] read ${commits.length} commit${commits.length === 1 ? '' : 's'} from git log`);

  // W26-3 — ephemeral ring-topology swarm. Spawns agents, shards
  // chronologically, processes in parallel, commits via the
  // W25-hardened storage path, dissolves on return (verify-then-
  // dissolve guaranteed in a try/finally inside ingestViaRingSwarm).
  const result = await ingestViaRingSwarm(commits, {
    storage,
    sourceId,
    maxAgents: 3,
    verbose: args.verbose,
  });

  console.log(
    `[git] swarm=${result.swarmId} agents=${result.agentsSpawned} ` +
      `shards=${result.shardsProcessed} upserted=${result.upserted} dropped=${result.dropped}`,
  );

  storage.close();
}

main().catch(err => {
  console.error('[git] fatal:', err);
  process.exit(1);
});
