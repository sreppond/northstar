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
| 7. Scenario management + A/B comparison | ✅ |
| 8. Responsive layout | ✅ phone / tablet / desktop, verified at 390 / 834 / 1600 |

**Phase 1 is complete.** Every part of a plan is editable from the UI and
persists, scenarios can be created, renamed, duplicated, deleted and compared,
and the whole thing works on a phone. Next up is Phase 2 (backend) — see
docs/PLAN.md §9.

Plans now persist to localStorage (`northstar:plans:v1`) with undo.

Verify with `npm run lint && npm test && npm run build` — all three are green.

## What is NOT real yet

- **`projectionYears` is not editable** — the horizon comes from the
  `endOfPlan` event, which is edited like any other event. Fine, but it means
  the assumptions drawer has no horizon control and that may surprise someone.
- **Redo exists in the store but has no button** (only Undo is wired).
- **A second participant cannot be added.** The drawer edits whoever is in
  `participants`; there is no add/remove.
- **Hover cards need a pointer.** The layout is responsive, but a phone has no
  hover, so the detail cards are desktop-only in practice. Tapping still opens
  the drawer, which carries the same numbers — the fast read is what's missing.
  A long-press or tap-to-peek would close the gap.

## Next: Phase 2 — the backend

Phase 1 is done, so the next milestone is docs/PLAN.md §9 Phase 2: Postgres,
tRPC and auth, with the plan stored as a JSONB document plus a version integer.
The engine already runs identically on a server, so a shareable read-only link
and PDF export come almost free once there is somewhere to put plans.

Still open, in rough priority order:

- **Comparison is clipped to the active plan's horizon.** Comparing House
  (ends 2046) against Retirement (ends 2086) shows only to 2046, which is the
  right default but is not explained anywhere in the UI.
- **Deep pin cascades.** Pins now stack until they clear (see below), which on
  a 60-year plan with clustered early events reaches five rows and covers the
  top of the plot. Readable, but a "+3 more" collapse past ~4 rows would be
  better.
- **`samplePlan.ts` still seeds the two demo scenarios.** Fine while there is
  no backend; it should become an onboarding flow rather than fake data.

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

**Chart pins stack by overlap, not by year.** Each row remembers its last
pin's right edge and a pin drops to the first row it clears. Stacking by
shared year alone worked on a 20-year plan and fell apart on a 60-year one,
where adjacent years are a few pixels apart.

## Responsive rules

Three breakpoints, declared once in `src/planner/useBreakpoint.ts` and mirrored
by the media queries at the bottom of `planner.css`: **phone ≤640**,
**tablet ≤1024**, **desktop** above. Keep the two in step — the hook exists only
for what CSS cannot decide.

- **Year columns come from the hook**, not from CSS: 3 / 5 / 8. Fewer columns
  beats shrinking the type or scrolling eight columns on a phone. `App.tsx`
  calls `yearColumnsFor(useBreakpoint())`.
- **Tables scroll horizontally inside `.ns-table-scroll`** with the label column
  stuck to the left. The sticky cell has to repaint its own background per row
  type, or rows scroll underneath it.
- **The chart does not compress.** Below 700px it keeps a `min-width: 800px`
  inside `.ns-chart-scroll` and the page scrolls it. Squeezing the plot instead
  collapses the pin cascade into an unreadable pile.
- **The drawer goes full-width ≤640px**, 440px above.
- KPI grid reflows 4 → 2 → 1, and the borders between cards reflow with it.

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
1. **`Return 6.5%`** in the chart legend is read off the first fixed-growth
   account, which is a guess. Now that account settings exist per type, it
   should either name the account it came from or be dropped.

## Decisions taken (don't silently revert these)

- **Engine takes zod** as its one dependency, so a single schema drives both
  validation and the drawer form. PLAN.md §3.1 carries the amendment.
- **Growth applies to the closing balance** — a contribution in year Y first
  earns in Y+1. Spencer confirmed end-of-year is what he wants; half-year
  convention is explicitly not needed. Settled, do not revisit.
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
  store/planStore.ts      plans, undo/redo, localStorage
  drawer/fields.tsx       form primitives shared by all three drawers
  HoverCard.tsx           the dark detail popover
  detail.ts               the three Detail builders
  useBreakpoint.ts        phone/tablet/desktop + year-column count
```

The old AI Studio simulator has been deleted, along with the deps only it
used (recharts, motion, date-fns, clsx, tailwind-merge, lucide-react and
Tailwind itself). It is in git history if it is ever wanted back. That took
the CSS bundle from 53 kB to 22 kB.
