# Wave-1 Close & Launch — Handover and Requirements

_The single authoritative checklist to close **Wave 1 (Marry)** in live production and arm
**Wave 2 (Learn)**. Everything in §1 is verified; everything in §2–§5 is a requirement with an
owner and a proof. When every box in §6 is green, Wave 1 is ✅ — not before, and nothing else
counts as closure. Supersedes nothing; composes with `CROOMA_TERMINAL_BRIEF.md` (invariants),
`PODGENI_INTAKE_CONTRACT.md` (wire contracts), `CROOMA_COORDINATION.md` (ownership)._

_Status date: 2026-08-10 · branch `feature/jarvis-graph-surface` @ `8b00694`._

---

## 1. What is already proven (build on this; do not rebuild it)

| Fact | Evidence |
|---|---|
| Engine live at `https://api.continuum.rest` in **JWT mode**, sqlite backend, healthy | `/healthz` `ok:true` · deploy fixes `db87d4a` |
| JWKS public (no auth) at `/.well-known/jwks.json` | live probe 200 |
| By-id seal verification **live-fire proven**: authed probe → seal projection only (raw body shielded), 404/401 fail-closed, local sha256 == `subject.contentHash` | witness row `jit-probe-wave1-001` · spec §6.4 (`035cc98`) |
| Seam 1+2 **wire contracts published** | `PODGENI_INTAKE_CONTRACT.md` §2 + §5 (`d73e36f`) |
| **Drop-in integration kit published**, audited + syntax/behaviour-checked | `scripts/podgeni-handoff/` (`8b00694`) |
| Crooma wall wired + fail-closed at `engine_401`, gate 40/40, `CONTINUUM_URL` set in Vercel prod | `continuum-visual-ops` @ `d3d885c` |
| D-V2.2 tenancy locked · scraping ban permanent (Brief §II.10) | `92dc94d` |
| Crooma tenant `bf807b39-0c2a-462b-a767-fa30ce711552` provisioned (enterprise/active, RS256, exp 2026-11-08) | token staged on engine volume |

Engine-side code is **frozen**. No requirement below touches it.

---

## 2. FOUNDER (Riaan) — the three human actions

Nothing launches without these; none can be delegated (P9).

- [ ] **F1 — Token loop (60s, out-of-band).**
  `flyctl machine exec 1859162f329478 -a continuum-engine "cat /data/handoff/crooma-tenant.txt"`
  → paste the `Bearer` value as `CONTINUUM_TOKEN` in the **Crooma Vercel** project (dashboard,
  never chat/argv) → Crooma terminal redeploys → burn:
  `flyctl machine exec 1859162f329478 -a continuum-engine "rm /data/handoff/crooma-tenant.txt"`
- [ ] **F2 — The P9 leap.** Approve the first draft in the engine's `review.mjs` queue (66 waiting).
  This mints the first live `type='decision'` seal. One approve is enough to close Wave 1.
- [ ] **F3 — StudioMunich hat (parallel, not blocking Wave 1).** Review/merge SM **PR #45**,
  enable the `galleries` feature flag, set `CONTINUUM_URL` in SM env. (Brief §IV rules apply.)
- [ ] **F4 — When PodGeni needs its tenant:** mint on-target only —
  `flyctl machine exec 1859162f329478 -a continuum-engine "node /app/packages/cli/dist/index.js provision-tenant <podgeni-workspace-id> --issuer https://api.continuum.rest --audience continuum-api"`
  (one workspace = one token; never share the Crooma or `continuum` tokens across workspaces).

## 3. CROOMA terminal (`continuum-visual-ops`) — close the wall

- [ ] **C1 — Redeploy after F1** and verify the JIT handshake goes `engine_401` → **live-verified**.
- [ ] **C2 — Run the Wave-1 gate against the LIVE engine** (not fixtures): sealed bundle from F2
  schedules with `decisionId` + `contentHash` stamped as provenance.
- [ ] **C3 — Prove the wall holds live:** a tampered variant and an unsealed asset are both
  **refused** (`chain_broken` / `missing_brief` / hash mismatch — fail closed).
- [ ] **C4 — Walk the trace back** on the scheduled post: `post → decisionId → draft → signal →
  origin` and capture the log. **This log is the closure receipt — deliver it.**
- [ ] **C5 — Hold the lines:** no Source/Sink adapter, no DAM fold, no minted ids (Brief §VI);
  scraping ban §II.10 applies to every future ingest proposal.

## 4. PODGENI team (`pod-geni`) — the two seams

Everything needed is published; both files are drop-in. Wire contract: `PODGENI_INTAKE_CONTRACT.md`.

- [ ] **P1 — Seam 1 (intake gate).** Integrate `scripts/podgeni-handoff/ContinuumGate.js` into the
  GCloud/Firebase scheduler: call `verifyAsset(decisionId, rederivedHash, tenantJwt)` immediately
  before every schedule/publish; **any throw = do not publish**. Hash = sha256 over canonical JSON
  of `asset.brief` (`sha256:` prefix tolerated). Gate on `contentHash`+`decisionId`, **never**
  `acceptedBy`; verdict value is `"accept"`.
- [ ] **P2 — Tenant credentials.** Request the workspace tenant JWT from the founder (F4). Store it
  server-side; it never ships to clients.
- [ ] **P3 — Seam 2 (telemetry PULL endpoint).** Deploy
  `scripts/podgeni-handoff/telemetry-endpoint-template.js` semantics: expose
  `GET /api/genome/engagement` with `x-telemetry-key` auth and `tenant_id`/`since`/`limit` params,
  serving the §5 event shape (raw counts; stable per-event `id`; `?? null` for score).
  **Do NOT build a POST client — Continuum pulls.**
- [ ] **P4 — Hand over `PODGENI_TELEMETRY_URL` + `PODGENI_TELEMETRY_KEY`** (out-of-band) so the
  spine can un-gate `telemetry-sync.mjs`.
- [ ] **P5 — Identity mapping.** `workspace_id === Continuum tenantId` (1:1, no translation);
  asset `sourceId` = the Continuum Observation ids from the bundle's `sourceChain` — never
  self-minted. Answer Q1–Q10 in `pod-geni/docs/crooma-podgeni-alignment.md`.

## 5. ENGINE terminal (this repo) — verification-only

- [ ] **E1 — On C4's log:** independently verify the walk-back against the live engine before any
  closure claim is stamped.
- [ ] **E2 — On P4:** set `PODGENI_TELEMETRY_URL`/`KEY`, run `telemetry-sync.mjs`, verify the first
  live `ground_truth` Observation lands and `feedbackWeight()` re-weights (fb within 0.8–1.3).
  That first event **un-starves Wave 2**.
- [ ] **E3 — Truth-up:** flip spec §8.2/§8.3 and `CLAUDE.md` to Wave-1 ✅ with the receipts named;
  re-run `make smoke` (44/44) to prove the engine stayed frozen.

---

## 6. THE LAUNCH GATE — definition of done (all boxes, in evidence, or it isn't closed)

1. ☐ First **P9-sealed** bundle (human-approved, F2) **schedules** through Crooma's live wall with
   `decisionId` + `contentHash` provenance (C2).
2. ☐ **Tampered + unsealed variants refused** by the live wall (C3).
3. ☐ **Trace walk-back** verified end-to-end and independently re-checked (C4 + E1).
4. ☐ Staging token file **burned** from the engine volume (F1 hygiene — necessary, not sufficient).

Wave 2 is armed (separately) when: ☐ first live telemetry event → `ground_truth` → ranker
re-weight verified (P3 + P4 + E2).

**Explicitly NOT closure:** file cleanup, redeploys, green local fixtures, this document, or any
terminal's announcement. Only the evidence above. Per P4 — the claim is the log, and the log is
re-runnable.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
