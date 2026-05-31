/**
 * continuum_delete_observation — INCIDENT-RESPONSE-ONLY hard delete.
 * Closes the privacy loop (Issue #10 / W22-3, 2026-05-30).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

export const deleteObservationTool: ToolDefinition = {
  name: 'continuum_delete_observation',
  description:
    '**INCIDENT RESPONSE ONLY** — permanently delete an Observation by ID. ' +
    'Hard-delete: removes the row from the relational store, cleans the FTS5 ' +
    'index, and queues removal from any vector index (hybrid backend). ' +
    'There is NO undo. Use this ONLY for: secrets that leaked past the ' +
    'privacy filter, PII landed via adapter metadata, external operator ' +
    'requests for data removal, accidental ingest of confidential markdown. ' +
    'Pairs with the write-time privacy filter to close the privacy loop — ' +
    'the filter catches known patterns at write time; this catches the rest. ' +
    'Does NOT cascade through derived state (digests, briefings) — those ' +
    'regenerate on next read. Snapshots that referenced the deleted ID via ' +
    'refs[] keep the dangling reference as a historical artifact. ' +
    'Returns { deleted: true, id } on success, { deleted: false, id } if no ' +
    'row matched. Do not use this tool for normal lifecycle operations — ' +
    'observations are append-only by design.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description:
          'Observation ID to permanently delete. Narrow this ID via ' +
          'continuum_search_docs or continuum_timeline first to make sure ' +
          'you are deleting the right row.',
      },
    },
    required: ['id'],
  },
};

export const handleDeleteObservation: ToolHandler = async (args, storage) => {
  const { id } = (args ?? {}) as { id?: string };
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('id is required');
  }
  const deleted = storage.deleteObservation(id);
  return {
    content: [
      { type: 'text', text: JSON.stringify({ deleted, id }, null, 2) },
    ],
  };
};
