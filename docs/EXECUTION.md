# Execution — agents, orchestration, and the feedback loop

How [`REDESIGN.md`](./REDESIGN.md) gets built. This is the operating document for
a multi-agent build: who does what, in what order, and how work is reviewed and
sent back until it meets the bar.

## Roles

- **Orchestrator** (the lead session). Owns `REDESIGN.md`, sequences the phases,
  spawns implementation agents with scoped briefs, runs the review loop, verifies
  in the browser, and decides when a phase is done. Does not hand-write the
  feature code — it reviews and directs.
- **Builder agents** — one per track. Each gets a self-contained brief below,
  reads `REDESIGN.md` + the files named, implements, and must leave
  `npm run lint && npm test && npm run build` green before reporting back.
- **Reviewer agent** — an independent pass after each phase. Audits the builder's
  diff against the phase's definition of done and the design bar, returns an
  ordered list of concrete defects. The orchestrator relays those to the builder
  (same agent, via follow-up) and the loop repeats until the reviewer returns
  nothing material.

## The loop (per phase)

```
brief → builder implements → lint/test/build green
      → orchestrator browser-verifies → reviewer audits
      → defects? → feedback to builder → (repeat)
      → clean? → orchestrator commits the phase → next phase
```

A phase is **done** only when: lint + test + build are green; the reviewer
returns no material defect; the orchestrator has verified the change in the
browser at 1440 / 834 / 390 in both themes; and the phase's own checklist below
is fully ticked. Progress is committed to `redesign/northstar-10` at each phase
boundary so the build is always recoverable.

## Dependency order

Phase 1 is foundational and runs alone — it changes the engine types and the
store that every UI track imports. Phases 2 and 4 both touch `App.tsx` and
`planner.css` heavily, so they are **sequenced, not parallel**, to avoid
clobbering the two hottest files. Phase 3 builds on Phase 2's chart. Phase 5 is
cross-cutting polish and runs last. The one safely-parallel track is the pure
view work in Phase 4b (the `views/` files are self-contained), which can run in a
worktree while Phase 2/3 hold the shared shell.

```
P1 model ─┬─ P2 shell+overview ── P3 instrument ─┐
          └─ P4b lenses (worktree, parallel) ─────┴─ P5 polish
```

---

## Phase 1 — Model (builder: engine)

**Read first:** `REDESIGN.md` §2, `docs/PLAN.md` §2 & §4, `packages/engine/src/`
(`types.ts`, `run.ts`, `events/kit.ts`, `events/work.ts`, `priority.ts`),
`src/planner/store/planStore.ts`, `src/planner/samplePlan.ts`.

**Build:**

1. **The `job` event** (`REDESIGN.md` §2.1). Grow `newJob` into a consolidated
   `job` module: add an `rsuVesting: {year, amount}[]` schedule and a
   `compSteps: {year, newBaseSalary, label}[]` schedule to its zod config,
   compiling vests to one-off taxable `cashFlow`s and comp steps to a piecewise
   salary curve. Keep `replacesEarnedIncome`, the 401(k) fields, and the raise.
   Register it in `events/index.ts`. Keep the old `newJob`/`income`/`windfall`
   kinds so saved plans still open. Extend `schemaForm.ts` if a new `custom`
   record field is introduced (its test pins the list — update it deliberately).
2. **Goals** (`REDESIGN.md` §2.2). Add a `Goal` type and `plan.goals: Goal[]`.
   Provide pure helpers: derive each goal's required annual contribution from
   `targetAmount`/`byYear`, map goals onto allocation `PriorityRule`s (so
   `run.ts` needs no new waterfall — goals *generate* rules), and name the
   unallocated sweep bucket "Savings." Expose goal funding progress from the
   result (earmarked balances vs target by year) as a pure selector.
3. **Store** — `planStore.ts` gains goal CRUD (`upsertGoal`, `deleteGoal`,
   `reorderGoals`, earmark/unearmark an account) with undo/redo parity, and a
   migration that maps an old plan's scattered job events onto one `job`.
4. **Sample plan** — migrate `samplePlan.ts` so the six Amazon-shaped events
   collapse into one `job` named "Amazon," and add a house goal and a retirement
   goal so the lenses have real data.

**Definition of done:** new engine + store unit tests cover job compilation
(salary curve, a vest, a comp step, income replacement still firing) and goal →
rule derivation + funding progress; every existing test still passes; lint and
build green. No React changes in this phase.

---

## Phase 2 — Shell & Overview (builder: shell)

**Read first:** `REDESIGN.md` §3, §4.1, §5; `src/App.tsx`,
`src/planner/planner.css`, `ViewTabs.tsx`, `ThemeToggle.tsx`, `Sidebar.tsx`,
`reading.ts`, `SpendingStrip.tsx`, `NetWorthChart.tsx`, `AnimatedFigure.tsx`.

**Build:**

1. **Header** (`REDESIGN.md` §3.2) — translucent top bar, `backdrop-filter`,
   content scrolls under, scroll-edge fade not a divider. Wordmark → `Northstar`.
   Three lenses centred as the primary nav (Overview / Retirement / House); SEPP
   removed from the top row. The scenario name becomes the single centred
   document title, tappable to open the scenario manager. Remove the duplicate
   card title. Import / Sign out / Undo / Redo move into an overflow `⋯` and the
   keyboard (`⌘Z`). Add a `⌘K` command-palette entry point (palette itself may
   stub in P2 and fill in P5).
2. **Hero** (`REDESIGN.md` §4.1) — figure + one reading line only. Update
   `reading.ts` to name the job ("through Amazon…"). Demote the range to one
   tappable phrase that toggles the band; delete the `2026–2046 · N events`
   metadata line.
3. **Spending strip** — remove `SpendingStrip` from the surface. Replace with a
   single "Stress test" affordance that surfaces a runway answer only when there
   is one (or defer the affordance to P5 and simply remove the strip in P2).
4. **Chart as spine** (`REDESIGN.md` §4.1, design-direction moves 2–3) —
   full-bleed ~58vh, real y-ceiling, lattice removed, fill 0.20→0.02, events as
   dots on the curve with leader lines to real names (retire the 3-letter codes),
   top-4 labelled by |Δ net worth|.
5. **Quiet the candy on chrome** (`REDESIGN.md` §5.2) — strip gloss from
   non-interactive surfaces; keep tactile depth on pressables. Add the IBM Plex
   Mono data voice (`REDESIGN.md` §5.3) to axis labels and metadata.

**Definition of done:** plan named once and centred; no metadata row; no spending
strip; chart full-bleed with named event dots; both themes clean; lint/test/build
green; verified at 1440/834/390.

---

## Phase 3 — The instrument (builder: interaction)

**Read first:** `REDESIGN.md` §4.1, §5.4; the P2 chart; `NetWorthChart.tsx`,
the drawer live-preview path in `App.tsx`, `useEventEditor.ts`.

**Build:** scrub (pointer-capture, 1:1, no debounce; hero figure + table columns
follow the pointer year); then **drag events through time** — the signature —
grab a dot, quantise to year, ghost original at 30%, rubber-band at bounds,
release on a spring (damping 0.8 / response 0.3, velocity handed off), one drag =
one undo entry, reprojecting live off the existing draft mechanism. Ledger tables
get per-row magnitude bars; Cash Flow a diverging bar; income grouped under its
job. Respect `prefers-reduced-motion`.

**Definition of done:** dragging a retirement/house event live-reprojects the
whole plan and the freedom number; scrub moves hero + tables; one undo per drag;
reduced-motion degrades the release to a cross-fade; lint/test/build green.

---

## Phase 4 — The lenses

### 4a Retirement (builder: retirement) — `REDESIGN.md` §4.2

Never blank. No retirement set → an inviting "when do you want to stop working?"
with a draggable age that writes the event on set. Set → the freedom read
(earliest safe retirement age via an engine sweep), income replacement,
portfolio-carries-the-gap, durability as the emotional core. Retirement goal
progress. **SEPP folded in** as an expandable tool (moved out of the top nav),
its formatting fixed per §4.4. Files: `views/RetirementForecastView.tsx`,
`views/SeppForecastView.tsx`, `views/MiniChart.tsx`, engine sweep helper.

### 4b House (builder: house, worktree-parallel) — `REDESIGN.md` §4.3

Three stages: down-payment funding ring (the house goal), the ownership arc with
formatting fixed ("Not paid off by 2046"; relabel "at purchase (2031)" / "at
horizon (2046)"; consistent rounding), and the honest cost via `diff.ts`
("delays retirement by 3 years / costs $420K"). File:
`views/HouseForecastView.tsx` + `diff.ts` reuse. Self-contained → safe to build
in a worktree parallel to 4a.

**Definition of done (both):** neither lens can be blank; both read from the
shared `runPlan` result; House states the payoff year and the plan-level cost;
Retirement shows a freedom age and durability; lint/test/build green; verified in
both themes.

---

## Phase 5 — Assumptions & polish (builder: polish)

**Read first:** `REDESIGN.md` §4.5, §5, §6; `AssumptionsDrawer.tsx`, `fields.tsx`,
`RateSchedule.tsx`, all tokens in `planner.css`.

**Build:** assumptions drawer with progressive disclosure (common inputs surface,
waterfalls/tax one layer down); inline impact preview per field ("+0.5% inflation
→ −$180K at 2046"); the two waterfalls re-presented as the Goals surface (drag to
reorder "House → Retirement → Savings"); ⌘K command palette completed; motion
gate applied everywhere; **first-run onboarding** that authors a plan instead of
seeding `samplePlan.ts` as fake data. Final accessibility + dark-mode validation
pass; run `dataviz` validator on any palette touched.

**Definition of done:** the seven bar items in `REDESIGN.md` §6 all hold; a
first-run user is guided to author a plan; keyboard + reduced-motion + both themes
all pass; lint/test/build green.

---

## Standing rules for every builder

- Read `REDESIGN.md` and the files named in your brief before writing anything.
- Do not touch `packages/engine`'s math beyond what your brief specifies; the
  projection is correct.
- Leave `npm run lint && npm test && npm run build` green before reporting.
- Match the surrounding code's idiom, comment density, and the reasoned voice of
  the existing docs. No new dependencies without flagging why.
- Report back: what changed, which files, test/lint/build status, and anything
  the brief didn't anticipate — do not silently expand scope.
