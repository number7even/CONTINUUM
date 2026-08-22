/**
 * Tool registry + dispatcher.
 *
 * Aggregates the 9 per-tool definition + handler pairs into:
 *   - TOOL_DEFINITIONS[] for ListToolsRequestSchema responses
 *   - dispatchTool() for CallToolRequestSchema handling
 *
 * Adding a new tool = create tools/<name>.ts that exports the
 * definition + handler, then add the two lines below.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { p9Authorize, openP9Request } from '@number7even/continuum-core';
import type { StorageBackend } from '@number7even/continuum-core';
import type { ToolDefinition, ToolHandler, ToolResult } from '../tool-types.js';

import { recordCheckpointTool, handleRecordCheckpoint } from './record-checkpoint.js';
import { getStateTool, handleGetState } from './get-state.js';
import { getDigestTool, handleGetDigest } from './get-digest.js';
import { searchDocsTool, handleSearchDocs } from './search-docs.js';
import { timelineTool, handleTimeline } from './timeline.js';
import { getObservationsTool, handleGetObservations } from './get-observations.js';
import { deleteObservationTool, handleDeleteObservation } from './delete-observation.js';
import { getTodosTool, handleGetTodos } from './get-todos.js';
import { createTodoTool, handleCreateTodo } from './create-todo.js';
import { p9ApproveTool, handleP9Approve } from './p9-approve.js';
import { recordObservationTool, handleRecordObservation } from './record-observation.js';
import { updateTodoTool, handleUpdateTodo } from './update-todo.js';
import { recordBrandDnaTool, handleRecordBrandDna } from './record-brand-dna.js';
import { checkBrandTool, handleCheckBrand } from './check-brand.js';
import { graphTool, handleGraph } from './graph.js';
import { kaizenRecordTool, handleKaizenRecord } from './kaizen-record.js';
import { nextTasksTool, handleNextTasks } from './next-tasks.js';
import { snapshotsTool, handleSnapshots } from './snapshots.js';
import { recordDecisionTool, handleRecordDecision } from './record-decision.js';
import { sessionReviewTool, handleSessionReview } from './session-review.js';
import { askContextTool, handleAskContext } from './ask-context.js';
import { openClaimTool, handleOpenClaim } from './open-claim.js';
import { validateTool, handleValidate } from './validate.js';
import { attestTool, handleAttest } from './attest.js';
import {
  listTemplatesTool, handleListTemplates, createDocumentTool, handleCreateDocument,
  getDocumentTool, handleGetDocument, updateDocumentTool, handleUpdateDocument,
  listDocumentsTool, handleListDocuments, searchDocumentsTool, handleSearchDocuments,
} from './documents.js';
import { codebaseContextTool, handleCodebaseContext } from './codebase-context.js';

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  recordCheckpointTool,
  getStateTool,
  getDigestTool,
  searchDocsTool,
  timelineTool,
  getObservationsTool,
  deleteObservationTool,
  getTodosTool,
  createTodoTool,
  recordObservationTool,
  p9ApproveTool,
  updateTodoTool,
  recordBrandDnaTool,
  checkBrandTool,
  graphTool,
  kaizenRecordTool,
  nextTasksTool,
  snapshotsTool,
  recordDecisionTool,
  sessionReviewTool,
  askContextTool,
  openClaimTool,
  validateTool,
  attestTool,
  listTemplatesTool, createDocumentTool, getDocumentTool, updateDocumentTool, listDocumentsTool, searchDocumentsTool,
  codebaseContextTool,
] as const;

const DISPATCH_TABLE: Record<string, ToolHandler> = {
  continuum_record_checkpoint: handleRecordCheckpoint,
  continuum_get_state: handleGetState,
  continuum_get_digest: handleGetDigest,
  continuum_search_docs: handleSearchDocs,
  continuum_timeline: handleTimeline,
  continuum_get_observations: handleGetObservations,
  continuum_delete_observation: handleDeleteObservation,
  continuum_get_todos: handleGetTodos,
  continuum_create_todo: handleCreateTodo,
  continuum_record_observation: handleRecordObservation,
  continuum_p9_approve: handleP9Approve,
  continuum_update_todo: handleUpdateTodo,
  continuum_record_brand_dna: handleRecordBrandDna,
  continuum_check_brand: handleCheckBrand,
  continuum_graph: handleGraph,
  continuum_next_tasks: handleNextTasks,
  continuum_snapshots: handleSnapshots,
  continuum_kaizen_record: handleKaizenRecord,
  continuum_record_decision: handleRecordDecision,
  continuum_session_review: handleSessionReview,
  continuum_ask_context: handleAskContext,
  continuum_open_claim: handleOpenClaim,
  continuum_validate: handleValidate,
  continuum_attest: handleAttest,
  continuum_list_templates: handleListTemplates,
  continuum_create_document: handleCreateDocument,
  continuum_get_document: handleGetDocument,
  continuum_update_document: handleUpdateDocument,
  continuum_list_documents: handleListDocuments,
  continuum_search_documents: handleSearchDocuments,
  continuum_codebase_context: handleCodebaseContext,
};

/**
 * Dispatch a CallToolRequest. Returns the structured ToolResult on success;
 * thrown errors are caught by the caller (server.ts) and wrapped into the
 * `{ content: [...], isError: true }` MCP error shape.
 */
export async function dispatchTool(
  name: string,
  args: unknown,
  storage: StorageBackend,
): Promise<ToolResult> {
  const handler = DISPATCH_TABLE[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  // ── P9 interception ────────────────────────────────────────────────────────
  // Voice proposes; the physical click seals. A restricted verb halts HERE, before the
  // handler runs, because a handler that has already written cannot be un-run. The ask is
  // recorded as a p9-request (never a decision — that is the seal) and a suspension is
  // returned for the approval frame to render.
  //
  // The gate reads the LEDGER via p9Authorize, never the request table: an 'approved'
  // request row is a queue state, not consent, and keying execution off it would make any
  // writer to that source a consent-forgery primitive.
  const p9Args = (args ?? {}) as Record<string, unknown>;
  const ruling = p9Authorize(storage, {
    verb: name.replace(/^continuum_/, ''),
    target: typeof p9Args.target === 'string' ? p9Args.target : undefined,
    params: p9Args,
    origin: 'agent',
    proposedBy: typeof p9Args._proposedBy === 'string' ? p9Args._proposedBy : undefined,
  }, { autonomyLevel: typeof p9Args._autonomyLevel === 'string' ? p9Args._autonomyLevel : undefined });

  if (!ruling.allowed) {
    const req = openP9Request(storage, {
      action: {
        verb: name.replace(/^continuum_/, ''),
        target: typeof p9Args.target === 'string' ? p9Args.target : undefined,
        params: p9Args,
        proposedBy: typeof p9Args._proposedBy === 'string' ? p9Args._proposedBy : undefined,
      },
      tenantId: typeof p9Args._tenantId === 'string' ? p9Args._tenantId : 'unknown',
      autonomyLevel: typeof p9Args._autonomyLevel === 'string' ? p9Args._autonomyLevel : undefined,
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ok: false,
          suspended: true,
          p9: { requestId: req.id, category: req.category, riskClassification: req.riskClassification,
                reason: ruling.reason, autonomyLevel: ruling.autonomyLevel ?? null },
          payload: req,
        }, null, 2),
      }],
    };
  }

  return handler(args, storage);
}
