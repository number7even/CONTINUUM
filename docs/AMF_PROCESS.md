# AMF — Autonomous Media Factory: End-to-End Process (for revision)

> **Status:** 2026-07-02 · Draft for review · Author: Riaan Kleynhans + Claude
> **Scope:** the content engine built on CONTINUUM. Describes *what we do, how, when,*
> and *the results*. Bound by **The Nine** — every claim here is verifiable in code
> (`apps/amf/worker/`), and where something is spec/untested it says so (P4).

---

## 1. What AMF is (one paragraph)

AMF turns market demand into on-brand content for a 14-product portfolio, autonomously,
up to a human approval gate. It discovers what people search, pulls authoritative feeds
that serve that demand, filters + ranks the signal, drafts brand-voiced content, and
queues it for a human to approve. It runs on a schedule with no one pulling the lever —
but **nothing publishes without a human decision** (P4/P7/P9).

---

## 2. Two principles that govern everything

**Two hands.** The *human hand* curates and approves (positioning, feed tiers, publish).
The *machine hand* discovers, scores, drafts, amplifies — but **never invents authority
and never auto-publishes**. The machine proposes tirelessly; the leap to publish is the
human's (P9).

**Two feed classes.**
- **Intelligence** (third-party: Google News, Krebs, Skift, YouTube…) → draft *new* content.
- **Own** (your platforms' RSS + YouTube channels) → *repurpose / syndicate* into new formats.

---

## 3. The pipeline at a glance

```
A Positioning ─ B Demand ─ C Discover ─ D Ingest ─ E Filter ─ F Rank ─ G Draft
                                                                            │
   L Orchestrate ─→ (fires the chain) ─→ … ─→ H Produce ─→ I APPROVE ─→ J Distribute
                                                              ▲
                                              the human gate — machine never crosses it
   K Memory (CONTINUUM) records every step throughout
```

---

## 4. The process, stage by stage — *what · how · when*

| | Stage | How (the tool) | When |
|---|---|---|---|
| **A** | **Positioning** *(human)* | `portfolio-universe.json` — per product: `angle`, `topics`, `keywords`, `sales_signals`, `filters` (must/not), `signal_query`, `feeds` (tiered), `own_feeds` | Once per product; revised when strategy shifts |
| **B** | **Demand analysis** | `analyze.mjs` → autocomplete + Google News vol + HN + YouTube → CORE/EXPAND/EDUCATE map → `docs/DEMAND_ATLAS_*.md` | Periodically (quarterly, or when entering a market) |
| **C** | **Discover + validate feeds** | `discover.mjs` (Feedly open API) · `opml-import.mjs` (your Feedly OPML) · `rate-source.mjs` (fit % + reachability + staleness → proposed tier) | When building/refreshing a product's feed pool; human ratifies tiers |
| **D** | **Ingest** | `adapter-news.mjs` — 8 providers → CONTINUUM corpus (SQLite+FTS5), privacy-filtered | Every autopilot tick (fresh pool) |
| **E** | **Filter (AI Feed gate)** | `content-matcher.mjs` → `passesFilters` — boolean `must`/`not` drops noise *before* scoring | Every match |
| **F** | **Rank (5-D)** | `content-matcher.mjs` → `rankSignals`: relevance × recency × authority × sales-signal × engagement | Every match |
| **G** | **Draft** | `content-matcher` (new, grounded) · `syndicate.mjs` (rework own content) | Every tick per product |
| **H** | **Produce (render in brand)** | `produce-post` / `produce-report` / `produce-short` + `brandbooks/<slug>.json` | On approval (render spend commits here) |
| **I** | **Approve** *(human gate)* | `review.mjs` — `--list/--show/--approve[--render]/--reject` | Human, on their cadence |
| **J** | **Distribute / capture** | Post CTA → PDF lead-magnet → lead routes to operator (`DEMO_WEBHOOK_URL`) | On publish (manual) |
| **K** | **Memory** | CONTINUUM observations + checkpoints (verify-then-dissolve) | Throughout |
| **L** | **Orchestrate** | `event-loop.mjs` (BullMQ/Redis) + `cron-trigger.mjs` (schedule) | The heartbeat |

---

## 5. The autopilot cadence — *when things run*

```
cron-trigger --add-portfolio "0 8 * * *"     # heartbeat: 08:00 daily
        │
        ▼  (BullMQ fires a 'portfolio' job)
event-loop worker: fan out → one 'chain' job per product (×14)
        │
        ▼  (per product, sequential, concurrency 1)
runProductChain(slug): ingest (googlenews, demand-driven) → match (gate + 5-D) → draft
        │
        ▼
out/review-queue/pending/<id>.json          # drafts wait here
        │
        ▼  (human, any time)
review.mjs --list → --approve [--render] → (manual) publish
```

- **Heartbeat:** one pulse/day (configurable via `AMF_PORTFOLIO_CRON`).
- **Per-tick work:** each product re-pulls its demand-driven Google News pool, re-ranks, drafts the single best on-brand brief, queues it.
- **Empty ticks are valid:** if nothing passes the gate, no draft is queued (no noise).

---

## 6. The human gates (the P9 leaps — only 3)

1. **A — Positioning:** ratify each product's angle / vocabulary / filters.
2. **C — Feed tiers:** assign authority (tier 1/2/3). The machine proposes fit; you assign trust.
3. **I — Approve:** review the draft, verify stats, then publish. Approved ≠ published.

Everything between is machine-amplified and runs unattended.

---

## 7. Component inventory (`apps/amf/worker/`)

| File | Role | Maturity |
|---|---|---|
| `portfolio-universe.json` | The targeting brain (14 products) | ✅ live |
| `analyze.mjs` | Demand analysis → atlas | ✅ proven |
| `discover.mjs` | Feed discovery (Feedly open API) | ✅ (thin for niche — honest) |
| `rate-source.mjs` | Validate feed fit/reachability/staleness → tier proposal | ✅ proven |
| `opml-import.mjs` | Import your Feedly OPML → portfolio match | ✅ proven |
| `adapter-news.mjs` | 8 ingest providers → CONTINUUM | ✅ (most key-free) |
| `content-matcher.mjs` | Boolean gate + 5-D rank + draft | ✅ proven |
| `syndicate.mjs` | Own content → reworked brief | ✅ proven |
| `produce-post/report/short.mjs` | Render in brand | ✅ post/report; short proven w/ real fuel |
| `env.mjs` | Load `.env.local` (secrets never in chat) | ✅ |
| `pipeline.mjs` | `runProductChain` + `enqueueForReview` seam | ✅ proven |
| `event-loop.mjs` | BullMQ worker (portfolio/chain/produce) | ✅ proven |
| `cron-trigger.mjs` | Schedule the heartbeat | ✅ proven |
| `review.mjs` | The human approval gate | ✅ proven |

**Ingest providers (8):** `googlenews` · `rss` · `hackernews` · `youtube` (official v3) · `worldmonitor` · `feedly` · `reddit` · `own`. Key-free: googlenews, rss, hackernews, own. Free key: youtube (Google Data API v3). Paid/gated: worldmonitor, feedly (Enterprise). Blocked: reddit (public JSON 403s).

---

## 8. Results (current state, verified)

- **14/14 products** carry demand-analysed `signal_query`; **13/14** have tiered authority feeds (**27 feeds total**). Only `studiomunich` is Google-News-only (no authoritative source found — needs manual curation).
- **Demand atlas** produced for all 14 (`docs/DEMAND_ATLAS_2026-07-01.md`) — found real gaps (e.g. voiceidvault was missing `detector`/`detection`, its literal value prop).
- **~800 demand-driven articles** pulled across the portfolio in one pass.
- **5-D ranking proven** — top signals are on-brand and validate the analysis (voiceidvault → "deepfake detection is the future of identity verification"; continuum → "context graph layer for multi-agent").
- **True autopilot proven** — one portfolio pulse fans out all 14 chains; `sekago` ran ingest→match→draft→queue live; the review gate holds/approves/rejects.
- **Discipline held** — `rate-source` rejected a stale feed (SEI, last post Feb 2025), a dead feed (Mandiant, 0 items), and off-topic feeds (honeypot.net 0% fit). No wishful adds.

---

## 9. Honest gaps (not done — P4)

- **L6 marketing/ad swarm: NOT wired.** No auto-publish, no auto-ad-spend. Deliberate boundary.
- **Publish is manual.** `review.mjs --approve` moves a draft to `approved/`; pushing to a channel is a human step (no channel API wired).
- **Render at scale untested.** `--render` on approve works per-asset; batch rendering the whole approved queue not load-tested.
- **`studiomunich`** has no authoritative feed yet.
- **Gated providers** (worldmonitor, feedly) untested without their paid keys.
- **Keyword promotion pending** — `signal_query` terms not yet promoted into `keywords[]` (would also lift matcher relevance).
- **Noise filters** — only `voicecosmos` has a `must`/`not` gate; `viwago` (broad "audit"), `voinista` (broad "investment") would benefit.

---

## 10. Runbook (how to operate it)

```bash
# one-time infra
docker run -d --name amf-redis -p 6379:6379 redis:7-alpine
echo 'YOUTUBE_API_KEY=…' >> apps/amf/worker/.env.local     # never in chat (P1)

# analysis + curation (human-in-loop)
node apps/amf/worker/analyze.mjs --brand <slug>            # demand map
node apps/amf/worker/discover.mjs --brand <slug>           # candidate feeds
node apps/amf/worker/rate-source.mjs --url <feed> --brand <slug>   # validate → tier
node apps/amf/worker/opml-import.mjs --file ~/feedly.opml  # match your Feedly to portfolio

# run the autopilot
node apps/amf/worker/event-loop.mjs                        # start the worker (stays alive)
node apps/amf/worker/cron-trigger.mjs --add-portfolio "0 8 * * *"   # schedule the heartbeat
node apps/amf/worker/cron-trigger.mjs --pulse              # fire one pulse now

# the approval gate
node apps/amf/worker/review.mjs --list
node apps/amf/worker/review.mjs --approve <id> --render
node apps/amf/worker/review.mjs --reject <id> "off-brand"
```

---

## 11. Open decisions for revision

1. **Cadence** — daily pulse enough, or per-product different frequencies?
2. **Render-on-approve vs render-in-chain** — render before review (see the asset) or after (save spend)?
3. **studiomunich feed** — which authoritative source for consented-avatar / likeness-rights?
4. **Keyword promotion** — promote `signal_query` → `keywords[]` now?
5. **Publish integration** — keep fully manual, or wire a draft-to-channel step (still human-triggered)?
6. **Buyer-intent filters** — add `must`/`not` gates to the noisy products?

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
