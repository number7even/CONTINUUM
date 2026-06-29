/**
 * continuum_check_brand — the Publish Identity Gate (Brand Kernel Layer-0).
 *
 * Sits between draft and publish: "is this safe to ship as this brand?" Given a
 * draft, it retrieves the prior promises/positions most relevant to it (by
 * keyword overlap over FTS5) and returns each as a candidate WITH its Observation
 * ID, so a contradiction can be traced to the exact commitment it would break.
 *
 * Honest scope (P4 — never claim more than we can verify): this is a RETRIEVAL
 * gate, not an automated truth-judge. It surfaces what a draft should be checked
 * against and flags high-overlap candidates for review. The semantic call —
 * "does this draft actually contradict that promise?" — is the publishing agent's
 * or the human's. V0.5 local inference (ruvllm, Issue #3) can automate the
 * judgment later; the seam is this tool's output.
 *
 * Nested brands: a draft for sub-brand X is checked against X's commitments AND
 * the Master brand's (sub-brands inherit Master DNA). Omit subBrand to check all.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */
import type { ToolDefinition, ToolHandler } from '../tool-types.js';

interface CheckBrandArgs {
  draft?: string;
  subBrand?: string;
  limit?: number;
}

const GATE_TYPES = new Set(['brand_promise', 'brand_position']);
/** Overlap (shared significant terms) at/above which a candidate is flagged for review. */
const REVIEW_THRESHOLD = 2;

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'have', 'has', 'will',
  'not', 'but', 'they', 'their', 'from', 'about', 'into', 'out', 'who', 'why', 'how', 'what', 'when',
  'all', 'can', 'our', 'its', 'his', 'her', 'them', 'than', 'then', 'over', 'just', 'like', 'get',
  'one', 'two', 'use', 'using', 'used', 'here', 'there', 'more', 'most', 'some', 'any', 'every',
]);

/** Significant terms from free text — lowercased alphanumerics ≥3 chars, minus stopwords. */
function terms(text: string): string[] {
  const found = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return found.filter((w) => !STOPWORDS.has(w));
}

/** Build an FTS5-safe MATCH query from a draft: dedupe terms, quote each, OR them.
 *  Quoting neutralises FTS5 operators so arbitrary draft punctuation can't error. */
function ftsQueryFrom(termList: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of termList) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(`"${t}"`);
    if (out.length >= 24) break; // cap query width
  }
  return out.join(' OR ');
}

export const checkBrandTool: ToolDefinition = {
  name: 'continuum_check_brand',
  description:
    'Publish Identity Gate: before publishing a draft as a given brand, surface the prior promises and ' +
    'positions most relevant to it — each with its Observation ID — so the draft can be checked for ' +
    'contradiction against what the brand has already committed to. Pass the draft text and optionally ' +
    'the subBrand it will publish as (a sub-brand draft is also checked against the Master brand it ' +
    'inherits from; omit subBrand to check against all). Returns candidate commitments ranked by keyword ' +
    'overlap with a "review" / "clear" status. NOTE: this RETRIEVES and flags; the final contradiction ' +
    'judgment is yours — read each flagged candidate and decide. Cite the Observation ID when you do.',
  inputSchema: {
    type: 'object',
    properties: {
      draft: { type: 'string', description: 'The content about to be published.' },
      subBrand: {
        type: 'string',
        description: 'Brand the draft publishes as, e.g. "voicecosmos". Also checks "master". Omit to check all.',
      },
      limit: { type: 'number', description: 'Max candidates to return (default 5, max 20).' },
    },
    required: ['draft'],
  },
};

export const handleCheckBrand: ToolHandler = async (args, storage) => {
  const input = (args ?? {}) as CheckBrandArgs;
  const draft = String(input.draft ?? '').trim();
  if (!draft) {
    throw new Error('draft is required');
  }
  const subBrand = input.subBrand ? String(input.subBrand).trim().toLowerCase() : undefined;
  const limit = Math.min(Math.max(Number(input.limit ?? 5), 1), 20);

  const draftTerms = terms(draft);
  const draftTermSet = new Set(draftTerms);
  const query = ftsQueryFrom(draftTerms);

  // No usable terms (e.g. draft is all stopwords/punctuation) → nothing to check.
  if (!query) {
    return ok({ gate: 'publish_identity', subBrand: subBrand ?? 'all', status: 'clear', candidates: [], note: NO_TERMS_NOTE });
  }

  // FTS5 Layer-1 retrieval, then narrow to promise/position commitments.
  const hits = storage.searchObservations(query, 40).filter((h) => GATE_TYPES.has(h.type));
  if (hits.length === 0) {
    return ok({ gate: 'publish_identity', subBrand: subBrand ?? 'all', status: 'clear', candidates: [], note: CLEAR_NOTE });
  }

  // Pull full content + metadata to apply the nested-brand scope and score overlap.
  const full = storage.getObservations(hits.map((h) => h.id));
  const scoreById = new Map(hits.map((h) => [h.id, h.score]));

  const candidates = full
    .map((obs) => {
      const meta = (obs.metadata ?? {}) as { subBrand?: string; kind?: string; topic?: string };
      const obsSub = (meta.subBrand ?? 'master').toLowerCase();
      const shared = [...new Set(terms(obs.content))].filter((t) => draftTermSet.has(t));
      return {
        id: obs.id,
        kind: meta.kind ?? obs.type.replace(/^brand_/, ''),
        subBrand: obsSub,
        statement: obs.content,
        overlapScore: shared.length,
        sharedTerms: shared.slice(0, 8),
        retrievalScore: Number((scoreById.get(obs.id) ?? 0).toFixed(3)),
        topic: meta.topic ?? null,
      };
    })
    // Nested scope: a sub-brand draft inherits Master; "master" commitments always apply.
    .filter((c) => !subBrand || c.subBrand === 'master' || c.subBrand === subBrand)
    .sort((a, b) => b.overlapScore - a.overlapScore || b.retrievalScore - a.retrievalScore)
    .slice(0, limit);

  const flagged = candidates.filter((c) => c.overlapScore >= REVIEW_THRESHOLD);
  const status = flagged.length > 0 ? 'review' : 'clear';

  return ok({
    gate: 'publish_identity',
    subBrand: subBrand ?? 'all',
    status,
    flaggedForReview: flagged.length,
    candidates,
    note:
      status === 'review'
        ? `${flagged.length} prior commitment(s) overlap this draft — READ each and confirm the draft does not contradict it before publishing. This gate retrieves and flags; the contradiction call is yours (P4). Cite the Observation ID in your decision.`
        : CLEAR_NOTE,
  });
};

const CLEAR_NOTE =
  'No prior promise/position overlaps this draft above the review threshold. Clear to publish on brand — ' +
  'a retrieval gate cannot prove the absence of every conflict, only that none surfaced.';
const NO_TERMS_NOTE = 'Draft had no significant terms to check (all stopwords/punctuation). Nothing retrieved.';

function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}
