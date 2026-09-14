# The Draft Bridge — Local→SaaS Context Sync (CORRECTED SPEC)

_Engine build #3 (todo `1ba29586`). Supersedes the advisor draft (`context-sync-spec.md`,
2026-08-27), whose three defects are corrected here and refused permanently. Clean-room
per Brief §II.12: patterns only, zero copyleft code; and the clean-room rule is §II.12 —
The Nine has nine; no "P10" is minted._

## The lifecycle (corrected)

```
 LOCAL BRAIN (~/.continuum/<t>/ or self-host)          SAAS CONTROL PLANE (api.continuum.rest)
 1. continuum push / continuum_push_draft              4. POST /api/v1/tenant/draft
    - reads un-synced records past the SYNC CURSOR        - JWT validated; tenant from the SIGNED
    - runs local verifyCommands PRE-PUSH; attaches          CLAIM (X-Continuum-Project optional,
      the exit-0 receipts (command + exit + at)             must-match; NEVER ?project= selection)
    - scrub-on-egress (11-pattern + PII tier)          5. re-scrub at the choke-point (double guard)
 2. native fetch POST (timeout, fail-closed)           6. stage as REVIEW records via upsertObservation
 3. on 201: advance the local sync cursor                 (metadata.sync_state='REVIEW'; type never
                                                           'decision' — the forgery guard holds here too)
                                                       7. ALLOWLISTED server verifiers only (schema,
                                                          hash re-derivation, receipt validation) —
                                                          the server NEVER executes pushed commands
                                                       8. Review Room (console) → human P9 approve →
                                                          promotion through the EXISTING seal path
```

## The three permanent refusals (each was in the advisor draft; each is a gate test)

1. **No server-side execution of client-supplied commands.** A pushed `verifyCommand` is
   data about a *local* proof, never an instruction to the control plane. Verification
   evidence = the pre-push receipt; server-side checking = allowlisted non-shell
   verifiers. The first gate test proves the route REFUSES to execute anything.
2. **No credentials in tool arguments.** The tenant JWT comes from env/config
   (`CONTINUUM_TENANT_JWT`-class server-side slots). Tool args land in transcripts; a
   token parameter is a P1 leak by design.
3. **Tenant from the signed claim, never from client-controlled input.** `?project=` and
   header-only selection exist solely in legacy shared-secret/local-dev mode. In JWT mode
   the claim routes; a sent header must equal it (403 mismatch, per auth.ts W27-3).

## The one genuinely new primitive: the sync cursor

Per-tenant, per-source watermark (last-pushed timestamp + id set hash) stored as a local
`sync-state` record — observations gain no `synced` column; the cursor is data, the store
schema is untouched. Idempotent by stable ids end-to-end: re-push is an upsert, never a dup.

## Real APIs only

`openStorage(tenantId)` · `upsertObservation` (scrub inside — there is no separate
`scrubPayload` export) · native `fetch` (no axios) · scope `@number7even/*` (the
pre-rename `@continuum/*` scope has already broken one production build). "Sandbox" is
not claimed: local verify = shell + timeouts; server verifiers = in-process allowlist.

## Gates before any merge (`scripts/verify-draft-bridge.mjs`)

RCE refusal (a draft with a hostile verifyCommand stages WITHOUT execution) · egress
scrub proven · claim/header mismatch 403 · idempotent re-push (1 row) · REVIEW records
cannot carry `type='decision'` · cursor advances only on 201.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
