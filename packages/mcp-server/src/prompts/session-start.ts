/**
 * continuum.session_start — canonical session warm-up prompt.
 * Encodes the Layer-0 → Layer-1 → Layer-3 retrieval discipline.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { PromptDefinition } from '../tool-types.js';

export const sessionStartPrompt: PromptDefinition = {
  name: 'continuum.session_start',
  description:
    'Canonical session warm-up. Instructs the AI to read continuum://session/briefing ' +
    'first (Layer-0), then use continuum_search_docs to filter by IDs (Layer-1) before ' +
    'fetching full content (Layer-3). Enforces the ~10x token-savings retrieval pattern.',
  text:
    'You are starting a session in a Continuum-enabled project. Before any other ' +
    'action, follow this protocol:\n\n' +
    '1. Read the resource `continuum://session/briefing` FIRST. It is a single cheap ' +
    'read (~2–5 KB) that combines current state, open todos, and recent activity. ' +
    'Most sessions can answer their opening question from this alone.\n\n' +
    "2. If the briefing answers the user's question, proceed. Otherwise use " +
    '`continuum_search_docs` with specific keywords — that returns Layer-1 hits ' +
    '(compact IDs + titles, ~50–100 tokens each). Do NOT fetch full content yet.\n\n' +
    '3. Narrow the result set to the specific Observation IDs you actually need. For ' +
    'historical state queries use `continuum_get_state` with an ISO timestamp.\n\n' +
    '4. Only after narrowing should you fetch full content (Layer-3) — and only for ' +
    'the specific IDs you identified.\n\n' +
    '5. When asserting any fact about this project, cite the Observation ID(s) that ' +
    'prove it. See the `continuum.cite` Prompt for the format.\n\n' +
    '6. When you produce a commitment the user wants tracked, call ' +
    '`continuum_create_todo` with a concrete `verifyCommand` — a shell command that ' +
    'exits 0 when the commitment is satisfied. Todos without `verifyCommand` cannot ' +
    'be auto-resolved.\n\n' +
    "You may now proceed with the user's request.",
};
