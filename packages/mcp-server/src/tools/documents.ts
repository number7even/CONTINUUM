/**
 * PM document tools (Workspace D5-documents): list_templates · create_document ·
 * get_document · update_document · list_documents · search_documents.
 *
 * Documents persist as Observations (type='document', sourceId='documents') — they inherit
 * the privacy filter + FTS5 search + the whole storage abstraction for free. Every create/
 * update runs the coaching scorer (documents.ts) so the doc arrives already coached.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { randomUUID } from 'node:crypto';
import { renderTemplate, scoreDocument, listTemplates } from '@number7even/continuum-core';
import type { StorageBackend } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler } from '../tool-types.js';
import { codebaseContext, renderGrounding } from '../codebase-bridge.js';

const SOURCE = 'documents';
const now = () => new Date().toISOString();
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

/** Sweep the document observations (compact list — progressive disclosure). */
function allDocs(storage: StorageBackend) {
  const hits = storage.listObservationsAround({ at: now(), beforeHours: 24 * 365 * 5, afterHours: 0, limit: 5000 });
  const docs = [];
  const ids = hits.map(h => h.id);
  for (let i = 0; i < ids.length; i += 50) {
    for (const o of storage.getObservations(ids.slice(i, i + 50))) if (o.type === 'document') docs.push(o);
  }
  return docs;
}

// ── list_templates ────────────────────────────────────────────────────────────
export const listTemplatesTool: ToolDefinition = {
  name: 'continuum_list_templates',
  description: 'List the PM document templates (PRD, PR-FAQ / Working Backwards, TDD, GTM brief, RFC, OKRs, user story, postmortem, roadmap, one-pager). Use before create_document.',
  inputSchema: { type: 'object', properties: {} },
};
export const handleListTemplates: ToolHandler = async () => ok({ templates: listTemplates() });

// ── create_document ─────────────────────────────────────────────────────────
export const createDocumentTool: ToolDefinition = {
  name: 'continuum_create_document',
  description: 'Create a PM document from a template. Returns the id, the rendered markdown, and the coaching SCORE (Strategy/Structure/Clarity/Completeness 0-10 + top-3 improvements). Pass fields{} to pre-fill sections by heading. Pass groundProject to append a "Codebase Grounding" block of REAL AST symbols (DeusData, local) so the dossier is grounded in actual code.',
  inputSchema: {
    type: 'object',
    properties: {
      templateId: { type: 'string', description: 'A template id from continuum_list_templates (e.g. "prd", "pr-faq", "tdd").' },
      title: { type: 'string' },
      fields: { type: 'object', description: 'Optional {sectionHeading: content} to pre-fill.' },
      groundProject: { type: 'string', description: 'Optional indexed code-graph project name — grounds the doc in real AST symbols matching its title (falls back to $CONTINUUM_CMM_PROJECT).' },
    },
    required: ['templateId'],
  },
};
export const handleCreateDocument: ToolHandler = async (args, storage) => {
  const { templateId, title, fields, groundProject } = (args ?? {}) as { templateId?: string; title?: string; fields?: Record<string, string>; groundProject?: string };
  if (!templateId) throw new Error('templateId is required (see continuum_list_templates)');
  const body = renderTemplate(templateId, { title, fields });
  // The SCORE grades the author's content — grounding is additive context, appended AFTER scoring
  // so real-code symbols never inflate the coaching signal.
  const score = scoreDocument(body, templateId);
  // D3: ground the dossier in real code when a code-graph project is named (arg or env).
  const project = groundProject?.trim() || process.env.CONTINUUM_CMM_PROJECT?.trim();
  const grounding = project ? codebaseContext(title ?? templateId, { project }) : null;
  const text = grounding ? body + renderGrounding(grounding) : body;
  storage.upsertSource(SOURCE, 'docs', { adapter: 'pm-workspace' });
  const id = randomUUID();
  const codebaseRefs = grounding?.available ? grounding.symbols.map(s => s.qualified) : [];
  const saved = storage.upsertObservation({ id, sourceId: SOURCE, type: 'document', content: text, timestamp: now(), refs: [], metadata: { docType: templateId, title: title ?? templateId, version: 1, overall: score.overall, codebaseRefs } });
  if (!saved) throw new Error('document rejected by the privacy filter (contained only redacted content)');
  return ok({ id, docType: templateId, title: saved.metadata?.title, score, text, ...(grounding ? { grounding: { available: grounding.available, symbolCount: grounding.symbols.length, reason: grounding.reason } } : {}) });
};

// ── get_document ──────────────────────────────────────────────────────────────
export const getDocumentTool: ToolDefinition = {
  name: 'continuum_get_document',
  description: 'Fetch one document by id — full text + metadata + a fresh coaching score.',
  inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
};
export const handleGetDocument: ToolHandler = async (args, storage) => {
  const { id } = (args ?? {}) as { id?: string };
  if (!id) throw new Error('id is required');
  const [obs] = storage.getObservations([id]);
  if (!obs || obs.type !== 'document') throw new Error(`no document with id ${id}`);
  return ok({ id, metadata: obs.metadata, score: scoreDocument(obs.content, (obs.metadata?.docType as string) ?? undefined), text: obs.content });
};

// ── update_document ───────────────────────────────────────────────────────────
export const updateDocumentTool: ToolDefinition = {
  name: 'continuum_update_document',
  description: 'Replace a document’s text (bumps version), and return the NEW coaching score so the edit is graded immediately.',
  inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] },
};
export const handleUpdateDocument: ToolHandler = async (args, storage) => {
  const { id, text } = (args ?? {}) as { id?: string; text?: string };
  if (!id || text == null) throw new Error('id and text are required');
  const [existing] = storage.getObservations([id]);
  if (!existing || existing.type !== 'document') throw new Error(`no document with id ${id}`);
  const docType = (existing.metadata?.docType as string) ?? undefined;
  const score = scoreDocument(text, docType);
  const version = Number(existing.metadata?.version ?? 1) + 1;
  const saved = storage.upsertObservation({ id, sourceId: SOURCE, type: 'document', content: text, timestamp: now(), refs: existing.refs ?? [], metadata: { ...existing.metadata, version, overall: score.overall } });
  if (!saved) throw new Error('update rejected by the privacy filter');
  return ok({ id, version, score });
};

// ── list_documents ────────────────────────────────────────────────────────────
export const listDocumentsTool: ToolDefinition = {
  name: 'continuum_list_documents',
  description: 'List all documents (compact: id, title, type, version, score) — the cheap surface; use get_document for full text.',
  inputSchema: { type: 'object', properties: {} },
};
export const handleListDocuments: ToolHandler = async (_args, storage) => {
  const docs = allDocs(storage).map(d => ({ id: d.id, title: d.metadata?.title ?? '(untitled)', docType: d.metadata?.docType ?? null, version: d.metadata?.version ?? 1, overall: d.metadata?.overall ?? null }));
  return ok({ count: docs.length, documents: docs });
};

// ── search_documents ──────────────────────────────────────────────────────────
export const searchDocumentsTool: ToolDefinition = {
  name: 'continuum_search_documents',
  description: 'Full-text search across documents (FTS5). Returns matching docs, compact.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
};
export const handleSearchDocuments: ToolHandler = async (args, storage) => {
  const { query, limit } = (args ?? {}) as { query?: string; limit?: number };
  if (!query?.trim()) throw new Error('query is required');
  const hits = storage.searchObservations(query, limit ?? 50);
  const full = storage.getObservations(hits.map(h => h.id)).filter(o => o.type === 'document');
  return ok({ count: full.length, documents: full.map(d => ({ id: d.id, title: d.metadata?.title ?? '(untitled)', docType: d.metadata?.docType ?? null, version: d.metadata?.version ?? 1 })) });
};
