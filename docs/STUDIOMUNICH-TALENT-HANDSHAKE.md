# StudioMunich VAULT ⇄ AMF — Integration (AMF as partner consumer)

> **Authoritative provider contract:** `StudioMunich VAULT — Partner Integration Playbook`
> (`/api/vault/v1/*`, © Riaan Kleynhans). **This doc is the AMF-side consumer spec** — how the
> content engine implements that playbook, plus the CONTINUUM render-ledger seam the playbook
> doesn't cover. The playbook wins on any conflict.
>
> **Supersedes the earlier draft of this file (P4):** it guessed a `book → grant` API that
> hands AMF a raw `faceSourceRef + voiceId`. **Wrong.** VAULT *renders* and returns
> **cryptographically signed bytes**; you verify the signature and serve, you never hold the
> likeness. Corrected below.

---

## 1. Architecture (corrected against the playbook)

```
 Rented talent  studiomunich:<actorId>  (Riaan / Astrid / Paulina / industry face)
   AMF ──license──► VAULT ──► identitySovereignToken (per tenant+actor)
   AMF ──render───► VAULT ──► SIGNED face/voice BYTES + X-Rights-Signature
   AMF: verify signature → composite over b-roll → record render in CONTINUUM ledger
                                           │ 404 (no signed snippet) → decline → synthetic fallback
 Synthetic       digital:<id>            → AMF renders itself (VC pipeline + VoxCPM2)
```

- **VAULT renders rented talent.** The VC talking-head engine (HeyGen/MuseTalk) + voice clone
  are **not** used for `studiomunich:` actors — VAULT returns the signed media.
- **VC's only role for rented talent = the matte** (cut VAULT's presenter out to composite
  over AMF b-roll, per VC handover §3a) — *if* VAULT returns full-frame. Confirm whether VAULT
  can return a matted/alpha presenter; if so, even the matte drops out.
- **Synthetic avatars** (`digital:`) still use the full VC pipeline + VoxCPM2 — that's where the
  VC avatar engine earns its place.

## 2. AMF's implementation of the 7 partner steps

| Playbook step | AMF does | Where |
|---|---|---|
| 1. Browse `/talent` | catalog the bookable faces/voices ("Faces by Industry") in the content-engine talent picker | AMF |
| 2. `/license` → token | rent per (tenant=brand, actor); **store `identitySovereignToken`** per tenant+actor | AMF + CONTINUUM ledger |
| 3. `/presence|voice/render` | for each scripted line/short, request signed bytes (`avatarId: studiomunich:<actorId>`) | AMF worker (L4/L5) |
| 4. **Verify `X-Rights-Signature`** | recompute HMAC over `[actorId, modality, phraseHash, duration, tier]`; **HARD REJECT if mismatch** | AMF — non-negotiable |
| 5. Meter usage | record `(tenantId, actorId, signature, duration)` for billing reconciliation | CONTINUUM ledger (§3) |
| 6. Webhooks | verify `X-SM-Signature`; on `talent.takedown` **stop in seconds**, revert to `digital:` | AMF receiver |
| 7. Rights wall | never serve unsigned human media; `voiceidvault_excluded` carries; takedown immediate | everywhere |

`404` from render is **normal** (partial coverage) → decline gracefully → synthetic fallback.
Until the playbook's 5-check smoke is green against live VAULT, the path runs **in shadow**
(declines to synthetic — never serves unsigned likeness).

## 3. The CONTINUUM render-ledger seam (AMF-unique honesty layer)

The playbook gives rights-by-signature; CONTINUUM gives the brand its own **verifiable,
reconcilable record** of every likeness use — verify-then-dissolve on a rental:

- **On `license.granted`:** record an Observation `{ tenantId, actorId, usageLicenseId,
  tier, expiresAt }` with a `verifyCommand` that re-checks the license is active + unexpired.
- **On each accepted render:** record `{ tenantId, actorId, X-Rights-Signature, phraseHash,
  duration }`. This is the brand-side ledger that **reconciles with VAULT on
  `(tenantId, actorId, signature)`** (step 5) — two independent ledgers, one truth.
- **On `talent.takedown` / `license.revoked`:** the license Observation's verify flips to
  fail → **the permission dissolves** → no further render for that actor. The engine cannot
  serve a likeness the talent pulled. That is the honest core (P6 safely-endable, P8 no-extract).

Net: every rented-likeness frame AMF ships is **signed (VAULT), verified (AMF), and recorded
(CONTINUUM)** — provable after the fact, reconcilable to the penny, and revocable in seconds.

## 4. Content (signed snippets) vs live conversation (synthetic)

- **Scripted content** (shorts, brand video) → VAULT signed renders for known text. Rights
  by construction. This is the content-engine path.
- **Live AI-Guest** (real-time interview, arbitrary speech) → VAULT can't pre-sign live
  arbitrary audio, so the conversational bot uses **synthetic VoxCPM2 streaming**
  (`digital:`), per `AI-GUEST-BOT-CONTRACT.md`. Don't try to route live turns through VAULT
  signed snippets — that's what the `404 → decline` path is telling you.

## 5. Decisions this resolves
- **Talent registry + consent owner = StudioMunich VAULT** (the open fork — RESOLVED). VC's
  `avatar_sources` is superseded for rented talent; **the VC handover narrows to: the matte +
  the synthetic-avatar engine (for `digital:` only).**
- **Voice:** VoxCPM2 for synthetic/live; VAULT-signed for rented content. (VAULT's roadmap to
  fal serverless generation is transparent to AMF — still verify `X-Rights-Signature` + handle `404`.)

## 6. Acceptance (the playbook's 5 + the ledger)
The playbook's 5-check smoke (catalog → license → signed render + reject-unsigned → metered →
takedown-stops-serving) **plus**: a CONTINUUM render Observation lands per accepted render and
reconciles with VAULT on `(tenantId, actorId, signature)`; a `talent.takedown` flips the
license Observation's verify to fail.

## Secrets / config (NAMES ONLY — P1, operator-to-operator)
```
STUDIOMUNICH_VAULT_URL        STUDIOMUNICH_VAULT_SECRET        # AMF's partner bearer
SM_WEBHOOK_SIGNING_SECRET     VAULT_RIGHTS_SIGNING_SECRET      # verify webhooks + render signatures
CONTINUUM_HTTP_URL            CONTINUUM_HTTP_TOKEN             # the render ledger (tenant-scoped)
```

---

_AMF-side integration of the StudioMunich VAULT Partner Playbook — Riaan Kleynhans, Human in the Loop._
