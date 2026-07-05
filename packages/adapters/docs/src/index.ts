#!/usr/bin/env node
/**
 * @number7even/continuum-adapter-docs
 *
 * Ingests local markdown documentation into the Continuum observation index.
 * Each file becomes one Observation with `type='doc'` and a deterministic ID
 * derived from its repo-relative path — re-running the sync on edited files
 * upserts in place instead of duplicating.
 *
 * USAGE
 *
 *   # One-shot backfill — scan a docs directory and ingest every .md/.mdx:
 *   node dist/index.js --project=continuum --docs-dir=./docs --once
 *
 *   # Default mode is --once. (Watch mode is a V0.5 follow-up.)
 *
 *   # Project resolution: --project= flag > $CONTINUUM_PROJECT_ID > error.
 *   # Docs dir resolution: --docs-dir= flag > "./docs" (cwd-relative).
 *
 * STABLE ID SCHEME
 *
 *   For a file at <docs-dir>/foo/bar.md, the observation ID is the SHA-256
 *   of the docs-dir-relative path "foo/bar.md", formatted as a UUID-shape
 *   for display consistency (slice(0,8) yields a stable 8-char prefix in
 *   the session briefing — same shape as other Observation IDs).
 *
 * PRIVACY
 *
 *   The core privacy filter runs on every insert. Markdown files containing
 *   <private>...</private> blocks, OpenAI/xAI-style API keys, AWS access
 *   keys, or PEM private keys are scrubbed or dropped per the §8 invariant.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { openStorage } from '@number7even/continuum-core';
import { ingestViaMeshSwarm, type DocFile } from './swarm.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

interface Args {
  project: string;
  docsDir: string;
  mode: 'once';
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    project: process.env.CONTINUUM_PROJECT_ID ?? '',
    docsDir: resolve(process.cwd(), 'docs'),
    mode: 'once',
    verbose: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--project=')) args.project = a.split('=')[1] ?? '';
    else if (a.startsWith('--docs-dir=')) args.docsDir = resolve(a.split('=')[1] ?? args.docsDir);
    else if (a === '--once') args.mode = 'once';
    else if (a === '--verbose' || a === '-v') args.verbose = true;
  }
  if (!args.project) {
    console.error('error: --project=<continuum-project-id> required (or set CONTINUUM_PROJECT_ID)');
    process.exit(1);
  }
  return args;
}

// ── Stable ID derivation ─────────────────────────────────────────────────────

function pathToObservationId(relativePath: string): string {
  // Normalise to forward slashes so the ID is stable across OS — Windows path
  // separators must not produce a different hash than POSIX.
  const normalized = relativePath.split(sep).join('/');
  const hex = createHash('sha256').update(normalized).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ── Provenance edges — resolve internal markdown links to observation IDs ────

/**
 * Turn a doc's internal markdown links into refs to the observation IDs of the
 * docs they point at — the REAL provenance edges that light up the 3D brain
 * graph. Only links to files present in the ingested set become refs; external
 * URLs, anchors, and links that escape the docs root are dropped (same
 * dangling-drop discipline the graph builder enforces). No fabricated edges (P4).
 */
function linkRefs(file: DocFile, knownPaths: Set<string>): { refs: string[]; relations: Array<{ to: string; as: string }> } {
  const refs = new Set<string>();
  const relations = new Map<string, string>(); // target id → verb (last wins)
  // [text](target "optional title") — the TITLE, when a short verb phrase, becomes
  // the edge's meaning: `[VAULT](./x.md "enforces")` → this —enforces→ x. Authored,
  // deterministic — never inferred (P4).
  const linkRe = /\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(file.content)) !== null) {
    let target = m[1]!.trim();
    const title = (m[2] ?? '').trim();
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue; // protocol / protocol-relative / pure-anchor
    target = target.split('#')[0]!.split('?')[0]!; // strip anchor + query
    if (!target || !/\.mdx?$/i.test(target)) continue; // markdown targets only
    const base = target.startsWith('/')
      ? target.slice(1)
      : posix.join(posix.dirname(file.relativePath), target);
    const resolved = posix.normalize(base);
    if (resolved.startsWith('..') || resolved === file.relativePath) continue; // escaped root / self
    if (!knownPaths.has(resolved)) continue;
    const id = pathToObservationId(resolved);
    refs.add(id);
    // A title of 1–3 words with a letter is treated as a verb phrase (the meaning).
    if (title && /^[a-z][\w -]{1,28}$/i.test(title) && title.split(/\s+/).length <= 3) {
      relations.set(id, title.toLowerCase());
    }
  }
  return { refs: [...refs], relations: [...relations].map(([to, as]) => ({ to, as })) };
}

// ── Recursive markdown walker ────────────────────────────────────────────────

function isMarkdownFile(name: string): boolean {
  return name.endsWith('.md') || name.endsWith('.mdx');
}

function* walkMarkdownFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      yield* walkMarkdownFiles(full);
    } else if (stats.isFile() && isMarkdownFile(entry)) {
      yield full;
    }
  }
}

// ── Per-file read (the swarm consumes the readied list) ─────────────────────

function readDocFile(filePath: string, docsDir: string): DocFile | null {
  let content: string;
  let mtime: string;
  try {
    content = readFileSync(filePath, 'utf-8');
    mtime = new Date(statSync(filePath).mtimeMs).toISOString();
  } catch {
    return null;
  }
  if (content.trim().length < 4) return null;
  const relativePath = relative(docsDir, filePath).split(sep).join('/');
  return {
    absolutePath: filePath,
    relativePath,
    id: pathToObservationId(relativePath),
    content,
    timestamp: mtime,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!existsSync(args.docsDir)) {
    console.error(`error: docs directory does not exist: ${args.docsDir}`);
    console.error(`       hint: pass --docs-dir=/abs/path/to/docs or cd into a project root`);
    process.exit(2);
  }

  const storage = openStorage(args.project);
  const sourceId = `docs:${args.project}`;
  storage.upsertSource(sourceId, 'docs', {
    adapter: '@number7even/continuum-adapter-docs',
    version: '0.0.1',
    docsDir: args.docsDir,
  });

  console.log(`[docs] project=${args.project}`);
  console.log(`[docs] docs dir=${args.docsDir}`);
  console.log(`[docs] storage=${storage.dataLocation()}`);
  console.log(`[docs] mode=${args.mode}`);

  // W26-2 — collect file list, then hand to the mesh-topology swarm.
  // The swarm spawns N peer agents, runs each agent's title-extraction
  // strategy in parallel, Byzantine-votes on the subjective title,
  // upserts the canonical observation, and dissolves.
  const docFiles: DocFile[] = [];
  for (const filePath of walkMarkdownFiles(args.docsDir)) {
    const file = readDocFile(filePath, args.docsDir);
    if (file) docFiles.push(file);
  }
  console.log(`[docs] scanned ${docFiles.length} markdown file${docFiles.length === 1 ? '' : 's'}`);

  // Resolve internal doc-to-doc markdown links into refs — the graph edges.
  const knownPaths = new Set(docFiles.map(f => f.relativePath));
  for (const f of docFiles) {
    const { refs, relations } = linkRefs(f, knownPaths);
    f.refs = refs;
    f.relations = relations;
  }
  const edgeCount = docFiles.reduce((n, f) => n + (f.refs?.length ?? 0), 0);
  const verbCount = docFiles.reduce((n, f) => n + (f.relations?.length ?? 0), 0);
  console.log(`[docs] resolved ${edgeCount} internal doc-link edge(s) (${verbCount} typed with a verb) across ${docFiles.length} file(s)`);

  const result = await ingestViaMeshSwarm(docFiles, {
    storage,
    sourceId,
    docsDir: args.docsDir,
    maxAgents: 3,
    verbose: args.verbose,
  });

  console.log(
    `[docs] swarm=${result.swarmId} agents=${result.agentsSpawned} shards=${result.shardsProcessed} ` +
      `upserted=${result.upserted} dropped=${result.dropped} ` +
      `BFT(unanimous=${result.unanimousTitles}, voted=${result.votedTitles}, noQuorum=${result.noQuorumTitles})`,
  );

  storage.close();
}

main().catch(err => {
  console.error('[docs] fatal:', err);
  process.exit(1);
});
