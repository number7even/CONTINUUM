/**
 * @number7even/continuum-core — public API surface.
 *
 * V0 ships:
 *   - Types (Observation, StateSnapshot, Todo, Digest, SearchHit, …)
 *   - StorageBackend interface — domain-level persistence abstraction
 *   - SQLiteStorageBackend — V0 implementation (better-sqlite3 + FTS5)
 *   - openStorage(projectId) factory — single swap point for V0.5 RuVector
 *   - Pure helpers (privacyFilter)
 *
 * Consumers of @number7even/continuum-core SHOULD NOT touch better-sqlite3 directly —
 * always go through openStorage()/StorageBackend so the V0.5 RuVector swap
 * is a single-line change at the factory.
 *
 * IP by Riaan Kleynhans - Human in the Loop - Copyright Riaan Kleynhans
 */

// — Domain types
export type {
  Source,
  SourceType,
  Observation,
  StateSnapshot,
  StateEntry,
  Todo,
  Digest,
  SearchHit,
  TimelineHit,
  AgentHandoffMetadata,
} from './types.js';

// — Storage abstraction (the V0 → V0.5 stable interface)
export type {
  StorageBackend,
  CheckpointInput,
  CreateTodoInput,
  ListTodosOptions,
  UpdateTodoInput,
  InsertObservationsResult,
  TimelineOptions,
} from './storage.js';

export { SQLiteStorageBackend } from './storage-sqlite.js';
export { HybridStorageBackend } from './storage-hybrid.js';
export { openStorage } from './factory.js';

// — Checkpoint seal (Authorship Ledger): the exported hash so callers can
//   RE-DERIVE a snapshot's hash and detect tamper, not just create checkpoints.
//   (CheckpointInput is already exported above.)
export { computeCheckpointHash } from './checkpoint.js';

// — Trust gradient + the Ask retrieval primitive.
export { tierOf, retrieveContext } from './trust.js';
export type { TrustTier, RetrievedNode, RetrievalResult } from './trust.js';

// — The two-host discussion recap (ARIAN): grounded, semantic-fed, tier-cited.
export { buildDiscussionScript } from './discussion.js';
export type { DiscussionScript, DiscussionTurn } from './discussion.js';

// — The IP-Provenance Export (Authorship Ledger Phase 3): the legal shield, printed.
export { buildAuthorshipExport, renderAuthorshipMarkdown } from './authorship-export.js';
export type { AuthorshipExport, AuthorshipEntry } from './authorship-export.js';

// — The BALL: Ticket→Sprint auto-intake (dedup · route · park · auto-dissolve).
export { runIntake, runAutoDissolve, eventsFromObservations, AUTO } from './ball.js';
export type { IntakeEvent, IntakeResult, DissolveResult, Domain } from './ball.js';

// — Observation graph (the 3D "brain" viz data: nodes + refs edges)
export { buildObservationGraph, sourceOf } from './graph.js';
export type { GraphNode, GraphEdge, ObservationGraph, GraphOptions, DeclaredRelation } from './graph.js';
export { extractConcepts, isConceptTerm } from './concepts.js';
export type { ConceptAdditions, ConceptOptions } from './concepts.js';

// — Kaizen (改善) — forge-a-plan-to-blind-executable discipline, wired onto Todo+Observation
export { KAIZEN_STANDARD, KAIZEN_POINTS, gradeLedgerEntry, blankLedgerEntry } from './kaizen.js';
export type { KaizenGrade, AdversarialResult, BlindRun, KaizenLedgerEntry, KaizenVerdict } from './kaizen.js';

// Embedder — exposed so adapters / scripts can pre-compute embeddings
// outside the storage backend if they need to (V0.5 stub primitive).
export { embed, embeddingDimensions } from './embedder.js';

// — Filesystem layout helpers (used by adapters/CLI for diagnostics)
export { openDb, dbPathForProject, continuumDataRoot } from './db.js';

// — Pure helpers (storage-agnostic)
export { privacyFilter, scrubMetadataDeep, type PrivacyResult, type MetadataScrubResult } from './observation.js';

// — Agent handoff primitive (V0-compatible RecursiveMAS intent capture, Issue #3)
export { createAgentHandoffObservation } from './observation.js';

// — STATE.md parser (V0 polish — feeds `continuum init` first-checkpoint)
export {
  parseStateMd,
  parseStateMdToCheckpoint,
  type ParseStateMdResult,
  type ParseStateMdToCheckpointResult,
} from './state-md.js';

// — Byzantine-majority voting primitive (W26-4 — for adapter swarms that
// produce divergent observations). NOT used by adapter-git (deterministic);
// used by adapter-docs / adapter-export where excerpt boundaries diverge.
export {
  byzantineVote,
  type BFTCandidate,
  type BFTWinner,
  type BFTDissent,
  type BFTVoteResult,
} from './byzantine-vote.js';

// — Multi-tenant filesystem-isolation gate (W27-1). Every untrusted
// string that becomes a filesystem segment passes through these two
// pure functions. The HTTP/SSE auth middleware (W27-3) maps `null` to
// HTTP 400; stdio resolution falls back to CONTINUUM_PROJECT_ID env.
export { sanitiseTenantId, tenantDataDir } from './tenant.js';

// The PM brain — actionable-task computation over the todo dependency DAG.
export { computeNextTasks } from './next-tasks.js';
export type { NextTasksResult, RankedTask, NextTaskState } from './next-tasks.js';

// — The multi-signature TruthBlock engine (verify-don't-trust made cryptographic).
// A (executor) claims · V (a separate LLM) validates · T (mechanical exit 0) tests ·
// H (human) accepts. Independence enforced by DISTINCT Ed25519 keys — collusion is
// structurally impossible. Zero-egress: native crypto, local seal, H-only export.
export {
  generateIdentity,
  signEntry,
  verifyEntry,
  evaluateVerdict,
  computeBlockHash,
  finalizeBlock,
  verifyLedger,
  GENESIS,
} from './truth-ledger.js';
export type {
  Role,
  Identity,
  Keypair,
  EntryKind,
  EntryPayloads,
  LedgerEntry,
  Verdict,
  TruthBlock,
  LedgerIssue,
  LedgerReport,
} from './truth-ledger.js';

// — Truth Ledger persistence: public-key registry + append-only block chain.
export {
  registerIdentity,
  listIdentities,
  latestTruthBlock,
  allTruthBlocks,
  getTruthThread,
  verdictForTask,
  appendTruthBlock,
  sealAndAppend,
  submitLedgerEntry,
} from './truth-ledger-store.js';

// — The Board gate: the DONE column opens ONLY for a PROVEN verdict (multi-signature).
export { truthBoardColumn, todoTaskRef } from './board-gate.js';
export type { BoardColumn, BoardClassifyInput } from './board-gate.js';

// — Todo CRUD (the raw functions the MCP tools wrap). updateTodo carries the hard
// Truth-gate choke-point (CONTINUUM_TRUTH_GATE=1 → no DONE without a PROVEN block).
export { createTodo, updateTodo, getTodo, listTodos } from './todo.js';
