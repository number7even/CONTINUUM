# AMF Self-Host Runbook — Ghost (Owned Media, L5)

> **Purpose.** Durable, verified checklist to stand up a self-hosted **Ghost**
> instance as the AMF's owned-media publishing destination (Layer 5, written
> content), plus the two services it depends on (**Mailgun**, **Stripe**) and the
> **AMF ↔ Ghost** integration contract.
>
> **Status (2026-06-24):** **DOCUMENT-NOW, BUILD-LATER.** Captured here so the
> requirements aren't lost. The `/api/publish/ghost` adapter is **deferred** until
> the video track (L4-audio → L5 assembly → MP4) is producing finished media —
> that's the primary product target. Ghost is the *parallel* written-media branch.
>
> **Bound by The Nine.** Server provisioning + all credentials are the operator's
> (P9 — I cannot provision infra or hold production secrets from a headless env).
> Every AMF→Ghost secret follows the established gated pattern (clean 503 until
> injected — P1/P6), same as `ANTHROPIC_API_KEY` / `AUPHONIC_API_KEY`.

---

## 0. The honest split (who does what)

| Track | Owner | Notes |
|---|---|---|
| Provision VPS, DNS, `ghost install`, MySQL, Nginx, SSL | **operator** | infra work, a few hours; not doable from a headless agent |
| Mailgun account + domain verification | **operator** | required for newsletters / member email |
| Stripe account + key | **operator** | required for paid memberships / revenue |
| Ghost custom integration → Admin API key | **operator** | the one credential the AMF needs to publish |
| `/api/publish/ghost` adapter + claude-blog push | **agent (deferred)** | built once the video track produces MP4s |

Ghost is **L5 written-media** — a *parallel* output to the video pipeline, **not**
part of the L4-audio → MP4 round-trip. Don't conflate the two tracks.

---

## 1. Ghost self-host — verified infrastructure (from docs.ghost.org/install/ubuntu)

| Item | Requirement |
|---|---|
| OS | **Ubuntu 22.04 or 24.04** |
| RAM | ≥ **1 GB** (2 GB comfortable). ~$6–12/mo VPS (Hetzner / DigitalOcean) |
| Node.js | a supported LTS — install docs sample `NODE_MAJOR=22` |
| Database | **MySQL 8** (required for production; no SQLite in prod). Switch socket-auth → password-auth for Ghost. |
| Reverse proxy | **Nginx** ≥ 1.9.5 (for SSL) |
| Process manager | systemd |
| Domain + DNS | registered domain; **A-record → server IP set in advance** |
| SSL | Let's Encrypt (configured during `ghost install`; needs an email) |
| Firewall | allow HTTP/HTTPS |

**Install (once the server is prepared):**
```bash
sudo npm install ghost-cli@latest -g
ghost install        # interactive: domain, MySQL creds, SSL, systemd
```

> ⚠ **Not on the install page but hit immediately:** Ghost needs **Mailgun** for
> newsletter/bulk email and **Stripe** for paid memberships. See §2.

---

## 2. The two "invisible" dependencies

### Mailgun (email — Layer 5/7 retention loop)
- Ghost requires **Mailgun** for newsletter/bulk member email (basic SMTP only
  covers transactional login emails, not newsletters).
- Operator provides: Mailgun account, a **verified sending domain**, API key.
- Role: when the AMF publishes, it can trigger newsletters to a tenant's member
  base — moving followers from rented social land into an **owned** email list.

### Stripe (revenue — Layer 7 conversion)
- Ghost's native Stripe integration turns organic attention into **paid
  memberships** (Settings → Membership → connect Stripe).
- Operator provides: Stripe key (Connect).
- Role: the AMF monetisation layer — bridges views → revenue (CPS / high-ticket
  advisory via Pod-Geni RAWPITCH).

---

## 3. AMF ↔ Ghost integration contract

The AMF publishes via Ghost's **Admin API** (programmatic, not the CMS UI).

**Setup (operator):** Ghost Admin → **Settings → Integrations → Add custom
integration** → yields an **Admin API Key** + **API URL** + **Content API Key**.

**Secrets (gated pattern, P1):**
```
GHOST_ADMIN_API_URL=https://<tenant-ghost-domain>
GHOST_ADMIN_API_KEY=<id>:<secret>          # Admin API key
```

**Integration points (claude-blog, design-intent — flagged unbuilt):**
1. **Automated article delivery** — once a draft passes the claude-blog *5-Gate
   Delivery Contract* (≥ 90/100), the orchestrator pushes the content, JSON-LD
   schema, and hero images to the Ghost Admin API (no manual entry). ⚠ design-intent.
2. **Programmatic taxonomy** — sync AI topic-cluster tags/categories to Ghost so
   navigation maps to the content architecture. ⚠ design-intent.
3. **Idempotent re-publish on rewrite** — when SEO-drift agents detect a decline,
   the AI rewrites and **updates the existing post by stable ID, preserving the
   URL** (no duplicate, no broken link). ⚠ design-intent (AMF v2 roadmap).

> The Admin API uses short-lived JWTs signed from the Admin API key. The adapter
> (`/api/publish/ghost`, deferred) will mint these server-side and never expose
> the key client-side.

---

## 4. Multi-tenant (per-tenant Ghost) — sits on the W27 TenantRegistry

Each tenant gets their own sovereign Ghost instance. The engine's **W27
`TenantRegistry`** (already shipped) is the natural home for per-tenant external
credentials:

```
tenant: voicecosmos
  ├─ agent namespace + governance (existing)
  ├─ GHOST_ADMIN_API_URL / GHOST_ADMIN_API_KEY
  ├─ MAILGUN_API_KEY / sending domain
  └─ STRIPE_KEY
```

⚠ **Security note (P1):** storing per-tenant third-party secrets in the registry
requires the same secret-handling discipline as everything else — encrypted at
rest, never logged, scoped per tenant. This is a real design task, not a freebie,
and must clear the cross-tenant isolation bar the W27 proofs set.

---

## 5. What this unlocks (and the honest sequence)

- **Video track (priority):** ZeroEdit pipeline → high-fidelity 9:16 / 16:9
  social MP4s. This is the demonstrable "media output" the factory must prove first.
- **Ghost track (this runbook):** sovereign written-media home for long-form
  thought leadership, Stripe-monetised, Mailgun-retained.

**Build sequence:** finish the L4-audio round-trip → L5 assembly → MP4 (prove the
factory produces media) **before** building the Ghost adapter. Onboarding a real
tenant eventually needs both tracks; we cook them in order.

---

_Sources (verified 2026-06-24): [Ghost install — Ubuntu](https://docs.ghost.org/install/ubuntu/).
claude-blog integration points (§3) are design-intent from the AMF blueprint, flagged unbuilt._

## Related

Fly.io deploy: [DEPLOY_FLY](./DEPLOY_FLY.md) · Self-hosted (Docker): [DEPLOY_SELF_HOSTED](./DEPLOY_SELF_HOSTED.md) · Backup / restore: [RUNBOOK_BACKUP](./RUNBOOK_BACKUP.md) · AMF pipeline: [AMF_PROCESS](./AMF_PROCESS.md) · Hub: [INDEX](./INDEX.md)

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
