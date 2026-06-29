# Brand Kernel (Layer-0) — Build Spec

> **Status:** scaffold shipped 2026-06-29 (`continuum_record_brand_dna` +
> `continuum_check_brand`, smoke-proven). Brand DNA *content* and Voice Print
> are gated on operator inputs (see §"What waits on the operator").
> **Brand architecture:** **nested** — locked 2026-06-29.
>
> This doc seals the vision verbatim **with one correction**: the current-state
> table reads what is *verified shipped*, not what is aspirational. CONTINUUM's
> moat is a memory layer that does not lie about its own state; a plan inside it
> must hold to the same bar (P4 — never claim more than you can verify).

---

## Executive summary

CONTINUUM gives us trust, memory, and verifiable state. AMF is a partially-proven
media-production *path*. Neither answers **whose** brand is speaking, **what** it
stands for, or **where** the output goes. The Brand Kernel is the identity, voice,
and distribution-control layer (Layer-0) that sits **above** AMF + CONTINUUM and
makes output feel like *you* and route to *your* channels.

Phase One is **not** "build more layers." It is **retrofit the Brand Kernel onto
the existing stack** — and most of it is CONTINUUM wearing a new hat (append-only
Observations, FTS5 retrieval, verify-then-dissolve applied to brand claims).

## Current state — verified, not aspirational

| Layer | Function | Status (verified 2026-06-29) |
|---|---|---|
| CONTINUUM | Trust, memory, multi-tenant, 12 MCP tools | ✅ **Built, live** (Fly engine; W27 multi-tenant) |
| **Brand Kernel L0** | Brand DNA store + Publish Identity Gate | 🟡 **Scaffold shipped** — 2 tools + schema + smoke proof (this commit). Voice Print / Channel Router not built. |
| AMF L2–L5 | Trend → script → voice → captioned MP4 | 🟡 **Partially proven** — one voiced, captioned 9:16 MP4 on M1. A path, not a factory. |
| AMF L6 (paid amplification) / L7 (lead conversion) | 15-agent media buying; intent mining | ❌ **Spec only** — no code |
| ECC · Supacode · MetaHarness · Redis/BullMQ · ComfyUI swarm | Agent OS, control plane, GPU swarm | ❌ **Spec only** (captured 2026-06-22; "months, not weeks", separate repo) |

The gap is unchanged: no layer defines whose brand speaks, what it stands for, or
where it goes. The Brand Kernel closes it.

## Architecture

```
┌─────────────────────────────────────────────┐
│  LAYER 0: THE BRAND KERNEL                   │
│  ┌─────────────┐  ┌─────────────┐            │
│  │ BRAND DNA   │  │ VOICE PRINT │            │
│  │  ENGINE     │  │   ENGINE    │            │
│  │ • origin    │  │ • vocab     │            │
│  │ • frameworks│  │ • rhythm    │            │
│  │ • positions │  │ • register  │            │
│  │ • promises  │  │ • avatar    │            │
│  │ • personas  │  │   config    │            │
│  └─────────────┘  └─────────────┘            │
│  ┌─────────────┐  ┌─────────────┐            │
│  │  CHANNEL    │  │  PUBLISH    │            │
│  │  ROUTER     │  │  IDENTITY   │            │
│  │             │  │  GATE       │            │
│  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────┘
                    │  consumes over MCP
                    ▼
┌─────────────────────────────────────────────┐
│  EXISTING: AMF (L2–L5 path) + CONTINUUM      │
└─────────────────────────────────────────────┘
```

## How it maps onto CONTINUUM (why this is weeks, not a quarter)

| Brand Kernel piece | On CONTINUUM | Shipped? |
|---|---|---|
| **Brand DNA store** (origin, frameworks, positions, personas) | Observations via the shipped `docs` adapter + `continuum_record_brand_dna` | 🟡 recorder shipped; ingest of *your* content pending |
| **Promise Log** (commitments tracked to prevent contradiction) | verify-then-dissolve applied to brand claims — append-only, citable by Observation ID | ✅ shipped (`brand_promise` / `brand_position`) |
| **Publish Identity Gate** ("safe to ship as brand X?") | `continuum_check_brand` — FTS5 retrieval gate, cites conflicting Observation IDs | ✅ shipped (retrieval + flag; semantic judgment is the caller's, P4) |
| **Voice-drift detection** | a `verifyCommand`-shaped check against the voice fingerprint | ❌ pending Voice Print |
| **Nested brands** (Master + sub-brands) | one tenant + `subBrand` metadata tag; sub-brands inherit Master DNA | ✅ shipped + proven in smoke (voicecosmos draft caught by a master promise) |

## What shipped in the scaffold (this commit)

- **`continuum_record_brand_dna`** — records the four DNA primitives (`promise`,
  `position`, `framework`, `persona`) as privacy-filtered Observations under the
  `brand` source, tagged by `subBrand` (default `master`). Citable by ID.
- **`continuum_check_brand`** — the Publish Identity Gate. Given a draft (+ optional
  `subBrand`), retrieves the most relevant prior promises/positions by keyword
  overlap over FTS5, returns each with its Observation ID and a `review`/`clear`
  status. **Honest scope:** retrieval + flagging; the contradiction *judgment* is
  the caller's until V0.5 local inference (`ruvllm`, Issue #3) can automate it.
- **`scripts/brand-kernel-smoke.mjs`** — 9-check end-to-end proof (record → flag a
  contradiction by Observation ID → clear an on-brand draft → survive adversarial
  FTS5 punctuation → nested inheritance). All green.

**Design note (deferred, deliberate):** brand Observations use source `type='docs'`
(a valid `SourceType` — brand DNA *is* curated documents) with source id `brand` for
a clean `source: 'brand'` search label. Promoting `brand` to a first-class
`SourceType` needs a `sources` CHECK-constraint migration; deferred to the V0.5
RuVector schema rebuild to avoid touching production DBs for a cosmetic label (P1 —
minimise blast radius). The Observation `type` field already carries the brand
semantics, so nothing downstream depends on the deferral.

## Build order (the rest of Phase One)

| Step | Focus | Deliverable | Blocked on |
|---|---|---|---|
| ✅ 0 | Kernel scaffold | record + gate tools + smoke proof | — (done) |
| 1 | Brand DNA extraction | ingest 50 best posts + origin monologue → Ontology, Promise Log v1 | **operator inputs** |
| 2 | Voice Print v1 (text) | vocab/rhythm/register fingerprint → L3 prompt constraints; 10 test posts | step 1 |
| 3 | Channel Router + LinkedIn | format rules; one idea → post + newsletter + thread | step 2 |
| 4 | Publish Identity Gate v2 | wire the gate into the publish path; approval routing (auto vs human) | step 1 |
| 5 | Voice Print v2 (audio/avatar) | Supertonic 3 tuned to your voice; avatar config | step 2 |
| 6 | Integration + live test | Brand Kernel → AMF path; 2-week live run | steps 1–5 |

## What waits on the operator (P9 — the human's, cannot be synthesised)

- A **30–60 min origin-story monologue** (recorded).
- The **50 best past posts** (accessible for ingest).

Until these exist, Brand DNA v1.0 and the Voice Print are empty schemas. The
*machine* is built; the *fuel* is yours.

## Brand architecture decision — NESTED (locked 2026-06-29)

Master Brand = your personal brand. Sub-brands (`voicecosmos`, `zoro`,
`consulting`) are **derived flavours** that inherit Master DNA, implemented as a
`subBrand` tag on one tenant — **not** separate tenants (separate tenants =
isolation = the opposite of "derived"). Split into separate tenants later only if
volume demands it; the gate and recorder already carry the tag, so the split is a
data migration, not a redesign.

## Explicitly NOT in Phase One

- Multi-client agency workspace (build for our brands first, not resale).
- Full L6–L7 automation for the personal brand (personal brand = trust, not lead-gen).
- Real-time auto-reply engagement bot (manual founder engagement is the differentiator).
- Full avatar video generation (voice + carousel is enough; video is Phase Two).

## Success metric

Phase One is done when one raw idea (voice note / text / trend signal) produces,
within 24h: a LinkedIn post that sounds like you, a newsletter section, a short
video script in your voice — all routed to the right channels, all passing the
"is this actually me?" gate — and your time goes to strategy and real engagement,
not first drafts.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
