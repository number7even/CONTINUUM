# Product

## Register

brand

## Users

Solo and small-team developers who build software with AI coding assistants
(Claude Code, Cursor, Codex) and have been burned by the assistant forgetting
everything between sessions. They are technical, skeptical of hype, and have
felt the specific pain of an AI confidently claiming work is "done" when it
isn't. They arrive at this site from GitHub, Hacker News, or a peer's
recommendation, evaluating in minutes whether Continuum is real engineering or
another wrapper. Secondary: engineering leads evaluating it for a team, and
future hosted-SaaS / hotel-tenant customers.

## Product Purpose

Continuum is an open-source Model Context Protocol engine that gives AI coding
assistants a persistent, verifiable memory of a project across sessions. Its
defining discipline: work is never marked "done" until a shell command exits 0
to prove it. This docs + landing site is the public front door for the V1 OSS
launch — it must convince a skeptical engineer the project is credible, explain
how it works, and route them to the architecture, the build plan, and GitHub.
Success: a developer reads the hero, believes the claim, and installs it.

## Brand Personality

Exacting, honest, quietly confident. Three words: **verifiable, grounded,
unhurried.** The voice never oversells; it states what the software literally
does and shows the receipt. It respects the reader's intelligence and time. It
is the opposite of a growth-hacked SaaS launch: no urgency manipulation, no
manufactured excitement. Trust is earned by precision, not claimed by adjectives.

## Anti-references

- **SaaS-cream AI-slop landing pages.** The warm-beige body background with a
  gradient-text hero, tiny tracked uppercase eyebrows above every section, and
  three identical icon-heading-text cards. This is the saturated AI default; it
  reads as machine-generated and would undercut the entire "verifiable, not
  promotional" thesis.
- **Gradient text headings** (`background-clip: text`). Banned outright.
- **Hero-metric template** (big number, small label, gradient accent).
- **Buzzword copy**: streamline, empower, supercharge, seamless, enterprise-grade,
  next-generation. The product fights exactly this kind of unearned claim.
- Crypto-launch maximalism, neon gradients, manufactured countdown urgency.

## Design Principles

1. **Practice what you preach.** The site about verifiable claims must itself
   make no claim it can't show. Every number on the page is real and sourced.
2. **Show the receipt.** Concrete mechanics (a real `verifyCommand`, a real
   token-savings figure) beat adjectives. When tempted to describe, demonstrate.
3. **Expert restraint.** Confidence shown through calm typography and space, not
   loud color or motion. The reader should feel they're reading engineering docs
   written by someone who respects them.
4. **Legibility is the feature.** This is a docs site first. Reading
   architecture at length must be effortless: contrast, measure, and rhythm
   are non-negotiable.
5. **Distinctive, not decorative.** Brand character comes from the Inkwell /
   Creme Brulee palette and typographic command, never from ornament that
   doesn't carry meaning.

## Accessibility & Inclusion

WCAG 2.2 AA minimum. Body text ≥ 4.5:1 against its background; large/display
text ≥ 3:1 (the current cream-on-cream hero fails this and must be fixed). Full
keyboard navigation and visible focus (Starlight provides a baseline; preserve
it). Every animation needs a `prefers-reduced-motion` alternative. Dark and
light themes both ship and both must pass contrast. Code blocks (heavy on this
site) need a high-contrast syntax theme.
