# SPEC: CONTINUUM Autonomous Agentic Workflows

**Spec-ID:** OS-PROTO-01 · **Status: DRAFT — pending founder ratification** ·
**Revision:** 2026-08-11 (supersedes the 2026-07-06 external draft, whose odometer
mis-tagged three shipped capabilities as vision and undercounted the tool surface) ·
**Format:** OKF · **Discipline:** every tag below is grep/probe-backed; tags wrong in
*either* direction are defects (claiming built things are vision invites rebuilding them).

Odometer legend: ✅ VERIFIED (proven on this disk / live probe, receipt named) ·
🟡 REPORTED (real in a separate repo/deployment) · 🔴 VISION (no active code anywhere).

---

## 1. Core thesis — proof-gated state (P2/P4)

### 1.1 Verify-then-dissolve lifecycle — ✅ VERIFIED
"Done is not a button." A `StateEntry` transitions only through a passing verification
gate; the execution context dissolves, the proof-backed state remains.

### 1.2 The `verifyCommand` witness — ✅ VERIFIED
`packages/core/src/types.ts:75` (`verifyCommand`), `:79` (`verifiedAt`). Execution is
**split-timeout, by surface** (the 07-06 draft claimed a blanket 30s — wrong):
- CLI `continuum verify`: `execSync`, **30s per-command** timeout (`cli/index.ts:949, 1057`).
- MCP `validate` tool: `execSync`, **120s** timeout (`mcp-server/src/tools/validate.ts:53`).
Only exit-0 admits a transition; timeout/non-zero → FAILED. Synchronous capture prevents
race-condition assertions.

### 1.3 Tamper-evident checkpointing — ✅ VERIFIED
`product_state[]` snapshots (active/dormant/broken) hash-chained via canonical-JSON
SHA-256. Live example: the decision seal is welded into the checkpoint hash
(verify-decision-seal, 14/14).

## 2. Orchestration cadence — Conductor / Doer / Human

### 2.1 Separation model — ✅ VERIFIED
Conductor intent captured via `AgentHandoffMetadata` (`31fe885`); the Doer cannot
self-certify — state changes ride the witness command.

### 2.2 Six-state status model — 🔴 VISION (dashboard) over ✅ VERIFIED signals
RUNNING / REVIEW / DONE / SKIPPED / BLOCKED / FAILED. The underlying signals all exist
(CLI verify in flight; `review.mjs`; `record-checkpoint`; snapshot dormant[]; gated
env; exit-non-zero). The unified status *dashboard* is roadmap.

### 2.3 The P9 human review gate — ✅ VERIFIED *(07-06 draft wrongly tagged VISION)*
`apps/amf/worker/review.mjs` is live (66 drafts queued at revision time). HITL rewards
1.0 / 0.7 / 0.2 land as `ground_truth`; `feedbackWeight()` re-weights the 6-D ranker
bounded **0.8–1.3** (gate: telemetry-sync 10/10). Reward band (0.2..1.0) and nudge band
(0.8..1.3) are distinct — do not conflate.

## 3. Ephemeral swarms & cognitive topologies (V1.5) — 🔴 VISION
`continuum_spawn_swarm`, mesh/ring/hierarchical topologies, 3D-brain surfacing: no
active code. Correctly parked behind Wave-1 closure; design intent recorded here only.

## 4. Hybrid tenant data model (D-V2.2) — ✅ LOCKED *(07-06 draft wrongly called this an open flag)*
Founder-locked **2026-08-10**, `ARCHITECTURE.md §14` (commit `92dc94d`):
- **Data plane, per-tenant, sovereign:** isolated SQLite + RuVector HNSW under
  `$CONTINUUM_DATA_DIR/<tenantId>/` (local `~/.continuum/`, Fly `/data/`).
- **Control plane, content-free:** thin Postgres directory — tenancy, OAuth, billing
  webhooks, quotas. Never tenant content. — 🔴 build itself is VISION (V2).
- **⚠ Production caveat (binding):** `factory.ts:56` defaults to **hybrid**, which
  cannot become ready on the 512MB VM (took production down 2026-08-07). Hosted
  deploys **pin `CONTINUUM_STORAGE_BACKEND=sqlite`** (`fly.toml`, commit `db87d4a`)
  to preserve ~150MB physical headroom. RuVector side remains a stub behind maturity
  gating.

### 4.3 Tenancy gating — ✅ VERIFIED live *(07-06 draft wrongly tagged VISION)*
RS256 JWT mode with per-tenant `tenant` claim, on-target minting against the
volume-persisted issuer key, JWKS public at `/.well-known/jwks.json`. Live-fire proof
2026-08-08: authenticated probe of `GET /api/observation/:id` → seal projection only,
cross-tenant/unknown → 404, unauth → 401, hash re-derivation match (witness row
`jit-probe-wave1-001`).

## 5. Ethical boundaries (P7/P8) — ✅ VERIFIED
- **Permanent scraping ban** (founder-locked 2026-08-10, Brief §II.10 + `92dc94d`):
  no session-cookie scraping, no credential reuse, no HTML scraping around explicit
  blocks. Official APIs + compliant keyless feeds only (RSS, HN API, Google News).
- **11-pattern secret scrub** at the single write choke-point `upsertObservation`
  (GCP/JWT/Slack/Stripe/GitHub/AWS/SSH et al.); guest-PII tier via
  `CONTINUUM_PRIVACY_PII=1` (`observation.ts:276`).
- **P5 symmetry:** humans and agents are symmetric principals under proof; neither is
  exempt from evidence.

## 6. Anti-rationalization & enforcement — ✅ VERIFIED

| Agent excuse | Enforcement |
|---|---|
| "Timed out; assuming success." | Timeout → FAILED. No state without exit-0 (P2). |
| "File exists, so it's done." | Existence ≠ function; the witness tests logic (P4). |
| "I updated the doc; state is active." | Docs aren't truth — proof from the artifact (P4). *Live case: three false cross-terminal "done" claims caught by witness commands, 2026-08-07/-10/-11.* |
| "Env unstable; skipping verify." | Unstable → `broken[]`. Safety outranks helpfulness (P6). |
| "The grep showed five, so there are five." | **Truncated measurement ≠ census.** A `head -N`ed result is a display window, not a total; counts come from scripts that walk the full set. *Live case 2026-08-17: "5 direct KB writers" was a `head -5`; the measured set was 17 (3.4× understated) — while the paired "live PII exposure" claim was simultaneously OVERstated (5 rows, zero PII markers on measurement). Both directions, one exchange, caught only when a script replaced the hand-count.* |

- **Tool surface (audited 2026-08-11):** **24 tool modules** in
  `packages/mcp-server/src/tools/` (25 files − `index.ts`). The "9 tools" (CLAUDE.md,
  now corrected) and "14 modules" (07-06 draft) figures are both retired.
- **Efficiency claims:** ~**2.85x** measured token saving (up to 5.3x single-record),
  reproducible via `scripts/benchmark-token-savings.mjs`. "10x" remains dead.

---

_Ratification: this spec becomes **RATIFIED** only by explicit founder sign-off recorded
as a `type='decision'` Observation referencing this file's content hash — the same seal
discipline it specifies._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
