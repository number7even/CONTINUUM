# StudioMunich ⇄ AMF — Talent Booking Handshake (target contract)

> **Audience:** the **StudioMunich** build (Riaan, `studiomunich.digital`) and the
> **AMF/CONTINUUM** track. This is the **target StudioMunich's booking API builds toward** —
> contract-first, like the AI-Guest bot. AMF consumes it; CONTINUUM verifies it.
>
> **Status:** spec. StudioMunich is in-progress and **not inspected** (P4) — this is the
> AMF-side requirement, not a description of working software.
>
> **The one fork it assumes:** StudioMunich is THE talent registry + consent owner (it
> supersedes VC-Hospitality's `avatar_sources`). If that decision flips, registry+consent
> stay with VC and StudioMunich becomes a thin booking front — see §9.

---

## 0. The principle

StudioMunich is the **registry + marketplace for consented digital talent** — faces +
voices (Riaan, Astrid, Paulina; a VoiceCosmos "Faces by Industry" catalog). A brand using
AMF **books** a talent for a defined use. A booking is **verify-then-dissolve**: it is live
only while its `consentGrant` and rights still verify, recorded in CONTINUUM. Renting a human
likeness is the most consent-sensitive thing in the whole stack (P8 — do not trap or extract;
P6 — be safely endable; P9 — the consent leap is the human's).

```
 AMF ──bookTalent(talentId, usageScope)──► StudioMunich
                                              │ issues a GRANT (face + voice + consent + scope + expiry)
 AMF ◄───────────── grant ─────────────────┘
   │
   ├─► record booking in CONTINUUM (verify-then-dissolve: valid only while consent verifies)
   └─► feed faceSourceRef + voiceId into the VC rendering pipeline → talking head
```

## 1. The booking API (what StudioMunich exposes)

```
POST {STUDIOMUNICH_URL}/v1/talent/book        → issue a grant
GET  {STUDIOMUNICH_URL}/v1/talent/{id}         → talent card (public/bookable metadata)
GET  {STUDIOMUNICH_URL}/v1/bookings/{grantId}  → current grant status (for re-verification)
POST {STUDIOMUNICH_URL}/v1/bookings/{grantId}/revoke   → talent/operator withdraws consent
GET  {STUDIOMUNICH_URL}/v1/talent?industry=... → catalog ("Faces by Industry")
```
Auth: bearer (the booking brand's StudioMunich key). Secrets are **names only** here (P1).

## 2. The grant bundle (`POST /v1/talent/book` response)

```jsonc
{
  "grantId": "string",                 // the booking handle (CONTINUUM records this)
  "talentId": "riaan" | "astrid" | "paulina" | "<industry-face-id>",
  "bookedBy": "brand-id",              // which brand/tenant booked it
  "faceSourceRef": {
    "kind": "clip" | "still",
    "url": "https://studiomunich/.../riaan1",   // the source the VC engine renders from
    "spec": "front-facing, clean mouth, plain bg, 1080x1920-capable"
  },
  "voiceId": "string",                 // VoxCPM2 voice id (standardised stack, §6)
  "usageScope": {
    "purpose": "content-creation" | "brand-site" | "ad",
    "channels": ["youtube","linkedin","tiktok"],
    "territory": "string|worldwide",
    "exclusive": false
  },
  "consentGrant": { /* §3 */ },
  "issuedAt": "ISO-8601",
  "expiresAt": "ISO-8601",            // bookings EXPIRE — no perpetual likeness use
  "revocable": true                    // talent can withdraw; AMF must re-verify before each render batch
}
```

## 3. The consent grant (the rights wall — non-negotiable, P8/P9)

```jsonc
{
  "consentBy": "string",               // the talent who granted likeness/voice
  "likenessConsent": true,             // signed likeness rights on file at StudioMunich
  "voiceConsent": true,                // voice-clone rights on file
  "voiceidvaultExcluded": true,        // ALWAYS true — a content face is NEVER biometric-auth valid
  "consentDocRef": "string",           // pointer to the signed artifact (not the artifact)
  "permittedUses": ["content-creation","brand-site"],
  "prohibitedUses": ["deepfake-misrepresentation","political","adult","biometric-auth"],
  "disclosureRequired": true,          // AI-presented content must be labelled (EU/German market)
  "revocationHonoredWithin": "PT24H"   // how fast a withdrawal propagates to a hard stop
}
```

> The wall (carried from the VC handover): a registered content face is **never** valid for
> VoiceIDVault biometric auth. `voiceidvaultExcluded` is always `true`. StudioMunich enforces it.

## 4. The CONTINUUM verification seam (verify-then-dissolve on a booking)

A booking is not a fact because StudioMunich says so — it is a fact while it **verifies**.
AMF records each grant in CONTINUUM and re-checks before every render batch:

- On `book`: write an Observation/state entry — `talentId`, `grantId`, `usageScope`,
  `consentDocRef`, `expiresAt` — with a **`verifyCommand`** that calls
  `GET /v1/bookings/{grantId}` and exits 0 **only if** status is `active`, not expired, not
  revoked, and the purpose matches the intended render.
- Before any render batch, AMF runs that verify. **Fail → no render.** A withdrawn or expired
  grant dissolves the permission automatically — the engine cannot render a likeness the
  talent has pulled. That is the honest core of a face-rental marketplace.

## 5. How AMF consumes a grant

`faceSourceRef` + `voiceId` feed straight into the **VC rendering pipeline** (the avatar
handover): voice (VoxCPM2) → talking head (HeyGen/MuseTalk via `BaseAvatarProvider`) → matte
(§3a clean alpha) → composite over b-roll. StudioMunich supplies *who*; VC renders *how*; AMF
assembles; CONTINUUM proves the *right* to.

## 6. Voice + face formats (reuse the settled decisions)
- **Voice: VoxCPM2 48kHz** (standardised 2026-06-29). `voiceId` is a VoxCPM2 id.
- **Face: matte-ready** — `faceSourceRef` must render to a clean alpha cut-out per the VC
  handover **§3a** (so the presenter composites over AMF b-roll without a halo).

## 7. SaaS path (the marketplace)
At scale, a brand on AMF browses `GET /v1/talent?industry=hospitality`, books a "Face by
Industry," and AMF produces that brand's content with a *consented, time-boxed, revocable*
likeness. Same handshake, many tenants. Riaan's case is the n=1: content creation with the
company persona — himself / Astrid by product.

## 8. Acceptance (green smoke)
`book → grant → CONTINUUM record → render → revoke → re-verify blocks render`:
1. `book(talentId:'riaan', purpose:'content-creation')` → a grant with a future `expiresAt`.
2. CONTINUUM records it; the `verifyCommand` exits 0 (grant active).
3. A render batch proceeds (mock VC ok).
4. `revoke(grantId)` → the same `verifyCommand` now exits non-zero → **the next batch is blocked**.
   That single revoke→block is the whole point: consent withdrawal stops the machine.

## 9. Open decision + honest caveats
- **Registry ownership (the fork):** this spec assumes StudioMunich owns registry + consent
  (supersedes VC `avatar_sources`). If it flips, VC keeps the registry and StudioMunich
  becomes a booking front over it — §1–§3 then describe a StudioMunich→VC proxy, not a store.
  **Decide before either team finalises.**
- **StudioMunich is unverified** — external, in-progress; this is the AMF-side requirement,
  not inspected code (P4).
- **Disclosure / deepfake law** — AI-presented likeness has real legal exposure (EU/German
  market especially). `disclosureRequired` + `prohibitedUses` are not optional polish.

## Secrets / config (NAMES ONLY — P1)
```
STUDIOMUNICH_URL          STUDIOMUNICH_API_KEY     # per booking brand
CONTINUUM_HTTP_URL        CONTINUUM_HTTP_TOKEN     # booking verification (tenant-scoped)
```

---

_Target contract by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
