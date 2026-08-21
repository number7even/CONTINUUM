/**
 * record-observation.test.ts — the regression lock for continuum_record_observation.
 *
 * Named for the repo's runner convention (`node --test` over dist/**\/*.test.js), not the
 * prove-*.ts convention used in the VoiceCosmos repos. Same job: the tool is not "done"
 * until something runnable fails when it breaks.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THE TWO THAT MATTER                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 * 1. SEAL FORGERY. type='decision' must be refused, always. Decision seals bind
 *    verdict + operator + subject.contentHash and are minted only by the sealing path.
 *    A generic writer that could emit type='decision' is a seal-forgery primitive, so
 *    this is asserted as a security invariant rather than an input-validation nicety.
 *
 * 2. THE PII GATE IS A GATE, NOT A GUARANTEE. The scrubber carries 11 SECRET patterns
 *    (keys/tokens/PEM/JWT) that always run, and 5 GUEST-PII patterns (email, card, IBAN,
 *    passport, phone) that run ONLY when CONTINUUM_PRIVACY_PII === '1'. Measured
 *    2026-08-21: that variable is set in no fly.toml, Dockerfile or .env in this repo.
 *
 *    So this file asserts BOTH states deliberately:
 *      • flag OFF → guest PII SURVIVES into storage. Asserted as fact, not as approval.
 *        It is the live default, and hotel-KB ingestion under it writes guest emails and
 *        card numbers into a vector space that cannot be selectively deleted — you rebuild.
 *      • flag ON  → guest PII is scrubbed.
 *    If someone later flips the default, leg 6 goes red and the change is deliberate
 *    rather than silent. A test that only checked the ON path would have reported green
 *    on a system that leaks.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage, type StorageBackend } from '@number7even/continuum-core';
import { handleRecordObservation, recordObservationTool } from './record-observation.js';

/** Unique per run so the suite never inherits a previous run's rows. */
const TENANT = `test-recobs-${randomUUID().slice(0, 8)}`;
const OTHER = `test-recobs-other-${randomUUID().slice(0, 8)}`;

// ── isolation + teardown ─────────────────────────────────────────────────────
// CONTINUUM_DATA_DIR is redirected to a temp dir so this suite never writes a tenant
// into the real data directory — the proof builds and destroys everything it asserts on.
// Every storage handle is also closed: SQLite handles keep the event loop alive, and
// without this the file passes all its assertions and then hangs the runner until the
// timeout kills it, which reads as a FAILING file in CI despite 9 green legs.
let dataDir: string;
let originalDataDir: string | undefined;
let originalBackend: string | undefined;
const opened = new Map<string, StorageBackend>();

/** Open (or reuse) a tenant's storage, registering it for close in after(). */
function open(tenant: string): StorageBackend {
  let s = opened.get(tenant);
  if (!s) { s = openStorage(tenant); opened.set(tenant, s); }
  return s;
}

before(() => {
  originalDataDir = process.env.CONTINUUM_DATA_DIR;
  originalBackend = process.env.CONTINUUM_STORAGE_BACKEND;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-recobs-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  // SQLite-only: these assertions are about the choke-point and the relational
  // write, not the vector layer, and it skips the embedder warm-up.
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
});

after(() => {
  for (const s of opened.values()) { try { s.close(); } catch { /* already closed */ } }
  opened.clear();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.CONTINUUM_DATA_DIR;
  else process.env.CONTINUUM_DATA_DIR = originalDataDir;
  if (originalBackend === undefined) delete process.env.CONTINUUM_STORAGE_BACKEND;
  else process.env.CONTINUUM_STORAGE_BACKEND = originalBackend;
});

const parse = (r: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(r.content[0]?.text ?? '{}');

const call = (storage: ReturnType<typeof openStorage>, args: Record<string, unknown>) =>
  handleRecordObservation(args, storage);

/** Read the stored row back, failing loudly if it is absent. Asserting on the handler's
 *  RETURN value alone would pass even when the choke-point wrote nothing — the scrub
 *  happens between the handler and the disk, so the disk is what has to be inspected. */
function stored(storage: ReturnType<typeof openStorage>, id: string) {
  const row = storage.getObservations([id])[0];
  assert.ok(row, `no observation ${id} reached storage — the handler's return value lied`);
  return row;
}

test('1) writes a schema-free event and returns its id', async () => {
  const s = open(TENANT);
  const r = parse(await call(s, { content: 'guest checked in at 14:02, room 214' }));
  assert.equal(r.ok, true, 'handler reported failure');
  assert.ok(r.id, 'no id returned');
  const row = stored(s, r.id);
  assert.ok(row, 'nothing reached storage — the return value lied');
  assert.match(row.content, /checked in/);
});

test('2) defaults are type="event" and sourceId="events"', async () => {
  const s = open(TENANT);
  const r = parse(await call(s, { content: 'lift called to floor 3' }));
  assert.equal(r.type, 'event');
  assert.equal(r.sourceId, 'events');
});

test('3) SECURITY: type="decision" is refused — seals are minted only by the sealing path', async () => {
  const s = open(TENANT);
  await assert.rejects(
    () => call(s, { content: 'approve the refund', type: 'decision' }),
    /refused/i,
    'a generic writer emitting type=decision would be a seal-forgery primitive',
  );
  // And nothing was written on the way to being refused.
  const hits = s.searchObservations('approve the refund', 10);
  assert.equal(hits.length, 0, 'refused call still left a row behind');
});

test('4) empty or whitespace content is rejected', async () => {
  const s = open(TENANT);
  await assert.rejects(() => call(s, { content: '   ' }), /content is required/);
  await assert.rejects(() => call(s, {}), /content is required/);
});

test('5) a stable id upserts in place rather than duplicating', async () => {
  const s = open(TENANT);
  const id = randomUUID();
  await call(s, { content: 'booking 7781 pending', id });
  await call(s, { content: 'booking 7781 confirmed', id });
  const row = stored(s, id);
  assert.match(row.content, /confirmed/, 're-emission did not update in place');
  // One id, one row — idempotent re-emission must not fan out.
  assert.equal(s.getObservations([id]).length, 1);
});

test('6) GATE: secrets always scrub; guest PII only when CONTINUUM_PRIVACY_PII=1', async () => {
  const s = open(TENANT);
  const prevFlag = process.env.CONTINUUM_PRIVACY_PII;
  const SECRET = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';
  const EMAIL = 'guest.private@example.com';

  try {
    // ── flag OFF: the live default measured 2026-08-21 ──────────────────────
    delete process.env.CONTINUUM_PRIVACY_PII;
    const off = parse(await call(s, { content: `key ${SECRET} mail ${EMAIL}` }));
    const rowOff = stored(s, off.id);
    assert.ok(!rowOff.content.includes(SECRET), 'a secret survived — secrets must ALWAYS scrub');
    assert.ok(
      rowOff.content.includes(EMAIL),
      'guest PII was scrubbed with the flag OFF. If this is now the default, that is an ' +
        'improvement — update this assertion deliberately rather than deleting it.',
    );

    // ── flag ON: what a tenant/SaaS deployment must run ─────────────────────
    process.env.CONTINUUM_PRIVACY_PII = '1';
    const on = parse(await call(s, { content: `key ${SECRET} mail ${EMAIL}` }));
    const rowOn = stored(s, on.id);
    assert.ok(!rowOn.content.includes(SECRET), 'secret survived with the flag ON');
    assert.ok(
      !rowOn.content.includes(EMAIL),
      'guest email survived with CONTINUUM_PRIVACY_PII=1 — the gate does not close',
    );
  } finally {
    if (prevFlag === undefined) delete process.env.CONTINUUM_PRIVACY_PII;
    else process.env.CONTINUUM_PRIVACY_PII = prevFlag;
  }
});

test('7) refs[] and metadata survive the round trip', async () => {
  const s = open(TENANT);
  const ref = randomUUID();
  const r = parse(
    await call(s, { content: 'escalation raised', refs: [ref], metadata: { severity: 'high' } }),
  );
  const row = stored(s, r.id);
  assert.deepEqual(row.refs, [ref], 'refs lost in transit');
  assert.equal((row.metadata as Record<string, unknown>).severity, 'high');
});

test('8) ISOLATION: a write in one tenant is invisible to another', async () => {
  const a = open(TENANT);
  const b = open(OTHER);
  const token = `SENTINEL_${randomUUID().replace(/-/g, '')}`;
  const r = parse(await call(a, { content: `sentinel ${token}` }));

  assert.equal(b.getObservations([r.id]).length, 0, 'cross-tenant read by id returned a row');
  assert.equal(b.searchObservations(token, 10).length, 0, 'cross-tenant search found the sentinel');
  // Positive control: the row genuinely exists in A, so the zeroes above mean isolation
  // rather than "nothing was ever written".
  assert.equal(a.getObservations([r.id]).length, 1, 'the row was never written to A either');
});

test('9) the tool definition matches what the handler enforces', async () => {
  assert.equal(recordObservationTool.name, 'continuum_record_observation');
  const schema = recordObservationTool.inputSchema as { required?: string[] };
  assert.deepEqual(schema.required, ['content']);
  assert.match(
    recordObservationTool.description,
    /decision.*REFUSED|REFUSED.*decision/s,
    'the refusal is enforced in code but not advertised to the model calling it',
  );
});
