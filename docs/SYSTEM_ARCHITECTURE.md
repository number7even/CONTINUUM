# CONTINUUM — System Architecture (the keystone)

> **Audience:** anyone (human or AI) who needs the whole mental model of CONTINUUM
> in one place.
> **Status:** 2026-07-11 · the definition captured from the design sessions, grounded
> in shipped primitives (P4 — every claim is tagged ✅ built / ⚠️ partial / 🆕 new).
> **Why this doc exists:** we defined this architecture across many exchanges. Leaving
> it in chat scrollback is the exact failure CONTINUUM was built to end. Capturing it
> here — verifiably, as a source of truth — *is* the product eating its own dog food.

---

## 0. The whole thing in one sentence

**The Knowledge is the north star (*what is*); the Plan is the ball and the source of
truth (*what should be*); the model (Team A) is grounded by the first and bound by the
second; ARIAN mediates it to your physical brain; the referee measures every move
against the Plan; you — the plan-giver — take the leap (P9); the Timeline turns it into
budget and stakeholder decisions; and selected folders feed the AMF factory floor to
become content — all captured, verified, refereed, and sealed into a record you own.**

---

## Who this is for — value, audience, how we help

> **AI can generate in seconds, but it can't *remember*, can't be *trusted*, and can't
> *own* what it makes. CONTINUUM gives the human those three back — on their own machine.**

Three verbs — the three things the AI structurally lacks:

| Verb | The pain today | What CONTINUUM does |
|---|---|---|
| **REMEMBER** | you re-explain the project every session; "we did X" but it's not true | verifiable memory — pickup/briefing means you never start cold |
| **VERIFY** | you can't trust the agent's word; you rubber-stamp | the referee *runs the proof* — DONE requires a green `verifyCommand`; the agent can't lie |
| **OWN** | who owns AI-built work? can you prove it's yours? | the Authorship Ledger — every accepted state sealed → provable human IP |

**Throughline:** it turns AI-assisted work from something you have to *trust* into something
you can *prove* — locally, privately.

### Who × how

| Who | Sharpest pain | How we help | Ready? |
|---|---|---|---|
| **Solo AI-assisted builders / HITL founders** *(primary)* | memory betrayal · agent over-claims · scope creep · work on the cloud · can't prove IP | never start cold · referee catches the lie · the Plan holds scope · local + private · ask-your-knowledge + audio/infographic *without leaving* (kills the NotebookLM paste) | ✅ mostly built |
| **Agencies / teams delivering AI-built work to clients** | proving the deliverable is the client's IP · honest progress · client picks the model | a tamper-evident **IP-provenance export** + honest velocity · per-project isolation · BYO-model | ⚠️ ledger built |
| **Stakeholders / funders (the boardroom)** | "80% done" is fiction · no real budget/runway | a scoreboard that **can't be faked** — velocity = *verified* requirements → honest burn/runway | 🆕 |
| **Regulated / enterprise (IP · audit · sovereignty)** | AI-authorship uncertainty · audit trails · data can't leave | tamper-evident authorship/audit chain · **local-first = data sovereignty** | ⚠️ |
| **VoiceCosmos tenants** *(roadmap)* | — | the same engine, tenant-scoped (ARIA embed) | 🆕 V3 |

### The "aha" (for the primary customer)
You open a project you haven't touched in a week. Instead of re-explaining it for 20
minutes, **ARIAN tells *you*** where you stand — MVP 6 of 9 verified, one decision awaiting
your leap, next by leverage — reads it aloud while you make coffee, and everything you
decide is sealed into a record proving *you* own it. **You never lost the thread, never
trusted a claim you couldn't check, and can prove the IP is yours.**

### Why not just…
- **…NotebookLM?** cloud (your IP on Google), manual (you paste), zero provenance. We're local, automatic, and prove ownership.
- **…a PM tool (Jira/Linear)?** they track *claims* of done; our DONE is a *verified* exit-0 — done is not a button.
- **…a memory plugin?** they store; they don't *verify* or *seal*.
- **…just Claude/Cursor?** brilliant at generating, amnesiac between sessions, owns nothing. We're the memory + referee + ledger *around* whatever model you bring.

**The category:** everyone else makes the AI *better*. CONTINUUM makes the AI *accountable
to the human* — and hands the human the memory, the proof, and the ownership. That's trust
infrastructure, not a feature.

---

## 1. The Stadium — the organizing model

CONTINUUM is a football match. The pieces map exactly, and the mapping is not
decoration — it fixes *who has authority over what.*

| Football | CONTINUUM | Note |
|---|---|---|
| **The Ball** | **the Plan** | *without it there is no game* — §4 |
| **A pass** | an input→output exchange (an Observation) | the moves |
| **Team A** | the model (the Doer) | its own brain — §2 |
| **Team B** | you (the Operator, HITL) | the only brain with authority |
| **The Referee** | the CONTINUUM engine | neutral; certifies, never scores — §5 |
| **The Linesmen** | independent specialized checks | offside/out-of-bounds/foul — §5 |
| **The Commentator / sparring partner** | **ARIAN** | the voice bridge — §3 |
| **The Crowd / the stands** | **the Continuum Brain** (built from your folders) | the Knowledge — §2 |
| **The scoreboard / league table / owner's box** | the always-on status | §6, §7 |
| **A goal** | a requirement *verified + accepted* | ball crosses the line **and** the referee certifies **and** you leap |
| **The manager / team sheet** | the PM brain + model-per-sprint | §4 |
| **The season** | the sprint timeline → budget → stakeholder decisions | §7 |

---

## 2. The Three Brains

There is not one brain. There are three, and they hold different *kinds* of truth.

| Brain | Whose | Holds | Relationship to the rest |
|---|---|---|---|
| **Team A Brain** | the model | its own ephemeral session memory, *the way it remembers* | **you have no influence over it** — so the Knowledge must *overrule* it (§5) |
| **Team B Brain** | **you** (HITL) | intent, judgment, the "why", tacit knowledge — mostly never written down | **the only brain with authority** (P9) |
| **The Continuum Brain** | the Knowledge | **ruVector + the folder structure = the entire database** — searchable, bash-able, neutral | the shared north star both you and the factory draw on |

**The Continuum Brain = ruVector + folders.** The folder tree (the "Company-in-a-Folder"
/ Colony blueprint) *is* the organisation of knowledge; ruVector is the semantic index
over it. *(Status: the folder tree is ✅; the semantic layer is FTS5 today with ruVector
as the ⚠️ opt-in upgrade — so "ruVector + folders" is the locked target, FTS5 the working
floor.)*

**The core asymmetry:** your brain forgets what the Knowledge remembers; the Knowledge
lacks what only your brain knows. The whole system exists to keep those two reconciled —
which is ARIAN's job.

---

## 3. ARIAN — the referee's voice, your sparring partner, the JARVIS bridge

ARIAN is the single voice interface between **the model, the Knowledge, and your physical
brain.** She is not an authority; she is a mediator.

```
        MY PHYSICAL BRAIN  (HITL — decides · P9)
              ▲    │
   assimilate │    │ use / amend / speak my version back
              │    ▼
          ┌────────┐
          │ ARIAN  │  sparring partner + mediator (voice)
          └──┬───┬─┘
     ┌────────┘   └────────┐
     ▼                     ▼
┌──────────┐  search/bash ┌──────────────────────┐
│ TEAM A   │ ────────────▶│  CONTINUUM BRAIN     │
│ the model│◀──── grounds │  ruVector + folders  │
└──────────┘              └──────────┬───────────┘
                       select folders │ → "send to factory"
                                      ▼
                          ┌──────────────────────┐
                          │  AMF factory floor   │  §8
                          └──────────────────────┘
```

Her loop: **you speak → she routes (prompt Team A / search the Knowledge) → she speaks
back the output + next steps → she asks *"what do you want to do with this?"*** You then
use it, take parts, or speak your amended version back to Team A, and the conversation
builds. She surfaces and asks; **she never decides.** *(Status: TTS/read-aloud ✅; the
`session_review` script she speaks ✅; two-way voice-in + routing 🆕.)*

---

## 4. The Plan — the ball (the first-class object)

### North Star vs Source of Truth
Two different "trues", and Team A is bound by the second:

| | Is | Team A's relation |
|---|---|---|
| **North Star** = the Knowledge | *what is / was* | **grounded by** it (can't contradict it) |
| **Source of Truth** = the Plan | *what should be* | **bound by** it (can only validly serve what it *holds and requires*) |

### Why the Plan is the ball
*Without the Plan there is no game* — no scope, no goals, no way to judge a move. The Plan
doesn't play; **it creates the game.** It is also the answer to "who has authority over
what Team A's output is allowed to become": **the Plan is that authority**, and whoever
provides the Plan (you, or a client for their project) owns the match.

### The Plan object
```
PLAN
├── MVP (this horizon — frozen, protected)
│    ├── objective          "what we're shipping"
│    ├── requirements[]      each = an acceptance criterion (a verifyCommand = a goal)
│    └── position            N of M verified → the scoreboard
├── ROADMAP (the other horizon — fluid, re-sequenced)
│    ├── future sprints[]    the ordered queue
│    ├── parked[]            inspiration routed here by the MVP/Roadmap valve
│    └── position            where we are in the table
└── SPRINT (the active period)
     ├── scope               in / out  → out-of-bounds detection
     ├── model               Fable | Opus | … → who gets leashed out (§4.3)
     ├── brain-shape         which folders/cluster loads this session (§4.2)
     └── the MVP/Roadmap valve on every inspired idea (§4.1)
```

### 4.1 The creativity valve — MVP vs Roadmap
Building generates inspiration; suppressing it kills the best ideas; unbounded, it eats
the ship date (the origin pain — partner-clause #3). So creativity is **routed, never
rejected:**
```
     inspiration mid-sprint → [ MVP or ROADMAP? ]
   serves this MVP → build now │ bigger → capture to ROADMAP (a future sprint, not now)
```
The current sprint's MVP scope is **protected**; the idea is **preserved**; the plan stays
**agile** (the roadmap absorbs it and re-sequences). The parked GitHub issues (#1–#3) are
this valve working correctly.

### 4.2 The sprint shapes the Brain
The Plan is agile and sprint-based, so **the current sprint decides the Brain's shape** —
which folders load, which cluster is in focus. This is the context-engineering law made
structural: *load the cluster, not the bag* — **the sprint is the cluster.** As sprints
advance, the Brain reshapes.

### 4.3 Model-per-sprint
The model is a property of the sprint, not a global setting. The Plan declares the right
tool for the work: `Sprint W28 "Authorship Ledger" → Opus` (deep); `Sprint W29 "cleanup"
→ Fable` (mechanical, cheap). Wins: **cost** (don't burn Opus on a rename), **capability**
(match model to work), **explicitness** (the choice lives in the Plan). ARIAN leashes out
the sprint's declared model. Clients declare *their* model — BYO-model, per sprint.

---

## 5. Enforcement — why it holds even if Team A will *not* abide

The whole architecture is worthless if it *depends on the agent's good faith* — that is
the betrayal this project was born from. So the design principle (P2 — *prove, don't
grant*): **do not make Team A abide; make *not* abiding ineffective.** You never trust the
striker's word on the goal — the **referee** certifies it. Enforcement lives *outside*
Team A's brain, in three layers, none of which need its cooperation:

1. **Mechanical verification** — the `verifyCommand` is **run by the environment, never
   asserted by the agent.** Team A cannot fake an exit code it didn't produce. (✅ the
   Board's proof gate.)
2. **Independent linesmen** — a *separate* process/agent checks what an exit code can't:
   privacy scrub (foul), scope/blast-radius (out-of-bounds), unverified claim (offside).
   Team A doesn't control them. (⚠️ pieces: privacy filter ✅, `check_brand` ✅,
   `session_review` ✅.)
3. **Your real leap (P9)** — the irreducible residue (taste, strategy) trusts *you*, not
   Team A. The system's job is to **shrink** that residue so your judgment is spent only
   where nothing can be proven.

**The trust gradient IS the enforcement.** Every node carries its epistemic tier; Team A's
output enters as the lowest and is *promoted only by external verification:*

| Tier | Example | Earns trust by |
|---|---|---|
| **Proven** | checkpoint entry, green verifyCommand | the environment runs the proof |
| **Authored** | your accepted decision | your P9 leap (the ledger) |
| **Reference** | your docs/specs | human-authored, *data to verify* |
| **External** | YouTube transcript, web | ingested, untrusted until checked |
| **Claimed** | the model's in-session assertion | ungrounded until it cites a node |

Team A cannot promote its own claims → "abiding" isn't chosen, it's *the only path by which
output is accepted at all.* **Two honest caveats (P4/P5):** (a) the leap must be *real* — if
you rubber-stamp, it collapses back to trusting Team A; (b) the referee is neutral — *your*
decisions are recorded too, so accountability is bidirectional and the record is
third-party-trustworthy.

> **The Nine is not a code you hope Team A internalises. It is a stadium in which you
> cannot score without the ball crossing the line — and the referee, not the striker,
> certifies the goal.**

---

## 6. The always-on scoreboard — three altitudes, one truth

The Plan is not a document you open; it is a **standing position** the system answers at
any instant, surfaced at kickoff (pickup), on demand (ARIAN "where do we stand?"), and
ambient (a header across the console):

| Altitude | View | Answers |
|---|---|---|
| **Pitch** (technical) | MVP scoreboard | *N of M requirements verified* |
| **Season** (plan) | Roadmap table | *where in the sequence, what's parked* |
| **Boardroom** (business) | Timeline / Budget | *velocity, burn, runway, next decision due* |

Same underlying truth (verified requirements), read at three heights. *(Status:
`session_review` gives the questions ✅; the position/scoreboard 🆕.)*

---

## 7. The Timeline — budget & stakeholder decisions

Time is the currency that converts the Plan into business. The Timeline is the bridge from
the pitch to the boardroom.

**Timeline → Budget, and the budget can't lie:**
```
velocity    = requirements VERIFIED per sprint   (proof, not story points)
remaining   = MVP requirements not yet green
cost/sprint = time × model (Opus sprint ≠ Fable sprint)
→ honest projection: MVP ships in N sprints ≈ $X
```
Because velocity is grounded in verify-then-dissolve, the forecast is **structurally
honest** — "80% done" means *M of N requirements exit 0*, not a guess. Model-per-sprint is
a budget lever a stakeholder can pull (*"switch cleanup sprints to Fable → +3 weeks
runway"*).

**Timeline → Stakeholder decisions:** the Timeline stages *when* and *what* a stakeholder
must decide — sprint boundary (go/re-plan), MVP gate (ship/hold), budget threshold
(invest/cut/extend), roadmap fork (which parked item promotes). These are **P9 leaps at the
business altitude**, recorded in the same ledger — *who decided to ship, on what evidence,
when.* *(Status: sprint timeline ✅; budget/velocity/decision-staging 🆕.)*

---

## 8. The two consumers of the Brain — you, and the factory

The Continuum Brain feeds **two** places:
1. **You** — via ARIAN, for dev work (assimilate → decide → amend → build).
2. **The AMF factory floor** — you pick folders → *"send to factory"* → the AMF Brain
   turns them into media content. *(AMF exists at `apps/amf/`; today it ingests public
   trends — feeding your own knowledge folders is the ⚠️ connection to formalise.)*

> ### ⚠️ The publish-gate (a live risk — build before the connection ships)
> The Brain holds private dev IP and secrets; AMF **publishes to the public.** The
> CONTINUUM→AMF seam **must** carry a confidentiality gate (like the privacy filter and
> AMF's `vault-guard`): a folder crosses into the factory only if explicitly cleared
> (`public: true` / a publish tier), and the gate scrubs/refuses anything internal. **The
> factory only ever eats cleared feedstock.**

---

## 9. The Studio — one graph, N layouts → the Output Package (per-sprint closure)

**The masterstroke:** the **Document**, its **Mindmap**, its **Infographic**, and the
**Universal Brain** are not four artifacts — they are **layouts of one graph.** A visual
output is never a heavy "render job"; it is an **isolate-and-re-layout** of the Brain.

| View | Layout | Zoom |
|---|---|---|
| **Document** | linear | one node's content, expanded |
| **Mindmap** | tree | an isolated subgraph (one doc/cluster) |
| **Infographic** | designed panels | an isolated subgraph, styled |
| **Universal Brain** | force-directed galaxy | everything |

**A map IS an isolation of the Brain.** A document's mindmap is the galaxy, isolated to that
doc's nodes, re-laid-out as a tree. One **toggle**: `UNIVERSAL (galaxy) ⇄ [isolate] ⇄ MAP
(this doc, tree)`. The Brain's `isolate` (depth 1/2/3) is the mechanism.

**Every node is a grounded, cited window — never a dead word.** At every zoom, hover reveals
its standing (the trust gradient, in the UI): **what it is** (summary in relation to the
grand doc) · **how it relates** (typed edge) · **how trusted** (tier) · **where from**
(source). Evidence that proves its own standing — not a label.

**Style is a prompt — brand-defaulted, override-on-edit.** Each render = CONTENT (the
isolation) + LAYOUT (mindmap/infographic/slide) + **STYLE** (a prompt, e.g. "clean white,
Helvetica, red lining"). The default is a **brand-DNA `visual_style` primitive**
(`record_brand_dna` / `check_brand`), applied automatically; an edit field overrides
per-render. Per-user/client → each brings their own look. Consistent style *is*
interpretability.

### The Output Package — the definitive per-sprint closure flow
**Not ad-hoc — it runs at every sprint/feature closure** (the full-time whistle). A feature
lands → the system produces one package (all from the same isolation) → and asks
**"what do you want to do with this feature?"** (your P9 call, recorded in the ledger):

- **The Record** (provable spine): summary · the doc · source/provenance · recorded in the Timeline.
- **The Intelligence** (the advisor): the **questions to ask** (`session_review`) · the **advised answer** (the Ask).
- **The Registers** (layouts of the isolation): infographic · mindmap · isolated Brain view · audio (two-host discussion) · video (deferred → best on a mindmap).
- **The routing decision** (yours): ship · brand-syndicate · Walk-and-Talk · roadmap · next sprint.

### Routing — the register meets the brain; the destination meets the plan
The package produces all registers; *what happens to it* is routed by three dimensions:
- **Cognitive wiring** — a per-user profile (auditory · visual · textual). The system defaults
  each brain to its native register (Riaan = auditory + visual). *The HITL can only leap (P9)
  if the info reaches them in a register they assimilate.*
- **Complexity** — quick grasp → visual + mindmap; complex → audio discussion (unpacks it).
- **Brand purpose ("worth it" = it builds the brand)** — company or personal brand-worthy
  content routes to production: cleared/publish-gated → **AMF factory → social syndication**,
  and the **Walk-and-Talk series** (audio, mobile) → **aligned to the 90-day content plan.**

### Two "balls": the project plan and the content plan
As the project Plan governs the build (MVP/roadmap/sprints), the **90-day content plan**
governs brand output — Walk-and-Talk episodes + syndicated pieces must *align* with it. The
**publish-gate** is the border: only cleared, brand-appropriate content crosses from private
knowledge into public brand content.

### Ingest / train (🆕)
Add files, or **point at a YouTube channel → transcribe → searchable knowledge**. Sources
grow by upload *and* transcription.

**Privacy:** the graph + its layouts are local; only an external *styling/production* call
(Gemini image · Pod-geni · AMF syndication) may leave — **publish-gated, scrubbed, tier-aware,
never for a node above its cleared tier.** The knowledge never leaves; at most a cleared
summary/source-package does.

> **Roadmap note:** the generation/Studio layer (rich renders · two-host podcast) is the
> natural open-core **pro tier** — the trust core stays free. Captured by the MVP/Roadmap
> valve; the MVP is *the operator has the output, in their register.*

---

## 10. The layout — the jumbotron

One persistent view-switcher across every surface (fixes "I can't reach the PM Timeline
from the Brain"):

```
◉ BRAIN   ▦ BOARD   ⧗ TIMELINE   ▤ SOURCES   ✦ STUDIO
```
- **BRAIN** ✅ the graph · **BOARD** ✅ Kanban/swimlanes · **TIMELINE** ✅ sprint timeline
  (⚠️ not reachable from the Brain yet) · **SOURCES** 🆕 the folder tree · **STUDIO** 🆕
  infographic + audio.

---

## 11. The loop — end to end

```
capture (observe/adapters/hooks) → the Brain (ruVector+folders)
   → ARIAN mediates → your physical brain assimilates → you decide (P9)
   → amend / speak back to Team A → the conversation builds
   → every accepted move sealed into the ledger (authorship + IP)
   → the Timeline → sprints → your repo · branches · CI/CD
   → CI/CD outcomes flow BACK as Observations → new tickets   (⚠️ close this loop)
   → selected (cleared) folders → the AMF factory → content
```

The same ledger that proves authorship also drives delivery. The match report and the
deploy are the same chain.

---

## 12. Depth / v2 — the improvements that make it *deep*

None is a new subsystem; each makes what flows through the existing append-only log
*epistemically honest.*

1. **Trust gradient** (§5) — type every node; the model must respect it. *The thesis.*
2. **Ground the model hard** — the Knowledge overrules Team A's memory; ungrounded claims
   are `claimed` until they cite a node.
3. **⚠️ The AMF publish-gate** (§8) — a *live* confidentiality risk the moment the factory
   connection ships.
4. **Close the delivery loop** — CI/CD failures re-enter as tickets → self-healing.
5. **Capture your *judgment*, not just decisions** — when you amend, capture the *why*;
   over time the Brain encodes your judgment → un-copyable moat.
6. **Explicit event-sourcing** — every view is a projection of the one append-only log →
   time-travel, auditability, re-derivable indexes (ruVector staleness always fixable).
7. **Augment the bottleneck (you)** — batch + rank decisions; spend the leap only at
   liability-transfer points (the friction budget).

---

## 13. Status — built vs new (P4, honest)

**✅ Built:** the Brain graph · Board (6-state, proof gate) · sprint Timeline · the
folder scaffold (ICM) + Continuum Hook (handoff/pickup ↔ STATE.md) · docs/git/export
adapters · FTS5 search · Progressive Disclosure · privacy filter · SSE transport ·
`observe` (capture) · `session_review` (the Commentator) · the **Authorship Ledger**
(`record_decision` + the `acceptedBy` seal + tamper detection, Phases 1–2) · ARIAN
TTS + mermaid/mindmap.

**⚠️ Partial:** ruVector semantic layer (FTS5 floor) · linesmen (pieces) · the
view-switcher · CONTINUUM→AMF connection.

**🆕 New:** the Plan as a first-class object (scope/requirements/MVP/roadmap/model/
brain-shape) · the scoreboard (three altitudes) · Timeline→budget→stakeholder · ARIAN
two-way voice + routing · **the Output Package** as the per-sprint closure flow ("what do
you want to do with this feature?") · maps as Brain isolations (layout pipeline) · the
**relational-summary node hover** (content + edge-role + tier + source) · the **Map ⇄
Universal toggle** · brand-defaulted **`visual_style`** renders (override-on-edit) ·
**cognitive-wiring output routing** (auditory/visual/textual) · the **90-day content plan**
→ AMF social syndication + the Walk-and-Talk series · the publish-gate · closed delivery
loop · judgment capture · the Sources surface.

---

## 14. The Nine → this architecture

| Principle | Where it lives |
|---|---|
| **P1** minimize the secret | privacy filter · publish-gate |
| **P2** prove, don't grant | the whole enforcement model (§5) — verify, never trust |
| **P3** architect for change | storage adapter · model-per-sprint · folders-as-knowledge |
| **P4** never claim more than you can verify | verify-then-dissolve · honest velocity/budget |
| **P5** the rule binds its keeper | the referee is neutral — *your* decisions are recorded too |
| **P6** be safely endable | append-only log · nothing trapped · local-first |
| **P7** entry freely chosen | BYO-model · local-first · no coerced follow |
| **P8** do not trap/coerce/extract | your knowledge never leaves; only render calls do |
| **P9** the leap is the human's | you decide — pitch to boardroom; the ledger records it |

---

_The Knowledge is the north star; the Plan is the ball; the referee measures every move
against it; you take the leap; the Timeline turns it into budget and decisions; and it is
all captured, verified, and sealed into a record you own._

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
