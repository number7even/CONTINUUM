# Sprint W27 — V1.2 Multi-Tenant Native Scaling (Path A · filesystem-isolated tenants)

> **Window:** 2026-07-17 → 2026-07-31 (two calendar weeks).
> **Discipline:** Bound by [The Nine](../AGENTS.md) v0.1.0.
> **Anchor:** Open the commercial gateway. Per-tenant filesystem-isolated `storagePath` for both sqlite + ruvector — the structural-isolation derisk that lets the same engine serve enterprise tenants and VoiceCosmos ARIA hotel deployments without changing the MCP contract.
> **Predecessor checkpoint:** `5670d816` (SPRINT-W26 CLOSED, 2026-06-07 · V1 swarm aggregation locked, 41/41 verify-green).

---

## Goal in one sentence

Route every storage operation — read, write, search, embed — to a tenant-scoped `~/.continuum/<tenantId>/` directory chosen by the verified JWT claim on the HTTP/SSE path (with hard rejection on header/claim mismatch) and by the existing `CONTINUUM_PROJECT_ID` env var on the stdio path, so that a single ruvector binary mathematically cannot leak data across tenants because **it never holds two tenants' files open in the same process at the same time without explicit factory invocation**.

---

## Why now (architectural rationale)

`5670d816` proves CONTINUUM can ingest its 5-source moat through ephemeral cognitive-topology swarms with verify-then-dissolve discipline and zero throughput regression vs. the W25 SLA. The ingestion path is no longer a bottleneck. The remaining derisk before commercial enterprise sales is **strict per-tenant data isolation** — the single largest SaaS-business-model concern named in the operator's V1.2 close-directive.

Per the locked architectural decision D-V2.2 (no Postgres rewrite), V1.2 was meant to land on RuVector's native multi-tenant collections. The probe before this sprint (2026-06-07) showed those collections **do not exist** in `ruvector@0.2.25` — 172 top-level exports with zero named `Collection`/`Namespace`/`Tenant`, README full-text zero matches, VectorDb constructor silently ignores collection/namespace/workspace opts, `RuvectorCluster` is a multi-NODE distributed-cluster primitive (not tenant isolation). Path A — filesystem-isolated `storagePath` — replaces the missing native primitive with a **stronger** isolation guarantee (OS-level rather than namespace-by-convention) and avoids both the Postgres rewrite and the theatrical-abstraction trap of a fake "Collection API" wrapper.

Building V1.2 multi-tenant before this lands would force every adapter, every MCP tool, every checkpoint script to thread a `tenantId` through their own code — re-introducing exactly the honor-system risk Path A was chosen to eliminate.

---

## Honest findings from the ruvector@0.2.25 multi-tenant probe (2026-06-07)

The probe is the rationale for Path A's selection. Surfacing it in-doc so any future operator can re-run it and see the same answer.

### ❌ Native collections do not exist in ruvector@0.2.25

```
Top-level exports (172):     Collection? No. Namespace? No. Tenant? No.
README full-text search:     "collection" 0, "tenant" 0, "namespace" 0.
VectorDb constructor opts:   { collection, namespace, workspace } → silently ignored.
RuvectorCluster:             start/stop/join/leave/getNodes/isClusterLeader —
                              distributed multi-NODE primitive, NOT multi-tenant.
SemanticRouter:              addRoute/match/matchTopK — LLM routing, NOT tenant.
Source grep:                 createCollection / setNamespace / etc — zero matches.
```

`RuvectorCluster` is the distractor — it solves a different problem (running one tenant's data across multiple nodes). We do not touch it in V1.2. **One-line clarification noted; tracked.**

### ✅ Filesystem-level isolation IS supported and battle-tested

`VectorDb({storagePath: '<path>'})` already accepts any operator-chosen file path. The W25 benchmark harness uses tmpdir-per-run successfully (`scripts/benchmark-hybrid-2026-06-01.mjs:64`); `openStorage(projectId)` already routes to `~/.continuum/<projectId>/` via `dbPathForProject(projectId)`. The V1.2 work is to **lift `projectId` to `tenantId`** as the routing key on the HTTP/SSE path while preserving the existing single-tenant Journey 3 stdio behaviour.

---

## Non-goals (strictly out of scope — per partner-clause #3)

- **Postgres rewrite.** Filesystem isolation makes it unnecessary.
- **A fake "Collection API" wrapper** around per-tenant `storagePath`. **Path D explicitly rejected** by operator — theatrical abstraction violates P4.
- **`RuvectorCluster` distributed-node deployment.** Different problem.
- **OAuth provider integration / user-management UI.** V2 work. The W24-2 JWT middleware already extracts claims from any JWKS-backed issuer (Auth0, Clerk, Keycloak, Cognito) — we layer tenant claim validation on top, nothing more.
- **Tenant lifecycle CRUD MCP tools.** Provisioning a new tenant means `mkdir ~/.continuum/<tenantId>/`; deprovisioning is `rm -rf`. Operators do it out-of-band via shell. Per-tenant management endpoints are V2.x.
- **Cross-tenant analytics / ops dashboards.** Would re-introduce the honor-system filtering risk. Operators inspect `du -sh ~/.continuum/<tenantId>/` per tenant.
- **Per-tenant key encryption at rest.** Filesystem permissions are the V1.2 guarantee; KMS-backed envelope encryption is V2+.
- **Migration of the existing Fly engine's `/data/continuum/`** into a multi-tenant layout. The existing data becomes the "default" tenant in place; no data move.
- **Higher layers** (RVM, GitReverse, H-MARA, Vibely, DSPy.ts, RecursiveMAS, MidStream, Mike, Agentic-Jujutsu, TaskmasterAI, Ruflo) — firmly parked.

Mentioning any of these is fine. Writing code for any of them is the operator's leap, not this sprint's scope.

---

## Open commitments tracked from W26

- **GH Actions billing** still operator-side. `scripts/verify-w25-throughput.mjs` + `continuum verify` against `5670d816` remain the local witness chain. W27 PRs validate via the same path until billing clears.
- **`ruv-swarm/src/index-enhanced.js` deep-internal import** still fragile to upstream refactor (W26-1 follow-up note). Tracked; no action this sprint.
- **`apps/console` Vercel deployment** is single-tenant by construction (one Fly engine, one Bearer token). V1.2 makes the engine multi-tenant; the console's single-tenant access pattern remains valid (it authenticates as one tenant). Multi-tenant console-side UX is V2.

---

## The five deliverables

### W27-1 · `HybridStorageBackend` accepts explicit `storagePath` per tenant

**Owner:** coder
**Acceptance:**

- `openStorage(tenantId: string)` continues to be the single public factory. Internally, `tenantId` flows through `dbPathForProject(tenantId)` → `~/.continuum/<sanitisedTenantId>/{continuum.db,ruvector.db}`. **The existing W23+ public API surface does not change**; the parameter semantics widen from "project name" to "tenant identifier" (functionally the same operation, broader interpretation).
- **Tenant ID sanitisation** is the security gate. `tenantId` enters via JWT (trusted) and/or HTTP header (untrusted). Before it touches the filesystem it MUST pass `sanitiseTenantId(raw): string | null` which:
  - Rejects empty / whitespace-only IDs.
  - Rejects `..`, path separators (`/`, `\`), null bytes, control characters.
  - Restricts to `[a-z0-9-_]{1,128}` (lowercased input).
  - Returns `null` if any check fails; caller maps `null` → HTTP 400.
- New `packages/core/src/tenant.ts` exports `sanitiseTenantId(raw)` and `tenantDataDir(tenantId)`. Both are pure functions; tested as a unit (no live DB / swarm needed).
- The `HybridStorageBackend` constructor already accepts a `projectId` and derives all paths from it — no signature change required. The semantic change is purely at the factory + sanitisation gate.

**Estimate:** 1 commit · ~3 hours.

---

### W27-2 · `buildServer(tenantId)` factory threads the resolved tenant into the MCP surface

**Owner:** coder
**Acceptance:**

- The existing `buildServer(projectId)` factory in `packages/mcp-server/src/server.ts` already constructs a per-instance storage backend (W23-era refactor `abebb45`). Parameter widens semantically: `buildServer(tenantId: string)` calls `openStorage(tenantId)` after sanitisation.
- A new MCP-level invariant: every MCP tool handler reaches storage through the `buildServer`-injected backend ONLY. There is no module-level `openStorage(...)` call inside any tool handler. A static grep rule in CI fails the build if any file in `packages/mcp-server/src/tools/` references `openStorage` directly.
- The HTTP transport (`packages/mcp-server/src/http.ts`) extends its existing per-session flow: when a request arrives with a valid auth context (W27-3), it calls `buildServer(req.continuum.tenantId)` to spawn an isolated MCP server bound to that tenant's storage. Different tenants get different `buildServer()` invocations producing different `Server` instances; nothing is shared across tenants except read-only static config (tool definitions, prompt registry).
- A new `node:test` file `packages/mcp-server/src/build-server.test.ts` asserts:
  - `buildServer('tenant-a')` and `buildServer('tenant-b')` return distinct `Server` instances.
  - Each writes to its own DB file (verified by inspecting `storage.dataLocation()`).
  - Static grep over `dist/tools/` finds zero `openStorage` references.

**Estimate:** 1 commit · ~3 hours.

---

### W27-3 · JWT tenant-claim extraction + `X-Continuum-Project` header validation

**Owner:** coder
**Acceptance:**

- Extend `packages/mcp-server/src/auth.ts` (W24-2 JWT middleware) with a tenant validation layer:
  - JWT mode: the middleware already extracts a configurable tenant claim into `req.user.tenant`. New step — read the `X-Continuum-Project` request header. If present AND it does not match `req.user.tenant`, return **HTTP 403** with body `{error: 'tenant-claim-mismatch', expected: req.user.tenant, asserted: header}`. If absent, use `req.user.tenant` directly. If both absent, return HTTP 400.
  - Shared-secret mode: tenant routing falls back to `CONTINUUM_PROJECT_ID` env on the server side (legacy single-tenant OSS-self-host workflow stays operational). Optional `X-Continuum-Project` header is honored ONLY when the env-set default isn't restrictive — operator chooses by env layering.
  - stdio mode: the middleware is never invoked. `CONTINUUM_PROJECT_ID` env is the workspace identifier exactly as in W26 and earlier. **Journey 3 zero-config preserved verbatim.**
- The resolved `tenantId` flows into the request handler chain as `req.continuum.tenantId` (a new `req.continuum` namespace to avoid colliding with any future `req.tenant` from other middleware).
- New node:test cases in `auth.test.ts`:
  - `jwt mode: tenant claim + matching header → req.continuum.tenantId set`
  - `jwt mode: tenant claim + mismatched header → 403 with structured body`
  - `jwt mode: tenant claim + no header → req.continuum.tenantId = claim`
  - `jwt mode: no tenant claim → 400`
  - `jwt mode: tenant claim contains '../' → 400 (sanitiseTenantId rejects)`
  - `shared-secret mode + CONTINUUM_PROJECT_ID set → req.continuum.tenantId = env`
  - `stdio path: auth middleware never runs → CONTINUUM_PROJECT_ID is the workspace id`
  - **16+7 = 23 node:test cases** total in auth.test.ts.

**Estimate:** 2 commits · ~5 hours.

---

### W27-4 · Mechanical cross-tenant isolation proof

**Owner:** coder
**Acceptance:**

This is the deliverable the operator named explicitly: "Define your mechanical proofs for how we will verify data isolation without relying on the honor system." Five layered proofs, each independently sufficient:

1. **`node:test` isolation test** (`packages/core/src/tenant-isolation.test.ts`):
   - Open `tA = openStorage('alpha')`, `tB = openStorage('bravo')` in the same process.
   - `tA.insertObservation({...sentinel-A...})` → returns Observation with stable ID.
   - `tB.getObservations([sentinel-A.id])` → returns empty array.
   - `tB.searchObservations('SENTINEL_A_TOKEN')` → returns zero hits.
   - Repeat in reverse direction; assert symmetry.
   - Filesystem assertion: `tA.dataLocation() !== tB.dataLocation()` AND the paths differ by tenant component.

2. **Path-traversal guard test** (`packages/core/src/tenant.test.ts`):
   - `sanitiseTenantId('../../etc/passwd')` → null
   - `sanitiseTenantId('/absolute/path')` → null
   - `sanitiseTenantId('tenant\x00null')` → null
   - `sanitiseTenantId('tenant/sub')` → null
   - `sanitiseTenantId('Tenant-A')` → 'tenant-a' (lowercased and accepted)
   - `sanitiseTenantId('a'.repeat(129))` → null (length cap)
   - 12 cases covering positive and negative paths.

3. **HTTP-layer isolation test** (`packages/mcp-server/src/http.test.ts` — new):
   - Spin up the engine in JWT mode.
   - Issue token-A (claim `tenant: 'alpha'`), call MCP `tools/list` and `continuum_record_checkpoint` over SSE; the row lands in `alpha`'s DB.
   - Issue token-B (claim `tenant: 'bravo'`), call `continuum_get_state` over SSE; the response MUST NOT include token-A's checkpoint.
   - Issue token-B with `X-Continuum-Project: alpha` header → 403.

4. **Filesystem-audit script** (`scripts/verify-w27-isolation.mjs`):
   - Synthetic 3-tenant setup: insert distinct sentinel observations into three tenants.
   - For each pair (i, j) ∈ {0,1,2}² where i≠j, assert: `du -sh ~/.continuum/<tenant_i>/` shows distinct directory; `cat <tenant_i>/continuum.db | grep <tenant_j sentinel>` returns no hits; `openStorage(tenant_j).getObservations([tenant_i sentinel id])` returns empty.
   - 6 cross-checks (3 tenants × 2 directions). Script exits 0 only if all 6 pass.

5. **Static drift-protection grep** (CI-enforced via the W27-close checkpoint's verify_command):
   - No file in `packages/mcp-server/src/tools/` may reference `openStorage` directly. (The factory injection IS the architecture.)
   - No file in `packages/mcp-server/src/` may reference a literal storage path. (All paths flow through `tenantDataDir`.)
   - No occurrence of `CONTINUUM_PROJECT_ID` inside tool handlers (tools see only the injected backend, never the env).

**Estimate:** 2 commits · ~6 hours.

---

### W27-5 · Idle-tenant cache + memory budget

**Owner:** coder
**Acceptance:**

Per-tenant `HybridStorageBackend` instances hold non-trivial memory (~50-100MB for the embedder pool + ruvector HNSW index). N tenants × 100MB = real memory pressure on the Fly shared-cpu-1x 512MB engine the moment tenant count grows past ~3.

- **`TenantRegistry`** in `packages/mcp-server/src/tenant-registry.ts`. Methods:
  - `acquire(tenantId): HybridStorageBackend` — cache-hit returns the open backend; cache-miss opens it.
  - `release(tenantId)` — decrements ref count.
  - Background eviction: backends with ref count 0 and idle ≥ `CONTINUUM_TENANT_IDLE_TIMEOUT_MS` (default 300_000 = 5min) are closed and removed from cache.
  - `stats()` — diagnostic for `/healthz` enrichment: `{ open: N, idleCandidates: M, lastEvictedAt: ... }`.
  - Hard cap: `CONTINUUM_MAX_OPEN_TENANTS` (default 32). When the cache is full and a miss arrives, the least-recently-used idle backend is force-closed to make room.
- Acquire+release wrap each HTTP request in the auth middleware chain (acquire before `buildServer`, release in `finally` of the response handler).
- `node:test` cases for the registry: acquire/release ref counting, eviction after idle timeout, LRU under cache pressure, force-close races.

**Estimate:** 1 commit · ~4 hours.

---

## Procedure

A sequencing decision rather than a measure-tune loop — V1.2 is a structural sprint.

1. **W27-1 first** (half day). Land `sanitiseTenantId` + `tenantDataDir` + the `openStorage(tenantId)` semantic widening. Unit-test the pure functions. **Do not proceed to W27-2 until path-traversal cases all reject.**
2. **W27-4 second, partial** (half day). Land just the `node:test` cross-tenant isolation test + the `tenant-isolation.test.ts`. This gives the rest of the sprint a mechanical witness for the isolation claim from the first PR onward.
3. **W27-2 third** (half day). Wire `buildServer(tenantId)`. Add the no-`openStorage`-in-tool-handlers grep gate. Existing 31 MCP tools + 4 Resources + 2 Prompts continue to pass their tests against the injected backend.
4. **W27-3 fourth** (full day). Extend the auth middleware. Land the 7 new auth.test.ts cases. The HTTP smoke (`scripts/http-smoke.mjs`) gets a new check: token-A's writes invisible to token-B.
5. **W27-5 fifth** (full day). `TenantRegistry` + idle eviction + LRU cache. Validate memory pressure on a synthetic 10-tenant burst test.
6. **W27-4 close** (half day). HTTP isolation tests + filesystem-audit script + the static drift-protection greps. The W27-close checkpoint's verify_command encodes the script invocation + the greps.
7. **W25 SLA gate re-run** after each PR. The multi-tenant work touches the storage factory but NOT the ingest hot path; SLA should hold by construction. Verify mechanically.

---

## Guardrails

1. **Path A only.** No fake "Collection API" wrapper. The factory routes by tenant; the storage backend is unaware that "multi-tenant" is a thing. If a future change adds a `setTenant(...)` mutator to `StorageBackend`, **revert and re-architect** — that's the Path D trap.
2. **`sanitiseTenantId` is the security gate.** Every path that turns a string into a filesystem segment goes through it. Adding a bypass anywhere is a sprint-stopping defect.
3. **`req.continuum` namespace.** Do not put tenant context on `req.tenant`, `req.user.tenant`, or `req.session`. One canonical place; one extraction point in middleware; one read point in `buildServer`.
4. **W25 SLA holds.** `verify-w25-throughput.mjs` runs per PR. If the multi-tenant routing somehow regresses ingestion (e.g. a per-request `openStorage` call inadvertently re-loads ruvector), **stop and fix before merging**.
5. **Journey 3 untouched.** Anyone running `continuum start` over stdio with no env or config must see the SAME workspace at the SAME path with the SAME data as in W26. The W23-era `apps/console` flow stays operational.
6. **No cross-tenant cursor leak.** The `TenantRegistry` evicts backends only after the last `release()` and the idle timeout — never mid-request. Reference counting > timer-driven eviction.
7. **Filesystem path stays under `~/.continuum/`.** The sanitisation guard makes path traversal impossible; the factory enforces the `continuumDataRoot()` prefix as the only base.

---

## Local environment readiness check

Pre-flight checks (as of 2026-06-07):

- ✅ W26-close snapshot `5670d816` verifies 41/41 green in 11s
- ✅ W25 SLA gate (`verify-w25-throughput.mjs`) passes — 49.16s on the post-W26 run
- ✅ ruvector@0.2.25 supports per-instance `storagePath` (W25 benchmark proves it daily)
- ✅ `openStorage(projectId)` already routes by string identifier
- ✅ JWT middleware in `auth.ts` extracts a configurable tenant claim into `req.user.tenant` (W24-2)
- ✅ `buildServer(projectId)` factory already exists (abebb45) — semantics widening only
- ✅ Per-session `Server` instance pattern is the V1 HTTP/SSE design (not a refactor)
- ⚠️ **Per-tenant memory cost not yet measured** — first action of W27-5 is a 10-tenant burst test to quantify before tuning `CONTINUUM_MAX_OPEN_TENANTS`
- ⚠️ **GH Actions billing still operator-side.** Local witness chain is the validation path until cleared.

**Baseline action is W27-1 (unit-tested pure functions).** No live-engine work until the sanitisation gate is in place — refusing to land any code that touches the filesystem with an un-sanitised tenant identifier.

---

## Sprint exit criteria

A sprint review document `docs/SPRINT-REVIEW-W28.md` written on 2026-07-31 must answer:

1. **Does `sanitiseTenantId` reject every adversarial input** in the unit-test suite? (Path traversal, null bytes, length overflow, case sensitivity, special chars.)
2. **Is cross-tenant data leakage mechanically impossible?** The 5 layered proofs (in-process node:test, HTTP-level test, filesystem-audit script, static greps, path-traversal unit tests) all green.
3. **Does Journey 3 stdio still work zero-config?** Fresh clone, `continuum start`, the same workspace appears at `~/.continuum/<env-or-cwd-basename>/` — identical to W26 behaviour.
4. **Does the JWT auth flow correctly extract + validate tenant claims?** 7 new auth.test.ts cases pass; HTTP 403 on header/claim mismatch; HTTP 400 on missing claim.
5. **Is the `TenantRegistry` LRU + idle-eviction healthy?** 10-tenant burst test stays under the Fly shared-cpu-1x 512MB ceiling; `/healthz` reports cache stats.
6. **Does `verify-w25-throughput.mjs` still pass?** Single-tenant ingestion path unchanged → no SLA regression.
7. **Is the closing checkpoint stamped** and does `continuum verify` come back green against it? Snapshot row for each W27 deliverable.
8. **What's the V2 anchor?** Either deeper multi-tenant ops (per-tenant cost analytics, quota enforcement), V2.1 RVF cognitive containers (the architectural ledger's next milestone), V2.2 OAuth provider integrations, or the queued integration backlog (#1/#2/#3/#5/#6/#7/#19/#21/#22) — operator's call.

---

_Last updated: 2026-06-07._
_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
