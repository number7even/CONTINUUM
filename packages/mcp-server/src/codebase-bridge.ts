/**
 * codebase-bridge — DeusData `codebase-memory-mcp` as CONTINUUM's local AST context source.
 *
 * codebase-memory-mcp is a single static binary that parses a repo into a SQLite-backed code
 * graph (functions, classes, interfaces, routes, call-chains) entirely locally — zero egress,
 * no keys, no telemetry. Same invariants as CONTINUUM. We use its STATELESS single-shot mode
 * (`codebase-memory-mcp cli <tool> --flags`) rather than a persistent stdio sidecar: each call
 * spawns, answers, and dissolves — no orphaned process, verify-then-dissolve to the letter.
 *
 * P4 discipline: if the binary is not installed, or the repo is not indexed, or the query
 * matches nothing, we return `{ available: false }` / an empty symbol list — NEVER a fabricated
 * node. A dossier grounded in this bridge is grounded in real, AST-verified code or in nothing.
 *
 * Binary resolution order: $CONTINUUM_CMM_BIN → the installed optionalDependency → unavailable.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** A real symbol pulled from the code graph — every field is AST-derived, none invented. */
export interface CodeSymbol {
  name: string;
  qualified: string;
  kind: string;       // Function | Class | Interface | Method | Route | …
  file: string;
  startLine: number | null;
  endLine: number | null;
}

export interface CodebaseContext {
  available: boolean;
  /** Why it is unavailable — surfaced honestly, never papered over. */
  reason?: string;
  project?: string;
  query?: string;
  symbols: CodeSymbol[];
}

/** Resolve the codebase-memory-mcp entry (bin.js), or null when it isn't installed. */
export function resolveCmmBin(): string | null {
  const override = process.env.CONTINUUM_CMM_BIN?.trim();
  if (override) return override;
  try {
    return require.resolve('codebase-memory-mcp/bin.js');
  } catch {
    return null;
  }
}

export function codebaseAvailable(): boolean {
  return resolveCmmBin() !== null;
}

/** Parse the last JSON object the CLI printed to stdout (log lines start with `level=`, not `{`). */
function parseLastJson(stdout: string): unknown {
  const lines = stdout.split('\n').map(l => l.trim()).filter(l => l.startsWith('{') || l.startsWith('['));
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]!); } catch { /* keep scanning upward */ }
  }
  return null;
}

/** Run one stateless CLI tool. Returns the parsed JSON result, or throws on spawn/parse failure. */
function runCli(tool: string, flags: string[], timeoutMs = 120_000): unknown {
  const bin = resolveCmmBin();
  if (!bin) throw new Error('codebase-memory-mcp is not installed');
  const out = execFileSync(process.execPath, [bin, 'cli', tool, ...flags], {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = parseLastJson(out);
  if (parsed == null) throw new Error(`${tool} returned no parseable JSON`);
  return parsed;
}

/**
 * Index a repository into the local code graph. Idempotent-ish (re-index refreshes). Returns the
 * node/edge counts on success, or { available:false } when the binary is absent — never throws
 * outward (the caller degrades gracefully).
 */
export function indexRepo(opts: { repoPath: string; name: string; mode?: 'fast' | 'moderate' | 'full' }): {
  available: boolean; reason?: string; status?: string; nodes?: number; edges?: number; project?: string;
} {
  if (!codebaseAvailable()) return { available: false, reason: 'codebase-memory-mcp not installed' };
  try {
    const r = runCli('index_repository', [
      '--repo-path', opts.repoPath, '--name', opts.name, '--mode', opts.mode ?? 'fast',
    ]) as { status?: string; nodes?: number; edges?: number; project?: string };
    return { available: true, status: r.status, nodes: r.nodes, edges: r.edges, project: r.project ?? opts.name };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

interface GraphHit { name?: string; qualified_name?: string; label?: string; file_path?: string; start_line?: number; end_line?: number }

/**
 * Pull the real symbols matching a query from the code graph — the grounding for a dossier.
 * Empty result ⇒ nothing matched (honest silence), NOT a fabricated stand-in. Any failure
 * (no binary, project not indexed) ⇒ { available:false } with a reason — the caller reports it.
 */
export function codebaseContext(query: string, opts: { project: string; limit?: number } ): CodebaseContext {
  if (!codebaseAvailable()) return { available: false, reason: 'codebase-memory-mcp not installed', symbols: [] };
  if (!query?.trim()) return { available: false, reason: 'empty query', symbols: [] };
  try {
    const r = runCli('search_graph', ['--query', query, '--project', opts.project]) as { results?: GraphHit[] };
    const limit = opts.limit ?? 12;
    const symbols: CodeSymbol[] = (r.results ?? []).slice(0, limit).map(h => ({
      name: h.name ?? '(anonymous)',
      qualified: h.qualified_name ?? h.name ?? '',
      kind: h.label ?? 'Symbol',
      file: h.file_path ?? '',
      startLine: h.start_line ?? null,
      endLine: h.end_line ?? null,
    }));
    return { available: true, project: opts.project, query, symbols };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e), symbols: [] };
  }
}

/** Render real symbols as a markdown "Codebase Grounding" block for a dossier. Empty ⇒ ''. */
export function renderGrounding(ctx: CodebaseContext): string {
  if (!ctx.available) return `\n\n## Codebase Grounding\n\n_Unavailable: ${ctx.reason}. (No symbols invented — P4.)_\n`;
  if (!ctx.symbols.length) return `\n\n## Codebase Grounding\n\n_No matching symbols in the "${ctx.project}" code graph for "${ctx.query}"._\n`;
  const rows = ctx.symbols.map(s => `- \`${s.qualified}\` — ${s.kind}${s.file ? ` · ${s.file}${s.startLine ? `:${s.startLine}` : ''}` : ''}`);
  return `\n\n## Codebase Grounding\n\nReal AST symbols from the \`${ctx.project}\` code graph (DeusData, local):\n\n${rows.join('\n')}\n`;
}
