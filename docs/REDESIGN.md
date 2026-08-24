# Northstar — the 10/10 plan

How Northstar goes from a competent generic dashboard to an instrument that
could win a design award. This supersedes nothing in
[`DESIGN-DIRECTION.md`](./DESIGN-DIRECTION.md) — it inherits its two rules
("colour is data, everything else is ink" and "the timeline is the interface")
and carries them further, into the domain model and across every lens.

The engine's math is correct and stays correct. Everything here is model,
surface, and motion.

---

## 0. The diagnosis, in one sentence

Northstar answers one question — *"will I be OK, and when does it break?"* — but
it is **built like four separate apps that happen to share a chart**, and its
**data model is shaped like a spreadsheet, not like a life.** A person thinks
"my Amazon job," "my house," "when can I stop." The app makes them think in
"income events," "windfalls," "priority rules," and four disconnected tabs, one
of which is blank. The gap between how the app is organised and how a person
holds their own money is the whole problem. Close it and the app becomes
obvious.

The seven specific complaints all descend from that one gap. This plan fixes the
gap first, then the seven fall out of it.

---

## 1. Brand vision

**Northstar is a forecasting instrument, not a financial dashboard.**

A dashboard reports the past. A spreadsheet holds a static guess. An instrument
is a live read on a system you can steer — an altimeter, a depth gauge, the
Weather app's honest hourly line. You point it at a future, it tells you the
truth about that future, and you can reach in and bend the future with your
hands.

| | |
|---|---|
| **Name** | **Northstar.** Retire "Forecasting" as the wordmark — that is the *function*, not the *name*. The north star is the one fixed point you navigate the rest of your life by. |
| **One line** | *See the whole arc of your money — and bend it.* |
| **Personality** | A precise, calm instrument. Braun measuring tool, cockpit gauge, Copenhagen-fintech restraint. Never a SaaS dashboard, never a bank. |
| **The emotion to engineer** | **Calm confidence.** The app's job is to take financial anxiety — a fog of unknowns — and resolve it into one clear line you understand and control. Every decision is measured against: *does this make the user feel more in control, or less?* |
| **The signature** | **The timeline you grab and bend.** Drag a life event through time and the entire future re-forms live under your hand. Nothing else in the category lets you touch the future. This is the one memorable thing; everything else stays quiet so it can be loud. |

Apple's eight principles, mapped to Northstar:

- **Purpose** — one question, answered honestly. Every pixel that doesn't serve
  "will I be OK, and what changes that" is cut.
- **Agency** — you author the plan and can reach in and change any input from the
  number it produces. Undo is free; nothing is destructive without a step.
- **Responsibility** — this is a projection, never advice. The app never hides
  the range of outcomes to look more certain than it is. The honest band is a
  feature, not fine print.
- **Familiarity** — the model matches how people already hold their money: a
  job, a house, a retirement, savings. Not "events" and "rules."
- **Flexibility** — the same plan reads on a phone and a 27". Assumptions are one
  tap from any number for the person who wants them, invisible for the person
  who doesn't.
- **Simplicity** — the common path is on the surface; the powerful path is one
  layer down. Never minimal-but-empty; never dense-but-buried.
- **Craft** — every number is set in the right figures, every transition has a
  reason, nothing is a default.
- **Delight** — the result of the other seven, not confetti. The feeling when you
  drag your retirement two years earlier and watch the line hold.

---

## 2. The model, rewritten to match a life

This is the backend change that ties every tab together. Two new concepts, both
mostly a friendly surface over machinery the engine already has.

### 2.1 A Job is one thing (fixes complaint 1)

Today a single job is scattered across five events: `Current salary` (income),
two `RSU distribution` (windfall), `New role — base salary` (newJob), two
`Promotion` (income). Nobody thinks that way. A person thinks *"Amazon"* and
inside it: a salary, raises, a bonus, RSUs that vest on a schedule, promotions
that step comp up, and a 401(k).

**Introduce one consolidated `job` event**, user-named (the user types "Amazon"),
that owns the whole arc of one employer:

- **Base salary** + **annual raise %** (already in `newJob`).
- **Bonus** — percent or fixed, annual.
- **RSU vesting schedule** — a list of `{ year, amount }` vests (replaces the
  standalone windfalls). Optionally a single grant with a 4-year vest the UI
  expands for you.
- **Comp steps / promotions** — a list of `{ year, newBaseSalary, label }`
  anchors (replaces the standalone "Promotion" income events). The salary curve
  is piecewise: it raises annually until the next step resets the base.
- **401(k)** — contribution %, employer match %, pretax/Roth, target account
  (already in `newJob`).
- **Start year / end year.**

One card, named "Amazon", with an internal timeline. It feeds:

- **Cash Flow** — income lines grouped under "Amazon" (salary, bonus, RSU vest),
  not six unrelated rows.
- **The Events timeline** — one bar labelled "Amazon" with vest/promotion
  milestones marked along it, not six pins fighting for the same x-range.
- **The hero reading** — "…through Amazon, two kids and a home in 2031."

Engineering note: this is `newJob` grown two schedules (`rsuVesting`,
`compSteps`) and renamed `job` in the UI. It compiles to the same
`cashFlows` / `contributions` / `incomeSuppression` primitives that exist in
`kit.ts` today — a promotion is a salary change, a vest is a one-off taxable
`cashFlow`. `replacesEarnedIncome` still does the work that stops a second job
from silently doubling income. The migration maps the sample plan's six events
onto one `job` named "Amazon". Old event kinds stay in the engine so existing
saved plans still open.

### 2.2 Goals are buckets money flows into (fixes complaints 4 & 5)

The user's instinct — *"some accounts are for the house, some for retirement, and
the excess grows a savings balance"* — **is exactly right, and is not built yet.**
There is no earmarking today; there are only ordered priority rules. Priority
rules are the correct *machinery*, but they are the wrong *surface* — nobody
wants to reason about an allocation waterfall.

**Introduce Goals.** A goal is a bucket with intent:

```
Goal {
  id, name, kind: 'house' | 'retirement' | 'custom',
  targetAmount?,        // "$300K down payment"
  byYear?,              // "by 2031"
  fundedFromAccountIds, // which accounts count toward / feed this goal
  linkedEventId?,       // the buyAHome / retirement event, if any
}
```

The mechanic, in plain terms and mapping onto the engine that exists:

1. **Each year's surplus fills goals in priority order** — this is the
   *allocation waterfall* (`priority.ts`), now presented as "fund the house
   first, then retirement." A goal with a target and a date computes the annual
   contribution it needs; that becomes the allocation rule's `maxAnnual`.
2. **A funded goal stops pulling.** Once the house down payment is reached, its
   rule is satisfied and surplus flows past it.
3. **Everything left over lands in free savings** — this is the *unallocated
   sweep* that `run.ts` already does (`To «sweep» (unallocated)`). We name that
   bucket "Savings" and show it growing. The user's "excess adds to a growing
   savings balance" is already the engine's behaviour; it has just never been
   named or shown.
4. **Accounts earmark to a goal** by tag. The balance sheet can then show "of
   your $536K taxable, $300K is earmarked for the house." Earmarking is a view +
   an allocation ordering, never a hard partition of the money (the dollars stay
   fungible; the intent is a label).

This is the keystone: **Retirement and House stop being separate apps and become
views onto goals.** They can never be blank, because a goal always has a target,
a progress, and a date — even before any account is attached.

### 2.3 The coherence rule

> **One plan. One `runPlan` result. Every lens is a reading of the same result.**

No lens has its own data source. No lens has an empty-state dead end. Change one
input — a raise on the Amazon job, a year on the house, half a percent of
inflation — and *every* lens moves at once, because they are all reading the same
projection. This is the "spatial consistency / one mental model" principle made
literal. It is also already 90% true for the net-worth view; the fix is making
the other three lenses read from the shared result instead of standing alone.

---

## 3. Information architecture

### 3.1 Three lenses, not four tabs, and a tool

The four peer "views" (Net Worth / Retirement / House / SEPP) flatten a real
hierarchy. Rebuild it as **three lenses on one plan**, plus SEPP demoted to the
advanced tool it is:

| Lens | The question it answers | Always shows |
|---|---|---|
| **Overview** | *Will I be OK overall — and what breaks it?* | The arc: hero figure, the spine chart, the ledger. The home. |
| **Retirement** | *When can I stop, and will the money last?* | The freedom age, income replacement, durability. Never blank — if no retirement is set, it is the place you set it. |
| **House** | *Can I afford it, and what does it cost the rest of the plan?* | The goal (down-payment progress), the ownership arc, the honest cost vs not buying. |

**SEPP is not a lens.** It is one tactic for one situation — reaching a
tax-deferred account before 59½. It lives *inside* Retirement as an expandable
tool ("Access retirement funds early → SEPP / 72(t)"), not as a peer of the
whole plan. This removes the fourth top-level destination that most users will
never need and declutters the nav (Purpose: decide what *not* to show).

Custom goals, when added, appear as additional lenses of the House kind
(a generic "Goal" lens), so the pattern extends without new code per goal.

### 3.2 The shell

A single **translucent top bar** (Apple material: `backdrop-filter`, content
scrolls under it, a scroll-edge fade instead of a hard divider). Three zones:

```
┌─────────────────────────────────────────────────────────────────┐
│  Northstar        Overview · Retirement · House      ⌘K   ☾   ⋯  │   ← lenses centred, chrome to the edges
│                     ‹ Amazon plan ›                                │   ← the scenario name = the document title, centred, tappable
└─────────────────────────────────────────────────────────────────┘
```

- **Left:** the `Northstar` wordmark. Quiet, neutral ink, not a coloured chip.
- **Centre:** the three lenses as a segmented control — the primary nav, the
  "where can I go." Below or beside it, the **scenario name acts as the document
  title** (like a file name in a title bar), tappable to switch/manage scenarios.
  This kills the "plan name shown twice" redundancy — there is no separate card
  title any more (fixes complaint 2's "header should be centred": the title is
  the centred element, and it is the *only* place the plan name lives).
- **Right:** `⌘K` command palette entry, theme toggle, and an overflow `⋯` that
  absorbs Import, Sign out, and the rest. Undo/Redo move to `⌘Z`/`⇧⌘Z` +
  the palette, off the surface.

The header stops being a cramped pill competing for the top-left and becomes calm
chrome that frames the instrument.

---

## 4. Page by page

### 4.1 Overview — the home

The spine of the whole app. Ordered top to bottom by what a person acts on.

**The hero (fixes complaint 3).** Today it stacks three sentences: the reading,
the risk range, and a metadata line — three volumes at once. Cut to **the figure
+ one line.**

- **The figure** lives in the top-left *inside* the plot (design-direction move
  2), `clamp(2.6rem, 6vw, 4.1rem)`, DM Sans 700, proportional figures, tracking
  −0.032em. It follows the scrub — point at 2034 and it reads 2034's net worth.
- **One reading line** under it: *"$4.28M by 2046 — 16% a year, through Amazon,
  two kids and a home in 2031."* (Now naming the job, per §2.1.)
- **The honest range is demoted, not deleted.** "depending on how markets run"
  becomes a single tappable phrase that expands the band on the chart and reveals
  the low/high; it is not a permanent second sentence. On a failing plan the
  reading leads with the failure and the range is suppressed (already the rule).
- **The metadata line is deleted.** `2026–2046` belongs on the x-axis, which
  already shows it. The event count is visible as dots on the curve. A row of
  grey uppercase metadata is exactly the generic-dashboard tell to cut.

**The spending strip is cut (fixes complaint 2).** "If monthly spending changed"
with five tiles all reading "no change in horizon" is dead weight — on any plan
that never runs dry, every tile says nothing, and the label reads like a
non-sequitur. Replace with **nothing on the surface.** Sensitivity moves into a
single honest affordance — a **"Stress test"** control (or the ⌘K "what breaks
this?" action) — that only ever appears with a real answer, and reports in *time
bought* only when there is time to buy. The runway idea from `BORROW.md` §8 is
right; a permanent strip of zeros is the wrong home for it.

**The chart becomes the instrument** (design-direction moves 2–5, the ones still
open):

- Full-bleed, ~58vh, real y-ceiling from the data (not `niceCeiling`), lattice
  gone, fill 0.20→0.02.
- **Events are dots on the curve** with 1px leaders to real names, ranked by
  |Δ net worth at horizon| — top 4 labelled, rest on scrub. The three-letter
  codes (`INC`/`WND`/`JOB`…) are retired; they were the detached, clustered,
  meaningless-colour row the audit called out.
- **Scrub** the timeline: pointer-capture, 1:1, no debounce; the hero figure,
  the balance-sheet column and the cash-flow column all follow the year under
  the pointer.
- **Drag events through time** — the signature. Grab a dot, slide it, the
  projection recomputes live; quantise to year, ghost the original at 30%,
  rubber-band at the bounds, release on a spring (damping 0.8 / response 0.3,
  velocity handed off). One drag = one undo entry. The live-preview machinery
  already exists (every drawer previews a draft plan); this points it at a drag.

**The ledger** (Accounts / Cash Flow / Events) rises as a sheet over the plot's
lower edge. Tables get magnitude bars behind each row (8–10% hue opacity, 4px
rounded end, scaled per row); Cash Flow gets a diverging bar. Cash Flow groups
income under its job ("Amazon → salary, bonus, RSU vest").

### 4.2 Retirement — the freedom lens (fixes complaint 4)

**Never blank.** The current empty state ("Add a Retirement event…") is a dead
end that reads as broken. Retirement is the second-most-important question the
app answers; it must always show something.

- **No retirement set yet → this is where you set it.** A single, warm prompt:
  *"When do you want to stop working?"* with a **draggable age/year control**.
  The instant it is set, the whole lens computes and a `retirement` event is
  written to the plan. Empty screen as an invitation to act, not a wall.
- **Set → the freedom read.** The one figure that matters: *the earliest age you
  can retire and have the money last to life expectancy* (a search the engine can
  run cheaply — step the retirement year until the plan stops running dry). Under
  it: income replacement (before → after), the portfolio that carries the gap,
  and **durability as the emotional core** — "lasts through 2086" in calm ink, or
  "runs dry in 2071" as the one alarm.
- **Ties to the retirement goal** (§2.2): funding progress toward the number,
  and which accounts are earmarked to it.
- **SEPP lives here** as an expandable tool, not a peer lens (§3.1).

The existing income-vs-spending and portfolio mini-charts are good; they stay,
restyled to the token system, under the freedom read rather than above it.

### 4.3 House — the decision lens (fixes complaint 6)

Rebuild around the actual decision, in three honest stages, top to bottom:

1. **Can I afford the down payment?** The house goal (§2.2): target price, down
   payment, the date, and a **funding-progress ring** — how close the earmarked
   accounts are to the down payment by the buy year. This is the part that is
   "unfinished" today; it is the first thing a person actually asks.
2. **The ownership arc.** The existing value/mortgage/equity chart, with the
   formatting fixed:
   - *"Mortgage payoff: After plan horizon"* → the real payoff year, or *"Not
     paid off by 2046"* stated plainly.
   - *"Equity today $275.3K as of 2031"* → the labels currently lie (the house is
     bought in 2031, so "today" is wrong). Relabel to "at purchase (2031)" and
     "at horizon (2046)".
   - Round consistently; drop the mixed `$922.7K`-style precision.
3. **What it costs the rest of the plan.** The honest, differentiating stage:
   run the plan with and without the house (the `diff.ts` machinery already
   exists) and state it: *"Buying delays your safe retirement by 3 years"* /
   *"costs $420K at the horizon"* / *"leaves the plan sound either way."* This is
   the thing no calculator says out loud, and it is exactly the "will I be OK if I
   do this" the brand promises.

### 4.4 SEPP — the tool, formatting fixed (fixes complaint 7)

Demoted into Retirement (§3.1). As a tool it earns real polish:

- The cramped four-control row becomes a clean inline form with proper field
  grouping and the mono for all numbers.
- The results table gets column alignment, magnitude on the balance column, and
  headers that read in plain language ("Start at age", "Annual payment", "Runs
  through", "Balance at 60").
- The start-age sweep becomes a small selectable strip where each option shows
  its tradeoff (start later → bigger payment, less runway), so choosing is
  visual, not a table scan.

### 4.5 Assumptions — thoughtful hiding

The user asked that even the assumptions panel be designed with intent. The
principle is already right ("hover shows the assumption, click edits it"); make
the panel itself calm and progressive:

- **Progressive disclosure.** The common inputs (spending, income, inflation,
  tax) on the surface of the drawer; the powerful, rarely-touched machinery (the
  two priority waterfalls, per-account tax treatment) one clearly-marked layer
  down. Simplicity is showing the common path first, not hiding everything
  equally.
- **Every assumption shows its consequence inline.** Because `runPlan` is
  microseconds, each field can preview its own impact: *"+0.5% inflation →
  −$180K at 2046."* An assumption you can feel is an assumption you can set with
  confidence. This is the honest, instrument version of a settings panel.
- **The waterfalls become the Goals surface** (§2.2). Instead of "allocation
  rule, order 1, brokerage," the user sees "Fund: House, then Retirement, then
  Savings" and drags to reorder. The rule machinery stays underneath, unchanged.
- **Live preview stays** — the chart moves as you type, nothing commits until
  Save, Cancel is free. Already built; keep it exactly.

---

## 5. The visual system

### 5.1 Colour — inherit and hold the line

The four data hues (`--data-nw`, `--in`, `--out`, `--cmp`) passed the
colour-vision validator as a set in both themes; the five they replaced failed
four checks. **Do not add a fifth saturated hue.** Everything new obeys the rule:

- Goal progress "on track / funded" reuses **net-worth blue**; "behind / at
  risk" reuses **out-orange**. No new greens or ambers.
- Chrome is neutral ink at every weight. The single system accent
  (`--accent`) is for focus, selection, caret — never decoration.
- Any new series colour must be run through `dataviz/scripts/validate_palette.js`
  in both modes before it ships. Default is: don't add one.

### 5.2 Quiet the candy (a real decision)

The current CSS carries an elaborate glossy "jelly" material (four-layer
highlights, gloss gradients, squish). It is craft, but it is boldness spent in
the wrong place — a forecasting instrument that reads as calm cannot also read
as wet candy on every control. Per the brand (§1) and "remove one accessory":

- **Keep tactile depth only where something is meant to be pressed or grabbed** —
  buttons on `:active`, the draggable event dots, the segmented control's thumb.
  There the physicality *is* the feedback (Apple: response on press).
- **Strip gloss from everything that is not interactive** — cards, rows, chips,
  the header. Those become clean neutral surfaces with a single hairline and at
  most one soft shadow. Depth becomes a signal of interactivity, not a texture.

This is what lets the one signature (the draggable timeline) feel special: it is
the tactile thing in an otherwise still, precise room.

### 5.3 Typography — add the instrument's voice

- **DM Sans stays** for UI and body — it is a considered choice already.
- **Add one monospace** for the *data voice* — axis labels, table figures,
  metadata, timestamps, the SEPP table. Recommend **IBM Plex Mono** (available
  via `@fontsource`, neutral, engineered rather than quirky). The mono is where
  an instrument's precision lives; it also visually separates "data the app
  computed" from "chrome the app is made of."
- **The hero figure stays proportional DM Sans**, not the mono, not tabular —
  tabular figures make a display number look loose (already the rule). Give it
  optical detail: the `$` and the `M`/`K` suffix a step smaller and lifted, the
  digits dominant.
- **Tracking is size-specific:** tight on the hero (−0.032em), near zero on body,
  a touch positive on the small mono labels. Never one letter-spacing everywhere.

### 5.4 Motion — extend the existing budget

The design-direction motion table stands. The additions this plan needs, all
serving meaning, none decorative:

- **Drag release** (the signature) — spring, damping 0.8 / response 0.3, velocity
  handed off from the pointer, rubber-band at the horizon bounds. The one place
  bounce is earned.
- **Scenario switch** — 220ms crossfade + path interpolation on the line (already
  specified, still open).
- **Lens switch** — 150ms opacity, no transform. The lenses are readings of one
  plan, so switching them should feel like turning a page, not travelling.
- **Reduced motion** — every spring degrades to a short cross-fade; the drag
  still tracks 1:1 (that is direct manipulation, not vestibular motion) but its
  release stops overshooting.

---

## 6. What good looks like (the bar)

Ship each of these and the app is a 10:

1. A person types "Amazon," their salary, and their RSU vests **once**, and it
   shows up correctly in the hero, the cash flow, and the timeline as one thing.
2. Every lens moves the instant any input changes, and **no lens is ever blank.**
3. You **grab your retirement date and drag it** two years earlier and watch the
   line and the freedom number re-form under your hand.
4. The header names the plan **once**, centred, and nothing on the screen is a
   row of grey metadata nobody acts on.
5. The House lens tells you, in a sentence, **what the house costs the rest of
   your life** — not just its price.
6. A first-time user with an empty plan is **guided to author one**, never shown
   fake sample data or a dead-end empty state.
7. It is **calm.** One bold thing (the timeline), everything else quiet, dark and
   light both first-class, and every number in the right typeface.

---

## 7. Phasing (each phase is shippable)

1. **Model** — the `job` event (§2.1) and Goals (§2.2) in the engine + store,
   with the sample plan migrated and tests. Nothing else can be right until the
   model matches the life.
2. **Shell & Overview** — the translucent header, the single centred title, the
   hero cut to figure-plus-one-line, the spending strip removed, the chart as the
   full-bleed spine with events-as-dots.
3. **The instrument** — scrub, then drag-through-time with live reprojection (the
   signature), plus the ledger tables with magnitude bars.
4. **The lenses** — Retirement (never blank, freedom read, SEPP folded in),
   House (goal ring, fixed formatting, honest cost).
5. **Assumptions & polish** — progressive disclosure, inline impact, goals as the
   waterfall surface, the candy quieted, the mono added, motion gate applied,
   first-run onboarding replacing `samplePlan.ts` as fake data.

The execution of these phases across agents is specified in
[`EXECUTION.md`](./EXECUTION.md).
