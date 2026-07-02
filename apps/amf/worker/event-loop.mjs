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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceShort, runProductChain } from './pipeline.mjs';

const connection = { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null };
const QUEUE = 'AMF_Content_Chain';
const HERE = dirname(fileURLToPath(import.meta.url));

/** Portfolio = every product with a demand-analysed signal_query (analyze.mjs output). */
function portfolioSlugs() {
  try { const uni = JSON.parse(readFileSync(join(HERE, 'portfolio-universe.json'), 'utf8')); return (uni.products || []).filter((p) => Array.isArray(p.signal_query) && p.signal_query.length).map((p) => p.slug); } catch { return []; }
}

/**
 * The worker handles three job kinds:
 *   'portfolio' — the autopilot pulse: fan out one 'chain' job per product (whole portfolio)
 *   'chain'     — per-product: ingest → match → draft → QUEUE FOR APPROVAL (review-queue)
 *   'produce'   — the original faceless short from fuel/ (kept)
 * Render + publish stay downstream of the human gate (review.mjs) — the machine never crosses it.
 */
export function startContentWorker() {
  const queue = new Queue(QUEUE, { connection }); // for portfolio → chain fan-out
  return new Worker(
    QUEUE,
    async (job) => {
      if (job.name === 'portfolio') {
        const slugs = portfolioSlugs();
        for (const slug of slugs) await queue.add('chain', { slug }, { removeOnComplete: true, removeOnFail: 50 });
        console.error(`[L1] portfolio pulse ${job.id} → fanned out ${slugs.length} chain jobs`);
        return { fannedOut: slugs.length, slugs };
      }
      if (job.name === 'chain') {
        const r = await runProductChain(job.data.slug, job.data.opts);
        console.error(`[L2-L3] chain ${job.data.slug}: ${r.ok ? '✅ queued for review → ' + r.reviewId : '— ' + r.reason}`);
        return r;
      }
      // default 'produce' — the proven faceless voice-over-b-roll short from fuel/
      const state = job.data ?? {};
      console.error(`[L4/L5] job ${job.id} — synthesizing short…`);
      const { assetPath } = await produceShort(state.inputs ?? {});
      const next = { ...state, results: [...(state.results ?? []), { stage: 'L4/L5', assetPath, at: 'render-complete' }] };
      console.error(`[L4/L5] job ${job.id} ✅ asset → ${assetPath}`);
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
