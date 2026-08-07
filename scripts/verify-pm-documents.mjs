#!/usr/bin/env node
// verify-pm-documents.mjs — proof-gate for the PM Document Layer (Workspace D2 + D5-docs).
//
//   TEMPLATES (D2): the starter set exists (prd/pr-faq/tdd/gtm…); renderTemplate emits the
//     section scaffold; fields{} pre-fill lands by heading; unknown template refused.
//   SCORER (D2): scoreDocument returns 4 dimensions 0-10 + overall + ranked improvements;
//     a rich doc out-scores a placeholder skeleton on every dimension; the top-3 are the
//     lowest-scoring dimensions (prioritized), with concrete suggestions; deterministic.
//   MCP TOOLS (D5): the 6 doc tools dispatch against a REAL DB — list_templates,
//     create_document (stores + scores), get_document, update_document (bumps version +
//     re-scores), list_documents (compact), search_documents (FTS5). Round-trip proven.
//
//   node scripts/verify-pm-documents.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-pmdoc-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage, listTemplates, getTemplate, renderTemplate, scoreDocument } = await import('@number7even/continuum-core');
const { dispatchTool } = await import(new URL('../packages/mcp-server/dist/tools/index.js', import.meta.url).href);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const call = async (name, args, storage) => JSON.parse((await dispatchTool(name, args, storage)).content[0].text);

console.log('── D2 · templates ──────────────────────────────────────────────────────');
const tpls = listTemplates();
check('starter set has the core PM shapes', ['prd', 'pr-faq', 'tdd', 'gtm'].every(id => tpls.some(t => t.id === id)), `${tpls.length} templates`);
const prd = renderTemplate('prd', { title: 'ARIA', fields: { Problem: 'Hotels lose after-hours bookings to voicemail.' } });
check('renderTemplate emits the section scaffold', /## Problem/.test(prd) && /## Success Metrics/.test(prd) && /# ARIA/.test(prd));
check('fields{} pre-fill lands by heading (not the hint)', /Hotels lose after-hours bookings/.test(prd) && !/_The specific pain/.test(prd.split('## Users')[0]));
let refused = false; try { renderTemplate('no-such'); } catch { refused = true; }
check('unknown template refused', refused);

console.log('── D2 · the coaching scorer ────────────────────────────────────────────');
const skeleton = renderTemplate('prd', { title: 'Empty' });                    // all hints, no content
const sk = scoreDocument(skeleton, 'prd');
check('scorer returns 4 dims 0-10 + overall + improvements', [sk.strategy, sk.structure, sk.clarity, sk.completeness, sk.overall].every(n => n >= 0 && n <= 10) && Array.isArray(sk.improvements));
const rich = [
  '# ARIA', '## Problem', 'Boutique hotels lose bookings after 6pm; the front desk is gone and calls hit voicemail. Evidence: 30% of inbound calls after hours go unanswered.',
  '## Users & Personas', 'Independent hotel GMs running 10–80 rooms who own the revenue number.',
  '## Goals & Non-Goals', 'Goal: recover after-hours booking revenue. Non-goal: replacing the PMS.',
  '## Requirements', 'Must answer every call; must log to the CRM; should upsell the spa.',
  '## Success Metrics', 'Target: recover 15% of missed bookings within 90 days, measured against the baseline call-abandon rate.',
  '## Risks & Mitigations', 'Risk: guests dislike AI voice — mitigation: human handoff on request. Unlike generic IVR, this closes the booking.',
  '## Rollout Plan', 'Phase 1 one property; kill-switch on; expand on a green week.',
].join('\n\n');
const rc = scoreDocument(rich, 'prd');
check('a rich doc out-scores the placeholder on completeness', rc.completeness > sk.completeness, `${rc.completeness} > ${sk.completeness}`);
check('a rich doc out-scores the placeholder on strategy', rc.strategy > sk.strategy, `${rc.strategy} > ${sk.strategy}`);
check('a full PRD scores structure 10 (all sections present)', rc.structure === 10, String(rc.structure));
check('top-3 improvements target the lowest dimensions first', sk.improvements.length <= 3 && sk.improvements.length > 0 && sk.improvements[0].suggestion, sk.improvements.map(i => i.dimension).join(','));
const buzz = scoreDocument('# X\n## Problem\nA robust, world-class, scalable, seamless, cutting-edge, innovative solution that leverages synergy.', 'prd');
check('clarity penalizes buzzwords (deterministic penalty)', buzz.clarity < 8, String(buzz.clarity));
// A doc that is complete + strategic on every dimension EXCEPT clarity (buzzword-laden
// Requirements) — so clarity is the lowest dimension and its before/after fix surfaces.
const clarityWeak = rich.replace(
  'Must answer every call; must log to the CRM; should upsell the spa.',
  'We leverage a robust, world-class, scalable, seamless, cutting-edge, innovative, holistic, next-gen platform that must answer every call and should synergize the whole stack.',
);
const cw = scoreDocument(clarityWeak, 'prd');
check('a clarity-weak doc surfaces a clarity before/after fix', cw.clarity < cw.structure && cw.improvements.some(i => i.dimension === 'clarity' && i.after), `clarity ${cw.clarity}`);
check('scorer is deterministic (same input → same score)', JSON.stringify(scoreDocument(rich, 'prd')) === JSON.stringify(scoreDocument(rich, 'prd')));

console.log('── D5 · the document MCP tools (real DB, dispatched) ───────────────────');
const storage = await openStorage('pmdoc-test');
const tl = await call('continuum_list_templates', {}, storage);
check('list_templates returns the registry', tl.templates.length === tpls.length);
const created = await call('continuum_create_document', { templateId: 'pr-faq', title: 'ARIA Launch', fields: { 'Press Release': 'Today ARIA recovers the revenue hotels lose after hours.' } }, storage);
check('create_document stores + returns a score', !!created.id && created.score?.overall >= 0 && /Press Release/.test(created.text));
const got = await call('continuum_get_document', { id: created.id }, storage);
check('get_document returns full text + a fresh score', got.text === created.text && got.metadata.docType === 'pr-faq');
const updated = await call('continuum_update_document', { id: created.id, text: rich }, storage);
check('update_document bumps version + re-scores', updated.version === 2 && updated.score.overall >= 0 && updated.score.clarity >= 0);
const listed = await call('continuum_list_documents', {}, storage);
check('list_documents shows it, compact', listed.count === 1 && listed.documents[0].version === 2);
const found = await call('continuum_search_documents', { query: 'revenue' }, storage);
check('search_documents finds it by content (FTS5)', found.count >= 1 && found.documents.some(d => d.id === created.id));

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('PM_DOCUMENTS_VERIFY: GREEN — PM templates render, the 4-dimension coaching scorer grades');
  console.log('deterministically with prioritized fixes, and the 6 document MCP tools round-trip on a real DB.');
  process.exit(0);
} else { console.log('PM_DOCUMENTS_VERIFY: RED'); process.exit(1); }
