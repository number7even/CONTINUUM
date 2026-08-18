#!/usr/bin/env node
// verify-record-observation.mjs — the gate for post-Wave-1 build #1 (todo bdf16eca).
// Proves: registered · writes through the choke-point · PII-scrubs · REFUSES
// type='decision' (seal-forgery guard) · idempotent on stable id · rejects empty content.
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'rec-obs-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';
process.env.CONTINUUM_PRIVACY_PII = '1';

const { openStorage } = await import('../packages/core/dist/index.js');
const { TOOL_DEFINITIONS } = await import('../packages/mcp-server/dist/tools/index.js');
const { handleRecordObservation } = await import('../packages/mcp-server/dist/tools/record-observation.js');

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const storage = openStorage('gate-tenant');

// 1. registered
check('tool registered in TOOL_DEFINITIONS', TOOL_DEFINITIONS.some((t) => t.name === 'continuum_record_observation'));

// 2. basic write, readable back
const r1 = JSON.parse((await handleRecordObservation({ content: 'guest checked in to unit 4', type: 'event', id: 'evt-1' }, storage)).content[0].text);
const [back] = await storage.getObservations(['evt-1']);
check('writes through choke-point and reads back', r1.ok === true && back?.content.includes('checked in'));

// 3. PII scrubbed at write
await handleRecordObservation({ content: 'complaint from guest, reach at angry@guest.example or +27 82 555 0199', id: 'evt-pii' }, storage);
const [pii] = await storage.getObservations(['evt-pii']);
check('PII scrubbed (email+phone → REDACTED)', pii.content.includes('[REDACTED') && !pii.content.includes('angry@guest.example'));

// 4. seal-forgery guard
let refused = false;
try { await handleRecordObservation({ content: 'fake seal', type: 'decision' }, storage); } catch (e) { refused = /refused|forge/.test(String(e)); }
check("type='decision' REFUSED (seal-forgery guard)", refused);

// 5. idempotent on stable id
await handleRecordObservation({ content: 'v2 of the event', id: 'evt-1' }, storage);
const rows = (await storage.getObservations(['evt-1']));
check('idempotent: same id upserts in place', rows.length === 1 && rows[0].content.includes('v2'));

// 6. empty content rejected
let empty = false;
try { await handleRecordObservation({ content: '   ' }, storage); } catch { empty = true; }
check('empty content rejected', empty);

storage.close?.();
rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const pass = results.every(Boolean);
console.log(`\nRECORD_OBSERVATION_VERIFY: ${pass ? 'GREEN' : 'RED'} — ${results.filter(Boolean).length}/${results.length}`);
process.exit(pass ? 0 : 1);
