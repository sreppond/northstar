# Redesign v4 — from "a forecast with events" to a household decision tool

Plan, Oct 2026. Nothing here is built yet. v3 (docs/REDESIGN-V3.md) fixed the
*chrome* — page frame, stat strips, rail. v4 fixes the *model and the
questions*. The app is accurate but it answers "what is my net worth in
2046?", while the household is asking:

1. **When can we buy a home, and how much can we spend?** And if we spend
   too much, how house-poor will we be?
2. **What is our monthly budget once we're married?** We'll have a shared
   bills pool plus an equal personal allowance for each of us ($4K/mo). How
   do rent and other fixed costs change what's left?
3. **What do kids cost at each age, and can Sarah take time off?** We want to
   see what each person costs: Spencer, Sarah, Shared, Kid 1, Kid 2.
4. **What is the variable annuity worth over time?** What is the largest SEPP
   I could start in a given year, and how does the SEPP draw the balance down
   while the account keeps growing?
5. **What does retirement look like?** Which accounts pay for each year,
   including the annuity, and what is the retirement budget?

Today, answering any one of these means bouncing between Events → Cash
Flow → Accounts → House. The goal of v4 is that **each question has one page
that holds the answer, the levers that change it, and the knock-on effects
(monthly budget, savings, net worth) all in one place.**

---

## 0. What's wrong today, concretely

From reading the code and the House Forecast plan in the desktop app's latest
backup:

| # | Problem | Where it comes from |
|---|---|---|
| 1 | **Horizon can't be found.** It is an "End of plan" *event* (2046), not a setting. Retirement is set for 2058, after the plan ends, so the Retirement page has no data to show. | `endOfPlan` event; `settings.projectionYears` is unused once that event exists |
| 2 | **Housing is counted twice.** Rent is hidden inside the $80K `baselineExpenses`. Buying a home adds the mortgage and carrying costs but never stops the rent. | `buyAHome` has no idea what housing it replaces |
| 3 | **Sarah isn't a person in the model.** "Sarah's Income", "Sarah Part-Time" and "Sarah Expenses" are three loose events. No income is tied to the person earning it. All are `isEarned: false`, so retirement and leave never stop them. | `income` events have no `participantId`; earned is a hidden flag |
| 4 | **There's no budget, just one number.** All spending is `baselineExpenses` + events. Shared vs personal, fixed vs discretionary, and per-kid costs don't exist. | `PlanSettings.baselineExpenses` |
| 5 | **Kids are flat costs.** $30K/yr from birth to 18, with no age stages. Childcare and Sarah's time at home are disconnected even though they offset each other. | `haveAKid` config |
| 6 | **Events clutter the view.** A home is one decision but shows up as 3–5 unrelated lines. 11 events sit in a flat list next to the required "End of plan" row. | Line items carry `sourceEventId`, but no view groups by it |
| 7 | **"Where 2026's money went" is the wrong chart.** A Sankey for a single year doesn't answer *when* or *how much*. | `CashFlowSankey` |
| 8 | **The Annuity tab doesn't answer the SEPP question.** The SEPP tool only considers `taxDeferredInvestment` accounts, so the variable annuity is excluded. It's a standalone calculator that never feeds the plan. v2's notes say v1's life-expectancy table is wrong at ages 41/43/47/49. | `SeppTool`, `sepp.ts` |
| 9 | **House doesn't answer "when / how much".** It shows the arc of one price you already chose, with no affordability and no house-poor check. | `HouseForecastView` |
| 10 | **Net worth sits below the balance sheet** on Accounts. | `AccountsPage` |

What the current plan would show under v4 (rough hand math, nominal dollars):
the planned **$2.5M home in 2034** needs about **$550K** at closing and
about **$15.3K/mo** to own: $10.7K principal & interest, $2.3K property tax,
$2.1K upkeep and $0.2K insurance. That's about **44% of projected
take-home**, and it assumes the RI income really does grow 10% a year from
$300K. Most people would call that house-poor. v4's job is to show that in one
sentence on the Home page and say what price would be comfortable.

---

## 1. Principles (apply to every page)

1. **Answer first.** Every page opens with one computed sentence that
   answers its question. For example: *"You can comfortably buy a $1.4M home
   in 2031."* Then a stat strip, then the hero chart, then the levers, then
   the detail table. Assumptions stay one click away, never in front.
2. **Monthly and today's dollars for anything you budget.** Flows (income,
   spending, allowances, SEPP payments) default to **per month, in today's
   dollars**, because that's how a household thinks. Balances default to
   today's dollars with a nominal toggle. One global control in the header:
   `/mo · /yr` and `Today's $ · Future $`. Every figure's unit is labelled.
3. **Every decision shows its ripple.** A shared **Impact strip** sits under
   any lever:
   `Left to save /mo  Δ  ·  Savings rate  Δ  ·  Home-ready year  Δ  ·  Retire-at age  Δ  ·  Net worth at 60  Δ`.
   This is what removes the tab-hopping.
4. **Preview, then keep.** Moving a lever runs a *draft* copy of the plan
   (the engine is pure and fast enough to re-run on every drag). The page
   shows the draft against the current plan. **Keep** commits the draft,
   **Save as scenario** forks it into Compare, **Reset** throws it away. The
   existing What-If fork machinery already supports this.
5. **One life change, one row.** Anything one decision creates (a home: down
   payment, mortgage, tax, insurance, upkeep, HOA, rent ending) is shown as a
   single grouped row with an expand caret. The engine already tags every
   `LineItem` with `sourceEventId`, so this is a presentation change.
6. **People are first-class.** Every income, budget line and account has an
   owner: Spencer, Sarah, Shared, Kid 1 or Kid 2. That's what makes the
   per-person breakdown possible.
7. **Anchors, not dates.** Budget lines and phases can start or end *at
   something*: "Rent: until Buy a home", "Daycare: Kid 1 age 0–4", "Sarah's
   allowance: from Wedding". Move the wedding or the purchase and everything
   anchored to it moves too. This is what keeps a 20-year plan from rotting.
8. **Plan checks, not silent wrongness.** The app flags modelling mistakes
   it can detect: an event past the horizon, rent continuing after a
   purchase, a 20% return assumption, annuity basis above the contract's
   purchase payments, income with no owner.

---

## 2. Information architecture

```
Northstar
[ House Forecast ▾ ]   2026 → 2091 · through Sarah's 95   ← horizon lives here, clickable
[ ⌕ Search or jump…  ⌘K ]

Overview                 "Are we on track?" — answers to the five questions

HOUSEHOLD
  Budget        (new)    monthly budget: shared pool, allowances, kids, what's left
  Family        (new)    people, careers & leave, kids by age stage
  Accounts               net worth trajectory ON TOP, then balance sheet
  Timeline               (Events renamed) lanes by person/domain, grouped life changes

DECISIONS
  Home                   when, how much, house-poor check
  Retirement             when, drawdown by source, retirement budget
  Annuity & SEPP         value over time, SEPP by start year, drawdown table

ANALYSIS
  Compare                scenarios side-by-side (e.g. "Sarah home 3 yrs" vs "Sarah full-time")
  Reports                year-by-year cash flow table (absorbs the old Cash Flow page) + export
  Progress               actual vs plan
```

**What moves where**

- **Cash Flow page → retired.** Its stat strip and per-year view become the
  Budget page's year scrubber. Its annual table moves to Reports. The Sankey
  is removed (see Budget).
- **Events → Timeline.** Same data, grouped into lanes, and "End of plan" is
  removed from it.
- **Goals** stop being a separate abstraction. The Home goal *is* the Home
  page's affordability. The Retirement goal *is* the Retirement page.
  Earmarking accounts stays as an advanced setting on Accounts.

### How the pages connect

```
           Family ──(people, careers, kids by age)──┐
                                                    ▼
 Budget ◀──── monthly lines by owner ────────▶  ENGINE (runPlan, annual)
   ▲                                                │
   │ rent ends / housing slot                       ├─▶ Accounts (balances by year)
 Home ── purchase year, price, financing ───────────┤
 Annuity & SEPP ── SEPP election (a real income) ───┤
 Retirement ── retire age, retirement budget ───────┘
                                                    │
 Overview ◀── reads every page's "answer" ──────────┘
```

Every decision page writes to the same plan and reads the same result. The
**Impact strip** on each page is the same component with the same five
deltas, so a change on Family shows its effect on home-ready year without
leaving Family.

---

## 3. The global frame

**Horizon (fixes #1).** The plan switcher's subtitle reads
`2026 → 2091 · through Sarah's 95`. Clicking it opens a small popover:

```
Plan through   ( ) Year [2091]
               (•) Until the younger adult turns [95]   ← default
               Preset: Retirement + 30 · Age 90 · Age 95 · Age 100
Chart window   [ 10 yrs | 20 yrs | Through retirement | All ]   ← zoom only, doesn't change the math
```

- *Horizon* (how far the engine simulates) and *view window* (how much a
  chart shows) are kept separate. That separation was the root confusion.
- The default horizon is life expectancy, so retirement is always in range.
  Charts on Home and Budget default to a 20-year window.
- If an event falls after the horizon, a plan check offers a one-click fix:
  *"Retirement (2058) is after your plan ends (2046) — extend to 2091."*
- `endOfPlan` becomes derived and hidden. The setting is stored on
  `PlanSettings.horizon`.

**Global toggles** in the page header, right side:
`/mo · /yr` and `Today's $ · Future $`. Both persist per plan.

**Impact strip** component. Five cells, each showing *current → draft* with
a delta tag. It is hidden when there's no draft. It sits directly under any
lever group.

---

## 4. Page by page

Numbers in the wireframes below are placeholders to show layout, apart from
the $2.5M home figures, which come from §0's hand math.

### 4.1 Overview — "Are we on track?"

```
Overview                                     House Forecast · as of Oct 12, 2026 · Today's $
"On track to buy in 2033 and retire at 54. 2027's budget leaves $3.1K/mo after bills and allowances."

┌ Home ────────────┐ ┌ Monthly budget ──┐ ┌ Retirement ──────┐ ┌ Annuity & SEPP ──┐
│ $1.4M comfortable│ │ $3.1K left /mo   │ │ Retire at 54     │ │ $9.8K/yr max SEPP│
│ in 2031          │ │ ▇▇▇▇▇▅▅▃▃░ bar   │ │ lasts to 95 ✓    │ │ if started 2027  │
│ Planned $2.5M ⚠  │ │ 2027 · 22% saved │ │ sparkline        │ │ sparkline        │
│ house-poor (44%) │ │                  │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘

Net worth trajectory   [chart: one marker per life change, clustered; TODAY line; window toggle]

┌ Plan checks (3) ─────────────────────┐ ┌ Coming up ─────────────────────┐
│ ⚠ Rent continues after home purchase │ │ 2027 Wedding · Sarah joins     │
│ ⚠ Annuity basis $120K > $66.7K paid  │ │ 2028 Kid 1 · Sarah leave starts│
│ ⓘ 20% return on Roth & annuity       │ │ 2033 Buy a home                │
└──────────────────────────────────────┘ └────────────────────────────────┘
```

- **Answer cards** each show a key number, a status (comfortable / stretch /
  house-poor, on track / at risk) and a tiny chart. Clicking one opens its
  page.
- **Net-worth chart markers** are one per *life change*, not per cash flow.
  Markers in nearby years cluster into "3 changes ▾".
- **Plan checks** replace the warnings array, which today is only visible in
  code. Each check has a *Fix* or *Review* action.

### 4.2 Budget (new) — "What's our monthly budget, now and later?"

The heart of the app. It answers question 2 and is the shared language for
every other page.

```
Budget                          [ ◀ 2027 ▶ ]  Life stage: Newlyweds        /mo · Today's $
"In 2027 you bring home $21.4K/mo. Bills take $9.2K, allowances $8K, leaving $4.2K to save (20%)."

TAKE-HOME $21.4K │ SHARED BILLS $9.2K │ ALLOWANCES $8.0K │ KIDS $0 │ LEFT TO SAVE $4.2K · 20%

Where each month goes (one 100% bar)
[■■■■ Shared fixed ■■ Shared flex ■■■ Spencer ■■■ Sarah ░░ Saved               ]

Budget by life stage (stacked columns, one per year, /mo; stage bands on top)
 Newlyweds │ Baby │ Two kids │ Homeowners ............│ Kids in school │ College │ Empty nest
 ▆▆ ▇▇ ▇▇ ███ ███ ███ ... columns stacked by owner; a line for take-home; the gap = savings
 (click a column → the table below shows that year)

┌ Shared pool ─────────────────────────── $9.2K ┐ ┌ Try a change ─────────────────────┐
│ Housing   Rent                 $4,200  until Buy a home │ Rent        [====|====] $4,200   │
│ Food      Groceries            $1,400                   │ Allowance   [==|======] $4,000 ea│
│ Utilities                      $  450                   │   ☑ same for both                │
│ Insurance Health, auto         $  900                   │ Fixed bills  [ +/− %  ]          │
│ Transport Car, gas             $  800                   │                                  │
│ …                                                       │ IMPACT STRIP (5 deltas)          │
├ Spencer ──────────────────────── $4.0K ┤                 │ [Keep] [Save as scenario] [Reset]│
│ Personal allowance             $4,000  from Wedding     └──────────────────────────────────┘
├ Sarah ────────────────────────── $4.0K ┤
│ Personal allowance             $4,000  from Wedding
├ Kid 1 (born 2028) ────────────── $0 in 2027 · $3.1K in 2029 ┤
│ (lines come from the age-stage template — edit on Family)
└ Savings & goals ─────────────── $4.2K ┘
  401(k) payroll $833 · Home fund $2,000 · Brokerage (rest) $1,367
```

- **The two-account flow the household actually uses:** income lands in the
  shared pool, bills come out of it, each adult gets an equal allowance
  (one number, "same for both" linked by default), and what's left is
  saved. The 100% bar mirrors that order left to right.
- **Every line** has an owner (Shared / Spencer / Sarah / Kid N), a category,
  **Fixed** or **Flexible** (non-discretionary vs discretionary), a monthly
  amount, start/end anchors, and a growth rule (inflation or custom). Lines
  are edited inline.
- **Life stage bands** are computed from anchors (wedding, births, purchase,
  kids' ages, retirement), so the stacked-columns chart reads as a story.
- **Try a change** gives levers for the questions asked: rent, allowance,
  and a percent nudge on fixed bills. They produce a preview plus the
  Impact strip, so *"if rent is $5K instead of $4.2K, the home-ready year
  moves 2031 → 2032"* is visible right there.
- The **Sankey is removed.** The 100% bar plus the life-stage columns answer
  "where does it go" and "how does it change" with less ink.
- **Annual view** (`/yr`) and a **Reports link** cover anyone who wants the
  full ledger.

### 4.3 Family (new) — "Who's in the household, and can Sarah take time off?"

```
Family
"Sarah at home 2028–2030 costs $3.4K/mo net after childcare savings — home moves 2031 → 2032."

Members   (Spencer · 30)  (Sarah · 30)  (Kid 1 · born 2028)  (Kid 2 · born 2030)  [+ Add]

Careers (one track per adult, drag phase edges)
Spencer │ Amazon $250K ─────┤ RI $300K, +x%/yr ─────────────────────────────────┤ Retire 2050
Sarah   │ ░ │ Full-time $100K │▒ Leave 0% ▒│ Part-time 60% ─────────│ Full-time ──┤ Retire
        2026  2027 (wedding)  2028        2031                      2036
        Each phase: full-time · part-time (x%) · leave (x% paid) · not working

Kids — cost by age (stacked area per kid, /mo, today's $)
  Infant 0–1 │ Toddler 1–4 │ School 5–12 │ Teen 13–17 │ College 18–21
  ▅▅ childcare dominates ▅▅ │ drops at 5 ─ │ activities ─ │ tuition spike
  Lines per stage: Childcare · Food & clothing · Healthcare · Activities · School · 529 savings
  Template: [Daycare ▾] [Public school ▾] [In-state college ▾]   (editable per kid)

┌ Decision: Sarah steps back ─────────────────────────────────────────┐
│ From [2028] for [3] years at [0]% pay, then part-time at [60]%      │
│ Childcare while home: [ replaced by parent ▾ ]                      │
│ Monthly:  − $5.8K take-home   + $2.4K childcare saved  = − $3.4K   │
│ IMPACT STRIP  ·  [Keep] [Save as scenario]                          │
└─────────────────────────────────────────────────────────────────────┘
```

- **Careers replace the loose income events.** `job` grows a per-person
  `participantId` and a **phase schedule** (full / part-time % / leave % /
  off). Earned is implicit, so retirement and leave behave correctly. Comp
  steps and RSUs stay. "Amazon" → "RI" becomes two phases of Spencer's
  career instead of two unrelated incomes.
- **Kids become members** (`role: 'child'`) with a birth year. Their costs
  come from a **stage template** that produces anchored budget lines
  ("Childcare: age 0–4"). They show on the Budget page under that kid. The
  defaults are published US estimates by stage, labelled as such and fully
  editable.
- **The caregiving decision** is the one Family has to make obvious: lost
  take-home, minus childcare that's no longer needed, gives the net
  monthly cost, followed by the Impact strip. Childcare lines link to the
  career phase, so "parent at home" zeroes them automatically.
- **529 savings** is a kid line that's a *contribution* (into a 529-type
  account), not an expense, so it shows as saving, not spending.

### 4.4 Accounts — "What do we own?"

The order changes, as requested:

1. Stat strip (Net worth · Assets · Liabilities · Liquid).
2. **Net worth trajectory**, full width. Stacked by bucket (Cash · Taxable ·
   Retirement · Annuity · Home equity), with a TODAY line and the window
   toggle.
3. Account mix bar.
4. Balance sheet. Each account shows its **purpose** chip (Emergency · Home
   fund · Retirement · Kid 1 529) and **owner**, grouped by owner with
   subtotals.

### 4.5 Timeline (was Events) — "What changes, and when?"

```
Timeline                                                       [+ Add life change]
           2026   2028   2030   2032   2034   …   2050   2058
Spencer    ━━ Amazon ━┫━━━━━━━━━━━━ RI ━━━━━━━━━━━━━━━━━━━━━━━━┫ Retire
Sarah          ┣ FT ┫▒leave▒┣━━ part-time ━━━━━━━━━━━━━━━━━━━━┫ Retire
Family         ◆ Wedding  ◆ Kid 1   ◆ Kid 2
Home       ━━ Renting ━━━━━━━━━━━━━━━━━┫◆ Buy $2.5M ━━━ owning ━━━━━━━━━━━━━━
Money                                               ◆ Start SEPP (annuity)
```

- **Lanes** for each adult, Family, Home and Money. Each life change is one
  row or diamond. Clicking it opens its editor, where the sub-flows sit
  under an expand caret: *Buy a home → down payment & closing $550K ·
  mortgage P&I $10.7K/mo · property tax $2.3K/mo · upkeep $2.1K/mo ·
  insurance $0.2K/mo · rent ends ($4.2K/mo)*.
- **"Add life change"** offers templates written in household terms: Get
  married · Have a child · Change jobs · Take leave / go part-time · Buy a
  home · Move / change rent · Retire · Start SEPP · One-time expense ·
  Windfall. Each template asks only for what's needed and fills the rest
  from defaults.
- "End of plan" no longer appears. The horizon lives in the header (§3).

### 4.6 Home — "When can we buy, how much, and will we be house-poor?"

```
Home
"Comfortable: $1.4M in 2031. Your planned $2.5M in 2034 is house-poor — housing would take 44% of take-home."

AFFORDABILITY MAP  (x = purchase year, y = home price; today's $)
 $3.0M ┤                                      ░░░ house-poor (>35% of take-home)
 $2.5M ┤                         ● planned (2034)  ← drag to move year/price
 $2.0M ┤               ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ stretch (25–35%)
 $1.4M ┤         ●recommended ███████████████ comfortable (≤25%)
       └──2027──2029──2031──2033──2035──2037──
 Boundary of each zone = the max price that keeps every rule below true that year.

Levers: Price [$2.5M] · Year [2034] · Down [20%] · Rate [6.25%] · Term [30] · Comfort line [25% ▾]
IMPACT STRIP · [Keep] [Save as scenario]

┌ Monthly cost to own vs rent ──────────┐ ┌ House-poor check (year after purchase) ────────┐
│ Rent today    ████ $4.2K              │ │ Housing / take-home    44%   ✗ ≤ 35%          │
│ Own (2034)    ██████████████ $15.3K   │ │ Savings rate           6%    ✗ ≥ 15%          │
│   P&I 10.7 · tax 2.3 · upkeep 2.1 ·   │ │ Cash after closing     2.1 mo ✗ ≥ 6 months    │
│   insurance 0.2 · HOA 0           │ │ Allowances covered     ✓                       │
│ Δ +$11.1K/mo                          │ │ Retire-at age          54 → 58  ⚠              │
└───────────────────────────────────────┘ └─────────────────────────────────────────────────┘

┌ Your budget the year after you buy (Budget's 100% bar, before vs after) ────────────┐
│ Before [■ housing 20% ■ bills ■ allowances ■ kids ░ saved 22%]                        │
│ After  [■■■■■ housing 44% ■ bills ■ allowances ■ kids ░ 6%]                           │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌ Price ladder ─────────────────────────────────────────────────────────────────────────┐
│ Price   Ready by  Cash at close  Own /mo  Housing %  Savings rate  Retire at  NW at 60 │
│ $1.0M   2029      $230K          $6.4K    19% ✓      24%           53         $X       │
│ $1.5M   2031      $345K          $9.3K    26% ~      18%           54         $X       │
│ $2.0M   2033      $460K          $12.4K   35% ~      11%           56         $X       │
│ $2.5M   2035      $575K          $15.3K   44% ✗      6%            58         $X       │
└────────────────────────────────────────────────────────────────────────────────────────┘

Cash cushion (liquid balance with vs without the purchase; dashed 6-month-reserve line)
Ownership arc (value / mortgage / equity) — kept from v3, now collapsed lower on the page
```

- **The affordability map** is the hero. It answers *when* (x) and *how
  much* (y) at once. Zone boundaries come from a new engine solver
  (`affordability.ts`). For each candidate year it bisects on price, re-running
  the plan with a modified `buyAHome`, and finds the highest price that
  satisfies **all** of:
  1. Cash available at closing (down payment + closing costs) from
     home-eligible accounts (cash, taxable, *not* retirement or annuity),
     while leaving a reserve of N months of expenses.
  2. Housing cost (P&I + tax + insurance + upkeep + HOA) ≤ the zone's share
     of take-home.
  3. No unfunded shortfall in any later year.
  4. Savings rate stays ≥ a floor (stretch zone: ≥ 5%; comfortable: ≥ 15%).
  This takes about 10 years × 3 zones × ~20 bisection steps of runPlan, which
  is fast enough to run in a web worker and cache by plan hash.
- **House-poor check**: four or five rules, each with its threshold shown
  and adjustable in Assumptions. No hidden scoring.
- **Rent ends at purchase**, anchored to the housing line on Budget (fixes
  #2). The monthly comparison is honest: own vs the rent it replaces.
- **Price ladder** is the "evaluate that decision" table: the same plan at
  four prices, every column a consequence the household cares about.
- **Multiple homes** (starter home → sell → upgrade) remain supported: one
  map, one dot per purchase.

### 4.7 Retirement — "When can we stop, and what pays for it?"

```
Retirement
"You can both retire at 54 (2050) and spend $14K/mo in today's dollars through Sarah's 95."

RETIRE AT 54 │ SPEND $14K/mo │ LASTS TO 95+ ✓ │ BRIDGE TO 60: 6 yrs funded by taxable + SEPP

Where each year's spending comes from (stacked area, /mo, today's $; line = spending need)
  ▇ paychecks ▇ SEPP (annuity) ▇ taxable draws ▇ 401(k)/IRA ▇ Roth ▇ Social Security
  2046 ───────── 2050 retire ─── 2056 age 60 (penalty-free) ─── 2063 SS ─── 2091

Balances by account (stacked area) — shows the drawdown order working

┌ Retirement budget (first full year) ──┐ ┌ Levers ───────────────────────────┐
│ Same 100% bar as Budget:              │ │ Retire at   [54]  (each adult)     │
│ housing (mortgage until 2064) · health│ │ Spending    [$14K/mo]  or [-20%]  │
│ (pre-Medicare line until 65) · travel │ │ SS claim age [67]                 │
│ · allowances · kids' college (if any) │ │ Return       [6.5%]               │
└───────────────────────────────────────┘ │ IMPACT STRIP                       │
                                          └────────────────────────────────────┘
The bridge: ages 54–60 → which accounts, how much a year, and why
  (penalty-free sources first; the SEPP from Annuity & SEPP if elected)

Year-by-year drawdown table
  Year · Ages · Spending · Paychecks · SEPP · Taxable · 401(k) · Roth · SS · Taxes · End balances
```

- **The income-stack chart** is the "drawdown" answer: spending need as a
  line, filled by colour-coded sources underneath. A shortfall year shows as
  a visible gap.
- **The annuity plays a named role.** If a SEPP is elected (Annuity & SEPP
  page), it appears as its own band. If not, the bridge card suggests it:
  *"A SEPP from the annuity started at 54 would cover $9.8K/yr of the
  bridge."*
- **The retirement budget** reuses Budget lines with retirement anchors.
  Allowances and housing carry over, kids' lines have ended, and a
  pre-Medicare healthcare template line is added. So "what does our budget
  look like" means the same thing in retirement as it does today.
- Per-adult retirement ages (Spencer and Sarah may differ).

### 4.8 Annuity & SEPP — "What's it worth, and what SEPP could I take, starting when?"

Built for the actual contract: Nationwide Monument Advisor, **nonqualified**
(§72(q), LIFO: gain comes out first and is taxable, basis comes out later
and is tax-free), issued Nov 2024, $240/yr flat fee + 0.35%, no surrender
charge.

```
Annuity & SEPP          Monument Advisor · Nonqualified · Issued 2024 · Basis $66.7K
"Today it's worth $150K. Started in 2027, the largest SEPP is $9.8K/yr ($817/mo), locked until 2056 (age 60)."

VALUE TODAY $150K │ AT 60 (NO SEPP) $X │ MAX SEPP IF STARTED [2027 ▾] $9.8K/yr │ LOCKED UNTIL 2056 │ AT 60 WITH SEPP $Y

1) Max SEPP by start year  (bar per start year; click to select)
   $/yr ┤                                        ▆ █
        ┤                         ▅ ▅ ▆ ▆ ▇ ▇ █ █ █
        ┤   ▃ ▃ ▄ ▄ ▄ ▅ ▅ ▅ ▅ ▅ ▅
        └─2027──────2035──────2045──────2055─
   Method: [Amortization (max) | Annuitization | RMD (min)]   SEPP rate [5.0%] (≤ IRS cap — verify monthly)
   Payment: [ slider from RMD-min … amortization-max ]  ← choose less than max via the rate

2) Balance with vs without SEPP (selected start year)
   ── no SEPP (dashed)   ━━ with SEPP (solid)   ▮ annual SEPP payments (bars)
   ░ basis remaining (area under the line)   │ start   │ lock-in ends 2056   │ basis reached
   → shows directly whether growth outruns the payment (balance still rising) or not

3) Year-by-year table
   Year · Age · Start balance · Growth · Fees · SEPP payment · Taxable (gain) · Tax · After-tax · End balance · Basis left
   (lock-in years shaded; "basis reached" year marked; totals row)

Fees over time: $240 flat + 0.35% → $/yr and % of value (flat fee's drag shrinks as the contract grows)

[ Add this SEPP to the plan ]  → becomes a real income line: Budget, Retirement and net worth all see it
⚠ A SEPP started at 31 is a ~29-year commitment. Changing it voids the exception retroactively (10% + interest on every payment so far).
```

- **Engine:** add a `seppElection` to the account (start year, method,
  rate, or "max"). The year loop runs it as a **forced withdrawal before the
  waterfall**, like RMDs: income line, LIFO/pro-rata tax via the existing
  `costBasisTax`, no penalty, and no surrender charge (there is none
  anyway). The waterfall can't touch the account while the SEPP is locked.
- **Include `variableAnnuity`** as a SEPP candidate. §72(q) mirrors §72(t),
  and the existing `sepp.ts` doc already says so.
- **Port v2's verified IRS tables**: Single Life Table, Uniform Lifetime and
  mortality. v1's table has wrong values at ages 41/43/47/49. Also port the
  cross-check test that re-derives one table from the other.
- **Plan checks for this contract:** basis entered ($120K) is above the
  contract's purchase payments ($66,741.34). A growth assumption of 20%/yr
  is flagged as unrealistic for a 30-year projection.

### 4.9 Compare, Reports, Progress

- **Compare:** scenarios are created by **Save as scenario** from any
  page's preview, so they always have a story ("Sarah home 3 yrs", "$1.8M
  in 2032"). The comparison view shows the five Impact strip metrics
  side-by-side, plus overlaid net worth and the Budget 100% bar for a chosen
  year.
- **Reports:** absorbs Cash Flow's annual table, with rows grouped by life
  change (expandable) and by owner. CSV/print export stays.
- **Progress:** unchanged in substance.

---

## 5. Model and engine changes

The engine stays pure, annual and nominal. Monthly and today's-dollar
figures are presentation (`/12`, deflate).

| Change | Shape | Notes |
|---|---|---|
| **Horizon setting** | `settings.horizon: { mode: 'year', year } \| { mode: 'age', participantId?, age }` | `endOfPlan` becomes derived and hidden; migration reads the existing event |
| **Members** | `Participant.role: 'adult' \| 'child'` | `haveAKid` events migrate to child members + stage-template lines |
| **Budget lines** | `BudgetLine { id, name, ownerId: participantId \| 'shared', category, essential: boolean, kind: 'expense' \| 'allowance' \| 'saving', monthly, start/end: Anchor, growth }` | Compiles to cash flows. Replaces `baselineExpenses` (migrated to one "Other shared spending" line, plus a prompt to split it) |
| **Anchors** | `Anchor = { year } \| { eventId, edge: 'start' \| 'end' } \| { participantId, age }` | Resolved at compile time. Lets rent end at purchase and daycare follow a kid's age |
| **Allowances** | `settings.household.allowanceMonthly`, `equalAllowances: true` | Generates one allowance line per adult from the wedding anchor. Assumed spent (optional "% saved" later) |
| **Careers** | `job.participantId`, `job.phases: [{ from: Anchor, mode: 'full' \| 'part' \| 'leave' \| 'off', percent }]` | Replaces `careerBreak` and the "part-time income" workaround. Always earned |
| **Line provenance** | `LineItem.ownerId`, `LineItem.groupId` (= life change), `LineItem.essential` | Drives per-person breakdowns and grouped rows |
| **Home ↔ housing** | `buyAHome.replacesLineId` (default: the Shared Housing line) | Rent ends at purchase. Carrying cost is emitted as separate lines (tax, insurance, upkeep, HOA) |
| **Affordability** | `affordability.ts`: `maxPrice(plan, year, rules)`, `affordabilityCurve(plan, years, zones)` | Bisection over `runPlan`. Runs in a worker and is memoised by plan hash |
| **SEPP election** | `Account.seppElection { startYear, method, ratePercent \| 'max' }` | Forced withdrawal before the waterfall. Annuity accounts included. v2 tables ported |
| **Kid templates** | `kidStageTemplate(preset)` → anchored BudgetLines | Childcare lines link to a parent's `leave`/`off` phase |
| **Plan checks** | `checks.ts`: pure `(plan, result) → Check[]` | Each check carries severity, message and an optional fix (a plan patch) |

**Migration of the current House Forecast plan** (one-time, reversible via
undo, with a summary shown):

- Amazon (2026–27) + RI Income (2028+) → **Spencer's career**, two phases.
- Sarah's Income + Sarah Part-Time → **Sarah's career**: full-time 2027,
  part-time 60% from 2028.
- "Sarah Expenses $100K" → shown in a review step:
  *"Is this Sarah's personal spending, her share of shared bills, or both?"*
  The answer creates allowance and/or shared lines.
- `baselineExpenses $80K` → "Other shared spending" + a prompt: *"Split out
  rent so it can end when you buy."*
- First/Second child → Kid 1 / Kid 2 members with the default stage template,
  keeping today's $30K/$25K as overrides until edited.
- End of plan 2046 → horizon "until the younger adult turns 95".
  Retirement 2058 is then in range.
- Annuity basis and growth are **flagged, not changed**.

---

## 6. Visual system additions

All within docs/DESIGN-DIRECTION.md: colour is data, chrome stays neutral.

- **Owner palette** (data): Shared · Spencer · Sarah · Kid 1 · Kid 2. These
  are categorical hues validated with the dataviz skill's checker in light
  and dark. Owners also get initials avatars so colour is never the only cue.
- **Zone palette** (data): comfortable / stretch / house-poor, reusing the
  existing in/out tints plus one neutral. Status is always paired with a
  ✓ / ~ / ✗ glyph.
- **New shared components:** `ImpactStrip`, `BudgetBar` (100% bar),
  `StageColumns` (stacked columns with stage bands), `LaneTimeline`,
  `AffordabilityMap`, `SourceStack` (stacked area with a need line),
  `ScoreRow` (rule · value · threshold · status), `GroupedRows` (expandable
  life-change rows), `HorizonPopover`.
- Charts use direct labels instead of legends wherever space allows, and
  every chart has a "Show as table" toggle for accessibility.

---

## 7. Build order

Each phase ships something usable and keeps `npm run lint && npm test`
green. Each phase ends with a Tauri rebuild so the installed app shows it.

| Phase | Scope | Why this order |
|---|---|---|
| **0 · Quick relief** (small) | Horizon popover + derived `endOfPlan`; plan check for events past the horizon; net-worth chart above the Accounts balance sheet; grouped life-change rows in Events/Cash Flow tables; remove the Sankey | Fixes four of today's complaints in days, with no model change |
| **1 · Household model** | Members (adult/child), BudgetLines + anchors, allowances, careers with phases, line provenance (`ownerId`, `groupId`), migration + review step, `checks.ts` | Everything after this depends on it |
| **2 · Budget + Family pages** | Budget page, Family page, kid stage templates, caregiving decision, ImpactStrip, preview/keep infrastructure | Answers questions 2 and 3, and builds the shared components |
| **3 · Home** | `affordability.ts` + worker, AffordabilityMap, house-poor check, rent↔own, price ladder, cash cushion | Answers question 1, reusing BudgetBar and ImpactStrip |
| **4 · Annuity & SEPP** | `seppElection` in the engine, v2 tables + tests, start-year bars, with/without chart, table, "Add to plan" | Answers question 4. Retirement needs the SEPP band |
| **5 · Retirement** | SourceStack, bridge card, retirement budget, per-adult ages, drawdown table | Answers question 5 |
| **6 · Overview, Timeline, Reports, Compare** | Answer cards, lane timeline, Reports absorbs the Cash Flow table, scenario comparison on the five metrics | Overview only works once every page has an "answer" |
| **7 · Review** | Independent design review against this doc (impeccable / design-review), mobile 390px pass, dark mode, perf check of the affordability solver | — |

---

## 8. Decisions (settled Oct 16, 2026 — Spencer took every recommendation)

1. **Default units:** monthly and today's dollars everywhere.
2. **House-poor thresholds:** housing ≤ 25% of take-home is comfortable,
   25–35% is a stretch, > 35% is house-poor, with a 6-month cash reserve.
   All adjustable.
3. **Allowances:** the $4K/mo each is assumed fully spent.
4. **Before the wedding:** one household plan. Sarah's income, budget and
   accounts join at the wedding year.
5. **Kid cost defaults:** national stage estimates, editable. Childcare
   defaults to daycare.

---

## 9. Status

**Phase 0 — shipped Oct 16, 2026.**
- Horizon is a setting (`settings.horizon`, engine `horizon.ts`): a year, or
  "until someone turns N". New plans default to the younger adult's 95th
  birthday. It can be set from the rail's sub-label popover and from
  Assumptions. Setting it removes the legacy `endOfPlan` event.
- A plan check (`src/planner/checks.ts`) flags events after the horizon and
  offers a one-click extension. It appears on Overview, Events and
  Retirement.
- Accounts shows the net-worth trajectory, stacked by asset class with debt
  below zero, above the balance sheet.
- Cash Flow: the Sankey is gone, replaced by an income / spending / saved
  chart by year. Table rows are grouped per life change and can be
  expanded.

**Phase 1 — household model, Oct 16, 2026.**
- Engine (all additive; plans saved before this behave exactly as they did):
  - `Participant.role` (adult / child). Children never set the horizon or
    own accounts.
  - `Anchor` + `anchors.ts`: a year, "when <event>" (+offset), or "when
    <person> is N".
  - `BudgetLine` + `budget.ts`: amounts are monthly or one-time, in today's
    dollars. Each line has an owner, a category and an essential flag, and
    is a spend or a save. It compiles into the same flows as events.
    Retirement and career-break spending changes scale adult and shared
    lines but not a child's.
  - `LineItem.ownerId / budgetLineId / essential`.
  - Ownership:
    - `participantId` on job, newJob, income and careerBreak.
    - Suppressions are owner-aware, so one partner retiring or switching
      jobs no longer cuts the other's pay.
    - `job.phases` (full / part / leave / off, anchored) scale salary, bonus
      and 401(k).
  - `buyAHome` now emits property tax, insurance, upkeep and HOA as separate
    lines.
- App:
  - "Work over time" editor in the job drawer, with "when <event>" starts.
  - A "Person" picker on income-type events.
  - More plan checks: rent after purchase, wage-like income not marked
    earned, unowned income with two adults, and a fixed return ≥ 12%.
  - Event hover cards summarize schedules instead of printing "[object
    Object]".
  - `toHouseholdModel` (src/planner/household.ts) migrates kids → child
    members + age-anchored lines, living expenses → "Other shared
    spending", and pay → its owner where the name makes it unambiguous.
    It's tested to keep net worth identical year by year where the
    semantics match.

**Phase 2 — Budget and Family, Oct 16, 2026.**
- **Setup.** Both pages open on a "Set up your household" card until the
  plan has a budget. Review shows `toHouseholdModel`'s `changes` and
  `needsReview`; one Apply, one undo. It also switches the plan to today's
  dollars. New plans default to today's dollars.
- **Budget** (`/budget`):
  - Year stepper with a life-stage read ("Renting · Kid 1 (2)"), plus `/mo
    · /yr` and `Today's $ · Future $` toggles.
  - A one-sentence answer, a stat strip, and the 100% "Where each month
    goes" bar.
  - "Budget by year" columns stacked by person under an after-tax line
    (25 years by default, or all), clickable.
  - The budget table grouped Shared / each adult / each kid, plus "Saved on
    purpose" and "Once this year" for lump sums.
  - The `BudgetLineDrawer` with anchored starts and stops.
  - "Try a change" levers (rent, allowance each, other fixed bills ±%) over
    the Impact strip, with Keep / Save as scenario / Reset.
- **Family** (`/family`):
  - Members, and Add a child (stage template: daycare / nanny / parent,
    public / private school, college, optional 529 with its own account,
    plus a cost-by-age preview).
  - Career tracks drawn from `careerSegments`.
  - Kids' monthly cost by year.
  - The "Step back from work" decision (`applyCareGap`: leave pay %, then
    back-at %, childcare paused while home), showing pay, childcare and net
    per month, then the Impact strip.
- **Engine:**
  - `BudgetLine.pauses`.
  - `LineItem.oneTime`, so lump sums never read as a monthly cost.
- **Also:**
  - Rail group "Plan" → "Household" (Budget, Family, Accounts, Cash Flow,
    Events); ⌘2 is now Budget.
  - Overview's spending lever scales the budget's adult and shared lines
    when the plan has one.

**Next — Phase 3 (Home).** Known gaps:
- Retirement still stops every standing contribution household-wide.
- "Budget by year" draws the plan, not the draft.
