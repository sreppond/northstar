# What to take from FIREMaster

A read of [demo.firemaster.io](https://demo.firemaster.io/)'s production bundle
against what Northstar already is, and what I'd build next as a result.

This is an ideation document, not a commitment. Nothing here is built.

---

## 0. The one distinction that decides everything

FIREMaster and Northstar look like the same product and are not.

|  | FIREMaster | Northstar |
|---|---|---|
| Direction | Backward — what did I spend, what do I own | Forward — what happens if |
| Truth source | A synced transaction ledger (Monarch) | A plan you author |
| Compute | FastAPI + SQL behind `/api`, ~45 endpoints | `runPlan`, pure, in the tab |
| Time step | Monthly, driven by real months | Annual, deliberately |
| Tax | Progressive brackets, a real engine | Flat effective rate per account, deliberately |
| Cash allocation | None — money just accumulates | Two ordered waterfalls |
| Provenance | A transaction has a category | A `LineItem` carries the event that caused it |

Roughly half of FIREMaster's surface — the transaction ledger, Monarch sync,
property P&L with classification rules, the asset-hub enrichment, the spending
tracker — **is not portable**, because it is an interface onto a database of
things that already happened. Copying it means building Phase 3 first.

The other half is **pure computation over a plan object**, which is exactly
what we have and they have less of. That half is worth taking, and in several
places we can do it better than they did, because our engine carries
provenance and theirs does not.

Two things are worth saying plainly, because they inform everything below:

- **Their event markers, hover cards and sensitivity band are things we already
  built** (`bd7adb9`, `c8e5906`, `c5e491a`), and ours are better — theirs group
  by exact x, ours stack by pixel overlap; theirs decorate the line, ours
  (`markers.ts`) *find* the three points that mean something. There are two
  small refinements to take, in §7.
- **Their charts are Recharts, ours is hand-rolled SVG.** Several of their
  cleverest bits are workarounds for Recharts' limitations. Don't port the
  workaround; port the idea. Their Monte Carlo fan computes
  `band_10_25 = p25 - p10` so `<Area stackId>` can stack deltas into a fan.
  We just draw four nested `<path>`s. Simpler, not harder.

---

## 1. Monte Carlo — the biggest missing truth

**The gap.** Every number in Northstar rests on the assumption that
investments return exactly what was typed, every year, forever. The `Range` fan
flexes that ±2pp and re-runs — which honestly answers *"what if I was wrong
about the average"* and does not touch *"what if I was right about the average
and unlucky about the order."*

Those are different questions and the second one is the one that ends
retirements. A 60-year plan at a flat 6.5% never fails. The same plan at 6.5%
mean and 15% vol fails a real share of the time, and it fails when the bad
years land early — sequence-of-returns risk. Right now we cannot express that
at all, and `docs/NEXT.md` already names the smaller version of this complaint:
*"the fan is one variable."*

**Why it's nearly free.** `growthRateMethod: 'schedule'` already accepts one
rate anchor per year. A random return path is *literally a
`growthRateSchedule`*. The machinery to run a plan under a varying return curve
was built for variable growth rates and it does not know or care that the curve
came from a generator.

**Implementation.** New `packages/engine/src/montecarlo.ts`:

```ts
export interface TrialSpec {
  runs: number;            // 500 is plenty; 2000 for a "publish" run
  returnMean?: number;     // defaults to headlineReturnRate(plan)
  returnStdev: number;     // percentage points, ~15 for equity-heavy
  inflationStdev?: number; // the second axis NEXT.md asks for
  seed: number;            // deterministic → reproducible → testable
}

export interface TrialResult {
  successRate: number;                 // share of runs with no unfunded year
  percentiles: Record<Percentile, number[]>; // p10/p25/p50/p75/p90 by year
  firstFailureYears: number[];         // for a median + histogram
}

export function runTrials(plan: Plan, spec: TrialSpec): TrialResult;
```

- `withReturnPath(plan, number[])` generalizes `withReturnShift` and keeps its
  discipline about what counts as market-exposed — liabilities, `noChange`
  accounts and a home's appreciation stay out, or the label becomes a lie in
  the same way §"The sensitivity fan" in NEXT.md warns about.
- Seeded PRNG (mulberry32, eight lines), so a run is reproducible and a golden
  test can pin the success rate. **Non-negotiable** — an unseeded Monte Carlo
  makes the KPI flicker on every keystroke and no test can hold it.
- Inflation as a second stochastic axis, because it drives `baselineExpenses`
  and every inflating event, and a fixed 3% is as much a guess as a fixed 6.5%.
- 500 runs × 60 years × ~10 accounts is on the order of a few hundred ms — too
  slow for the render path, fine for a **Web Worker**. `runPlan` is pure with
  no I/O, no clock and no globals, so it moves into a worker with zero changes;
  that purity discipline is about to pay for itself. Debounce, and show the
  deterministic line immediately with the band filling in behind it.

**In the UI.** One KPI — `Success rate 82%` — sitting next to the existing
four, and a `Range ▸ Monte Carlo` mode on the chart that swaps the ±2pp band
for a p10–p90 fan. `pathMarkers` gains a sibling that reports *"median first
shortfall 2071; 18% of runs run dry"* instead of a single deterministic year.

**The trap to avoid:** a success rate is seductive and slightly fake. 82%
means 82% of a model, not of the world. Label it with the assumptions
(`6.5% ± 15%, 500 runs`) directly under the number, the way the `Range` legend
already names its own spread.

---

## 2. Accessible vs. locked — the bridge period

**The gap.** The chart shows one net worth line. But a 45-year-old with $2M of
which $1.6M is in a 401(k) is not the same as a 45-year-old with $2M of which
$1.6M is in a brokerage, and the line cannot tell you which one you are.
FIREMaster carves this out as a first-class concept (`/fire/bridge-status`,
"accessible net worth") and it's the single most useful reframing in their app.

**Why it's nearly free.** We already model everything needed and just never
sum it: `withdrawalTiming`, `withdrawalStartingYear`, `penaltyFreeAge`,
`penaltyRate`, and per-year participant ages in `YearSnapshot.ages`.
`isWithdrawable(account, year)` is already written and already exported.

**Implementation.** A derived selector in `src/planner/`, not the engine —
this is a partition of a result we already have, not a change to how it's
computed:

```ts
accessibility(result, plan) → {
  year, accessible, penalized, locked,
  yearsOfSpendingCovered,   // accessible / that year's total expenses
}[]
```

Three buckets, not two: **accessible** (withdrawable now, no penalty),
**penalized** (reachable but costs `penaltyRate` to touch — the honest middle),
**locked** (`withdrawalTiming: 'never'`, or gated by a start year not yet
reached). A home is locked. That is the point.

**In the UI.** A dimmer second line under net worth, toggled from the chart
header next to `Range` — same control language, no new pattern. Then the
derived number that actually changes behaviour: **years of spending covered by
accessible assets**, per year, with its trough called out the way
`pathMarkers` calls out a drawdown. *"Thinnest point: 2041, 2.3 years of
spending accessible"* is a sentence that makes someone move money, and no
part of the current UI can produce it.

---

## 3. The bracket ribbon — without breaking the flat-rate decision

**The standing decision.** Flat effective rate per account, matching Monarch,
to sidestep the fixed point where a withdrawal raises the bracket which raises
the withdrawal. `PLAN.md` §4.5, `NEXT.md` "Decisions taken." I'm not proposing
we revisit it — the circularity is real and progressive brackets inside the
waterfall would be a genuine rewrite.

**The gap it leaves.** `withdrawalTaxRate: 24` is a number someone typed once,
and by 2051 — RMDs running, Social Security switched on, wages gone — it might
be 12pp wrong in either direction, and nothing in the app will ever say so.

**The additive move: make it a diagnostic, not a mechanism.** The engine keeps
its flat rates and computes exactly what it computes today. Alongside it, a
pure read-only function scores the year:

```ts
bracketFit(snapshot, filingStatus, year) → {
  ordinaryIncome, marginalRate, effectiveRate,
  headroomToNextBracket,      // ← the whole reason to build this
  impliedFlatRate,            // what the plan *should* have been told
}
```

Rendered as FIREMaster's proportional stacked bar — income filling each
bracket, plus a dashed segment for the room left in the current one — and
placed in the Cash Flow tab against the `Income tax` row, which already has a
gear pointing at the assumptions drawer. Add one button: **"Use 19.4% →"**,
which writes `impliedFlatRate` into settings. The user stays the fixed-point
solver, manually, once, with their eyes open. No circularity, and the number
stops silently rotting.

Bracket tables are a static versioned constant (`taxTables.2026.ts`) with
thresholds inflated forward at the plan's inflation rate — which is what the
IRS actually does. Stamp the source year in the UI so a stale table is visible
rather than assumed.

**What this unlocks.** Once headroom is computed, the Roth conversion ladder
is a small step: *"2039–2044 you have $38k/yr of room under the 22% bracket and
$1.9M sitting in tax-deferred. Converting the headroom each year costs $50k in
tax and cuts your first RMD by $31k."* That is FIREMaster's
`/tax/roth-conversion-plan`, and with headroom in hand it's arithmetic.

---

## 4. RMDs — a real hole in the model

**Built.** `packages/engine/src/rmd.ts` + step 4.5 in `run.ts` — see
`docs/PLAN.md` §4.3 and `docs/NEXT.md`. The rest of this section is kept as
the original reasoning for it.

Not borrowed from anywhere; reading their tax surface exposed it in ours.
**Nothing in Northstar ever forces a withdrawal.** A tax-deferred account can
compound untouched to age 95, and it can't. At 73 the IRS starts taking a
divisor-sized bite whether or not you need the money, it lands as ordinary
income, and it is the reason late-life effective rates jump.

**Implementation.** In `run.ts`, a new step **8.5**, after tax and before the
allocate/withdraw branch:

```
for each taxDeferredInvestment account whose owner is ≥ rmdStartAge:
    forced = balance / uniformLifetimeDivisor(age)
    → a withdrawal LineItem (labelled, so the Cash Flow tab shows it)
    → taxed at the account's own withdrawalTaxRate
    → the net joins the surplus and falls through the allocation waterfall
```

It slots into the existing order of operations rather than perturbing it: a
forced withdrawal is just a withdrawal that wasn't asked for, and the surplus
it creates already has somewhere to go (the cash sweep). The Uniform Lifetime
Table is ~25 rows of static data.

This is worth doing **before** anything cosmetic. It changes numbers.

---

## 5. Sensitivity, done properly — the tornado

**The spending strip (partial) is built.** `withExpenseShift` +
`yearsOfRunway` in `sensitivity.ts`, five read-only tiles in
`src/planner/SpendingStrip.tsx`. Not clickable-override, not the general
tornado below — see `docs/NEXT.md`. The rest of this section is still ideas.

**What they have.** Five clickable monthly-spend tiles → terminal wealth at 82,
with a "cash crisis" flag. Click one and it becomes an override that re-runs
the projection. Good idea, one variable.

**What we should build instead.** We can already re-run a whole plan in
milliseconds and we already have a live-preview mechanism (`App.tsx` swaps an
open draft in for the stored plan). So do the general version: **flex every
major assumption one at a time and rank them by impact.**

```ts
// packages/engine/src/sensitivity.ts — alongside withReturnShift
withExpenseShift(plan, pct)      // baselineExpenses × (1 + pct)
withInflationShift(plan, pp)
withRetirementShift(plan, years) // move the retirement event
withLongevityShift(plan, years)  // move endOfPlan
```

Each is a small pure `Plan → Plan`, tested the same way `withReturnShift` is.
Run each at ±1 unit, measure the delta in terminal net worth (and in first
failure year), sort by absolute impact, draw a horizontal tornado.

The output is a sentence nobody can currently get from this app: *"Spending is
worth 3× what returns are. Retiring two years later buys more than two points
of return."* That reframes the whole plan from *predicting* to *steering*, and
it is the thing a financial modeler actually wants — FIREMaster only gestures
at it with one row of spend tiles.

Ship the spending strip first if we want it cheap: `withExpenseShift` plus five
tiles under the KPIs is maybe 80 lines and the best insight-per-line item on
this whole page.

---

## 6. Scenario diff — finishing the A/B sentence

**The gap.** We have full scenarios and A/B comparison, and comparing them
means eyeballing two lines and remembering what you changed. FIREMaster's
"Active Scenario" panel narrates its overrides in plain English, and it's the
one piece of their UX I'd take wholesale — except ours can be better, because
their scenarios are a shallow JSON override blob and ours are whole `Plan`
objects with typed events.

**Implementation.** A pure structural diff over the domain types:

```ts
diffPlans(a: Plan, b: Plan) → Change[]
// { kind: 'settings' | 'account' | 'event' | 'rule',
//   verb: 'added' | 'removed' | 'changed', sentence: string }
```

Rendered as two stacked lists in the compare bar:

- **What's different** — "Retirement moves 2044 → 2041", "Adds *Buy a home*
  (2032, $780k)", "Baseline expenses +$18,000", "Taxable investments 6.5% → 5.0%"
- **What it costs** — "Net worth at 2086 −$1.4M", "First shortfall 2079 → never",
  "Success rate 82% → 71%"

~150 lines, pure, trivially testable, no new domain knowledge, and it turns the
compare feature from *two lines on a chart* into *an answer*. The field labels
already exist in `accountTypes.ts` and the event zod schemas, so the sentences
can be generated from the same specs the drawers render from — same discipline
as the hover cards, and it stays in step automatically when a field is added.

**Low risk, high payoff. If only one thing on this page gets built, I'd argue
for this or the spending strip.**

---

## 7. Small things to take from their charts

Three, and only three, because ours is otherwise ahead.

1. **Grouped event markers with a count glyph.** They collapse events sharing
   an x into one dot whose glyph is the count, and cap the hover list at 6 with
   `+N more`. `NEXT.md` already wants exactly this: *"a '+3 more' collapse past
   ~4 rows would be better."* Their version is a working reference.
2. **The zero-crossing gradient.** They compute `offset = max / (max - min)`
   and use it as a `<stop offset>` on **both** the fill and the stroke gradient,
   so a runway line turns green→red precisely where it crosses zero — no
   second series, no clipping path. Directly reusable in our hand-rolled SVG
   for net worth going negative, or for a net-cash-flow line.
3. **A second right-hand y-axis for annual spending** over the net worth area.
   Reading "wealth is falling" and "spending is rising" off one plot is the
   whole retirement story, and we currently make you switch tabs for it.

**Do not** port their Recharts stacking tricks, their `.fm-event-hover` class
that suppresses the default tooltip, or their absolutely-positioned hover card.
We solved all three already, and better — and note the transform trap recorded
in `NEXT.md` before touching pin positioning at all.

---

## 8. The one idea worth stealing from the half we can't build

Their Spending Tracker is a ledger feature and needs actuals. But buried in it
is a **unit conversion** that needs no actuals whatsoever:

> `savings_vs_old: $412` → `runway_days_added: 19`

Spending less isn't reported in dollars, it's reported in *time bought*. That
translation works perfectly on a pure forecast: every dollar of
`baselineExpenses` removed extends the year the plan runs dry, and we compute
that year already. Wire it into the spending sensitivity strip (§5) and each
tile reads *"−$500/mo → 3.2 more years"* rather than a terminal balance nobody
can feel.

Best idea in their app, and it costs us nothing.

---

## 9. Two things they don't have that I think you'd want more

Reading their bundle mostly convinced me the highest-value work isn't a port.

**Excel export, in your modeling conventions.** `PlanResult` is already a
year × line-item grid with `sourceEventId` provenance on every figure — it is,
structurally, a financial model that happens to render as HTML. Emitting it as
a workbook (Assumptions / Cash Flow / Balance Sheet chunks, inputs vs. formulas
colour-coded, **live formulas rather than pasted values** so growth and
amortization are auditable outside the app) turns Northstar into the thing that
*builds* the model rather than the thing that replaces it. Nothing in
FIREMaster does this, and no amount of web UI substitutes for a model you can
hand to someone.

**A trace on any number.** Hovering shows the assumptions behind a row — that's
the established pattern and it's good. The mirror is missing: click 2041's net
worth and get the year's actual walk — opening balances, income lines,
suppressions applied, expenses, debt service, contributions, tax, the waterfall
in rule order, growth, close. The order of operations is already the documented
contract in `PLAN.md` §4.3 and `LineItem` already carries provenance; the data
is all there and simply never surfaced. This is what makes the tool trustworthy
rather than merely plausible, and it's the difference between a calculator and
a model.

---

## 10. If I were sequencing it

| # | Item | Effort | Why here |
|---|---|---|---|
| 1 | ~~RMD forcing (§4)~~ | S | **Done.** It's a hole. It changes numbers. Fixed before decorating. |
| 2 | ~~Spending sensitivity strip (§5, partial)~~ | S | **Done.** Best insight per line in the document. |
| 3 | Scenario diff (§6) | S–M | Finishes a feature that's already 80% built. |
| 4 | Accessible vs. locked (§2) | M | New concept, all inputs already modelled. |
| 5 | Monte Carlo (§1) | M–L | Biggest truth gain; needs a worker and seeded RNG. |
| 6 | Bracket ribbon + headroom (§3) | M | Unlocks Roth laddering; needs a maintained table. |
| 7 | Full tornado (§5) | M | Natural once §5 exists in part. |
| 8 | Excel export (§9) | M | Highest "would actually use it" of anything here. |
| 9 | Chart borrowings (§7) | S | Cheap polish, do opportunistically. |

**Explicitly not doing:** transaction ledger, Monarch/Plaid sync, property P&L,
classification rules, asset-hub enrichment, the spending tracker itself. Those
are `PLAN.md` Phase 3, they need a backend and real data, and every one of them
makes Northstar a worse forecaster in exchange for being a mediocre tracker.
The forecast is the product.
