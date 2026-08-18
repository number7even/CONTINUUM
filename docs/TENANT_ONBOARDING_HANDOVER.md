# Tenant Onboarding — "Activate the Brain" Handover

_For the **VoiceCosmos onboarding team** and the **Crooma team**. What happens when a new
tenant signs up, exactly, step by step — the Brain activation, the DAM, and the law that
binds every panel they will ever see. Odometer-honest throughout: **[OPS]** = executed
manually today, exact commands given; **[SELF-SERVE 🔴]** = the build target that turns the
same step into a button. First full rehearsal: tenant `hotel-demo` ("Grand Harbour"),
2026-08-18 — 16 nodes ingested, PII scrub proven in-run, two tenant universes served
side-by-side from one engine._

---

## 0. The model in one line

**A signup creates a workspace; a workspace IS a tenant; a tenant gets exactly two things:
a BRAIN (Continuum: isolated memory + provenance) and a DAM (Crooma Assets: their file
library).** Everything else — panels, galleries, agents, voice — is a view or a worker on
top of those two. `tenant_id ≡ tenantId`, org-level (ID-1); `property_id` scopes inside.

## PART A — Activate the BRAIN (the exact steps)

**A1. Canonical tenant id [OPS → SELF-SERVE].** One lowercase slug per org, minted at
signup, immutable, stated once — it is the workspace id, the Continuum tenant, and the
subdomain. Never derived, never translated, never per-property.

**A2. Provision [OPS].** Mint the tenant on-target (registry entry + RS256 JWT signed by
the engine's volume key):
```
flyctl machine exec 1859162f329478 -a continuum-engine \
  "node /app/packages/cli/dist/index.js provision-tenant <tenant-id> \
   --issuer https://api.continuum.rest --audience continuum-api"
```
The token goes **server-side into the platform's secret store** (the BFF's environment) —
never to a client, never in chat, delivery out-of-band. *[SELF-SERVE 🔴: signup webhook
triggers provisioning; token lands in the secret store programmatically.]*

**A3. Source inventory [OPS — the onboarding team's craft].** Collect from the client:
property facts (name, address, check-in/out) · room/unit types with rates + amenities ·
FAQs · policies + SOPs (cancellation, ID handling, payment, service recovery) · menus.
Format target: the `HotelKb` shape (`property / rooms[] / faqs[] / policies[]`).

**A4. Ingest [OPS].** Run `hotel-kb` with the PII tier ON (launch-blocking, VC-4):
```
CONTINUUM_PRIVACY_PII=1 node --input-type=module -e "
import { openStorage, ingestHotelKb } from './packages/core/dist/index.js';
const s = openStorage('<tenant-id>');
console.log(JSON.stringify(ingestHotelKb(s, <kb-json>)));
s.close && s.close();"
```
Idempotent: re-running updates in place (stable sha256 ids) — refreshes are re-runs, not
migrations. *[SELF-SERVE 🔴: the KM upload screen feeds this same adapter.]*

**A5. Open the Brain [OPS today · SELF-SERVE 🔴 target].** Today: a console instance
pinned to the tenant (the rehearsal ran two side-by-side). Target — the build item named
**"the tenant brain page"**: `/admin/brain` in the shell; the customer logs into their
workspace, their **session** resolves the tenant at the BFF (which holds the JWT), and the
same universe UI projects *their* nodes at `{slug}.crooma.cloud`. Who they are decides
what they see — never a URL parameter.

**A6. Verification gate — before the client is EVER shown their brain.** All four, in
evidence: ① node count > 0 and matches the inventory (an empty universe is a failed
onboarding, not a soft launch) · ② **scrub spot-check**: query a record known to contain
contact PII; it must read `[REDACTED:pii-…]` (the rehearsal's lost-property FAQ is the
template) · ③ cross-tenant probe: their token against another tenant's id → **404** ·
④ one grounded answer retrieved with its Observation ID cited. Log all four as the
onboarding receipt.

## PART B — The DAM (Crooma team): every tenant gets one, and it's the upsell rail

**Aligned, and pre-committed:** every workspace gets the **Assets module — a professional
DAM — at signup**, on the locked ownership split: **Crooma owns the bytes; the Brain owns
the provenance record** (Observation: id, refs, metadata, pointer — never the binary; no
blobs in the spine). The live Source/Sink wire between DAM and Brain is Wave-3 work — now
unparked, sequenced behind the asset Observation `type` landing in `contracts.mjs` first.

**The upsell ladder rides the same two objects** (commercial layer, Stripe gates already
built and awaiting keys): base = DAM + Brain · tier up = galleries/proofing, portals,
storage quotas, custom domains · premium = AI summaries + the learning loop (Wave-2/3
features sold as capability, never claimed before their receipts exist).

## PART C — The law of the panels: every HyperFrame is a Brain view

**"Where there are spheres, there are hyperframes."** Locked principle: any HyperFrame
summoned anywhere in the system — a room grid, a run-sheet, the universe itself — is a
**stateless view over that tenant's Brain**, and the tenant's hyperframe *library* is
itself brain-backed (views are records with provenance, not hardcoded screens). Binding
consequences for every future panel: rendered **only** through the BFF (§5.1 — no tenant
credential in a browser, ever) · claims pass the Claim-Render Gate when it lands
(`c9d04e92`) · **absence renders as absence** — a failed fetch shows an explicit error
card, never a confident zero · no browser storage (the projection guard fails the build)
· which panels exist per tenant = their Industry Pack, compiled from KAIZAN, not coded
per client. *[Panel registry as pack output: 🔴 Wave-3/pack work.]*

## The onboarding team's one-paragraph pitch (receipts-backed)

"Your workspace comes with two things nobody else gives you: a professional asset library,
and a brain. The brain reads your manuals and answers with page-level citations; it
scrubbed your guests' details before it ever memorized anything — we'll show you the
redaction in your own data; it is physically incapable of seeing another company's
information — wrong tenant isn't 'forbidden', it's structurally absent; and every view
and voice it will ever grow renders only what it can prove."

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
