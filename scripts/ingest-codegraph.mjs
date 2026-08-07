#!/usr/bin/env node
/**
 * ingest-codegraph.mjs — bridge codegraph's code graph into CONTINUUM.
 *
 * codegraph (tree-sitter) parses the repo into symbols + relationships in its own
 * SQLite (.codegraph/codegraph.db). This translates the EXPORTED symbols
 * (functions/classes/methods/interfaces = the public surface) and their
 * calls/imports edges into CONTINUUM observations, so the brain shows the actual
 * code structure with DIRECTIONAL flow (symbol → the symbol it calls/imports).
 *
 *   node scripts/ingest-codegraph.mjs --project=graph-demo [--db=.codegraph/codegraph.db]
 *
 * Observation shape:  id='sym:<qualified_name>' · sourceId='codegraph:<project>'
 *   · type=<kind> · content=name+signature+file+docstring · refs=[called/imported symbols]
 *
 * A pragmatic bridge (a proper packages/adapters/codegraph is the productised form).
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import Database from 'better-sqlite3';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const project = args.project || process.env.CONTINUUM_PROJECT_ID;
const dbPath = args.db || '.codegraph/codegraph.db';
if (!project) { console.error('error: --project=<id> required'); process.exit(1); }

const KINDS = ['function', 'class', 'method', 'interface', 'component'];
const db = new Database(dbPath, { readonly: true });

// Exported symbols — the public surface (bounded ~450 vs 6028 total).
const rows = db.prepare(
  `SELECT id, kind, name, qualified_name, file_path, signature, docstring
   FROM nodes WHERE is_exported = 1 AND kind IN (${KINDS.map(() => '?').join(',')})`,
).all(...KINDS);
const idToQn = new Map(rows.map((r) => [r.id, r.qualified_name]));
const symId = (qn) => `sym:${qn}`;

// calls/imports edges among the exported set → directional refs.
const refs = new Map();
for (const e of db.prepare(`SELECT source, target FROM edges WHERE kind IN ('calls','imports')`).all()) {
  if (idToQn.has(e.source) && idToQn.has(e.target) && e.source !== e.target) {
    const s = symId(idToQn.get(e.source)), t = symId(idToQn.get(e.target));
    if (!refs.has(s)) refs.set(s, new Set());
    refs.get(s).add(t);
  }
}

const now = new Date().toISOString();
const observations = rows.map((r) => {
  const id = symId(r.qualified_name);
  const content = [
    `${r.name}${r.signature ? ' ' + r.signature : ''}`,
    r.file_path,
    (r.docstring || '').trim(),
  ].filter(Boolean).join('\n');
  return { id, sourceId: `codegraph:${project}`, type: r.kind, content, timestamp: now, refs: [...(refs.get(id) ?? [])], metadata: { adapter: 'codegraph-bridge', file: r.file_path, kind: r.kind } };
});
db.close();

const core = await import('../packages/core/dist/index.js');
const storage = new core.SQLiteStorageBackend(project);
storage.upsertSource(`codegraph:${project}`, 'export', { adapter: 'codegraph-bridge', db: dbPath });
let upserted = 0, edgeCount = 0;
for (const o of observations) { if (storage.upsertObservation(o)) upserted += 1; edgeCount += o.refs.length; }
storage.close();

console.log(`[codegraph] project=${project} db=${dbPath}`);
console.log(`[codegraph] ${upserted} symbol(s) upserted · ${edgeCount} call/import edge(s) — directional code flow`);
