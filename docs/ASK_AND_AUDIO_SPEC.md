# Ask-Your-Knowledge + Hear-It-Back — Spec (the #1 + #2 slice)

> **Audience:** the CONTINUUM build. **Status:** spec · 2026-07-11 · grounded in *this
> repo's* real primitives (P4 — verified, not assumed).
> **One line:** *ask your local knowledge anything (cited), and hear the recap in ARIAN's
> voice — with zero network egress.* The two NotebookLM features you'd leave the building
> for, running on your own machine.

---

## 0. Substrate — verified, honest (partner clause #1)

This spec targets **CONTINUUM's actual code**, not VoiceCosmos infra:

| Need | CONTINUUM primitive | Status |
|---|---|---|
| keyword retrieval | `storage.searchObservations(query, limit)` → `SearchHit[]` (FTS5) | ✅ working |
| semantic retrieval | RuVector + MiniLM-L6-v2 (384-dim) via `HybridStorageBackend`; `SearchHit.score` already reserves "FTS5 + (V0.5+) vector fusion" | ⚠️ stub (opt-in `CONTINUUM_STORAGE_BACKEND=hybrid`) |
| fetch full content | `continuum_get_observations(ids)` (Layer-3 Progressive Disclosure) | ✅ |
| the recap text | `continuum_get_digest` | ✅ |
| the voice | supertonic, local — `apps/console/app/api/tts/route.ts` (`supertonic serve` → `/v1/audio/speech`, wav) | ✅ |

> **`rag-engine.ts` / `pgvector` / `VoxCPM2` are VoiceCosmos, not here.** If the intent is
> for CONTINUUM to *call* VoiceCosmos's `rag-engine` as an external RAG service, that's the
> **§A4 bridge option** below — explicit, opt-in, and clearly a cross-repo dependency. The
> default spec keeps everything native + local.

---

## Part A — Ask your knowledge (Hybrid Search + Ask)

### A1. The retrieval path (already real)
```
query
  → storage.searchObservations(q, k)         # Layer-1 index: FTS5 now, +RuVector fusion (upgrade)
  → rank + filter (source · type · tier · sprint/date)
  → continuum_get_observations(topIds)        # Layer-3: pull full content only for the hits
  → grounded context bundle (with Observation IDs)
```
No new storage. FTS5 works today; the semantic upgrade is *turning on* the RuVector hybrid
(the seam is `openStorage`), not building a new index. Hybrid = fuse FTS5 rank + vector
cosine into `SearchHit.score` (the field already exists for exactly this).

### A2. The Ask (RAG answer, model-agnostic)
```
retrieved context + question
  → the connected model (Claude / …) OR a configured local model (Ollama)
  → answer WITH inline citations = Observation IDs
  → each citation carries its TRUST TIER (proven · authored · reference · claimed)
```
The model is **not** CONTINUUM's — it's the caller's (BYO-model / local for max privacy).
CONTINUUM supplies the *grounded, cited, tiered context*; the model composes the prose.

### A3. The Ask UI (the console center column)
A conversational surface (`/ask`, or the existing Chat) that:
- takes a question → calls **`/api/ask`** (new route)
- `/api/ask` = MCP `searchObservations` → `get_observations` over SSE (same client the
  Board/Timeline routes already use), then hands the bundle to the model
- renders the answer with **hover-cited nodes** — each citation is a grounded window
  (summary-in-relation · edge-role · tier · source), per the "one graph, four layouts" law
- filters: source · type · trust-tier · sprint. Cheap. Local. Cited.

### A4. (Option) Bridge to VoiceCosmos `rag-engine`
If you want CONTINUUM to query VoiceCosmos's proven pgvector RAG instead of/alongside its
own: add a `RagBackend` adapter behind the same retrieval interface (`retrieve(q) →
Hit[]`), configured by URL + token, called server-side from `/api/ask`. **Opt-in, clearly a
cross-repo dependency, egress to your own box only.** Default stays native RuVector.

---

## Part B — Hear it back (the audio recap)

### B1. v1 — the session recap (low-hanging fruit)
```
session end (or on demand)
  → continuum_get_digest                     # the "what we did" text (exists)
  → POST /api/tts { text }                    # supertonic, local (exists)
  → ARIAN speaks it · downloadable wav        # zero egress
```
Trigger: a `SessionEnd` hook (or a `continuum recap` CLI / an ARIAN "recap" button). This
turns a standard utility into a **daily ambient ritual** — hear where you landed while you
make coffee. Almost entirely wiring of parts that already exist.

### B2. v2 — the Audio Overview (two-host debate) → delegate to Pod-geni (upsell)
Your preferred format: **two hosts discussing a document's core concept + the questions
around it.** CONTINUUM does **not** rebuild podcast production — that's **Pod-geni.com**
(your own product). CONTINUUM is the SOURCE; Pod-geni is the PRODUCER:
```
a document / cluster (a Brain isolation)
  → CONTINUUM produces the "podcast source package":
      a two-host SCRIPT/brief (Host A explains the core concept, Host B probes with
      questions — questions can come from session_review), grounded + cited, each point
      carrying its TRUST TIER
  → [publish-gate] → send to Pod-geni (creator capacity) → produces the audio
  → the finished podcast returns as a linked artifact node (provenance = the source doc)
```
This makes **Pod-geni a third consumer of the Brain** (you-via-ARIAN · AMF factory ·
Pod-geni) through the same gated "send to" seam — and a fair **open-core upsell**: the trust
core stays free; the rich podcast output routes to your own product, value in-house.

> **⚠️ Egress (P4).** Pod-geni.com is hosted — sending the source package **leaves the
> machine**, breaking the zero-egress promise for *this* output (same shape as Gemini /
> send-to-AMF). So it is **opt-in**, **publish-gated** (only cleared docs, never
> private/secret), and **tier-aware** (two confident hosts must not launder a `claimed`
> point into sounding `proven`). Max-privacy clients get the fully-local read-aloud (B1) or
> a self-hosted Pod-geni.

**The honest tiering:** local read-aloud recap = **free + sovereign (0 egress)**; two-host
podcast = **Pod-geni upsell (explicit, gated egress)**.

### B3. Zero-egress guarantee (visible)
Both paths run on `supertonic serve` locally — **0 bytes leave the machine.** Surface it: a
"local voice · 0 bytes egress" indicator (the privacy moat, made visible).

---

## Part C — The visual outputs (priority + the layout law)

Per your ordering, the render/output work is **1) mindmap · 2) infographic · 3) audio
overview** — and per the "one graph, four layouts" unification, the visuals are **not renders
but layouts of a Brain isolation:**
- **Mindmap** = isolate the doc's subgraph + tree layout (mermaid mindmap exists; make it
  auto + clickable + toggle to Universal).
- **Infographic** = the same isolation, styled panels (external *styling* call, publish-gated).
- **Audio overview** = Part B2.

*Video is out of scope for now — and when it returns it's best applied to a mindmap
(concept + scenes), later.* These visuals are specced in `SYSTEM_ARCHITECTURE.md §9`
(layout-pipeline); this doc owns Ask + Audio.

---

## Build order (each phase ends with its verifyCommand — dogfood)

1. **`/api/ask` + retrieval** — FTS5 `searchObservations` → `get_observations`, cited bundle.
   `verify:` a query returns hits with Observation IDs + tiers.
2. **Ask UI** — conversational surface, hover-cited answers, filters.
   `verify:` ask a question in the console → cited answer renders.
3. **Audio recap v1** — `get_digest` → `/api/tts` → wav; SessionEnd trigger.
   `verify:` end a session → a spoken recap wav is produced locally.
4. **Semantic upgrade** — flip `HybridStorageBackend` on; fuse vector into `SearchHit.score`.
   `verify:` a semantically-related (non-keyword) query surfaces the right node.
5. **Audio Overview v2 (→ Pod-geni)** — CONTINUUM emits the cited, tier-aware two-host
   source package + the **publish-gated send-to-Pod-geni** seam (not a built-in stitch).
   `verify:` a *cleared* doc → a source package with citations + tiers; a *private* doc is
   **refused at the gate**.
6. *(option)* **rag-engine bridge** — `RagBackend` adapter behind `/api/ask`.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
