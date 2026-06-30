# AI Guest Bot — CONTINUUM-Grounded Contract (the shared seam)

> **Audience:** both terminals — the **Pod-Geni** team (owns the orchestrator +
> `/v1/sessions/start` dispatch) and the **CONTINUUM/AMF** team (owns the corpus + the
> honesty gate). Build the bot **once**, to this contract, so it grounds on CONTINUUM and
> either product can run it.
>
> **Status:** spec (the bot runtime is net-new — `AI_GUEST_BOT_URL` is currently unset).
> **Honest scope (P4):** groundedness here is *retrieval-based* — "traceable to an
> Observation," not a semantic truth-judge. It tightens when vector retrieval is exposed
> (V0.5 hybrid backend); the seam below does not change when it does.

---

## 0. The principle

The bot is a **conversational shell** with a **swappable grounding brain**. The shell
(join call → STT → LLM → TTS → speak) is product-agnostic. The brain is a `CorpusAdapter`.
Pod-Geni ships a default adapter (its own corpus); CONTINUUM ships one backed by a tenant's
Observations + the Brand Kernel gate. **Same shell, same contract, different adapter.**

```
 Daily room ─┬─► [STT: Deepgram] ─► finalized user turn
             │                          │
             │            ┌─────────────▼──────────────┐
             │            │  CorpusAdapter.retrieve()   │  (grounding context, cited)
             │            └─────────────┬──────────────┘
             │                          ▼
             │            [LLM: persona + grounding + history] ─► answer + cited claims
             │                          │
             │            ┌─────────────▼──────────────┐
             │            │ CorpusAdapter.checkClaims() │  (async — flag ungrounded)
             │            └─────────────┬──────────────┘
             │                          ▼
             └──────────◄─ [TTS: VoxCPM2] ◄─ answer text
                          │
                          └─► transcript: role:'ai_guest' (+ citations, + flags)
```

## 1. The `CorpusAdapter` interface (the swap point)

Both products implement this; the bot depends only on it.

```ts
interface GroundedPassage {
  observationId: string;   // stable citation handle
  text: string;            // the passage the bot may use
  score: number;           // retrieval confidence (higher = better)
  source?: string;         // 'git' | 'docs' | 'brand' | ... (provenance)
}

interface ClaimVerdict {
  claim: string;
  grounded: boolean;       // traceable to a corpus passage above threshold?
  supportingIds: string[]; // Observation IDs that support it (empty if ungrounded)
  score: number;
}

interface CorpusAdapter {
  /** PRIMARY seam — the function the Pod-Geni worker already calls at session start.
   *  Reconciled 2026-06-29 with Pod-Geni's built `load_corpus(corpus_ref)`: the worker
   *  depends ONLY on this shape, so the CONTINUUM swap is a drop-in (not a rewrite).
   *  `research` is assembled from cited Observations; each carries its observationId. */
  loadCorpus(corpusRef: CorpusRef): Promise<{
    title: string;
    research: GroundedPassage[];   // cited grounding context
    topics: string[];
    preparedQuestions: string[];
  }>;

  /** CONTINUUM-side enrichments (the AMF fork adds these; the base worker loads once).
   *  Per-turn retrieval when the loaded corpus is insufficient. */
  retrieve(query: string, k: number): Promise<GroundedPassage[]>;

  /** Post-turn / post-session: flag AI claims not traceable to the corpus. Routes to
   *  continuum_check_brand / verified_facts (replaces the static AiUngroundedClaim store). */
  checkClaims(claims: string[]): Promise<ClaimVerdict[]>;
}
```

> **Interface reconciliation (2026-06-29):** Pod-Geni's worker calls one function,
> `load_corpus(corpus_ref) → {title, research, topics, preparedQuestions}`. That is the
> contract's `loadCorpus`. The earlier `prime()` is the same idea with a thinner return —
> folded into `loadCorpus`. `retrieve()` / `checkClaims()` are CONTINUUM-side add-ons beyond
> the base load-once model. `scripts/ai-guest-corpus-smoke.mjs` proves the retrieval
> primitives `loadCorpus` is assembled from (search → cited passages → claim-check).

### 1a. `ContinuumCorpusAdapter` (CONTINUUM/AMF owns)

Backed by the shipped MCP tools against a tenant-scoped engine connection:

| Adapter method | CONTINUUM call | Notes |
|---|---|---|
| `loadCorpus(ref)` | `continuum_search_docs(topic, k)` → `continuum_get_observations(ids)`; assemble `research` from cited passages; derive `topics` / `preparedQuestions` | the worker's session-start call (= Pod-Geni `load_corpus`) |
| `retrieve(q,k)` | `continuum_search_docs(q, k)` (+ `get_observations` for the winners) | Layer-1 → Layer-3 on demand |
| `checkClaims(claims)` | per claim: `continuum_search_docs(claim, 3)`; `grounded = topScore ≥ THRESHOLD`; `supportingIds = hit ids`. Optionally `continuum_check_brand(claim)` to also catch **promise/position contradictions**. | retrieval-grounded now; semantic when vector search is exposed |

Connection: `CONTINUUM_HTTP_URL` + tenant `CONTINUUM_HTTP_TOKEN` (one tenant = one brand's
corpus). The `corpusRef` in the session contract (§2) carries the tenant.

> **Build gotcha (proven in `scripts/ai-guest-corpus-smoke.mjs`):** `continuum_search_docs`
> passes the query **straight to FTS5 MATCH**. Natural-language input breaks it two ways —
> punctuation throws (`syntax error near "."`) and implicit-AND under-recalls. The adapter
> **must** convert NL → a quoted **OR-query** before calling it:
> `terms(text).map(t => '"'+t+'"').join(' OR ')`. Feed `search_docs` keywords, never raw
> sentences. (`continuum_check_brand` already sanitises internally, so claim-contradiction
> checks can take the raw claim.)

### 1b. `PodGeniCorpusAdapter` (Pod-Geni's existing default)
Wraps the current `corpusDocPath` grounding + `AiUngroundedClaim` flagging. Kept so AI
Guest works standalone; CONTINUUM is the preferred adapter for brand-honest grounding.

## 2. Session contract — `POST {AI_GUEST_BOT_URL}/v1/sessions/start`

Extends Pod-Geni's existing dispatch with an explicit `corpusRef` (replaces the bare
`corpusDocPath`, so grounding can be CONTINUUM-backed):

```jsonc
// request
{
  "sessionId": "string",
  "podcastId": "string",
  "roomUrl": "https://<daily-room>",
  "mode": "interviewer" | "guest",     // Pod-Geni-added: AI-interviews-human (default) | AI-as-guest
  "voiceProfileId": "string",          // resolves the VoxCPM2 voice (standardised stack)
  "persona": "string",                 // e.g. "Sharp and skeptical Series-B VC"
  "corpusRef": {
    "adapter": "continuum" | "podgeni",
    "tenant": "brand-riaan",           // continuum: tenant id (the corpus)
    "docPath": null                    // podgeni: legacy corpusDocPath
  },
  "grounding": {
    "threshold": 0.0,                  // min retrieval score to count as "grounded"
    "primeTopic": "string",            // warm-up topic for loadCorpus()
    "primeK": 12,
    "checkMode": "per_turn" | "post_session"  // when to run checkClaims()
  },
  "callbackUrl": "string"              // bot → orchestrator status/events
}

// 202 response
{ "sessionId": "string", "state": "joining", "botParticipantId": "string" }
```

**Secrets are NEVER in this payload** (P1): the bot reads `CONTINUUM_HTTP_TOKEN`,
`DAILY_API_KEY`, `DEEPGRAM_API_KEY`, the TTS backend secrets, and the LLM key from its own
environment. **Voice: VoxCPM2 48kHz (Apache-2.0)** — this is the **live / sovereign** path
(AI-Guest, Pod-Geni). It is NOT a one-stack-for-everything rule: the AMF **scripted-content**
pipeline uses **Cartesia (Sonic-2)** as its proven content voice. Two paths, two engines, each
behind its own abstraction (corrected 2026-06-30 vs the earlier "standardise on VoxCPM2").

VoxCPM2 has **two interchangeable hosting backends, selected by `TTS_BACKEND`** (the bot
abstracts both behind one TTSService; the session contract above is unchanged either way):

- **`fal` — serverless (recommended, 2026-06-29).** VoxCPM2 deployed as a fal.ai app
  (`ai-guest-bot/voxcpm2-fal`, `<user>/voxcpm2-tts`); the bot calls it via `fal_client`. Env:
  `FAL_KEY`, `FAL_VOXCPM_APP`. fal provisions the GPU + autoscales — no box to run, no
  `VOXCPM2_URL` to keep alive. **The AMF fork uses this too** (one fal app can serve both
  products).
- **`http` — self-hosted.** VoxCPM2 behind a `/v1/tts` server (`ai-guest-bot/voxcpm2-server`)
  on your own GPU host (GCP GPU VM / RunPod). Env: `VOXCPM2_URL`, `VOXCPM2_API_KEY` (the
  worker's original names, still valid).

Lifecycle events to `callbackUrl`: `joined`, `turn` (each AI turn + citations + flags),
`left`, `error`.

## 3. The STT → LLM → TTS turn loop (latency-budgeted)

Real-time conversation needs the loop tight. Target **< 1.2s** from user-stop to bot-speech-start.

1. **STT (Deepgram, streaming).** VAD + endpointing detect end-of-user-turn. Use interim
   results to *pre-warm* retrieval; commit on the finalized transcript.
2. **Ground (mostly free).** Answer from the **primed** context (loaded at `sessions/start`).
   Only call `retrieve()` when the turn clearly leaves the primed topic — that network hop
   is the main latency risk, so make it the exception, not the rule.
3. **LLM turn.** System prompt = persona + grounding rules (§4) + cited primed passages +
   recent transcript. Output: the spoken answer **plus the list of factual claims it made**
   (structured), each tagged with the `observationId`(s) it leaned on.
4. **TTS (VoxCPM2).** Stream the first sentence to audio while the rest generates. Backend
   matters for the budget: the **`http`** self-hosted server streams PCM (lowest first-audio
   latency); **`fal`** serverless is request→WAV→download (add a fal queue + transfer hop, so
   chunk per sentence and pipeline aggressively to stay under the < 1.2s target).
5. **Speak** into the Daily room. Handle **barge-in**: if the user starts talking, stop TTS
   and yield (the interviewer never talks over the host).
6. **Check (async, off the hot path).** Run `checkClaims()` per `grounding.checkMode`.
   `per_turn` = flag during the call (the bot can self-correct: "I should caveat that — I
   can't ground it"); `post_session` = Pod-Geni's current behaviour (flag in review).

**Turn-taking:** the bot is an *interviewer/co-host*, not a monologuist — short turns, one
question at a time, always yields to the host. Cap bot turn length; prefer a question over
a statement when grounding is thin.

## 4. The grounding prompt (the honesty rule, in the system prompt)

Non-negotiable instructions to the LLM:

- **Answer from the provided passages.** Each passage carries an `observationId`; when you
  assert a fact, it must trace to one.
- **If you cannot ground a claim, do not assert it.** Ask a question instead, or say plainly
  you can't speak to it. (This mirrors the brand `emotional_contract`: "what I claim is
  built or I tell you it isn't yet.")
- **Emit your factual claims as a structured list** with the `observationId`(s) each rests
  on, so `checkClaims()` can verify them. An empty `supportingIds` from the check = the turn
  gets flagged (and, in `per_turn` mode, the bot caveats it aloud).

This makes the live conversation obey the same **verify-then-dissolve** discipline as the
written content engine: a claim survives only while it's traceable to a verified Observation.

## 5. Transcript + citation schema

AI turns land on the same path as humans (`role:'ai_guest'`), enriched:

```jsonc
{
  "role": "ai_guest",
  "sessionId": "string",
  "text": "string",
  "tStart": 0.0, "tEnd": 0.0,              // for word-sync / later editing
  "citations": [{ "observationId": "string", "score": 0.0 }],
  "ungroundedFlags": [{ "claim": "string", "reason": "no traceable Observation" }]
}
```

Downstream (the content engine) reads this transcript as **capture** — the grounded,
flagged Q&A is higher-signal raw material than a solo monologue.

## 6. Acceptance smoke (verify-then-dissolve on the bot itself)

`node examples/ai-guest-smoke.mjs` → green when:
1. `sessions/start` with `corpusRef.adapter:'continuum', tenant:'brand-riaan'` → bot joins a
   Daily room (or a mock transport in CI).
2. A scripted host turn on a topic **in** the corpus → the bot answers **with ≥1 citation**
   (a real Observation ID from the tenant).
3. A scripted host turn on a topic **absent** from the corpus → the bot **refuses to assert**
   and `checkClaims()` flags any slip with `grounded:false`.
4. Barge-in mid-TTS → the bot stops within 300ms.
5. Every AI turn is emitted on the transcript path with `citations`/`ungroundedFlags` present.

## 7. Honest caveats (don't oversell)
- **Groundedness is retrieval-based** (keyword/FTS5 now; vector when the hybrid backend's
  search is exposed). It proves *traceability*, not *truth*. State that to stakeholders.
- **Latency is the real risk.** Pre-priming + async checks are how the loop stays < 1.2s;
  a naive per-turn MCP round-trip will feel laggy. Build the priming first.
- **The bot is net-new.** Unlike the VC avatar half, nothing here is proven yet — this spec
  is the contract to build to, not a description of working code.

---

_Spec by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
