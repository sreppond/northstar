# Northstar — Life-Event Financial Planner

## A build guide for a Monarch-Forecasting-class planning tool

This document is the engineering plan for rebuilding the Monarch "Forecasting"
experience as our own product. It covers the reverse-engineered domain model,
the simulation engine, the event system, the frontend, the visual language, the
backend, and a staged delivery plan.

---

## 0. What the page scrape actually gave us

The `cloned-page` scrape is mostly fonts and minified bundles, but
`main-249d83fe*.js` ships **the full GraphQL introspection payload plus every
Forecast query and fragment as source text**. That means we did not have to
guess at Monarch's data model — we have it exactly. Everything in §2 is
extracted, not invented.

The single most valuable finding is that Monarch's forecast is **not** a
spreadsheet of hardcoded event types. It is:

- a **scenario** holding settings + accounts + events + priority rules,
- where **events can create accounts** (`isSynthetic`, `sourceEventExternalId`),
- and **ordered priority rules** decide where surplus cash goes and which
  accounts get drained to cover a shortfall.

That triple is the whole architecture. Get it right and the 11 event types are
small, independent modules.

### What is *not* in the scrape

The per-event `config` payload is typed `GenericScalar` (an opaque JSON blob),
and the forecast page's own chunk was never loaded by the scraper, so the
concrete config field names for `buyAHome` et al. are **not** recoverable. §5
specifies those ourselves. Everything else below is verbatim from the bundle.

---

## 1. Product scope

A single-household, multi-scenario financial plan:

- A **persistent net-worth chart** across the whole projection, with life events
  pinned on the time axis.
- Three tabs underneath it — **Accounts** (balance sheet by year), **Cash Flow**
  (income/expense/withdrawal by year), **Events** (a Gantt of the plan).
- **Add event** opens a right-side drawer; saving it re-runs the projection and
  every number on the page moves.
- **Edit assumptions** controls inflation, projection length, growth rates,
  and the two priority orders.
- Multiple named **scenarios** you can switch between and compare.

Deliberately **out of scope for v1**: bank sync (Plaid), real transaction
history, mobile apps, multi-household sharing. Those are §9 Phase 3.

---

## 2. The domain model

Extracted from the bundle's introspection. This is what we mirror.

### 2.1 Enums (verbatim)

```
ForecastEventKind      annualExpense | buyAHome | careerBreak | endOfPlan |
                       haveAKid | income | newJob | otherExpense |
                       retirement | socialSecurity | windfall
ForecastGrowthRateMethod   fixed | noChange | schedule
ForecastWithdrawalTiming   always | never | starting_year
ForecastRuleType           allocation | withdrawal
ForecastDollarMode         futureDollars | todaysDollars
```

### 2.2 Scenario

```
ForecastScenarioType
  externalId, name, icon, color
  inflationRate
  projectionYears
  useActualsAsBaseline        # seed baseline from real transaction history
  splitUncategorizedSavings
  dollarMode                  # nominal vs real display
  baselineIncome
  baselineExpenses
  compareToScenarioExternalId # scenario A/B comparison
  accounts[]  participants[]  events[]  priorityRules[]
  categoryVersions { settingsVersion eventsVersion accountsVersion
                     participantsVersion priorityRulesVersion }
```

### 2.3 Account — the richest object

```
ForecastAccountType
  externalId, monarchAccountId, name, logoUrl
  accountType, accountSubtype, systemAccountType
  signedBalance / initialBalance
  isIncluded, isNew, isDeleted
  isSynthetic                 # created by an event, not by the user
  sourceEventExternalId       # ...by THIS event
  ownerUserId

  # growth
  growthRate, growthRateMethod, growthRateSchedule[{ year, rate }]

  # debt
  interestRate, plannedPayment, minimumPayment
  reduceExpensesForPaidOffDebt

  # withdrawal behaviour
  withdrawalTiming, withdrawalStartingYear
  withdrawalTaxRate, taxableWithdrawalPercent
  penaltyRate, penaltyFreeAge

  # contributions
  yearlyPaycheckContribution

  # tax-treatment split
  isTaxTreatmentEligible
  taxTreatmentConfig { enabled, components[{ kind, balance, annualContribution }] }

  # values inherited from the linked real account (for "you overrode this" UI)
  linkedGrowthRate, linkedInterestRate, linkedPlannedPayment, linkedMinimumPayment
```

Four things here are worth calling out because they are easy to miss and hard
to retrofit:

1. **`isSynthetic` + `sourceEventExternalId`.** A "Buy a home" event creates a
   Real Estate asset *and* a Mortgage liability. Deleting the event deletes
   both. This is exactly the "house but also a big new loan" behaviour.
2. **`taxTreatmentConfig.components[]`.** One account can be split into
   taxable / tax-deferred / tax-free buckets, each with its own balance and
   annual contribution. A 401(k) with a Roth sub-account is one account, two
   components.
3. **`linked*` fields.** Store the source-of-truth value alongside the user's
   override so the UI can show both and offer "reset to linked".
4. **`penaltyRate` + `penaltyFreeAge`.** Early-withdrawal penalties are modeled
   per account, not globally.

### 2.4 Event, Participant, Priority rule

```
ForecastEventType
  externalId, eventKind, name, startYear
  icon, color
  isIncluded, isHidden, isRequired
  config: GenericScalar        # kind-specific JSON — we define these in §5

ForecastParticipantType
  user { id displayName birthday profilePictureUrl }
  lifeExpectancy, isIncluded

ForecastPriorityRuleType
  accountExternalId
  componentKind                # target a tax component, not just the account
  ruleType                     # allocation | withdrawal
  order
  config
```

`ForecastPriorityRuleType` is the mechanism the brief described: two ordered
lists, one for "where does surplus cash go", one for "what gets drained first".
Note `componentKind` — you can say *drain the Roth portion before the
traditional portion of the same account*.

### 2.5 Concurrency — worth stealing

Mutations take an `expectedVersion` and the scenario carries a **per-category**
version (`accountsVersion`, `eventsVersion`, …). Editing an event bumps only
`eventsVersion`, so two people editing different tabs don't collide. Adopt this
only when we have multi-user (Phase 3); until then a single scenario-level
`version` integer is enough.

---

## 3. Architecture

### 3.1 The one call that matters

> **The simulation engine is a pure, dependency-free TypeScript package that
> knows nothing about React, the DOM, or the database.**

```
packages/
  engine/          # pure TS. no react, no fetch, no Date.now() in the hot path
    src/
      types.ts         # Plan, Account, Event, Rule, PlanResult
      run.ts           # runPlan(plan) -> PlanResult   <- the entry point
      events/          # one module per event kind (§5)
      accounts.ts      # growth, amortization, contributions
      priority.ts      # allocation + withdrawal waterfalls
      tax.ts           # gross-up, penalties, effective rates
      inflation.ts
    test/              # golden-file + property tests (§8)
  ui/              # React app
  api/             # server (Phase 2)
```

Why this is non-negotiable:

- **Instant feedback.** Every slider drag re-runs the whole plan in the browser
  in <5ms. No round trip. This is what makes the tool feel alive, and it is the
  single biggest UX differentiator.
- **Same numbers everywhere.** Server-rendered PDF exports, scheduled emails,
  and the browser all call the identical function. No drift.
- **Testable.** A financial engine you cannot unit-test is a liability. Pure in,
  pure out, no mocks.

If the engine ever imports React or `fetch`, the design has failed.

> **Amendment (Phase 1).** This section originally said "zero deps". The engine
> takes exactly one: **zod**. It is isomorphic with no transitive dependencies,
> so it costs nothing the purity rule was protecting, and it buys a single
> schema per event kind that validates engine input *and* generates the drawer
> form. One source of truth beat the purity badge.

### 3.2 Stack

| Layer | Choice | Why |
|---|---|---|
| Engine | TypeScript, zod only | portability, testability |
| UI | React 19 + Vite + TS | already the Northstar stack |
| State | Zustand (plan draft) + `useMemo` (derived result) | plan is small; result is derived, never stored |
| Charts | Custom SVG, not a chart library | the blueprint look (§7) needs full control of pins, rules, corner marks |
| Tables | Hand-rolled `<table>` | virtualization not needed at ≤60 rows × 20 cols |
| Validation | Zod | one schema per event kind, drives both the form and the engine |
| Backend (Ph.2) | Postgres + tRPC | end-to-end types, no codegen; GraphQL is overkill solo |
| Auth (Ph.2) | Auth.js or Clerk | don't build it |

**On charts:** Recharts is fine for Northstar's current dashboard but wrong
here. The Fig. 01 chart needs event pins that dodge each other, dashed
year rules that align to pin positions, hairline corner marks, and a hover
readout that reports a *year* rather than a data point. That is ~200 lines of
SVG we fully control, versus fighting a library's layout engine.

**On state:** store the *plan*, derive the *result*. Never persist a computed
projection — it will go stale and you will ship a bug where the chart and the
table disagree.

```ts
const plan   = usePlanStore(s => s.plan);          // the only source of truth
const result = useMemo(() => runPlan(plan), [plan]); // always fresh
```

---

## 4. The simulation engine

### 4.1 Time step

**Annual.** Monarch is annual — `startYear`, `projectionYears`,
`growthRateSchedule{year, rate}`, `withdrawalStartingYear`, and every table
column is a year. Monthly stepping would be 12× the compute for precision that
a 20-year life plan cannot justify, and it makes mortgage amortization the only
thing that benefits.

Handle the mortgage exception by computing its amortization **monthly inside
the year step** and rolling up to an annual `{interestPaid, principalPaid,
endingBalance}`. Best of both.

### 4.2 Two-phase execution

Some effects are knowable up front; some depend on simulated state. Split them.

**Phase A — compile (before the loop).** Each event compiles to static
schedules. A mortgage's full amortization table is deterministic given price,
rate, term, and down payment, so compute it once.

```ts
interface CompiledEvent {
  eventId: string;
  cashFlows: CashFlowItem[];        // {year, kind:'income'|'expense', amount, label}
  accountsCreated: Account[];       // synthetic: the home, the mortgage
  accountPatches: AccountPatch[];   // e.g. retirement stops 401k contributions
  horizon?: number;                 // endOfPlan sets the projection end
}

function compileEvent(event: PlanEvent, ctx: CompileContext): CompiledEvent;
```

**Phase B — simulate (the loop).** Only genuinely dynamic things happen here:
surplus allocation, shortfall withdrawal, taxes on those withdrawals, growth.

This split is what keeps `run.ts` small and makes each event kind a ~60-line
module you can test in isolation.

### 4.3 Canonical order of operations

Within each year, **in this exact order**. Write it down, test it, never let it
drift — every disagreement between two financial tools traces back to ordering.

```
for each year Y:
   1. AGE      advance participant ages; resolve age-triggered events
   2. INCOME   sum compiled income cash flows for Y (salary, SS, windfall, RSU)
   3. EXPENSE  baseline living expenses (inflated to Y)
             + compiled expense cash flows for Y (kid costs, property tax, ...)
             + scheduled debt payments
   4. TAX      income tax on ordinary income  -> an expense line
   5. NET      net = income - expenses
   6a. if net > 0  ALLOCATE surplus down the allocation rule order
   6b. if net < 0  WITHDRAW shortfall down the withdrawal rule order,
                   grossing up for tax + penalty (§4.5)
   7. CONTRIB  apply yearlyPaycheckContribution / employer match
   8. GROWTH   apply growth to every asset  (§4.4)
   9. DEBT     accrue interest, apply principal, roll amortization
  10. SNAPSHOT record every line item with its sourceEventId
```

Two conventions to fix now:

- **Growth applies to the balance a account *opened* the year with, net of any
  withdrawal — not to the balance after contributions.** This is conservative:
  a contribution made during year Y earns growth only from year Y+1. The
  alternative (half-year convention: contributions earn ½ a year of growth) is
  more accurate but harder to explain in a UI. Pick end-of-year, document it in
  the assumptions panel, and offer half-year as a setting later if anyone asks.

  This bullet used to open "growth applies to the *closing* balance after
  flows", which contradicts its own next sentence — and the engine had followed
  the wrong half, growing a year's contributions for a full year. Say opening
  balance; "closing" reads as "after contributions" to everyone who has had to
  implement it.

- **The first projection year may be a STUB.** A plan whose start year is the
  current calendar year is already part-spent, so rate-based accrual — asset
  growth and debt interest — is scaled by the share of the year still ahead
  (`RunOptions.firstYearFraction`). The engine has no clock: the caller passes
  the fraction, so the projection stays pure and reproducible. Income,
  expenses and contributions are NOT prorated yet, so a stub year still counts
  a full year of salary against a partial year of return.
- **Everything runs in nominal (future) dollars.** `dollarMode:'todaysDollars'`
  deflates at *presentation* time by `(1+inflation)^-(Y-Y0)`. Never run the
  engine in real dollars — you will double-deflate something.

### 4.4 Growth

```ts
function growthFor(account: Account, year: number): number {
  switch (account.growthRateMethod) {
    case 'noChange': return 0;                    // cash
    case 'fixed':    return account.growthRate;
    case 'schedule': return rateFromSchedule(account.growthRateSchedule, year);
  }
}
```

`growthRateSchedule` is a sparse list of `{year, rate}` anchors. **Step, don't
interpolate** — hold each anchor's rate until the next anchor. Interpolation
implies a precision the user did not express, and it makes the "5% until 2030,
then 3%" mental model wrong.

### 4.5 Withdrawals, tax, and the circularity trap

This is the subtlest part of the whole engine and the easiest place to ship a
quietly wrong number.

To cover a $100k shortfall from a tax-deferred account taxed at 24% with a 10%
early-withdrawal penalty, you cannot withdraw $100k. You must withdraw enough
that what survives tax and penalty equals $100k:

```
effectiveRate = withdrawalTaxRate × taxableWithdrawalPercent
              + (age < penaltyFreeAge ? penaltyRate : 0)

gross = netNeeded / (1 − effectiveRate)
```

With 24% × 100% + 10% that is `100_000 / 0.66 = $151,515`. Getting this wrong
understates the true cost of early retirement by ~50%.

Note that Monarch's per-account `withdrawalTaxRate` implies a **flat effective
rate per account**, not full bracket math. That is the right v1 call: it is
explainable, it is stable, and it avoids the fixed-point problem where a
withdrawal raises your bracket which raises the withdrawal.

If we later want progressive brackets, the withdrawal step becomes a fixed
point — iterate `gross → tax → shortfall → gross` to convergence (3 passes is
plenty) rather than solving analytically.

### 4.6 The priority waterfalls

```ts
function withdraw(need: number, accounts, rules, year, ages): Withdrawal[] {
  const out: Withdrawal[] = [];
  let remaining = need;

  for (const rule of rules.filter(r => r.ruleType === 'withdrawal').sort(byOrder)) {
    if (remaining <= 0.005) break;
    const acct = accounts[rule.accountExternalId];
    if (!isWithdrawable(acct, year)) continue;       // timing/startingYear gate

    const available = balanceOf(acct, rule.componentKind);
    if (available <= 0) continue;

    const rate  = effectiveWithdrawalRate(acct, ages);
    const gross = Math.min(available, remaining / (1 - rate));

    out.push({ accountId: acct.externalId, component: rule.componentKind,
               gross, tax: gross * rate, net: gross * (1 - rate) });
    remaining -= gross * (1 - rate);
  }

  if (remaining > 0.005) out.push({ shortfall: remaining });  // plan fails — surface it
  return out;
}
```

Allocation is the same shape without the tax gross-up, plus optional caps
(`config` can carry `maxAnnual`, `percentOfSurplus`).

**Surface the unfunded shortfall loudly.** When the waterfall runs dry, the plan
has failed in that year. That is the most important thing the tool can tell
someone, and it must not be silently swallowed into a negative balance.

### 4.7 Output shape — build for the audit trail

Every number on screen must be traceable to the event that caused it. That is
what makes the Cash Flow tab render a row per event.

```ts
interface YearSnapshot {
  year: number;
  ages: Record<string, number>;

  income:      LineItem[];   // each carries sourceEventId
  expenses:    LineItem[];
  taxes:       LineItem[];
  withdrawals: LineItem[];
  netCashFlow: number;

  accounts: {
    accountId: string;
    open: number; growth: number; contributions: number;
    withdrawals: number; interest: number; principal: number;
    close: number;
  }[];

  assets: number; liabilities: number; netWorth: number;
  unfundedShortfall?: number;
}

interface LineItem {
  label: string;
  amount: number;
  sourceEventId?: string;   // null = baseline
  category?: string;
}
```

Design this before writing the loop. Retrofitting provenance into a simulation
that only returns totals is a rewrite.

---

## 5. The event catalog

Eleven kinds. Each is a Zod schema (drives the drawer form *and* validates
engine input) plus a `compileEvent` implementation.

```ts
// The pattern every event follows.
export const buyAHomeConfig = z.object({ /* ... */ });
export type BuyAHomeConfig = z.infer<typeof buyAHomeConfig>;

export const buyAHome: EventModule<BuyAHomeConfig> = {
  kind: 'buyAHome',
  schema: buyAHomeConfig,
  label: 'Buy a home',
  code: 'HSE',                                  // the 3-letter chart pin
  compile(event, ctx) { /* returns CompiledEvent */ },
};
```

### 5.1 `buyAHome` — the reference implementation

The most complex event, and the one that proves the architecture.

```ts
{
  purchaseYear: number,
  price: number,
  downPaymentPercent: number,     // 20
  mortgageRate: number,           // 6.5
  termYears: number,              // 30
  closingCostPercent: number,     // 3
  propertyTaxRate: number,        // 1.1 of assessed, annually
  insuranceAnnual: number,
  maintenancePercent: number,     // 1.0 of value, annually
  hoaMonthly: number,
  appreciationRate: number,       // 3.5
  sellYear?: number,              // optional exit
  sellingCostPercent?: number,    // 6
}
```

Compiles to:

- **Two synthetic accounts**, both tagged `sourceEventExternalId: event.id`:
  - Real Estate asset, `initialBalance = price`, `growthRateMethod:'fixed'`,
    `growthRate = appreciationRate`
  - Mortgage liability, `initialBalance = price × (1 − downPct)`,
    `interestRate = mortgageRate`, `plannedPayment` = the computed monthly
    payment × 12
- **A one-time expense** in `purchaseYear`: down payment + closing costs. This
  flows through the normal shortfall waterfall, so the down payment
  automatically drains the brokerage account — which is exactly the coupling in
  the Monarch screenshot where Taxable Investments drops from $799.4K to
  $348.9K in the home-purchase year.
- **Recurring expenses** from `purchaseYear` onward: property tax (on the
  appreciating value), insurance, maintenance, HOA — all inflated.
- **The mortgage payment** is *not* a separate expense line; it is handled by
  the debt step against the synthetic liability. Emitting it as both would
  double-count. This is the #1 bug to watch for.
- If `sellYear` is set: liquidate at appreciated value less selling costs,
  retire the mortgage balance, route the proceeds through allocation.

```
monthlyRate = mortgageRate / 100 / 12
n           = termYears × 12
payment     = P × r / (1 − (1+r)^−n)
```

### 5.2 The rest

| Kind | Code | Config | Effects |
|---|---|---|---|
| `income` | `INC` | amount, startYear, endYear, growthRate, isTaxable | recurring income |
| `windfall` | `WND` | year, amount, taxRate | one-time income, net of tax |
| `newJob` | `JOB` | startYear, salary, bonusPercent, signingBonus, annualRaise, endYear, **replacesEarnedIncome**, retirement contribution %, employer match %, contributionAccountId, contributionIsPretax | income + contributions; when `replacesEarnedIncome` it zeroes earnings from events that started BEFORE it |
| `careerBreak` | `BRK` | startYear, durationYears, incomeReplacementPercent, spendingChangePercent, oneTimeCost | suppresses income for a span and adjusts spending over the same window |
| `haveAKid` | `KID` | birthYear, upfrontCost, annualCost, supportYears, costGrowthRate, collegeStartAge, collegeAnnualCost, collegeYears | one-off upfront cost at birth, annual support from the birth year for `supportYears`, growing at its OWN rate, then a college block |
| `annualExpense` | `EXP` | amount, startYear, endYear, inflates, growthRate | recurring expense; `growthRate` overrides plan inflation when set |
| `otherExpense` | `EXP` | year, amount | one-time expense |
| `retirement` | `RET` | participantId, retirementYear, spendingChangePercent, **incomeRetentionByEvent**, defaultIncomeRetentionPercent, affectsUnearnedIncome | stops contributions, adjusts baseline spend, and cuts each income line to its own retained percentage |
| `socialSecurity` | `SSA` | participantId, claimAge, annualBenefit, colaRate | income from claim age, COLA-indexed, to end of plan |
| `endOfPlan` | `END` | year | sets the horizon; defaults to oldest participant's `birthday + lifeExpectancy` |

`endOfPlan` is `isRequired: true` — every plan has exactly one and it cannot be
deleted, matching the ghost pin at 2046 in the reference UI.

### 5.1 One structure for every income cut

`newJob`, `careerBreak` and `retirement` all reduce income, so they share a
single `IncomeSuppression` rather than each special-casing the year loop. It is
resolved **per income line**, not once per year:

- `replacementPercent` — the blanket case, what every unnamed line drops to.
- `retentionByEventId` — per-line overrides. Retirement keeps consulting at 40%
  while wages go to zero.
- `exemptEventsStartingFrom` — income from events starting in or after this
  year is untouched. This is what lets a new job zero the salary it replaced
  without zeroing a job that starts later, and without zeroing itself.
- `includeUnearned` — off by default, because a rental or a pension usually
  survives retirement.
- `affectsBaseline` — whether `settings.baselineIncome` is in scope.

Most restrictive wins when several overlap: two events that both cut income
must never cancel out into a raise.

### 5.3 Registry

```ts
export const EVENT_MODULES = {
  income, windfall, newJob, careerBreak, haveAKid,
  annualExpense, otherExpense, buyAHome, retirement,
  socialSecurity, endOfPlan,
} satisfies Record<ForecastEventKind, EventModule<any>>;
```

Adding a 12th event kind = one new file + one registry line. Nothing in the
engine loop changes. That is the test of whether §4.2 was done right.

---

## 6. Frontend architecture

```
src/
  app/
    PlanPage.tsx              # header, KPI strip, chart, tab host
  chart/
    NetWorthFigure.tsx        # the SVG figure (§7)
    EventPins.tsx             # collision-avoiding pin row
  tabs/
    AccountsTab.tsx           # balance sheet by year
    CashFlowTab.tsx           # income / expense / withdrawals by year
    EventsTab.tsx             # Gantt
  drawer/
    EventDrawer.tsx           # right panel host
    forms/<kind>Form.tsx      # one per event kind, generated from the Zod schema
  assumptions/
    AssumptionsPanel.tsx      # inflation, horizon, dollar mode
    PriorityRuleList.tsx      # the two drag-orderable waterfalls
    AccountSettings.tsx       # per-account growth / withdrawal / tax config
  store/
    planStore.ts              # Zustand: the plan + undo stack
```

### 6.1 Interaction rules

- **Recompute on every keystroke.** The engine is fast enough. Debounce
  *persistence*, never the projection — the chart moving as you drag the
  mortgage rate is the product.
- **The drawer edits a draft.** Clone the event on open, mutate the draft,
  commit on save. Live-preview the draft in the chart (ghosted) but don't touch
  the committed plan until Save. Cancel is then free.
- **Undo/redo on the plan object.** A plan is small — keep a bounded stack of
  whole snapshots. Don't build a command pattern.
- **Deleting an event deletes its synthetic accounts.** Cascade on
  `sourceEventExternalId`, and warn in the confirm dialog: *"This also removes
  the Home and Mortgage accounts."*

### 6.2 Performance

At 20 years × ~15 accounts × 11 event kinds the engine is microseconds. The
only real risk is React re-rendering all three tabs on every keystroke.
Memoize per tab on the slice of `PlanResult` it consumes, and keep the inactive
tabs unmounted.

---

## 7. Visual design

> **Superseded.** This section originally specified the *Industry* blueprint
> system (steel-blue wireframe, Barlow Condensed, square corners, `+`
> registration marks, `FIG. 01` captions, `A.1`/`L.1` row refs). That direction
> was replaced. The spec below is the current one, taken from `Northstar_UX`.

A soft, modern product surface: white cards on a light neutral ground, generous
rounding, one blue accent, and a warm amber used **semantically** rather than
decoratively.

### 7.1 Tokens

```
/* ground & surface */
--bg            #F4F6F8      page
--surface       #FFFFFF      cards
--surface-sub   #FBFCFD      inset panels, table headers, footer bars
--tint-row      #F4F9FD      the highlighted total row
--track         #F1F4F7      segmented-control track

/* ink */
--ink           #16202B      body text
--ink-deep      #12304C      headline numbers, the net-worth line
--muted         #6B7C8C      labels, secondary text
--muted-light   #8A99A7      axis ticks, footnotes

/* lines */
--border        #E3E9EF      card borders
--border-strong #DCE4EC      control borders
--rule          #EDF1F5      row rules
--rule-light    #F2F5F8      child-row rules

/* accent — blue = income */
--blue          #2E8BD0      primary button, accent text, hover crosshair
--blue-press    #2379B8
--blue-deep     #1D4E77      text on blue tints
--blue-tint     #E4F1FB      income pin fill
--blue-tint-2   #E8F2FA      badge fill
--blue-line     #A9CFEA      income pin border
--blue-hover    #D2E8F8

/* accent — amber = cost */
--amber-tint    #FBF0E2      cost pin fill
--amber-line    #E8C68A      cost pin border
--amber-deep    #8A5B12      text on amber tints
--amber-hover   #F7E6CC

font            'DM Sans', system-ui, sans-serif  (400 / 500 / 700)
radius          18px cards · 14px inset panels · 10–11px controls · 999px pills
shadow-card     0 1px 3px rgba(18,48,76,0.05)
shadow-control  0 1px 2px rgba(18,48,76,0.06)
shadow-tooltip  0 6px 18px rgba(18,48,76,0.22)
page width      1320px max, 34px gutters
```

**`font-variant-numeric: tabular-nums` on every number.** The KPI strip, the
axis, the tooltip and all three tables. Columns that jitter as values change is
the single most common way a financial UI looks amateur.

### 7.2 The semantic colour rule

This is the substantive change from the previous direction, not just a repaint.
Event colour now encodes **what an event does to cash**:

| Colour | Meaning | Events |
|---|---|---|
| Blue tint, blue border | Income event | `income`, `newJob`, `windfall`, `socialSecurity` |
| Amber tint, amber border | Cost event | `annualExpense`, `otherExpense`, `haveAKid`, `buyAHome`, `careerBreak` |
| Solid navy | Plan boundary | `endOfPlan` |

The chart legend states it (`Net worth · Income event · Cost event`), so the pin
row reads as a cash-flow narrative at a glance. `retirement` is the ambiguous
one — it stops income *and* changes spending; treat it as a cost event so the
pin row stays a clean "what costs money" scan.

### 7.3 Layout

**Page header** (outside the card): `Forecasting` 22/700 · a `Plan` pill in blue
tint · scenario pills. The active scenario is a white pill with a `#C9D8E5`
border and a solid blue dot; inactive is transparent with a grey dot.

**Plan card** (radius 18, `--border`, `shadow-card`):

1. *Title row* — a 34px rounded-11 blue-tint icon tile, the plan name at 21/700,
   then `2026–2046 · 9 events` in muted, then right-aligned `Edit assumptions`
   (outlined) and `+ Add event` (solid blue).
2. *KPI strip* — **one** bordered, rounded-14 container inset 24px, four equal
   cells divided by internal 1px lines. Per cell: 13px muted label, 30/700
   `--ink-deep` value, 12px `--muted-light` note. Not four separate cards.
3. *Chart* — see §7.4.
4. *Selection footer* — a `--surface-sub` bar on a `--rule` top border. Empty
   state: *"Hover the chart for any year, or tap an event marker to see its
   details."* Selected: a blue-tint ref pill, the label, `year · detail`, and a
   right-aligned `Clear`.

**Data card** (a second card below):

- Pill segmented control on a `--track` background — the active tab is a **white
  pill at 700** with a soft shadow; inactive is muted 500 text on transparent.
- Right side: the year window (`2026–2033`) and two 34px square-rounded arrow
  buttons. The projection runs 20 years and only eight columns fit — page the
  window, never shrink the type.

### 7.4 The chart

SVG on a `0 0 1176 372` viewBox, plot from x=66 to x=1168.

- Horizontal gridlines in `--border`; a vertical `--border-strong` rule dropped
  at each event year.
- Net-worth line: `--ink-deep`, 2.75px, round caps and joins, over a fill that
  ramps `--blue` 20% → 2% top to bottom. An origin dot in `--blue` at r=4.5.
- **Event pins**: 32px, radius-10, coloured by §7.2, three-letter code at
  11/700. Pins colliding in the same year stack downward (`KID` under `JOB`).
- **Hover** targets a year band, not a point: a `--blue` vertical crosshair, a
  white-filled r=5.5 dot with a 2.5px blue stroke, and an `--ink-deep` tooltip
  (radius 12) showing the year, net worth at 20/700, and `Net flow ±X`.
- Axis labels live in an absolutely-positioned overlay above the SVG rather than
  as `<text>` — it keeps them in the page font stack and lets them use tabular
  numerals.

### 7.5 Tables

All three share a `268px repeat(8, 1fr)` grid, labels left, figures right.

| Row type | Style |
|---|---|
| Header | `--surface-sub`, 13px muted, caption in the label cell (`Balance sheet`, `Annual cash flow`, `Life events`) |
| Total | `--tint-row` background, 15/700 `--ink-deep` (`Net worth`, `Net cash flow`) |
| Group | 14/700 `--ink` (`Assets`, `Liabilities`, `Income`, `Expenses`, `Withdrawals`) |
| Child | 14/400 `#41525F`, label indented to 34px, `--rule-light` rule, `#FAFCFD` on hover |

**Accounts** → Net worth · Assets (Cash, Taxable investments, Real estate) ·
Liabilities (Mortgage).

**Cash Flow** → Income (Salary, RSU) · Expenses (Taxes, Living, Children,
Housing, Down payment) · Withdrawals · Net cash flow.

**Events** → a Gantt: a 26px code chip and label in the left column, pill bars
across a tick-ruled track carrying an inline summary
(`2031 · $1.15M, 20% down, 6.25% / 30yr`). The `endOfPlan` marker is a solid
navy pill right-aligned to its year.

### 7.6 Implementation notes

- **Self-host DM Sans** (`@fontsource/dm-sans`). The design links Google Fonts;
  a remote font is a render-blocking third-party dependency and is blocked
  outright on some networks — including this project's build sandbox.
- The design ships as inline styles. Port it to a **real stylesheet** with these
  tokens as CSS custom properties, so the values are tunable in one place.
- Pin collision handling and the year-band hit test are the only genuinely
  fiddly parts of the chart. Both are why this is hand-rolled SVG rather than a
  chart library.


## 8. Testing

A financial engine needs a different test strategy than a CRUD app.

1. **Golden-file tests.** A dozen realistic plans, each with a checked-in
   `expected.json` of the full `PlanResult`. Any diff must be explained in the
   PR. This is the single highest-value test type here — it catches ordering
   regressions that unit tests miss.
2. **Invariants (property tests).** For any randomly generated plan:
   - `netWorth === assets − liabilities` in every year
   - `close === open + growth + contributions − withdrawals ± principal` per account
   - no account balance goes negative unless it is a liability
   - `sum(withdrawal.net) ≈ shortfall` when the waterfall did not run dry
3. **Event-module unit tests.** Each `compileEvent` in isolation. Mortgage
   amortization against a known table (a $920k / 6.5% / 30yr loan has a
   **$5,815.03** monthly payment — pin exactly this).
4. **Cross-check against a spreadsheet.** Build one plan in Excel by hand and
   assert the engine matches to the cent. Do this once, early. It will find a
   real bug.

---

## 9. Delivery plan

### Phase 1 — Engine + UI, no backend *(the milestone that matters)*

Everything runs in the browser; the plan persists to `localStorage` with JSON
import/export. Ships to GitHub Pages like Northstar does today.

1. `packages/engine` — types, `runPlan`, growth, amortization, the two
   waterfalls, tax gross-up. Golden tests from day one.
2. Event modules, in this order: `income` → `annualExpense` → `buyAHome` →
   `newJob` → `retirement` → the rest. `buyAHome` third, deliberately: it is the
   one that exercises synthetic accounts, and if the architecture is wrong you
   want to find out in week one, not week six.
3. The Industry design system + the Fig. 01 chart.
4. Three tabs.
5. Event drawer with Zod-driven forms.
6. Assumptions panel + drag-orderable priority rules.
7. Multiple scenarios + A/B comparison (`compareToScenarioExternalId`).

### Phase 2 — Backend

- Postgres. Store the plan as **JSONB + a version integer**, not normalized
  tables. The plan is a document, always read and written whole; normalizing it
  buys nothing and costs a join per render. Revisit only if we need per-field
  history.
- tRPC: `plan.list`, `plan.get`, `plan.save`, `plan.duplicate`, `plan.delete`.
- Auth.js. Server-side `runPlan` for shareable read-only links and PDF export.

### Phase 3 — Real data

- Plaid for balances (start read-only: balances and account types only, not
  transactions — far less scope, most of the value).
- `useActualsAsBaseline`: derive `baselineIncome` / `baselineExpenses` from
  transaction history.
- The `linked*` fields become meaningful: show the real rate next to the
  override.
- Household sharing → this is when you adopt Monarch's per-category
  `expectedVersion` concurrency.

---

## 10. Decisions and risks

| Decision | Call | Why |
|---|---|---|
| Annual vs monthly steps | **Annual**, monthly only inside mortgage amortization | 12× cheaper; precision unused elsewhere |
| Nominal vs real | **Nominal always**, deflate at render | one source of truth; avoids double-deflation |
| Growth timing | **Opening balance** (contributions earn from Y+1) | conservative and explainable; half-year later if asked |
| Tax model | **Flat effective rate per account** | matches Monarch; avoids the bracket fixed-point |
| Chart library | **Hand-rolled SVG** | pins, dodging, corner marks, year-band hover |
| Plan storage | **JSONB document** | read/written whole; normalization buys nothing |
| API | **tRPC** | typed end to end, no codegen |

**Risks worth naming:**

- **Double-counting the mortgage.** Payment handled by the debt step *and*
  emitted as an expense. Guard with an invariant test.
- **Ordering drift.** §4.3 is the contract. Encode it as a comment above the
  loop and a golden test, or it will rot.
- **Silent shortfalls.** A plan that fails must say so, not quietly go negative.
- **Provenance retrofit.** If `LineItem.sourceEventId` isn't there from the
  start, the Cash Flow tab cannot be built without rewriting the engine.
- **Not legal/financial advice.** If this is ever shown to anyone else, it needs
  a disclaimer and an assumptions page. Projections are arithmetic on guesses.

---

## Appendix A — Reference GraphQL (verbatim from the bundle)

```graphql
fragment ForecastEventFields on ForecastEventType {
  externalId  eventKind  name  startYear
  isIncluded  icon  color  isHidden  isRequired  config
}

fragment ForecastPriorityRuleFields on ForecastPriorityRuleType {
  accountExternalId  componentKind  ruleType  order  config
}

fragment ForecastParticipantFields on ForecastParticipantType {
  user { id displayName birthday profilePictureUrl }
  lifeExpectancy  isIncluded
}

fragment ForecastCategoryVersionsAllFields on ForecastCategoryVersionsType {
  settingsVersion  eventsVersion  accountsVersion
  participantsVersion  priorityRulesVersion
}

query Web_ForecastScenario($externalId: ID) {
  forecastScenario(externalId: $externalId) { ...ForecastScenarioFields }
}
```

Mutations observed: `initializeForecast`, `createForecastScenario`,
`updateForecastScenario`, `duplicateForecastScenario`,
`deleteForecastScenario`, `updateForecastScenarioOrder`,
`updateForecastScenarioComparison`, `replaceForecastEvents`,
`saveForecastAccounts`, `deleteForecastAccount`, `saveForecastPriorityRules`,
`saveForecastParticipantOverrides`, `saveForecastScenarioKpis`,
`resetForecastData`.

The mutation split is itself informative: events are **replaced** wholesale
(`replaceForecastEvents`) while accounts and rules are **saved** incrementally
with an `expectedVersion`. Events are a small list, so replace-all is simpler
and atomic; accounts carry more state and more contention.
