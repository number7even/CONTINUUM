/**
 * p9.ts — the constitutional carve-out. Voice proposes; the physical click seals.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ P9 IS A CEILING, NOT A RUNG                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 * The autonomy ladder (L0 OBSERVE … L4 AUTONOMOUS) lives in the Command Plane and says how
 * much an agent MAY do. It is a dial, and dials get turned up — a tenant on L4 has, by
 * construction, asked for unattended execution.
 *
 * If P9 were expressed as "requires level >= X", granting L4 would satisfy it and the
 * boundary would evaporate exactly for the tenants most able to do damage. The ladder's own
 * escalation path would be the bypass.
 *
 * So this module does not read an autonomy level to decide. `autonomyLevel` is accepted in
 * the input purely so it can be RECORDED in the ruling and asserted to make no difference.
 * Restricted categories require a human seal at every level, including L4.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNKNOWN VERBS FAIL CLOSED                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 * There are two closed sets: verbs known to be read-only (search, browse, preview, stage)
 * and categories known to be dangerous (billing, publish, contract, credentials). A verb in
 * neither set is NOT proven safe, so it requires a seal.
 *
 * The alternative — permit anything unrecognised — means the boundary is only as complete
 * as the last engineer's memory, and every new verb ships unguarded by default. Fail-closed
 * costs a one-line allowlist entry; fail-open costs a charged card.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ A SEAL BINDS TO ONE ACTION                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 * The seal is matched on a canonical hash of the action (verb + target + params). A seal for
 * "refund booking 7781 / €40" does not authorise "refund booking 7781 / €4000", and does not
 * authorise a second execution of the same refund unless a second seal exists. Without that
 * binding, one click becomes a standing authorisation — the classic confused-deputy shape.
 *
 * And the operator on the seal must not be the proposing agent. An agent that can mint its
 * own acceptance has a signature, not a boundary.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import { createHash } from 'node:crypto';
import type { StorageBackend } from './storage.js';
import { AUTHORSHIP_SOURCE_ID } from './observation.js';
import { sealDecision } from './authorship.js';

/** Categories no autonomy level may execute unattended. */
export const P9_CATEGORIES = ['billing', 'publish', 'contract', 'credentials', 'data'] as const;
export type P9Category = (typeof P9_CATEGORIES)[number];

/**
 * Verbs that only read or stage. Everything here is safe because it cannot move money,
 * change what the public sees, bind the company, or alter access.
 * `stage`/`preview` are deliberately included: staging a campaign is proposing, and the
 * proposal is the half of "voice proposes" that must stay frictionless.
 */
const FREE_VERBS = new Set([
  'search', 'browse', 'read', 'get', 'list', 'query', 'summarise', 'summarize',
  'preview', 'stage', 'draft', 'simulate', 'explain', 'digest', 'observe',
  // ── federation verbs (Command Plane), read-only half ──────────────────────
  'pms_status', 'pms_room_types', 'pms_availability', 'pos_status',
  'price_quote',   // computes a figure; ACCEPTING one is 'accept_quote' → contract

  // ── CONTINUUM's OWN MCP tools (the 'continuum_' prefix stripped) ───────────
  // A DIFFERENT NAMESPACE from the federation verbs above, and it must be listed or the
  // dispatcher suspends the whole server — measured: search_docs, get_digest and
  // record_observation were all halted before this existed.
  //
  // These are memory primitives, not transactions: they move no money, publish nothing,
  // bind nobody and mint no credentials. P9 governs external consequence; an internal
  // write to the tenant brain is not that, and gating it behind a click would make
  // automated ingest impossible — which is the feature.
  'search_docs', 'search_documents', 'get_observations', 'get_digest', 'get_state',
  'get_todos', 'get_document', 'list_documents', 'list_templates', 'timeline', 'graph',
  'snapshots', 'codebase_context', 'ask_context', 'session_review', 'next_tasks',
  'validate', 'check_brand',
  'create_document', 'update_document', 'create_todo', 'update_todo',
  'record_observation', 'record_checkpoint', 'record_brand_dna', 'kaizen_record',
  'attest', 'open_claim',
  // record_decision is FREE here on purpose, and it is not a hole: it is the sealing path
  // itself, so restricting it behind P9 would require a seal in order to make a seal.
  // Its protection is anti-self-sealing — a seal whose operator is the proposing agent is
  // ignored by authorize(), so an agent calling this on its own behalf gains nothing.
  'record_decision',
]);

/**
 * Federation verbs whose P9 disposition is a PRODUCT decision, not an engineering one.
 * Listed rather than omitted so they are visibly pending instead of indistinguishable
 * from a typo — classify() reports these separately. They remain RESTRICTED meanwhile,
 * because fail-closed is the safe direction while someone decides.
 *
 *   pms_reservations  the name covers both listing and creating. If it only reads, it
 *                     belongs in FREE_VERBS; if it can create or modify a stay, it is
 *                     billing. One verb cannot be both.
 *   pos_menu_sync     "sync" is directionless. Pulling a menu is a read; pushing one
 *                     changes what guests can order and what they are charged.
 *   source_leads      writes rows at scale AND spends real money on paid discovery APIs.
 *                     Cost without a seal is a billing question wearing a data costume.
 *   score_lead        mutates a lead record. Low blast radius, but not read-only.
 */
export const P9_PENDING_RULING = new Set<string>([
  // Empty: all four were ruled RESTRICTED on 2026-08-22. Kept as a mechanism so the next
  // ambiguous verb is visibly pending rather than silently indistinguishable from a typo.
]);

/** Verb → restricted category. Matched on the verb itself, not on free text. */
const RESTRICTED_VERBS: Record<string, P9Category> = {
  charge: 'billing', refund: 'billing', invoice: 'billing', pay: 'billing',
  subscribe: 'billing', cancel_subscription: 'billing', adjust_credit: 'billing',
  publish: 'publish', unpublish: 'publish', send_campaign: 'publish', broadcast: 'publish',
  go_live: 'publish',
  sign: 'contract', execute_contract: 'contract', accept_quote: 'contract',
  countersign: 'contract',
  rotate_key: 'credentials', set_secret: 'credentials', grant_role: 'credentials',
  revoke_role: 'credentials', reset_password: 'credentials', issue_token: 'credentials',

  // ── federation verbs (Command Plane), restricted half ─────────────────────
  // generate_magic_link is the sharpest of these and the easiest to overlook: it MINTS
  // AN AUTH TOKEN. A voice agent able to call it unattended can hand out account access
  // by saying a sentence. It is a credentials action, not a convenience.
  generate_magic_link: 'credentials',
  pms_connect: 'credentials',        // stores PMS integration credentials
  pos_connect: 'credentials',        // stores POS integration credentials
  pos_create_ticket: 'billing',      // opens an order — money follows
  spa_book: 'billing',
  activity_book: 'billing',
  send_report: 'publish',            // outbound to recipients; unsendable once sent
  teams_notify: 'publish',           // outbound message

  // ── ruled 2026-08-22, previously pending ──────────────────────────────────
  // pms_reservations covers listing AND creating. Restricted until it is SPLIT into
  // pms_list_reservations (free) and pms_create_reservation (billing) — one verb cannot
  // safely be both, and the safe reading of an ambiguous verb is the dangerous one.
  pms_reservations: 'billing',
  // Pushing a menu changes what guests can order and what they are charged. Treating a
  // directionless "sync" as a read invites price tampering.
  pos_menu_sync: 'billing',
  // Executes paid third-party discovery queries and writes CRM rows at scale.
  source_leads: 'billing',
  // Mutates XENOS CRM lead records. Money does not move and nothing goes outbound, so
  // none of the directive's four categories fits honestly; 'data' is a PROPOSED fifth,
  // added rather than mislabelling this as billing. Rename or reject it — but it should
  // not be called something it is not.
  score_lead: 'data',

  // CONTINUUM tool namespace: the one destructive primitive. Removing ledger content is
  // not recoverable from inside the ledger.
  delete_observation: 'data',
};

export interface ProposedAction {
  /** The operation, e.g. 'search' or 'charge'. Compared case-insensitively. */
  verb: string;
  /** What it acts on, e.g. 'booking:7781'. Part of the seal binding. */
  target?: string;
  /** Arguments that change the meaning of the action — amount, recipient. Part of the binding. */
  params?: Record<string, unknown>;
  /** Where the instruction came from. Recorded; does not by itself grant or deny. */
  origin?: 'voice' | 'text' | 'agent' | 'human' | 'scheduler';
  /** The agent proposing. Used to reject self-sealing. */
  proposedBy?: string;
}

export interface P9Ruling {
  allowed: boolean;
  category: P9Category | null;
  /** Canonical hash of the action. A seal must bind to exactly this. */
  actionHash: string;
  reason: string;
  /** Recorded so a reviewer can see the level made no difference. */
  autonomyLevel?: string;
  /** Set when allowed via a matching seal. */
  sealId?: string;
}

/** Recursive canonical JSON (sorted keys at every depth) — same shape authorship.ts uses. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

/**
 * The hash a human seal must bind to. Covers verb + target + params ONLY — not origin,
 * proposedBy or timestamp, so the same action proposed by voice and by text is the same
 * action, while changing an amount is a different one requiring a fresh seal.
 */
export function actionHash(action: ProposedAction): string {
  return 'sha256:' + createHash('sha256')
    .update(canonical({
      verb: String(action.verb ?? '').trim().toLowerCase(),
      target: action.target ?? null,
      params: action.params ?? {},
    }))
    .digest('hex');
}

/** The bare hex digest — FTS-safe. 'sha256:abc…' → 'abc…'. */
const hexOf = (h: string): string => String(h).replace(/^sha256:/, '');

/**
 * Seal a human approval for ONE action. This is the only sanctioned way to satisfy P9.
 *
 * It puts the action hash in `subject.title` as well as `subject.contentHash`, because
 * sealDecision derives the observation's searchable `content` from
 * `title || id || kind` — so without the title the hash never reaches the FTS index and
 * authorize() cannot find its own seal. The contentHash field remains the thing actually
 * verified; the title is only how it becomes findable.
 *
 * The caller supplies the operator: a HUMAN identity. Passing the agent's own name here
 * produces a seal that authorize() will reject, by design.
 */
export function sealActionApproval(
  storage: StorageBackend,
  action: ProposedAction,
  input: { operator: string; verdict?: 'accept' | 'override'; rationale?: string },
): { id: string; actionHash: string } {
  const hash = actionHash(action);
  const verb = String(action.verb ?? '').toLowerCase();
  const sealed = sealDecision(storage, {
    verdict: input.verdict ?? 'accept',
    operator: input.operator,
    rationale: input.rationale ?? `P9 approval for ${verb}${action.target ? ` on ${action.target}` : ''}`,
    subject: { kind: 'p9-action', id: hexOf(hash), title: hexOf(hash), contentHash: hash },
  });
  return { id: sealed.id, actionHash: hash };
}

/** Classify a verb. Unknown → restricted with a null category (fail closed). */
export function classify(verb: string): { restricted: boolean; category: P9Category | null; known: boolean; pendingRuling?: boolean } {
  const v = String(verb ?? '').trim().toLowerCase();
  if (FREE_VERBS.has(v)) return { restricted: false, category: null, known: true };
  const cat = RESTRICTED_VERBS[v];
  if (cat) return { restricted: true, category: cat, known: true };
  // Awaiting a product ruling is not the same as never having been considered. Both
  // refuse, but only one of them tells the operator a decision is owed.
  if (P9_PENDING_RULING.has(v)) return { restricted: true, category: null, known: false, pendingRuling: true };
  return { restricted: true, category: null, known: false };
}

/**
 * Rule on an action WITHOUT consulting the ledger — the pure half, for callers that only
 * need to know whether a seal will be required (e.g. to render a confirm button).
 *
 * `autonomyLevel` is accepted and echoed back, and is deliberately not consulted.
 */
export function rule(action: ProposedAction, autonomyLevel?: string): P9Ruling {
  const { restricted, category, known, pendingRuling } = classify(action.verb);
  const hash = actionHash(action);
  if (!restricted) {
    return { allowed: true, category: null, actionHash: hash, autonomyLevel,
      reason: `'${action.verb}' is read-only or staging — voice may do this unattended` };
  }
  return {
    allowed: false,
    category,
    actionHash: hash,
    autonomyLevel,
    reason: known
      ? `'${action.verb}' is a ${category} action — requires a human seal at every autonomy level, including L4`
      : pendingRuling
        ? `'${action.verb}' is awaiting a P9 ruling (read-only or mutating?) — refusing until classified`
        : `'${action.verb}' is not on the read-only allowlist — unrecognised verbs fail closed and require a human seal`,
  };
}

export interface AuthorizeOptions {
  /** Recorded in the ruling; never consulted. Present so the carve-out is auditable. */
  autonomyLevel?: string;
  /**
   * Operators whose seal does NOT count — the proposing agent itself, plus any service
   * identity. Defaults to rejecting a seal whose operator equals action.proposedBy.
   */
  disallowedOperators?: string[];
}

/**
 * Rule on an action AND check the Authorship Ledger for a human seal bound to it.
 *
 * A seal counts only when all of these hold:
 *   • its subject.contentHash equals this action's hash  (binds seal → action)
 *   • its verdict is 'accept' or 'override'              ('reject' is a refusal, not consent)
 *   • its operator is not the proposing agent            (no self-sealing)
 */
export function authorize(
  storage: StorageBackend,
  action: ProposedAction,
  opts: AuthorizeOptions = {},
): P9Ruling {
  const base = rule(action, opts.autonomyLevel);
  if (base.allowed) return base;

  const disallowed = new Set(
    [...(opts.disallowedOperators ?? []), action.proposedBy]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase()),
  );

  // Seals live in the Authorship Ledger. Look them up by the BARE HEX digest, never by the
  // full 'sha256:…' form: FTS5 parses the colon as column syntax and raises
  // "no such column: sha256". That throw would land in the catch below and refuse forever —
  // fail-closed, but a carve-out that can never be satisfied is a deadlock wearing a
  // principle's clothes. Caught by probe before this shipped.
  let hits: Array<{ id: string }> = [];
  try {
    hits = storage.searchObservations(hexOf(base.actionHash), 25) as Array<{ id: string }>;
  } catch {
    // A ledger that cannot be read is not a ledger that granted consent.
    return { ...base, reason: `${base.reason}. Ledger unreadable — refusing.` };
  }

  for (const hit of hits) {
    const row = storage.getObservations([hit.id])[0] as
      | { sourceId?: string; metadata?: Record<string, unknown> }
      | undefined;
    if (!row || row.sourceId !== AUTHORSHIP_SOURCE_ID) continue;

    const md = (row.metadata ?? {}) as Record<string, any>;
    const subject = (md.subject ?? {}) as Record<string, unknown>;
    if (subject.contentHash !== base.actionHash) continue;             // not this action
    const verdict = String(md.verdict ?? '').toLowerCase();
    if (verdict !== 'accept' && verdict !== 'override') continue;      // reject ≠ consent
    const operator = String(md.operator ?? '').toLowerCase();
    if (!operator || disallowed.has(operator)) continue;               // no self-sealing

    return {
      ...base,
      allowed: true,
      sealId: hit.id,
      reason: `sealed by ${md.operator} (${verdict}) — bound to this action's hash`,
    };
  }

  return { ...base, reason: `${base.reason}. No matching human seal in the ledger.` };
}
