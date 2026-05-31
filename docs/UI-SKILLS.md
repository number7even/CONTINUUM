# UI / Interface-Building Skills — operator toolkit

> **Bound by [The Nine](../AGENTS.md) v0.1.0.**
>
> **Goal:** build **interfaces**, not websites.
> The difference matters. Websites optimise for SEO, content hierarchy, and
> "the visitor". Interfaces optimise for the operator's *task* — the
> control surface, the feedback loop, the moment a tool stops being a tool
> and becomes a hand. This document covers the skills that teach Claude
> Code that distinction.
>
> **Scope:** these are **operator-level tools**, not CONTINUUM features.
> They live in `~/.claude/skills/` (user-scope, global). Available across
> every project under `/Users/emporiumcollection/Development` and any other
> path where you invoke Claude Code.

---

## TL;DR — what is installed

| # | Tool | Mechanism | Install location | Status |
|---|---|---|---|---|
| 1 | **Impeccable** (`pbakaus/impeccable`) | Claude skill | `~/.claude/skills/impeccable` | ✅ installed 2026-05-31 |
| 2 | **Taste Skill** (`Leonxlnx/taste-skill`) — v2 + v1 preserved | Claude skill | `~/.claude/skills/design-taste-frontend` + `…-v1` | ✅ installed 2026-05-31 |
| 3 | **Emil Design Eng** (`emilkowalski/skill`) | Claude skill | `~/.claude/skills/emil-design-eng` | ✅ installed 2026-05-31 |
| 4 | **UI UX Pro Max** (`nextlevelbuilder/ui-ux-pro-max-skill`) — 161 rules / 67 styles | Claude skill + bonus `ckm:slides`, `ckm:ui-styling` | `~/.claude/skills/ui-ux-pro-max` | ✅ installed 2026-05-31 |
| 5 | **21st.dev Magic MCP** (`21st-dev/magic-mcp`) | MCP server | `~/.claude/mcp_config.json` (per CLI) | ⏳ **install pending operator API key** |

All installed via `npx skills@latest add <repo> -g -a claude-code -s '*' -y` —
the vercel-labs/skills CLI's user-scope installer. Magic-MCP is a separate
mechanism (MCP server, not skill); see §5.

Per P4: every tool below has been verified to install + appear in
`skills ls -g`. The Skill-tool system reminder confirms each name is
loaded and dispatchable in this session.

---

## Why these five together

Stacked, they give Claude Code a **shared design vocabulary**:

| Layer | What it provides | Which tool |
|---|---|---|
| **Reasoning** (which design system fits this product?) | 161 rules + 67 styles + Design System Generator | UI UX Pro Max |
| **Discipline** (don't fall into AI slop traps) | 27 deterministic anti-pattern rules + 12-rule LLM critique | Impeccable |
| **Taste** (does this feel premium?) | Anti-slop frontend framework + image-gen reference boards | Taste Skill |
| **Craftsmanship** (does the motion / micro-interaction feel right?) | Emil Kowalski's design-eng patterns (creator of `sonner`, `vaul`) | Emil Design Eng |
| **Components** (give me a polished slot I can place) | AI-generated UI components from natural language via 21st.dev library | Magic MCP |

The first four shape *judgment*. The fifth shortens the path from
judgment to working code. Stacked, they replace the AI-slop default
(every dashboard ends up looking like the same purple-to-blue gradient
Inter-font SaaS template) with deliberate, varied, premium-feeling
interfaces.

---

## 1 · Impeccable

**Repo:** [pbakaus/impeccable](https://github.com/pbakaus/impeccable)
**Domain:** general-purpose anti-slop frontend design + 23 named commands.
**Authorship credit:** built on top of Anthropic's `frontend-design` skill.

### What it adds

- **7 domain reference files** loaded on every command: typography, color &
  contrast, spatial design, motion design, interaction design, responsive
  design, UX writing.
- **27 deterministic anti-pattern rules** (no LLM, no API key — run in CLI
  or browser extension).
- **12 LLM-driven critique rules** for subjective taste calls.
- **Brand-vs-product register** that adjusts defaults for marketing-site
  vs application-UI work.

### The 23 commands

All addressed as `/impeccable <verb>`. Use `/impeccable pin <command>` to
hoist a verb into a standalone slash command (e.g. `/impeccable pin audit`
creates `/audit` directly).

| Command | What it does | When you'd reach for it |
|---|---|---|
| `craft` | Full shape-then-build flow with visual iteration | starting a new screen from a description |
| `init` | One-time setup; writes `PRODUCT.md` + `DESIGN.md`, configures live mode | new project bootstrap |
| `document` | Generates root `DESIGN.md` from existing code | inheriting an undocumented codebase |
| `extract` | Pulls reusable components and tokens into the design system | code is shipped, design system is implicit |
| `shape` | Plans UX/UI before writing code | spec-before-code discipline |
| `critique` | UX design review (hierarchy, clarity, emotional resonance) | second-opinion pass |
| `audit` | Technical quality checks (a11y, performance, responsive) | pre-merge gate |
| `polish` | Final pass, design-system alignment, shipping readiness | last 10% before deploy |
| `bolder` | Amplify boring designs | "this looks generic" |
| `quieter` | Tone down overly bold designs | "this is screaming at me" |
| `distill` | Strip to essence | first cut had too much |
| `harden` | Error handling, i18n, text overflow, edge cases | edge-case sweep |
| `onboard` | First-run flows, empty states, activation paths | empty-state design |
| `animate` | Add purposeful motion | static feels lifeless |
| `colorize` | Introduce strategic color | monochrome needs anchors |
| `typeset` | Fix font choices, hierarchy, sizing | typography is off |
| `layout` | Fix layout, spacing, visual rhythm | composition is bad |
| `delight` | Add moments of joy | mechanical → memorable |
| `overdrive` | Technically extraordinary effects (use sparingly) | hero moment |
| `clarify` | Improve unclear UX copy | text reads as noise |
| `adapt` | Adapt for different devices | desktop-first → mobile |
| `optimize` | Performance improvements | bundle is heavy |
| `live` | Visual variant mode — iterate on elements in the browser | tight visual feedback loop |

### Example usage

```
/impeccable audit blog          → audit blog hub + post pages
/impeccable critique landing    → UX design review
/impeccable polish settings     → final pass before shipping
/impeccable harden checkout     → add error handling + edge cases

/impeccable redo this hero section
   → direct natural-language invocation
```

---

## 2 · Taste Skill (`design-taste-frontend`)

**Repo:** [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
**Domain:** anti-slop frontend framework for AI agents + image-gen reference boards.
**Project site:** https://tasteskill.dev

### What's installed

- `design-taste-frontend` — **v2 (experimental, current default)**, a
  substantial rewrite of v1.
- `design-taste-frontend-v1` — v1 preserved alongside, for projects that
  depend on the exact v1 behaviour.

Pin to v1 explicitly when needed:
```
Use the design-taste-frontend-v1 skill to review this interface.
```
Otherwise the default invocation (`design-taste-frontend`) is v2.

### Why pair this with Impeccable

Impeccable's 23 commands give you a **vocabulary** — `polish`, `critique`,
`harden`, etc. Taste Skill gives you a **framework** — stronger layout,
typography, motion, spacing instead of boilerplate AI defaults. They
overlap but cover different surfaces; together they're a stronger filter
than either alone.

### Bonus — image-generation skills

The Taste Skill repo also ships **image-generation skills** for reference
boards: web mockups, mobile screens, brand kits. Pair these with ChatGPT
Images or similar generators to produce reference frames *before* you ask
Codex / Cursor / Claude Code to implement. Documented in the upstream
README.

---

## 3 · Emil Design Eng (`emil-design-eng`)

**Repo:** [emilkowalski/skill](https://github.com/emilkowalski/skill)
**Author:** Emil Kowalski — creator of `sonner` (toast notifications) and
`vaul` (drawer component), both regarded as best-in-class for craft.
**Site:** https://emilkowal.ski/skill

### Why this one separately

Emil's libraries are the gold standard for how a *small* interaction
should feel — the toast that lands without jank, the drawer that obeys
your finger. This skill encodes those patterns. Use it when the question
is *"this works, but does it feel right?"* — micro-interactions, motion,
the moment-of-touch detail that separates a usable interface from a
delightful one.

### When to invoke

- Building a new drawer / sheet / modal / toast.
- Reviewing motion across an interaction-heavy surface.
- "Make this feel more like sonner / vaul" requests.
- Auditing the *texture* of an interface (not its IA).

---

## 4 · UI UX Pro Max (`ui-ux-pro-max`)

**Repo:** [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
**Site:** https://uupm.cc
**Scale:** 161 reasoning rules · 67 UI styles · 161 product types · 99 UX
guidelines · 25 chart types across 10 stacks (React, Next.js, Vue, Svelte,
SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, HTML/CSS).

### The Design System Generator (v2.0 flagship)

Reasons over the product type, audience, and brand and outputs a full
design system in one pass:

- Pattern (e.g. Hero-Centric + Social Proof)
- Style (e.g. Soft UI Evolution)
- Colour palette with hex values + semantic roles
- Typography pairing (heading + body) with Google Fonts share link
- Motion characteristics (easing, duration)
- Anti-patterns to avoid (named, not vague)
- Pre-delivery checklist (a11y, hover states, contrast, focus, reduced
  motion, responsive breakpoints, no-emoji-as-icon)

### Actions

`plan`, `build`, `create`, `design`, `implement`, `review`, `fix`,
`improve`, `optimize`, `enhance`, `refactor`, `check`.

### Project types

website, landing page, **dashboard**, **admin panel**, e-commerce,
**SaaS**, portfolio, blog, mobile app.

For CONTINUUM specifically: dashboard + admin panel + SaaS are the three
project types we'll lean on for Journey-1 UI work (per
[`UX-JOURNEYS.md`](./UX-JOURNEYS.md)).

### Bonus skills bundled

Installing UI UX Pro Max also pulled in `ckm:slides` and `ckm:ui-styling`
into the skills tree — separate skills from the same author family.

---

## 5 · 21st.dev Magic MCP — ⏳ install pending operator API key

**Repo:** [21st-dev/magic-mcp](https://github.com/21st-dev/magic-mcp)
**Mechanism:** MCP server (NOT a skill — different install path).
**Console:** https://21st.dev/magic/console
**Trigger:** `/ui <description>` inside any AI Agent chat.

### What it does

Natural-language → polished UI component, sourced from 21st.dev's library.
Returns TypeScript-typed components inspired by their curated library.

| Capability | Detail |
|---|---|
| AI-Powered UI Generation | `/ui create a modern navigation bar with responsive design` → real component code |
| Component Enhancement | Improve existing components with advanced features + animations (Coming Soon per upstream) |
| Real-time Preview | See components as they're created |
| TypeScript Support | Components arrive type-safe |
| SVGL Integration | Access to professional brand assets + logos |

### Why this stacks on top of the four skills

The four above shape *judgment*. Magic-MCP shortens the path from "I know
what I want" to "here's a polished slot I can place". Use the four to
critique, the fifth to generate the first cut. Then critique again.

### Install — your leap (P1 + P9)

This needs your API key from https://21st.dev/magic/console. I will not
ask you to paste the key into chat — that puts it in the conversation
transcript. Two paths:

**Option A — official one-line install:**
```bash
npx @21st-dev/cli@latest install claude --api-key <YOUR_KEY>
```
This writes the MCP server config into `~/.claude/mcp_config.json`
automatically. Restart Claude Code after.

**Option B — manual user-scope MCP registration (matches the codegraph pattern):**
```bash
claude mcp add --scope user magic -- npx -y @21st-dev/magic@latest API_KEY="<YOUR_KEY>"
```
Verify with `claude mcp list 2>&1 | grep magic`. Should show `✓ Connected`.

After install: `/ui <description>` in any Claude Code session triggers it.

---

## How to combine — three common interface tasks

### A · "Start a new product UI from scratch"

```
1. ui-ux-pro-max → run Design System Generator
   "I'm building a [PRODUCT TYPE] for [AUDIENCE] in [STACK].
    Generate the design system."

2. impeccable shape → plan the screen
   /impeccable shape <screen>

3. magic /ui → generate the first-cut components
   /ui create a [component description]

4. impeccable craft → wire them into a working surface
   /impeccable craft <screen>

5. emil-design-eng → tune the micro-interactions
   "Apply emil-design-eng patterns to the drawer + toasts."

6. impeccable polish → final pass
   /impeccable polish <screen>

7. impeccable audit → a11y / perf / responsive
   /impeccable audit <screen>
```

### B · "Audit and polish an existing screen"

```
1. impeccable critique → UX review
   /impeccable critique <screen>

2. design-taste-frontend → anti-slop check
   "Run design-taste-frontend review."

3. impeccable harden → edge cases + error states
   /impeccable harden <screen>

4. impeccable polish → ship pass
   /impeccable polish <screen>
```

### C · "Generate a component from a description"

```
1. magic /ui → first cut
   /ui [description]

2. impeccable typeset + layout → fit it to your design system
   /impeccable typeset <new component>
   /impeccable layout <new component>

3. emil-design-eng → motion + interaction polish
```

---

## Where they live + how to manage

```bash
# List all installed skills (global + project)
npx skills ls

# List only global skills (the ones we just installed)
npx skills ls -g

# Update one skill to its latest version
npx skills update <skill-name> -g

# Remove a skill
npx skills remove <skill-name> -g

# Find more skills interactively
npx skills find
```

Skills live on disk at `~/.claude/skills/<skill-name>/SKILL.md` —
inspectable plain markdown. Audit before invoking any skill that talks to
the network or runs shell commands (see also: the `skill-security-auditor`
skill, already installed in this environment, for pre-install vetting of
third-party skills).

---

## Discipline notes — under The Nine

- **P1 (minimize the secret):** Magic-MCP needs an API key. It is the
  operator's to hold. This doc never embeds it; install commands above
  use `<YOUR_KEY>` placeholders.
- **P2 (prove, don't grant):** every claim about installed skills above
  is grounded in the `skills ls -g` output captured 2026-05-31.
- **P4 (never claim more than you can verify):** Magic-MCP is tagged
  `⏳ install pending operator API key` — not claimed installed until
  it actually is.
- **P5 (the rule binds its keeper):** installing UI skills does **not**
  authorise building new Vibely-canvas / MCTS-panel front-ends for
  CONTINUUM. Those remain 🔮 aspirational per
  [`VISION/UNIFIED-ARCHITECTURE.md`](./VISION/UNIFIED-ARCHITECTURE.md).
  These skills are the *vocabulary* for when those builds get sprint slots.
- **P7 (let entry be freely chosen):** every skill can be removed with
  one `skills remove -g` command; no lock-in.

---

## See also

- [`UX-JOURNEYS.md`](./UX-JOURNEYS.md) — the three customer journeys these
  skills will eventually serve.
- [`VISION/UNIFIED-ARCHITECTURE.md`](./VISION/UNIFIED-ARCHITECTURE.md) —
  6-layer target architecture; UI work lives at Layer 3 (Vibely) + Layer 4
  (H-MARA reasoning panels) + Layer 2 (CONTINUUM operator console).
- [`../CLAUDE.md`](../CLAUDE.md) §"AGENT SKILLS — Addy Osmani marketplace"
  — the existing skills marketplace already installed via the
  Claude Code plugin system.
- [`../AGENTS.md`](../AGENTS.md) — The Nine v0.1.0 binding.
- Skill author sites for deeper reads:
  - https://impeccable.style — Impeccable bundle downloads + browser ext
  - https://tasteskill.dev — Taste Skill changelog + research
  - https://emilkowal.ski/skill — Emil's site
  - https://uupm.cc — UI UX Pro Max
  - https://21st.dev — 21st.dev component library

---

_Bound by The Nine v0.1.0._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
