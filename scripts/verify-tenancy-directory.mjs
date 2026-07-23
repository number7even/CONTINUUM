#!/usr/bin/env node
// verify-tenancy-directory.mjs — proof-gate for the multi-tenant control plane (Directive 2, D-V2.2).
//
// D-V2.2 resolved: the tenancy DIRECTORY is a separate relational store that maps a tenant UUID to
// its plan, status, and signing-KEY REFERENCE — and holds NO knowledge. This gate proves:
//   • register → resolve round-trips the tenant record (plan/status/keyId);
//   • billing/lifecycle transitions work (setPlan, setStatus) and drive isServable;
//   • an unknown tenant resolves to null; an adversarial id is rejected (sanitised boundary);
//   • the STRUCTURAL invariant — the control-plane schema has NO content/embedding/observation
//     column and no knowledge table. It cannot leak a tenant's data because it cannot store it.
//
//   node scripts/verify-tenancy-directory.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const dir = mkdtempSync(join(tmpdir(), 'amf-tenancy-'));
const dbPath = join(dir, 'tenancy.db');

const { openTenancyDirectory } = await import('@number7even/continuum-core');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const td = openTenancyDirectory({ dbPath });
const UUID = 'a1b2c3d4-5566-7788-99aa-bbccddeeff00';

console.log('── Directive 2 · register → resolve ────────────────────────────────────');
const reg = td.registerTenant({ tenantId: UUID, plan: 'enterprise', status: 'active', keyId: 'key-ref-2026-07' });
check('registerTenant returns the record', reg.tenantId === UUID && reg.plan === 'enterprise' && reg.status === 'active');
const got = td.getTenant(UUID);
check('getTenant round-trips plan/status/keyId', got?.plan === 'enterprise' && got?.status === 'active' && got?.keyId === 'key-ref-2026-07');
check('isServable is true for an active tenant', td.isServable(UUID) === true);

console.log('── billing + lifecycle transitions ─────────────────────────────────────');
td.setPlan(UUID, 'pro');
td.setStatus(UUID, 'suspended');
const upd = td.getTenant(UUID);
check('setPlan + setStatus persist', upd?.plan === 'pro' && upd?.status === 'suspended');
check('a suspended tenant is NOT servable', td.isServable(UUID) === false);
check('listTenants returns the tenant', td.listTenants().some(t => t.tenantId === UUID));

console.log('── unknown + adversarial ids ───────────────────────────────────────────');
check('an unknown tenant resolves to null', td.getTenant('00000000-0000-0000-0000-000000000000') === null);
check('an adversarial tenant id resolves to null (sanitised)', td.getTenant('../../etc/passwd') === null);
let threw = false;
try { td.registerTenant({ tenantId: '../../etc/passwd' }); } catch { threw = true; }
check('registering an adversarial id THROWS', threw);
td.close();

console.log('── STRUCTURAL invariant · the control plane cannot hold knowledge ───────');
const raw = new Database(dbPath, { readonly: true });
const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
const schema = raw.prepare("SELECT sql FROM sqlite_master WHERE type='table'").all().map(r => (r.sql || '').toLowerCase()).join('\n');
raw.close();
check('only the tenants table exists (no observations/knowledge table)', tables.filter(t => !t.startsWith('sqlite_')).every(t => t === 'tenants'), tables.join(','));
check('schema has NO content / embedding / vector / observation column', !/\b(content|embedding|vector|observation)\b/.test(schema));
check('schema stores a key REFERENCE (key_id), not secret material', /key_id/.test(schema) && !/secret|private_key|password/.test(schema));

rmSync(dir, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('TENANCY_DIRECTORY_VERIFY: GREEN — the control plane maps tenant → plan/status/keyId, drives');
  console.log('servability, rejects adversarial ids, and STRUCTURALLY cannot store a tenant’s knowledge.');
  process.exit(0);
} else { console.log('TENANCY_DIRECTORY_VERIFY: RED'); process.exit(1); }
