#!/usr/bin/env node
/**
 * @number7even/continuum-adapter-remote-git
 *
 * Perimeter Intelligence (Phase 1). Turns any external GitHub repository into a
 * compact, prompt-friendly "Objective State Payload" Observation, so an AI never
 * cold-starts on an unfamiliar codebase. The payload is persisted through the
 * existing StorageBackend seam and is retrievable via the 3-layer Progressive
 * Disclosure surface (search -> timeline -> get_observations) like any other
 * Observation.
 *
 * PIPELINE
 *   1. gitingest (real tool, via src/gitingest_digest.py) clones the remote repo
 *      shallow and produces a digest: summary stats + directory tree + file
 *      contents, with an estimated token count.
 *   2. A pluggable synthesis step (GitReverse-style) condenses the digest into a
 *      focused Objective State Payload. The DEFAULT synthesizer is deterministic
 *      and local (no LLM, no network beyond the clone) so repo context never
 *      leaves the machine. An LLM/ruvllm synthesizer can be injected later
 *      (roadmap: routed to local inference at V0.5) without touching the seam.
 *   3. The payload is upserted as ONE Observation (type 'remote_repo_digest',
 *      stable ID = sha256(repoUrl)). The full file dump is intentionally NOT
 *      stored (token bloat); on-demand deep file fetch is the git-mcp peer
 *      server's job. The privacy filter runs on upsert like every other source.
 *
 * Design note: this adapter reuses the 'git' SourceType (sourceId
 * `git:remote:<slug>`) with a distinct observation type, so it needs no change
 * to the already-published @number7even/continuum-core types. The semantic
 * distinction lives in Observation.type.
 *
 * USAGE
 *   node dist/index.js --repo=https://github.com/owner/name --project=continuum
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStorage, type StorageBackend, type Observation } from '@number7even/continuum-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_HELPER = resolve(__dirname, 'gitingest_digest.py');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RepoDigest {
  repo: string;
  commit: string;
  files: number | null;
  tokens: string | null;
  summary: string;
  tree: string;
  content: string;
}

/** Pluggable GitReverse-style synthesis. Default is deterministic + local. */
export type Synthesizer = (digest: RepoDigest) => string;

export interface IngestRemoteRepoOptions {
  repoUrl: string;
  project: string;
  storage?: StorageBackend;
  /** Inject an LLM/ruvllm synthesizer; omit for the deterministic default. */
  synthesize?: Synthesizer;
  /** Cap the file-content excerpt embedded in the payload (chars). */
  excerptChars?: number;
  /** Path to python3 (default: 'python3'). */
  python?: string;
}

export interface IngestRemoteRepoResult {
  observationId: string;
  repo: string;
  commit: string;
  files: number | null;
  estimatedSourceTokens: string | null;
  payloadChars: number;
  dropped: boolean;
}

// ── Stable ID (UUID-shape sha256, matching the docs adapter convention) ────────

function stableId(repoUrl: string): string {
  const hex = createHash('sha256').update(`remote-git:${repoUrl}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function slug(repo: string): string {
  return repo.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'unknown';
}

// ── gitingest bridge ───────────────────────────────────────────────────────────

export function runGitingest(repoUrl: string, python = 'python3'): RepoDigest {
  let raw: string;
  try {
    raw = execFileSync(python, [PY_HELPER, repoUrl], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'], // gitingest logs to stderr; ignore it
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`gitingest helper failed for ${repoUrl}: ${msg}`);
  }
  let parsed: { ok: boolean; error?: string } & Partial<RepoDigest>;
  try {
    parsed = JSON.parse(raw.trim().split('\n').pop() ?? '{}');
  } catch {
    throw new Error(`gitingest helper returned non-JSON for ${repoUrl}`);
  }
  if (!parsed.ok) throw new Error(`gitingest: ${parsed.error ?? 'unknown error'}`);
  return {
    repo: parsed.repo ?? repoUrl,
    commit: parsed.commit ?? '',
    files: parsed.files ?? null,
    tokens: parsed.tokens ?? null,
    summary: parsed.summary ?? '',
    tree: parsed.tree ?? '',
    content: parsed.content ?? '',
  };
}

// ── Default deterministic synthesizer (GitReverse-style, no LLM) ───────────────

export function defaultSynthesize(digest: RepoDigest, excerptChars = 4000): string {
  const excerpt = digest.content.length > excerptChars
    ? digest.content.slice(0, excerptChars) + `\n\n…[content truncated; ${digest.content.length - excerptChars} more chars. Use git-mcp to fetch specific files on demand.]`
    : digest.content;
  return [
    `# Objective State Payload — ${digest.repo}`,
    ``,
    `Remote repository ingested for perimeter intelligence. This is a compact`,
    `digest for cold-start understanding, not a full mirror. For specific files`,
    `or code, fetch on demand via the git-mcp peer server.`,
    ``,
    `## Repository facts`,
    `- Repo: ${digest.repo}`,
    `- Commit: ${digest.commit || 'unknown'}`,
    `- Files analyzed: ${digest.files ?? 'unknown'}`,
    `- Estimated source tokens: ${digest.tokens ?? 'unknown'}`,
    ``,
    `## Structure`,
    '```',
    digest.tree.trim(),
    '```',
    ``,
    `## Content excerpt`,
    excerpt.trim(),
  ].join('\n');
}

// ── Main: ingest a remote repo into a single Observation ───────────────────────

export function ingestRemoteRepo(opts: IngestRemoteRepoOptions): IngestRemoteRepoResult {
  const { repoUrl, project } = opts;
  if (!repoUrl) throw new Error('repoUrl is required');
  if (!project) throw new Error('project is required');

  const storage = opts.storage ?? openStorage(project);
  const synth = opts.synthesize ?? ((d: RepoDigest) => defaultSynthesize(d, opts.excerptChars ?? 4000));

  const digest = runGitingest(repoUrl, opts.python ?? 'python3');
  const payload = synth(digest);
  const id = stableId(repoUrl);
  const sourceId = `git:remote:${slug(digest.repo || repoUrl)}`;

  storage.upsertSource(sourceId, 'git', { adapter: 'remote-git', repoUrl });

  const obs: Omit<Observation, 'id'> & { id: string } = {
    id,
    sourceId,
    type: 'remote_repo_digest',
    content: payload,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: {
      adapter: 'remote-git',
      repoUrl,
      repo: digest.repo,
      commit: digest.commit,
      files: digest.files,
      estimatedSourceTokens: digest.tokens,
    },
  };
  const written = storage.upsertObservation(obs);

  return {
    observationId: id,
    repo: digest.repo,
    commit: digest.commit,
    files: digest.files,
    estimatedSourceTokens: digest.tokens,
    payloadChars: payload.length,
    dropped: written === null,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────

function parseFlag(argv: string[], name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function isMain(): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isMain()) {
  const argv = process.argv.slice(2);
  const repoUrl = parseFlag(argv, 'repo');
  const project = parseFlag(argv, 'project') ?? process.env.CONTINUUM_PROJECT_ID;
  if (!repoUrl || !project) {
    process.stderr.write('usage: continuum-adapter-remote-git --repo=<github-url> --project=<id>\n');
    process.exit(2);
  }
  try {
    const r = ingestRemoteRepo({ repoUrl, project });
    process.stdout.write(
      `remote-git: ingested ${r.repo} @ ${r.commit.slice(0, 8)}\n` +
        `  observation: ${r.observationId}\n` +
        `  files: ${r.files} · source tokens: ${r.estimatedSourceTokens} · payload: ${r.payloadChars} chars\n` +
        (r.dropped ? '  ⚠ dropped by privacy filter\n' : '  ✓ stored\n'),
    );
  } catch (err) {
    process.stderr.write(`remote-git error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
