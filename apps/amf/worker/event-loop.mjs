/**
 * event-loop.mjs — the AMF autopilot substrate (REAL, not spec).
 *
 * Replaces the manual `node produce-short.mjs` lever with an async, event-driven
 * BullMQ queue: jobs carry a strict append-only JSON state document; a worker runs
 * the proven faceless content pipeline and records the produced asset back onto the
 * state. No sequential blocking calls; the queue persists state in Redis.
 *
 * HONEST SCOPE (P4): this wires the **content chain** (L4/L5) only. The Layer-6
 * marketing swarm is NOT here — `@metaharness/router` does not exist, there are no
 * ad accounts, and autonomous spend is a human-in-loop boundary (P6/P9). When a job
 * completes, its result is recorded on the state doc; a real L6 worker can subscribe
 * later, but it is not pretended to exist.
 *
 * Modes:
 *   node event-loop.mjs            → run the worker (stays alive, processes jobs)
 *   node event-loop.mjs --smoke    → enqueue ONE job, run it, verify the asset, exit
 *
 * Requires Redis on :6379 (docker run -d --name amf-redis -p 6379:6379 redis:7-alpine).
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { Queue, Worker, QueueEvents } from 'bullmq';
import { existsSync } from 'node:fs';
import { produceShort } from './pipeline.mjs';

const connection = { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null };
const QUEUE = 'AMF_Content_Chain';

/** The worker: run the faceless pipeline, append the result to the state doc. */
export function startContentWorker() {
  return new Worker(
    QUEUE,
    async (job) => {
      const state = job.data ?? {};
      console.error(`[L4/L5] job ${job.id} — synthesizing content…`);
      const { assetPath } = await produceShort(state.inputs ?? {});
      // strict, append-only: never mutate prior fields, only append the result
      const next = { ...state, results: [...(state.results ?? []), { stage: 'L4/L5', assetPath, at: 'render-complete' }] };
      console.error(`[L4/L5] job ${job.id} ✅ asset → ${assetPath}`);
      // L6 handoff point (spec): a real marketing worker would subscribe to completed
      // jobs here. Not wired — see HONEST SCOPE above.
      return next;
    },
    { connection, concurrency: 1 },
  );
}

async function smoke() {
  console.error('\nAMF event-loop smoke — proving a real job round-trip through Redis\n');
  const queue = new Queue(QUEUE, { connection });
  const events = new QueueEvents(QUEUE, { connection });
  await events.waitUntilReady();
  const worker = startContentWorker();

  // enqueue one job (empty inputs → the pipeline's honest stubs)
  const job = await queue.add('produce', { inputs: {}, results: [] }, { removeOnComplete: true, removeOnFail: true });
  console.error(`[queue] enqueued job ${job.id} — waiting for the worker…`);

  const result = await job.waitUntilFinished(events); // resolves with the worker's return
  const assetPath = result?.results?.[0]?.assetPath;
  const ok = !!assetPath && existsSync(assetPath);
  console.error(`\n[queue] job ${job.id} completed. asset on state doc: ${assetPath}`);
  console.error(`[verify] asset exists on disk: ${ok}`);

  await worker.close();
  await events.close();
  await queue.close();
  console.error(`\n${ok ? '✅ PASS' : '❌ FAIL'} — event loop round-trip: enqueue → worker → produceShort → asset → state\n`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--smoke')) {
  smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
} else if (process.argv[1] && process.argv[1].endsWith('event-loop.mjs')) {
  startContentWorker();
  console.error(`[AMF] content-chain worker live on "${QUEUE}" (Redis :6379). Ctrl-C to stop.`);
}
