/**
 * p9.test.ts — the carve-out is only a boundary if these hold.
 *
 * Leg 3 is the one that justifies the module existing: L4 AUTONOMOUS must NOT satisfy P9.
 * If it did, the carve-out would be a rung on the ladder and the ladder's own escalation
 * path would be the bypass — the tenants who turned the dial all the way up would be the
 * ones with no boundary left.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStorage } from './factory.js';
import type { StorageBackend } from './storage.js';
import { sealDecision } from './authorship.js';
import { rule, authorize, classify, actionHash, sealActionApproval, P9_CATEGORIES } from './p9.js';

let dataDir: string;
let prevDir: string | undefined;
let prevBackend: string | undefined;
const opened: StorageBackend[] = [];
const open = (t: string) => { const s = openStorage(t); opened.push(s); return s; };

before(() => {
  prevDir = process.env.CONTINUUM_DATA_DIR;
  prevBackend = process.env.CONTINUUM_STORAGE_BACKEND;
  dataDir = mkdtempSync(join(tmpdir(), 'continuum-p9-'));
  process.env.CONTINUUM_DATA_DIR = dataDir;
  process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
});
after(() => {
  for (const s of opened) { try { s.close(); } catch { /* ignore */ } }
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  if (prevDir === undefined) delete process.env.CONTINUUM_DATA_DIR; else process.env.CONTINUUM_DATA_DIR = prevDir;
  if (prevBackend === undefined) delete process.env.CONTINUUM_STORAGE_BACKEND; else process.env.CONTINUUM_STORAGE_BACKEND = prevBackend;
});

const CHARGE = { verb: 'charge', target: 'booking:7781', params: { amountEur: 40 }, origin: 'voice' as const, proposedBy: 'arian' };

test('1) voice may read and stage without a seal — the proposing half stays frictionless', () => {
  for (const verb of ['search', 'browse', 'preview', 'stage', 'draft']) {
    const r = rule({ verb, origin: 'voice' });
    assert.equal(r.allowed, true, `'${verb}' should not need a seal`);
  }
});

test('2) every restricted category refuses without a seal', () => {
  const seen = new Set<string>();
  for (const verb of ['charge', 'publish', 'sign', 'rotate_key', 'score_lead']) {
    const r = rule({ verb, origin: 'voice' });
    assert.equal(r.allowed, false, `'${verb}' must require a seal`);
    assert.ok(r.category, `'${verb}' should carry a category`);
    seen.add(r.category as string);
  }
  assert.deepEqual([...seen].sort(), [...P9_CATEGORIES].sort(), 'not all four categories exercised');
});

test('3) THE CARVE-OUT: L4 AUTONOMOUS does not satisfy P9 — no level does', () => {
  for (const level of ['L0', 'L1', 'L2', 'L3', 'L4', 'AUTONOMOUS', undefined]) {
    const r = rule(CHARGE, level);
    assert.equal(r.allowed, false, `autonomy level ${level} must NOT unlock a billing action`);
    assert.equal(r.autonomyLevel, level, 'the level should be recorded for audit');
  }
  // And the refusal reason names the invariant, so an operator reading a log understands
  // this is deliberate rather than a misconfigured permission.
  assert.match(rule(CHARGE, 'L4').reason, /every autonomy level/i);
});

test('4) unknown verbs fail CLOSED', () => {
  const c = classify('frobnicate_the_ledger');
  assert.equal(c.known, false);
  assert.equal(c.restricted, true, 'an unrecognised verb must not be assumed safe');
  assert.match(rule({ verb: 'frobnicate_the_ledger' }).reason, /fail closed/i);
});

test('5) a matching human seal authorises exactly that action', () => {
  const s = open(`p9-${randomUUID().slice(0, 8)}`);
  assert.equal(authorize(s, CHARGE).allowed, false, 'should refuse before sealing');

  const { actionHash: h } = sealActionApproval(s, CHARGE, { operator: 'riaan', rationale: 'confirmed by phone' });
  const after = authorize(s, CHARGE);
  assert.equal(after.allowed, true, `still refused after sealing: ${after.reason}`);
  assert.ok(after.sealId, 'no seal id returned');
  assert.equal(after.actionHash, h, 'ruling and seal disagree on the action hash');
});

test('6) REPLAY: a seal for €40 does not authorise €4000', () => {
  const s = open(`p9-${randomUUID().slice(0, 8)}`);
  sealActionApproval(s, CHARGE, { operator: 'riaan' });
  const bigger = { ...CHARGE, params: { amountEur: 4000 } };
  assert.notEqual(actionHash(bigger), actionHash(CHARGE), 'changing the amount must change the hash');
  assert.equal(authorize(s, bigger).allowed, false, 'a seal was replayed onto a different amount');
  // A different target is likewise a different action.
  assert.equal(authorize(s, { ...CHARGE, target: 'booking:9999' }).allowed, false);
});

test('7) SELF-SEALING: the proposing agent cannot mint its own consent', () => {
  const s = open(`p9-${randomUUID().slice(0, 8)}`);
  sealActionApproval(s, CHARGE, { operator: 'arian' });   // arian === CHARGE.proposedBy
  const r = authorize(s, CHARGE);
  assert.equal(r.allowed, false, 'an agent sealed its own action and was allowed');
  assert.match(r.reason, /no matching human seal/i);
});

test('8) a rejection is not consent', () => {
  const s = open(`p9-${randomUUID().slice(0, 8)}`);
  sealDecision(s, {
    verdict: 'reject', operator: 'riaan',
    subject: { kind: 'p9-action', id: actionHash(CHARGE).replace(/^sha256:/, ''),
               title: actionHash(CHARGE).replace(/^sha256:/, ''), contentHash: actionHash(CHARGE) },
  });
  assert.equal(authorize(s, CHARGE).allowed, false, "a 'reject' verdict was read as approval");
});

test('9) origin does not decide — a typed instruction gets the same treatment as a spoken one', () => {
  const spoken = rule({ ...CHARGE, origin: 'voice' });
  const typed = rule({ ...CHARGE, origin: 'text' });
  const scheduled = rule({ ...CHARGE, origin: 'scheduler' });
  assert.equal(spoken.allowed, false);
  assert.equal(typed.allowed, false);
  assert.equal(scheduled.allowed, false, 'a scheduler is not a human click');
  // Same action, same binding, regardless of how it arrived.
  assert.equal(spoken.actionHash, typed.actionHash);
  assert.equal(spoken.actionHash, scheduled.actionHash);
});

test('10) an unreadable ledger refuses rather than assuming consent', () => {
  const broken = {
    searchObservations() { throw new Error('db gone'); },
    getObservations() { return []; },
  } as unknown as StorageBackend;
  const r = authorize(broken, CHARGE);
  assert.equal(r.allowed, false);
  assert.match(r.reason, /unreadable/i);
});

/**
 * The Command Plane's RUNNABLE_VERBS registry, mirrored. It cannot be imported —
 * number7evencrm and CONTINUUM communicate over HTTP only, never by shared module — so
 * this list is a COPY and copies drift. Source of truth:
 *   number7evencrm/src/lib/dictionary/runnable-verbs.ts
 * Leg 11 exists so a verb added there and mirrored here cannot ship unclassified. It
 * cannot detect a verb added there and NOT mirrored here; that gap is real and the seam
 * is why. Fail-closed covers it at runtime — an unmirrored verb refuses.
 */
const FEDERATION_VERBS = [
  'source_leads', 'score_lead', 'send_campaign', 'send_report', 'generate_magic_link',
  'pms_connect', 'pms_status', 'pms_room_types', 'pms_availability', 'pms_reservations',
  'pos_connect', 'pos_status', 'pos_menu_sync', 'pos_create_ticket',
  'spa_book', 'activity_book', 'price_quote', 'teams_notify',
];

test('11) every federation verb is explicitly classified or explicitly pending', () => {
  assert.equal(FEDERATION_VERBS.length, 18, 'the mirrored registry changed size');
  const unhandled: string[] = [];
  for (const v of FEDERATION_VERBS) {
    const c = classify(v);
    if (!c.known && !c.pendingRuling) unhandled.push(v);
  }
  assert.deepEqual(unhandled, [],
    `these federation verbs are neither classified nor marked pending, so they refuse for ` +
    `no stated reason: ${unhandled.join(', ')}`);
});

test('12) the read-only federation verbs do NOT require a seal — no operational gridlock', () => {
  for (const v of ['pms_status', 'pms_room_types', 'pms_availability', 'pos_status', 'price_quote']) {
    assert.equal(rule({ verb: v, origin: 'voice' }).allowed, true,
      `'${v}' is a pure read and must not need a click`);
  }
});

test('13) generate_magic_link is credentials — minting auth by voice is not a convenience', () => {
  const r = rule({ verb: 'generate_magic_link', target: 'user:42' }, 'L4');
  assert.equal(r.allowed, false);
  assert.equal(r.category, 'credentials');
});

test('14) the four formerly-pending verbs are now ruled RESTRICTED', () => {
  const r = rule({ verb: 'pms_reservations', target: 'stay:88' });
  assert.equal(r.allowed, false);
  assert.equal(classify('pms_reservations').category, 'billing', 'ruled billing 2026-08-22');
  // The pending MECHANISM must survive the set being emptied — it is how the next
  // ambiguous verb announces itself instead of looking like a typo.
  assert.equal(classify('a_verb_nobody_ruled').pendingRuling, undefined);
});

test('15) the ASK is not a decision — p9-request never enters the Authorship Ledger', async () => {
  const { openP9Request, P9_REQUEST_SOURCE, P9_REQUEST_TYPE } = await import('./p9-request.js');
  const s = open(`p9req-${randomUUID().slice(0, 8)}`);
  const req = openP9Request(s, { action: CHARGE, tenantId: 't1', autonomyLevel: 'L4' });

  const row = s.getObservations([req.id])[0] as any;
  assert.ok(row, 'the request was not written');
  assert.equal(row.sourceId, P9_REQUEST_SOURCE, 'request must not live under the authorship source');
  assert.equal(row.type, P9_REQUEST_TYPE);
  assert.notEqual(row.type, 'decision', 'an ask written as a decision is a forgery surface');

  // And recording the ask grants nothing: authorize still reads the LEDGER.
  assert.equal(authorize(s, CHARGE).allowed, false,
    'an open request authorised execution — the queue is not consent');
});

test('16) re-proposing the same action updates the ask, it does not queue a duplicate', async () => {
  const { openP9Request } = await import('./p9-request.js');
  const s = open(`p9req-${randomUUID().slice(0, 8)}`);
  const a = openP9Request(s, { action: CHARGE, tenantId: 't1' });
  const b = openP9Request(s, { action: CHARGE, tenantId: 't1' });
  assert.equal(a.id, b.id, 'same action produced two request ids');
  assert.equal(s.getObservations([a.id]).length, 1, 'the ask fanned out into duplicates');
});

test('17) NO GRIDLOCK: CONTINUUM read + write tools are free, delete is restricted', () => {
  for (const v of ['search_docs', 'get_digest', 'get_observations', 'record_observation',
                   'create_document', 'record_decision']) {
    assert.equal(rule({ verb: v }).allowed, true, `'${v}' must not suspend — it is a memory primitive`);
  }
  assert.equal(rule({ verb: 'delete_observation' }).allowed, false, 'destructive primitive must halt');
});

test('18) the risk badge is null rather than wrong where the enum has no honest member', async () => {
  const { openP9Request } = await import('./p9-request.js');
  const s = open(`p9req-${randomUUID().slice(0, 8)}`);
  const billing = openP9Request(s, { action: CHARGE, tenantId: 't1' });
  assert.equal(billing.riskClassification, 'HIGH_FINANCIAL');
  const published = openP9Request(s, { action: { verb: 'send_campaign', target: 'c:1' }, tenantId: 't1' });
  assert.equal(published.riskClassification, null,
    "'publish' has no honest member of the frame's enum — a wrong badge trains operators to ignore badges");
});
