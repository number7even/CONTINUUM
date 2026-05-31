/**
 * continuum://state/current — most recent StateSnapshot resource.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ResourceDefinition, ResourceReader } from '../tool-types.js';

export const STATE_CURRENT_URI = 'continuum://state/current';

export const stateCurrentResource: ResourceDefinition = {
  uri: STATE_CURRENT_URI,
  name: 'Current State',
  description:
    'Most recent StateSnapshot — what is active in production, what is dormant, and ' +
    'what is known broken right now. For historical state queries, use the ' +
    'continuum_get_state tool with an ISO timestamp.',
  mimeType: 'application/json',
};

export const readStateCurrent: ResourceReader = (storage) => {
  const snapshot = storage.getStateAt();
  return {
    contents: [
      {
        uri: STATE_CURRENT_URI,
        mimeType: 'application/json',
        text: JSON.stringify(
          snapshot ?? {
            message:
              'No checkpoints recorded yet. Use continuum_record_checkpoint to capture the first state.',
          },
          null,
          2,
        ),
      },
    ],
  };
};
