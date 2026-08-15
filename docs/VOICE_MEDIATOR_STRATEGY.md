# The Voice Mediator — Strategic Implementation (🔴 VISION, substrate ✅)

_A core CONTINUUM experience: a voice between the operator and the terminal that **reads
the state aloud in plain language — without ever upgrading its certainty.** "Tell me what
this means like I'm not an engineer" becomes a first-class product surface, not a favor an
assistant does. Status: strategy locked to paper; **zero implementation before Wave-1
closes** (standing sequencing rule). Every claim below is tagged._

---

## 1. Why this is CONTINUUM's feature to own (not a gadget)

Every rival memory layer competes on *recall*. CONTINUUM competes on *honesty*. A
plain-language narrator is where honesty usually dies — simplification is exactly where
hype creeps in ("the build is done!" when the build is 🟡). This session is the proof:
weeks of advisor-channel output required a human-adjacent mediator to verify-then-translate,
and the un-mediated channel produced fabricated receipts.

**The differentiator, in one sentence: an explainer that structurally cannot overclaim.**
The mediator inherits the Honest Odometer as a *grammar constraint*: it may shrink
vocabulary, it may never promote epistemic status. "The seal thing worked — that's proven,
I re-ran the check" vs "the other team says their part is ready — I can't see their machine,
so that's their word, not mine." Nobody else can ship this, because nobody else has
per-claim verification state to narrate from.

## 2. The substrate already on disk (✅ — this is why it's cheap)

| Existing piece | Role in the mediator |
|---|---|
| `continuum://session/briefing` (Layer-0 resource) | The script source — state + todos + recent activity in one cheap read |
| Progressive Disclosure L1→L3 | "Say *details*" drill-down path (search → timeline → full fetch by ID) |
| Honest Odometer tags + `verifyCommand` witnesses | The certainty grammar — every sentence knows if it's ✅/🟡/🔴 |
| `voice_pipeline.py` (VoxCPM / Supertonic, own-stack) | Local, zero-egress TTS — no ElevenLabs, no cloud leak (P1) |
| `review.mjs` P9 queue | The killer use-case: spoken draft review (224 pending today) |
| Event-driven triggers / tripwire todos | Narration moments — speak only on state change, silent otherwise |
| D4 lock (phased digest engine) | The precedent: template narration V0 → local LLM later, no API dependency |

## 3. Foundational features (build order inside the feature)

1. **`continuum_explain` — the register-shift engine (MCP tool + CLI).** Input: any
   Observation/tool output/event + a register (`plain`, `founder`, `board`, `eli5`,
   `developer`). Output: short prose. **V0 is deterministic templates** (D4 pattern) —
   no LLM required; LLM registers are an opt-in upgrade.
2. **The Honest-Narrator Gate (the invariant that makes it CONTINUUM).** A deterministic
   check over every rendering: no completion-verb ("done", "live", "working") may attach
   to a claim whose odometer tag is not ✅; 🟡 renderings must name the boundary ("their
   terminal reports…"); 🔴 must say "planned". Shipped WITH a smoke test, or the feature
   doesn't ship — the narrator is gate-checked like everything else.
3. **`continuum brief --speak` — the spoken session start.** The Layer-0 briefing through
   the register engine through local TTS: *"Since yesterday: two gates flipped green, one
   thing is waiting on you, nothing is broken."* (V0 fallback: macOS `say` — day-one
   utility before voice_pipeline wiring.)
4. **Event narration.** Tripwire flips, deploy results, seal minting → one spoken
   sentence each. The machine stays silent except at state changes (matches the
   event-driven doctrine; no phantom "watching").
5. **The spoken P9 queue (the founder-workflow unlock).** `review.mjs --speak`: *"Draft 12
   of 224, brand Continuum: 'headline…'. Source verified against two independents. Brand
   gate clear."* — then the human decides. **Voice may read, summarize, and propose;
   the approve remains a deliberate act** (explicit confirmation phrase at minimum —
   whether voice-approve is permitted AT ALL is a P9 design decision reserved for the
   founder, consistent with the VoiceCosmos HITL line: voice searches/previews/proposes;
   the leap stays human).
6. **Ask-back (voice in, later).** Push-to-talk → Layer-1 search → spoken answer carrying
   citation IDs — "say *details* for the full record" walks the L1→L3 ladder by voice.
7. **Per-tenant register + persona.** The same engine, workspace-scoped: the founder hears
   plain-English ops; a hotel GM hears ARIA narrate last night's digest. **This is the
   three-customers strategy verbatim** — dogfood (us) → OSS CLI flag (builders) → ARIA
   embedding (tenants). The mediator is ARIA's brainstem, built once on the spine.

## 4. Alignment audit (The Nine)

- **P1** — local TTS, zero egress; renderings are projections, never new stores of secrets.
- **P4** — the Honest-Narrator Gate IS P4 as a grammar; simplify words, never certainty.
- **P6** — speak-on-event only; endable, no always-on listener by default.
- **P9** — the voice proposes and reads; it never approves, publishes, or spends. The
  mediator makes the human's leap *better-informed*, not automated.
- **Three customers, one engine** — identical architecture, register/config differs. ✓

## 5. Sequencing (the line holds)

**Nothing builds until Wave 1 closes** (same ruling as book-to-skill, CMF, ARIA loadouts).
When it opens: feature 2 first (the gate is the moat), then 1 → 3 in a day-scale slice
(template narration + `--speak` over the existing briefing), 4–5 next, 6–7 at the V1.5+
horizon with the role-loadout work. The V0 slice touches no frozen surface: it is a
read-only projection over resources that already exist.

---

## 6. Design inputs received (audited 2026-08-15 — recorded, NOT built)

**The Gauntlet-Loop pattern** for feature ② is adopted as design intent, with credit: it is
the public `robonuggets/gauntlet-loop` skill (builder/critic pairs looping to a quality
bar) — the Honest-Narrator Gate slots in as the critic. An advisor-channel claim that this
was already "implemented and live" in this repo was disproven on disk (no files exist);
the concept survives, the claim does not.

**Five defects in the advisor's implementation sketch — do not inherit them when the park lifts:**
1. **Shell injection:** piping narrator text via `execSync(\`… --text "${output}"\`)` puts
   untrusted spoken content into a shell string. Use `spawn` with argument arrays or stdin.
2. **Stale package name:** `@continuum/core` — the pre-rename scope that already broke the
   Fly Docker build once (`db87d4a`). Real name: `@number7even/continuum-core`.
3. **Broken CI assertion:** `execSync` returns *stdout*, not an exit code — the proposed
   `assert.equal(exitCode, 0)` gate can never work as written; a throwing call is the signal.
4. **Wrong tool-module shape:** the sketch invents an `McpTool`/`../types` interface; real
   tools follow the existing `packages/mcp-server/src/tools/` registration pattern.
5. **Python-in-core mismatch:** `packages/core` is a TypeScript workspace; the voice
   runtime belongs at the app layer (alongside `voice_pipeline.py`) or its own package.
   "VoxCPM2 48kHz on localhost:37777" specifics are unverified.

Sequencing unchanged: **all of §6 waits behind Wave-1 closure.**
