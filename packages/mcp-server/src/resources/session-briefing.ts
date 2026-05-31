/**
 * continuum://session/briefing — Layer-0 Progressive Disclosure briefing.
 * Pre-rendered markdown combining state + open todos + recent activity.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { composeBriefing } from '../briefing.js';
import type { ResourceDefinition, ResourceReader } from '../tool-types.js';

export const SESSION_BRIEFING_URI = 'continuum://session/briefing';

export const sessionBriefingResource: ResourceDefinition = {
  uri: SESSION_BRIEFING_URI,
  name: 'Session Briefing',
  description:
    'Layer-0 Progressive Disclosure — a pre-rendered markdown document combining ' +
    'current state, open todos, and recent activity. AI clients should read this ' +
    "FIRST at the start of every session: it is a single cheap read (~2–5 KB) that " +
    "often answers a session's opening questions without any further tool calls. " +
    'Pair with the continuum.session_start Prompt.',
  mimeType: 'text/markdown',
};

export const readSessionBriefing: ResourceReader = (storage, projectId) => {
  const text = composeBriefing(storage, projectId);
  return {
    contents: [
      {
        uri: SESSION_BRIEFING_URI,
        mimeType: 'text/markdown',
        text,
      },
    ],
  };
};
