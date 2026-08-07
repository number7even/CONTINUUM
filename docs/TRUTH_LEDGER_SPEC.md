# The Truth Ledger — multi-signature attestation for "verify, don't trust"

> **Status:** engine + proof-gate shipped 2026-07-13 (`packages/core/src/truth-ledger.ts`,
> `scripts/verify-truth-ledger.mjs` — 12/12 gates green). Board/CLI/console wiring is next.
> **Bound by [The Nine](../AGENTS.md).** This spec is the design source of truth; the code is
> the ground truth. If they disagree, re-run the proof-gate.

---

## The problem

A standard AI agent grades its own homework. It writes the code, then declares the code done —
and the gap between *what was said in the conversation*, *what actually got committed*, and *what
got marked "done"* is where four months of memory-theft and silent over-claiming lived. CONTINUUM's
whole thesis is **verify, don't trust**. A "done" claim is only true when an *independent* party
proves it — and the proof is cryptographic, not conversational.

A distributed blockchain is the wrong tool: it removes trust between *many mutually-distrusting
writers* via consensus/mining. We don't have many writers — we have **one topology of distinct
powers that must not be able to collude.** The right primitive is the core of a blockchain without
the swarm: a **hash-linked, multi-signature Merkle ledger** where every claim carries a full
signature set from **distinct keys**, and independence is enforced in cryptography, not etiquette.

---

## The five actors + the ledger (the separation of powers)

| Actor | Who | Role | Signs | Can it certify its own work? |
|---|---|---|---|---|
| **BALL** | the Board / Automated Lifecycle Loop | the **yardstick** — authors the `spec` (definition-of-done) | `spec` | it measures; it casts no vote |
| **A** | Claude + its model — the **Executor** | produces output, makes the `claim` | `claim` | **No** |
| **V** | a *separate* LLM (model of choice, incl. offline/Ollama) — the **Validator / linesman** | semantic check: scope, out-of-bounds impact, privacy leaks; **suggests** a response for H | `validation` | advises H, **has no vote** |
| **T** | **not an LLM** — the **Tester / referee** | cold mechanical execution demanding `exit 0` | `test` | it is the mechanism |
| **H** | Riaan — the **Human** | the **P9 leap**: assimilates A + V, decides; owns IP + liability | `decision` | the **only** accepter |
| **L** | the **Ledger** | the neutral, immutable record none of them can rewrite | — | — |

**V and T are different *kinds* of enforcement, deliberately:**
- **V (linesman)** is *active intelligence* — a swappable LLM analyzing **semantics** (does the diff
  match the claim? out-of-bounds impact? a privacy leak?).
- **T (referee)** is *cold mechanics* — a shell `verifyCommand` and a binary `exit 0`.

A (the LLM claiming completion) is checked by V (a *different* LLM analyzing scope) **and** tested by
T (mechanical execution). Semantic validation and mechanical testing are separate layers — which is
what makes collusion impossible.

---

## The truth round — one signed loop, repeating until live

```
  BALL emits  spec(T)  ── definition of done
        │
        ▼
  A executes ─▶ claim{output, diffHash, verifyCommand}        signed by A
        ▼
  V checks   ─▶ validation{confirm|dispute, reasoning,        signed by V   (V ≠ A)
                 suggestedResponse, flags[]}
        ▼
  H reads A *and* V ─▶ decision{accept | iterate(dir) |       signed by H   ← the leap (P9)
                        reject}
        │  iterate ─┐  loops back to A with H's direction (every round on the record)
        ▼ (accept)  ┘
  T tests    ─▶ test{verifyCommand, exitCode:0, outputHash}   signed by T   (T ≠ A)
        ▼
  push       ─▶ push{commitSha, deployReceipt}                signed by A/CI
        ▼
  L welds ─▶ TruthBlock: verdict PROVEN, valid ONLY with the full DISTINCT-key signature set.
```

---

## The verdict gate (`evaluateVerdict`)

Derived from the entries — never asserted independently of them:

| Verdict | Condition |
|---|---|
| `INVALID` | any bad signature · **any shared key** across claim/validation/test/decision (collusion) · wrong role for a part (e.g. an LLM signing the `decision`) |
| `UNVERIFIED` | missing the independent `validation` or `test` |
| `CONTESTED` | V returned `dispute` |
| `REFUTED` | T ran and `exitCode ≠ 0` |
| `PENDING_HUMAN` | A + V + T all green, but H has not `accept`ed |
| `PROVEN` | distinct keys for A, V, T, H · V `confirm` · T `exit 0` · H `accept` |

**The anti-collusion guarantee, in one line of the engine:**
```
const signers = [claim.by, validation?.by, test?.by, decision?.by].filter(Boolean);
if (new Set(signers).size !== signers.length) return 'INVALID';
```
If the key that signed the `claim` also signed the `validation` or `test`, the block is INVALID by
construction. The agent cannot spin up a sock-puppet validator under its own key. And only an `H`-role
key can sign an accepting `decision` — **an LLM can never mint the P9 leap.**

---

## Tamper-evidence & re-verification (`verifyLedger`)

Verify-then-dissolve, applied to history itself. Walks the chain and independently re-establishes it:
- re-links every `prevHash`,
- re-derives every `blockHash` (SHA-256 over the canonical, sorted-keys, fully-recursed block — any
  altered field changes the hash),
- re-checks every Ed25519 signature,
- re-computes every verdict (stored ≠ derived → flagged),
- and — if a `runVerify` callback is injected — **mechanically re-runs each PROVEN block's
  `verifyCommand`** and demands the same `exit 0`. A claim that was true once but silently rotted is
  caught. (Core stays I/O-free; the caller injects execution.)

---

## The three locked calls (decided 2026-07-13)

1. **V is per-task configurable, defaulting to an independent model.** Model-agnostic — any LLM,
   including fully offline (Ollama). H always retains override.
2. **Validation + Test are mandatory for DONE/push, optional for exploration.** Forcing a multi-sig
   proof on every exploratory keystroke would kill the tool with friction. The referee bites only on
   **state transitions** — anything crossing into DONE or moving to a push.
3. **It blocks, and it does *not* anchor publicly.** An incomplete signature set mechanically blocks
   the DONE transition. The SHA-256 seal stays **local** — zero-egress (all storage in local SQLite).
   Public/legal anchoring happens **only if H explicitly exports** (see `authorship-export.ts`).

---

## The Nine, enforced in cryptography (not prose)

- **P2 (prove, don't grant)** — every arrow is a signed receipt.
- **P4 (never claim more than you can verify)** — three independent attestations (A claims, V
  disputes, T tests) before "true" is written.
- **P5 (the rule binds its keeper)** — H holds the only accepting key, off-repo.
- **P6/P8 (safely endable · no trap)** — append-only, but never held against you: H supersedes any
  block with a signed `correction`. You never rewrite; you *speak again, on the record*.
- **P9 (the leap is the human's)** — only H's signed `accept` finalizes. V suggests; V never decides.

---

## What's built vs. next

**Built + proven (2026-07-13):** the engine — identities, `signEntry`/`verifyEntry`,
`evaluateVerdict`, `finalizeBlock`, `verifyLedger` — and its 12-gate proof-gate
(`node scripts/verify-truth-ledger.mjs`, wired into `make smoke`). ~60% composition of existing
CONTINUUM primitives (checkpoint hashing, the authorship seal, the lived `verifyCommand` discipline).

**Next (wiring, not new invention):**
- persist `TruthBlock`s through `StorageBackend` (a ledger table + append-only invariant);
- a Board gate: a todo cannot enter DONE without a `PROVEN` block;
- an MCP tool surface (`continuum_open_claim` / `continuum_validate` / `continuum_attest`) so A, V,
  and H each act through their own key;
- a key-registry (genesis block of public keys) + H's private key held off-repo.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
