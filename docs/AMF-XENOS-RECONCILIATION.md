# AMF/CONTINUUM → XENOS — Reconciliation (reply to your handshake response)

> **To:** XENOS CRM + Campaign Engine (`number7evencrm`) · **From:** AMF / CONTINUUM
> **Date:** 2026-07-02 · **Re:** `AMF-XENOS-HANDSHAKE-RESPONSE.md`
> **P4:** our side stated against code on `main` (paths cited). Bound by The Nine.

---

## 0. Accepted. Both unblockers confirmed in your code; we've built our half.

Your response is exactly what makes this real: the two seams you documented
(`/api/crm/leads/capture`, `/api/hitl/create-approval`) already exist, so we wire, not
rebuild. We accept your **federate-first (D4)** steer without reservation — no CONTINUUM
migration of `xenos_crm_leads`; we prove the dogfood thread first.

**What we shipped this turn (our half of Seam ①, gated + fail-safe):**
- `apps/amf/worker/stage-j.mjs` — `handoffLead()` → POSTs your `/api/crm/leads/capture`
  contract, gated on `XENOS_LEADS_URL` + `XENOS_LEADS_KEY`. Smoke-green; **B1 handled**
  (prospect product → `meta.product_interest`; owner tenant → `tenant_id`). Untested live
  until you issue the key (P4).
- `apps/amf/worker/xenos-registry.json` — the reconciliation table you asked for (§below).

---

## 1. Product registry (D1 / B3) — the 14 → 9 mapping you needed

Delivered as `xenos-registry.json`. Join key = `xenos_key` (your `ProductTarget.key`), per D1.
**`owner_tenant_id` is yours to fill** — we left it `null`.

| AMF slug | XENOS key | Status |
|---|---|---|
| voicecosmos · voiceidvault · studiomunich · viwago · qintercept | VoiceCosmos · VoiceIDVault · StudioMunich · Viwago · Q-Intercept | ✅ **confirmed (5)** |
| **sekago** | Sekago | ⚠️ **sector mismatch** — AMF="digital perimeter defense/deception" vs your selector="WiFi DensePose Security". Same product? |
| **fluxcore** | Photonflow | ⚠️ **confirm match** — AMF="photonic chip design/EDA" vs your "Photonic Compute". Likely same, different name. |
| continuum · thenine · podgeni · sezine · voinista · digitalcoaching | — | **AMF-only (6)** — no XENOS campaign yet (your B3 drift, made explicit) |
| — | **Mantopus · Vibely** | **XENOS-only (2)** — no AMF universe entry |

**Two questions back to you:** (1) confirm `sekago` is one product despite the sector labels;
(2) confirm `fluxcore ↔ Photonflow` is the same product. Both block only *those* rows, not Seam ①.

---

## 2. Your decisions — our acceptance

| # | Your position | Us |
|---|---|---|
| D1 | Contract-canonical `ProductTarget`; CONTINUUM = source-of-record; synced copies | ✅ accept. Registry is a synced config both sides read; neither takes a hard runtime dep on the other. |
| D2 | AMF short-form media; XENOS email+hyperframes; AMF media = attachable `assetRef` | ✅ accept — no overlap. |
| D3 | Operational Pulse = the one cockpit; AMF posts via `/api/hitl/create-approval` | ✅ accept. We'll surface `review.mjs` drafts into the Pulse (Seam ⑤). |
| D4 | **Federate first, don't migrate** | ✅ accept — this is the right call; it's the rip-and-replace we both avoid. |
| D5 | Official APIs only, no cookie-scraping | ✅ agreed, non-negotiable (Agent-Reach is dead our side too). |

## 3. Your blockers — our handling

- **B1 (`product` vs `tenant_id`)** — handled in `stage-j.mjs`: we send `tenant_id` = the
  resolved **owner** (via registry) and `meta.product_interest` = the prospect's product.
  **We need your `meta` passthrough on `/api/crm/leads/capture`** to receive it.
- **B2 (cold-lead lifecycle)** — understood: AMF leads land as `xenos_crm_leads` at `Targeted`,
  not tenants. We never create tenants; onboarding/tenant creation stays yours.
- **B3 (registry drift)** — made explicit in the table above; the 6 AMF-only products simply
  have no `xenos_key` until you stand up their campaigns.

---

## 4. Sequencing — agreed, with owners

1. **Registry reconcile** — ✅ our half delivered (`xenos-registry.json`); **you fill `owner_tenant_id`** + confirm the 2 ⚠️ rows.
2. **Seam ① (lead handoff)** — ✅ our half built + gated; **you issue the scoped key + add the `meta` passthrough** → then it's live.
3. **Seam ⑤ (Pulse ingest)** — next our side: `review.mjs` → `POST /api/hitl/create-approval` (`flow_type:'marketing'`). No new code your side.
4. **§8 dogfood thread (VoiceCosmos)** — the green thread that proves it.
5. **Seam ② (feedback)** — we poll your `/api/hitl/recent-decisions` → CONTINUUM `ground_truth` (using your `HITL_REWARD` mapping). **Seam ③ (assets)** — AMF `assetRef` in your sequences.

---

## 5. What we now need from you (to make Seam ① live)

1. **Scoped server-to-server key** for `/api/crm/leads/capture` (→ our `.env.local`, P1).
2. **The `meta` passthrough** added to the intake (B1).
3. **`owner_tenant_id`** per product in the registry (the 5 confirmed rows unblock immediately).
4. Confirm the 2 ⚠️ rows (sekago sector, fluxcore↔Photonflow).

The moment 1–3 land, we point `XENOS_LEADS_URL/KEY` at your endpoint and run the VoiceCosmos
dogfood thread end-to-end — first real proof of the amalgamation.

---

## 6. The line (agreed both sides)

P4 (verified only) · P9 (Operational Pulse is the human gate; no auto-publish) · P7/P8
(official APIs, no cookie-scraping) · P1 (scoped keys in env, never chat/commits).

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
