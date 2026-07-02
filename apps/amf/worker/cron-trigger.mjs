/**
 * cron-trigger.mjs — the autopilot PULSE for the content chain.
 *
 * Registers a repeatable BullMQ job on AMF_Content_Chain so the worker produces a
 * short on a schedule — no human pulling the lever. Each fire reads `fuel/` and
 * builds the job's inputs: real assets if present, the pipeline's honest stubs if
 * not. So the pulse is wired NOW; it ships REAL shorts the moment fuel lands.
 *
 *   node cron-trigger.mjs --add ["0 9 * * *"]   register/refresh the schedule (default 09:00 daily)
 *   node cron-trigger.mjs --list                 show scheduled pulses
 *   node cron-trigger.mjs --remove               unschedule
 *   node cron-trigger.mjs --once                 enqueue ONE job now (manual pulse)
 *   node cron-trigger.mjs --smoke                prove scheduling end-to-end, exit 0
 *
 * Requires Redis :6379. The worker (event-loop.mjs) must be running to process fires.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { Queue } from 'bullmq';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const connection = { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null };
const QUEUE = 'AMF_Content_Chain';
const SCHEDULER_ID = 'amf-content-pulse';
const DEFAULT_PATTERN = process.env.AMF_CRON || '0 9 * * *'; // 09:00 daily

/** Build job inputs from fuel/ — real assets if present, else {} (pipeline stubs). */
function fuelInputs() {
  const dir = join(HERE, 'fuel');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f !== '.gitkeep') : [];
  const pick = (rx) => files.filter((f) => rx.test(f)).map((f) => join(dir, f));
  const voice = pick(/\.(wav|mp3|m4a)$/i)[0];
  const script = pick(/\.txt$/i)[0];
  const broll = pick(/\.(mp4|mov)$/i);
  const inputs = {};
  if (script) inputs.scriptPath = script;
  if (voice) inputs.voicePath = voice;
  if (broll.length) inputs.brollPaths = broll;
  return { inputs, fueled: Object.keys(inputs).length > 0 };
}

function newState() {
  const { inputs, fueled } = fuelInputs();
  return { state: { inputs, results: [] }, fueled };
}

async function add(pattern = DEFAULT_PATTERN) {
  const queue = new Queue(QUEUE, { connection });
  const { state, fueled } = newState();
  await queue.upsertJobScheduler(SCHEDULER_ID, { pattern }, { name: 'produce', data: state });
  console.error(`[pulse] scheduled "${SCHEDULER_ID}" · pattern="${pattern}" · fuel ${fueled ? 'PRESENT → real shorts' : 'absent → stub shorts'}`);
  await queue.close();
}

async function list() {
  const queue = new Queue(QUEUE, { connection });
  const schedulers = await queue.getJobSchedulers();
  if (!schedulers.length) console.error('[pulse] none scheduled.');
  for (const s of schedulers) console.error(`[pulse] ${s.key || s.id} · pattern="${s.pattern}" · next=${s.next ? new Date(s.next).toISOString() : '?'}`);
  await queue.close();
  return schedulers;
}

async function remove() {
  const queue = new Queue(QUEUE, { connection });
  const ok = await queue.removeJobScheduler(SCHEDULER_ID);
  console.error(`[pulse] removed "${SCHEDULER_ID}": ${ok}`);
  await queue.close();
}

async function once() {
  const queue = new Queue(QUEUE, { connection });
  const { state, fueled } = newState();
  const job = await queue.add('produce', state, { removeOnComplete: true, removeOnFail: 50 });
  console.error(`[pulse] enqueued one job ${job.id} · fuel ${fueled ? 'PRESENT' : 'absent (stub)'}. Worker (event-loop.mjs) will process it.`);
  await queue.close();
}

// ── the PORTFOLIO pulse — the true-autopilot heartbeat (whole portfolio on a schedule) ──
const PORTFOLIO_ID = 'amf-portfolio-pulse';
async function addPortfolio(pattern = process.env.AMF_PORTFOLIO_CRON || '0 8 * * *') {
  const queue = new Queue(QUEUE, { connection });
  await queue.upsertJobScheduler(PORTFOLIO_ID, { pattern }, { name: 'portfolio', data: {} });
  console.error(`[pulse] scheduled "${PORTFOLIO_ID}" · pattern="${pattern}" → worker fans out one chain job per product (ingest → match → draft → review-queue)`);
  await queue.close();
}
async function removePortfolio() {
  const queue = new Queue(QUEUE, { connection });
  console.error(`[pulse] removed "${PORTFOLIO_ID}": ${await queue.removeJobScheduler(PORTFOLIO_ID)}`);
  await queue.close();
}
async function pulse() {
  const queue = new Queue(QUEUE, { connection });
  const job = await queue.add('portfolio', {}, { removeOnComplete: true, removeOnFail: 50 });
  console.error(`[pulse] enqueued ONE portfolio pulse ${job.id} — worker will fan out chain jobs for all products.`);
  await queue.close();
}

async function smoke() {
  console.error('\nAMF cron-pulse smoke — proving the schedule registers in Redis\n');
  await remove().catch(() => {});
  await add('*/5 * * * *');
  const schedulers = await list();
  const found = schedulers.some((s) => (s.key || s.id || '').includes(SCHEDULER_ID));
  await remove();
  const after = await list();
  const cleaned = !after.some((s) => (s.key || s.id || '').includes(SCHEDULER_ID));
  const ok = found && cleaned;
  console.error(`\n${ok ? '✅ PASS' : '❌ FAIL'} — cron pulse: schedule registers + lists + removes (BullMQ fires it; event-loop processes it)\n`);
  process.exit(ok ? 0 : 1);
}

const arg = process.argv[2];
if (arg === '--smoke') smoke().catch((e) => { console.error('smoke error:', e.message); process.exit(1); });
else if (arg === '--add') add(process.argv[3]).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === '--list') list().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === '--remove') remove().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === '--once') once().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === '--add-portfolio') addPortfolio(process.argv[3]).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === '--remove-portfolio') removePortfolio().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else if (arg === '--pulse') pulse().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
else { console.error('usage: node cron-trigger.mjs --add|--add-portfolio|--pulse|--list|--remove|--remove-portfolio|--once|--smoke'); process.exit(2); }
