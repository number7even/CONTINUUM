# Sprint 2026-W24 + W25 — V1.1 HTTP Polish (OSS/Docker Baseline)

> **Window:** 2026-06-12 → 2026-06-26 (two calendar weeks).
> **Discipline:** Bound by [The Nine](../AGENTS.md) v0.1.0.
> **Anchor:** V1.1 HTTP polish — TLS + auth + supervision + container hardening — the **OSS/Docker Baseline** that the V1.2 multi-tenant SaaS tier will eventually rely upon.
> **Predecessor checkpoint:** `0853a7ae` (SPRINT-W23 CLOSED, 2026-06-02).

---

## Goal in one sentence

Harden the V1 HTTP/SSE transport from "Bearer-token stub that works on Fly" into a **production-grade OSS surface** that any operator can self-host via Docker without sacrificing security, with TLS terminated cleanly at the edge, JWT-based per-tenant auth, container running as non-root with dropped capabilities, and a documented npm-audit posture — and clear Issue #18 (the fragile cross-source FTS5 canary) along the way.

---

## Why OSS-first (architectural rationale)

We **cannot** build for the Solo Developer (Journey 3 ✅ shipped), the OSS community (Journey 3+ in target — partial), and the ARIA enterprise tenants (Journey 2 🔮) simultaneously. Per the architectural review during the W23-close exchange, OSS-first **forces us to harden the foundational infrastructure** (TLS, auth, supervision, container hygiene) that the multi-tenant SaaS tier will inherit.

Building V1.2 multi-tenant (Path B) or V1 ruv-swarm (Path C) before the OSS surface is sealed would create **derived complexity** that V1.1 would later have to retrofit — exactly the architecture-grows-while-code-lags antipattern partner-clause #3 was written to detect.

---

## Non-goals (strictly out of scope this sprint)

Per partner-clause #3 — these are **firmly parked** on the backlog and will NOT enter W24:

- **Issue #19 — RVM integration.** Multi-year horizon. Source checkout exists; zero in-repo code.
- **Issue #21 — GitReverse integration.** V0.5+. Spec lives in chat transcript; needs filing.
- **Issue #22 — H-MARA reasoning core.** V2 horizon. Gated on local inference + RVM.
- **V1.2 multi-tenant collections (D-V2.2 locked).** V2.0 work. Will not pre-emptively scaffold.
- **ruv-swarm neural ingestion (V1+ proposal).** Mesh/ring topologies wait until V1.1 lands.
- **`vectorSearch` MCP tool surfacing.** V0.6+ work — RRF hybrid-search fusion.

Mentioning any of these is fine. Building any of them is the operator's leap, not this sprint's scope.

---

## Open commitments tracked from W23

- **Issue #11 (CI workflow)** — operator handling GitHub Actions billing out-of-band. The CI YAML is in `8fee078`; when billing clears, the first push will trigger the run. Closing the ticket is automatic on first green run.
- **Dormant verify pin drift** on the `0853a7ae` snapshot's `docs-v0.5-hybrid-reference` entry (greps for one-word "rollback" but the doc uses "Rolling back"). Fix in next mid-sprint checkpoint — purely cosmetic on a dormant entry.

---

## Week 24 — TLS + Auth + Supervision (June 12 → June 19)

### W24-1 · TLS termination — operator-documented reverse-proxy pattern
**Owner:** coder
**Acceptance:**
- `docs/DEPLOY_SELF_HOSTED.md` (new) covers three TLS terminators with verified examples:
  - **Caddy** (zero-config, automatic Let's Encrypt) — primary recommendation for OSS
  - **nginx** (manual cert, manual config) — for existing nginx fleets
  - **Traefik** (label-driven, Docker-native) — for docker-compose stacks
- A `docs/examples/caddy/` directory with a `Caddyfile` + `docker-compose.yml` that boots a CONTINUUM engine behind Caddy with HTTPS in one command.
- Engine continues to serve **plain HTTP** internally (no built-in TLS) — terminator owns TLS. Rationale: don't reinvent what nginx/Caddy/Traefik do better; keep the Node process simple.
- `docs/V0.5-HYBRID.md` cross-references the new deploy doc.

**Estimate:** 1 commit · ~3 hours.

---

### W24-2 · JWT validation middleware (bring-your-own-OAuth)
**Owner:** coder
**Acceptance:**
- New middleware in `packages/mcp-server/src/http.ts` that, when `CONTINUUM_JWT_ISSUER` + `CONTINUUM_JWT_AUDIENCE` are set, validates incoming `Authorization: Bearer <jwt>` against the issuer's JWKS endpoint.
- **Backwards-compatible:** when JWT env vars are unset, the existing `CONTINUUM_HTTP_TOKEN` shared-secret Bearer path remains operative. Operators choose their auth model per deployment; OSS Docker self-hosters can stay on shared-secret until they wire up Auth0/Clerk/Keycloak/etc.
- JWT claims `sub` + `tenant` (configurable claim name) flow into the request context as `req.user` so future per-tenant logic can read them. **Not used yet** — the multi-tenant routing it enables is V1.2 work — but the auth boundary lands here.
- `jose` library (recommended — small, audited, JWKS-native) — adds 1 dep to `@continuum/mcp-server`.
- New env var documentation in `.env.example` + new section in `docs/DEPLOY_SELF_HOSTED.md` covering BYO-OAuth.
- Test fixture: `node --test` case with a mock JWKS that issues a token and asserts the middleware accepts it.

**Estimate:** 2 commits · ~5 hours.

---

### W24-3 · Process supervision + healthcheck improvements
**Owner:** coder (small)
**Acceptance:**
- `Dockerfile` adds a `HEALTHCHECK` directive that hits `/healthz` every 30s with a 5s timeout. Docker / Fly / Kubernetes / nomad / podman all consume this.
- `/healthz` enriched to return non-trivial signal: `{ ok: true, version, transport, sessions, storageBackend, ruvectorOk, sqliteOk }` so the healthcheck catches storage corruption, not just "process is alive."
- `docs/DEPLOY_SELF_HOSTED.md` covers the recommended `docker run --restart=unless-stopped` flag + a `systemd` unit file example for non-Docker self-hosters.
- New `/readyz` endpoint distinct from `/healthz`: `/readyz` returns 200 only AFTER first SQLite open + first RuVector lazy-load complete. Lets orchestrators delay traffic until the engine is truly ready (eliminates the cold-start race that hurt W22-1).

**Estimate:** 1 commit · ~2 hours.

---

## Week 25 — Container hardening + FTS5 canary (June 19 → June 26)

### W24-4 · Container hardening — non-root + dropped capabilities
**Owner:** coder
**Acceptance:**
- Dockerfile creates an unprivileged `continuum` user (UID 10001) in the runtime stage; final `USER` directive switches to it. Verify with `docker exec <ctr> id` → `uid=10001(continuum)`.
- `/data` volume mount remains writable by the `continuum` user (chown in Dockerfile).
- `docs/DEPLOY_SELF_HOSTED.md` documents the recommended `docker run` flags: `--read-only --tmpfs /tmp --cap-drop=ALL --security-opt=no-new-privileges`.
- `npm audit --production --audit-level=high` runs as part of `npm run build` (or in CI workflow once #11 lands) — fails the build on high or critical findings. Document the current audit baseline.
- Image-scan section in `docs/DEPLOY_SELF_HOSTED.md` recommending `trivy` / `grype` for CVE scanning of the final image.

**Estimate:** 2 commits · ~3 hours.

---

### W24-5 · Issue #18 — FTS5 canary fixture (cross-source integration test)
**Owner:** coder
**Acceptance:**
Per the W23-close directive verbatim: *"Build a proper integration test that inserts one observation per source type with a known sentinel value to assert the search returns distinct types."*

- New `packages/core/src/storage-sqlite.test.ts` (or `cross-source-fts5.test.ts`) under `node --test`.
- Test fixture inserts EXACTLY one observation per source type (`docs`, `git`, `mem`, `sona`, `export`, `agent_handoff`) — each with a unique sentinel string the test owns (e.g., `__FTS5_CANARY_DOCS__`, `__FTS5_CANARY_GIT__`, etc.).
- Six assertions: searching each sentinel returns exactly one hit with the matching type.
- Optional bonus: cross-source search assertion (search a shared word, assert hits across multiple types).
- The d0fa50a7 / 1f416f20 verify_command for `cross-source-fts5-unified-index-proven` swaps from grep-the-dist-for-fts5-string (currently fragile) to running this new test (durable signal). Bumps in the next mid-sprint checkpoint.
- Closes #18.

**Estimate:** 1 commit · ~2 hours.

---

## Sprint exit criteria

A sprint review document `docs/SPRINT-REVIEW-W25.md` written on 2026-06-26 must answer:

1. **Can a fresh operator** `git clone` + `docker compose up` and have a working HTTPS engine in <10 minutes? Run it on a clean VM and time it.
2. **Are JWTs being validated** end-to-end with a real OIDC provider (Auth0 free tier is recommended for the test)? Or have we left it as "the middleware is wired but untested against a real issuer"?
3. **Is the image running as non-root in production** (Fly engine inherits this; check `fly ssh console -C "id"` returns uid 10001)?
4. **Is `npm audit --audit-level=high` green** on the current dependency tree?
5. **Are all 6 source types in the canary fixture searchable and distinguishable**?
6. **Is Issue #18 closed**, and what is the next sprint's anchor: **V1.2 multi-tenant native** or **V1.5+ neural capability layer** (ruv-swarm)?

If criteria 1-4 all PASS, **V1.1 ships and is the official OSS release candidate.** A release tag `v1.1.0` lands on `main`.

---

## Daily standup template (5 lines, copy/paste)

```
Date: YYYY-MM-DD
Shipped yesterday: <commit SHA — title>
Working today: <W24-N from this sprint>
Blocked by: <empty | issue-N | needs operator leap on X>
Verification owed: <empty | snapshot-id needing verify_command rerun>
```

---

## Out-of-band risks tracked, not actioned

- **`jose` library churn** — JWT validation libs occasionally publish breaking releases. Pin to a specific minor and audit on dep updates. Risk: low if pinned.
- **Caddy DNS challenges** — for ACME via DNS-01, we'll need Caddy modules. Operators on networks with port-80/443 blocked may struggle. Mitigation: document HTTP-01 fallback + DNS-01 setup for the two largest hosts (Cloudflare, Route53).
- **Container scan false positives** — `trivy` can flag transitive deps that aren't actually exploitable in our codepath. We document this; we don't gate on it without manual review.
- **Healthcheck flapping under load** — `/healthz` should NOT touch SQLite/RuVector heavily; risk of healthcheck thrash if it does. Keep it cheap.
- **CI workflow** — Issue #11 still open pending billing. If it clears mid-sprint, the W24-4 `npm audit` integration becomes auto-gated. If not, manual audit is operator-run.

---

## Why this sequence (not the alternative)

| Path | Defer rationale |
|---|---|
| ❌ V1.2 multi-tenant (Path B from W23-close) | Cannot scope per-tenant routing cleanly without per-tenant auth (W24-2). Building it before JWTs land = building it twice. |
| ❌ ruv-swarm neural ingestion (Path C) | Currently passive ingestion (docs + git adapters) works. Active mesh/ring topology adds operational complexity that an OSS self-hoster shouldn't have to debug on day one. Wait until OSS surface is stable. |
| ✅ V1.1 OSS hardening (this sprint) | Unblocks V1.2 (auth boundary), de-risks the SaaS tier (container hygiene), satisfies the OSS-first mandate, closes the last fragile-test debt (#18). |

---

## Commit cadence target

5 tickets × 1-2 commits each = **6-8 commits** across the 2-week window. Roughly the same cadence as W23. Closer to the W23 sprint-mid pattern than the W22 burst pattern.

---

_Bound by The Nine v0.1.0. Per P5: when this sprint plan and AGENTS.md
conflict, AGENTS.md wins. Per P9: each ticket above is a proposal; the
operator chooses what to start, in what order, and when to stop._

## Related

Sprint chain: [← W22](./SPRINT-2026-W22.md) · [W25 →](./SPRINT-2026-W25.md) · Ledger: [STATUS](./STATUS-2026-05-29.md) · Hub: [INDEX](./INDEX.md)

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
