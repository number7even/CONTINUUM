# Vibely ↔ CONTINUUM Integration Handoff

> **Bound by [The Nine](../../AGENTS.md) v0.1.0.**
>
> **Status:** Vibely is an **external project** developed by the same team
> as a sibling product. This document is what CONTINUUM needs from the
> Vibely team to integrate cleanly when Vibely is ready to ship its
> control-plane surface. Per P3 (Architect for change) the boundary is
> documented before either side commits implementation.
>
> **Layer:** 2 — Factory / Orchestration (per `VISION/UNIFIED-ARCHITECTURE.md`).
> **Position:** Sits ABOVE CONTINUUM (calls into the MCP surface) and
> BELOW H-MARA (escalates high-stakes nodes when the DAG demands it).

---

## TL;DR — what CONTINUUM needs from Vibely

| # | We need | Why |
|---|---|---|
| 1 | **A spec for the SIR blueprint** (JSON schema, versioned) | So we can validate it on receipt + store it as a single Observation type |
| 2 | **The HTTP contract** for `vibely.run` → CONTINUUM MCP and CONTINUUM → Vibely callbacks | So both sides agree on auth, retries, idempotency |
| 3 | **A commitment to use CONTINUUM as the only memory layer** | No Vibely-side caching of observations or todos |
| 4 | **Per-tenant scoping plan** consistent with our D-V2.2 (RuVector collections, V2.0) | So Vibely's parallel routing doesn't break tenant isolation |
| 5 | **A trace context** (W3C `traceparent` / `tracestate`) on every call | So we can correlate Vibely DAG nodes ↔ CONTINUUM observations ↔ H-MARA reasoning |
| 6 | **Escalation signal** for "this needs H-MARA" | So we know whether Mercury dLLM is sufficient or the bare-metal arena fires |
| 7 | **A graceful-degradation contract** when CONTINUUM is unavailable | What does Vibely do when its memory layer is offline? |

---

## Architectural boundary

```
┌──────────────────────────────────┐
│   Vibely (control plane)          │
│   - Intent Omnibar                 │
│   - SIR compiler (intent → JSON)   │
│   - vibely.run DAG executor        │
│   - Mercury dLLM (1,109 t/s)       │
└──────────┬───────────────────────┘
           │ HTTP/MCP — Bearer or JWT auth
           │ trace_id + tenant_id propagated
           ▼
┌──────────────────────────────────┐
│   CONTINUUM (memory plane)        │
│   - 10 MCP tools + 4 Resources    │
│     + 2 Prompts                    │
│   - SQLite + RuVector              │
│   - Live Todo Pipeline             │
│   - Append-only checkpoints        │
└──────────┬───────────────────────┘
           │ (only for DAG nodes Vibely
           │  marks "needs deep reasoning")
           ▼
┌──────────────────────────────────┐
│   H-MARA (Layer 3)                │
│   - MCTS arena (Proponent/Skeptic)│
└──────────────────────────────────┘
```

**Vibely does NOT:**
- Maintain its own observation store
- Hold a vector index
- Track todo state
- Implement the privacy filter (CONTINUUM does, at write-time)

**CONTINUUM does NOT:**
- Compile intent
- Execute DAGs
- Route parallel agent traffic
- Make decisions about when to escalate to H-MARA

The boundary is **calls into CONTINUUM go through the existing MCP
surface (stdio or HTTP/SSE).** No special Vibely-only API. This means
Vibely benefits from every future MCP-layer improvement (verify-then-
dissolve discipline, Progressive Disclosure, citation enforcement)
without coordination.

---

## Need #1 — SIR blueprint schema (JSON, versioned)

The Structured Intermediate Representation is Vibely's compiled output.
CONTINUUM needs to:

- Store each SIR as a single Observation (one row per `vibely.run`)
- Search SIRs by intent text via FTS5
- Embed the SIR into the vector store so semantically-similar past
  intents can be retrieved (Layer-2 Timeline + Layer-3 Full Fetch)

**What we need from Vibely:**

```jsonc
// docs/INTEGRATIONS/sir-schema.json (when ready)
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Vibely SIR Blueprint v1",
  "type": "object",
  "required": ["version", "intent", "dag", "compiler_meta"],
  "properties": {
    "version": { "const": "1.0" },
    "intent": {
      "type": "string",
      "description": "Original natural-language intent from the Omnibar"
    },
    "dag": {
      "type": "object",
      "description": "Directed acyclic graph of execution nodes"
    },
    "compiler_meta": {
      "type": "object",
      "properties": {
        "compiler_version": { "type": "string" },
        "compiled_at": { "type": "string", "format": "date-time" },
        "model": { "type": "string", "description": "e.g. claude-sonnet-4-6" }
      }
    },
    "escalation_hints": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "node_id": { "type": "string" },
          "needs": { "enum": ["mercury-only", "hmara-mcts"] },
          "rationale": { "type": "string" }
        }
      },
      "description": "Per-node guidance: can Mercury dLLM handle it, or escalate to H-MARA?"
    }
  }
}
```

CONTINUUM will register a new Observation `type: 'sir'` once the
schema is finalized. The MCP tool `continuum_search_docs` will index
SIRs alongside docs/git/transcripts — no special-case path needed.

---

## Need #2 — HTTP contract (auth + idempotency)

### Vibely → CONTINUUM

Vibely calls CONTINUUM via the existing **MCP HTTP/SSE transport**
(already shipped, see [`../DEPLOY_SELF_HOSTED.md`](../DEPLOY_SELF_HOSTED.md)).
For each user intent:

1. `POST /messages?sessionId=...` with the JSON-RPC body for any of:
   - `continuum_record_checkpoint` (after a successful vibely.run)
   - `continuum_create_todo` (queue follow-ups)
   - `continuum_search_docs` / `continuum_timeline` / `continuum_get_observations`
     (retrieval for the Mercury dLLM's context window)
2. Use **either**:
   - **Mode A:** `Authorization: Bearer <CONTINUUM_HTTP_TOKEN>` (shared
     secret per-Vibely-deployment) — simplest for V1
   - **Mode B (V1.1, recommended):** JWT signed by the same OIDC
     provider both products share (Auth0 / Clerk / Keycloak). The
     `tenant` claim selects which CONTINUUM project Vibely operates on.

### CONTINUUM → Vibely (callbacks)

When a CONTINUUM todo's `verifyCommand` exits zero, the todo dissolves.
If Vibely originated the todo, it may want a callback. **What we need
from Vibely:**

- A `vibely_callback_url` field on todos (extension of `continuum_create_todo`)
- Vibely advertises a single callback endpoint per deployment
- We POST `{ todo_id, verified_at, hash, exit_code }` to it
- HMAC signature (using the same Bearer secret) so Vibely can authenticate the callback
- **Idempotent on Vibely's side** — we may retry on 5xx

### Idempotency keys

Vibely should send an `X-Vibely-Request-ID: <uuid>` header on every
write. CONTINUUM will use it as the Observation ID for SIR blueprints
(dedup on retry, same as the docs/git adapters' stable-ID pattern).

---

## Need #3 — "CONTINUUM is the only memory" commitment

The strongest architectural commitment we need from Vibely:

> Vibely does not maintain its own observation store, vector cache,
> todo table, or session memory. All persistent state lives in
> CONTINUUM. Vibely is stateless across `vibely.run` invocations
> except for ephemeral DAG execution state.

This is the single largest derisk for the multi-tenant SaaS tier
(D-V2.2). If Vibely has its own cache, multi-tenant becomes a
two-store coordination problem instead of a one-store one.

**Concrete asks:**
- No Vibely-side database
- All retrieval through CONTINUUM MCP tools (Progressive Disclosure FTW)
- All writes via `continuum_record_checkpoint` or `continuum_create_todo`
- DAG execution state held in process memory during `vibely.run`,
  written to CONTINUUM on completion via a single checkpoint, discarded
  on the next invocation

---

## Need #4 — Per-tenant scoping plan (V2.0)

V1.2 of CONTINUUM ships RuVector multi-tenant collections (D-V2.2
locked). Vibely needs to:

1. Pass `tenant_id` on every MCP call (via JWT `tenant` claim or
   `X-Continuum-Project` header — same plumbing we use today)
2. Scope its own DAG executor per-tenant so parallel runs from
   different tenants don't share execution context
3. Honor the tenant boundary in the SIR compiler — no leakage of
   tenant-A intents into tenant-B's compilation cache (which they
   shouldn't have anyway per Need #3)

---

## Need #5 — Trace context propagation

Every Vibely → CONTINUUM call must include W3C `traceparent` headers.
We will mirror them in CONTINUUM logs and forward to H-MARA when we
escalate. This gives us end-to-end tracing across all four layers.

**Format:** standard `traceparent: 00-<trace_id>-<parent_span_id>-01`.
No vendor extensions; pick whatever telemetry backend you like
(Honeycomb, Tempo, Jaeger).

---

## Need #6 — Escalation signal to H-MARA

For each DAG node, Vibely indicates whether Mercury dLLM is sufficient
or the node should escalate to H-MARA's MCTS arena. We need:

- A **field** in the SIR (`escalation_hints[]` above) so CONTINUUM
  can audit and log escalation decisions
- A **default policy** — what's the operator-configurable threshold?
  e.g., "all `verifyCommand`-bearing nodes escalate" or "any node with
  `risk_class: 'security'` escalates"
- **Cost discipline** — H-MARA is expensive (Tier-2 RVM detonation).
  We need an operator cap (max $/intent, max wall-time/intent) and
  Vibely needs to respect it during DAG planning

---

## Need #7 — Graceful degradation when CONTINUUM is unavailable

The honest case to plan for: CONTINUUM's Fly engine restarts, network
partitions, or Vibely operator pointed at a stale instance.

**What we need from Vibely:**

- **Read-only fallback** — if CONTINUUM is unreachable, `vibely.run`
  can still execute deterministic intents (those not needing
  context retrieval) using its in-process state for the duration of
  one DAG run
- **Replay queue** — writes are queued and replayed when CONTINUUM
  returns. Idempotency keys (Need #2) make this safe
- **User-visible degradation** — Omnibar shows a banner: "Operating
  in memory-less mode. Past context unavailable; new commitments
  will be logged when memory reconnects."
- **No silent data loss** — if a queued write fails after N retries,
  log to local disk + alert the operator

---

## Phased integration

| Phase | What ships | Gate |
|---|---|---|
| **V0** | This handoff doc agreed by both teams | Both leads sign off on the schema |
| **V1** | Vibely's `vibely.run` calls CONTINUUM's existing MCP surface with shared-secret auth. SIR stored as Observation. Single-tenant. | Vibely's CI green against a CONTINUUM Docker test container |
| **V1.1** | JWT auth (CONTINUUM's W24-2 just shipped). Trace context. Callbacks. | E2E test: intent → SIR → verify-then-dissolve roundtrip |
| **V2** | Multi-tenant via RuVector collections. Per-tenant rate limits. | V1.2 CONTINUUM ships; tenant isolation audit passes |
| **V3** | H-MARA escalation wired. Cost caps. Witness verification. | H-MARA exits its 🔮 tier (separate dependency chain — see [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md)) |

---

## What CONTINUUM commits to provide

In exchange for the above:

- **Stable MCP surface** — 10 tools + 4 resources + 2 prompts, semver-pinned
- **Bearer + JWT auth** (both shipped)
- **TLS terminator patterns** (Caddy / nginx / Traefik — already in [`../DEPLOY_SELF_HOSTED.md`](../DEPLOY_SELF_HOSTED.md))
- **Per-project DB isolation** (the V1 single-tenant pattern) and the V2 collections upgrade path
- **Observability hooks** — health/readyz endpoints (W24-3 shipping next), structured logs
- **Progressive Disclosure** — Layer-1/2/3 retrieval that already proves 9.97x token savings vs raw grep+Read (W22-1 evidence)
- **Verify-then-dissolve** — the discipline Vibely inherits for free by routing todos through CONTINUUM
- **Privacy filter** — runs at write-time before embeddings, so Vibely never has to think about PII scrubbing

---

## Honest non-claims (P4)

- **No Vibely repo exists in this org today** — the SIR schema above
  is illustrative. The actual schema is whatever the Vibely team
  ships and CONTINUUM adopts. This doc is a **proposal**, not a
  contract.
- **`vibely.style` is a 🔮 surface** per the VISION doc — zero code
  in either repo (CONTINUUM or any Vibely repo we have access to)
  as of this writing.
- **Mercury dLLM is a third-party hosted model** — no account, no
  integration. The 1,109 t/s figure is the vendor claim, not a
  measurement.
- **Cost caps for H-MARA escalation** require H-MARA to exist —
  see [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md).

---

## See also

- [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md) — Layer 3 integration boundary
- [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md) — Layer 0 architecture + build plan
- [`VOICECOSMOS.md`](./VOICECOSMOS.md) — per-customer pattern this doc inherits
- [`../VISION/UNIFIED-ARCHITECTURE.md`](../VISION/UNIFIED-ARCHITECTURE.md) — 6-layer target architecture with tier labels
- [`../DEPLOY_SELF_HOSTED.md`](../DEPLOY_SELF_HOSTED.md) — current HTTP/SSE + auth surface Vibely will call
- [`../V0.5-HYBRID.md`](../V0.5-HYBRID.md) — current memory layer Vibely will use

---

_Bound by The Nine v0.1.0._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
