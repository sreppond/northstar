# Controlled Fixture & Experiments

**[OBSERVED]** throughout — this is a first-hand build/test log, not a survey of existing screens.

## Method

Per the research brief: Sandbox breadth first (the account's pre-existing "Mid Career, Married" persona, ages 47/44, CA, $1.24M net worth — carried over from a prior free-tier session and safe to reuse since it's already fictional test data), then a purpose-built controlled fixture for reproducible before/after testing.

## Fixture build log

1. **Created a new Plan** via sidebar → Plans → + New Plan → "Northstar Fixture - Single 30," source "Start from scratch." This launched the same onboarding wizard used for first-time setup (see [02_application_sitemap.md](02_application_sitemap.md)).
2. **Milestones step** — pre-populated from the still-shared couple household (About You hadn't been changed yet); left as default, fixed later.
3. **Income step** — added Salary $100,000/yr for "You," default Time Range Before Current Year → Retirement, default growth "Increased to match inflation."
4. **Flows step** — set up all 3 fixture contribution goals exactly per spec:
   - **401k**: linked to Salary as Source, Your Contribution = $10,000/yr fixed ("Amount in Today's Currency" mode, switched from the % default), Employer Contribution 0%.
   - **Roth IRA**: Contribution mode "Specific Amount," Frequency "Yearly," $7,000/yr.
   - **Taxable Investments**: Contribution mode "Specific Amount," Frequency "Yearly," $3,000/yr.
   - Declined the "Want an emergency fund?" guardrail nudge (Skip) since the fixture spec calls for $0 cash.
5. **Expenses step** — added Living Expenses $50,000/yr, default Time Range Before Current Year → End of Plan. (Two leftover "Medicare - You / Medicare - Spouse" entries appeared, inherited from the still-shared couple household at this point.)
6. **Real Assets step** — declined to add new assets (fixture spec: no real estate initially); the couple's existing House/2 Cars appeared here too (shared Current Finances), left as-is for now.
7. **Confirmed** the wizard → landed on the new Plan's Plan tab.
8. **Reassigned the household**: Current Finances → About You → switched Couple → Individual (Spouse entry disappeared) → edited "You" birth year to 1996 (age 30 as of 2026) → Saved.
9. **Fixed starting balances** in Current Finances to match spec exactly:
   - 401k/403b: $198,000 → $50,000
   - Taxable Investments: $95,000 → $25,000
   - Roth IRA (the "You"-owned one, $120,000 balance): → $25,000
   - Zeroed the orphaned ex-spouse balances (a second 401k/403b $125,000, a second Roth IRA $65,000, Cryptocurrency $25,000, two Savings accounts $25,000+$35,000) rather than deleting them (no delete affordance found for Current-Finances balance rows; zeroing is the closest available non-destructive equivalent).
10. **Discovered a plan-health failure**: the new fixture Plan showed a truncated Net Worth chart (cutting off at age 37) and 3 notification-bell warnings: **"Out of Money at 37,"** **"Early Withdrawal Penalties incurred at ages 34-37,"** and **"Financial Independence — Milestone never reached."** Root cause: the leftover fixed-date "Retirement: Jan 2039" milestone from the 47-year-old household silently meant "retire at age 43" for the reassigned 30-year-old — 13 years of accumulation on a $100K start couldn't sustain $50K/yr spending, forcing early (pre-59½, penalized) retirement-account withdrawals.
11. **Deactivated** the 3 leftover real assets (My Car, Spouse's Car, House) via each item's 3-dot menu → "Deactivate" (confirmed non-destructive: "Linked to Current Finances," excluded from just this Plan). Net worth chart immediately dropped to reflect the correct ~$100K starting point (previously inflated by ~$547K of inherited real-asset equity) and extended cleanly with no more truncation.
12. **Fixed the milestones** via Settings → Milestones (reached by clicking the Retirement milestone's icon directly on the Net Worth chart, after switching Time Range to "Full Plan" to make the icon visible):
    - **Retirement**: "At date" Jan 2039 → **Jan 2056** (recalculated live to "60y0m")
    - **Your Life Expectancy**: "At year" 2064 → **2086** (recalculated live to "Age 90")
13. **Result**: all 3 notification-bell warnings cleared; the Plan chart now shows smooth, unbroken growth from ~$100K at 30 to several million by the 80s with no truncation.

**Final fixture state:** single male, age 30 (Jan 1996), CA, USD, English. Salary $100K/yr. Living Expenses $50K/yr. Starting assets: 401k $50K, Roth IRA $25K, Taxable $25K, Cash $0. Contributions: 401k $10K/yr, Roth IRA $7K/yr, Taxable $3K/yr ($20K/yr total, 20% of gross income). Retirement at 60. Life Expectancy 90. Financial Independence = Net Worth ≥ 25× Spending. Real estate: none (legacy household assets present but deactivated for this plan).

## Baseline result

**Chance of Success: 100.00% (196/196 historical trials), narrative descriptor "excellent."**

## Experiment 1 — Retirement age (single-lever change)

| | Baseline | Experiment |
|---|---|---|
| Retirement age | 60 (Jan 2056) | **45 (Jan 2041)** |
| Everything else | unchanged | unchanged |
| Chance of Success | **100.00%** | **65.82%** |
| Narrative descriptor | "excellent" | "fair" |
| Donut composition | 2 colors (green + blue) | 5–6 colors (green/dark-red/red/orange/yellow/blue) |

**Observation:** cutting the accumulation window from 30 years to 15 years, with nothing else changed, moved success from certain to "fair" — a 34.18-point swing from a single field edit, propagating instantly through the Plan chart, the plan-health notification system, and the Monte Carlo re-run. This directly reproduces the prior free-tier research's finding on the couple persona (a 10-year retirement delay there moved success from 93.37% to 100.00%) with a controlled, reproducible fixture and a larger, more dramatic delta — confirming retirement age is the single most leveraged input in the product's model, robust across two independent test subjects.

## Pre-experiment note (gap-closing pass)

At the start of this follow-up session the fixture Plan was still sitting in Experiment 1's end state (retirement age 45, Jan 2041) from the prior session — it had not been reverted. Before running new experiments, the retirement milestone was restored to **Jan 2056 (age 60)** via Settings → Milestones, which brought the plan back to the documented baseline (chart returns to smooth unbroken growth to ~$5M by the 80s, all 3 notification-bell warnings clear, top toolbar warning icons disappear). This is itself worth noting as a UX property: the plan-health monitor and the Monte Carlo result are always computed fresh from current state, so a stale prior-session edit is silently "live" until someone notices and fixes it — there is no drift warning between sessions.

## Experiment A — Spending increase (single-lever change)

| | Baseline | Experiment |
|---|---|---|
| Living Expenses (starting amount) | $50,000/yr | **$90,000/yr** (+80%) |
| Everything else | unchanged | unchanged |
| Net Worth chart shape | smooth unbroken growth to ~$5M by the 80s | **crashes to $0 by ~age 37** — an 8-year runway on the increased burn rate |
| Plan-health warnings | none | red "out of money" icon on the chart; notification-bell badge returns to "3" |
| Chance of Success | **100.00%** ("excellent") | **0.00%** (**"non-viable"** — a narrative-descriptor tier not previously documented, sitting below "excellent" on the same excellent→…→non-viable scale) |
| Outcome-category breakdown | Large Surplus 84.2%/165 trials, Comfortable 15.8%/31 trials | **Failed Early 100.0%/196 trials** — every single historical trial failed, and failed in the *early* category specifically (not "failed in the middle," i.e. the plan doesn't even survive the accumulation phase before spending outpaces income + starting assets) |

**Observation:** an 80% spending increase against unchanged $100K income and unchanged contributions is not a moderate stress test — it immediately exceeds gross income once the (now much larger) tax-adjusted burn rate is accounted for, so the fixture's $100K starting assets are exhausted in under a decade. This is a useful **calibration data point in the opposite direction** from Experiment 1 (retirement-age delay): where retirement age is the single most *leverage-per-unit-change* lever, spending is the most *immediately destructive* lever — a household living paycheck-to-negative-paycheck fails "early," not "late," and Monte Carlo's outcome taxonomy correctly distinguishes the two. **Reverted** — Living Expenses restored to $50,000/yr; chart and toolbar confirmed back to baseline before Experiment B began.

## Experiment B — Investment return assumption (single-lever change)

| | Baseline | Experiment |
|---|---|---|
| Settings → Rates → Stocks → Growth Rate | 7% | **4%** (Dividend Yield left at 1.5%; computed Real Return dropped from 5.34% to 2.43%) |
| Everything else | unchanged | unchanged |
| Net Worth chart shape (deterministic Plan tab) | smooth unbroken growth to ~$5M by the 80s | **peaks ~$1M around age 59, then declines to $0 by ~age 79-80** — the plan survives accumulation but fails during drawdown |
| Plan-health warnings | none | red "out of money" icon appears late in the chart; notification-bell badge shows "2" |
| Chance of Success (Monte Carlo, default "Historical Returns" data source) | **100.00%** ("excellent") | **100.00%** ("excellent") — **unchanged**, Large Surplus 85.2%/167 trials, Comfortable 14.8%/29 trials (materially identical to baseline's 84.2%/165 + 15.8%/31) |

**Observation — the most important non-obvious finding of this pass:** cutting the Fixed stock growth assumption by 3 points (7%→4%) is dramatic enough to flip the *deterministic* Plan chart from perpetual growth to full depletion in retirement, yet it has **no measurable effect on the Monte Carlo Chance of Success result**. The reason is architectural, not a bug: Chance of Success's default data source is **"Historical Returns"** (resampling real historical annual-return sequences), which is entirely independent of the Rates → Stocks *Fixed* assumption — that Fixed rate only feeds the single-path deterministic projection used by the Plan tab, Cash Flow, and Tax Analytics. A user could quite reasonably tank their own deterministic projection into a $0 retirement, glance at "100% Chance of Success" on the very next tab, and walk away with two contradictory impressions of the same plan. **This is a concrete, transferable design decision Northstar must make deliberately**: either (a) keep the two engines decoupled like ProjectionLab does, but surface a persistent, explicit UI signal that "your deterministic assumptions and your Monte Carlo data source are not the same input" — ProjectionLab does not appear to do this anywhere in the Chance of Success UI observed — or (b) tie the Monte Carlo engine's central tendency to the same Fixed-rate assumption a user edits, at the cost of losing historical-resampling realism. **Reverted** — Growth Rate restored to 7%; the Plan chart shape and toolbar icons were confirmed back to true baseline afterward (`final-baseline-check.png`).

## Experiments not run (explicitly time-boxed out)

Per the research brief's priority order, retirement age (Experiment 1), spending (Experiment A), and investment return (Experiment B) were judged the three highest-value single-lever experiments to fully document end-to-end, since together they cover the three broad categories of plan input (time-based, cash-flow-based, and market-assumption-based) and — in Experiment B's case — surfaced a genuine architectural gotcha rather than just a predictable magnitude change. Further single-variable experiments the brief's broader instructions call for (contribution-rate change, Social Security timing, home purchase, large one-time expense) were not run against this fixture — the mechanism for running them is now fully documented (edit the relevant Income/Expense/Milestone/Settings field → re-run Chance of Success from its Run button, which always re-executes fresh against current plan state, confirmed across 4 separate lever changes this pass) and could be repeated in a follow-up session using the same fixture Plan, which remains saved in the account as "Northstar Fixture - Single 30," restored to true baseline (retirement age 60, Living Expenses $50K, Stocks Growth Rate 7%) at the end of this session.

## A second, unplanned finding worth calling out

Building this fixture on top of a pre-existing household (rather than a truly blank account) surfaced a realistic failure mode that a from-scratch product should design against deliberately: **reassigning who a plan is for can silently break date-based milestones that were tuned for the old person.** Northstar should decide explicitly whether Milestones store an absolute calendar date or an age/offset relative to the plan's subject(s) — and if absolute dates are kept for flexibility, consider a validation/warning pass whenever a person's birth date changes, similar to (or piggybacking on) ProjectionLab's own always-on plan-health notification system.
