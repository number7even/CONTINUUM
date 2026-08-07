/**
 * okf-export.ts — export a CONTINUUM project's knowledge as an OKF tree (Slice 1).
 *
 * OKF (Open Knowledge Format): portable, machine-readable knowledge — topic folders,
 * an index.md map in every folder, YAML front matter (name/description/type) on every
 * document, one concept per file. The point: any OKF-speaking agent can navigate this
 * brain surgically — read the maps, load only what it needs — WITHOUT MCP access.
 *
 * The mapping (honest + natural):
 *   topic folders   ← observation source families (commits/ docs/ concepts/ memory/)
 *                     + todos/ + checkpoints/
 *   one file        ← ONE observation / todo / snapshot (minimalism is free: our atoms
 *                     are already single-concept)
 *   front matter    ← name (first line), description (clipped body), type, id, timestamp
 *   index.md        ← per folder: link + description per entry; root: the folder map
 *
 * Pure builders (no I/O) — the CLI writes the files. Same discipline as authorship-export.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { StorageBackend } from './storage.js';
import type { Observation, Todo, StateSnapshot } from './types.js';

export interface OkfFile { path: string; content: string }
export interface OkfTree { files: OkfFile[]; counts: Record<string, number> }

const clip = (s: string, n: number): string => { s = (s ?? '').trim().replace(/\s+/g, ' '); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'; };
const yamlEscape = (s: string): string => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const slugify = (s: string): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'untitled';

/** Topic folder for an observation — its source family. */
export function topicOf(o: Observation): string {
  const src = (o.sourceId ?? '').toLowerCase();
  const type = (o.type ?? '').toLowerCase();
  if (src.startsWith('git:') || type === 'commit') return 'commits';
  if (type === 'doc' || type === 'markdown' || src.includes('docs')) return 'docs';
  if (type === 'concept') return 'concepts';
  if (type === 'brand_promise' || type === 'brand_position') return 'brand';
  return 'memory';
}

/** Front matter + body for one knowledge atom. Front matter is the OKF contract:
 *  name / description / type — enough for an agent to decide WITHOUT loading the body. */
export function renderDoc(meta: { name: string; description: string; type: string; id: string; timestamp?: string; extra?: Record<string, string> }, body: string): string {
  const fm = [
    '---',
    `name: ${yamlEscape(meta.name)}`,
    `description: ${yamlEscape(meta.description)}`,
    `type: ${meta.type}`,
    `id: ${meta.id}`,
    ...(meta.timestamp ? [`timestamp: ${meta.timestamp}`] : []),
    ...Object.entries(meta.extra ?? {}).map(([k, v]) => `${k}: ${yamlEscape(v)}`),
    '---',
    '',
  ].join('\n');
  return fm + body.trim() + '\n';
}

/** Per-folder index.md — the navigation map: every entry linked WITH its description,
 *  so the agent picks files from the map instead of guessing. */
export function renderIndex(title: string, description: string, entries: Array<{ file: string; name: string; description: string }>): string {
  return renderDoc(
    { name: title, description, type: 'index', id: `index:${slugify(title)}` },
    [
      `# ${title}`,
      '',
      description,
      '',
      ...entries.map(e => `- [${e.name}](${e.file}) — ${e.description}`),
    ].join('\n'),
  );
}

/** Build the whole OKF tree from a project's storage. Pure — returns files, writes nothing. */
export function buildOkfTree(storage: StorageBackend, { project, perTopicLimit = 500 }: { project: string; perTopicLimit?: number }): OkfTree {
  const files: OkfFile[] = [];
  const topics = new Map<string, Array<{ file: string; name: string; description: string }>>();
  const add = (topic: string, entry: { file: string; name: string; description: string }, doc: OkfFile) => {
    if (!topics.has(topic)) topics.set(topic, []);
    topics.get(topic)!.push(entry);
    files.push(doc);
  };

  // — observations, one file each, grouped by source family —
  const seenPerTopic = new Map<string, number>();
  // Layer-2 timeline is the cheapest full sweep the interface guarantees:
  const hits = storage.listObservationsAround({ at: new Date().toISOString(), beforeHours: 24 * 365 * 5, afterHours: 0, limit: 100000 });
  const fullById = new Map<string, Observation>();
  for (let i = 0; i < hits.length; i += 50) {
    for (const o of storage.getObservations(hits.slice(i, i + 50).map(h => h.id))) fullById.set(o.id, o);
  }
  for (const h of hits) {
    const o = fullById.get(h.id);
    if (!o) continue;
    const topic = topicOf(o);
    const n = (seenPerTopic.get(topic) ?? 0) + 1;
    seenPerTopic.set(topic, n);
    if (n > perTopicLimit) continue;                     // capped LOUDLY in the root map below
    const firstLine = (o.content ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? o.id;
    const name = clip(firstLine.replace(/^#+\s*/, ''), 80);
    const file = `${slugify(name)}-${o.id.slice(0, 8)}.md`;
    add(topic, { file, name, description: clip(o.content ?? '', 140) }, {
      path: `${topic}/${file}`,
      content: renderDoc({ name, description: clip(o.content ?? '', 160), type: o.type ?? 'observation', id: o.id, timestamp: o.timestamp, extra: { source: o.sourceId ?? '' } }, o.content ?? ''),
    });
  }

  // — todos: the live commitment pipeline —
  for (const t of storage.listTodos()) {
    const name = clip(t.title, 80);
    const file = `${slugify(name)}-${t.id.slice(0, 8)}.md`;
    add('todos', { file, name, description: `status: ${t.status}` }, {
      path: `todos/${file}`,
      content: renderDoc({ name, description: `status: ${t.status}`, type: 'todo', id: t.id, timestamp: t.createdAt, extra: t.verifyCommand ? { verify: t.verifyCommand } : {} },
        [`# ${t.title}`, '', `- status: ${t.status}`, ...(t.verifyCommand ? [`- verifyCommand: \`${t.verifyCommand}\``] : []), ...(t.refs?.length ? [`- refs: ${t.refs.join(', ')}`] : [])].join('\n')),
    });
  }

  // — checkpoints: the verified state chain —
  for (const s of (storage.listSnapshots(100) ?? []) as StateSnapshot[]) {
    const name = clip(s.reason || `checkpoint ${s.id.slice(0, 8)}`, 80);
    const file = `${slugify(name)}-${s.id.slice(0, 8)}.md`;
    add('checkpoints', { file, name, description: `hash ${s.hash.slice(0, 12)}… · ${s.active.length} active` }, {
      path: `checkpoints/${file}`,
      content: renderDoc({ name, description: `verified state snapshot — hash ${s.hash.slice(0, 12)}…`, type: 'checkpoint', id: s.id, timestamp: s.timestamp, extra: { hash: s.hash } },
        [`# ${name}`, '', `- hash: \`${s.hash}\``, `- active: ${s.active.length} · dormant: ${s.dormant.length} · broken: ${s.broken.length}`,
         '', '## Active entries', ...s.active.map(e => `- **${e.name}** — \`${e.verifyCommand}\``)].join('\n')),
    });
  }

  // — per-folder index.md maps. Iterate over EVERY seen topic (not just topics with kept
  // entries): a fully-capped folder still gets its index.md carrying the loud cap note —
  // a topic must never silently vanish from the map (P4).
  const counts: Record<string, number> = {};
  for (const topic of new Set([...topics.keys(), ...seenPerTopic.keys()])) {
    const entries = topics.get(topic) ?? [];
    counts[topic] = seenPerTopic.get(topic) ?? entries.length;
    const capped = (seenPerTopic.get(topic) ?? 0) > perTopicLimit;
    if (!topics.has(topic)) topics.set(topic, entries);
    files.push({
      path: `${topic}/index.md`,
      content: renderIndex(topic, `${entries.length} ${topic} document(s), one concept per file.${capped ? ` NOTE: capped at ${perTopicLimit} of ${seenPerTopic.get(topic)} (no silent truncation — raise perTopicLimit for the rest).` : ''}`, entries),
    });
  }

  // — the root map —
  files.push({
    path: 'index.md',
    content: renderIndex(`${project} — OKF knowledge export`,
      `CONTINUUM project "${project}" exported as an Open Knowledge Format tree: topic folders, an index.md map in every folder, YAML front matter (name/description/type) on every document, one concept per file. Navigate by maps, load surgically.`,
      [...topics.keys()].sort().map(t => ({ file: `${t}/index.md`, name: t, description: `${topics.get(t)!.length} document(s)` }))),
  });

  return { files, counts };
}
