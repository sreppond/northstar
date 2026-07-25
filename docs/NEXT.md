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
| 6. Assumptions + priority rules UI | 🟡 account settings done; plan settings and priority rules still to do |
| 7. Scenario A/B comparison | ❌ (switcher works; comparison does not) |

Plans now persist to localStorage (`northstar:plans:v1`) with undo.

Verify with `npm run lint && npm test && npm run build` — all three are green.

## What is NOT real yet

- **`Edit assumptions`** — hovering it shows the plan assumptions, but the
  button is still `disabled`; there is no panel to *edit* them. That is the
  remaining half of step 6, along with the priority rules.
- **Scenario switcher** swaps between two plans but does not *compare* them;
  `compareToScenarioExternalId` is unimplemented. There is also no way to
  create, rename, duplicate or delete a scenario from the UI.
- **Priority rules are seeded and unreachable.** The waterfalls work, but there
  is no UI to reorder them — the other half of step 6.
- **Participants cannot be edited.** Birth year and life expectancy come from
  `samplePlan.ts`; the hover card reads them but nothing sets them.
- **Redo exists in the store but has no button** (only Undo is wired).

## Next task, concretely: assumptions & priority rules (step 6)

`Edit assumptions` is currently `disabled`. Open it as a second drawer (reuse
`.ns-drawer` and the `Field`/`ConfigField` primitives from
`src/planner/drawer/EventDrawer.tsx` — pull those into a shared `fields.tsx`
first rather than copying them).

Account settings are already done (see "The hover/settings pattern" below), so
this is now two sections:

1. **Plan settings** — `inflationRate`, `projectionYears`, `baselineIncome`,
   `baselineExpenses`, `incomeTaxRate`, and a `dollarMode` toggle. The store
   already has `updateSettings(planId, patch)` wired with undo. `dollarMode`
   should call the engine's existing `deflate(result, inflationRate)` at render
   time — do NOT re-run the engine in real dollars.
2. **Priority rules** — the two ordered waterfalls, drag to reorder. This is the
   mechanic Spencer specifically asked for and it currently has no UI at all.
   `PriorityRule.order` is the sort key; `ruleType` splits the two lists.

After that, step 7: scenario management (create/rename/duplicate/delete) and
A/B comparison via `compareToScenarioExternalId` — render the compared
scenario as a second, muted line on the chart.

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
