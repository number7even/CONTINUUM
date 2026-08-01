/**
 * contracts.mjs — the AMF data-contract anchor (single source of truth).
 *
 * codegraph's own map draws `storage --defines--> schema`; this is AMF's equivalent. One place
 * the engine's data shapes live, so the 26 worker modules stop re-declaring them and cannot
 * drift. The CONSTANTS below are imported by the modules that own each mechanism (feedback-sync,
 * vault-guard, content-matcher today); the @typedefs are the authoritative reference for every
 * payload the engine produces or consumes — including the exact shape we hand the XENOS
 * `/api/crm/leads/capture` endpoint the moment the keys land.
 *
 * Rule: change a shape HERE, then the importers follow. Never re-declare a constant downstream.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */

// ── Observation types (the CONTINUUM corpus vocabulary) ──────────────────────
/** Every observation `type` the AMF engine writes, grouped by role. */
export const OBS_TYPES = Object.freeze({
  // intelligence — the rankable signals the content-matcher scores
  WORLD_BRIEF: 'world_brief',
  FEED_ARTICLE: 'feed_article',
  RSS: 'rss',
  ENGAGEMENT_SIGNAL: 'engagement_signal',
  // first-party + pipeline artifacts
  OWN_CONTENT: 'own_content',
  PILLAR: 'pillar',
  MARKETING: 'marketing',
  APPROVAL: 'approval',
  REVIEW: 'review',
  // the feedback loop (Seam ②)
  GROUND_TRUTH: 'ground_truth',
});

/** The rankable subset — `content-matcher.rankSignals` scores ONLY these. */
export const SIGNAL_TYPES = new Set([
  OBS_TYPES.WORLD_BRIEF, OBS_TYPES.FEED_ARTICLE, OBS_TYPES.RSS, OBS_TYPES.ENGAGEMENT_SIGNAL,
]);
export const isSignalType = (t) => SIGNAL_TYPES.has(t);

// ── XENOS HITL feedback (Seam ②) ─────────────────────────────────────────────
/** Canonical reward per HITL decision (XENOS `contracts.ts`). Confirm on key handover. */
export const HITL_REWARD = Object.freeze({ approve: 1.0, modify: 0.7, reject: 0.2 });
/** reward for a decision string (case-insensitive), or null if unknown. */
export const rewardFor = (decision) => HITL_REWARD[String(decision || '').toLowerCase()] ?? null;

// ── PodGeni Creative Genome engagement telemetry (Seam ② — Wave 2 return path) ─
// The XENOS half above learns from a HUMAN DECISION ("approve/reject"). This half learns from a
// MEASURED OUTCOME ("this asset/style actually drove engagement") — a different source, same corpus
// slot. Both land as type='ground_truth' so content-matcher.feedbackWeight() consumes them identically.
/** The sourceId engagement telemetry is written under (distinct from 'xenos_hitl'). */
export const TELEMETRY_SOURCE_ID = 'podgeni';
/** engagements/impressions rate that maps to a full 1.0 reward. Transparent heuristic, tunable. */
export const TELEMETRY_TARGET_RATE = 0.08;
/**
 * Map measured engagement → a reward in the SAME 0.2..1.0 band as HITL_REWARD, so "what performed"
 * nudges the ranker like "what a human approved". This is a TRANSPARENT HEURISTIC, not a tuned model
 * (P4 — no false precision): a normalized `score` in [0,1] wins if present; else derive from
 * engagements/impressions against TELEMETRY_TARGET_RATE; any conversion pins to the top of the band.
 * Returns null when there is no measurable signal → nothing to learn, nothing written.
 * @param {GenomeTelemetry} t
 * @returns {number|null}
 */
export function engagementReward(t = {}) {
  const band = (x) => Math.max(0.2, Math.min(1.0, 0.2 + 0.8 * Math.max(0, Math.min(1, x))));
  if (Number.isFinite(Number(t.score))) return band(Number(t.score));
  if (Number.isFinite(Number(t.conversions)) && Number(t.conversions) > 0) return 1.0; // a conversion IS ground truth
  const imp = Number(t.impressions), eng = Number(t.engagements);
  if (Number.isFinite(imp) && imp > 0 && Number.isFinite(eng)) return band((eng / imp) / TELEMETRY_TARGET_RATE);
  return null; // no measurable engagement
}

// ── Avatar / rights scheme (Stage H — the rights wall keys off these) ─────────
/** avatarId scheme: rented human likeness vs synthetic. */
export const AVATAR = Object.freeze({
  RENTED_PREFIX: 'studiomunich:',            // rented human — needs a verified X-Rights-Signature
  SYNTH_PREFIX: 'digital:',                  // synthetic — AMF renders itself, no rights needed
  SYNTHETIC_FALLBACK: 'digital:synthetic',   // where the rights wall declines to
});

// ── Provider ids (ingest, Stage D — adapter-news PROVIDERS registry) ──────────
export const PROVIDER_IDS = Object.freeze([
  'worldmonitor', 'feedly', 'rss', 'googlenews', 'hackernews', 'reddit', 'youtube', 'own',
]);

// ── Authoritative shapes (@typedefs — the reference every producer/consumer honors) ──
/**
 * @typedef {Object} Observation            The CONTINUUM row every adapter writes.
 * @property {string}   id                  Stable id (content-hash or source-native).
 * @property {string}   sourceId            Provider / source id.
 * @property {string}   type                One of OBS_TYPES.
 * @property {string}   content
 * @property {string}   timestamp           ISO 8601.
 * @property {string[]} refs
 * @property {ObservationMetadata} metadata
 */
/**
 * @typedef {Object} ObservationMetadata
 * @property {string}   [provider]          Provider id (PROVIDER_IDS) / 'xenos_hitl' / 'brand'.
 * @property {string}   [category]
 * @property {string[]} [sources]           URLs — drive authority tiering in rankSignals.
 * @property {number}   [engagement]        HN/Reddit score, YouTube views/1000, etc.
 * @property {number}   [reward]            ground_truth only — HITL_REWARD value 0.2..1.0.
 * @property {string}   [decision]          ground_truth only — approve|modify|reject.
 * @property {string}   [product]           ground_truth only — AMF product slug the decision was about.
 * @property {string}   [flow_id]
 * @property {string}   [flow_type]
 * @property {string}   [tenant_id]
 * @property {string}   [origin]            e.g. 'seam2'.
 */
/**
 * @typedef {Object} GroundTruthDecision    A XENOS `/api/hitl/recent-decisions` item → mapDecision().
 * @property {string}  id
 * @property {string}  decision             approve|modify|reject.
 * @property {number}  [reward_signal]      overrides HITL_REWARD if XENOS sends its own scalar.
 * @property {{title?:string, description?:string}} [context]
 * @property {string}  [review_text]
 * @property {string}  [product]            or meta.product_interest.
 * @property {string}  [tenant_id]
 * @property {string}  [created_at]
 */
/**
 * @typedef {Object} GenomeTelemetry        A Crooma/PodGeni Creative Genome engagement event → mapTelemetry().
 * @property {string}  id                    Stable per-event id (the idempotency key).
 * @property {string}  [decisionId]          The CONTINUUM decision the asset was sealed under → refs (closes the loop).
 * @property {string}  [signalId]            The origin signal the asset came from → refs (back to the news article).
 * @property {number}  [score]               Normalized performance in [0,1] — wins over raw metrics if present.
 * @property {number}  [impressions]
 * @property {number}  [engagements]         clicks + likes + shares + saves.
 * @property {number}  [conversions]         a conversion pins the reward to the top of the band.
 * @property {string}  [summary]             what the asset was about — carries the TERMS feedbackWeight matches on.
 * @property {string}  [style]               the Creative Genome variant that ran (what we're learning about).
 * @property {string}  [product]             AMF product slug (matches feedbackWeight's product filter).
 * @property {string}  [tenant_id]
 * @property {string}  [asset_id]
 * @property {string}  [measured_at]         ISO 8601.
 */
/**
 * @typedef {Object} LeadPayload            AMF → XENOS `POST /api/crm/leads/capture` (Seam ①, header `x-intake-key`).
 * @property {string}  tenant_id            The OWNER tenant (whose CRM the lead lands in) — NOT the prospect.
 * @property {string}  source              'amf'.
 * @property {string}  [name]
 * @property {string}  [email]
 * @property {string}  [company]
 * @property {LeadMeta} meta                Passthrough (blocker B1) — XENOS echoes this back on the lead.
 */
/**
 * @typedef {Object} LeadMeta
 * @property {string}   product_interest    The product's xenos_key.
 * @property {string[]} [asset_refs]        AMF asset ids (the magnet / short that captured the lead).
 * @property {string}   [context]
 */
/**
 * @typedef {Object} RenderDecision         `vault-guard.decideRender()` output (the rights-wall verdict).
 * @property {boolean}  serve
 * @property {'synthetic'|'rented-signed'} mode
 * @property {string}   avatarId            What to actually render (may be AVATAR.SYNTHETIC_FALLBACK).
 * @property {string}   requested
 * @property {string}   reason
 * @property {boolean}  [securityEvent]     true on a forged/tampered signature (HARD REJECT).
 */
/**
 * @typedef {Object} ProductUniverseEntry   A `portfolio-universe.json` products[] entry.
 * @property {string}   slug
 * @property {number}   priority
 * @property {string}   sector
 * @property {string}   angle
 * @property {string[]} topics
 * @property {string[]} keywords
 * @property {string[]} sales_signals
 * @property {string[]} signal_query
 * @property {ProductFilters} [filters]
 * @property {{url:string, tier:number, name:string, status?:string}[]} feeds
 * @property {{url:string, name?:string}[]} [own_feeds]
 */
/**
 * @typedef {Object} ProductFilters         The boolean gate (`content-matcher.passesFilters`).
 * @property {string[][]} must              AND-of-ORs: the signal must hit ≥1 term in EVERY group.
 * @property {string[]}   not               Exclusion: the signal must contain NONE of these.
 */

export default { OBS_TYPES, SIGNAL_TYPES, isSignalType, HITL_REWARD, rewardFor, TELEMETRY_SOURCE_ID, TELEMETRY_TARGET_RATE, engagementReward, AVATAR, PROVIDER_IDS };
