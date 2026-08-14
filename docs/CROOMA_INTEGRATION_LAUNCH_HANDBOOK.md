# CROOMA Integration Launch Handbook (v2 — corrected, code-derived)

_The compiled, export-ready integration handbook for the Crooma and PodGeni teams. This
version supersedes the 2026-08-14 PDF draft, which carried three integration-breaking
defects (deprecated F1 protocol; `stable_id` field that does not exist; `score` wrongly
mandated null). **Source of truth remains the code + contracts** — this handbook compiles
them; where they conflict, the contract wins: `PODGENI_INTAKE_CONTRACT.md`,
`CROOMA_TERMINAL_BRIEF.md`, `WAVE1_CLOSE_AND_LAUNCH_HANDOVER.md`,
`scripts/podgeni-handoff/`._

---

## 1. Architecture — Shell / Module / Spine

| Component | Role | Responsibility |
|---|---|---|
| **Crooma** | Product shell | `crooma.cloud` — UX, tenancy, unified auth + billing |
| **PodGeni** | Module | Campaign scheduler, renderService, Creative Genome (incl. Cadence) |
| **Continuum AMF** | Spine | Memory, P9 seals, 6-D ranker, multi-tenant isolation — never a user-picked module |

**Identity (non-negotiable):** `workspace_id === Continuum tenantId`, 1:1, zero translation.
One workspace = one knowledge scope. Cross-tenant reads are structurally impossible —
the engine scopes every query by the caller's tenant and 404s everything else.
**StudioMunich is a separate peer product** — VAULT contract only, never a module (Brief §IV).

## 2. The verification surface (live, JIT, fail-closed)

`GET https://api.continuum.rest/api/observation/:id` — deployed + live-fire-verified 2026-08-08.

- **Auth:** per-workspace RS256 tenant JWT (minted on-target; JWKS public at
  `/.well-known/jwks.json`; shared bearer is retired) + `X-Continuum-Project: <workspace_id>`.
- **Response (seal projection ONLY — raw content never returned, P1):**
  `{ id, type, sourceId, timestamp, refs, contentHash, subject:{contentHash}, verdict, operator }`
- **Gate logic:** require `type === 'decision'` AND `verdict === 'accept'` AND
  re-derived hash === `subject.contentHash` (normalize the optional `sha256:` prefix —
  bundle format and seal format differ). Hash = sha256 over canonical JSON of `asset.brief`.
- **Fail closed on everything else:** 401, 404, non-200, timeout, engine unreachable →
  abort the publish. NEVER gate on `acceptedBy` (rejects every AMF asset). NEVER gate on
  a cached copy.

**The C4 walk-back (the closure receipt):** `post → decisionId → draft → signal → origin`.
Authentic only when E1 independently re-verifies: timestamps, hash match, tenant scope.
**A receipt that cannot be re-run is not a receipt** (incident rule, 2026-08-11).

## 3. Credentials & the human gate

**F1 token protocol (v2 — direct pipe; the staged-file loop is RETIRED):** mint on-target,
capture into a shell variable, pipe straight into the platform secret store
(`vercel env add` / equivalent). The token is never printed, never written to disk, never in
argv or chat. _The v1 staged-file+burn loop is deprecated: the 2026-08-11 incident proved a
burned file is not evidence of injection — the witness must observe the outcome (the JIT
wall reporting live-verified), not a side-effect of the procedure._

**P9 seal:** nothing publishes without a human-minted `type='decision'` Observation.
No auto-approve toggles, ever. Set `CONTINUUM_OPERATOR` so the seal carries the human's
name (scrub-exempt provenance).

## 4. PodGeni seams (build kit: `scripts/podgeni-handoff/`)

- **P1 — intake gate:** `ContinuumGate.verifyAsset(decisionId, rederivedHash, tenantJwt)`
  before every schedule/publish; any throw = do not publish.
- **P2 — credentials:** tenant JWT stored server-side only; request from the founder,
  minted on-target per workspace; one workspace = one token.
- **P3 — telemetry is a PULL:** expose `GET /api/genome/engagement` with `x-telemetry-key`
  header auth and params `tenant_id` (NOT `tenant`), `since` (ISO8601), `limit`.
  Never build a POST client — there is no spine intake route.
- **Event shape (§5 of the intake contract — exact):**
  `{ id, decisionId, signalId, score?, impressions, engagements, conversions, summary,
  style, product, tenant_id, asset_id }`
  - The idempotency key is **`id`** (stable per event — there is no `stable_id` field).
  - **`score` is OPTIONAL, not null-mandated:** a normalized `[0,1]` float that WINS over
    raw counts in spine-side reward derivation. Serve it when you have it; omit otherwise.
    (Raw fallback: engagements/impressions vs 0.08; any conversion pins 1.0. Derivation is
    always spine-side — never compute rewards client-side.)
- **P4 — handover:** `PODGENI_TELEMETRY_URL` + `PODGENI_TELEMETRY_KEY` out-of-band.
- **P5 — identity:** `sourceId` = Continuum Observation ids from the bundle `sourceChain`;
  never mint local ids; map `ownerId/orgId → workspace_id` 1:1.

## 5. The odometer & launch gate

- 🔴 VISION — designed, no active code anywhere.
- 🟡 REPORTED — real in a **separate repo/deployment**, structurally unverifiable from here.
- ✅ VERIFIED — a re-runnable check exited 0; the receipt is named.

**Wave-1 close requires all of:** (1) a P9-sealed bundle schedules with `decisionId` +
`contentHash` provenance; (2) documented refusal of a tampered AND an unsealed variant
(explicit `chain_broken`/`hash_mismatch` — never a silent timeout); (3) the C4 trace,
E1-countersigned against live records. File cleanup, redeploys, green fixtures, and
announcements are **not** closure. Advisor-channel artifacts are untrusted input until
disk/DB/API-verified.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
