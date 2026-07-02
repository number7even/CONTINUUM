# Partner Integration Requests — XENOS CRM + StudioMunich VAULT

> **To:** the XENOS CRM team · the StudioMunich VAULT team
> **From:** AMF / CONTINUUM (`supabase-projects/CONTINUUM`)
> **Date:** 2026-07-03 · **Status:** our side is **built, verified, and gated** — waiting only on you.

Both integrations are **wired and fail-safe on our side today**. Nothing here is a request to
build against a promise — every seam has passing smoke tests and declines gracefully while
gated (P6 safely-endable). The items below are the exact inputs that flip each seam from
"in shadow" to live. Secrets travel **operator-to-operator, env-injected, never in chat, commits,
or this doc** (P1) — this file names keys only.

One rule governs both: **we never claim more than we can verify** (P4). Until your inputs land,
the code refuses rather than fakes — leads aren't invented, likenesses aren't served unsigned.

---

## A. XENOS CRM — the revenue loop (Seams ① ⑤ ②)

### Built + verified on our side

| Seam | Module | What it does | Verify |
|---|---|---|---|
| ① Lead handoff | `stage-j.mjs` | `buildLeadPayload()` → POST the qualified lead to your intake, `tenant_id` = **owner** tenant, prospect interest + AMF asset refs in `meta` | replaces the dead `DEMO_WEBHOOK_URL` |
| ⑤ One cockpit | `pulse.mjs` | pushes each AMF draft to `/api/hitl/create-approval` so Operational Pulse is the single HITL gate | header `x-hitl-key` |
| ② Feedback | `feedback-sync.mjs` | polls your decisions → writes CONTINUUM `ground_truth` with reward `{approve 1.0 · modify 0.7 · reject 0.2}` | `node feedback-sync.mjs --smoke` |
| ② Learning | `content-matcher.mjs` | **consumes** those rewards — approved topics rank ↑, rejected ↓ (bounded nudge). The loop now *closes* | `node content-matcher.mjs --smoke` |
| ↺ Return | `pulse-return.mjs` | a Pulse **approve** → triggers AMF render | idempotent |
| ④ Registry | `xenos-registry.json` | reconciles your 9 products ↔ our 14 into one canonical map | 13 mapped + 2 xenos-only |

### What we need back

1. **`XENOS_LEADS_URL` + `XENOS_LEADS_KEY`** — base URL + the scoped `x-intake-key` for
   `POST /api/crm/leads/capture` (Seam ①).
2. **`XENOS_HITL_URL` + `XENOS_HITL_KEY`** — base URL + the scoped `x-hitl-key` for the HITL
   endpoints (Seams ⑤ + ② + return path). One key, all three.
3. **Expose `GET /api/hitl/recent-decisions`** — per-tenant, `x-hitl-key`, query
   `?tenant_id=&limit=&since=`. This read-feed is what closes the learning loop; without it
   Seam ② has nothing to poll.
4. **The `meta` passthrough on `/capture`** (blocker B1) — echo our `meta` (product_interest +
   AMF asset refs) back on the lead so it routes to the right owner and attaches our media.
5. **Owner `tenant_id` UUIDs** — `xenos-registry.json` has **0 of 13** filled. We need the real
   UUIDs for the 5 confirmed products (and please ratify the `sekago` / `fluxcore` rows).
6. **Confirm the reward mapping is canonical** — we hard-coded `HITL_REWARD =
   {approve:1.0, modify:0.7, reject:0.2}` from `contracts.ts`. Confirm, or send the source of truth.

### Secret names only (P1)
```
XENOS_LEADS_URL   XENOS_LEADS_KEY      # Seam ① intake (x-intake-key)
XENOS_HITL_URL    XENOS_HITL_KEY       # Seams ⑤/②/return (x-hitl-key)
AMF_XENOS_TENANT                       # default owner tenant for polling recent-decisions
```

---

## B. StudioMunich VAULT — rented talent (Stage H rights wall)

### Built + verified on our side

| Piece | Module | What it does | Verify |
|---|---|---|---|
| Rights wall | `vault-guard.mjs` | every presenter passes through: `studiomunich:<actorId>` requires a verified `X-Rights-Signature` (HMAC-SHA256 over `[actorId, modality, phraseHash, duration, tier]`, **hard-reject on mismatch, timing-safe**); `digital:<id>` serves freely | `node vault-guard.mjs --smoke` (9/9) |
| Fail-safe | `produce-short.mjs` | no secret / 404 / forged / tampered / takedown → **decline → synthetic**. The unsigned human likeness is never served | real run: `studiomunich:astrid` → declined, MP4 still built |

### What we need back (handshake §7)

1. **The real Partner Integration Playbook** — the authoritative `/api/vault/v1/*` contract
   (not on disk here — point us to the file or push it).
2. **`STUDIOMUNICH_VAULT_URL` + `STUDIOMUNICH_VAULT_SECRET`** — live base URL + partner bearer.
3. **The exact `X-Rights-Signature` spec** — HMAC algorithm + the precise field order/encoding
   over `[actorId, modality, phraseHash, duration, tier]`, and how `VAULT_RIGHTS_SIGNING_SECRET`
   is provisioned. **Must match byte-for-byte** — our recompute uses a newline-joined canonical
   default; any divergence = hard reject, so this has to be exact, not approximate.
4. **Webhook contract** — the `X-SM-Signature` scheme + `SM_WEBHOOK_SIGNING_SECRET`, and the
   `talent.takedown` / `license.revoked` payloads (so "takedown-stops-serving" is provable).
5. **Full-frame vs matted/alpha** — does `/presence/render` return a full frame or an
   alpha-matted presenter? Decides whether VC's matte stays in the path.
6. **`/talent` catalog shape** — the JSON for the bookable "Faces by Industry" so the picker maps.
7. **One live test actor + the 5-check smoke** — a bookable actor we can license → render →
   verify → meter → takedown against, to turn "in shadow" into green.

Items **1–4** make render→verify→ledger a gated, fail-safe build (same discipline as the XENOS
seam). **5–7** make the first real signed short reproducible.

### Secret names only (P1)
```
STUDIOMUNICH_VAULT_URL   STUDIOMUNICH_VAULT_SECRET   # base URL + partner bearer
VAULT_RIGHTS_SIGNING_SECRET                          # verify X-Rights-Signature (step 4)
SM_WEBHOOK_SIGNING_SECRET                            # verify webhooks (takedown/revoke)
```

---

## How to hand things over

- **Secrets:** operator-to-operator, injected into `apps/amf/worker/.env.local` (gitignored) —
  never in this doc, chat, or a commit (P1). Each key gates its own seam and fail-safes when absent.
- **Contracts/specs (playbook, payload shapes, endpoint):** a file we can read, or a pushed doc
  (the pattern VC used with `AVATAR_CORE_HANDOVER.md`).
- **UUIDs:** paste the 5 confirmed owner `tenant_id`s and we fill `xenos-registry.json`.

When these land, each seam is a one-commit flip from gated to live — no new architecture, just the
inputs the code is already waiting for.

## Related

Amalgamation: [`AMF-XENOS-AMALGAMATION-HANDSHAKE.md`](./AMF-XENOS-AMALGAMATION-HANDSHAKE.md) · [`AMF-XENOS-RECONCILIATION.md`](./AMF-XENOS-RECONCILIATION.md) · VAULT: [`STUDIOMUNICH-TALENT-HANDSHAKE.md`](./STUDIOMUNICH-TALENT-HANDSHAKE.md) · Engine: [`AMF_ENGINE_MAP.md`](./AMF_ENGINE_MAP.md) · [`AMF_PROCESS.md`](./AMF_PROCESS.md) · Docs hub: [`INDEX.md`](./INDEX.md) · Map: [`../router.md`](../router.md)

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
