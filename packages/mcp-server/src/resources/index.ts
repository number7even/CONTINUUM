/**
 * Resource registry + reader.
 *
 * Aggregates the 4 per-resource definition + reader pairs into:
 *   - RESOURCE_DEFINITIONS[] for ListResourcesRequestSchema
 *   - readResource() for ReadResourceRequestSchema
 *
 * Adding a new resource = create resources/<name>.ts that exports the
 * definition + reader + URI, then add the three lines below.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { StorageBackend } from '@continuum/core';
import type { ResourceContents, ResourceDefinition, ResourceReader } from '../tool-types.js';

import { OPEN_TODOS_URI, openTodosResource, readOpenTodos } from './open-todos.js';
import { STATE_CURRENT_URI, stateCurrentResource, readStateCurrent } from './state-current.js';
import { DIGEST_LATEST_URI, digestLatestResource, readDigestLatest } from './digest-latest.js';
import {
  SESSION_BRIEFING_URI,
  sessionBriefingResource,
  readSessionBriefing,
} from './session-briefing.js';

export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  openTodosResource,
  stateCurrentResource,
  digestLatestResource,
  sessionBriefingResource,
] as const;

const READ_TABLE: Record<string, ResourceReader> = {
  [OPEN_TODOS_URI]: readOpenTodos,
  [STATE_CURRENT_URI]: readStateCurrent,
  [DIGEST_LATEST_URI]: readDigestLatest,
  [SESSION_BRIEFING_URI]: readSessionBriefing,
};

export async function readResource(
  uri: string,
  storage: StorageBackend,
  projectId: string,
): Promise<ResourceContents> {
  const reader = READ_TABLE[uri];
  if (!reader) {
    throw new Error(`Unknown resource: ${uri}`);
  }
  return reader(storage, projectId);
}
