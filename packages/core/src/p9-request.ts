/**
 * p9-request.ts — the ASK. Half of the two-record separation; sealDecision is the ANSWER.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ WHY THIS IS NOT WRITTEN THROUGH sealDecision                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 * A pending approval is not a decision. sealDecision writes `type='decision'` into the
 * Authorship Ledger — the substrate of completed, hashed, human-signed consent. Putting an
 * unsigned placeholder there would mean the ledger contains rows that look like seals and
 * are not, which is precisely the forgery surface continuum_record_observation refuses
 * `type='decision'` to prevent.
 *
 * So the ask is its own type under its own source:
 *     source 'p9'      type 'p9-request'     status open|approved|rejected|expired
 * and the answer stays exactly where it was — one sealDecision call, when a human clicks.
 * Same ledger, two records, no ambiguity about which one is consent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ THE REQUEST IS NOT AUTHORITY                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 * Nothing here grants anything. p9Authorize() reads the LEDGER, not this table — an open
 * request with status 'approved' does not authorise an action, and is not consulted. The
 * status field is for the operator's queue view only. If execution ever keyed off it, a
 * writer to this source would be a consent-forgery primitive.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import type { StorageBackend } from './storage.js';
import { actionHash, classify, type ProposedAction, type P9Category } from './p9.js';

export const P9_REQUEST_SOURCE = 'p9';
export const P9_REQUEST_TYPE = 'p9-request';

export type P9RequestStatus = 'open' | 'approved' | 'rejected' | 'expired';

/**
 * The frame declares a riskClassification enum with no producer in the engine. Mapped here
 * so it has ONE origin rather than being invented per call site — but the mapping is
 * partial on purpose: 'publish' and 'data' have no honest member of that enum, and null is
 * a truer answer than a wrong label. An operator who sees "HIGH_FINANCIAL" on an action
 * that moves no money learns to ignore the badge.
 */
const RISK_BY_CATEGORY: Record<P9Category, string | null> = {
  billing: 'HIGH_FINANCIAL',
  credentials: 'SYSTEM_DESTRUCTIVE',
  contract: 'REGULATORY_COMPLIANCE',
  publish: null,
  data: null,
};

export interface P9RequestInput {
  action: ProposedAction;
  tenantId: string;
  /** Human-readable agent name for the frame, e.g. 'SAGE'. */
  proposingAgentName?: string;
  autonomyLevel?: string;
}

export interface P9Request {
  /** Bare hex action hash — the frame's payload.id, and FTS-safe (no colon). */
  id: string;
  observationId: string;
  verb: string;
  target: string | null;
  params: Record<string, unknown>;
  category: P9Category | null;
  riskClassification: string | null;
  autonomyLevel: string | null;
  tenantId: string;
  proposingAgent: { id: string; name: string };
  status: P9RequestStatus;
  createdAt: string;
}

const hexOf = (h: string) => h.replace(/^sha256:/, '');

/**
 * Record that a restricted action was proposed and halted. Idempotent on the action hash:
 * re-proposing the same action updates the open request rather than filling the operator's
 * queue with duplicates of one ask.
 */
export function openP9Request(storage: StorageBackend, input: P9RequestInput): P9Request {
  const { action, tenantId } = input;
  const full = actionHash(action);
  const id = hexOf(full);
  const { category } = classify(action.verb);
  const createdAt = new Date().toISOString();
  const agentId = action.proposedBy ?? 'unknown';

  const req: P9Request = {
    id,
    observationId: '',
    verb: String(action.verb ?? '').trim().toLowerCase(),
    target: action.target ?? null,
    params: action.params ?? {},
    category,
    riskClassification: category ? RISK_BY_CATEGORY[category] : null,
    autonomyLevel: input.autonomyLevel ?? null,
    tenantId,
    proposingAgent: { id: agentId, name: input.proposingAgentName ?? agentId },
    status: 'open',
    createdAt,
  };

  storage.upsertSource(P9_REQUEST_SOURCE, 'docs', { purpose: 'P9 pending approvals (asks, never consent)' });
  // The id doubles as the observation id, so a re-proposal upserts in place. The hash is in
  // `content` so it reaches FTS — the same reason sealActionApproval puts it in subject.title.
  const saved = storage.upsertObservation({
    id,
    sourceId: P9_REQUEST_SOURCE,
    type: P9_REQUEST_TYPE,
    content: `P9 REQUEST · ${req.verb}${req.target ? ` on ${req.target}` : ''} · ${id}`,
    timestamp: createdAt,
    refs: [],
    metadata: { ...req, actionHash: full },
  });
  if (!saved) throw new Error('P9 request was dropped by the privacy filter');
  req.observationId = saved.id;
  return req;
}

/** Read a pending ask back for the operator queue. Never used to decide execution. */
export function getP9Request(storage: StorageBackend, actionHashHex: string): P9Request | null {
  const row = storage.getObservations([hexOf(actionHashHex)])[0] as
    | { id: string; sourceId?: string; type?: string; metadata?: Record<string, unknown> }
    | undefined;
  if (!row || row.sourceId !== P9_REQUEST_SOURCE || row.type !== P9_REQUEST_TYPE) return null;
  return { ...(row.metadata as unknown as P9Request), observationId: row.id };
}
