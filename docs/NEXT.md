# Pick up here

Working state as of the last session. Everything below is committed and pushed
to `main`. `npm install && npm run dev` → http://localhost:3000.

## Since this was last written

This file predates several merges and stayed stale through them. Corrections:

- **Phase 2 (backend) is done**, not "next up" — see the "Phase 2 is done —
  there is a server" section below. It landed in `dea35cb` / `169d0ea`.
- **A math audit landed on top of it**: partial-year proration
  (`packages/engine/src/partialYear.ts`) now scales income, expenses *and*
  rate-based accrual by the fraction of the first year still ahead — a
  superset of the "STUB year" idea below, which only scaled accrual. Also new:
  cost-basis annuity taxation (`nonTaxableBase`), SEPP (72(t)) forecasting,
  and view navigation — a hamburger menu switching between Net Worth /
  Retirement / House / SEPP forecasts (`src/planner/views/`).
- **A real, separate bug just got fixed**: growth was computed on the
  balance *including* this year's contributions, so a contribution earned a
  full year of return the moment it landed — contradicting the engine's own
  documented rule ("Decisions taken" below, and `PLAN.md` §4.3) that a
  contribution made in year Y earns growth only from Y+1. `run.ts` now
  computes growth on the opening balance net of withdrawals and adds
  contributions after; `PLAN.md` §4.3's bullet, which self-contradicted
  ("closing balance" vs. "earns growth only from Y+1"), now says "opening
  balance" and explains why. Pinned by a new test in `run.test.ts` that
  mixes a live growth rate with an in-year contribution — every prior growth
  test but one ran at `noChange`, so this exact interaction was never
  exercised.
- **[`docs/BORROW.md`](./BORROW.md) is new**: a read of a competitor's
  product (FIREMaster) against what Northstar already is, and what's worth
  building as a result. Ideation, nothing built yet. Its own sequencing (§10)
  puts RMD forcing first — "it's a hole, it changes numbers" — the same
  category of bug as the growth-timing fix above.

## The redesign is underway

[`docs/DESIGN-DIRECTION.md`](./DESIGN-DIRECTION.md) is the audit and the plan:
four phases, seven moves, and the two rules that settle everything else —
**colour is data, everything else is ink**, and **the timeline is the
interface**. Read it before changing anything visual.

**Phase 1 (foundation) is done.**

- Tokens split into a chrome family (no hue) and a data family (the only
  saturated colour in the app), all on `:root` rather than `.ns` — hover cards
  portal to `document.body` and cannot see `.ns`-scoped custom properties.
- The four data hues were validated as a set in both modes; the five they
  replaced failed four checks. `--in-*` / `--out-*` / `--data-nw` / `--cmp`
  replace the old `--blue-*` / `--amber-*` names.
- **Dark mode**, stepped rather than flipped, with a toggle in the header
  (`ThemeToggle.tsx`). Three states: unstamped follows the OS.
- **The KPI strip is gone.** One hero figure, one plain-language sentence
  (`reading.ts`), the spread it depends on, and a metadata line.
- `--inverse` / `--on-inverse` exist because tooltips, the horizon pin and the
  hover card are "opposite the ground" surfaces — they were painting white on
  white in dark until they stopped using `--ink-deep` as a background.

Phases 2–4 (chart as spine, scrub and drag, table density) are still open.

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

## Monarch import (new)

Balances can now be imported from Monarch — **Import** in the title row.
[`docs/MONARCH-IMPORT.md`](./MONARCH-IMPORT.md) carries the full rationale;
the parts worth not relearning:

- **It cannot be live, and the reason is structural.** Static bundle, no
  backend; the MCP server is stdio-only; Monarch's API is not CORS-open and its
  token is keyring-held on purpose. Capture-and-paste is not a shortcut taken
  for speed. When Phase 2 lands, the server runs this same mapper on a
  schedule — `packages/engine/src/monarch.ts` does not change, only its caller.
- **An import writes `initialBalance` and nothing else.** Monarch knows what
  you have, not what you expect. Resetting `growthRate` from a trailing return
  would overwrite the modelling judgement that is the point of the tool. This
  is the rule the whole module turns on — do not "improve" it.
- **`get_accounts` returns no subtype**, so a 401(k), a Roth and a taxable
  brokerage all arrive as `brokerage` — indistinguishable in the one dimension
  the tax model turns on. The import refuses to guess: ambiguous accounts are
  held out of the diff and asked about, and answers persist to
  `settings.monarchOverrides` keyed by Monarch account id.
- **The question queue is computed from the capture alone**, never from the
  unresolved set. Deriving it from what is still unanswered makes each row
  vanish as it is answered and the rest jump up under the pointer — the next
  click then lands on a different account, and a misfiled 401(k) is invisible
  from that moment on. A test pins this.
- **Synthetic accounts are never overwritten** (a home from `buyAHome` owns its
  own balance), and **cash flow is off by default** — a salary modelled as an
  income event plus a baseline counts the same money twice.

## Phase 2 is done — there is a server

`packages/server`: Fastify + SQLite, single user, holding plans and Monarch
snapshots. [`docs/BACKEND.md`](./BACKEND.md) is the full account. What matters
most:

- **It runs on loopback by default and that is load-bearing.** The first-run
  setup route is claimable by whoever reaches it first, so binding `0.0.0.0`
  on an untrusted network hands over the account. Reach it remotely via
  Tailscale or an SSH tunnel; do not widen the bind.
- **`NORTHSTAR_ENCRYPTION_KEY` is required, never generated.** A key invented
  at boot would change on restart and silently orphan the stored Monarch
  session — presenting as an endless "reconnect" loop with nothing in the logs.
- **Going direct to Monarch's GraphQL beats the MCP tool.** The real
  `GetAccounts` returns `subtype`, `interestRate`, `apr`, `minimumPayment` and
  `plannedPayment`; the MCP tool drops them all. `subtype` is what separates a
  401(k) from a Roth from a taxable brokerage, so the live path classifies
  automatically where the paste path must ask. This is also what finally gives
  the `linked*` fields a real source — §9 Phase 3 expected to need Plaid for it.
- **`queries.ts` is the file that will rot.** Monarch's API is private and
  unversioned. A schema error means recapture the query from DevTools; nothing
  else moves. Keep the paste path for exactly this reason.
- **The server deviates from §9 deliberately** — SQLite not Postgres, typed REST
  not tRPC, hand-rolled auth not Auth.js. One user on one machine. Rationale is
  in BACKEND.md; do not "fix" these back.
- **Refresh never writes to a plan.** It fetches, stores a snapshot, and opens
  the same diff the paste flow shows. The user still confirms.
- **Plans: localStorage first, server just behind, debounced 500ms.** The sync
  is a whole-set replace, so a dropped request costs nothing. `PUT /api/plans`
  refuses an empty array — the client sends its full list every time, so empty
  means the client lost state, not that you deleted everything.
- **Node cannot run this TypeScript directly.** The engine imports with `.js`
  specifiers resolving to `.ts`, and strip-types rejects constructor parameter
  properties. `packages/server/build.mjs` bundles with esbuild; that is why
  there are no parameter properties in server code.

Still open from Phase 2: a shareable read-only link and PDF export, both of
which the engine can already do server-side.

**Real vs forecast is the obvious next thing.** Every snapshot is kept and
`GET /api/monarch/history` already returns captured date + net worth. Drawing
that as a second line against the projection is mostly chart work.

Still open, in rough priority order:

- **Comparison is clipped to the active plan's horizon.** Comparing House
  (ends 2046) against Retirement (ends 2086) shows only to 2046, which is the
  right default but is not explained anywhere in the UI.
- **The fan is one variable.** `Range` flexes investment returns ±2pp and
  nothing else. Inflation, longevity and the tax rate are all just as uncertain
  and are still point estimates. A second axis (or letting the ±2 be edited) is
  the obvious next step.
- **Deep pin cascades.** Pins now stack until they clear (see below), which on
  a 60-year plan with clustered early events reaches five rows and covers the
  top of the plot. Readable, but a "+3 more" collapse past ~4 rows would be
  better.
- **`samplePlan.ts` still seeds the two demo scenarios.** Fine while there is
  no backend; it should become an onboarding flow rather than fake data.

## The hover/settings pattern

One principle, applied everywhere: **hovering something shows the assumptions
behind it, and clicking through edits those same assumptions.**

Every row that represents something with settings carries a gear, revealed on
row hover: balance sheet type rows, Gantt event rows, and cash flow lines. A
cash flow row's gear leads to the event that produced the line — or, for the
rows the engine builds from plan settings (`Living expenses`, `Baseline
income`, `Taxes`), to the assumptions drawer. **A gear that leads nowhere is
worse than no gear**, so rows with no settings behind them get none.

That only stays true because both read from ONE spec:

- **Accounts** — `packages/engine/src/accountTypes.ts` declares each type's
  editable fields once. `accountDetail()` renders them read-only into the hover
  card; `AccountDrawer` renders the identical list as inputs. Adding a field to
  a type makes it appear in both.
- **Events** — the hover card and the drawer form are both generated from the
  event module's zod schema. A field whose `kind` is `custom` (a zod record)
  is skipped by the generated form and needs a bespoke control;
  `schemaForm.test.ts` pins the complete list of them, so adding a record to a
  schema without wiring up an editor fails the build rather than silently
  dropping the field from the UI.
- **Id-shaped config fields render as pickers.** `participantId` and
  `contributionAccountId` are references to other things in the plan, so
  `EventDrawer` passes `options` and `ConfigField` renders a select. Add new
  reference fields to the `choices` map there, never as free text — a raw id
  input asks the user to know something only the code knows.
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

## Notable points on the line

`pathMarkers` (`packages/engine/src/markers.ts`) finds the three things on a
net worth line worth pointing at: the years the plan runs dry, the high-water
year when the plan declines after it, and the largest peak-to-trough fall.

- **A failing plan leads with a banner**, not a dot to be discovered. Before
  this, `unfundedShortfall` existed in the engine and surfaced only as a Cash
  Flow row you had to scroll to — a plan could fail in 2061 and look fine.
- **Only the FIRST failing year gets a dot.** A badly broken plan fails every
  year after it breaks; the first render put 61 pulsing dots on the chart.
  The banner carries the count and total instead.
- **The peak is reported only when the plan declines after it.** On a line
  that rises to the end, the peak is just the last point and says nothing.
- **A fall under 2% is not a story** — that threshold keeps ordinary wobble
  from being dressed up as a drawdown.
- **One dot per year, most urgent wins.** A year is often peak, trough and
  failure at once; two dots stacked on one point read as a bug.

## The sensitivity fan

`Range` in the chart header runs the plan twice more at ±2 percentage points
of return and draws the spread. Notes worth keeping:

- **`withReturnShift` is deliberately narrow** (`packages/engine/sensitivity.ts`):
  liabilities, `noChange` accounts and a home's appreciation are all left
  alone. It is a sensitivity on the investment portfolio, which is what the
  label claims. Widening it silently would make the label a lie.
- **The high path must be in the y-scale ceiling** or the fan clips off the top
  of the plot.
- **The area gradient dims to 0.3 when the fan is on.** Stacked with the band
  it makes the lower edge read as a crossing of the base line — it is not; a
  test asserts the base always sits inside its own fan.
- **Endpoint chips are anchored from the RIGHT** (`right: pct(VB_W - x)`), not
  centred. Centred they hang ~30px off the plot, and the transform that would
  fix that is the same one that throws hover cards across the page.
- **`withReturnShift` handles `schedule` as well as `fixed`.** A variable rate
  curve shifts every anchor together. Anything market-exposed that it skips
  silently opts out of the fan, which is invisible in the UI.

Note when testing: `.ns-hovercard` is `pointer-events: none`, so
`elementFromPoint` reads straight through it. Assert paint order via computed
z-index, not hit testing.

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
- **A new job zeroes the earnings it replaces by default** (`replacesEarnedIncome`).
  Off by default would be the safer-looking choice and the wrong one: stacking
  a new salary on the old one silently doubles a plan's income, and the result
  looks entirely reasonable. Scoped to events that started *before* the job, so
  a later job still lands.
- **Retirement retains income per line**, not with one blanket switch. The
  drawer lists only the lines the event can actually act on — a percentage that
  silently does nothing is worse than no control.
- **A kid's costs grow at their own rate, not plan inflation.** Same for
  recurring expenses via the optional `growthRate`. Tuition and childcare do
  not track the general basket.

## Repo map

```
docs/PLAN.md              the build guide — domain model, engine, design spec
docs/NEXT.md              this file
packages/engine/          pure TS projection engine (no React, no I/O)
  src/run.ts              the year loop; order of operations is PLAN.md §4.3
  src/events/             one module per event kind + the registry
  src/monarch.ts          Monarch snapshot -> plan balances (pure)
  examples/demo.ts        npx tsx examples/demo.ts → a worked 12-year projection
docs/DESIGN-DIRECTION.md  the UI audit and the redesign plan
docs/MONARCH-IMPORT.md    the Monarch capture/paste loop
docs/BACKEND.md           the server: security model, API, deviations from §9
packages/server/          Fastify + SQLite, single user
  src/monarch/queries.ts  the GraphQL documents — the bit most likely to rot
  src/auth/crypto.ts      scrypt passwords, AES-256-GCM credential envelope
  build.mjs               esbuild bundle (Node cannot run the TS directly)
src/auth/AuthGate.tsx     setup / login / planner
src/planner/DataBanner.tsx  the freshness line
scripts/monarch-capture.mjs  raw MCP tool output -> a Northstar snapshot
src/App.tsx               planner shell
src/planner/              chart, tabs, tokens, presentation rules
  planner.css             tokens on :root (chrome vs data), then everything
  store/planStore.ts      plans, undo/redo, localStorage
  drawer/fields.tsx       form primitives shared by all three drawers
  HoverCard.tsx           the inverse detail popover
  detail.ts               the three Detail builders
  reading.ts              the hero's plain-language sentence
  ThemeToggle.tsx         light/dark, stamped on <html>
  useBreakpoint.ts        phone/tablet/desktop + year-column count
```

The old AI Studio simulator has been deleted, along with the deps only it
used (recharts, motion, date-fns, clsx, tailwind-merge, lucide-react and
Tailwind itself). It is in git history if it is ever wanted back. That took
the CSS bundle from 53 kB to 22 kB.
