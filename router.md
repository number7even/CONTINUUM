# router.md — The Map (Interpretable Context Methodology)

> **Read [`AGENTS.md`](./AGENTS.md) first.** It is the **Prime Mission** — identity + The Nine,
> the operating law of this workspace. This file is the **Map**: it routes you to the right
> *floor* by intent. ICM discipline — *"folders over agents"*: the file system **is** the
> architecture, the routing, and the memory. No fragile agent framework; the structure governs.
>
> **Rebound rule (strict):** if a floor's local context does not answer your question,
> **return HERE.** Never guess or hallucinate across floors. When in doubt, come back to the Map.

---

## 0. Session start — the memory layer (never start cold)

CONTINUUM's own MCP server is registered (`.mcp.json` → project `continuum`). Before working:

- `continuum_get_state` → the latest checkpointed `product_state[]` (active / dormant / broken)
- `continuum://session/briefing` → the pre-rendered "what's happening" brief
- Search before fetching: `continuum_search_docs` → `continuum_timeline` → `continuum_get_observations` (Progressive Disclosure, ~2.85× fewer tokens)

## 1. Floors — route by intent

| If you need to… | Go to (the floor) |
|---|---|
| The engine — storage, checkpoint engine, state, todos | `packages/core/src/` |
| MCP tools / resources / prompts | `packages/mcp-server/src/` |
| CLI — `init / start / serve / status / import-state` | `packages/cli/src/` |
| A source adapter (docs · git · export · …) | `packages/adapters/<name>/` |
| **The AMF content engine** — demand → draft → render → autopilot | `apps/amf/worker/` → start at [`docs/AMF_PROCESS.md`](./docs/AMF_PROCESS.md) |
| Frontends — engine console · AMF studio · docs site | `apps/console` · `apps/amf` · `apps/docs` |
| Reference material + **team hand-offs** | `docs/` — [`INDEX.md`](./docs/INDEX.md), `*-HANDSHAKE.md`, `*_PROCESS.md` |
| The **audit ledger** — checkpoints (verifiable state) | `scripts/checkpoints/` + `continuum_get_state` |
| Skills — fetch-on-demand know-how (don't preload) | `.claude/skills/` |
| An architectural decision (what's locked vs pending) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) §14 |
| The multi-layer product vision (tier-labelled) | [`docs/VISION/UNIFIED-ARCHITECTURE.md`](./docs/VISION/UNIFIED-ARCHITECTURE.md) |

## 2. Lifecycle — spec → ship (routed to agent-skills)

The dev lifecycle runs on the **agent-skills** marketplace (Addy Osmani) — CONTINUUM **routes** to it, it does not re-implement it (don't reinvent the wheel). Install once: `/plugin marketplace add addyosmani/agent-skills` then `/plugin install agent-skills@addy-agent-skills`.

| Stage | Command | Principle |
|---|---|---|
| Spec what to build | `/spec` | spec before code |
| Plan how to build it | `/plan` | small atomic tasks |
| Build a slice | `/build` | one slice at a time |
| Prove it works | `/test` | tests are proof |
| Review before merge | `/review` | improve code health |
| Simplify | `/code-simplify` | clarity over cleverness |
| Ship | `/ship` | faster is safer |

CONTINUUM contributes the **memory layer beneath** the lifecycle: each stage's output becomes a verifiable checkpoint / hand-off (`scripts/checkpoints/` + `continuum_get_state`), not a remembered claim.

## 3. Artifacts & hand-offs (state lives in the file system)

- **Working artifacts** → the file that owns them (code, docs, a rendered asset, a checkpoint).
- **Hand-off** → a `docs/*-HANDSHAKE.md` (contract-first) **+** a checkpoint (`scripts/checkpoints/*.mjs`) so the state is verifiable, not remembered. Examples: `AMF-XENOS-AMALGAMATION-HANDSHAKE.md`, `STUDIOMUNICH-TALENT-HANDSHAKE.md`.
- **"Pick up"** = read `continuum_get_state` + the relevant floor's local context. **"Hand off"** = write a handshake doc + stamp a checkpoint.

## 4. The law (do not violate, do not route around)

- **Prime Mission:** `AGENTS.md` (The Nine). P5 — the rule binds its keeper. If a floor conflicts with `AGENTS.md`, `AGENTS.md` wins.
- **Verify over generate (P2/P4):** claims carry a `verifyCommand`; nothing is "done" without mechanical proof.
- **Client installs:** when CONTINUUM is installed into a client project, **this ICM structure takes precedence** — `agents.md` (prime mission) + `router.md` (the map) + local floor `agents.md` (with the rebound rule) govern the workspace. The folders are the architecture.

---

_ICM keystone for the CONTINUUM workspace. Prime Mission: `AGENTS.md`. IP by Riaan Kleynhans — Human in the Loop._
