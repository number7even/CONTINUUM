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

export default { OBS_TYPES, SIGNAL_TYPES, isSignalType, HITL_REWARD, rewardFor, AVATAR, PROVIDER_IDS };
