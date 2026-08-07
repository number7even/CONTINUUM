#!/usr/bin/env node
// verify-okf.mjs — proof-gate for the OKF integration (the three slices).
//
//   SLICE 1 · EXPORT: a seeded real project exports as a valid OKF tree — a root index.md,
//     an index.md in EVERY topic folder, every document opens with front matter carrying
//     name/description/type/id, one observation per file, every index entry links to a
//     file that exists, and per-topic caps are LOUD in the map (no silent truncation).
//   SLICE 2 · INGEST: parseFrontMatter reads a flat OKF block (quoted values unwrapped),
//     refuses malformed/absent blocks (undefined, never a guess), and the DocFile carries it.
//   SLICE 3 · REPO MAPS: docs/INDEX.md + packages/index.md + apps/index.md + apps/amf/index.md
//     exist; the OKF doc itself carries valid front matter (the exemplar).
//
//   node scripts/verify-okf.mjs
//
// IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.CONTINUUM_DATA_DIR = mkdtempSync(join(tmpdir(), 'amf-okf-'));
process.env.CONTINUUM_STORAGE_BACKEND = 'sqlite';

const { openStorage, buildOkfTree, renderDoc, topicOf } = await import('@number7even/continuum-core');
const { parseFrontMatter } = await import('@number7even/continuum-adapter-docs');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('── SLICE 1 · export: a seeded brain → a valid OKF tree ─────────────────');
const storage = await openStorage('okf-test');
storage.upsertSource('git:okf-test', 'git', {});
storage.upsertSource('docs:okf-test', 'docs', {});
storage.upsertObservation({ id: 'a'.repeat(40), sourceId: 'git:okf-test', type: 'commit', content: 'feat: weld the truth ledger\n\nBody of the commit.', timestamp: '2026-07-01T10:00:00Z', refs: [] });
storage.upsertObservation({ id: 'b'.repeat(8) + '-1111-4111-8111-' + 'b'.repeat(12), sourceId: 'docs:okf-test', type: 'doc', content: '# The Spec\n\nOne concept, one file.', timestamp: '2026-07-02T10:00:00Z', refs: [] });
storage.createTodo({ title: 'ship the OKF gate', status: 'in_progress', verifyCommand: 'node scripts/verify-okf.mjs' });
storage.recordCheckpoint({ reason: 'okf gate seeded', active: [{ name: 'okf', where: 'here', verifyCommand: 'exit 0', verifiedAt: '2026-07-19' }], dormant: [], broken: [] });

const tree = buildOkfTree(storage, { project: 'okf-test' });
const byPath = new Map(tree.files.map(f => [f.path, f.content]));
check('root index.md exists + maps the topic folders', byPath.has('index.md') && /\[commits\]\(commits\/index\.md\)/.test(byPath.get('index.md')));
const folders = [...new Set(tree.files.filter(f => f.path.includes('/')).map(f => f.path.split('/')[0]))];
check('every topic folder carries its own index.md', folders.every(d => byPath.has(`${d}/index.md`)), folders.join(', '));
const docs = tree.files.filter(f => !f.path.endsWith('index.md'));
const fmOk = docs.every(f => {
  const fm = parseFrontMatter(f.content);
  return fm && fm.name && fm.description && fm.type && fm.id;
});
check('every document opens with front matter (name/description/type/id)', fmOk, `${docs.length} docs`);
check('one observation per file (commit + doc + todo + checkpoint all present)',
  docs.some(f => f.path.startsWith('commits/')) && docs.some(f => f.path.startsWith('docs/')) &&
  docs.some(f => f.path.startsWith('todos/')) && docs.some(f => f.path.startsWith('checkpoints/')));
const linksResolve = folders.every(d => {
  const idx = byPath.get(`${d}/index.md`);
  return [...idx.matchAll(/\]\(([^)]+\.md)\)/g)].every(m => byPath.has(`${d}/${m[1]}`) || byPath.has(m[1]));
});
check('every index entry links to a file that exists', linksResolve);
const capped = buildOkfTree(storage, { project: 'okf-test', perTopicLimit: 0 });
check('caps are LOUD in the map (no silent truncation)', capped.files.some(f => f.path.endsWith('index.md') && /capped at 0/.test(f.content)));
check('topicOf routes source families (git→commits, doc→docs)', topicOf({ sourceId: 'git:x', type: 'commit' }) === 'commits' && topicOf({ sourceId: 'docs:x', type: 'doc' }) === 'docs');

console.log('── SLICE 2 · ingest: front matter → metadata, honestly ─────────────────');
const fm = parseFrontMatter('---\nname: "The Spec"\ndescription: one concept\ntype: reference\n---\n# Body');
check('flat OKF block parses (quotes unwrapped)', fm?.name === 'The Spec' && fm?.type === 'reference');
check('no block → undefined (never a guess)', parseFrontMatter('# Just a doc') === undefined);
check('unterminated block → undefined', parseFrontMatter('---\nname: x\nno closing fence') === undefined);
check('renderDoc(export) round-trips through parseFrontMatter(ingest)',
  parseFrontMatter(renderDoc({ name: 'RT "quoted"', description: 'd', type: 't', id: 'i' }, 'body'))?.name === 'RT "quoted"');

console.log('── SLICE 3 · the repo is map-navigable ─────────────────────────────────');
check('hub + folder maps exist (docs/INDEX, packages, apps, apps/amf)',
  ['docs/INDEX.md', 'packages/index.md', 'apps/index.md', 'apps/amf/index.md'].every(p => existsSync(join(REPO, p))));
const okfDoc = parseFrontMatter(readFileSync(join(REPO, 'docs/OKF_INTEGRATION.md'), 'utf8'));
check('the OKF doc is its own exemplar (front matter valid)', okfDoc?.type === 'reference' && !!okfDoc?.description);

rmSync(process.env.CONTINUUM_DATA_DIR, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} gates green`);
if (passed === results.length) {
  console.log('OKF_VERIFY: GREEN — the brain exports as a valid OKF tree (maps, front matter, one');
  console.log('concept per file, loud caps); ingest reads OKF honestly; the repo is map-navigable.');
  process.exit(0);
} else { console.log('OKF_VERIFY: RED'); process.exit(1); }
