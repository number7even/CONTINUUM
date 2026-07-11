// Ask Phase 1 verify (ASK_AND_AUDIO_SPEC §build-order 1): a query returns hits with
// Observation IDs + TIERS. Proves tierOf (the trust gradient) + retrieveContext
// (search → fetch → cited tier-aware bundle) work end-to-end over real storage.
//
//   node scripts/verify-ask-retrieval.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage, retrieveContext } from '@number7even/continuum-core';

if (!process.env.CONTINUUM_DATA_DIR) process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'ask-'));
const s = openStorage('ask-phase1');
const now = new Date().toISOString();
const K = 'ZZQUERYSENTINEL';

// Fixtures — one per tier, all sharing the search sentinel.
s.upsertSource('authorship', 'export', {});
s.upsertSource('docs:p', 'docs', {});
s.upsertSource('terminal:p', 'export', {});
s.upsertSource('external:yt', 'export', {});

s.insertObservation({ sourceId: 'authorship', type: 'decision', content: `${K} accept the widget`, timestamp: now, refs: [], metadata: { verdict: 'accept' } });
s.insertObservation({ sourceId: 'docs:p', type: 'doc', content: `${K} the widget spec document`, timestamp: now, refs: [] });
s.insertObservation({ sourceId: 'terminal:p', type: 'command', content: `${K} npm test passed`, timestamp: now, refs: [], metadata: { exitCode: 0, status: 'ok' } });
s.insertObservation({ sourceId: 'terminal:p', type: 'command', content: `${K} npm test failed`, timestamp: now, refs: [], metadata: { exitCode: 1, status: 'fail' } });
s.insertObservation({ sourceId: 'external:yt', type: 'transcript', content: `${K} a youtube video said`, timestamp: now, refs: [] });

const res = await retrieveContext(s, K, { limit: 20 });
console.log('query:', res.query, '· nodes:', res.count);
for (const n of res.nodes) console.log(`  [${n.tier.padEnd(9)}] ${n.type.padEnd(10)} ${n.id.slice(0, 8)}  ${JSON.stringify(n.excerpt.slice(0, 30))}`);

const tierByType = {};
for (const n of res.nodes) tierByType[`${n.type}:${JSON.stringify(n.excerpt).includes('failed') ? 'fail' : 'ok'}`] = n.tier;

const allHaveIds = res.nodes.length > 0 && res.nodes.every((n) => typeof n.id === 'string' && n.id.length > 0 && n.tier);
const authored = res.nodes.find((n) => n.type === 'decision')?.tier === 'authored';
const reference = res.nodes.find((n) => n.type === 'doc')?.tier === 'reference';
const proven = res.nodes.find((n) => n.type === 'command' && n.excerpt.includes('passed'))?.tier === 'proven';
const failedNotProven = res.nodes.find((n) => n.type === 'command' && n.excerpt.includes('failed'))?.tier === 'reference';
const external = res.nodes.find((n) => n.type === 'transcript')?.tier === 'external';

console.log(`checks: ids+tiers=${allHaveIds} authored=${authored} reference=${reference} proven=${proven} failed≠proven=${failedNotProven} external=${external}`);
const green = allHaveIds && authored && reference && proven && failedNotProven && external;
console.log(green ? 'ASK_RETRIEVAL_VERIFY: GREEN' : 'ASK_RETRIEVAL_VERIFY: RED');
process.exit(green ? 0 : 1);
