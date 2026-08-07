/**
 * Continuum GitHub Projects adapter — the first SourceAdapter seam.
 *
 * Ingests GitHub Projects (v2) items as CONTINUUM tasks. The thesis, made mechanical:
 * CONTINUUM is the PROOF OVERLAY, not a replacement tracker. A foreign "Done" is NOT
 * trusted — it is recorded as a CLAIM (executor role, the adapter's own key), so it must
 * still be validated (V), tested (T), and human-attested (H) before it can reach the DONE
 * column. GitHub stays the system of record; CONTINUUM enforces the execution layer.
 *
 * Idempotent: each foreign item is bound to a task by its GH node id in refs[], so re-runs
 * update rather than duplicate.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { openStorage, generateIdentity, signEntry, todoTaskRef } from '@number7even/continuum-core';
import type { StorageBackend, Keypair, Todo } from '@number7even/continuum-core';

/** The normalized shape we map foreign trackers into (JIRA/ServiceNow adapters reuse this). */
export interface ProjectItem {
  id: string;              // stable node id in the source system
  number?: number;         // issue/PR number
  title: string;
  status?: string;         // the tracker's status field (e.g. "Todo" / "In Progress" / "Done")
  url?: string;
  updatedAt?: string;
}

const REF_PREFIX = 'gh-projects:';
export const ADAPTER_KEY_ID = 'gh-projects-adapter';

// Which foreign statuses assert completion (case-insensitive). Their "done" → our claim.
const DONE_STATES = new Set(['done', 'closed', 'complete', 'completed', 'shipped', 'merged']);
export const isDoneStatus = (s?: string): boolean => !!s && DONE_STATES.has(s.trim().toLowerCase());

export interface MappedTask {
  externalId: string;
  title: string;
  /** Our status. A foreign "Done" maps to in_progress (NOT done) — it is only a claim. */
  status: Todo['status'];
  claimsDone: boolean;
  metadata: Record<string, unknown>;
}

/** Map one foreign item → our task shape. Pure. The foreign "Done" is deliberately NOT
 *  mapped to our 'done' — it becomes a claim the ledger must still prove. */
export function mapProjectItem(item: ProjectItem): MappedTask {
  const claimsDone = isDoneStatus(item.status);
  const inProgress = claimsDone || /progress|doing|review/i.test(item.status ?? '');
  return {
    externalId: `${REF_PREFIX}${item.id}`,
    title: item.title,
    status: inProgress ? 'in_progress' : 'open',
    claimsDone,
    metadata: { adapter: 'github-projects', ghNodeId: item.id, ghNumber: item.number, ghStatus: item.status ?? null, ghUrl: item.url ?? null },
  };
}

export interface IngestResult { upserted: number; created: number; claimsDowngraded: number; taskIds: string[] }

/**
 * Ingest foreign items into CONTINUUM tasks (idempotent by GH node id in refs[]). For each
 * item whose foreign status asserts "Done", record a CLAIM signed by the adapter's executor
 * key — the ledger will hold it at UNVERIFIED/unproven (never DONE) until V + T + H sign off.
 * That is the proof overlay: their Done becomes a claim, not our Done.
 */
export function ingestProjectItems(storage: StorageBackend, items: ProjectItem[], adapterKey: Keypair): IngestResult {
  storage.registerIdentity({ keyId: adapterKey.keyId, role: adapterKey.role, publicKey: adapterKey.publicKey });

  const byExternal = new Map<string, Todo>();
  for (const t of storage.listTodos()) for (const r of t.refs ?? []) if (r.startsWith(REF_PREFIX)) byExternal.set(r, t);

  const res: IngestResult = { upserted: 0, created: 0, claimsDowngraded: 0, taskIds: [] };
  for (const item of items) {
    const m = mapProjectItem(item);
    let todo = byExternal.get(m.externalId);
    if (todo) {
      todo = storage.updateTodo({ id: todo.id, title: m.title, status: m.status });
    } else {
      todo = storage.createTodo({ title: m.title, status: m.status, refs: [m.externalId] });
      byExternal.set(m.externalId, todo);
      res.created++;
    }
    res.upserted++;
    res.taskIds.push(todo.id);

    if (m.claimsDone) {
      const ref = todoTaskRef(todo.id);
      const alreadyClaimed = storage.getTruthThread(ref).at(-1)?.entries.some(e => e.kind === 'claim');
      if (!alreadyClaimed) {
        const entry = signEntry({
          kind: 'claim', taskRef: ref, at: new Date().toISOString(), by: adapterKey.keyId, role: 'executor',
          payload: { statement: `GitHub Projects marked "${m.title}" Done — claim only; awaits V·T·H` },
        }, adapterKey);
        storage.submitLedgerEntry(ref, entry);
        res.claimsDowngraded++;
      }
    }
  }
  return res;
}

/** Load-or-create the adapter's executor keypair (machine-local, off-db, persisted so its
 *  public key stays stable across runs). Its claims are "GitHub asserts done" — an executor
 *  voice, never able to validate/test/attest itself. */
export function adapterKey(): Keypair {
  const dir = process.env.CONTINUUM_DATA_DIR || join(homedir(), '.continuum');
  const path = join(dir, '.gh-projects-key.json');
  if (existsSync(path)) { try { return JSON.parse(readFileSync(path, 'utf8')) as Keypair; } catch { /* regenerate */ } }
  const kp = generateIdentity('executor', ADAPTER_KEY_ID);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(kp), { mode: 0o600 });
  return kp;
}

/**
 * Live fetch of a GitHub Projects (v2) board via the GraphQL API. Requires a token with
 * `read:project`. Only exercised when wired to a real project — the pure mapping/ingest above
 * is what the proof-gate covers.
 */
export async function fetchProjectItems(opts: { token: string; owner: string; projectNumber: number; ownerType?: 'user' | 'org'; first?: number }): Promise<ProjectItem[]> {
  // Projects v2 hang off either a user or an organization — pick the right root.
  const root = opts.ownerType === 'org' ? 'organization' : 'user';
  const query = `query($owner:String!,$number:Int!,$first:Int!){
    ${root}(login:$owner){ projectV2(number:$number){ items(first:$first){ nodes {
      id
      content{ __typename ... on Issue { number title url } ... on PullRequest { number title url } ... on DraftIssue { title } }
      fieldValues(first:20){ nodes { ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2SingleSelectField { name } } } } }
    } } } } }`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json', 'User-Agent': 'continuum-adapter' },
    body: JSON.stringify({ query, variables: { owner: opts.owner, number: opts.projectNumber, first: opts.first ?? 100 } }),
  });
  if (!r.ok) throw new Error(`GitHub GraphQL ${r.status}: ${await r.text()}`);
  const json = await r.json() as { data?: Record<string, { projectV2?: { items?: { nodes?: unknown[] } } }>; errors?: unknown };
  if (json.errors) throw new Error(`GitHub GraphQL error: ${JSON.stringify(json.errors)}`);
  const nodes = json.data?.[root]?.projectV2?.items?.nodes ?? [];
  return nodes.map((n) => {
    const node = n as { id: string; content?: { number?: number; title?: string; url?: string }; fieldValues?: { nodes?: Array<{ name?: string; field?: { name?: string } }> } };
    const statusField = (node.fieldValues?.nodes ?? []).find(f => f?.field?.name?.toLowerCase() === 'status');
    return { id: node.id, number: node.content?.number, title: node.content?.title ?? '(untitled)', status: statusField?.name, url: node.content?.url };
  });
}

// ── CLI ───────────────────────────────────────────────────────────────────────
// continuum-adapter-github-projects
//   env: GITHUB_TOKEN, GH_OWNER (user/org login), GH_PROJECT_NUMBER,
//        GH_OWNER_TYPE=user|org (default user), CONTINUUM_PROJECT (default continuum)
//   tip: GITHUB_TOKEN=$(gh auth token)  — never printed
if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GH_OWNER || process.env.GH_ORG;
  const projectNumber = Number(process.env.GH_PROJECT_NUMBER);
  const ownerType = (process.env.GH_OWNER_TYPE === 'org' ? 'org' : 'user') as 'user' | 'org';
  const project = process.env.CONTINUUM_PROJECT || 'continuum';
  if (!token || !owner || !projectNumber) {
    console.error('Set GITHUB_TOKEN, GH_OWNER, GH_PROJECT_NUMBER (+ optional GH_OWNER_TYPE, CONTINUUM_PROJECT).');
    process.exit(2);
  }
  const items = await fetchProjectItems({ token, owner, projectNumber, ownerType });
  const storage = await openStorage(project);
  const res = ingestProjectItems(storage, items, adapterKey());
  console.log(`ingested ${res.upserted} items (${res.created} new) into "${project}"; ${res.claimsDowngraded} foreign "Done" → claims (awaiting V·T·H).`);
}
