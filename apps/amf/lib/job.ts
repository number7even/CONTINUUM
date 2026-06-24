/**
 * AMF worker-queue job state — the single, strict, APPEND-ONLY JSON state
 * document that moves through the L4→L5 pipeline (AMF spec §State Management).
 *
 * Phases (the assembly line):
 *   created → enhancing (Auphonic) → enhanced → aligning (word-ts) →
 *   ready-for-assembly → assembling (FFmpeg/Remotion) → rendered → [error]
 *
 * Events are append-only; `phase` is the latest event's phase. Nothing is ever
 * mutated in place — every transition pushes an event. This is what makes the
 * pipeline replayable and auditable (verify-then-dissolve at the job level).
 *
 * STORE (P6 — safely endable, honest about infra):
 *  - In-memory impl works for LOCAL proof only — it does NOT survive across
 *    serverless invocations, so submit() and the webhook (separate invocations)
 *    cannot correlate in production with it.
 *  - PRODUCTION needs a durable store (Vercel KV / Redis / Postgres). The
 *    KvJobStore adapter slots in when KV_* env is present; until then the
 *    in-memory store is used and the limitation is surfaced, not hidden.
 */
import type { L5AudioPayload } from './l5-payload';

export type JobPhase =
  | 'created'
  | 'enhancing'
  | 'enhanced'
  | 'aligning'
  | 'ready-for-assembly'
  | 'assembling'
  | 'rendered'
  | 'error';

export interface JobEvent {
  at: string; // ISO timestamp
  phase: JobPhase;
  note?: string;
  data?: Record<string, unknown>;
}

export interface Job {
  jobId: string;
  trendTopic?: string;
  auphonicUuid?: string;
  phase: JobPhase;
  events: JobEvent[]; // append-only
  payload?: L5AudioPayload | null;
  createdAt: string;
  updatedAt: string;
}

export function createJob(jobId: string, opts: { trendTopic?: string } = {}, now: string): Job {
  const ev: JobEvent = { at: now, phase: 'created' };
  return {
    jobId,
    trendTopic: opts.trendTopic,
    phase: 'created',
    events: [ev],
    payload: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Append an event (never mutate in place). Returns a new Job. */
export function transition(job: Job, phase: JobPhase, now: string, ev: Omit<JobEvent, 'at' | 'phase'> = {}): Job {
  const event: JobEvent = { at: now, phase, ...ev };
  return { ...job, phase, events: [...job.events, event], updatedAt: now };
}

// ── Store ───────────────────────────────────────────────────────────────────

export interface JobStore {
  get(jobId: string): Promise<Job | null>;
  put(job: Job): Promise<void>;
  /** Webhook correlation: Auphonic only knows its own uuid. */
  byAuphonicUuid(uuid: string): Promise<Job | null>;
  readonly durable: boolean;
}

/** LOCAL-ONLY in-memory store. Does not survive serverless invocation boundaries. */
class MemoryJobStore implements JobStore {
  readonly durable = false;
  private byId = new Map<string, Job>();
  private byUuid = new Map<string, string>();
  async get(jobId: string) {
    return this.byId.get(jobId) ?? null;
  }
  async put(job: Job) {
    this.byId.set(job.jobId, job);
    if (job.auphonicUuid) this.byUuid.set(job.auphonicUuid, job.jobId);
  }
  async byAuphonicUuid(uuid: string) {
    const id = this.byUuid.get(uuid);
    return id ? (this.byId.get(id) ?? null) : null;
  }
}

// Module-singleton so all routes in one runtime share it (local proof).
const memoryStore = new MemoryJobStore();

/**
 * Resolve the active store. Returns the durable KV store when KV is configured
 * (TODO: wire @vercel/kv when KV_REST_API_URL + KV_REST_API_TOKEN are injected),
 * else the in-memory store with `durable=false` so callers can warn honestly.
 */
export function getJobStore(): JobStore {
  // TODO(L4): if (process.env.KV_REST_API_URL) return new KvJobStore();
  return memoryStore;
}
