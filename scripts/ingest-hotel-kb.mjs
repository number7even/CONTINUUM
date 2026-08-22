#!/usr/bin/env node
/**
 * ingest-hotel-kb.mjs — the guarded entry point for hotel knowledge ingestion.
 *
 * Usage:
 *   node scripts/ingest-hotel-kb.mjs --tenant <uuid> --kb <path.json> [--dry-run] [--force]
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ WHY THIS WRAPPER EXISTS                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 * ingestHotelKb() writes hotel SOPs, FAQs, policies and guest correspondence into a
 * tenant's vector index. The privacy scrubber runs 11 SECRET patterns unconditionally,
 * but the 5 GUEST-PII patterns — email, credit card, IBAN, passport, phone — run ONLY
 * when CONTINUUM_PRIVACY_PII === '1'.
 *
 * Get that wrong and guest emails and card numbers become embeddings. Embeddings are not
 * selectively deletable: the remedy is destroying and rebuilding the tenant's database.
 * There is no "unsend". So the check has to happen BEFORE the first document is read,
 * not after the first batch is written.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THE ENV VAR IS CHECKED, BUT IT IS NOT THE PROOF                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 * `process.env.CONTINUUM_PRIVACY_PII === '1'` proves a string was set. It does not prove
 * the scrubber runs, that this process resolved the module you think it did, that the
 * storage backend routes through the choke-point, or that a later refactor did not add an
 * early return above the PII branch.
 *
 * Twice during this work the flag was reported as configured and measurably was not — in
 * fly.toml, in .env, and in the shell. A wrapper that trusted the variable would have
 * reported a green shield both times.
 *
 * So GATE 2 fires a CANARY: a synthetic record carrying a fake email, card, IBAN, passport
 * and phone is written through the SAME storage instance the ingest will use, read back off
 * disk, and checked. If any of the five survives, the shield is not active in THIS process
 * against THIS backend, and we abort having written nothing real. The canary is deleted
 * before the ingest begins, pass or fail.
 *
 * That is the difference between asserting the configuration and proving the behaviour.
 *
 * Exit codes:
 *   0  ingest completed (or dry run passed)
 *   2  a gate refused — nothing was ingested
 *   3  bad usage / unreadable input
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const TENANT = opt('tenant');
const KB_PATH = opt('kb');
const DRY_RUN = flag('dry-run');
const FORCE = flag('force');

const die = (code, msg) => { console.error(`\n  ✗ ${msg}\n`); process.exit(code); };
const ok = (msg) => console.log(`  ✅ ${msg}`);

if (!TENANT) die(3, 'missing --tenant <uuid>');
if (!KB_PATH && !DRY_RUN) die(3, 'missing --kb <path.json>');

console.log(`\n🏨 hotel-kb ingestion — tenant ${TENANT}${DRY_RUN ? '  (DRY RUN)' : ''}\n`);

// ── GATE 1 · the variable is set ─────────────────────────────────────────────
// Necessary, not sufficient. Strict '1' because that is exactly what observation.ts
// compares against — 'true', 'yes' and '01' all silently disable the PII patterns.
const raw = process.env.CONTINUUM_PRIVACY_PII;
if (raw !== '1') {
  console.error(`\n  ✗ GATE 1 REFUSED — CONTINUUM_PRIVACY_PII is ${raw === undefined ? 'UNSET' : `'${raw}'`}, must be exactly '1'.`);
  console.error('');
  console.error('    Guest PII (email, card, IBAN, passport, phone) would NOT be scrubbed.');
  console.error('    Those values become vector embeddings, and embeddings cannot be');
  console.error('    selectively deleted — the remedy is destroying and rebuilding this');
  console.error("    tenant's database. Nothing has been read or written.");
  console.error('');
  console.error('    Note: observation.ts compares === \'1\' exactly. "true"/"yes" do nothing.');
  console.error('    Set it in the runtime that RUNS THIS PROCESS — a Vercel dashboard value');
  console.error('    does not reach a local or fly.io node process.\n');
  process.exit(2);
}
ok(`GATE 1 — CONTINUUM_PRIVACY_PII === '1'`);

const { openStorage, ingestHotelKb } = await import('@number7even/continuum-core');

// ── GATE 2 · the shield actually scrubs, in this process, on this backend ────
const storage = openStorage(TENANT);
const canaryId = `pii-canary-${randomUUID()}`;
const CANARY = {
  'email': 'canary.guest@example-hotel.test',
  'credit card': '4111 1111 1111 1111',
  'IBAN': 'DE89370400440532013000',
  'passport': 'X1234567',
  'phone': '+44 20 7946 0958',
};

let survivors = [];
try {
  storage.upsertSource('pii-canary', 'docs', { purpose: 'pre-ingest shield check' });
  storage.upsertObservation({
    id: canaryId,
    sourceId: 'pii-canary',
    type: 'event',
    content: `canary ${Object.values(CANARY).join(' | ')}`,
    timestamp: new Date().toISOString(),
    refs: [],
    metadata: {},
  });
  // Read back off DISK. The scrub happens between the call and the row, so the
  // return value of upsertObservation is not evidence.
  const row = storage.getObservations([canaryId])[0];
  if (!row) {
    // The choke-point rejected the record wholesale — over-redaction, which is the
    // safe direction. Treat as PASS and say so rather than silently continuing.
    ok('GATE 2 — canary was refused outright by the privacy filter (fully redacted)');
  } else {
    survivors = Object.entries(CANARY).filter(([, v]) => row.content.includes(v)).map(([k]) => k);
    if (survivors.length === 0) ok('GATE 2 — canary PII scrubbed on disk (email, card, IBAN, passport, phone)');
  }
} finally {
  try { storage.deleteObservation?.(canaryId); } catch { /* best effort */ }
}

if (survivors.length > 0) {
  console.error(`\n  ✗ GATE 2 REFUSED — the flag is set but these survived to disk: ${survivors.join(', ')}`);
  console.error('');
  console.error('    The configuration says the shield is on; the backend says otherwise.');
  console.error('    This is exactly the case the env check alone cannot catch. Do not');
  console.error('    ingest. Nothing real has been written.\n');
  try { storage.close(); } catch { /* ignore */ }
  process.exit(2);
}

// ── GATE 3 · do not silently double-ingest ───────────────────────────────────
const prior = (() => {
  try { return storage.searchObservations('hotel-kb', 5).length; } catch { return 0; }
})();
if (prior > 0 && !FORCE) {
  console.log(`\n  ⚠️  GATE 3 — this tenant already has hotel-kb rows (${prior}+ matched).`);
  console.log('     ingestHotelKb upserts on a deterministic id, so re-running is safe and');
  console.log('     idempotent — but pass --force to say you meant it.\n');
  try { storage.close(); } catch { /* ignore */ }
  process.exit(2);
}

if (DRY_RUN) {
  console.log('\n  🟢 ALL GATES PASSED — dry run, nothing ingested.');
  console.log('     Re-run without --dry-run and with --kb <path.json> to ingest.\n');
  try { storage.close(); } catch { /* ignore */ }
  process.exit(0);
}

// ── ingest ───────────────────────────────────────────────────────────────────
let kb;
try {
  kb = JSON.parse(readFileSync(KB_PATH, 'utf8'));
} catch (e) {
  try { storage.close(); } catch { /* ignore */ }
  die(3, `cannot read --kb ${KB_PATH}: ${e.message}`);
}

const result = ingestHotelKb(storage, kb);
console.log(`\n  ✅ ingested — upserted ${result.upserted}, dropped ${result.dropped} (privacy filter)`);
console.log(`     by kind: ${JSON.stringify(result.byKind)}`);
if (result.dropped > 0) {
  console.log(`     ${result.dropped} record(s) were rejected as all-private. That is the filter`);
  console.log('     working, not data loss to investigate — but worth eyeballing the source.');
}
try { storage.close(); } catch { /* ignore */ }
console.log('');
