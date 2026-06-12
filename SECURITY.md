# Security Policy

Continuum is a persistent-memory engine for AI coding assistants. Because it
ingests project history (docs, git, AI transcripts) and can run with a
multi-tenant HTTP surface, we take isolation and secret-handling seriously and
welcome responsible disclosure.

## Supported versions

Continuum is **pre-1.0 and under rapid iteration**. Only the latest `main`
(and the latest published `@continuum/*` packages, once released to npm) receive
security fixes. There are no backports to older commits or versions.

| Version | Supported |
|---|---|
| latest `main` / latest npm release | ✅ |
| anything older | ❌ |

## Reporting a vulnerability

**Please do _not_ open a public GitHub issue for a security vulnerability.**

Use one of these private channels:

1. **GitHub private vulnerability reporting** — once this repository is public,
   go to the **Security** tab → **Report a vulnerability**. This is preferred.
2. **Email** — `riaan@number7even.com` with the subject line
   **`CONTINUUM SECURITY`**.

Please include, where possible:

- The affected component (e.g. privacy filter, tenant isolation, HTTP/SSE auth,
  a specific MCP tool).
- A minimal reproduction and the observed vs. expected behavior.
- The impact (what an attacker could read, write, or bypass).
- A suggested fix, if you have one.

## What to expect

This is a **solo-maintained, best-effort** project. There is **no paid bug
bounty** at this time. We aim to:

- Acknowledge your report within **5 business days**.
- Agree a coordinated-disclosure timeline with you (default **90 days**, sooner
  for actively-exploited issues).
- Credit you in the release notes for the fix, unless you prefer to remain
  anonymous.

## In scope

- The MCP server: tools, resources, prompts (`packages/mcp-server`).
- Both transports: stdio (`continuum start`) and HTTP/SSE (`continuum serve`).
- The **privacy filter** (secret scrubbing in `packages/core`). A reproducible
  bypass that leaks an un-scrubbed secret into a stored observation is treated
  as **high priority**.
- **Multi-tenant isolation** — any path that lets one tenant read, write, or
  enumerate another tenant's data.
- **Authentication / authorization** — Bearer-token auth, JWT tenant-claim
  routing, and the `sanitiseTenantId` gate (e.g. header-spoofing bypasses).

## Out of scope

- The 11 **parked integration proposals** (GitHub issues #1–#22) — these are
  design documents, not shipped code.
- The disposable **`dolt-probe/`** directory — a one-off research artifact, not
  part of any deployed surface.
- The **`apps/console`** example frontend, except for its handling of the
  Bearer token it uses to reach the engine.
- Issues that require an **already-compromised host or physical disk access**.
  Continuum is local-first; the default trust model assumes the host and its
  filesystem are trusted. The SQLite database is **not** application-level
  encrypted at rest.

## A note on the privacy filter

The privacy filter scrubs a set of **known** secret patterns (API keys, tokens,
service-account JSON, etc.) and offers an optional entropy detector. It is
**best-effort, not exhaustive** — it will not catch every novel secret format.
Do not treat it as your only control for keeping secrets out of your project
history.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
