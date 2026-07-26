# Pick up here

Working state as of the last session. Everything below is committed and pushed
to `main`. `npm install && npm run dev` → http://localhost:3000.

## Where we are

**Phase 1 of [`docs/PLAN.md`](./PLAN.md) §9, steps 1–4 are done.**

| Step | State |
|---|---|
| 1. Engine package | ✅ `packages/engine`, 48 tests passing |
| 2. All 11 event modules | ✅ including `buyAHome` with synthetic accounts |
| 3. Design system + chart | ✅ new `Northstar_UX` direction (PLAN.md §7) |
| 4. Three tabs | ✅ Accounts, Cash Flow, Events all reading from `PlanResult` |
| 5. Event drawer | ✅ generated from zod schemas, live preview, delete cascade |
| 5b. Hover detail cards + per-type account settings | ✅ |
| 6. Assumptions + priority rules UI | ✅ plan settings, household, and both waterfalls |
| 7. Scenario management + A/B comparison | ❌ **next up** |

**Phase 1 is otherwise complete.** Every part of the plan is now editable from
the UI and persists.

Plans now persist to localStorage (`northstar:plans:v1`) with undo.

Verify with `npm run lint && npm test && npm run build` — all three are green.

## What is NOT real yet

- **Scenario switcher** swaps between two plans but does not *compare* them;
  `compareToScenarioExternalId` is unimplemented. There is also no way to
  create, rename, duplicate or delete a scenario from the UI. That is step 7.
- **`projectionYears` is not editable** — the horizon comes from the
  `endOfPlan` event, which is edited like any other event. Fine, but it means
  the assumptions drawer has no horizon control and that may surprise someone.
- **Redo exists in the store but has no button** (only Undo is wired).
- **A second participant cannot be added.** The drawer edits whoever is in
  `participants`; there is no add/remove.

## Next task, concretely: scenarios (step 7)

1. **Manage scenarios** — create, rename, duplicate, delete. The store holds a
   `plans[]` array already; it needs `createPlan`, `duplicatePlan`,
   `renamePlan`, `deletePlan`, all going through `commit()` so they land on the
   undo stack. Surface it from the scenario pills in the header (a `+` pill,
   and a menu on the active one).
2. **A/B comparison** — `Plan` has no comparison field yet; add
   `compareToPlanId?: string` to settings. When set, run the compared plan too
   and draw it as a second, muted line on the chart, with a delta row in the
   KPI strip. Both runs are cheap, so just call `runPlan` twice.

Smaller things worth doing at some point:

- **Redo button** — the store supports it, nothing calls it.
- **Add/remove participants** in the assumptions drawer, for a two-person
  household. The engine already handles multiple `participants`.
- **Keyboard shortcut for undo** (⌘Z), now that there is a lot to undo.

## The hover/settings pattern

One principle, applied in three places: **hovering something shows the
assumptions behind it, and clicking through edits those same assumptions.**

That only stays true because both read from ONE spec:

- **Accounts** — `packages/engine/src/accountTypes.ts` declares each type's
  editable fields once. `accountDetail()` renders them read-only into the hover
  card; `AccountDrawer` renders the identical list as inputs. Adding a field to
  a type makes it appear in both.
- **Events** — the hover card and the drawer form are both generated from the
  event module's zod schema.
- **Plan** — `planDetail()` builds from `plan.settings` and participants.

`src/planner/HoverCard.tsx` is the shared popover; `src/planner/detail.ts` holds
the three builders and the one `Detail` shape they produce.
`src/planner/drawer/fields.tsx` holds the form primitives all three drawers
share — add inputs there, not in a drawer.

**Every drawer edits a draft clone and previews it live.** `App.tsx` swaps the
open draft in for the stored plan when computing the projection, so the chart
and tables move as you type but nothing is written until Save. Cancel is free.

**Balances are modelled by asset TYPE, not by linked account.** The balance
sheet has one row per `AccountClass`, each with a gear. Synthetic accounts (a
home and its mortgage from a `buyAHome` event) roll into their class row but are
read-only there — they belong to their event.

**Gotcha worth remembering:** a CSS `transform` on an ancestor becomes the
containing block for `position: fixed` descendants. `.ns-pin-slot` originally
used `translateX(-50%)` and it silently positioned every chart hover card
relative to the pin instead of the viewport. It centres with a negative margin
now; don't reintroduce the transform.

## Known defects worth fixing

0. **`describeSchema` reads zod's internal `_def`.** It is pinned by
   `src/planner/drawer/schemaForm.test.ts`, so a zod upgrade that reshapes it
   fails loudly rather than silently rendering empty forms. If that test breaks
   after a bump, fix the introspection — do not delete the test.
1. **Chart pins crowd on long horizons.** At the Retirement scenario's 61-year
   span the early pins overlap horizontally and truncate to `IN WN JO IN`.
   `build()` in `NetWorthChart.tsx` only stacks pins that share a year; it needs
   to stack any pin whose x is within ~34px of its left neighbour.
2. **`Return 6.5%`** in the chart legend is read off the first fixed-growth
   account, which is a guess. It should come from an explicit plan-level
   assumption once the assumptions panel exists.
3. **Legacy simulator is orphaned.** `src/legacy/SimulatorApp.tsx` is the old
   AI Studio strategic-growth simulator. It still compiles and its deps
   (recharts, motion, date-fns, tailwind) are still installed, but nothing
   routes to it. Either add a route or delete it and drop those four deps —
   that would cut a meaningful chunk of `node_modules` and the CSS bundle.
4. **No responsive work has been done.** The layout assumes ≥1320px. Tables
   will need horizontal scroll containers below that.

## Decisions taken (don't silently revert these)

- **Engine takes zod** as its one dependency, so a single schema drives both
  validation and the drawer form. PLAN.md §3.1 carries the amendment.
- **Growth applies to the closing balance** — a contribution in year Y first
  earns in Y+1. Spencer was asked about half-year convention and has not
  answered; this is still the open question from the engine session.
- **Flat effective tax rate per account**, matching Monarch, rather than
  progressive brackets. Avoids the withdrawal/bracket fixed point.
- **Annual time steps**, with monthly stepping only inside mortgage
  amortization.
- **Retirement is coloured as a cost event** (PLAN.md §7.2) because it stops
  income and raises the spending question. Debatable — flag if it reads wrong.
- **Events outside the horizon are filtered from both chart and Gantt**, with a
  footer count. They contribute nothing to the projection.

## Repo map

```
docs/PLAN.md              the build guide — domain model, engine, design spec
docs/NEXT.md              this file
packages/engine/          pure TS projection engine (no React, no I/O)
  src/run.ts              the year loop; order of operations is PLAN.md §4.3
  src/events/             one module per event kind + the registry
  examples/demo.ts        npx tsx examples/demo.ts → a worked 12-year projection
src/App.tsx               planner shell
src/planner/              chart, tabs, tokens, presentation rules
src/legacy/               the old simulator, currently unrouted
```
