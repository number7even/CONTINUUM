/**
 * continuum://digest/latest — composed narrative for last 24h resource.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { templateDigest } from '../briefing.js';
import type { ResourceDefinition, ResourceReader } from '../tool-types.js';

export const DIGEST_LATEST_URI = 'continuum://digest/latest';

export const digestLatestResource: ResourceDefinition = {
  uri: DIGEST_LATEST_URI,
  name: 'Latest Digest',
  description:
    'Composed narrative for the last 24 hours. V0 returns a template-based summary ' +
    'of recent checkpoints; V0.5+ adds ruvllm/ruv-FANN local-AI narratives.',
  mimeType: 'application/json',
};

export const readDigestLatest: ResourceReader = (storage) => {
  const snapshots = storage.listSnapshots(10);
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = snapshots.filter(s => s.timestamp >= cutoff);
  const narrative = templateDigest(recent, '24h');
  return {
    contents: [
      {
        uri: DIGEST_LATEST_URI,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            window: '24h',
            windowStart: cutoff,
            windowEnd: new Date().toISOString(),
            narrative,
            snapshotsInWindow: recent.length,
          },
          null,
          2,
        ),
      },
    ],
  };
};
