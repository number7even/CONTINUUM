# AMF Layer 4 — Audio Pipeline: Technical Contract

> **Scope.** The human-voice audio path of the Autonomous Media Factory:
> a creator's raw recording → studio-quality enhanced audio → **word-level
> timestamps** for L5 assembly. No GPU required (that's the L4-*visual*
> ComfyUI path, gated on Hetzner). This is the L4-*audio* path, buildable now.
>
> **Decision locked (operator, 2026-06-23):** human voice + Auphonic, final.
> Overrides the earlier same-day `rapidaai/voice-ai` + `VoxCPM` AI-voice call
> and the original ElevenLabs spec. Rationale: YouTube monetisation + authentic
> engagement (avoid the "AI slop" demonetisation risk).
>
> **Bound by The Nine.** Secrets per P1/P9 (`AUPHONIC_API_KEY` injected by the
> operator, never in chat/logs/commits). Safely endable per P6 (every route
> returns a clean "key not set" until the secret is injected). Prove, don't
> grant per P2 (the word-level-timestamp claim is verified on first real run,
> not assumed).

---

## 0. The honest boundary (what's verified vs. flagged)

| Capability | Status |
|---|---|
| Auphonic audio **enhancement** (leveling, denoise, filtering) | ✅ verified — Auphonic's core product |
| Auphonic **speech recognition → transcript + subtitles** (SRT/VTT, segment-level) | ✅ verified |
| Auphonic async processing via **webhook callback** or **polling** | ✅ verified |
| Auphonic emitting **WORD-LEVEL** per-word timestamps in a JSON output | ⚠️ **UNVERIFIED** — Auphonic's standard subtitle output is segment-level. Mitigation below. |

**Word-level mitigation (the contract's load-bearing decision):** after Auphonic
returns the enhanced audio, run a **forced-alignment** pass to produce true
word-level timing. Candidates (decide on first build): `whisperx` or
`whisper-timestamped` (word timings out of the box), or `aeneas` (aligns the
known transcript to the audio). This decouples us from Auphonic's timestamp
granularity. If a first real Auphonic run proves it already emits usable
word-level JSON, the alignment pass is skipped. **We verify before we rely.**

---

## 1. End-to-end flow

```
[creator records QuickTime/.m4a/.wav]
        │  (HITL — human-in-the-loop, the one manual step)
        ▼
POST /api/audio/submit  (multipart: audio file + scriptId/jobId)
        │  our route:
        │   1. store the raw upload (object storage — Vercel Blob / S3)
        │   2. Auphonic: create production (preset + webhook), upload, start
        │   3. persist job state: { jobId, auphonicUuid, status: 'enhancing' }
        ▼
Auphonic processes asynchronously (enhancement + speech recognition)
        │
        ├── webhook ──▶ POST /api/audio/webhook   { uuid, status }
        │                 status 3 = Done → fetch result + outputs
        │                 status 2 = Error → mark job failed
        │
        └── (fallback) GET /api/audio/status?jobId=  polls
                          GET https://auphonic.com/api/production/{uuid}.json
        ▼
on Done:
   1. fetch production JSON → output_files[] (enhanced audio URL + transcript)
   2. download enhanced audio to object storage
   3. forced-alignment pass → word-level timestamps  ⚠ (see §0 mitigation)
   4. emit the L5 payload (§4) and set status: 'ready-for-assembly'
```

## 2. Auphonic API contract (verified endpoints)

- **Auth:** `Authorization: Bearer <AUPHONIC_API_KEY>` (API-key method).
- **Create production:**
  `POST https://auphonic.com/api/productions.json`
  body (JSON): `{ "preset": "<preset_uuid>", "webhook": "https://amf.continuum.rest/api/audio/webhook", "metadata": { "title": "<jobId>" } }`
  → returns `{ data: { uuid, ... } }`.
  (A **preset** holds the enhancement algorithms + speech-recognition + output-file
  config; created once in the Auphonic dashboard, referenced by UUID. Speech
  recognition is enabled on the preset.)
- **Upload the audio:**
  `POST https://auphonic.com/api/production/{uuid}/upload.json`
  **multipart/form-data**, field `input_file` = the audio blob. (NOT JSON.)
- **Start processing:**
  `POST https://auphonic.com/api/production/{uuid}/start.json`
- **Webhook callback (Auphonic → us):** Auphonic POSTs to our `webhook` URL with
  form fields `uuid` and `status`. Status: **3 = Done**, **2 = Error**
  (full list: `GET https://auphonic.com/api/info/production_status.json`).
- **Fetch result (polling / on-webhook):**
  `GET https://auphonic.com/api/production/{uuid}.json`
  → `{ data: { status, output_files: [{ download_url, format, ... }], ... } }`.

## 3. Routes we build (this PR)

| Route | Method | Does |
|---|---|---|
| `/api/audio/submit` | POST (multipart) | store upload, create+upload+start Auphonic production, return `{ jobId, auphonicUuid }`. **503 if `AUPHONIC_API_KEY` unset.** |
| `/api/audio/webhook` | POST | receive Auphonic `{uuid,status}`, on Done fetch result + (later) align, persist. Public (Auphonic-called); validates the uuid maps to a known job. |
| `/api/audio/status` | GET `?jobId=` | poll fallback — returns the job's current state + the L5 payload when ready. |

**Storage reality (Vercel):** serverless functions are stateless with payload +
duration limits. The contract requires **object storage** for the raw + enhanced
audio (recommend **Vercel Blob**; S3 acceptable) and a **small job store** for
`{ jobId → auphonicUuid, status, payload }` (Vercel KV / Postgres / the CONTINUUM
storage seam). The full AMF spec puts this on Redis/BullMQ + bare-metal workers;
on the Vercel MVP, Blob + KV are the drop-in equivalents.

## 4. The L5 payload (the data contract this layer must emit)

This is what L5 (HyperFrames / FFmpeg assembly) consumes. Stable shape:

```jsonc
{
  "jobId": "job_…",
  "enhancedAudioUrl": "https://blob…/enhanced.m4a",
  "durationSec": 47.3,
  "transcript": "full plain-text transcript",
  "words": [
    { "word": "Valve", "start": 0.42, "end": 0.71 },
    { "word": "just",  "start": 0.71, "end": 0.93 }
    // … word-level (post-alignment); the field L5 syncs B-roll/subtitles to
  ],
  "segments": [
    { "text": "Valve just shipped a Linux gaming PC.", "start": 0.42, "end": 3.10 }
    // … segment-level (Auphonic subtitles), always present
  ],
  "wordLevelSource": "whisperx | auphonic | none",
  "status": "ready-for-assembly"
}
```

`segments` is always populated (from Auphonic). `words` is populated by the
alignment pass; `wordLevelSource` records its provenance honestly so L5 knows
whether it has true word timing or must fall back to segment timing.

## 5. Secrets & gates (operator actions)

| Item | Owner | Status |
|---|---|---|
| `AUPHONIC_API_KEY` (Bearer) → `apps/amf/.env.local` (local) + Vercel env (prod) | operator (P1/P9) | 🚧 pending |
| Auphonic **preset** (enhancement + speech-recognition + outputs) created in dashboard, its UUID → `AUPHONIC_PRESET_UUID` env | operator | 🚧 pending |
| Object storage (Vercel Blob token) for audio files | operator | 🚧 pending |
| Forced-alignment engine choice (whisperx vs aeneas) + where it runs (it's CPU-capable; a small worker, not the GPU) | build decision | open |

## 6. What this PR ships vs. defers

- **Ships now:** the three routes as the real contract, gated on `AUPHONIC_API_KEY`
  (clean 503 until injected); the L5 payload type; a minimal record-or-upload UI
  affordance in the AMF (L4 lane). Safely endable — nothing runs without the key.
- **Defers (needs operator key/account or a decision):** the live Auphonic round-
  trip, object-storage wiring, the forced-alignment pass, and the persistent job
  store. Each is flagged in code with a `// TODO(L4):` and the gate it waits on.

---

_Sources: Auphonic API docs — [overview](https://auphonic.com/help/api/index.html),
[webhooks](https://auphonic.com/help/api/webhook.html),
[JSON API details](https://auphonic.com/help/api/details.html),
[query data](https://auphonic.com/help/api/query.html). Word-level timestamp
granularity is flagged UNVERIFIED pending a real production run._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
