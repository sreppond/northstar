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
| 5. Event drawer | ❌ **next up** |
| 6. Assumptions + priority rules UI | ❌ |
| 7. Scenario A/B comparison | ❌ (switcher works; comparison does not) |

Verify with `npm run lint && npm test && npm run build` — all three are green.

## What is NOT real yet

These are visible in the UI but inert. Nothing behind them.

- **`+ Add event`** — button renders, does nothing. This is step 5.
- **`Edit assumptions`** — same. Step 6.
- **Plans are hardcoded** in `src/planner/samplePlan.ts`. There is no
  persistence at all in the planner — no localStorage, no editing. (The *old*
  simulator had localStorage; that code is in `src/lib/storage.ts` and is
  currently unused by the planner.)
- **Scenario switcher** swaps between two hardcoded sample plans. It does not
  compare them; `compareToScenarioExternalId` is unimplemented.

## Next task, concretely: the event drawer (step 5)

The engine side is already done — every event kind exports a zod `schema` and a
`defaults(ctx)` from `packages/engine/src/events/`. The drawer should be
generated from those, not hand-written per kind.

1. Add `EventDrawer.tsx` under `src/planner/drawer/`. Right-side panel, same
   token vocabulary as `planner.css`.
2. `+ Add event` opens a kind picker — the 11 entries from `EVENT_MODULES`,
   grouped income/cost, using `codeFor`/`labelFor` from
   `src/planner/presentation.ts`.
3. Picking a kind creates a draft from `mod.defaults(ctx)` and renders a form
   from `mod.schema`. A generic zod→field renderer covers all 11: `z.number()`
   → numeric input, `z.boolean()` → toggle, `.min/.max` → slider bounds.
   Read the `.describe()`/jsdoc on each config field for labels.
4. **Edit a draft clone, commit on Save.** Live-preview the draft in the chart
   (ghosted line) but do not touch the committed plan until Save, so Cancel is
   free. This is PLAN.md §6.1.
5. Clicking an existing pin or Gantt bar should open the drawer for that event.
   The selection plumbing already exists — `ChartSelection` carries `eventId`.
6. **Deleting an event must cascade to its synthetic accounts.** Filter on
   `sourceEventId`. Warn in the confirm: *"This also removes the Home and
   Mortgage accounts."*

Once the drawer can mutate a plan, lift plans into a Zustand store
(`src/planner/store/planStore.ts`) with a bounded undo stack of whole plan
snapshots, and persist to localStorage. Keep `runPlan` in a `useMemo` — never
store the result.

## Known defects worth fixing

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
