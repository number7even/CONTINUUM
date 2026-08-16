# CONTINUUM — the Engine's Obligations

_The third contract of the triad (KAIZAN authors · VoiceCosmos runtime · CONTINUUM spine).
The spine makes demands of everyone — this document is what it owes back, so no consumer
ever has to wonder what they may rely on. Every obligation is current behavior with a
receipt, not a promise._

---

## 1. What every consumer may rely on (the spine's SLA)

1. **Isolation, structurally.** One tenant = one path-isolated store. A valid token for
   tenant A can never read tenant B — wrong-tenant queries 404 by construction, not by
   policy. _(Receipt: live-fire cross-tenant probes.)_
2. **Privacy at the choke-point.** Nothing reaches storage or embeddings unscrubbed
   (11 secret patterns always-on; guest-PII tier via `CONTINUUM_PRIVACY_PII=1`). Do not
   pre-scrub-and-assume; do not rely on the spine to *preserve* a secret (it won't).
3. **Seals that re-derive.** A `type='decision'` Observation binds verdict + operator +
   `subject.contentHash`; anyone can re-derive the hash over the artifact and compare.
   Projection endpoints return seal fields only — never raw content (P1).
4. **Fail-closed verification surfaces.** `GET /api/observation/:id` and the MCP surface
   answer 200-with-proof or refuse (401/404). Unreachable ⇒ the consumer must abort —
   and the spine will never ask a consumer to "assume it's fine."
5. **Append-only memory.** Observations and checkpoints are never silently rewritten;
   corrections are new records. The iteration log is part of the truth.
6. **Progressive disclosure.** Cheap index first (L1), context second (L2), full text
   only by explicit ID (L3), Layer-0 briefing for warm starts — consumers are never
   forced to bulk-dump to be well-informed.
7. **Tokens minted on-target, delivered out-of-band.** Per-workspace RS256, validated
   against the public JWKS. The engine never transmits secrets through chat, argv, or
   logs — and never asks a partner to.

## 2. What the engine terminal DOES (its standing duties)

- **Countersigns claims** — cross-terminal "done" is audited against live systems before
  it enters any record (E1 discipline; a receipt that cannot be re-run is not a receipt).
- **Provisions tenants** on founder instruction (registry entry + on-target mint).
- **Runs the ingestion side of every seam** it owns (telemetry pull, KB ingest) the
  moment credentials arrive — tripwired, not polled.
- **Keeps the odometer honest in both directions** — phantom capabilities and phantom
  gaps are both defects; corrections land as commits with named witnesses.

## 3. What the engine will NOT do (refusals consumers can build against)

- Never auto-approves, publishes, or spends — P9 is architecture, not configuration.
- Never serves raw content through verification projections.
- Never honors advisor-channel artifacts as fact until disk/DB/API-verified.
- Never accepts push-telemetry (the loop pulls), parallel ID schemes, or shadow stores.
- Never lets a "done" stand without an exit-0 witness or a sealed human decision.

## 4. Change discipline

The engine's contracts (`contracts.mjs`, wire shapes, this document's guarantees) change
**spine-side first**, by commit, with gates — consumers adopt published contracts and are
never asked to code against an unmerged promise. Frozen surfaces stay frozen until their
wave closes. Where a contract and any other document disagree, **the contract wins.**

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
