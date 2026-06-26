# Enterprise Provisioning Runbook

> **Purpose.** Onboard a paying enterprise client end-to-end, **today**, with the
> shipped engine — no V2 SaaS stack required. This is the concierge path: lead →
> demo → contract → provision → connect → invoice → support.
>
> **Status (2026-06-26):** the *engine* steps are real and live. The *commercial*
> steps (contract, invoice) are manual by design for high-ticket enterprise. The
> only "missing SaaS" pieces (self-serve OAuth/Stripe/provisioning UI) are NOT on
> the critical path for selling enterprise — see §6.
>
> **Bound by The Nine.** Tokens are secrets (P1) — generated per tenant, handed
> over a secure channel, never logged or committed.

---

## The honest split (what's automated vs. manual)

| Step | Status |
|---|---|
| Lead capture | ✅ **live** — `www.continuum.rest/enterprise` form → `DEMO_WEBHOOK_URL` |
| Demo / contract | ⚙️ **manual** (sales-led — correct for enterprise) |
| Tenant provisioning | ⚙️ **manual command** (engine supports it; no UI yet) |
| Client connects their AI tools | ✅ **live** — hosted MCP, Bearer auth, tenant-isolated |
| The product (memory + verify-then-dissolve) | ✅ **live** — full feature set |
| Billing | 🧾 **invoice** (PO/net-30 — standard enterprise) |
| Support / feature requests | ⚙️ **named contact** (you) |

---

## Step 1 — Lead arrives

The prospect submits the `/enterprise` form. To receive it:
- Set **`DEMO_WEBHOOK_URL`** in the `continuum-docs` Vercel env → a Slack/Discord/
  Zapier/make.com incoming webhook. The lead lands there instantly.
- Until set, leads are written to the deployment logs (retrievable, but set the
  webhook — it's 2 minutes).

## Step 2 — Demo + contract (sales-led)

1. Demo the live product: warm start, 5-source memory, and the **verify-then-
   dissolve** gate (the differentiator — show a `verifyCommand` blocking a
   "done").
2. Agree scope + price. High-ticket enterprise = a contract + PO, not a card.
3. Sign a likeness/terms agreement as needed.

## Step 3 — Provision the tenant (the one manual command)

Each client = an isolated tenant on the hosted engine (`api.continuum.rest`,
Fly). The engine's `TenantRegistry` + JWT tenant-claim auth (Sprint W27) provides
mechanically-proven isolation.

**3a. Pick a tenant id** (lowercased, slug): e.g. `acme-corp`.

**3b. Mint the client's Bearer/JWT token scoped to that tenant.** The HTTP/SSE
server (`packages/mcp-server/src/auth.ts`) validates a JWT carrying the tenant
claim; `sanitiseTenantId` gates the id. Generate a signed token with:
```
tenant:  acme-corp
exp:     <contract term>
```
(Use the engine's signing secret — `$CONTINUUM_HTTP_TOKEN` / the JWT secret in
the Fly env. The token-mint helper lives with the auth module; if a CLI helper
isn't wired yet, sign the JWT with the same secret + claim shape `auth.ts`
expects.)

**3c. Verify isolation before handover** (P2 — prove, don't grant):
```bash
# the client's token reaches ONLY their tenant:
curl -sS -H "Authorization: Bearer <CLIENT_TOKEN>" \
  https://api.continuum.rest/sse   # 200 for their tenant
# a token for tenant B must NOT see tenant A's data (W27 isolation proofs).
```

## Step 4 — Client connects their AI tools

Hand the client (over a secure channel — P1):
- **Endpoint:** `https://api.continuum.rest/sse`
- **Their Bearer token** (tenant-scoped)

They paste an MCP config into Claude Code / Cursor:
```jsonc
{
  "mcpServers": {
    "continuum": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.continuum.rest/sse",
               "--header", "Authorization: Bearer <CLIENT_TOKEN>"]
    }
  }
}
```
Restart the AI client → Continuum's 10 tools + 4 resources + 2 prompts appear,
scoped to their tenant. They're live.

## Step 5 — The client uses it (what they actually get)

- **Zero cold starts** — the AI reads `continuum://session/briefing` at session
  start.
- **5-source memory** (docs / git / transcripts today; +mem/+feedback at V0.5).
- **Verify-then-dissolve** — todos gated on `verifyCommand` exit 0.
- **Hash-sealed checkpoints** — immutable, auditable state history.
- **Progressive Disclosure** — ~2.85× fewer retrieval tokens.
- **Privacy filter** — secrets scrubbed before persistence.
All tenant-isolated.

## Step 6 — Invoice + support

- **Billing:** send an invoice per the contract (net-30 / PO). **No Stripe needed
  for enterprise.** (Self-serve Stripe is the V2 lower-tier path, not this.)
- **Support / feature requests:** you are the named contact. High-ticket clients
  pay for access + a roadmap call, not a ticket queue. Log their requests as
  Continuum todos (dogfood) and feed the real ones into the roadmap.

---

## §6 — Why you can sell enterprise NOW (the strategic point)

The "missing" SaaS stack (self-serve OAuth, Stripe, provisioning UI, Postgres
control plane) is for the **low-ticket solo/team tier** — a different, lower-value
customer. **Enterprise is sales-led, concierge-onboarded, invoice-billed** — and
every step of *that* path works today on the shipped engine. Close 3–5 enterprise
deals concierge-style; that revenue funds the V2 self-serve stack for volume.

You do not have a "can't charge money" problem. You have a "haven't sent the first
invoice yet" opportunity.

---

## What's genuinely NOT built (don't promise these)

- **Self-serve sign-up / OAuth / Stripe** — V2.
- **A client-facing dashboard** — `console.continuum.rest` exists but is an
  operator/registry view, not a polished per-tenant client dashboard. See the
  dashboard note below.
- **Automated provisioning UI** — Step 3 is a manual command today.
- **Cryptographic witness (RVM) / H-MARA verification** — premium upsell, unbuilt;
  the shell-exit gate is the current (and already strong) proof mechanism.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
