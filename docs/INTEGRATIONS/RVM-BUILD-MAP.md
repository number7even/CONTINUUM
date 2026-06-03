# RVM ↔ CONTINUUM Architecture + Build Map

> **Bound by [The Nine](../../AGENTS.md) v0.1.0.**
>
> **Status:** RVM source exists at `~/Development/rvm` (Issue #19),
> `cargo check` is green. Zero integration code in CONTINUUM. This
> document maps the architecture and build plan to take RVM from
> "source-only" → "first witness in production" without breaking
> Journey 3 (the zero-config Solo Developer experience).
>
> **Layer:** 0 — Physical / Hypervisor (per `VISION/UNIFIED-ARCHITECTURE.md`).
> **Position:** The bottom of the stack. Everything else depends on RVM's
> 64-byte cryptographic witnesses for the verify-then-dissolve loop.

---

## TL;DR — what we need to build (and what RVM already gives us)

| # | Component | Owner | Status |
|---|---|---|---|
| 1 | RVM bare-metal kernel (`rvm-kernel`) | RVM team | 🟠 source-only at `~/Development/rvm`, `cargo check` green |
| 2 | Coherence Engine (`rvm-coherence`, <10µs partition switch) | RVM team | 🔮 unmeasured |
| 3 | Witness Engine (`rvm-witness`, 64-byte hash-chain) | RVM team | 🔮 no emitter |
| 4 | Witness format spec (byte-exact layout) | **JOINT** RVM + H-MARA + CONTINUUM | 🟠 proposed in [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md) §Need #3 |
| 5 | RVM ↔ host transport (FFI? UDS? network?) | **JOINT** RVM + CONTINUUM | 🔮 not designed |
| 6 | CONTINUUM-side witness verifier | CONTINUUM | 🔮 zero code (this doc proposes the design) |
| 7 | Hash-chain mirror in CONTINUUM | CONTINUUM | 🔮 zero code |
| 8 | `continuum_update_todo` "witness mode" | CONTINUUM | 🟠 trivial extension once verifier exists |
| 9 | Test fixture: golden witness file | CONTINUUM | 🟠 can write today against the proposed format |
| 10 | aarch64-unknown-none CI cross-build | RVM team | 🔮 no CI hooks |
| 11 | QEMU integration for partition validation | RVM team | 🔮 no harness |
| 12 | Zero-config fallback for Journey 3 (no RVM available) | CONTINUUM | ✅ already shipped (shell-exit-code proxy) |

---

## Architectural boundary

```
┌────────────────────────────────────────────────────────────────┐
│  CONTINUUM (Node 20, TypeScript, npm workspace)                 │
│  Default verify mode = shell-exit-code (Journey 3, works today)│
│  Opt-in verify mode  = rvm-witness    (Layer 0+, when wired)   │
└──────────────────────────────┬─────────────────────────────────┘
                               │ (verify mode = witness)
                               │ HTTP or UDS RPC
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  rvm-bridge (NEW — Rust process, runs on the host)              │
│  - Speaks the witness wire protocol to RVM                      │
│  - Mirrors RVM's hash chain to local disk for verification      │
│  - Exposes a simple HTTP /verify endpoint to CONTINUUM          │
└──────────────────────────────┬─────────────────────────────────┘
                               │ vendor-specific (FFI / serial)
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  RVM (no_std Rust, bare metal or QEMU)                          │
│  - rvm-kernel (partition manager)                               │
│  - rvm-coherence (<10µs partition switch)                       │
│  - rvm-witness (64-byte hash-chain emitter)                     │
│  - rvm-security (P1/P2/P3 gates)                                │
└────────────────────────────────────────────────────────────────┘
```

**The `rvm-bridge` is the critical new component.** CONTINUUM speaks
HTTP. RVM speaks bare-metal Rust. We don't want CONTINUUM to bind to
RVM's wire format directly because:

1. RVM's wire format is RVM team's choice (FFI, UDS, serial, raw memory)
2. CONTINUUM is TypeScript and shouldn't FFI into Rust libraries for
   a layer-0 dependency
3. The bridge lets CONTINUUM run **with or without** RVM (graceful
   degradation to shell-exit-code if bridge is unreachable)

---

## The architectural commitment to Journey 3

**Journey 3 (Solo Developer) currently runs 100% real with zero
native dependencies.** `npm install` → works on Linux / macOS /
Windows. No Rust toolchain required.

**RVM integration MUST preserve this.** Two non-negotiables:

1. **RVM is opt-in.** The default verify mode stays `shell-exit-code`.
   Only operators who explicitly install the `rvm-bridge` get
   witness-mode verification.
2. **The `npm install` story is unchanged.** RVM lives in a separate
   binary distribution channel — possibly `cargo install rvm-bridge`,
   possibly a downloadable binary, possibly a Docker sidecar — but
   never a native dep of `@continuum/*`.

If we can't preserve Journey 3, we don't integrate RVM. Path C from
the V0.5 promotion debate landed hard on this principle and it carries
forward.

---

## Build plan — phased, gated

### Phase R0 — Spec finalization (Weeks 1-2)

**Goal:** byte-exact agreement on the witness format and the wire
protocol.

- [ ] RVM team confirms the witness layout proposed in
      [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md) §Need #3 (or proposes
      changes)
- [ ] RVM team specifies the wire protocol (we propose HTTP over UDS
      because it's the easiest for CONTINUUM to consume and easy for
      Rust to expose)
- [ ] Hash-chain mirror protocol: how does the rvm-bridge subscribe
      to new witnesses? Long-poll? WebSocket? File watch on a
      shared log?
- [ ] Hash algorithm + canonicalization rules for the AST patch hash
      (SHA-256 + JCS? SHA-3? Length-prefixed bincode?)

**No code in CONTINUUM yet.** Just the spec.

### Phase R1 — rvm-bridge MVP + CONTINUUM verifier (Weeks 3-6)

**Goal:** CONTINUUM can verify a witness end-to-end against a synthetic
RVM (QEMU or stubbed Rust binary).

- [ ] `rvm-bridge` Rust binary: HTTP server on `localhost:7879` with:
      - `GET /healthz` — am I up?
      - `POST /verify` body `{ witness_hex, ast_canonical }` → 200 if
        witness verifies against local hash-chain, 401 otherwise
      - `GET /chain/latest` → most recent witness for diagnostics
- [ ] CONTINUUM-side: new env var `CONTINUUM_RVM_BRIDGE_URL`. When set,
      `continuum verify` checks `rvm-bridge` for any todo with
      `verifyMode: "witness"` instead of running the shell command
- [ ] Test fixture: a `golden_witness.bin` file + an `ast.json` file
      that should verify successfully; mutation tests that fail
- [ ] `rvm-bridge` source lives in `~/Development/rvm` (sibling to the
      kernel) so RVM team owns it. CONTINUUM consumes the binary only

### Phase R2 — Real partition detonation (Weeks 7-10)

**Goal:** A real RVM partition (initially in QEMU) emits a witness that
CONTINUUM verifies and dissolves a todo on.

- [ ] RVM team: bootloader stable on `aarch64-unknown-none`
- [ ] RVM team: Coherence Engine measured at <10µs in QEMU
- [ ] H-MARA Tier-2 Judge shim: receive an AST, hand to RVM, receive
      witness back, return verdict to caller (this is mostly H-MARA
      team work)
- [ ] CONTINUUM: end-to-end test — submit a todo with `verifyMode:
      "witness"` + an AST, observe RVM witness flow back, todo
      dissolves
- [ ] `rvm-bridge` packaging: documented install path for operators
      (`cargo install --git ~/Development/rvm rvm-bridge` or a
      pre-built binary download)

### Phase R3 — Hash-chain mirror + audit trail (Weeks 11-14)

**Goal:** Every witness CONTINUUM accepts is also recorded in a
local mirror of RVM's hash chain. Operators can prove no witness was
forged after the fact.

- [ ] `rvm-bridge`: write each verified witness to
      `~/.continuum/witness-chain.log` (append-only)
- [ ] CONTINUUM observation type `rvm_witness` containing the 64
      witness bytes + the proven AST + the trace ID
- [ ] New MCP tool `continuum_verify_witness_chain` walks the log and
      asserts each link references the previous
- [ ] Cross-machine sync (V2.0 ops feature): replicate the log to
      a hardened backup so a compromised host can be detected

### Phase R4 — Production hardening (Weeks 15+)

Not in scope of this doc. Includes: real silicon (not QEMU), per-tenant
partition isolation (V2.0 multi-tenant alignment), partition resource
quotas, RVM fleet management.

---

## Witness format — proposed byte layout

Restating from [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md) §Need #3 for
single-file readability:

```
Offset  Size   Field                                          Notes
------  -----  -----------------------------------------     -----------
0       4      Magic: "RVMW" (0x52 0x56 0x4D 0x57)            constant
4       2      Version: u16 little-endian                     start 0x0001
6       2      Witness type: u16 LE                           1 = code-patch-verified
8       32     SHA-256 of canonical AST patch                 see §Canonicalization
40      8      Timestamp: u64 LE Unix microseconds            wall clock
48      8      RVM partition ID: u64 LE                       provenance
56      8      Hash chain link: u64 LE index                  monotonic

Total: 64 bytes.
```

**Canonicalization rules (proposed):**
- AST serialized as JCS (RFC 8785) over a deterministic JSON
  representation of the AST nodes
- Or: bincode with field tags and explicit endianness
- Final choice owned by RVM + H-MARA teams; CONTINUUM mirrors whatever
  they pick

---

## Hash-chain semantics (proposed)

Each new witness's "chain link" field is the index, monotonically
increasing. The hash for chain link `n` is:

```
H_n = SHA-256(H_{n-1} ‖ witness_bytes_n)
```

with `H_0 = SHA-256("RVM_CHAIN_GENESIS" ‖ partition_id_of_node_0)`.

`rvm-bridge` maintains a parallel log mirroring RVM's chain. CONTINUUM
queries the bridge for the latest `H_n` and refuses to dissolve a
todo if its witness's chain link `m` < `n` (i.e., we never accept a
backdated witness).

---

## CONTINUUM-side changes (when ready to wire)

Minimal surface area, gated by env var:

### `packages/core/src/storage.ts`

```typescript
// Already has:
export interface CreateTodoInput {
  title: string;
  refs?: string[];
  verifyCommand?: string;
  // ...
}

// Add:
export interface CreateTodoInput {
  // ...existing fields...
  verifyMode?: 'shell-exit-code' | 'witness';  // default 'shell-exit-code'
  witnessAstHash?: string;                     // SHA-256 hex; required when verifyMode='witness'
}
```

### `packages/cli/src/index.ts` (continuum verify)

```typescript
async function verifyEntry(entry: VerifyEntry): Promise<VerifyResult> {
  if (entry.verifyMode === 'witness') {
    const bridgeUrl = process.env.CONTINUUM_RVM_BRIDGE_URL;
    if (!bridgeUrl) {
      return { status: 'skipped', reason: 'no rvm-bridge configured' };
    }
    return await verifyViaWitness(bridgeUrl, entry.witnessAstHash);
  }
  return await verifyViaShellExit(entry.verifyCommand);
}
```

### `packages/mcp-server/src/tools/update-todo.ts`

When the operator updates a todo to `done` and the todo's `verifyMode`
is `witness`, the handler MUST receive a `witness_hex` arg and verify
it before accepting the state transition.

### New env vars

| Variable | Default | Purpose |
|---|---|---|
| `CONTINUUM_RVM_BRIDGE_URL` | unset | If set, witness-mode verifies hit this URL. Else witness-mode todos remain unverifiable + log a warning. |
| `CONTINUUM_RVM_REQUIRE_WITNESS` | `false` | If `true`, all new todos default to `verifyMode: 'witness'`. Otherwise default stays `shell-exit-code`. |

---

## Cost / footprint estimates (honest)

- **rvm-bridge binary:** Rust, small (~5MB compiled). Single process.
  No native libs in CONTINUUM's npm tree.
- **Verifier latency:** ~1ms for SHA-256 + chain lookup on a warm bridge.
  Adds <1% overhead to `continuum verify` runs.
- **Hash-chain storage:** 64 bytes per witness + a small index. 1M
  witnesses = ~70MB. Compactable.
- **Operator install effort:** one extra binary (`cargo install` or
  download) + one env var. No change for operators who don't opt in.

---

## What we are NOT building (P5 — the rule binds its keeper)

- **No RVM kernel work in CONTINUUM repo.** That's the RVM team's
  domain. We consume the bridge.
- **No mandatory RVM dependency.** Journey 3 stays zero-config.
- **No silicon-specific code in CONTINUUM.** `aarch64-unknown-none`
  cross-builds belong in the RVM project's CI.
- **No multi-tenant RVM scheduling.** That's V2.0+ ops territory.
- **No replacement of `continuum verify`.** Witness mode is an
  additional path, not a replacement for the shell-exit-code path
  that has shipped and works today.

---

## Honest non-claims (P4)

- **<10µs partition switch is unmeasured.** We have RVM team's design
  goal; no benchmark on real silicon or QEMU we've seen.
- **`rvm-witness` has no emitter yet.** The byte format above is a
  proposal between three teams (RVM + H-MARA + CONTINUUM), not a
  shipped contract.
- **`cargo check` green at `~/Development/rvm`** is the floor of
  what we've verified — it compiles. Nothing about it runs end-to-end
  with hardware isolation.
- **Hash-chain mirror is an honest commitment by CONTINUUM** once the
  format is fixed. Not on the critical path of any current sprint.
- **Per-tenant partition isolation** depends on RVM exposing a
  partition-scoping API. Not in any shipped RVM code we know of.

---

## What it would take to start Phase R1 work in CONTINUUM

- ✅ This document (delivered)
- ✅ [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md) §Need #3 witness format proposal (delivered)
- ⏳ RVM team review + counter-proposal or sign-off on the format
- ⏳ RVM team commits to ship `rvm-bridge` (the HTTP/UDS adapter — Rust binary)
- ⏳ Operator authorization for a CONTINUUM sprint slot focused on R1

None of these are in-flight. This is roadmap, not WIP.

---

## See also

- [`H-MARA-HANDOFF.md`](./H-MARA-HANDOFF.md) — Layer 3 integration; witness format proposal cross-references this doc
- [`VIBELY-HANDOFF.md`](./VIBELY-HANDOFF.md) — Layer 2 integration; escalation to H-MARA which eventually invokes RVM
- [`../VISION/UNIFIED-ARCHITECTURE.md`](../VISION/UNIFIED-ARCHITECTURE.md) §"Layer 1 Physical: RVM" — current tier label (🔮 aspirational); this doc proposes how to move it toward 🟡 partial
- GitHub Issue #19 — RVM integration tracking (source checkout, cargo-check status)
- [`../UX-JOURNEYS.md`](../UX-JOURNEYS.md) §"Journey 3 (Solo Developer)" — the zero-config promise this integration MUST preserve

---

_Bound by The Nine v0.1.0._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
