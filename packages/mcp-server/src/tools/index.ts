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
import { updateTodoTool, handleUpdateTodo } from './update-todo.js';
import { recordBrandDnaTool, handleRecordBrandDna } from './record-brand-dna.js';
import { checkBrandTool, handleCheckBrand } from './check-brand.js';
import { graphTool, handleGraph } from './graph.js';
import { kaizenRecordTool, handleKaizenRecord } from './kaizen-record.js';
import { nextTasksTool, handleNextTasks } from './next-tasks.js';
import { snapshotsTool, handleSnapshots } from './snapshots.js';
import { recordDecisionTool, handleRecordDecision } from './record-decision.js';
import { sessionReviewTool, handleSessionReview } from './session-review.js';

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
  updateTodoTool,
  recordBrandDnaTool,
  checkBrandTool,
  graphTool,
  kaizenRecordTool,
  nextTasksTool,
  snapshotsTool,
  recordDecisionTool,
  sessionReviewTool,
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
  continuum_update_todo: handleUpdateTodo,
  continuum_record_brand_dna: handleRecordBrandDna,
  continuum_check_brand: handleCheckBrand,
  continuum_graph: handleGraph,
  continuum_next_tasks: handleNextTasks,
  continuum_snapshots: handleSnapshots,
  continuum_kaizen_record: handleKaizenRecord,
  continuum_record_decision: handleRecordDecision,
  continuum_session_review: handleSessionReview,
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
  return handler(args, storage);
}
