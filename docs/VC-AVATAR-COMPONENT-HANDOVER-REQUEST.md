# Handover Request — Avatar + Voice Components (VC-Hospitality → CONTINUUM/AMF)

> **From:** CONTINUUM / AMF content-engine track
> **To:** VC-Hospitality (the showroom) team
> **Re:** Package the proven avatar + voice stack so we can **reuse**, not rebuild it.
> **Date:** 2026-06-29 · **Owner sign-off:** Riaan Kleynhans (P9 — likeness/voice consent is the human's)
>
> **✅ ANSWERED 2026-06-29 → `AVATAR_CORE_HANDOVER.md`** (code-verified vs the `hospitality`
> branch). All 10 components confirmed real, BUT a Gap List corrects the request: **G1 — no
> talking-head render backend is wired/proven** (the open blocker; contradicts the master
> map's "fal proven"); **G2** webhook is dead, bind to poll; **G3** BodyPix matte is NOT
> reusable, build RVM/BiRefNet; **G4** Cartesia 44.1k vs VoxCPM 48k, resample; **G5** remove
> the hardcoded Cartesia `voice_id`. Deliverables: `avatar_sources` migration +
> `register-content-faces.mjs` (Riaan/Astrid consent) + honest `avatar-smoke.mjs`
> (registry+voice green, mp4 blocked on G1). The notes below are amended inline to the answer.

---

## Cover note (paste-ready)

> Team — we're standing up the content engine (long-form → short-form talking-head
> shorts of **Riaan + Astrid**, over b-roll, to present and sell what we've built).
> The **avatar + voice half is already real in VC-Hospitality** (it shipped as the
> Paulina reveal). Rather than rebuild it, we want to **reuse your components**.
>
> This doc lists exactly what to hand us and in what form. The new work (segment →
> script → b-roll → caption → vertical export) is **ours** — please don't build that.
> We need the proven pieces extracted, documented, license-clear, and runnable, with
> a smoke test we can execute to confirm the handover is complete. Secrets go into our
> vault directly, **never in this doc or any commit** (P1).
>
> Target: a tagged extraction we can pull this week. Acceptance = the smoke in §6 runs green.

---

> **⚠️ Scope narrowed 2026-06-29 — read first.** StudioMunich VAULT is now the talent
> registry + renderer for **rented** talent (`studiomunich:<actorId>` — Riaan/Astrid/Paulina):
> VAULT returns cryptographically **signed rendered bytes**, so the `fal-ai/musetalk` render
> engine + the registry/consent below are **NOT needed for rented talent** —
> see `STUDIOMUNICH-TALENT-HANDSHAKE.md`. What AMF still needs from VC: **(1) the matte**
> (cut VAULT's presenter out to composite over b-roll, §3a) and **(2) the full avatar+voice
> engine ONLY for synthetic `digital:` avatars** we render ourselves. Treat the components
> below through that lens — most matter only for the synthetic path now.

## 1. Context (why we need it)

We are reusing the talking-head + voice-clone pipeline for two consented presenters
now (**Riaan**, **Astrid**); when CONTINUUM becomes multi-tenant SaaS we will register
the same way **per tenant + avatar**. So the handover must be **presenter-agnostic** —
no hard-coded Paulina/Aria identities in the core; identity comes from config + the
consent registry.

**Downstream target (so the matte handoff is right):** the presenter is composited
**over our own b-roll** (talking head as an overlay, not full-frame), with burned
captions and a brand frame. We build the b-roll generation + compositor (it is **not**
yours to build — see §8); but item 8's matte must output in a form our compositor can
layer cleanly. The matte output contract is in §3a.

## 2. What to deliver (the reuse package)

Deliver the **✅-reuse** components from the avatar tech handoff. For **each**: the
source, its public interface, a config/secrets *contract* (names only), and a minimal
runnable example. Please confirm each path against current `main` — paths below are
from the handoff and may have moved.

| # | Component | Handoff path (confirm vs `main`) | What we need delivered |
|---|---|---|---|
| 1 | **Face registry + consent gate** | `src/lib/avatar/source-registry.ts` | `registerFace()`, the `CANDIDATE_FACES` shape, and the `avatar_sources` **table DDL** (so we can stand up our own). `voiceidvault_excluded` must default true. |
| 2 | **Provider abstraction** | `src/lib/avatar/providers/base-provider.ts` | The `BaseAvatarProvider` interface — this is the seam we build against. Document the method contract (submit job → poll/webhook → mp4). |
| 3 | **Talking-head render — ⚠️ OPEN (handover G1)** | batch seam = `ReplicateService.getPrediction()` **poll** + `AvatarJobQueue` · or sovereign `AVATAR_SOVEREIGN_RENDER_URL` (Hetzner) · master-map target = `fal-ai/musetalk` | **No render backend is wired/proven (ANSWERED 2026-06-29, code-verified): `REPLICATE_MODELS` has only image models, no render credential anywhere, fal/PR#11 not on disk.** The master map claims fal proven; the code-verified handover says no backend — **CONTRADICTION, resolve before any "proven" claim.** HeyGen/Tavus here are **streaming-only** (not batch mp4). Wire ONE backend (sovereign sidecar preferred per EU decision), then prove the mp4. |
| 6 | **Voice clone proxy (Cartesia)** | `src/pages/api/voice/cartesia-stream.ts` | The proxy + the **PCM/audio output contract** (`model_id: sonic-2`, `voice.id`, byte format). Key stays server-side. |
| 7 | **Voice clone proxy (sovereign VoxCPM)** | `src/pages/api/voice/voxcpm-stream.ts` | Same — documented as the drop-in sovereign alternate (identical PCM contract). |
| 8 | **Background matte** | `src/lib/avatar/background-removal-service.ts` | BodyPix segmentation → transparent presenter (alpha output format). |
| 9 | **Face validation** | `src/lib/avatar/face-detection-service.ts` | Validates a source clip (single, front-facing, clean mouth) before registration. |
| 10 | **Async render queue** | `src/lib/avatar/avatar-job-queue.ts` | The poll-based queue + per-model time budgets. |

## 3. Interface contracts we depend on (please pin these)

These are the seams our content engine binds to — if they change, we break. Document
and version them:

- **`BaseAvatarProvider`** — ⚠️ **CORRECTED (handover §3.1):** this is a **realtime *streaming*** seam (`createSession`/`sendMessage`/`endSession`), **NOT** submit→jobId→mp4. The **batch mp4 seam** the content engine wants is **`ReplicateService.getPrediction()` poll + `AvatarJobQueue`** (handover §3.2). Bind to the poll, not the (dead, G2) webhook.
- **Voice proxy output** — exact audio byte contract (sample rate, channels, PCM vs MP3) so Cartesia and VoxCPM are truly interchangeable.
- **`avatar_sources` schema** — columns + types: `talent_name`, `consent_by`, `voiceidvault_excluded` (always true for content faces), `prep_status`, `source_clip`.
- **Webhook payloads** — the render-complete webhook/poll body shape (for `fal-ai/musetalk`).

### 3a. Matte → composite output contract (the one b-roll-adjacent ask)

We do **not** want you to build b-roll or the compositor (§8). We **do** need item 8's
matte to emit something our compositor can layer over b-roll without re-processing.
Please pin and document:

- **Alpha output format** — per-frame transparency as **WebM (VP9 alpha)** *or* a
  **PNG sequence + manifest**. State which, and the pixel format (e.g. `yuva420p`).
- **Edge quality** — feathering/spill behaviour at the hair/shoulder boundary (the
  difference between "floats over b-roll" and "ugly halo"). Note any known artifacts.
- **Resolution + frame rate** — what it outputs natively; we target **1080×1920 @ 30fps**.
- **Sync anchor** — how the matted clip's timeline maps back to the source audio (so
  captions + b-roll cuts stay word-synced after compositing).
- **Headroom** — is BodyPix the current best, or did you move to a stronger segmenter?
  Tell us what you'd use today.

That is the **entire** b-roll-side ask: a clean, documented presenter cut-out. Generation,
matching, captions, and vertical assembly are ours.

## 4. Consent + rights artifacts (mandatory — P9)

The likeness/voice wall is **non-negotiable**; deliver the artifacts, not just the code:

- [ ] `avatar_sources` rows (or the process to create them) for **Riaan** and **Astrid**, `consent_by` set, `voiceidvault_excluded: true`.
- [ ] Confirmation that a registered **content face is never valid for VoiceIDVault biometric auth** (`isVoiceIdVaultExcluded()` always true) — and where that wall is enforced in code.
- [ ] The signed-likeness-consent template/process used for Paulina, so we replicate it for Riaan + Astrid (and, later, per tenant).
- [ ] Cartesia voice-clone consent process (per presenter).

## 5. Secrets / config contract (NAMES ONLY — never values, P1)

List the env vars the components require so we can populate our own vault. **Do not put
any key, token, or voice_id value in this doc, an email, or a commit.** Real values go
into our secret store directly, operator-to-operator.

```
HEYGEN_API_KEY            TAVUS_API_KEY            REPLICATE_API_TOKEN
CARTESIA_API_KEY          CARTESIA_MODEL_ID=sonic-2   CARTESIA_VOICE_ID (one per presenter)
VOXCPM_LIVE_URL           VOXCPM_LIVE_SECRET
SUPABASE_URL              SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL       (render webhooks)
```

## 6. Acceptance criteria (how we verify the handover — verify-then-dissolve)

The handover is **done** only when we can run a smoke against the delivered package and
it exits 0. Please include a runnable example that does exactly this:

> Given (a) a registered Riaan content face, (b) a Riaan Cartesia `voice_id`, and (c) a
> hand-written 40s script, the delivered modules produce a **talking-head `.mp4` with
> the cloned voice synced** — through the `BaseAvatarProvider` interface (`fal-ai/musetalk`
> render) — with **no identity hard-coded** (presenter passed as config).

Deliver this as a script we can run: `node examples/avatar-smoke.mjs` → green. That's our
definition of "delivered," not "the code is in the repo."

## 7. Delivery format (pick one; first is preferred)

1. **Tagged extraction as a private package** — e.g. `@voicecosmos/avatar-core` (the
   `src/lib/avatar/**` + `api/voice/**` subtree) with a README, the interface docs, and
   the §6 example. We add it as a dependency in the AMF repo. **Cleanest reuse.**
2. **A documented subtree + README on a tagged branch** we can `git subtree`/vendor in.
3. **A handover branch** with the files + docs if extraction is too heavy this week.

Whichever you pick: include the **license** (so reuse is clean), the **§3 interface
contracts**, and the **§6 runnable example**.

## 8. Explicitly NOT requested (keep scope tight)

Do **not** build or deliver these — they are the CONTINUUM/AMF team's work:
- Long-form → short-form **segmentation + scripting** (the content brain).
- **B-roll generation** (ComfyUI / fal.ai / licensed library) + **matching**.
- **Compositor** (presenter-over-b-roll + captions + vertical export — HyperFrames / FFmpeg / Remotion).
- **Review/publish dashboard** + syndication.

We only need the **avatar + voice engine** — the proven half — packaged for reuse.
The single point where our b-roll work touches yours is the **matte output contract
in §3a**: give us a clean cut-out, and everything downstream of it is ours.

## 9. Open decisions for VC team input (flag, don't decide for us)

- **Render engine — ⚠️ OPEN (handover G1, supersedes the "LOCKED" claim).** `fal-ai/musetalk`
  is the master-map *target*, but **no render backend is wired or proven** (code-verified:
  only image models, no credential; fal/PR#11 not on disk). The map and the handover
  **disagree**; HeyGen here is streaming-only. **Resolve + wire ONE backend (sovereign sidecar
  preferred) before any mp4 claim.** This is the single blocker for rendered talking-heads.
- **Voice stack — DUAL-PATH (corrected 2026-06-30):** **Cartesia (Sonic-2) now** — the proven
  engine for the AMF **scripted-content** pipeline (Riaan/Astrid clones). **VoxCPM2 (48kHz)
  sovereign-later** — the live AI-Guest / Pod-Geni path. Both coexist behind `TTSService`;
  deliver the Cartesia proxy as a first-class content voice, not a fallback.
- Anything in the proven pipeline that was **fragile or maintenance-heavy** — tell us now.

---

_Requested by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
