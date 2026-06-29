# Handover Request — AI Guest Components (Pod-Geni → CONTINUUM/AMF)

> **From:** CONTINUUM / AMF content-engine track
> **To:** Pod-Geni team
> **Re:** Reuse the **AI Guest** conversational/voice/orchestration layer — and ground it
> on CONTINUUM instead of a second corpus.
> **Date:** 2026-06-29 · **Owner sign-off:** Riaan Kleynhans (P9 — voice/likeness consent is the human's)

---

## Cover note (paste-ready)

> Team — we want to reuse Pod-Geni's **AI Guest** feature as a richer *capture* mode for
> the content engine: instead of a solo walk-and-talk, an AI co-host **interviews Riaan**,
> grounded in his corpus, and the transcript feeds our hook/script pipeline.
>
> Per your own WORKS/STUB read: the **config, orchestration, transcript path, and
> corpus-grounded fact-check are built (✅)**; the **runtime bot (`AI_GUEST_BOT_URL`) is
> missing**. This doc asks for the proven pieces packaged for reuse, names the one
> decision (who builds the bot), and proposes the integration that avoids duplicate work:
> **the grounding corpus + fact-check should be CONTINUUM, not a parallel store.**
> Secrets go into our vault directly, never in this doc or a commit (P1).

---

## 1. Context (why we want it)

Our content engine turns long-form capture → short-form. A solo monologue is thin raw
material; an **AI interviewer grounded in the brand corpus** produces structured,
higher-signal source material (Q&A, the interviewer pulling on threads). Pod-Geni already
built the orchestration for exactly this. We reuse the conversational layer; CONTINUUM
supplies the corpus and the honesty gate.

## 2. What to deliver (the ✅-WORKS reuse package)

Confirm each against current `main` (paths from your terminal read).

| # | Component | Path | What we need delivered | Your status |
|---|---|---|---|---|
| 1 | **AI Guest config schema** | `types.ts → AiGuestConfig` | `{ enabled, mode, voice, persona }` shape | ✅ WORKS |
| 2 | **Voice profile selector** | `components/VoiceProfileSelector.tsx` | The 3 modes (Preset / Design / Clone) + persona override; the voice catalog | ✅ WORKS |
| 3 | **Prep workspace** | `components/PreparationWorkspace.tsx` | Pre-record enable/configure flow | ✅ WORKS |
| 4 | **Orchestrator** | `functions/src/aiGuestOrchestrator.ts` | The Firestore trigger → bot dispatch; **the `/v1/sessions/start` contract** | ✅ WORKS |
| 5 | **Transcript path** | `ChatMessage role:'ai_guest'` | AI turns on the same Daily/Deepgram transcript pipeline as humans | ✅ WORKS |
| 6 | **Grounded fact-check** | `AiUngroundedClaim` + `speakerType` (ARIA) | Post-session flagging of AI claims not traceable to corpus | ✅ WORKS |

## 3. Interface contracts (pin these — they're the seams)

- **`POST {AI_GUEST_BOT_URL}/v1/sessions/start`** — the dispatch contract. Already shaped:
  `{ sessionId, podcastId, roomUrl, corpusDocPath, voiceProfileId, persona }`. Document the
  full request + the expected bot lifecycle (join → converse → leave) + any callback.
- **Transcript schema** — the `ChatMessage` shape for `role:'ai_guest'` turns.
- **`AiUngroundedClaim` schema** — claim, speakerType, traceability fields.
- **Voice profile** — what `voiceProfileId` resolves to (catalog ids; Design/Clone params).

### 3a. The grounding seam — point it at CONTINUUM (the no-duplication ask)

Your AI Guest grounds against a **corpus** (`corpusDocPath`) and flags ungrounded claims
(`AiUngroundedClaim`). **That is exactly what CONTINUUM already is** (append-only memory +
`continuum_check_brand` / FactGate). We do **not** want a second corpus store. Proposed
integration — please confirm feasibility:

- **`corpusDocPath` → a CONTINUUM tenant.** The bot grounds on the `brand-riaan` tenant's
  Observations (the Brand DNA + ingested posts/transcripts), retrieved via our MCP tools
  (`continuum_search_docs` / `continuum_get_observations`).
- **`AiUngroundedClaim` → `continuum_check_brand` + `verified_facts`.** Reuse your *flagging
  UX*; let the *judgment* run against CONTINUUM's verifiable state, so "grounded" means
  "traceable to a verified Observation," not "found in a static doc."

If that's a big lift, deliver the contract + a corpus **adapter interface** so we can swap
your default corpus source for a CONTINUUM-backed one.

## 4. The missing piece — who builds the bot runtime?

Per your read, **`AI_GUEST_BOT_URL` is unset and the conversational agent does not exist.**
That's the one thing that makes AI Guest not work today. It's a scoped Cloud Run worker:
join Daily room → Deepgram STT → LLM (corpus + persona) → VoxCPM2 TTS → speak.

**Decision (flag, don't assume):**
- **(a) Pod-Geni builds it** to the existing `/v1/sessions/start` contract, we consume it; or
- **(b) we (AMF) build it** against your contract, grounded on CONTINUUM, and you can reuse it back.

We lean **(b)** if the grounding is CONTINUUM-backed (it's our corpus + our honesty gate),
but defer to you on ownership. Either way: **the contract already exists — build to it.**

## 5. Consent + rights (mandatory — P9)

- [ ] **Clone mode** requires the 10s reference clip **+ rights confirmation** — deliver
  that consent flow (mirrors the VC likeness wall).
- [ ] Per-presenter voice consent recorded before any public use.

## 6. Secrets / config contract (NAMES ONLY — never values, P1)

```
AI_GUEST_BOT_URL          DAILY_API_KEY / room config
DEEPGRAM_API_KEY          VOXCPM2_URL / VOXCPM2_API_KEY   # reconciled to the worker's names, 2026-06-29
GEMINI_API_KEY (or router-routed LLM)
# CONTINUUM grounding (our side):
CONTINUUM_HTTP_URL        CONTINUUM_HTTP_TOKEN (tenant-scoped)
```

## 7. Acceptance criteria (verify-then-dissolve)

The handover is done when a smoke runs green:

> Given a CONTINUUM-backed corpus + a persona + a voice profile, the bot joins a Daily
> room, conducts a 3-turn interview, its turns land on the transcript path as
> `role:'ai_guest'`, and a post-session pass flags any claim not traceable to a CONTINUUM
> Observation. `node examples/ai-guest-smoke.mjs` → green.

## 8. Delivery format (pick one; first preferred)
1. **Tagged extraction** of the AI Guest module (config + orchestrator + voice selector +
   transcript + fact-check) as a reusable package, with the §3 contracts + §7 example.
2. Documented subtree + README on a tagged branch.

## 9. Explicitly NOT requested (no duplication)
- **Do not** deliver a corpus / memory / vector store — **CONTINUUM is the corpus** (§3a).
- **Do not** build a second fact-check engine — reuse the UX, ground on CONTINUUM.
- Daily/Deepgram account setup is ours.

## 10. Open decisions (flag, don't decide for us)
- **Bot ownership** — §4 (a) vs (b).
- **Voice engine convergence** — Pod-Geni uses **VoxCPM2 48kHz**; the VC handover uses
  **Cartesia / VoxCPM**. We should run **one** voice stack across both products — tell us
  which you'd standardise on and why.
- **Is live AI-interview capture worth it now**, or do we prove the walk-and-talk MVP
  first and add the AI interviewer as a v2 capture mode? (Our lean: MVP first; this bot is
  net-new, not proven — unlike the VC avatar half.)

---

_Requested by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
