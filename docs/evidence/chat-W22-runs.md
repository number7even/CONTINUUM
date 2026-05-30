# W22-1 · /chat Live-Fire Verification Evidence

> **Sprint:** 2026-W22 · ticket W22-1 (per [`../SPRINT-2026-W22.md`](../SPRINT-2026-W22.md))
> **Date:** 2026-05-29
> **Probe script:** [`../../scripts/run-canonical-queries.mjs`](../../scripts/run-canonical-queries.mjs) — re-runnable.
> **Endpoint:** `https://continuum-kohl.vercel.app/api/chat`
> **Engine:** `https://continuum-engine.fly.dev/sse` (Fly.io, single shared-cpu-1x 512MB machine, `iad` region)
> **Model:** `claude-sonnet-4-6` via `@ai-sdk/anthropic@3.0.80`
> **Bound by The Nine v0.1.0** ([`../../AGENTS.md`](../../AGENTS.md)).

---

## TL;DR

| Metric | Value |
|---|---|
| Queries attempted | 5 (+ 2 retries after cold-start) |
| Leak count (L3 before L1) | **0** |
| Pass count (literal W22-1 criterion: 3-of-5 with L1-before-L3) | 5 of 5 after retry |
| Sprint W22-1 literal verdict | **PASS** |
| Sprint W22-1 honest verdict | **INCONCLUSIVE — production engine has no data, so the moat could not actually exercise Layer 3** |
| Total Anthropic spend | $0.081 |
| New production blockers found | 2 (Fly cold-start, empty Fly DB) |

The system prompt's biasing toward Layer 1 → 2 → 3 ordering **works at the
LLM level** — Sonnet 4.6 never violated it. The moat is **architecturally
sound**. But the production engine's `continuum` project DB is empty, so the
queries that should have demonstrated ~10x token savings instead showed the
agent thrashing on an empty index. The verdict is "no leak" — not "moat
proven under load."

---

## Honest finding #1 — Fly cold-start timeout

First two queries failed identically with:
```
HTTP 500 — {"error":"SSE error: TypeError: fetch failed:
Connect Timeout Error (attempted address: continuum-engine.fly.dev:443,
timeout: 10000ms)"}
```

The Fly machine had been idle long enough to scale to zero. Vercel's
`SSEClientTransport` waits 10s for the SSE handshake. The Fly machine
needs >10s to cold-start. Both queries dropped.

The same queries succeeded on retry (machine was now warm). This is a
predictable Fly + serverless interaction, not a fundamental architecture
issue, but **it would silently break every first-customer hit until
addressed.**

**Fix (≤5 min):** edit `fly.toml` to set
```toml
[[vm]]
  min_machines_running = 1
```
or equivalent `auto_start_machines = true` + `auto_stop_machines = false`.
Cost delta: ~$2/month for an always-warm shared-cpu-1x.

---

## Honest finding #2 — production engine has no data

Query 5 ("What's broken right now?") triggered the LLM to call
`continuum_get_state`, `continuum_get_todos`, `continuum_get_digest` — all
returned empty. The agent honestly reported:

> *"This session has no recorded history — no checkpoints, no observations,
> no todos. That means either: (1) this is a fresh project/session and
> nothing has been captured yet, or (2) the CONTINUUM store hasn't been
> populated."*

(2) is correct. The checkpoint `d0fa50a7` (V1 AaaS LIVE) was stamped to
the **local laptop DB**, not to the Fly volume. The Fly engine has been
running with an empty `~/.continuum/continuum.db` since deploy.

This means every query that *should* have demonstrated Progressive
Disclosure savings instead exercised the empty-index thrash path:
`continuum_search_docs` called 8–10 times in a row (each returning zero
hits), then fallback to state/digest. The literal W22-1 pass criterion
(no L3 before L1) is satisfied because L3 never fired — but only because
there was nothing for L3 to fetch.

**Fix:** seed the production Fly DB. Two paths:
- **A. Replay locally + ship volume snapshot.** Run docs + git adapters
  against a local engine pointed at a fresh DB; `fly ssh sftp` the
  resulting `.db` onto the volume. Fast (~10 min), one-shot.
- **B. Run adapters against the live engine via HTTP/SSE.** Currently the
  adapters use the local `StorageBackend` directly, not the MCP tool
  surface — so this path requires either (i) extending the adapter to
  speak HTTP/SSE, or (ii) adding a `continuum_upsert_observation` MCP
  tool. Slower (~half-day), but it's the "real" production path.

Path A unblocks W22-1 verification today. Path B is V0.5+ work.

---

## Per-query detail

### Q1 · "What did we ship today?"

**First attempt:** FAILED — cold-start timeout (12,628ms before HTTP 500).
**Retry on warm engine:** PASS

| Field | Value |
|---|---|
| Tool sequence | `get_digest → get_digest → get_state → get_state → continuum_timeline → continuum_timeline → get_todos → get_todos` |
| Layer activity | L2 fired (twice). L1 not called. L3 not called. |
| Usage | 3765 in / 264 out · **$0.0153** |
| Elapsed | 14,008ms |
| Verdict | PASS — no L3 before L1 (no L3 at all); honestly reported empty DB |

**Assistant reply (head):**
> *"Nothing shipped yet that I can verify — here's what I found (and didn't
> find):*
> *## What I checked*
> *| Layer | Result |*
> *|---|---|*
> *| **State snapshot** | No checkpoints recorded yet in [this DB] …"*

This is the **textbook P4 response.** The agent did not fabricate a list
of commits from training-data memory; it consulted the tools, found
nothing, and said so.

---

### Q2 · "Show me the V1 AaaS LIVE checkpoint."

**First attempt:** FAILED — cold-start (10,461ms before timeout).
**Retry on warm engine:** PASS

| Field | Value |
|---|---|
| Tool sequence | `get_state → get_state → continuum_search_docs → continuum_search_docs` |
| Layer activity | L1 fired (after state probe). L2/L3 not called. |
| Usage | 3,438 in / 314 out · **$0.0150** |
| Elapsed | 10,768ms |
| Verdict | PASS — no L3 before L1 (no L3 at all) |

**Reply (head):**
> *"No results found via either path. Here's what I checked and what I can
> confirm: …"*

Same honest empty-DB pattern as Q1.

---

### Q3 · "How does the V1 HTTP transport wire to storage?"

| Field | Value |
|---|---|
| Tool sequence | `search_docs ×8 → get_state ×2 → get_digest ×2` |
| Layer activity | L1 fired 8 times. L3 never. |
| Usage | 3,949 in / 405 out · **$0.0179** |
| Elapsed | 19,926ms |
| Verdict | PASS — no L3 (no data found) |

The 8 consecutive `continuum_search_docs` calls is the **empty-index thrash
signature.** With a populated DB, the agent would have hit on the first
or second search and moved to Layer 2 / 3. With nothing returned, it kept
varying the query terms. This is wasteful but not a moat violation per
the literal criterion.

---

### Q4 · "What's the privacy filter doing differently after Issue #8?"

| Field | Value |
|---|---|
| Tool sequence | `search_docs ×10 → get_state ×2 → get_digest ×2` |
| Layer activity | L1 fired 10 times. L3 never. |
| Usage | 4,012 in / 360 out · **$0.0174** |
| Elapsed | 21,697ms |
| Verdict | PASS — no L3 (no data found) |

Same empty-thrash pattern as Q3, slightly worse (10 search retries vs 8).

---

### Q5 · "What's broken right now?"

| Field | Value |
|---|---|
| Tool sequence | `get_state ×2 → get_todos ×4 → get_digest ×2` |
| Layer activity | No L1, no L2, no L3 |
| Usage | 3,662 in / 279 out · **$0.0152** |
| Elapsed | 12,279ms |
| Verdict | NO-DISCOVERY — but honest |

**Reply quoted in full earlier.** The "what's broken" framing led the LLM
to consult state + todos + digest (correct for status questions) rather
than search. This is actually the right shape for a status question; it
just doesn't exercise the moat tools.

---

## What this evidence proves

✅ **Sonnet 4.6 obeys the layer ordering bias from the system prompt.** Zero
   leaks across 5 + 2-retry runs. The prompt hardening worked.

✅ **P4 (honest uncertainty) is enforced.** Q1, Q2, Q5 all reported empty
   results honestly rather than fabricating from training-data memory. No
   hallucinated commits, checkpoints, or todos.

✅ **The Vercel ↔ Fly ↔ Anthropic bridge works end-to-end** when the engine
   is warm.

## What this evidence does NOT prove

❌ **~10x token savings under load.** Cannot be measured without a
   populated production DB.

❌ **Layer 2 → Layer 3 progression.** L3 never fired because there was
   nothing to fetch. The L1 → L2 → L3 ordering claim remains untested.

❌ **Cold-start resilience.** Production users will hit the same 10s
   timeout on first request until Fly is set to always-warm.

❌ **Customer-grade reliability.** A 40% first-attempt failure rate (2 of 5)
   is not shippable.

---

## Recommended next sequence (P9 — operator decides)

These are blockers for `/chat` reaching "moat actually proven" status.
They sit BEFORE the Tier-A defects on the critical path:

### Pre-A · Production engine readiness (2 small commits, ≤30 min)

- **PA-1 · Always-warm Fly.** Edit `fly.toml` to set `min_machines_running = 1`
  and `auto_stop_machines = false`. Verify cold-start ≤200ms after deploy.
- **PA-2 · Seed Fly DB.** Run docs + git adapters locally against a fresh
  `~/.continuum/continuum.db`, then `fly ssh sftp` the resulting DB to the
  volume at `/data/continuum.db`. Re-run the canonical queries; verify
  Layer 3 fires on at least one query.

**Without PA-1 + PA-2, the W22-1 verdict stays INCONCLUSIVE.**

### Then · Tier-A defects in recommended order

If the operator authorizes me to pick the order: **W22-3 (Issue #10
`deleteObservation`) first**, *because:*

1. **Discipline alignment.** The privacy filter (✅ shipped) scrubs at
   write-time; `deleteObservation` is the matching incident-response
   primitive. Until both exist, the privacy story is half-built.
2. **Smallest scope.** ~2 commits: interface + sqlite impl + hybrid
   delegate + MCP tool + smoke test. ~2 hours.
3. **Unblocks PA-2.** If the seed adapter accidentally ingests something
   sensitive while populating the Fly DB, we need delete to remediate.

Then W22-2 (#9 case sensitivity, ~1 commit). Then W22-5 (#12 mcp-server
split, ~1 commit, mechanical). W22-4 (token-counter polish) is genuinely
optional this week — defer or batch with W23-1.

---

## Re-run protocol

After PA-1 + PA-2 land:

```bash
node scripts/run-canonical-queries.mjs > docs/evidence/chat-W22-runs-2.json 2>&1
```

Then add a §"Post-seed run" section to this document with the new evidence
and the *honest* moat verdict.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
