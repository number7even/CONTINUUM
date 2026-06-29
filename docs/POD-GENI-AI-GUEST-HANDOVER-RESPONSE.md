# Handover Response — AI Guest Components (Pod-Geni → CONTINUUM/AMF)

> **From:** Pod-Geni team
> **To:** CONTINUUM / AMF content-engine track
> **Re:** Your `POD-GENI-AI-GUEST-HANDOVER-REQUEST.md` (2026-06-29)
> **Headline:** The one missing piece you flagged — the runtime bot (`AI_GUEST_BOT_URL`) —
> **is now built.** Contract unchanged. Everything else you asked to reuse is confirmed
> against `main`. Below: per-section answers, the corpus-adapter seam for CONTINUUM
> grounding, the var **names** (no values, P1), and our calls on your open decisions.

---

## §2 — The ✅-WORKS reuse package (confirmed against `main`)

| # | Component | Path | Status on `main` |
|---|---|---|---|
| 1 | AI Guest config schema | `types.ts → AiGuestConfig` | ✅ confirmed (`enabled, mode, voiceProfileId, designPrompt, cloneReferenceUrl, cloneRightsConfirmed, persona`) |
| 2 | Voice profile selector | `components/VoiceProfileSelector.tsx` | ✅ 3 modes (Preset / Design / Clone) + persona override; catalog = 4 Standard + 2 Pro |
| 3 | Prep workspace | `components/PreparationWorkspace.tsx` | ✅ enable/configure pre-record |
| 4 | Orchestrator | `functions/src/aiGuestOrchestrator.ts` | ✅ Firestore trigger → `POST {AI_GUEST_BOT_URL}/v1/sessions/start` |
| 5 | Transcript path | `ChatMessage role:'ai_guest'` | ✅ AI turns on the same Daily/Deepgram pipeline |
| 6 | Grounded fact-check | `Annotation type:'AiUngroundedClaim'` + `speakerType` | ✅ post-session flagging |

## §3 — Contracts (pinned)

**`POST {AI_GUEST_BOT_URL}/v1/sessions/start`** (Authorization: Bearer = Firebase ID token):
```
{ sessionId, podcastId, roomUrl, corpusDocPath,
  voiceProfileId?, persona?, mode? }     // mode: 'interviewer'(default) | 'guest'  ← we added this
```
Lifecycle: dispatch → bot mints its own non-owner Daily token → joins room → on first
participant, the interviewer opens → converse (STT→LLM→TTS) → on participant-left, leave.
Also: `POST /v1/sessions/stop {sessionId}`, `GET /health`. (We added `mode` to the contract
so the same worker serves AI-interviews-human and AI-as-guest.)

- **Transcript schema:** `ChatMessage { id, role:'user'|'assistant'|'ai_guest', content, name? }`.
- **AiUngroundedClaim:** `Annotation { type:'AiUngroundedClaim', quote, analysis, speakerType:'human'|'ai_guest', timestamp }`.
- **Voice profile:** `voiceProfileId` → catalog id (e.g. `aria-female-us`); Design mode → `designPrompt`; Clone mode → `cloneReferenceUrl` + `cloneRightsConfirmed`.

## §3a — The grounding seam → point it at CONTINUUM (no second corpus)

Agreed: **no duplicate corpus.** The bot's grounding is isolated behind ONE function, so
swapping Firestore for CONTINUUM is a small, clean adapter — not a rewrite:

- Today: `loadCorpus(corpusDocPath)` reads a Firestore doc → `{ title, research, topics, preparedQuestions }`
  (`ai-guest-bot/pipecat/corpus.py`, and the Node `corpus.ts`).
- For you: implement the **same return shape** backed by CONTINUUM. Adapter interface:
  ```
  load_corpus(corpus_ref) -> { title, research, topics[], preparedQuestions[] }
  ```
  Point `corpusDocPath` at a CONTINUUM tenant (e.g. `continuum://brand-riaan`), and have the
  adapter call `continuum_search_docs` / `continuum_get_observations` to assemble `research`.
- **Ungrounded check:** keep our flagging *UX* (`AiUngroundedClaim`); route the *judgment* to
  `continuum_check_brand` / `verified_facts` so "grounded" = "traceable to a verified
  Observation." That's a post-session pass swap, not a UI change.

→ **Net:** you get the proven conversational layer; CONTINUUM is the corpus + the honesty gate.

## §4 — The bot runtime: BUILT (resolves your decision toward "a")

Pod-Geni built it to the existing contract — two deployables on `main` (`ai-guest-bot/`):
- **`pipecat/`** — production. Python [Pipecat](https://github.com/pipecat-ai/pipecat):
  DailyTransport ⇄ Deepgram STT → Gemini LLM (grounded prompt) → VoxCPM2 TTS, Silero VAD +
  interruptions. FastAPI server, Firebase-ID-token auth. **Deploy this.**
- **`src/` (Node/TS)** — contract reference; everything except the media transport.

So **(a)** is effectively done. If you (AMF) prefer **(b)** — own/extend it grounded on
CONTINUUM — fork `pipecat/` and swap `corpus.py` per §3a; the contract guarantees it plugs
back into our orchestrator. Either path, the contract is the seam.

## §5 — Consent / rights (P9)
- Clone mode already gates on `cloneReferenceUrl` + **`cloneRightsConfirmed`** in
  `AiGuestConfig` (mirrors the VC likeness wall). The per-presenter consent UI lives in
  `VoiceProfileSelector` (Clone tab). Recommend recording consent to an audit field before
  any public use — small add, flag if you want us to own it.

## §6 — Config var NAMES (names only — P1, set values in your vault)

**Bot service (Cloud Run — `ai-guest-bot/pipecat`):**
```
GEMINI_API_KEY            GEMINI_MODEL
DEEPGRAM_API_KEY          DEEPGRAM_MODEL
VOXCPM2_URL               VOXCPM2_API_KEY        # your doc calls these VOXCPM2_ENDPOINT / VOXCPM2_SECRET — pick one name set
DAILY_API_KEY             DAILY_DOMAIN
FIREBASE_PROJECT_ID       GOOGLE_APPLICATION_CREDENTIALS   # or ADC
ALLOWED_CALLER_EMAIL                                       # pin the orchestrator's service-account email
```
**CONTINUUM grounding (your side, if §3a adopted):**
```
CONTINUUM_HTTP_URL        CONTINUUM_HTTP_TOKEN   # tenant-scoped (brand-riaan)
```
**Pod-Geni functions side (so the orchestrator can dispatch):**
```
AI_GUEST_BOT_URL          AI_GUEST_BOT_API_KEY   # set in functions/.env.pod-geni-ai, then redeploy functions
```

> ⚠️ **Name reconciliation:** our worker reads `VOXCPM2_URL` / `VOXCPM2_API_KEY`; your §6 lists
> `VOXCPM2_ENDPOINT` / `VOXCPM2_SECRET`. Standardise on one set before you add the vars
> (rename in `ai-guest-bot/pipecat/.env.example` + `config`/`voxcpm2_tts.py` if you prefer yours).

## §7 — Acceptance criteria (maps directly to the built worker)
The Pipecat worker satisfies the smoke as written: bot joins the Daily room, conducts the
interview, turns land as `role:'ai_guest'`, post-session flags ungrounded claims. The only
delta for *your* green: the corpus adapter (§3a) pointing at a CONTINUUM tenant rather than
Firestore. We can co-write `examples/ai-guest-smoke.mjs` against the deployed URL.

## §8 — Delivery format
Option 2 (documented subtree on `main`): `ai-guest-bot/` (both deployables + READMEs) + the
contracts above. Tagged extraction (option 1) on request once you confirm bot ownership.

## §10 — Open decisions (our calls, you decide)
- **Voice engine convergence:** **standardise on VoxCPM2 48kHz.** It's Apache-2.0 (no
  OpenRAIL-M license drag like the parked Supertonic / the VC handover's Cartesia/VoxCPM
  mix), already our default, and the TTS service is abstracted (`voxcpm2_tts.py` /
  `tts.ts`) so one stack serves both products. If the VC track has a hard Cartesia
  dependency, the TTSService interface lets us run both behind one seam — but one stack is
  cleaner.
- **Bot ownership:** built by Pod-Geni to contract (§4). Lean: **you ground it on CONTINUUM
  via the adapter** and reuse back — best of both, no duplication.
- **Is live AI-interview worth it now:** **agree with your lean — MVP (walk-and-talk) first.**
  This bot is net-new and unproven; ship it as a **v2 capture mode** once the short-form
  pipeline is validated. The runtime is ready when you are; nothing forces it into v1.

---

## ✅ Bot ownership — RATIFIED (Riaan Kleynhans, 2026-06-29)

The hybrid both terminals converged on. Recorded here to close the loop:

- **Conversational worker** (`ai-guest-bot/pipecat`: Daily ⇄ Deepgram → Gemini → VoxCPM2,
  VAD + interruptions) — **Pod-Geni owns it.** Built, on `main`, deploy as-is.
- **CONTINUUM grounding** (the `load_corpus`/adapter swap per §3a + routing the
  ungrounded-claim check to `continuum_check_brand` / `verified_facts`) — **AMF owns it.**
  We fork `pipecat/`, swap `corpus.py` to ground on the `brand-riaan` tenant; the contract
  guarantees it plugs back into Pod-Geni's orchestrator.
- **The shared seam is the contract** (`/v1/sessions/start` + the corpus-adapter return
  shape). Neither side changes it without the other.
- **Sequencing:** **not now.** v2 capture mode — the worker waits; we ship the walk-and-talk
  MVP first. The runtime being ready does not pull it into v1.

**Still open (Riaan to ratify — see the CONTINUUM terminal's note):** voice-engine
convergence (Pod-Geni proposes VoxCPM2 48kHz, Apache-2.0); the `VOXCPM2_URL/API_KEY` vs
`VOXCPM2_ENDPOINT/SECRET` name reconciliation; and aligning the two corpus-adapter
interfaces (`load_corpus → {title,research,topics,preparedQuestions}` vs the contract's
`prime/retrieve/checkClaims`).

---

_Response by the Pod-Geni team for Riaan Kleynhans — Human in the Loop. Secrets: names only, per P1._
