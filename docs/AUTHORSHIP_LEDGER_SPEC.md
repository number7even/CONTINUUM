# Authorship Ledger & IP-Provenance Export — Spec

> **Status:** spec · 2026-07-09 · grounded in the shipped checkpoint/Observation
> primitives (P4 — every mechanism below maps to code that exists or a minimal,
> additive extension of it).
> **One line:** turn CONTINUUM's existing hash-sealed checkpoint chain into a
> verifiable record of **human authorship + acceptance**, so the human operator
> — not the engine, not the model — provably owns the IP and the liability.

---

## 1. Purpose — the liability-transfer point

An AI can generate code in seconds, but it **cannot own the consequences**: it
can't be liable when a deploy fails or a legal claim arises. Only a human can be
the steward of an outcome. The Nine already encodes this as **P9 — the leap is
the human's.**

Today that leap **evaporates into chat scrollback.** The Authorship Ledger spends
CONTINUUM's "friction budget" at exactly the liability-transfer point: it captures
the human's acceptance as an **immutable, hash-sealed record** at the P9 boundary,
and makes it exportable as evidence that a human conceived, reviewed, verified, and
**claimed** the work.

Two effects, engineered:
1. **Authorship** — evidence the work is human-authored (the predicate for
   copyright/patent ownership), not unattributable machine output.
2. **Liability** — the accepted state is provably the human operator's, so
   responsibility for outcomes rests with the steward who accepted them.

> **Honest scope (P4/P5).** This spec produces *evidence* — a tamper-evident,
> operator-signed record of human acceptance. Legal *effect* is established by
> pairing that evidence with the product's Terms of Use (which assign IP to the
> operator and place liability on them) and by counsel for the jurisdiction. The
> engineering makes the evidence; the ToS + the law give it force. A spec that
> claimed automatic legal exemption would be weaker, not stronger — precision is
> the shield.

---

## 2. The primitive — a `type='decision'` Observation

The missing mechanism that closes the **provenance-of-authorship** pillar. When
the human accepts a proposal at the P9 boundary (the Board's REVIEW column — the
decision queue), their consent is written as an append-only Observation.

Reuses the existing `Observation` shape `{id, sourceId, type, content, timestamp,
refs, metadata}` — no schema migration. Convention:

| Field | Value |
|---|---|
| `id` | `randomUUID()` — the decision's permanent ID |
| `sourceId` | `authorship:<projectId>` (new source, genre `'export'` until a first-class type lands) |
| `type` | **`'decision'`** (free-text obs type — no CHECK constraint, additive) |
| `refs` | the proposal/subject it accepts: the todo ID, the git commit(s), the Conductor's qualification Observation ID |
| `content` | human-readable consent record (see below) |
| `timestamp` | ISO-8601 of the acceptance |
| `metadata` | the structured consent record ↓ |

**`metadata` (the structured consent):**
```jsonc
{
  "verdict":     "accept",            // 'accept' | 'override' | 'reject'
  "operator":    "riaan@mac.com",     // WHO leapt — git user.email (local) or the
                                       //   authenticated account (hosted API key)
  "subject":     { "kind": "todo", "id": "…", "title": "…", "contentHash": "sha256:…" },
  "basis": {                          // WHAT was on the table at the boundary
    "verifyCommand": "npm test",
    "exitCode": 0,                    // the green proof (P4 — accepted over passing proof)
    "qualifierRef": "obs:…"           // the Conductor's independent assessment
  },
  "rationale":   "approved — matches spec issue #12",   // optional human words
  "contentHash": "sha256:…",          // SHA-256 of the canonical consent record (self-integrity)
  "prevCheckpointHash": "sha256:…"    // the chain link — the checkpoint this follows
}
```

**Immutability & privacy.** Written through `storage.upsertObservation()`, which is
the privacy-scrub choke-point (secrets redacted) and append-only. A decision is
never edited; a reversal is a *new* `verdict:'override'` decision that refs the
prior — the ledger is the argument, not a mutable field.

---

## 3. The seal — binding consent into the existing hash chain

The checkpoint hash today is:

```
hash = SHA-256( canonicalStringify({ active, dormant, broken }) )
```

`canonicalStringify` recurses every key at every depth. **Therefore any field we
add inside a `StateEntry` is automatically committed to the checkpoint hash** — no
change to the hashing function, no new crypto path. That is the entire seam.

**Additive extension to `StateEntry`** (backward-compatible — field is optional):
```ts
interface StateEntry {
  name: string; where: string; verifyCommand: string; verifiedAt: string;
  landedAt?: string; description?: string;
  acceptedBy?: {                 // ← NEW — the authorship seal
    operator: string;            // who leapt
    decisionId: string;          // the type='decision' Observation
    decisionHash: string;        // sha256 of that decision's canonical consent
    at: string;                  // ISO-8601 of acceptance
  };
}
```

Sealing is then automatic:
1. Human accepts entry `E` at the P9 boundary → a `decision` Observation `D` is written.
2. `E.acceptedBy = { operator, decisionId: D.id, decisionHash: D.metadata.contentHash, at }`.
3. Next `continuum_record_checkpoint` runs — `canonicalStringify` includes
   `E.acceptedBy` → the SHA-256 checkpoint hash **now cryptographically commits to
   the decision.** Altering the decision record breaks the checkpoint hash; the
   append-only chain makes the tamper evident.

The result: **every active state carries a sealed proof of which human accepted it,
over what verified basis, when** — welded into the same tamper-evident chain
CONTINUUM already keeps.

---

## 4. The capture flow (inside the Conductor cadence)

```
Doer proposes  →  Board REVIEW column (proof green, awaiting the leap — P9)
      ↓
Conductor presents the decision request: what · verified basis · recommendation · cites
      ↓
HUMAN decides  →  continuum_record_decision(verdict, subject, basis, rationale?)
      ↓            (writes the type='decision' Observation — the consent record)
StateEntry.acceptedBy stamped
      ↓
Hand off  →  continuum_record_checkpoint  →  decision sealed into the hash chain
```

The decision is recorded **as provenance before** the state is handed off to a
checkpoint — so the checkpoint that seals the state also seals the proof of who
authored the acceptance. Orchestration loop and authorship record are the **same
ledger, read two ways.**

---

## 5. The IP-Provenance Export

`continuum authorship export` (CLI) / `continuum_export_authorship` (MCP tool)
walks the checkpoint chain and emits a portable artifact.

**What it does:** for the latest snapshot (or a range), collect every
`StateEntry.acceptedBy`, resolve each `decisionId` to its Observation, and assemble:

```jsonc
{
  "project": "…",
  "generatedAt": "…",
  "engine": "CONTINUUM vX — records evidence; asserts no authorship of its own",
  "chain": [ { "checkpointId":"…","checkpointHash":"sha256:…","recordedAt":"…" }, … ],
  "authorship": [
    {
      "state": "vault-rights-wall",
      "where": "apps/amf/worker/vault-guard.mjs",
      "landedAt": "c0001e3…",              // the git commit — the unit of authored work
      "verifiedBy": "node vault-guard.test.mjs → exit 0",
      "acceptedBy": "riaan@mac.com",
      "decisionId": "obs:…",
      "decisionHash": "sha256:…",
      "sealedInCheckpoint": "sha256:…",     // proof it's in the tamper-evident chain
      "verdict": "accept",
      "rationale": "…"
    }
  ],
  "attestation": "Every state above was reviewed, verified, and accepted by the
                  named human operator. The IP and the liability for these outcomes
                  vest in that operator. CONTINUUM asserts no authorship.",
  "signature": { "alg": "ed25519", "operator": "…", "sig": "…" }   // V1 (see §7)
}
```

Plus a human-readable `.md` rendering for filing/counsel.

**The unit of authored work is the accepted, verified state — tied to its git
commit(s)** — not a per-keystroke signature. That is the legally meaningful unit:
a defined change the human *reviewed and accepted over a passing proof*. The export
proves human acceptance of every such unit and its membership in the sealed chain.
(It does not, and should not claim to, prove keystroke-level authorship of each
line — P4.)

---

## 6. Operator identity — who "the human" is

- **Local / self-host:** `git config user.email` + machine fingerprint. Zero setup,
  matches the local-first thesis.
- **Hosted (the registration → API key tier):** the authenticated account **is** the
  operator identity — the key that gates the hosted engine also *signs the decisions*.
  This is the earned-upgrade tie-in: hosted operators get cryptographically stronger
  authorship provenance as a first-class benefit.

---

## 7. Integrity levels (V0 → V1, mirroring the existing hash-chain roadmap)

- **V0 (ships now):** SHA-256 content hash on each decision + append-only storage +
  the decision sealed into the checkpoint SHA-256 chain. Tamper-**evident** on-machine.
  (Same trust model as today's checkpoints — consistent with `checkpoint.ts`.)
- **V1 (upgrade):** an **Ed25519 operator signature** over the export (and per
  decision), so the artifact is independently verifiable **off-machine** by counsel or
  a court without trusting the DB. This is CONTINUUM's expression of H-MARA's
  cryptographic witness records — the operator's key turns "tamper-evident" into
  "third-party-verifiable."

---

## 8. Data-model & surface changes (all additive, backward-compatible)

| Change | Where | Migration? |
|---|---|---|
| `StateEntry.acceptedBy?` optional field | `packages/core/src/types.ts` | none (optional) |
| `authorship:<project>` source (genre `export`) | `openStorage` consumers | none |
| `type='decision'` Observation convention | writers | none (obs.type is free text) |
| `continuum_record_decision` MCP tool | `packages/mcp-server/src/tools/` | none |
| `continuum_export_authorship` MCP tool + `continuum authorship` CLI | mcp-server + cli | none |
| Board REVIEW "accept" → calls `record_decision` | `apps/console` + tool | none |

No schema migration is required for V0 — the seal rides the existing checkpoint hash.

---

## 9. Build plan (each phase ends with its own verifyCommand — dogfood)

1. **Consent primitive** — `StateEntry.acceptedBy` + `continuum_record_decision`
   (writes the `type='decision'` Observation).
   `verify:` a scripted accept writes an obs with `type='decision'` + a `contentHash`.
2. **The seal** — stamping `acceptedBy` and recording a checkpoint welds it in.
   `verify:` mutate the stored decision → recompute the checkpoint hash → it differs
   (tamper is detected). The core proof the shield holds.
3. **The export** — `continuum authorship export` walks the chain → JSON + `.md`.
   `verify:` export lists every accepted state with its `sealedInCheckpoint` hash.
4. **The boundary UI** — Board REVIEW "accept" calls `record_decision` with the
   operator identity; the acceptance shows on the card.
   `verify:` accepting a card in the console creates a decision obs for it.
5. **V1 signing** (later) — Ed25519 operator signature over the export.
   `verify:` a third-party `verify-signature` script validates the artifact offline.

---

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
