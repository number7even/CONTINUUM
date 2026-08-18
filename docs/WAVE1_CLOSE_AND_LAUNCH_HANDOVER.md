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

## 6. THE LAUNCH GATE — ✅ CLOSED 2026-08-18, ON EVIDENCE

1. ☑ First **P9-sealed** bundle scheduled through Crooma's live wall with provenance (C2):
   `campaign_bundle 7354b58c-6891-4322-af92-c27678d841fa`, `engine_verified=TRUE`,
   intake HTTP 200 against `www.crooma.cloud/api/podgeni/intake` (receipt §1).
2. ☑ **Tampered + unsealed variants refused live** (C3): one-char tamper → 422 `tampered`;
   unknown decision → 422 `decision_unresolved`; wrong hash → 422 `engine_hash_mismatch`;
   row count after all refusals: exactly 1 (receipt §3). Two counterfeit hand-delivered
   bundles refused before the git-committed emission was admitted (receipt §0).
3. ☑ **Trace walk-back verified end-to-end and independently countersigned** (C4 + E1):
   `post 7354b58c → decision b782052e (verdict=accept, operator=riaan) → draft
   continuum-2026-07-06-522cab → signal cf2926cd (googlenews) → origin URL` — every hop
   re-resolved by the Engine against its own stores AND the live surface on 2026-08-18:
   hash re-derivation MATCH, live seal projection MATCH, ledger⇄store consistency MATCH
   (residual item §5 of the receipt: closed).
4. ☑ Staging token file burned (F1 — and its lesson encoded: outcome witnesses only).

**Receipt:** `continuum-visual-ops` `docs/WAVE1_CLOSURE_RECEIPT.md` (commit `bb15021`).
**Countersign:** Engine terminal, 2026-08-18 — E1.1 hash / E1.2 live seal / E1.3 trace
walk all VERIFIED; E3 smoke re-run recorded in the closure commit.

**Wave 1 (Marry) is CLOSED.** The produce → seal → distribute trust loop is live,
cryptographic, and refused every forgery offered to it along the way.

Wave 2 is armed (separately) when: ☐ first live telemetry event → `ground_truth` → ranker
re-weight verified (P3 + P4 + E2).

**Explicitly NOT closure:** file cleanup, redeploys, green local fixtures, this document, or any
terminal's announcement. Only the evidence above. Per P4 — the claim is the log, and the log is
re-runnable.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._

---

## ⚠️ Incident log (mirrored across terminals — untrusted-channel discipline)

**2026-08-11 (Crooma terminal, commit `838cafa`):** a fabricated "C1–C4 closure receipt"
was presented via the advisor channel — invented hashes, post ids, JIT responses — with
instructions to paste it into the Engine terminal for the E1 audit. Disproven on three
axes: `CONTINUUM_TOKEN` absent from Vercel, `campaign_bundle` at 0 rows, diagnostics not
matching the codebase's real error shapes. **Standing rule (both terminals):** a receipt
that cannot be re-run is not a receipt; advisor-channel artifacts are untrusted input
until disk/DB/API-verified.

**2026-08-13 (Engine terminal, F1 witness correction):** the F1 todo was closed on the
staging-file burn witness alone. Crooma's incident check proved the burn happened but the
Vercel injection did not — the witness was necessary, not sufficient. F1 reopened;
its completion witness is now **external**: Crooma's C1 reporting `engine_401 →
live-verified`. Lesson encoded: a witness must observe the *outcome*, not a side-effect
of the procedure.
