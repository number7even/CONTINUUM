/**
 * continuum_codebase_context (Workspace D3) — pull real, AST-verified symbols from the local
 * DeusData code graph into a dossier. Grounds a PRD / task card in actual codebase reality
 * (functions, classes, interfaces, routes, call-chains) instead of the model's recollection.
 *
 * Local + zero-egress + verify-then-dissolve (a stateless single-shot query per call). When the
 * binary is absent or the project isn't indexed, it reports { available:false } with a reason —
 * it never fabricates a symbol (P4).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { codebaseContext, indexRepo } from '../codebase-bridge.js';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

export const codebaseContextTool: ToolDefinition = {
  name: 'continuum_codebase_context',
  description: 'Ground a dossier in REAL code: pull AST-verified symbols (functions, classes, interfaces, routes) from the local DeusData code graph for a query. Optionally index a repo first. Local, zero-egress; returns { available:false } if not installed/indexed — never invents a symbol.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to ground — a symbol name, feature, or concept (e.g. "scoreDocument", "truth ledger").' },
      project: { type: 'string', description: 'The indexed code-graph project name (see index below or the CMM project list).' },
      limit: { type: 'number', description: 'Max symbols (default 12).' },
      indexRepoPath: { type: 'string', description: 'Optional absolute repo path to index (mode=fast) before querying — use once, then query by project.' },
    },
    required: ['query', 'project'],
  },
};

export const handleCodebaseContext: ToolHandler = async (args) => {
  const { query, project, limit, indexRepoPath } = (args ?? {}) as {
    query?: string; project?: string; limit?: number; indexRepoPath?: string;
  };
  if (!query?.trim()) throw new Error('query is required');
  if (!project?.trim()) throw new Error('project is required (the indexed code-graph name)');
  let indexed;
  if (indexRepoPath?.trim()) {
    indexed = indexRepo({ repoPath: indexRepoPath, name: project, mode: 'fast' });
  }
  const ctx = codebaseContext(query, { project, limit });
  return ok({ ...ctx, ...(indexed ? { indexed } : {}) });
};
