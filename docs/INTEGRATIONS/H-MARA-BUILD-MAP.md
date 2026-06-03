# H-MARA ↔ CONTINUUM Integration Handoff

> **Bound by [The Nine](../../AGENTS.md) v0.1.0.**
>
> **Status:** H-MARA is the reasoning core that CONTINUUM (Layer 1)
> escalates to via Vibely (Layer 2) when a DAG node needs deep
> adversarial proof. This document defines what CONTINUUM needs from
> the H-MARA team to integrate cleanly when H-MARA's MCTS arena is
> ready to ship.
>
> **Layer:** 3 — Reasoning Brain (per `VISION/UNIFIED-ARCHITECTURE.md`).
> **Position:** Sits BELOW Vibely (receives escalated DAG nodes) and
> ABOVE RVM (delegates Tier-2 detonation to bare-metal partitions).
> **Statelessness contract:** H-MARA writes nothing except via the
> witness-receipt callback to CONTINUUM. No H-MARA-side memory.

---

## TL;DR — what CONTINUUM needs from H-MARA

| # | We need | Why |
|---|---|---|
| 1 | **REST/gRPC contract** for `POST /v1/hmara/execute-node` | So Vibely + CONTINUUM can submit MCTS jobs deterministically |
| 2 | **MCP client commitment** — H-MARA reads CONTINUUM context via the 10 existing MCP tools, NOT a custom API | Single source of truth, no parallel retrieval path |
| 3 | **Witness receipt format spec** — what's in the 64-byte hash, how to verify against our local chain | The "currency" of verify-then-dissolve |
| 4 | **Search budget contract** — max nodes, max wall-time, max $-cost per submission | So operators don't get bankrupted by a runaway MCTS |
| 5 | **Failure mode contract** — what does H-MARA return when it can't reach consensus? | Vibely + CONTINUUM need to handle inconclusive verdicts |
| 6 | **DEC (De-Biasing Extraction Compiler) pipeline** — how PII flows through reasoning | Privacy invariant must survive the MCTS hop |
| 7 | **Auth boundary** — how does H-MARA authenticate to CONTINUUM and vice versa? | mTLS? Shared JWT issuer? |
| 8 | **Trace context propagation** — W3C traceparent in + out | End-to-end observability |
| 9 | **Cost metering hooks** — per-node compute spend + per-tenant cap enforcement | Multi-tenant SaaS pricing later |

---

## Architectural boundary

```
┌──────────────────────────────────┐
│   Vibely (control plane)          │
│   - DAG node with escalation_hint │
└──────────┬───────────────────────┘
           │ POST /v1/hmara/execute-node
           │ + traceparent + tenant_id
           ▼
┌──────────────────────────────────┐
│   H-MARA (reasoning core)         │
│   - MCTS arena                    │
│   - Proponent / Skeptic agents    │
│   - Tier-1 Heuristic Critic       │
│   - Tier-2 Deterministic Judge ──┼──┐
│   - DEC pipeline                  │  │
│   STATELESS — no DB, no cache     │  │
└──────────┬───────────────────────┘  │
           │ MCP calls (context retrieval) │
           │ via existing 10 tools         │
           ▼                                 │
┌──────────────────────────────────┐        │
│   CONTINUUM (memory + ledger)     │        │
└──────────────────────────────────┘        │
                                            │
                                            ▼
                              ┌──────────────────────────┐
                              │   RVM (hypervisor)        │
                              │   - <10µs partition       │
                              │   - 64-byte witness       │
                              └──────────────────────────┘
```

**H-MARA does NOT:**
- Store observations, todos, or state snapshots (those live in CONTINUUM)
- Make routing decisions (Vibely's job)
- Boot RVM partitions itself — it requests them via a well-defined RPC
- Hold conversation memory or implement cache eviction policies
- Speak to the public internet (air-gapped per the vision doc)

**CONTINUUM does NOT:**
- Run MCTS searches
- Host the Proponent / Skeptic agents
- Make adversarial reasoning decisions
- Verify code patches at the byte level

---

## Need #1 — `POST /v1/hmara/execute-node` contract

The single entry point. Submitted by Vibely (or CONTINUUM directly
for testing).

**Request:**

```jsonc
POST /v1/hmara/execute-node HTTP/1.1
Authorization: Bearer <jwt with tenant claim>
traceparent: 00-<trace_id>-<span_id>-01
Content-Type: application/json

{
  "node_id": "vibely-dag-node-uuid",         // for callback correlation
  "tenant_id": "acme-corp",                   // for multi-tenant scoping
  "intent": "Fix the SQL injection in users.go:142",
  "context_query": {                           // how to retrieve context
    "search_terms": ["users.go", "sql injection", "parameterized query"],
    "max_observations": 50
  },
  "escalation_reason": "security",             // why this needs MCTS not Mercury
  "budget": {
    "max_mcts_nodes": 10000,
    "max_wall_time_seconds": 300,
    "max_compute_usd_cents": 50
  },
  "callback_url": "https://vibely.example.com/hmara/result",
  "callback_secret": "<hmac key>"
}
```

**Response (immediate):**

```jsonc
HTTP/1.1 202 Accepted
{
  "execution_id": "hmara-uuid",
  "estimated_wall_time_seconds": 180,
  "queue_position": 0,
  "status_url": "https://hmara.example.com/v1/hmara/executions/<id>"
}
```

**Callback (on completion):**

```jsonc
POST <callback_url>
X-HMARA-Signature: <hmac-sha256(callback_secret, body)>

{
  "execution_id": "hmara-uuid",
  "node_id": "vibely-dag-node-uuid",
  "outcome": "verified" | "rejected" | "inconclusive" | "budget_exceeded",
  "witness_receipt": "<64-byte hex>",         // present iff outcome=verified
  "ast_patch": { ... },                       // the proven AST
  "exploit_attempts": [...],                  // Skeptic's defeated payloads
  "mcts_stats": {
    "nodes_explored": 4823,
    "wall_time_seconds": 142,
    "compute_usd_cents": 31
  },
  "trace_id": "<same as request>"
}
```

We need the contract **versioned** so we can rev without breaking
existing Vibely deployments.

---

## Need #2 — H-MARA reads CONTINUUM via MCP, not a custom API

Strong architectural commitment. H-MARA acts as an **MCP client** of
CONTINUUM, using the same 10 tools every other client uses.

When H-MARA's MCTS arena needs to look up prior commits, doc snippets,
or related observations, it calls:

- `continuum_search_docs` (Layer-1 keyword)
- `continuum_timeline` (Layer-2 chronological window)
- `continuum_get_observations` (Layer-3 full-fetch by ID)

**Why:** This means the Progressive Disclosure moat (~10x token
savings measured in W22-1) applies to H-MARA too. No parallel retrieval
path to maintain.

**What we need:** H-MARA's client library uses the standard MCP SDK
(`@modelcontextprotocol/sdk`). No bespoke client. Authentication
uses the same JWT or Bearer that the rest of the stack uses.

---

## Need #3 — Witness receipt format

The 64-byte witness is the only currency CONTINUUM accepts to dissolve
a verify-bearing todo. We need:

### Format spec

```
Offset  Size   Field
------  -----  -----------------------------------------------------------
0       4      Magic: "RVMW" (0x52 0x56 0x4D 0x57)
4       2      Version: u16 little-endian (start at 0x0001)
6       2      Witness type: u16 (1 = code-patch-verified)
8       32     SHA-256 of the proven AST patch (canonical serialization)
40      8      Timestamp: u64 little-endian Unix microseconds
48      8      RVM partition ID: u64 LE (provenance for the detonation)
56      8      Hash chain link: u64 LE (index into RVM's local hash chain)

Total: 64 bytes.
```

(This is a **proposal**; the H-MARA + RVM teams own the actual layout.)

### Verification

CONTINUUM needs to verify a witness BEFORE dissolving a todo:

1. Check magic + version
2. Look up the partition ID in our local mirror of RVM's hash-chain
   (need protocol for syncing this — see [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md))
3. Recompute the SHA-256 of the AST we have a copy of (the one the
   callback returned in `ast_patch`)
4. Compare against witness bytes 8..40
5. If all match → dissolve todo, otherwise log + alert

**What we need:** H-MARA team agrees on this exact layout (or
counter-proposes). Then CONTINUUM ships verification in
`continuum_update_todo` (gated by a `verifyMode: "witness"` field on
the todo).

---

## Need #4 — Search budget contract

H-MARA can run a long time. We need operator-configurable caps:

- `max_mcts_nodes` — hard ceiling on tree size
- `max_wall_time_seconds` — wall clock cap
- `max_compute_usd_cents` — money cap (real)
- `max_gpu_seconds` — for fleet operators

When any cap is hit, H-MARA must:
1. Stop expanding the tree
2. Backpropagate scores using the partial tree
3. Return either the best partial result (`outcome: "inconclusive"`)
   or a clean `outcome: "budget_exceeded"`
4. NEVER block waiting on RVM if its detonation budget is exhausted

**What we need:** H-MARA's MCTS implementation respects all four caps
deterministically, and reports them in `mcts_stats`.

---

## Need #5 — Failure mode contract

Four legitimate outcomes (per the callback shape above):

| outcome | Meaning | CONTINUUM action |
|---|---|---|
| `verified` | Patch proven; witness valid | Verify witness; dissolve todo; record observation type `hmara_witness` |
| `rejected` | Skeptic broke every Proponent patch | Update todo status to `blocked`; record observation type `hmara_rejected` with exploit list |
| `inconclusive` | Variance didn't converge within budget | Update todo to `in_progress`; record observation `hmara_inconclusive` with best-partial-AST so a human can review |
| `budget_exceeded` | Operator's cost cap hit before convergence | Update todo to `blocked`; record `hmara_budget_exceeded` with cap reached |

**What we need:** every callback uses one of these four enum values.
No new outcome types added without a contract bump.

---

## Need #6 — DEC pipeline contract

H-MARA's De-Biasing Extraction Compiler runs BEFORE the MCTS sees
the intent. It must:

1. Receive the raw intent + CONTINUUM-retrieved context
2. Strip rhetorical noise (Semantic Firewall)
3. Translate subjective constraints to mathematical bounds
4. Apply differential privacy to PII-bearing observations BEFORE the
   agents see them (synthetic proxies)
5. Map proxies back to real values at the final output stage

**What CONTINUUM needs:** since CONTINUUM's privacy filter runs at
write-time (11 named patterns + entropy detector), the observations
H-MARA reads are ALREADY scrubbed of named secrets. The DEC pipeline
should treat CONTINUUM-sourced observations as "scrubbed at source"
and focus on de-biasing + DP for un-scrubbed sources (user prompts,
intermediate agent outputs).

---

## Need #7 — Auth boundary

Two directions, both must be defined:

### Vibely / CONTINUUM → H-MARA

Bearer JWT (same OIDC issuer as the rest of the stack — Need #2 of
[`VIBELY-HANDOFF.md`](./VIBELY-HANDOFF.md)). Claims:
- `sub` — caller identity
- `tenant` — for multi-tenant scoping
- `scope` — `hmara:execute` for submission, `hmara:status` for read-only

### H-MARA → CONTINUUM

Same JWT, same issuer, claim `scope: continuum:read` (for context
retrieval). H-MARA never writes directly — only via the witness
callback to CONTINUUM.

### H-MARA → RVM

mTLS or in-host UDS. RVM is bare metal; H-MARA Tier-2 Judge talks to
it via a well-defined RPC (see [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md)).
Out of CONTINUUM's scope to specify; H-MARA + RVM teams own it.

---

## Need #8 — Trace context

Every request and callback carries W3C `traceparent`. H-MARA's MCTS
nodes each get a child span. CONTINUUM observations created from H-MARA
verdicts carry the trace ID in their `refs[]` so we can correlate
intent → MCTS → observations → todo dissolution end-to-end.

---

## Need #9 — Cost metering hooks

For the SaaS tier (V2.0), we need per-tenant compute caps. **What we
need:**

- H-MARA reports `compute_usd_cents` per execution
- CONTINUUM aggregates per `tenant_id` over a rolling window
- A new MCP tool `continuum_get_tenant_compute_usage` exposes this
- Vibely's DAG planner reads this before submitting (Need #6 from
  Vibely handoff)

This is V2.0+ work — flagging it now so H-MARA's API ships the metering
fields from V1.

---

## Phased integration

| Phase | What ships | Gate |
|---|---|---|
| **V0** | This handoff + witness format finalized between teams | Both leads sign off |
| **V1** | H-MARA exposes `POST /v1/hmara/execute-node` against a local mock RVM (no real bare-metal yet) | Submit a fixture intent, get a synthetic witness, CONTINUUM verifies + dissolves todo |
| **V1.5** | Real RVM Tier-2 Judge integration. First real-hardware witness emitted | E2E test against actual `aarch64-unknown-none` build |
| **V2** | Multi-tenant cost caps + DEC pipeline | Per-tenant usage report; differential-privacy audit |
| **V3** | Production traffic from Vibely DAGs | SLO defined; on-call rotation |

---

## What CONTINUUM commits to provide

- **Stable MCP retrieval surface** for H-MARA's context queries (Layer-1/2/3 already in production)
- **Privacy filter at write-time** so H-MARA receives pre-scrubbed observations
- **Witness verification logic** wired into `continuum_update_todo` when the format is finalized
- **`continuum_get_tenant_compute_usage` tool** (V2.0 — depends on multi-tenant collections)
- **Observation types** for H-MARA outcomes: `hmara_witness`, `hmara_rejected`, `hmara_inconclusive`, `hmara_budget_exceeded`
- **Trace ID propagation** in observation `refs[]`

---

## Honest non-claims (P4)

- **H-MARA does not exist as code in any repo we have access to.** This
  handoff is preparatory — the spec lands first, the integration code
  later. Zero lines committed.
- **The witness format above is a proposal.** Real format owned jointly
  by H-MARA + RVM teams.
- **"Air-gapped MCTS in a stateless container" is the vision.** No
  implementation in our org yet. Source for RVM exists (Issue #19); no
  H-MARA source we know of.
- **"Latent-space recursion / zero-copy agent communication" is hard-
  blocked** on local inference (cloud APIs don't expose hidden states —
  documented in Issue #3 and the v0.2 H-MARA enhancement section of
  `VISION/UNIFIED-ARCHITECTURE.md`).
- **Cost figures** (`compute_usd_cents`) presume a GPU fleet H-MARA
  controls. Not in our infrastructure.

---

## See also

- [`VIBELY-HANDOFF.md`](./VIBELY-HANDOFF.md) — Layer 2 integration (Vibely escalates to H-MARA)
- [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md) — Layer 0 — H-MARA's Tier-2 Judge runs there
- [`../VISION/UNIFIED-ARCHITECTURE.md`](../VISION/UNIFIED-ARCHITECTURE.md) §"v0.2 H-MARA enhancements" — the 5-bucket spec already filed
- [`../H-MARA-CONTINUUM/H-MARA-INTEGRATION-PLAN.md`](../H-MARA-CONTINUUM/H-MARA-INTEGRATION-PLAN.md) — earlier v0.1 planning doc
- [`../V0.5-HYBRID.md`](../V0.5-HYBRID.md) — current memory layer H-MARA will read from

---

_Bound by The Nine v0.1.0._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
