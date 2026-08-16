# KAIZAN — the Authoring Handoff

_The contract for whoever writes industry canon (today: the founder + advisor drafts under
founder review). KAIZAN documents are not prose — they are **source code for operations**
that compiles onto VoiceCosmos (workforce) and CONTINUUM (truth ledger). Write them so the
compiler — human today, software at V1.5 — never has to guess._

---

## 1. Where canon lives (the first rule)

**`github.com/number7even/kaizan` is the canonical home** (since 2026-08-16). The iCloud
folder is archive. Author in the repo, commit, push — un-versioned canon is how the
documentation-drift incidents happened, and playbooks will be *executed*, so a paraphrased
playbook is an operational bug. Advisor-drafted material enters via commit under founder
review, never via "it's in your Studio panel."

## 2. The four schemas every industry MUST use (no freelancing the format)

1. **Blueprint sheet — 11 layers** (Layer 0 = inherited constitution: The Nine +
   VOICEOS_STRUCTURE; through Layer 10 expansion). One sheet per industry.
2. **Role spec — 7 parts** per role: identity/graph anchor · costed task registry
   (wage × freq × duration) · HITL slots (`OWNS`/`APPROVES`) · HMI interfaces ·
   compliance weave (GUARDS) · wargamed skeptic-patch · metric signature.
3. **Flow — 9-part skeleton**: PROBLEM · TRIGGER · NEEDS · GUARDS · ACTS(BINDS) · SAY ·
   AFTER · FAIL(ESCALATES) · CONSUMES/PRODUCES/LADDER/HITL.
4. **Scenario plan — 8 points** incl. expected observations, failure+cause+response,
   fork triggers, RECON NEEDED, stop conditions, **verification runs**, skeptic review,
   blind-executability (`pack.json` carries every unwritten spec).

## 3. Authoring invariants (what the compiler will hold you to)

- **Odometer tags inside canon.** Anything not contractually real is tagged `[VISION]`
  in-line (the F1 sheet already does this for the GDPR guard — that's the standard).
  Vendor names in Integration Sets are TARGETS until a contract exists; never write them
  as live.
- **GUARDS are data, not vibes.** Every guard must be expressible as a boolean over named
  fields ("track_state==LIVE ∧ escort_matched==false ⇒ gate locked"). If you can't write
  the boolean, you haven't finished the rule.
- **Every HITL `APPROVES` slot becomes a P9 seal.** Author them only where a human MUST
  own liability — each one is a real click a real person makes, forever. No auto-approve
  anywhere, by constitution.
- **Every flow ships its witnesses.** The scenario's "verification runs" become
  `verifyCommand` gates. A flow without a runnable check cannot reach ✅ in production.
- **Every guard ships its skeptic-patch.** If the tech fails, what do the humans do? A
  guard without an analog shadow violates P6 (be safely endable).
- **The scraping ban binds canon** (CONTINUUM Brief §II.10): no flow may specify
  cookie-scraping, credential reuse, or HTML scraping around blocks. Official APIs and
  compliant feeds only — reject at authoring time, not integration time.
- **Identity discipline:** playbooks reference the tenant as `workspace_id` and never
  invent parallel ID schemes; provenance IDs are CONTINUUM Observation ids.

## 4. What each element compiles to (so authors know the stakes)

| You write… | It becomes… |
|---|---|
| Role spec | Agent loadout + human job spec + costed ledger entries |
| Flow SAY lines | The persona's spoken scripts (Voice Mediator register, puffery-gated) |
| GUARDS | Hard gates — doors that refuse billionaires |
| HITL slots | Sealed decisions with the operator's name on them |
| Verification runs | Exit-0 witnesses in the live pipeline |
| Skeptic-patches | The staff's legally-binding offline SOPs |
| Promise lifecycle | The tenant's Observation state chain |

Write every line as if a machine will enforce it literally and a human will be held to it
under pressure — because both are the design.

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
