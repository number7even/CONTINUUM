#!/usr/bin/env node
// verify-tenant-isolation.mjs — proof-gate for tenant-scoped query isolation (Directive 3).
//
// The enterprise promise is worthless without isolation: Hotel A must NEVER retrieve Hotel B's
// knowledge. Isolation here is STRUCTURAL, not a WHERE clause — openStorage(tenantId) routes each
// tenant to its own physical DB + RuVector store under ~/.continuum/<tenantId>/, and the tenant id
// is sanitised at the boundary so it cannot escape its directory. This gate seeds two tenants with
// distinct KBs and proves:
//   • a search in Tenant A returns ONLY A's knowledge; B's unique term returns nothing in A;
//   • fetching B's Observation id from A's storage yields nothing (no cross-tenant id reach);
//   • the two tenants resolve to DIFFERENT physical stores;
//   • an adversarial tenant id (path traversal) is REJECTED, not routed to a sibling directory.
//
//   node scripts/verify-tenant-isolation.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-isolation-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_PRIVACY_PII = '1';

const { openStorage, ingestHotelKb } = await import('@number7even/continuum-core');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

// Two tenants, each with a UNIQUE marker term no other tenant uses.
const a = await openStorage('grand-harbour-hotel');
const b = await openStorage('alpine-lodge-resort');
const rA = ingestHotelKb(a, { property: { name: 'Grand Harbour Hotel' }, policies: [{ name: 'Cancellation Policy', body: 'ZEBRAFISH marker — Grand Harbour only.' }] });
const rB = ingestHotelKb(b, { property: { name: 'Alpine Lodge Resort' }, policies: [{ name: 'Cancellation Policy', body: 'NARWHAL marker — Alpine Lodge only.' }] });

console.log('── Directive 3 · tenant-scoped query isolation ─────────────────────────');
const aFindsOwn = a.searchObservations('ZEBRAFISH', 10);
const aFindsB = a.searchObservations('NARWHAL', 10);
check("Tenant A retrieves A's own knowledge", aFindsOwn.length >= 1);
check("Tenant A CANNOT retrieve B's knowledge (unique term returns nothing)", aFindsB.length === 0, `${aFindsB.length} leaks`);
const bFindsA = b.searchObservations('ZEBRAFISH', 10);
check("Tenant B CANNOT retrieve A's knowledge", bFindsA.length === 0, `${bFindsA.length} leaks`);

console.log('── no cross-tenant id reach ────────────────────────────────────────────');
const bId = rB.ids[0];
const reach = a.getObservations([bId]);
check("fetching B's Observation id from A's storage yields nothing", reach.length === 0, `${reach.length} rows`);

console.log('── structural isolation (separate physical stores) ─────────────────────');
check('the two tenants resolve to DIFFERENT physical stores', a.dataLocation() !== b.dataLocation(), 'distinct DB paths');

console.log('── adversarial tenant id is rejected, not routed ───────────────────────');
let rejected = false;
try { await openStorage('../../etc/passwd'); } catch { rejected = true; }
check('a path-traversal tenant id THROWS (never routes to a sibling dir)', rejected);

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('TENANT_ISOLATION_VERIFY: GREEN — one tenant can never retrieve or reach another tenant’s');
  console.log('knowledge; isolation is structural (separate stores) and adversarial ids are rejected.');
  process.exit(0);
} else { console.log('TENANT_ISOLATION_VERIFY: RED'); process.exit(1); }
