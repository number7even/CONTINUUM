# CONTINUUM — Market & Differentiation

> **Status:** 2026-07-06 · Launch doc 03 · Technical market analysis + positioning.
> **Discipline:** competitor claims verified via web (mid-2026); CONTINUUM's side is
> grounded **strictly in this repo** (P4 — "never claim more than you can verify").
> Tags: ✅ verified in code today · 🟡 built-but-gated / partial · 🔮 roadmap / aspirational.
> This doc mirrors the honesty ledger in [`../AMF_ENGINE_MAP.md`](../AMF_ENGINE_MAP.md)
> ("Vision vs. Verified Gap"). The § "5 Honest Corrections" is the guardrail the
> content plan must not cross.

---

## THE SPINE — The Nine as the human-agent trust protocol

**This is the category CONTINUUM owns, and the frame every claim below inherits.**

The Nine ([`../../AGENTS.md`](../../AGENTS.md), schema v0.1.0 · canonical at
[thenine.foundation](https://thenine.foundation)) is not "agent instructions." It is a
**bidirectional trust protocol** — it binds the human and the agent to the *same*
standard (P5: *the rule binds its keeper*). That reframes the whole market:

- Competitors sell **AI memory** (a feature). CONTINUUM sells the **verifiable trust
  fabric for human-agent collaboration** (a category). The former is a spec-sheet fight
  over recall %; the latter is *risk removal + accountability* — an ownable moat.
- The relationship is a **disciplined asymmetry**: human and agent are *symmetric*
  under the demands of proof and least privilege (P1/P2), and the asymmetry stays
  strictly at the point of decision — the agent authenticates and proposes; the
  trust-leap to accept and deploy is exclusively the human's (**P9**).
- This is why "proof-gated memory" (§2) is not just a technical edge — it is P2/P4 made
  physical: *prove, don't grant; never claim more than you can verify.* The moat and the
  ethic are the same artifact.

| Principle | In force across **both** human ↔ agent |
|---|---|
| P1 minimize the secret · P2 prove don't grant | Human & agent are **symmetric principals** under one claims/proof model — no implicit human trust. |
| P4 never claim more than you can verify | Binds the founder too: the content plan (doc 04) is a *verifiable ledger of progress*, not marketing. |
| P6 endable · P7 freely chosen · P8 no trap | The **customer** relationship: local-first, exportable, no lock-in, no dark patterns. |
| P9 the leap is the human's | The deploy decision never leaves the human — the durable asymmetry. |

**Positioning consequence:** lead with the **trust axis** — *"the memory that refuses to
lie"* — not the token number (see the competitive-weakness note: no recall benchmark yet).
Every asset links to [thenine.foundation](https://thenine.foundation) — the open canon both
sides answer to (P7 in action).

---

## 0. The one-line frame

The AI-memory market is a **recall-accuracy race** — everyone competes on *"how much
of the past can we fetch back, and how cheaply?"* (benchmarks: LoCoMo, LongMemEval,
DMR, BEAM). CONTINUUM is not primarily in that race. Its wedge is a **different axis
nobody else occupies: proof-gated memory** — *a fact does not become "done/true" until
a `verifyCommand` (or witness) passes.* Memory that **refuses to lie** rather than memory
that merely remembers more.

That axis is a genuine open lane (the competitor sweep below confirms **0 of 7** rivals
have write-time verification), but the recall-accuracy incumbents are far ahead on
scale, funding, and benchmarks. This doc holds both truths.

---

## 1. The Market — the AI-agent memory/context landscape (mid-2026)

A crowded, well-funded field. All players are **hybrid stores** (some mix of vector +
graph + relational) doing *extract → store → retrieve*, and increasingly all ship an
**MCP server**. MCP-native is now table stakes, not a differentiator.

| Player | One-line | Persistence approach |
|---|---|---|
| **Mem0** (`mem0.ai`) | OSS "memory layer" for LLM agents; personalized long-term memory | Hybrid: vector + graph (Neo4j/Neptune) + KV; auto-extracts facts; hybrid retrieval (semantic + BM25 + entity). Apache-2.0 core + Cloud SaaS. Ships **OpenMemory MCP** (local). |
| **Letta** (ex-MemGPT) | OSS platform for stateful agents; OS-style self-editing memory | Tiered hierarchy (core / recall / archival) — LLM pages + self-edits memory via tool calls. Postgres + pgvector. Apache-2.0 + cloud. |
| **Zep / Graphiti** | Hosted agent-memory service (Zep) on an OSS temporal-graph engine (Graphiti) | **Bi-temporal knowledge graph** (event-time + ingestion-time, edge validity windows) + vector + keyword. Graphiti Apache-2.0 (Neo4j/FalkorDB/Kuzu/Neptune); Zep Cloud proprietary. |
| **Cognee** | OSS AI-memory platform; self-hosted KG engine | **ECL pipeline** (Extract→Cognify→Load) → unified relational + vector + graph from 38+ source types. Apache-2.0 core; cloud in build-out. Ships `cognee-mcp`. |
| **LangMem / LangGraph memory** | LangChain SDK adding long-term memory to LangGraph agents | Pluggable `BaseStore` (InMemory dev / Postgres+pgvector prod); semantic / episodic / procedural memory; short-term (thread) vs long-term (cross-thread). MIT + hosted Platform. `/mcp` endpoint. |
| **Supermemory** (`supermemory.ai`) | Universal memory/context API; serves relevant memory to any LLM | "Vector graph engine" — ontology-aware edges + hybrid vector/keyword; auto-forgets + resolves contradictions. MIT (~28k★) + SaaS; offline local mode. Ships MCP server. |
| **MCP memory servers** | The reference `@modelcontextprotocol/server-memory` + community forks | Official: local **knowledge graph → single JSONL file** (entities/relations/observations). Community: vector-based (SQLite-vec, Qdrant, markdown). Official MIT, single-user, no auth. |

**Traction context (why we respect them):** LangChain ~$1.25B valuation ($125M Series B);
Mem0 ~$24M + 41k★ / 14M downloads; Cognee $7.5M seed; Supermemory ~$29M; Zep YC+Bessemer;
Letta $10M seed (YC / Berkeley Sky Lab). This is not a sleepy category.

**The recall numbers they publish** (verified, for honest comparison — NOT ours to claim):
Mem0 ~90% token reduction + LongMemEval 94.8 (Apr-2026); Zep +18.5% accuracy / ~90%
latency cut vs full-context (arXiv 2501.13956); Supermemory #1 LongMemEval 81.6% (but its
token-savings claim is internally inconsistent — ~90% on X vs "up to 70%" in docs; treat
as soft). CONTINUUM has **no LoCoMo/LongMemEval number** — see § Honest Corrections.

---

## 2. Differentiation Matrix

Columns are the six load-bearing dimensions. CONTINUUM's cells are tagged by evidence
tier and are grounded in this repo; competitor cells reflect the verified web sweep.

| Dimension | Mem0 | Letta | Zep/Graphiti | Cognee | LangMem | **CONTINUUM** |
|---|---|---|---|---|---|---|
| **Verified / proof-gated memory** (no "done" without a passing check) | ❌ none | ❌ LLM self-edits | ❌ none | ❌ none | ❌ none | ✅ **`verifyCommand` + witness chain** — todos close only on a passing verify; checkpoints seal an `active/dormant/broken` state with a tamper hash |
| **Multi-source aggregation** | 🟡 conversational facts | 🟡 agent memory tiers | 🟡 ingested episodes | ✅ 38+ source types → KG | 🟡 agent memory | ✅ **5 sources into one graph**: code symbols · git · docs · concepts · memory (the brain renders all five) |
| **Token-efficiency claim** | ✅ ~90% (LOCOMO, published) | ❌ none published | ✅ ~90% latency (paper) | ❌ none | ❌ none | 🟡 **measured ~2.85x** (up to 5.3x single-record), reproducible: `scripts/benchmark-token-savings.mjs`. Modest but **honest + reproducible** |
| **Local-first** | ✅ (OpenMemory) | ✅ self-host | 🟡 Graphiti self-host / Zep cloud | ✅ self-host-first | ✅ Postgres self-host | ✅ **SQLite + FTS5, zero external services** — runs as a local stdio subprocess, nothing leaves the machine |
| **MCP-native** | ✅ | ✅ | ✅ (experimental) | ✅ | ✅ (`/mcp`) | ✅ **MCP-first by design**: ~14 tools + 4 resources + 2 prompts, stdio **and** HTTP/SSE, Bearer-auth |
| **Governance model** | ❌ none | ❌ none | ❌ none | ❌ none | ❌ none | ✅ **THE NINE (P1–P9)** — every source file bound to `AGENTS.md`; P4 honesty + P9 human-leap are structural, not marketing |
| **Tenancy / RBAC** | 🟡 user/session scoping | ✅ orgs/users/perms | 🟡 graph namespaces | 🟡 claimed, unverified | 🟡 namespaces | 🟡 **path-safe tenant isolation** (`tenant.ts`, JWT claim + `X-Continuum-Project` routing, per-tenant DB) — real in code, but **filesystem-isolation, not a hosted fleet** |

### Where CONTINUUM leads (✅)
1. **Only proof-gated memory in the field.** 0/7 competitors verify at write time. This is the category.
2. **Widest *dev-context* aggregation** — code + git + docs + concepts + memory in one navigable graph, not just conversational facts.
3. **Governance as architecture** — THE NINE is enforced per-file; no rival ships an ethics/verification binding at all.

### Where CONTINUUM is behind (be honest)
1. **No hosted SaaS.** Multi-tenant fleet + billing + OAuth is **V2 roadmap** 🔮. Rivals have live cloud today.
2. **RuVector is a stub / SQLite-only reality.** The "unified self-learning persistence" story is 🔮; what ships is SQLite+FTS5 (the Chroma dual-store in old arch docs was **never built**). The learned-relevance moat competitors approximate is not yet real here.
3. **No accuracy benchmark.** No LoCoMo/LongMemEval/DMR score. Our 2.85x is a *token* number, not a *recall* number — different axis, weaker headline.
4. **Adapter breadth.** Shipped adapters: docs · git · export · remote-git (+ concepts/graph in core). The `mem` and `sona` feedback adapters are **V0.5** 🔮 — so "5 sources" is the design and the brain's render surface, with two source-feeds still to land.
5. **Traction asymmetry.** Solo-founder OSS vs $10M–$1.25B-backed teams. We win on discipline, not headcount.

---

## 3. Monetization / Positioning Thesis

### The category we own (one sentence)
**CONTINUUM is the memory that refuses to lie** — proof-gated project memory where nothing
is "done" until a verify passes, and every state snapshot is a tamper-evident witness, not a vibe.

Everyone else optimizes *recall*. We are the only one optimizing *trust*. When the buyer's
pain is "my AI confidently told me something we never did" (the exact 4-month wound this repo
was born from), recall-accuracy leaders don't answer it — **verification does.**

### Three customers, one engine (grounded in README §"Three customers")
| Customer | What they get | Commercial surface |
|---|---|---|
| **1. Us (dogfood)** ✅ | The VoiceCosmos/AMF dev team — memory time-theft killed; the engine's own checkpoints prove it works | $0 (the demo *is* the dogfood) |
| **2. OSS solo founders / small teams** ✅ (shipping) | Apache-2.0 CLI + MCP server; local-first, zero-config | **Free OSS** → paid **hosted engine** upsell |
| **3. VoiceCosmos hotel tenants** 🟡→🔮 | Same engine, tenant-scoped, embedded in ARIA ("the Voice OS that knows the property") | **SaaS seats + AaaS** (memory-as-a-service, per-tenant) |

### Pricing surface hypotheses (tied to *real* capabilities, not fantasy)
- **OSS Core — $0** ✅. Apache-2.0 CLI + stdio MCP server. Drives adoption; Apache license
  chosen precisely so it embeds everywhere (README §License). The funnel, not the revenue.
- **Hosted Engine — subscription** 🟡. `continuum serve` (HTTP/SSE + Bearer auth) exists in
  code **today**; the paid wrapper is managed hosting + backups + the 3D "brain" console.
  Sellable the moment the Fly/Vercel deploy hardens (already live at `continuum-engine.fly.dev`).
- **Tenant seats / AaaS — per-tenant metered** 🔮. `tenant.ts` isolation + `X-Continuum-Project`
  routing are the technical seam; billing/OAuth/fleet are V2. Price per active tenant workspace.
- **Governance / verified-audit tier** 🔮 (the real premium lane). Enterprises that need
  *"prove what the AI knew and when"* pay for the witness chain + audit log as a compliance
  artifact. This is where "refuses to lie" becomes a line item.

### The durable moat (vs the market)
- **Not** raw recall — the funded incumbents will out-benchmark a solo project on LoCoMo.
- **Is** the **proof discipline + governance binding**: verify-then-dissolve, the tamper-evident
  checkpoint chain, and THE NINE. These are *architectural commitments competitors would have to
  retrofit against their own "store whatever the agent asserts" design.* A recall engine can add a
  bigger index next quarter; it cannot cheaply become honest-by-construction.
- **Reinforced by** the 5-source *dev-native* graph (code+git+docs+concepts+memory) — competitors
  aggregate *conversation*; CONTINUUM aggregates *the project*. The 3D brain + `/api/ask` (answers
  fly the camera to the exact cited node IDs — P2 "prove, don't grant") is the visible proof of that moat.

---

## 4. The 5 Honest Corrections (marketing → verified)

Mirrors AMF_ENGINE_MAP's "odometer" discipline. These are claims the content plan **must not make** — with the true version.

1. **DON'T say "90% token savings" / "10x."** ❌ Those are *competitors'* numbers (Mem0/Supermemory) on a different measurement.
   **TRUE (🟡):** progressive disclosure yields a **measured ~2.85x** retrieval-token reduction (up to 5.3x single-record), reproducible via `scripts/benchmark-token-savings.mjs` (README:98). Own the honesty of a reproducible number, not the size of an unbacked one.

2. **DON'T say "self-learning memory that gets smarter over time."** ❌ That's the RuVector/GNN vision.
   **TRUE (🔮 / ✅):** storage today is **SQLite + FTS5**, static relevance. RuVector is a stub (`ruvector@0.2.25` is vector-first, not the unified engine the arch assumed — ARCHITECTURE.md §10b warning). The learning loop is real only in the *AMF consumer's* ranking feedback, not the core memory engine.

3. **DON'T say "hosted multi-tenant SaaS" / "team workspaces" as if live.** ❌ V2 roadmap.
   **TRUE (🟡):** what exists is **path-safe per-tenant filesystem isolation** (`tenant.ts`, JWT + `X-Continuum-Project`) and a live single-engine HTTP deploy. Billing, OAuth, and a multi-tenant fleet are unbuilt.

4. **DON'T say "aggregates 5 sources" without qualification.** ❌ Implies 5 live ingest adapters.
   **TRUE (✅ / 🔮):** the brain **renders** 5 source types (code·git·docs·concepts·memory) and adapters ship for **docs·git·export·remote-git**; the `mem` and `sona` feedback adapters are **V0.5**. Say "unifies five kinds of project truth into one graph," not "five running feeds."

5. **DON'T say "verified/proof-gated" as a vague virtue.** ❌ It's specific or it's marketing.
   **TRUE (✅):** the claim is exact — a **todo does not close until its `verifyCommand` exits 0**, and a checkpoint **seals an `active/dormant/broken` snapshot with a tamper-evident hash** (proven end-to-end: row `81223c05…`, README §Status). Cite the mechanism, never the adjective alone (P4).

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
