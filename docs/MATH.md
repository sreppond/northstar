# The engine's math, mechanic by mechanic

This is the audit trail for `packages/engine`'s arithmetic: one section per
mechanic, each with the formula, the convention chosen where the formula
alone doesn't pin down an answer, and the test that pins the number so a
human can re-check it. It exists alongside `docs/PLAN.md` (the architecture
and the original design rationale) rather than replacing it — PLAN.md says
*why* the engine is shaped the way it is; this says *what number comes out*
and *why that number, specifically*.

Two owner decisions run through several sections below and are stated once
here rather than repeated:

- **Decision 1 — partial-year growth compounds.** Any RATE prorated for a
  partial year (growth, a percent-of-assets fee, interest on cash, home
  appreciation) uses `effectiveRateForFraction(rate, fraction)` =
  `(1 + rate)^fraction − 1`, not `rate × fraction`. A RECURRING FLOW (a
  salary, an expense, a fixed fee, a contribution's own size) still prorates
  LINEARLY by the fraction — that's correct for a flow, and only a rate needs
  the compounding correction.
- **Decision 2 — mid-year contributions and withdrawals.** Money that moves
  DURING a year only earns, or forgoes, HALF that year's growth — not the
  whole thing (the old convention) and not none of it.

---

## Today vs. `years[0]`

**The bug.** The UI read `result.years[0]` — the projected CLOSE of the
first plan year (Dec 31) — for every "today" figure. With an `asOfDate` of
Sep 25, `years[0]` already includes ~3 months of projected growth, income and
spending the household hasn't actually experienced yet. On the example plan
(`src/planner/samplePlan.ts`) this overstated "today's" net worth by several
thousand dollars.

**The fix.** `runPlan` now returns `result.opening`: balances as of
`settings.asOfDate` (or `${startYear}-01-01` when unset), built from each
account's `initialBalance` for every account that exists at or before
`startYear` — the same test `accountExistsIn` already applies everywhere
else in the engine. This is additive: `opening` is optional on `PlanResult`
so a hand-built test fixture that predates it still type-checks, and
`runPlan` itself always sets it.

**W3#3 fix — a stub-year event no longer double-counts into `opening`.** The
engine tracks account existence at CALENDAR-YEAR granularity, not day
granularity, so `accountExistsIn` alone cannot tell "already existed at
`asOfDate`" from "an event creates this later in the same stub year" — both
read as "exists at `startYear`." For a PLAIN `plan.accounts` entry that
distinction never matters (the user typed in a balance that already exists);
for a SYNTHETIC, event-created account (`buyAHome`'s home/mortgage pair, say)
it does: the event's own cash flows (the down payment) are dated to land
DURING the stub year, strictly after `asOfDate`, so including the home and
mortgage in `opening` while the down payment is STILL sitting in cash
double-counts that money. `openingAccounts` now excludes an event-created
account unless it started strictly BEFORE this plan's own `startYear` (a
genuine carryover — a home bought in an earlier plan, still open after a
rollover). Worked check: a $200K household buying a $500K home with 20% down
($100K) in the plan's own `startYear` opens at $200K, not
$200,000 + $500,000 − $400,000 = $300,000 (the home and mortgage are not
"today" yet — the household still holds all its cash).

**Consumers fixed:** `src/planner/dashboard.ts` (`accountMixToday`),
`src/planner/ledger.ts` (`netWorthStats`, `assetMixToday`),
`src/planner/progress.ts` (`progressPointFromPlan`, and — via
`projectedNetWorthAt`'s new `opening`-anchored knot — `planVsReality`'s "vs.
plan" delta, W3#1). Each accepts `opening` (required on `dashboard.ts`'s
`accountMixToday`, which already took the full `PlanResult`; optional on the
other two, which historically took only `years`/a narrower shape, so an
unwired caller keeps its old, slightly-wrong reading rather than losing the
value outright). `OpeningAccountSnapshot` also now carries
`nonTaxableBaseRemaining` (a cost-basis account's remaining basis, a plain
copy of `Account.nonTaxableBase` — nothing has drawn it down yet as of
"today") for the Annuity view's basis/gain split (W3#7); it had nothing but a
projected `years[]` close to read before this.

**Remaining `years[0]`-as-today call sites** (page components; not fixed
here — see the audit's final report): `src/planner/pages/OverviewPage.tsx`
(`todayNetWorth`), `src/planner/PlannerContext.tsx` (`first` for CAGR),
`src/planner/NetWorthChart.tsx` and `src/planner/chartMath.ts` (the chart's
own x-axis anchor — explicitly queued for a later UI wave per
`docs/ROADMAP-10.md`), `src/planner/pages/CashFlowPage.tsx` (a fallback
window year, not "today" specifically), and
`src/planner/views/AnnuityForecastView.tsx` (reads a projected `years[]` row
at `plan.settings.startYear` for its "as of" balance/basis split instead of
`result.opening` — same gap, not yet wired to the `opening` fields above).

**Tests:** `packages/engine/test/run.test.ts`'s `runPlan — invariants`
suite exercises `opening` indirectly; `packages/engine/test/buyAHome.test.ts`
("opening snapshot excludes a stub-year purchase") and
`packages/engine/test/costBasis.test.ts` ("opening snapshot carries remaining
cost basis") cover W3#3/#7 directly; `src/planner/dashboard.test.ts`,
`src/planner/ledger.test.ts`, `src/planner/progress.test.ts` each have a
dedicated "reads opening instead of years[0]" test, including
`progress.test.ts`'s `projectedNetWorthAt` suite and `dashboard.test.ts`'s
"reads zero delta on the sync day" golden test for W3#1.

---

## Partial-year growth compounds

**Formula.** `effectiveRateForFraction(ratePercent, fraction)` in
`accounts.ts`: `(1 + ratePercent/100)^fraction − 1`. A full year
(`fraction === 1`) reduces this to exactly `ratePercent/100`, so it is used
unconditionally in `run.ts`'s growth step, not as a special case for the
stub year only.

**Worked check.** 12%/yr with exactly a quarter of the year left credits
`1.12^0.25 − 1 ≈ 2.8737%`, not the linear `12% × 0.25 = 3%`. Compounding a
partial period earns slightly LESS than the linear share, because linear
proration implicitly assumes the fractional gains themselves get to
re-compound at the full year's pace, which a shorter period cannot do.

**Where it applies**, all via the same helper:
- **Growth** (`run.ts`) — every asset's rate, including a `cash` account's
  "yield" (there is no separate "interest on cash" code path; cash is just
  an account with `growthRateMethod: 'fixed'`).
- **Annuity asset-based fees** (`annuity.ts`'s `annuityFeeForYear`) — the
  asset-based percentage (mortality & expense + advisory) is a
  percent-of-assets RATE, so it compounds; the FLAT fee is an ordinary
  recurring dollar flow and stays linear (`flat × fraction`).
- **Home appreciation for carrying costs** (`events/buyAHome.ts`) — the
  "value" used to size property tax/insurance/maintenance/HOA in a year
  after a STUB-year purchase now compounds the purchase year by its own
  elapsed fraction, then full years after, matching the home ACCOUNT's own
  balance (which already went through `run.ts`'s fix). Before this fix the
  two disagreed: the account balance compounded correctly but the carrying-
  cost "value" assumed the purchase year was a full year.
- **Debt interest** is unaffected — it was already correct, stepped
  MONTHLY for `monthsRemaining(fraction)` months rather than prorating an
  annual rate at all (see "Mortgage amortization" below).

**Tests:** `packages/engine/test/golden.growth.test.ts` ("Golden: stub-year
growth compounds..."), `packages/engine/test/partialYear.test.ts` (updated;
see its "MOVED" comment), `packages/engine/test/annuity.test.ts` (updated),
`packages/engine/test/golden.events.test.ts` ("Golden: home appreciation and
purchase costs").

---

## Mid-year contributions and withdrawals

**The waterfall, read first.** Before this change, `run.ts` debited a
withdrawal from `balances` BEFORE computing growth, and added a
contribution to the balance AFTER computing growth. Both amounted to the
SAME convention: money that moved during the year earned or forgave the
WHOLE year's growth, symmetrically. That symmetry is exactly what broke once
contributions moved to a half-period credit and withdrawals didn't — so
withdrawals get the same treatment for consistency, not because the old
withdrawal timing was independently wrong.

**Formula.** Let `f` be the year's fraction (1 for a full year),
`fullFactor = effectiveRateForFraction(rate, f)`,
`halfFactor = effectiveRateForFraction(rate, f/2)`, `growthBase` = the
opening balance net of withdrawals already debited by the waterfall/RMD
step, `contributions` and `withdrawals` the year's totals for the account:

```
grossGrowth = growthBase * fullFactor
            + contributions * halfFactor
            + withdrawals * (fullFactor - halfFactor)
```

Derivation: modelling a contribution/withdrawal as landing at the exact
midpoint of the period gives
`closing = opening·(1+r)^f + contributions·(1+r)^(f/2) − withdrawals·(1+r)^(f/2)`.
Since `growthBase` already has `withdrawals` subtracted out at FULL weight
(`(1+r)^f`), adding back `withdrawals·(fullFactor − halfFactor)` is exactly
the correction from "forgoes it all" to "forgoes only half".

**Worked check (contribution, full year).** $100k opening at 5%, a $44k
contribution: opening growth = `100,000 × 0.05 = 5,000`. Contribution growth
= `44,000 × (1.05^0.5 − 1) ≈ 1,086.58`. Total ≈ `6,086.58` (was `5,000` under
the old "contributions earn nothing" convention).

**Worked check (withdrawal, full year).** $200k at 10%, a $40k withdrawal
with no tax/penalty: `growthBase = 160,000`, full-period growth on that =
`16,000`. Withdrawal credit = `40,000 × (0.1 − (1.1^0.5 − 1)) ≈ 2,047.65`.
Total growth ≈ `18,047.65` — between the old convention's `16,000` (forgoes
it all) and a full credit's `20,000` (forgoes none of it).

**A quirk worth knowing:** if an account is also the plan's fallback sweep
target (the only asset account, or the only cash account), a forced RMD's
proceeds can land right back in the SAME account as a "contribution" in the
same year. Contribution and withdrawal credits then partly cancel — net
growth on that account converges toward "as if the money never left",
which is the mathematically consistent (if slightly surprising) result of
crediting both sides symmetrically. See the "why a plain cash account is
here" comment in `run.test.ts`'s RMD growth test.

**One-off lump sums are unchanged.** A down payment, an RSU vest, a
windfall — anything NOT tagged `recurring` — was never scaled by
`yearFraction` for its own size and still isn't; decision 2 is only about
the GROWTH credited on money that moves, not about re-timing when a lump
sum itself lands.

**Tests:** `packages/engine/test/golden.growth.test.ts` ("Golden: mid-year
convention for contributions" / "...for withdrawals"),
`packages/engine/test/run.test.ts` (updated: the contribution test and the
RMD growth test), `packages/engine/test/rmd.test.ts`.

---

## Flat income tax

**Formula** (`run.ts` step 7): `tax = max(0, taxableIncome − pretaxContributions) × incomeTaxRate/100`.
Flat rate on ordinary income net of pretax (traditional 401(k)/IRA-style)
contributions — no brackets, matching Monarch's own per-account flat-rate
model (`docs/PLAN.md §4.5`).

**Test:** `packages/engine/test/golden.tax.test.ts` ("Golden: flat income tax
on salary").

---

## Capital-gains basis on taxable withdrawals

Two DIFFERENT models coexist, chosen by whether `Account.nonTaxableBase` is
set:

- **Flat share** (`taxableWithdrawalPercent`, `tax.ts`'s
  `effectiveWithdrawalRate`/`grossUp`): `effectiveRate = taxRate ×
  taxableSharePercent/100 [+ penalty]`; `gross = net / (1 − effectiveRate)`.
  Right for a plain brokerage where "60% of every dollar out is gain" is a
  stable estimate, wrong once an account is drawn down far enough that all
  the gain is gone.
- **Cost basis, LIFO** (`nonTaxableBase` set, `tax.ts`'s
  `costBasisTax`/`costBasisGrossUp`): gain (`balance − remainingBasis`) comes
  out FIRST, fully taxed; only once gain is exhausted does basis return
  tax-free. Worked example (`docs/PLAN.md §4.5a`): $100k balance, $80k basis
  ⇒ $20k gain. Withdrawing to net $30,000 at a 24% gain rate: gain alone
  nets `20,000 × 0.76 = 15,200`, short of $30,000, so `gross = 20,000 +
  (30,000 − 15,200) = 34,800`; tax = `20,000 × 0.24 = 4,800`; the remaining
  `14,800` of the gross is basis, tax-free.

**Tests:** `packages/engine/test/golden.tax.test.ts` ("Golden: capital-gains
basis..." / "Golden: cost-basis (LIFO...)"), `packages/engine/test/costBasis.test.ts`.

---

## Penalties before 59½

**Formula** (`tax.ts`'s `penaltyApplies`): the account's `penaltyRate` adds
to the effective withdrawal rate whenever the owner's age (whole calendar
years, `year − birthYear`) is below `penaltyFreeAge`. Worked check: 24% tax +
10% penalty before 59.5 ⇒ 34% effective rate ⇒ `66,000 / 0.66 = 100,000`
gross for a $66k need; the same account past 59.5 needs only
`66,000 / 0.76 ≈ 86,842.11`.

**Test:** `packages/engine/test/golden.tax.test.ts` ("Golden:
early-withdrawal penalty before 59½").

---

## Mortgage amortization

**Monthly payment formula** (`accounts.ts`'s `monthlyPayment`):
`payment = P × r / (1 − (1+r)^−n)`, `r` = monthly rate, `n` = term in months.

**Defect found and fixed.** `scheduledAnnualPayment` used to amortize
whichever balance the CALLER passed in, and `run.ts` called it with THAT
YEAR's current (already-shrinking) balance every year. A level-payment
loan's payment is fixed once at origination; re-deriving a fresh
`termYears`-long amortization off a shrinking balance every single year
makes the payment shrink too, so the loan never actually retires on the
stated schedule — a 30-year loan run this way still carries a meaningful
balance after 30 years (about $18,700 more remaining after year 10 in the
test scenario than the standard formula says should be left). `buyAHome.ts`
never hit this, because it already freezes `plannedPayment` at issuance by
hand; the bug only bit a plain `mortgage`/`loan` account that sets
`termYears` without also setting `plannedPayment`. **Fixed** by amortizing
`account.initialBalance` (the balance the projection STARTS with, matching
what "term remaining" is remaining against) once, rather than the live
balance every year — the same fix `buyAHome.ts` already applied by hand,
generalized to the fallback path.

**Stub-year months.** A partial first year steps `monthsRemaining(fraction)`
= `round(fraction × 12)` months rather than prorating the annual rate — this
was already correct (real monthly compounding, not a linear approximation)
and needed no change for decision 1.

**Remaining balance after N years** matches the standard closed-form
`B_k = P × [(1+r)^n − (1+r)^k] / [(1+r)^n − 1]` to the cent, once the payment
bug above is fixed.

**Tests:** `packages/engine/test/golden.debt.test.ts`.

---

## Home appreciation and purchase costs

**Formula.** Down payment + closing costs = `price × (downPct + closingPct)/100`,
a one-time expense in the purchase year, routed through the ordinary
waterfall (so it drains whichever account the withdrawal rules name — the
architecture's whole point, per `docs/PLAN.md §5.1`). The home account
appreciates like any other asset (`growthRateFor` + decision 1's compounding
fix); the carrying-cost "value" used for property tax/insurance/maintenance
now compounds the SAME way (see "Partial-year growth compounds" above) so
the two numbers never disagree with each other again.

**Test:** `packages/engine/test/golden.events.test.ts` ("Golden: home
appreciation and purchase costs"), `packages/engine/test/buyAHome.test.ts`.

---

## Job raises, comp steps and RSU vests

**Formula** (`events/work.ts`'s `compileEmployment`): the base salary curve
is PIECEWISE — each comp step resets the base, and `annualRaise` compounds
from the most recent anchor: `base(year) = anchor.base × (1 +
annualRaise/100)^(year − anchor.year)`. An RSU vest is a one-off, non-earned,
taxable cash flow in its own year only — it never compounds and a later
retirement/career-break suppression never claws it back (it isn't "earned"
income).

**Test:** `packages/engine/test/golden.events.test.ts` ("Golden: job raises,
comp steps and RSU vests"), `packages/engine/test/job.test.ts`.

---

## Inflation and both dollar modes

**The engine always runs nominal.** `dollarMode: 'todaysDollars'` only
divides through at PRESENTATION time (`inflation.ts`'s `deflate`); running
the simulation itself in real dollars risks double-deflating something
(`docs/PLAN.md §4.3`).

**Defect found and fixed (round 1 — the balance deflator).** `deflate`/
`presentValue` used to deflate `startYear` by ZERO years
(`(1 + inflation)^(year − startYear)`, which is `(...)^0 = 1` at
`year === startYear`) REGARDLESS of `asOfDate` — silently treating "today" as
Dec 31 of `startYear` rather than the actual as-of date. **Fixed**: a
BALANCE's exponent (`factorFor`) is now `startYearFraction + (year −
startYear)`, where `startYearFraction` is the fraction of `startYear` still
ahead of `asOfDate` (`yearFractionRemaining`, read off
`result.opening.asOfDate` automatically inside `deflate`). A full year
(`asOfDate` unset or Jan 1st) now correctly deflates `startYear`'s own close
by exactly ONE year (it IS a full year removed from a Jan-1 "today" by the
time it closes on Dec 31) — itself a change from the old always-zero
default, not only a stub-year fix. `presentValue` keeps a
`startYearFraction = 1` DEFAULT parameter so any existing 4-argument caller
keeps compiling.

**Defect found and fixed (round 2 — W3#2, a FLOW is not a balance).** Round
1's `factorFor` is right for a BALANCE (`accounts[].open/close`, `assets`,
`liabilities`, `netWorth`, `unfundedShortfall` — a snapshot AT Dec 31 of
`year`), but applying the SAME deflator to a FLOW
(`income`/`expenses`/`taxes`/`withdrawals`/`allocations`, the `total*`
figures, `netCashFlow`, and the per-account
`growth`/`contributions`/`withdrawals`/`interest`/`principal`) divided a
stub-year flow by an extra `(1+i)^f` it never should have carried: a flow's
SIZE is prorated by the stub fraction (fewer months to earn or spend it),
but that proration is a QUANTITY change, not a PRICE-LEVEL change, and must
not be deflated again on top of the inflation `run.ts`'s `inflationAt(year) =
(1+i)^(year−startYear)` already baked in. A $100k "today" income read as
$99,209.51 with `asOfDate` set mid-year, and — worse — $97,087.38 with NO
`asOfDate` at all (a regression from `main`, since `startYearFraction`
defaults to 1 whenever `opening` is absent, so the balance deflator's extra
`+1` term hit every flow even in the plain, no-stub case). **Fixed**: flows
now use their own `flowFactor(year) = (1+i)^(year−startYear)` — exactly the
SAME exponent `inflationAt` used to inflate them, with no stub-fraction term
— so dividing back out exactly undoes the inflation and leaves the
proration alone.

**Worked check (balance, round 1 — unchanged/PASS).** Any account balance
deflates by `startYearFraction + (year−startYear)`, same as always.

**Worked check (flow, round 2 — W3#2's 5c/5e cases).** $100k/yr baseline
income, 3% inflation, `asOfDate` leaving `f = 98/365` of the stub year
(2026-09-25, 267 days elapsed). Nominal year-0 income is prorated linearly (a
recurring flow) to `100,000 × f`; deflated by `flowFactor(year0) = (1.03)^0 =
1` (no stub term), that reads back as exactly `100,000 × f` — the flat $100k
rate, times however much of the year was actually lived. Nominal year-1
income already grew a full year of inflation (`100,000 × 1.03`, since the
engine runs nominal); deflated by `flowFactor(year1) = 1.03^1`, that reads
back as exactly `100,000` — matching the review's own hand value, not its
FAIL reading of `99,209.51` (with `asOfDate` set) or `97,087.38` (with it
unset). Sanity check: today's-dollars income is flat at the plan's real
$100k rate in every FULL year, stub or not, `asOfDate` present or absent.

**Test:** `packages/engine/test/golden.inflation.test.ts` — one describe
block per deflator (balance, unchanged; flow, the W3#2 fix), each with its
own worked check.

---

## RMD start age and divisor

**Formula** (`rmd.ts`): `forced = balance / uniformLifetimeDivisor(age)` for
`age >= RMD_START_AGE (73)`, using the IRS Uniform Lifetime Table. Worked
check: age 73's divisor is 26.5, so a $1,000,000 balance forces
`1,000,000 / 26.5 ≈ $37,735.85`.

**Test:** `packages/engine/test/golden.retirement.test.ts` ("Golden: RMD
start age and divisor"), `packages/engine/test/rmd.test.ts`.

---

## SEPP (72(t)) amount

**Formula, Fixed Amortization Method** (`sepp.ts`):
`payment = balance × r / (1 − (1+r)^−n)`, `n` = the IRS Single Life
Expectancy factor for the participant's age. Worked check: age 50's factor
is 36.2; `500,000 × 0.05 / (1 − 1.05^−36.2) ≈ $30,156.12`, taken identically
every year regardless of what the balance does (the defining feature that
makes this a separate module from the ordinary withdrawal waterfall —
`docs/PLAN.md §4.5b`).

**Test:** `packages/engine/test/golden.retirement.test.ts` ("Golden: SEPP
(72(t)) amount"), `packages/engine/test/sepp.test.ts`.

---

## Social Security COLA

**Formula** (`events/work.ts`'s `socialSecurity` module):
`benefit(year) = annualBenefit × (1 + colaRate/100)^(year − startYear)`,
split into a taxable line (`benefit × taxablePercent/100`) and an untaxed
remainder. Worked check: $30,000 base, 85% taxable ⇒ $25,500 taxable /
$4,500 untaxed at year 0; after 5 years of 2.5% COLA, `30,000 × 1.025^5 ≈
33,942.25`, of which `≈ 28,850.91` is taxable.

**Test:** `packages/engine/test/golden.events.test.ts` ("Golden: Social
Security COLA").

---

## Annuity fees and surrender schedule

**Fees** (`annuity.ts`'s `annuityFeeForYear`): a flat dollar charge (linear
proration) plus an asset-based percentage (decision 1's compounding
proration), assessed against the year's MID-point value
(`opening + grossGrowth/2`) rather than the opening balance — a carrier
charges this daily against whatever the contract is actually worth, so
pricing a whole year's charge off the opening balance alone systematically
under- or over-states it depending on the year's direction.

**Surrender** (`annuity.ts`'s `surrenderCharge`): `withdrawalGross ×
schedule[contractYear].percent/100`, or 0 for any contract year not
explicitly listed — a surrender schedule is sold as a shrinking, FINITE
list, so a year past the schedule costs nothing (unlike a growth schedule,
which holds its last rate forward).

**Test:** `packages/engine/test/golden.retirement.test.ts` ("Golden: annuity
fees and surrender schedule"), `packages/engine/test/annuity.test.ts`.

---

## Goals funding progress

**Formula** (`goals.ts`): `requiredAnnualContribution = max(0, target −
earmarked) / max(1, byYear − currentYear)` — a level, growth-free straight
line, deliberately not a return forecast dressed up as a plan. That number
becomes an allocation rule's `maxAnnual`; `goalFundingProgress` reads a
goal's progress back out of a finished `PlanResult` by summing its earmarked
accounts' balances against the target, per year.

**Test:** `packages/engine/test/golden.retirement.test.ts` ("Golden: goals
funding progress"), `packages/engine/test/goals.test.ts`.

---

## The retirement-age sweep

**Mechanism** (`retirement.ts`'s `retirementAgeSweep`): runs one full
`runPlan` per candidate retirement year, holding everything else about the
plan fixed, and reads back whether the candidate's plan ever runs dry
(`markers.ts`'s `pathMarkers`) before the participant's life expectancy.
This is an integration/pathfinding mechanic rather than a closed-form
number, so its golden test pins DIRECTION (an early, under-saved retirement
fails; a late, well-saved one survives) rather than a single hand-computed
figure — and needs a withdrawal rule wired to the savings account, or a
shortfall has nowhere to draw from at all regardless of the balance sitting
right there.

**Test:** `packages/engine/test/golden.retirement.test.ts` ("Golden: the
retirement-age sweep"), `packages/engine/test/retirement.test.ts`.

---

## Plan freshness

`freshness.ts`'s `planFreshness(plan, today)` is a pure, additive helper:
`daysSinceAsOf` = whole days from `asOfDate` (or `startYear`'s Jan 1st) to
`today`; `isStale` = that exceeds 35 days; `needsRollover` = `today`'s
calendar year has passed `startYear`. `today` is an explicit argument rather
than read from the clock internally, the same purity rule every other
derived module in this package follows.

**W3#6 fix — local calendar date, not UTC.** `today` is a `Date` — usually
fresh off `new Date()` at the call site — and `planFreshness` used to read
its UTC calendar fields (`getUTCFullYear`/`getUTCMonth`/`getUTCDate`). A
plan's `asOfDate` has no timezone of its own (it's just a calendar date
someone typed), so comparing it against the UTC date of "now" misdates every
evening west of Greenwich: in the Pacific timezone after roughly 4-8pm local,
the UTC calendar has already turned over to tomorrow, so a Monarch sync done
that evening read as happening a day later than it actually did, and the
rollover banner could fire a day early at a year boundary (New Year's Eve
afternoon offering to roll forward into a year that, locally, hadn't started
yet). **Fixed**: `today` is now read by its LOCAL calendar fields
(`getFullYear`/`getMonth`/`getDate`). The companion UI helper,
`src/planner/progress.ts`'s `todayISO()` (and the planner's own separate,
unexported `todayISO` in `src/planner/store/planStore.ts`), has the same fix
for the same reason: `toLocaleDateString('en-CA')` (a locale whose built-in
format happens to be `YYYY-MM-DD`) instead of `toISOString().slice(0, 10)`
(always UTC).

**Test:** `packages/engine/test/freshness.test.ts` (a dedicated non-UTC
timezone describe block pins `process.env.TZ` and exercises the evening/NYE
cases by hand); `src/planner/progress.test.ts`'s `todayISO` suite does the
same for the UI helper.

---

## Savings rate and spending

**The bug (review item 12).** A paycheck/allocation contribution (a 401(k)
contribution, say) is pushed into `run.ts`'s `expenses` array with
`category: 'contribution'`, because the withdrawal/allocation waterfall
needs it to be an ordinary cash OUTFLOW to route correctly. But it is
SAVING, not SPENDING — a dollar routed into a 401(k) moves net worth from
cash to a retirement account, it doesn't reduce it. Counting it as spending
understated the sample plan's 2027 savings rate at 34% against a true rate
of 39%, and left Cash Flow's "Expenses" (which separately netted
contributions out, via `netCashFlow`) and Reports' "Expenses" (raw
`totalExpenses`, contributions still in it) disagreeing under the same
label for the same year.

**The one definition, used everywhere** (`src/planner/ledger.ts`):
- `contributionsThisYear(snapshot)` = `Σ snapshot.expenses` where
  `category === 'contribution'`.
- **Spending** = `totalExpenses − contributionsThisYear` — living expenses
  plus event costs, contributions excluded. Taxes are tracked separately
  (`totalTaxes`), the same way `netCashFlow` has always kept them apart from
  "expenses," so spending doesn't double them in either.
- **Saved** = `netCashFlow + contributionsThisYear` — `netCashFlow` already
  has contributions subtracted out as an "expense," so crediting them back
  is what makes a $20k 401(k) contribution count as $20k saved rather than
  $20k spent.
- **Savings rate** = `saved ÷ totalIncome` (percent), undefined when there's
  no income to divide by.

`src/planner/ledger.ts`'s `cashFlowStats` (Cash Flow's StatStrip) and
`savingsRateNote`, `src/planner/dashboard.ts`'s `savingsRateThisYear`
(Overview), and `src/planner/reports.ts`'s `buildExploreRows` (Reports' new
`saved`/`savingsRatePercent` columns) all read off these same three
functions now, rather than each re-deriving its own number. Reports' older
`contributionRatePercent` ("Contribution Rate") stays — it measures
something genuinely different (contributions ÷ income, not counting a
surplus swept to cash as "saved") — and keeps its own distinct label rather
than being conflated with "Savings rate."

**Worked check.** $100k income, $40k living expenses, a $20k 401(k)
contribution, $10k taxes: `totalExpenses = 60,000` (40k living + 20k
contribution), `netCashFlow = 100,000 − 60,000 − 10,000 = 30,000`. Spending
= `60,000 − 20,000 = 40,000`. Saved = `30,000 + 20,000 = 50,000`. Savings
rate = `50,000 / 100,000 = 50%`.

**Known gap — the UI label mismatch itself (not fixed here; page components
are out of scope for this pass).** `src/planner/tabs/CashFlowTab.tsx` still
computes its drill-down table's "Expenses" group, "Savings" row and "Savings
rate" row inline, off raw `totalExpenses`/`netCashFlow`, rather than calling
`spendingThisYear`/`savedThisYear`/`savingsRatePercent`. See the review
agent's report for the exact lines.

**Test:** `src/planner/ledger.test.ts` ("excludes a 401(k) contribution from
'spending'..."), `src/planner/dashboard.test.ts` ("counts a paycheck
contribution as saved, not spent"), `src/planner/reports.test.ts` ("excludes
contributions from 'expenses' and credits them into 'saved'").

---

## Rolling a plan forward

**The bug (review item 4, W3#4).** `rollForward(plan, today)` moved
`startYear` to `today`'s year and set `asOfDate` to that year's January 1st,
but left every account's `initialBalance` untouched — so an August balance
read as if it were fresh on the following January 1st, staleness simply
vanished from the freshness chip, and every later projection lost the stub
year's own savings and growth (the sample plan's rolled-forward projection
was off by −$36.7k).

**The fix.** Before touching any settings, `rollForward` now runs the OLD
plan once (`runPlan(plan)`) and reads each plain `plan.accounts[i]`'s
PROJECTED Dec-31-of-the-old-`startYear` close (`oldResult.years[0]`,
matched by `accountId`) as the new plan's `initialBalance` — carrying the
stub year's savings and growth forward instead of discarding them. An
account that had not yet STARTED as of the old `startYear`
(`Account.startYear` in the future, `accountExistsIn` false) is left
untouched, since the old run's close for it is a meaningless 0, not a real
projected balance — overwriting its configured seed would erase it. A
synthetic, event-created account is skipped the same way, by construction
(it was never a `plan.accounts` entry to begin with). `rollForward` now
returns `{ plan, projectedFrom }` rather than a bare `Plan`:
`projectedFrom` is the OLD plan's `asOfDate` (or its `startYear`'s Jan 1st
when unset), undefined on a no-op roll, so the UI can say "Balances
projected from Aug 14 — sync Monarch to replace with actuals" instead of
silently relabelling a stale balance as "as of Jan 1."

**Known gap.** A cost-basis-tracked account's `nonTaxableBase` is NOT rolled
forward alongside its balance — it stays at the old figure, understating
remaining basis (overstating future taxable gain) by however much of the
stub year's growth was itself basis-free. Flagged rather than silently
compounded; fixing it would mean projecting basis paydown the same way the
balance itself now is.

**Call-site change needed:** `src/planner/PlannerContext.tsx`'s
`rollPlanForward` destructures `{ plan, projectedFrom }` from `rollForward`
now, instead of treating its return value as a bare `Plan`.

**Test:** `src/planner/rollover.test.ts`.
