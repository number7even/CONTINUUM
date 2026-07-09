# ICM + CONTINUUM — the Adoption Manual (per product)

> **Audience:** any product/repo of ours that wants to slot into the global
> "folders over agents" methodology (ICM) **and** get verifiable memory.
> **Status:** 2026-07-09 · Grounded in `continuum init`'s real scaffold (P4).
> **One line:** ICM = portable static context (folders survive every model);
> CONTINUUM = verifiable dynamic memory on top (state that refuses to lie).

## The mental model

The **Interpretable Context Methodology (ICM)** = *folders over agents*. Your
repo is a building: root `agents.md` = the Lobby (identity), `router.md` = the
Map (routing), floor `agents.md` files = departments (stage contracts), `skills/`
& `reference/` = tools & know-how, `artifacts/` = working outputs + memory.

**CONTINUUM is the nervous system that runs on that building** — it turns the
weakest ICM link (a plain-text Hand-Off/Pick-Up `log.md` you have to *trust*)
into a hash-sealed, verify-then-dissolve memory you can *prove*, plus a live map
(the Brain), a plan (the Board / `continuum next`), and an audit ledger (the
Timeline).

## The ICM ⟷ CONTINUUM map

| ICM layer | Scaffolded by `continuum init` | CONTINUUM surface |
|---|---|---|
| Identity — root `agents.md` (bound by The Nine) | ✅ | session-start prompt loads it warm |
| Routing — `router.md` (the Map) | ✅ | the **Brain** (`/brain`) is the live, navigable router |
| Stage contracts — floor `agents.md` (`01-start-here`, `03-code`, `app`, `reference`, `artifacts`) | ✅ | **todos** scoped per floor; `continuum next` sequences them |
| Reference — `skills/`, `reference/`, `fixtures/` (routed to the agent-skills marketplace) | ✅ | the **Dossier** surfaces any skill/rule/doc, verified |
| Working artifacts + memory — `artifacts/` + Hand-Off/Pick-Up | ✅ folders · ⚠️ plain memory | **checkpoints** (hash-sealed) + **Timeline** + **briefing** |

## Adopt it in 5 steps (per product)

### 1 — Scaffold the building + register memory (30 seconds)
From the product's repo root:
```bash
npx @number7even/continuum init --guided
```
This mints the ICM structure (`agents.md`, `router.md`, the floors, `skills/`,
`reference/`, `artifacts/`, `CLAUDE.md`), **writes `.mcp.json`** (no hand-editing),
and **seeds a checkpoint** so `get_state` is warm on the first session. Restart
your AI client (Claude Code / Cursor) — CONTINUUM now boots as an MCP server.

### 2 — Ingest the repo → the Brain + Timeline
```bash
continuum ingest --repo=.        # git + docs + code symbols → the 5-source graph
# code·symbols engine: default inline codegraph, or CONTINUUM_CODE_ENGINE=cbm (Hybrid LSP)
```
Open `/brain` (the living router), `/timeline` (Sprint → Session → ◆ Checkpoint),
`/board` (proof-gated Kanban).

### 3 — Upgrade Hand-Off / Pick-Up to *verifiable* memory
In the product's **root `agents.md`**, wire the two routines to CONTINUUM instead
of a plain `log.md`:

> **On "Hand off":** call `continuum_record_checkpoint` with the current
> active/dormant/broken state — each entry carrying a `verifyCommand`. A state
> reaches DONE only if that command exits 0. (Hash-sealed, append-only — it
> can't lie.)
>
> **On "Pick up":** read `continuum://session/briefing` — the warm brief from
> *verified* state, not a stale text file. Then `continuum_next_tasks` for what's
> actionable now.

That single change makes the methodology's memory *provable* rather than trusted.

### 4 — Run the dev lifecycle (spec → ship), each stage a verifiable artifact
The scaffold routes the lifecycle to the **agent-skills** marketplace:
```
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```
`/spec /plan /build /test /review /code-simplify /ship`. CONTINUUM records each
stage's output as a checkpoint/hand-off — the memory beneath the lifecycle.

### 5 — Keep it warm
Every session: **"Pick up"** → the briefing tells you exactly where you left off.
Every stopping point: **"Hand off"** → a verified checkpoint. You never
re-explain the project again.

## Portability (why this survives everything)
The building is just folders + markdown → **zero vendor lock-in**. Open the repo
in Claude Code, Cursor, OpenCode, or Hermes; point it at `agents.md`; it adopts
the rules, checks the Map, and resumes. CONTINUUM rides on MCP (an open protocol)
+ local-first SQLite — swap the model, keep the memory.

## Rollout across our products
| Product | Adopt | Notes |
|---|---|---|
| CONTINUUM (dogfood) | ✅ already ICM-scaffolded | this repo |
| AMF | ⏳ `init --guided` + ingest | the content engine — its A→L map becomes a Brain |
| VoiceCosmos / others | ⏳ `init --guided` per repo | each gets its own project + Brain/Timeline |

**Prerequisite:** the `@number7even/continuum` CLI must resolve — publish it
(`npm publish -w @number7even/continuum`) or use the local alias
(`alias continuum='node /path/to/CONTINUUM/packages/cli/dist/index.js'`).

## The open build items (to make this frictionless)
1. **Wire Hand-Off/Pick-Up into the scaffolded `agents.md`** so step 3 is
   automatic (the routine calls `record_checkpoint` / reads the briefing).
2. **Console project-switcher** so one console roams every product's Brain.
3. **Publish the CLI** so `npx @number7even/continuum init` just works.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
