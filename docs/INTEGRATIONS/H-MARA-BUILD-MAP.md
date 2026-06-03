# H-MARA Architecture + Build Map (internal)

> **Bound by [The Nine](../../AGENTS.md) v0.1.0.**
>
> **Status:** H-MARA does **not** exist as a standalone brand or repo.
> It is **the invisible, brutal reasoning core operating behind the
> CONTINUUM product** — we own it, we build it. Zero code exists today
> in any repo we have access to; this document maps the architecture
> and phased build plan, parallel to [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md).
>
> **Layer:** 3 — Reasoning Brain (per `VISION/UNIFIED-ARCHITECTURE.md`).
> **Position:** Sits BELOW Vibely (receives escalated DAG nodes —
> Vibely is external, see [`VIBELY-HANDOFF.md`](./VIBELY-HANDOFF.md))
> and ABOVE RVM (delegates Tier-2 detonation to bare-metal partitions
> — we own RVM too, see [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md)).
> **Statelessness contract:** H-MARA writes nothing except via the
> witness-receipt callback to CONTINUUM. No H-MARA-side memory.
>
> **NOT a SPRINT-W24 commitment.** This is V1.5+ / V2 horizon work,
> gated on RVM Phase R2 (real partition detonation) + local inference
> (Issue #3) being available. Per partner-clause #3 we do not start
> Phase H1 until those gates clear. This doc is roadmap, not WIP.

---

## TL;DR — what we will build (and what gates each phase)

| # | Component | Phase | Status today | Gate |
|---|---|---|---|---|
| 1 | `POST /v1/hmara/execute-node` HTTP entry | H1 | 🔮 zero code | Phase H0 spec finalized |
| 2 | MCP client (H-MARA reads CONTINUUM via our 10 tools) | H1 | 🔮 | `@modelcontextprotocol/sdk` (already in stack) |
| 3 | MCTS search engine (`hmara-core/src/mcts/`) | H2 | 🔮 | Local inference available (Issue #3) |
| 4 | Proponent / Skeptic agent loop | H2 | 🔮 | Phase H1 complete |
| 5 | Tier-1 Heuristic Critic (sub-2B value network) | H2 | 🔮 | Model selected + deployed |
| 6 | Tier-2 Deterministic Judge (`hmara-core/src/judge/`) | H3 | 🔮 | **RVM-BUILD-MAP Phase R2** — real partition detonation |
| 7 | 64-byte witness emission via RVM | H3 | 🔮 | `rvm-bridge` exposes witness API |
| 8 | DEC pipeline (De-Biasing Extraction Compiler) | H4 | 🔮 | Phase H2 + bias-projection embedding model |
| 9 | Latent-space recursion (zero-copy agent messages) | H4 | 🔮 | Local inference exposing hidden states |
| 10 | Per-tenant cost metering hooks | H5 | 🔮 | CONTINUUM V2.0 multi-tenant (D-V2.2) |
| 11 | Production traffic from Vibely DAGs | H5 | 🔮 | All above |

**Hard dependency chain:** RVM Phase R2 → H-MARA Phase H3. Soft
dependency: local inference (`ruvllm` per Issue #3) blocks Phase H4
(latent-space recursion can't happen against cloud APIs that don't
expose hidden states).

---

## Architectural boundary

```
┌──────────────────────────────────┐
│   Vibely (Layer 2, EXTERNAL)      │
│   See VIBELY-HANDOFF.md           │
└──────────┬───────────────────────┘
           │ POST /v1/hmara/execute-node
           │ + traceparent + tenant_id
           ▼
┌──────────────────────────────────┐
│   H-MARA (this document, ours)    │
│   - MCTS arena                    │
│   - Proponent / Skeptic agents    │
│   - Tier-1 Heuristic Critic       │
│   - Tier-2 Deterministic Judge ──┐│
│   - DEC pipeline                  ││
│   STATELESS — no DB, no cache     ││
└──────────┬───────────────────────┘│
           │ MCP calls (context retrieval)
           │ via existing 10 tools         │
           ▼                                 │
┌──────────────────────────────────┐        │
│   CONTINUUM (Layer 1, exists today)│      │
│   The memory + ledger plane       │        │
└──────────────────────────────────┘        │
                                            │
                                            ▼
                              ┌──────────────────────────┐
                              │   RVM (Layer 0, source-   │
                              │   only, see RVM-BUILD-MAP)│
                              │   - <10µs partition       │
                              │   - 64-byte witness        │
                              └──────────────────────────┘
```

**H-MARA does NOT:**
- Store observations, todos, or state snapshots (those live in CONTINUUM)
- Make routing decisions (Vibely's job)
- Boot RVM partitions itself — it requests them via a well-defined RPC
- Hold conversation memory or implement cache eviction policies
- Speak to the public internet (air-gapped per the vision)

**CONTINUUM does NOT:**
- Run MCTS searches
- Host the Proponent / Skeptic agents
- Make adversarial reasoning decisions
- Verify code patches at the byte level

---

## The architectural commitment to Journey 3

**Journey 3 (Solo Developer) currently runs 100% real with zero
native dependencies.** H-MARA integration MUST preserve this. Same
non-negotiables as RVM:

1. **H-MARA is opt-in.** Default verify mode stays `shell-exit-code`.
   Only operators who explicitly run an H-MARA cluster get
   adversarial-reasoning verification.
2. **The `npm install` story is unchanged.** H-MARA lives in a
   separate binary distribution — likely Rust crates in
   `hmara-core/` (matching the vision doc's repo tree) + a sidecar
   container — but never a native dep of `@continuum/*`.
3. **No mandatory GPU.** Tier-1 critic needs a model; we ship a
   CPU-only profile (slow but works) and a GPU-accelerated profile
   (production). Operators pick at deploy time.

If we can't preserve Journey 3, we don't integrate H-MARA. Same
principle that drove V0.5 Path D last sprint, carried forward.

---

## Build plan — phased, gated

### Phase H0 — Spec finalization (Weeks 1-2 of an authorized H-sprint)

**Goal:** byte-exact agreement on the `POST /v1/hmara/execute-node`
contract, the four-outcome model, and the witness format (joint with
[`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md) §"Witness format" — they
must match).

Deliverables:
- [ ] `docs/INTEGRATIONS/hmara-execute-node.openapi.yaml` (NEW) —
      machine-readable OpenAPI 3.1 spec for the entry point
- [ ] Witness format finalized in [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md)
      (currently a proposal)
- [ ] Four-outcome enum locked: `verified` / `rejected` /
      `inconclusive` / `budget_exceeded`
- [ ] DEC pipeline output schema (what does a "de-biased intent"
      look like as JSON?)

**No code in CONTINUUM yet.** Just the spec.

### Phase H1 — MVP arena against a local stub-RVM (Weeks 3-6)

**Goal:** H-MARA receives an intent, retrieves context from CONTINUUM
via MCP, runs an MCTS, returns a synthetic-witness verdict. RVM is
stubbed — Tier-2 Judge just compiles + runs the code in a regular
process and emits a fake 64-byte signature.

Deliverables (in our control):
- [ ] `hmara-core/` workspace bootstrapped (Rust, per the vision tree)
- [ ] `hmara-core/src/api/` — Axum/Actix HTTP server implementing
      `POST /v1/hmara/execute-node`
- [ ] `hmara-core/src/mcp_client/` — MCP client using `mcp-rust-sdk`
      or wrapping `@modelcontextprotocol/sdk` via subprocess RPC
- [ ] `hmara-core/src/mcts/` — minimum viable Monte Carlo tree
      search with UCT path selection, configurable budget
- [ ] `hmara-core/src/judge/tier1_critic.rs` — heuristic scorer
      stub (returns deterministic mock scores for testing)
- [ ] `hmara-core/src/judge/tier2_judge_local.rs` — stub that
      compiles + runs in a local process, emits fake witness
- [ ] End-to-end fixture: submit a known-good intent + AST, observe
      verdict + fake witness, CONTINUUM verifies signature against
      a stubbed chain

CONTINUUM side changes (minimal, in `packages/`):
- [ ] `continuum_create_todo` accepts `verifyMode: 'hmara-witness'`
- [ ] `continuum verify` routes witness-mode todos to a configured
      H-MARA endpoint (or stub)
- [ ] New env var `CONTINUUM_HMARA_URL` (unset = no H-MARA path)

### Phase H2 — Real MCTS + Proponent/Skeptic agents (Weeks 7-12)

**Goal:** Replace the deterministic stub MCTS with a working
adversarial search. Proponent generates AST patches; Skeptic generates
exploits; Tier-1 critic scores.

Deliverables:
- [ ] Tier-1 Heuristic Critic: pick a quantised value-network model
      (candidates: distilled CodeBERT, sub-2B mistral-derived, or a
      custom-trained scorer). Deploy via `ruvector`'s embedder or
      similar runtime.
- [ ] Proponent agent loop with proper LLM invocation (cloud API OK
      at Phase H2 since latent-space recursion is H4)
- [ ] Skeptic agent loop with adversarial-payload generation
- [ ] UCT formula with cost penalty:
      `UCT(s) = V(s) + w·√(ln N(p) / N(s)) - λ·C_compute(s)`
- [ ] Exponential decay on node reward to prevent infinite-correction loops
- [ ] Native symbolic output: agents emit `Python AST` or `JSON
      schema` directly; invalid output → -1.0 reward
- [ ] Search budget enforcement: max_mcts_nodes, max_wall_time_seconds,
      max_compute_usd_cents

### Phase H3 — Real RVM Tier-2 Judge (Weeks 13-16)

**Goal:** Tier-2 Judge replaces the local-process stub with a real
RVM partition detonation. This is the hard gate — requires
[`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md) Phase R2 to be done.

Deliverables:
- [ ] `hmara-core/src/judge/tier2_judge_rvm.rs` — talks to
      `rvm-bridge` (the Rust binary from RVM Phase R1)
- [ ] Witness verification on H-MARA side BEFORE returning to
      caller (we don't trust the bridge's word; we verify against
      our local hash-chain mirror)
- [ ] End-to-end: real vulnerable repo + real exploit + real RVM
      sandbox + real witness emitted + CONTINUUM dissolves a real
      todo

### Phase H4 — Advanced features (Weeks 17-24+)

The v0.2 H-MARA enhancement spec from `VISION/UNIFIED-ARCHITECTURE.md`
lands here. Gated on local inference (Issue #3) for B1 + B5.

- **B1 · Latent-Space Recursion (RecursiveMAS)** — agents pass hidden
       states instead of text. 2.4x faster / 75% fewer tokens.
       **Hard-gated on local inference** that exposes hidden states.
- **B2 · Lazy Eval + cost-penalised UCT** (some of this in H2 already)
- **B3 · Dynamic Mixture-of-Agents + TTC throttling** — multiple
       proposer SLMs + one aggregator. **Soft-gated on a multi-
       provider inference broker** (knapsack engine — currently 🔮).
- **B4 · Zero-Compute Bypass** — cosine-similarity ≥0.96 against
       historical verified MCTS paths → reuse the verified AST.
       Soft-gated on a vector memory of verified paths (need H3
       running long enough to accumulate).
- **B5 · Hardened DEC** — Latent Constraint Extraction + Orthogonal
       Bias Projection + Differential Privacy. Hard-gated on a
       bias-projection embedding model.

### Phase H5 — Production hardening (Weeks 25+)

- Per-tenant cost metering hooks (CONTINUUM V2.0 dependency)
- Multi-tenant partition scoping (RVM Phase R4 dependency)
- Production traffic from Vibely DAGs (Vibely Phase V3 dependency)
- SLO definition + on-call rotation
- Cost telemetry surfaced via new MCP tool `continuum_get_tenant_compute_usage`

---

## Repo layout (when Phase H1 starts)

Matching the vision doc's tree:

```
hmara-core/                        ← new Rust workspace, sibling to CONTINUUM
├── Cargo.toml
├── src/
│   ├── api/                       ← HTTP server: POST /v1/hmara/execute-node
│   ├── mcp_client/                ← MCP client wrapping the @continuum/* surface
│   ├── mcts/                      ← UCT path selection + tree management
│   ├── agents/
│   │   ├── proponent.rs           ← Blue Team — generates AST patches
│   │   └── skeptic.rs             ← Red Team — generates exploits
│   ├── judge/
│   │   ├── tier1_critic.rs        ← Heuristic value network
│   │   └── tier2_judge.rs         ← Calls rvm-bridge for real detonation
│   ├── dec/                       ← De-Biasing Extraction Compiler (H4)
│   └── budget/                    ← max-nodes / max-wall-time / max-$ enforcement
└── tests/
    ├── synthetic_witness.rs       ← Phase H1 stub coverage
    └── e2e_rvm.rs                 ← Phase H3 real-witness coverage
```

`hmara-core` lives either as **a sibling repo** or **a sibling
directory tree in this monorepo** — that's a future decision. It is
**not** part of the `packages/` npm workspace tree, so `npm install`
for CONTINUUM operators is unaffected.

---

## API contract — `POST /v1/hmara/execute-node`

Locked from H0; CONTINUUM submits to H-MARA via Vibely's DAG executor.

**Request:**

```jsonc
POST /v1/hmara/execute-node
Authorization: Bearer <jwt with tenant claim>
traceparent: 00-<trace_id>-<span_id>-01
Content-Type: application/json

{
  "node_id": "vibely-dag-node-uuid",         // for callback correlation
  "tenant_id": "acme-corp",                   // multi-tenant scoping
  "intent": "Fix the SQL injection in users.go:142",
  "context_query": {
    "search_terms": ["users.go", "sql injection", "parameterized query"],
    "max_observations": 50
  },
  "escalation_reason": "security",
  "budget": {
    "max_mcts_nodes": 10000,
    "max_wall_time_seconds": 300,
    "max_compute_usd_cents": 50
  },
  "callback_url": "https://vibely.example.com/hmara/result",
  "callback_secret": "<hmac key>"
}
```

**Immediate response:**

```jsonc
HTTP/1.1 202 Accepted
{
  "execution_id": "hmara-uuid",
  "estimated_wall_time_seconds": 180,
  "queue_position": 0,
  "status_url": "/v1/hmara/executions/<id>"
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

---

## Four-outcome contract

| outcome | Meaning | CONTINUUM action |
|---|---|---|
| `verified` | Patch proven; witness valid | Verify witness; dissolve todo; record observation type `hmara_witness` |
| `rejected` | Skeptic broke every Proponent patch | Update todo status to `blocked`; record `hmara_rejected` with exploit list |
| `inconclusive` | Variance didn't converge within budget | Update todo to `in_progress`; record `hmara_inconclusive` with best-partial-AST |
| `budget_exceeded` | Cost cap hit before convergence | Update todo to `blocked`; record `hmara_budget_exceeded` |

No new outcome types added without a contract bump.

---

## Statelessness commitment

H-MARA holds **no persistent state**. After each `execute-node` call:

- MCTS tree is discarded
- Agent context is discarded
- Search history is discarded

The only persistent record is the observation H-MARA writes back to
CONTINUUM via the callback (one of the four `hmara_*` types). This
matches the v0.2 enhancement spec's "no redundant caching" rule from
the consolidated vision document.

---

## DEC pipeline contract (Phase H4)

H-MARA's De-Biasing Extraction Compiler runs BEFORE the MCTS sees
the intent. It must:

1. Receive the raw intent + CONTINUUM-retrieved context
2. Strip rhetorical noise (Semantic Firewall)
3. Translate subjective constraints to mathematical bounds
4. Apply differential privacy to PII-bearing observations BEFORE the
   agents see them (synthetic proxies)
5. Map proxies back to real values at the final output stage

**CONTINUUM's privacy filter runs at write-time** (11 named patterns +
optional entropy detector). Observations H-MARA reads are ALREADY
scrubbed of named secrets. DEC focuses on de-biasing + DP for un-
scrubbed sources (raw user prompts, intermediate agent outputs).

---

## CONTINUUM-side changes (when Phase H1 lands)

Minimal surface area, all gated by env var. Same opt-in pattern as
the RVM bridge:

| Change | File | Behavior |
|---|---|---|
| Add `verifyMode: 'hmara-witness'` to `CreateTodoInput` | `packages/core/src/storage.ts` | Existing todos unaffected; opt-in per todo |
| Route witness-mode todos to H-MARA endpoint | `packages/cli/src/index.ts` | `continuum verify` calls `CONTINUUM_HMARA_URL` if set |
| Observation types `hmara_witness` / `hmara_rejected` / `hmara_inconclusive` / `hmara_budget_exceeded` | `packages/core/src/types.ts` | New SourceType enum values |
| Env var `CONTINUUM_HMARA_URL` | (env) | Unset = no H-MARA path; set = available |
| Env var `CONTINUUM_HMARA_AUTH_TOKEN` | (env) | Shared secret OR same OIDC JWT (W24-2) — operator chooses |

---

## Cost / footprint estimates (honest)

Speculative — based on the vision spec's claims, not measurements.

| Component | Memory (per execution) | Wall time (per execution) | Notes |
|---|---|---|---|
| MCTS tree (10k nodes) | ~50MB | varies by budget | Discarded after each call |
| Proponent + Skeptic LLM context | ~1-2GB GPU OR cloud API | seconds-to-minutes | Phase H2 |
| Tier-1 quantised critic | ~500MB | <10ms per node | Phase H2 |
| Tier-2 RVM detonation | <10µs partition + AST compile | seconds | Phase H3 |
| DEC pipeline | minimal | <100ms | Phase H4 |
| **Cluster size for production** | ~16GB GPU node per concurrent execution | — | Phase H5 capacity planning |

---

## What we are NOT building (P5 — the rule binds its keeper)

- **No H-MARA work during SPRINT-W24.** Current sprint is HTTP polish
  (W24-1 ✅, W24-2 ✅, W24-3 next).
- **No bypass of the dependency chain.** Phase H3 cannot start until
  RVM-BUILD-MAP Phase R2 is complete.
- **No latent-space recursion** until local inference exposing hidden
  states is available (Issue #3).
- **No mandatory H-MARA dependency for CONTINUUM operators.** Journey
  3's zero-config promise survives.
- **No replacement of `continuum verify`.** H-MARA witness mode is
  an additional path, not a replacement for shell-exit-code (which
  has shipped and works today).

---

## Honest non-claims (P4)

- **Zero H-MARA code exists** in any repo we have access to today.
  This entire document is roadmap.
- **The Tier-1 critic model is unselected.** "sub-2B value network"
  is a target size; the actual model is a Phase H2 decision.
- **MCTS-over-LLM via cloud APIs is incoherent** for the latent-space
  recursion path (B1) — documented in Issue #3 + `VISION/UNIFIED-
  ARCHITECTURE.md`. Phase H2 uses cloud APIs with text messaging
  between agents; Phase H4 requires local inference.
- **<10µs partition switch is unmeasured** for the Tier-2 path —
  inherits the same status from [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md).
- **Cost figures** (`compute_usd_cents`) presume a GPU fleet H-MARA
  controls. Not in our infrastructure today.
- **"Air-gapped" claim** is a target. Practical H-MARA Phase H2 will
  call cloud APIs (Anthropic, OpenAI) for the Proponent/Skeptic
  agents — air-gapping fully requires local inference (Phase H4).

---

## What it would take to start Phase H1 work

- ✅ This build map (delivered)
- ✅ [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md) Phase R1 design (delivered)
- ⏳ RVM Phase R2 complete (real partition detonation in QEMU)
- ⏳ Local inference path identified (Issue #3 — `ruvllm` or similar)
- ⏳ Operator authorization for an H-sprint (separate from current W24)
- ⏳ Decision: same monorepo (sibling directory) or sibling repo
- ⏳ GPU budget approved for Phase H2 (Tier-1 critic deployment)

None are in-flight today. Strictly roadmap.

---

## See also

- [`VIBELY-HANDOFF.md`](./VIBELY-HANDOFF.md) — Layer 2 integration (Vibely IS external; escalates to H-MARA)
- [`RVM-BUILD-MAP.md`](./RVM-BUILD-MAP.md) — Layer 0 (we own RVM too; H-MARA Phase H3 depends on RVM Phase R2)
- [`../VISION/UNIFIED-ARCHITECTURE.md`](../VISION/UNIFIED-ARCHITECTURE.md) §"v0.2 H-MARA enhancements" — the 5-bucket spec already filed
- [`../H-MARA-CONTINUUM/H-MARA-INTEGRATION-PLAN.md`](../H-MARA-CONTINUUM/H-MARA-INTEGRATION-PLAN.md) — earlier v0.1 planning doc
- [`../V0.5-HYBRID.md`](../V0.5-HYBRID.md) — current memory layer H-MARA will read from
- [`../UX-JOURNEYS.md`](../UX-JOURNEYS.md) §"Journey 3 (Solo Developer)" — the zero-config promise H-MARA integration MUST preserve

---

_Bound by The Nine v0.1.0._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
