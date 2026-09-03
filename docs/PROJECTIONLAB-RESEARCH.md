# ProjectionLab Product Research

**Purpose:** Reference document for designing Northstar from first principles. This is NOT a spec to copy — it's a survey of what a mature, well-regarded financial-planning product does, how it organizes financial concepts, and where it draws its paywall. Use it to make informed, deliberate decisions, including decisions to do things differently.

**Method:** Live exploration of ProjectionLab's Sandbox mode (persona: "Mid Career, Married" — married couple, kids, mortgage, on track for early retirement), an authenticated but non-Premium account. Most advanced analytics are Premium-gated and appear here as blurred previews with their marketing copy, not verified functionality — flagged explicitly below wherever that's the case.

---

## 1. Executive Summary

ProjectionLab is a **lifetime financial-projection tool**, not a budgeting app or a robo-advisor. Its core loop: (1) enter your current financial state once, (2) describe every income stream, expense, account, debt, and life event as a *time-bound, growth-modeled object*, (3) let the engine project net worth, cash flow, and taxes decades into the future, (4) stress-test the plan with Monte Carlo and what-if scenarios.

The product's real innovation isn't any single chart — it's the **cascading, rule-based data model**. Nearly every date in the system (when income stops, when an expense begins, when a milestone fires) can be pinned to another *event* rather than a fixed date — "at Retirement," "at Financial Independence," "when Net Worth crosses $X." Change one root assumption (e.g., retirement age) and the entire 40-year projection, every dependent milestone, and the Monte Carlo success rate recompute together. This is the single most important architectural lesson for Northstar.

Monetization is aggressive and clearly telegraphed: the free tier is a **single-plan, single-scenario calculator** with a strong "Chance of Success" headline number. Nearly everything that lets a user *compare* choices — multiple plans, what-if toggles, tax optimization, Sankey cash-flow, detailed Monte Carlo, exports — sits behind Premium. The free product still fully works and is genuinely useful; Premium sells *decision-making leverage*, not core functionality.

## 2. Product Positioning

- Tagline: **"Model and simulate your financial future."**
- Explicitly not a budgeting/bank-linking app first — Sandbox mode ships with manually-entered balances, not Plaid-style account sync (a "Current Finances" section exists for manual entry; no bank-link flow was surfaced in this session).
- International from the ground up: account types and tax rules are localized per country (US, UK, Canada, Australia observed via persona flags and a country selector in the "Add Investments" modal).
- Premium upsell language consistently frames paid features as **decision support**: "Want to optimize your plan?", "Want to compare scenarios?", "See how different withdrawal strategies could affect taxes and save you thousands." The free tier answers "where do I stand"; Premium answers "what should I do."

## 3. Application Sitemap

```
ProjectionLab
├── Dashboard                          (net worth summary + list of Plans)
├── Current Finances                   (today's balance sheet — source of truth)
│   ├── Savings
│   ├── Investments
│   ├── Real Assets
│   ├── Unsecured Debts
│   └── About You                      (household members, birthdates, avatar)
├── Progress                           (Premium — actual net worth over real time vs. plan)
├── Plans
│   ├── [Plan: "Current Projections"]  (the core planning workspace, see below)
│   └── + New Plan                     (Premium — multiple parallel plans)
├── Help Center (external)
├── Gift a Subscription
├── Resources → Blog, Roadmap, Advisor Directory
├── Support → Discord, Email, Contact Form, 1-on-1 Session
└── More Info → Changelog, Terms, Privacy

Inside a Plan (top tab bar):
├── Plan               (net worth/income/expense chart + Income/Expenses/Accounts/Real-Assets/Flows/Goals panels)
├── Cash Flow           (Premium — Sankey diagram)
├── Tax Analytics        (Premium — bracket-level tax breakdown)
├── Chance of Success     (Monte Carlo — headline free, detail Premium)
├── Compare → What If    (Premium — scenario diffing)
├── Optimize → Tax Strategy, Flexible Spending, Roth Conversions, Drawdown, Gain Harvesting (all Premium)
└── Reports              (Premium — year-by-year data table, PDF/CSV/JSON export)
```

## 4. Core User Flows

1. **Onboarding**: choose Normal Walkthrough (guided, 5–10 min) vs. Sandbox (instant, pre-populated persona, ~1 min). Ten personas span single/married, US/UK/Canada/Australia, early/mid/late career — this is effectively a library of realistic seed templates.
2. **Balance-sheet entry**: "Current Finances" is filled in once as the source of truth (Savings, Investments, Real Assets, Debts), tagged by household member (You/Spouse).
3. **Plan construction**: inside a Plan, the user builds Income streams, Expenses, Accounts (which can be "linked" back to a Current Finances balance or exist only inside the plan), a prioritized contribution waterfall ("Flows"), and Milestones — then reads the resulting Net Worth projection.
4. **Analysis**: switch chart datasets, run Monte Carlo, open Tax Analytics/Cash Flow (mostly Premium), check Reports.
5. **Iteration**: adjust a single assumption (e.g., retirement date) and watch the whole plan recompute; compare against alternatives via What-If/multiple Plans (Premium).

## 5. Feature Inventory

**Free tier (verified working):**
- Manual balance-sheet tracking (Savings, Investments, Real Assets, Debts) with per-owner attribution
- Full income/expense stream modeling with flexible time ranges, growth rules, tax withholding
- Full account catalog including RMDs, Roth conversions, 72(t)/SEPP toggles per account
- Prioritized contribution waterfall ("Flows")
- Rule-based Milestones (fixed date, relative to another milestone, or triggered by a metric threshold)
- Single Net Worth projection chart with ~25 alternate dataset views (most sub-views are Premium-gated individually)
- Monte Carlo "Chance of Success" headline % with plain-language narrative (196 historical trials observed)
- Country/localization switching for account types

**Premium-gated (verified via paywall screens, not used):**
- Multiple parallel Plans / What-If scenario comparison
- Interactive Sankey cash-flow diagram
- Tax Analytics (bracket-level, year-by-year, deductions/credits)
- Full Monte Carlo outcome distribution / spaghetti chart
- Optimize suite: Tax Strategy, Flexible Spending, Roth Conversion ladders, Drawdown sequencing, Capital Gain Harvesting
- Reports: tabular year-by-year export to PDF/CSV/JSON
- Progress: actual net worth tracked over real calendar time vs. the plan
- Rental/Commercial Property asset types
- Most of the ~25-item chart dataset library (Income/Expense/Tax/Withdrawal breakdowns, Goal Heatmap, etc.)

## 6. Financial Data Model — Conceptual

The model has five first-class object types, each with its own time semantics:

- **Income** (a stream: name, earner, starting amount, frequency, time range, growth rule, tax handling)
- **Expense** (a stream, additionally tagged Essential / Discretionary / Hybrid / Not Spending — a *flexibility* classification, presumably used by dynamic-spending strategies)
- **Account** (a balance with a growth model, optionally linked to a Current Finances balance, optionally receiving "Flows")
- **Real Asset / Debt** (a balance with its own appreciation/depreciation rate and an attachable amortizing loan)
- **Milestone** (a *point in time*, itself defined either as a fixed date/year, relative to another milestone, or as the first time a metric — Net Worth, Liquid Net Worth, Passive Income, Expenses, Spending — crosses a threshold)

The unifying idea: **almost any date field throughout the app can point at a Milestone instead of a literal date.** This is what makes the whole plan cascade from one change. Northstar should treat "when does X start/stop" as a first-class reference type, not a plain date column.

## 7. Input Inventory

Representative deep-dive, the "Salary" income editor (My Job, $150,000/yr):

| Field | Type | Default/Observed | Notes |
|---|---|---|---|
| Name | text | "My Job" | |
| Earner | select | You / Spouse | household member attribution |
| Starting Amount | currency | $150,000 | |
| Frequency | select | Yearly | (Monthly etc. also available, seen on Rent) |
| Time Range → Start | date-or-milestone picker | "Before Current Year" | month-granularity calendar, age shown inline (e.g. "47y3m") |
| Time Range → End | date-or-milestone picker | "Your Retirement" | options: Your/Spouse's Retirement, Your/Spouse's Life Expectancy, Financial Independence, End of Plan, or a literal date/year |
| Change Over Time | select + params | Increase, 4.5%/yr, cap $215,000 | options: None, Increase, Decrease, Advanced (custom schedule), Match Inflation, Match Inflation ±X% |
| Tax Handling | expandable | 25% Withholding | |
| More Options → Part-Time Work | toggle | off | models a reduced-income period before full retirement |
| More Options → Defined Benefit Pension | toggle | off | attaches a pension payout to this income source |
| More Options → Advanced Options | toggle | off | "expand this form to include all possible configuration options" — progressive disclosure |

Expense editor adds a **Flexibility** field (Essential / Discretionary / Hybrid / Not Spending) and a "Want Help Estimating?" assist panel not present on Income.

Account editor (401k) exposes: Growth Rate & Dividend Yield (each individually overridable from a plan-level default, or "Advanced" for a schedule), Bonds, Fees, Liquidity, Required Minimum Distributions (Enabled), Roth Conversions (Off), 72t Distributions/SEPP (Off), and Flows (contribution links). The "Default" badge next to Growth Rate is a strong pattern: **every numeric assumption should have a plan-level default that individual items can silently inherit or explicitly override.**

## 8. Account Types

**Cash:** Savings (generic; no sub-types observed)

**Investment:**
- Taxable Investments (tracks Cost basis)
- Individual Retirement: IRA, Roth IRA (tracks Contributions, not cost), Inherited IRA, Inherited Roth IRA
- Employer Retirement: 401k, Roth 401k, 403b, Roth 403b, 457b, Roth 457b, 401a
- Cryptocurrency (custom icon/edit, tracks Cost)
- HSA, 529 Plan

**Real Assets:** House, Car, Rental Property (Premium), Commercial Property (Premium), Land, Building, Motorcycle, Boat, Jewelry, Precious Metals, Furniture, Instrument, Machinery, Custom Asset. House/Car support an attached **amortizing loan** (purchase price, current value, status Financed/Fully Owned/Sold, loan balance, APR, simple vs. compound interest, compounding frequency, monthly payment, computed years-to-payoff) plus a scheduled **sale date** and its own appreciation/depreciation rate.

**Debt (unsecured):** generic Debt, Student Loans, Medical Debt, Credit Card Debt.

Every account/asset/debt has an **Owner** (You/Spouse/Joint) for household attribution, which flows into tax filing status logic.

## 9. Income & Expense Modeling

- **14 expense templates**: Living Expenses, Rent, Debt, Student Loans, Dependent, Education, Health Care, Vacation, Wedding, Charity, Travel, Medical Expenses, Emergency, Custom Expense.
- **Growth models** apply uniformly to income and expenses: None, Increase %, Decrease %, Match Inflation, Match Inflation ±X%, or "Advanced" (a custom schedule over time) — each with an optional cap/floor.
- The app is explicit about **nominal vs. real dollars**: an inline note ("Increases at ~1.46%/yr in Today's Currency") and a global chart toggle ("Show projections in: Today's Currency") make the nominal/real distinction visible rather than hidden math. Northstar should surface this distinction directly to users, not bury it.
- Expense **Flexibility** (Essential/Discretionary/Hybrid/Not Spending) is a separate axis from growth — it looks purpose-built to feed a dynamic/guardrails retirement-spending strategy (cut discretionary spend in down markets), even though we didn't reach a screen that visibly used it.

## 10. Life Events / Milestones

Milestones are plotted as icons directly on the Net Worth timeline and are genuinely dual-purpose: they're both **markers** (annotate the chart — "Paid off House Mortgage," "Final year: My Job") and **triggers** (define when other things start/stop). A milestone's own timing can be:
- A fixed date or year
- "At/Before another milestone" (chained)
- "At/Before" a metric threshold: Net Worth, Liquid Net Worth, Passive Income, Expenses, Spending, Discretionary/Essential Spending

Example observed: **Financial Independence** was defined as *"Liquid Net Worth > 20 × Expenses"* (a configurable-multiplier generalization of the 4%/25x rule), and **Your Retirement** was itself set to fire "At another milestone → Financial Independence" — i.e., retirement wasn't a fixed age at all; it was computed. Hovering any point on the timeline surfaces every milestone landing near that date plus a net-worth snapshot for that year/age.

## 11. Retirement Planning

- Retirement age is not necessarily an input — it can be an *output* of a rule (see above), or a fixed age/date/year the user pins directly.
- Retirement readiness is communicated primarily through the **Chance of Success** percentage (Monte Carlo) rather than a single deterministic "you're on track" badge.
- Withdrawal/drawdown sequencing (which account to spend from first in retirement) is an **Optimize → Drawdown** feature — Premium.
- Retirement-account-specific mechanics (RMDs, Roth conversions, 72(t)/SEPP) live on the **account**, not on a separate "retirement module" — a good signal that retirement isn't a distinct feature area so much as a lens over the same account objects used everywhere else.
- Part-time/"coast" pre-retirement income reduction is a first-class toggle on any income source, not a separate concept.

## 12. Tax Features

- **Per-account:** RMD toggle, Roth Conversion toggle, 72(t)/SEPP toggle, tax-lot Cost basis tracking (taxable/crypto) vs. Contributions tracking (Roth).
- **Per-income:** withholding %.
- **Plan-level (Premium):** Tax Analytics tab — bracket-level breakdown by year, effective vs. marginal rate, income-source composition (wages, ordinary distributions, capital gains, tax-deferred withdrawals, non-taxable withdrawals) as a stacked bar chart.
- **Optimize → Tax Strategy / Roth Conversions / Gain Harvesting** (Premium) — these read as automated or guided strategy recommendations layered on top of the same account objects, not new data entry.
- We could not verify state/local tax modeling depth (blurred in the Tax Analytics preview but a "State Taxable Income" and "Local Taxable Income" chart dataset exists in the free chart-type list, implying state/local tax computation happens even on the free tier — only the *analytics view* of it is gated).

## 13. Scenario / What-If Modeling

This is the **single most Premium-gated capability** in the product, and it's worth designing Northstar's monetization around consciously either matching or deliberately not matching this choice.

- Free tier: **exactly one plan, no comparison.** Both "Compare → What If" and "+ New Plan" (creating a second parallel plan) triggered the identical paywall: *"Create multiple plans to see how different scenarios or decisions could shape your financial future."*
- The marketed mechanism (from paywall copy, not verified in-product) is a lightweight in-place "What If" mode: make changes, see the delta against the current state, "with the option to roll back" — implying a diff/undo model rather than fully independent plan documents.
- Because scenario comparison is core to *decision-making* (the stated goal of this whole research effort), Northstar should treat it as differentiation territory: either make it free to build trust/virality, or make the paywall much later in the funnel than ProjectionLab does.

## 14. Monte Carlo / Uncertainty

Lives at **Chance of Success**, and unusually, the core simulation *is* available free:
- **Data Sources**: Historical Returns (an option, implying alternative sources like custom distributions exist elsewhere/Premium)
- **Methodology**: "Historical, Random-Restart" — resampling historical return sequences rather than a pure parametric Monte Carlo
- **Metrics tracked**: Net Worth, Expenses, +1 more (unlabeled)
- **Outcome Categories**: "kinds of success and failure" (implies more than binary pass/fail — partial-success gradations, visible as the 3-color donut: green/orange/yellow slices)
- **Output (free)**: a single %, a colored donut, and a plain-language sentence — *"This chance of success looks excellent. Your portfolio survived 93% of the time, based on 196 trials using historical returns data."*
- **Output (Premium)**: "Visualize every possible outcome and understand what creates success or failure" — implies a full outcome-band chart is gated even though the headline number is free.

**Verified experiment:** delaying the retirement milestone from 2035 (age 56) to 2045 (age 66) — a 10-year delay — moved Chance of Success from **93.37% → 100.00%** and changed the Net Worth curve from a late-life decline (peak ~$3.5M around 76, down to ~$3M by 84) to continuous compounding to **~$9M by 84**. This is a good calibration data point: giving users an immediate, dramatic, correct-feeling response to a single lever (retirement age) is what makes a planning tool feel trustworthy and "sticky."

## 15. Financial Outputs

| Output | Where | Form | Gated? |
|---|---|---|---|
| Net Worth (projected) | Plan tab | area chart, 37-year horizon in the sandbox | Free |
| Net Worth (actual, historical) | Progress | line chart + table | Premium |
| Chance of Success % | Chance of Success | donut + sentence | Free (detail Premium) |
| Cash Flow (sources→uses) | Cash Flow | Sankey diagram | Premium |
| Tax by year, effective/marginal rate | Tax Analytics | stacked bar + summary cards | Premium |
| Year-by-year data table (Net Worth, Liquid Net Worth, Income, Expenses, Taxes, Effective Tax Rate, Savings Rate) | Reports | table, export PDF/CSV/JSON | Premium |
| Contribution waterfall status | Plan → Flows | ranked card list | Free |

## 16. Chart Inventory

The Plan chart's dataset dropdown lists **~25 distinct views**, one free (Stacked Net Worth) and the rest Premium-flagged (rocket icon): Income, Expenses, Spending, Spending Overview, Discretionary/Essential Spending, Spending Flex, Taxes, Withdrawals, Taxable/State/Local Taxable Income, Savings Rate, Contributions, Contribs & Withdrawals, Goal Heatmap, Income Breakdown, Expenses Breakdown, Taxes Breakdown, Withdrawals Breakdown, Taxable Income Breakdown, Non-Taxable Income, Passive Income, Contributions Breakdown, C/W Breakdown, Debt Payments Breakdown.

The base **Net Worth chart** itself: X-axis = age (both spouses' ages shown on hover), Y-axis = dollars (toggleable Today's Currency vs. nominal), series = a single filled area line, with milestone icons plotted at their computed year and a rich hover tooltip (date, both ages, net worth, and any milestones landing at that point). A separate "Display Options" panel controls Inflation toggle, Time Range/zoom, Datasets, Metrics, Metric Settings, Appearance, Chart Type, and Y-Axis scale — a lot of chart configurability exposed directly to the end user, not just to us as researchers.

## 17. Reports / Exports

Reports tab (Premium): tabs for Explore / Statements / Filters; a year-by-year table (Net Worth, Liquid Net Worth, Income, Expenses, Taxes, Effective Tax Rate, Savings Rate) with export to **PDF, CSV, or JSON**. JSON export is notable — it signals ProjectionLab expects some users to pipe plan data into their own tools/spreadsheets, not just print a PDF for an advisor meeting.

## 18. UI / UX Patterns

- **Progressive disclosure everywhere**: forms open collapsed to Name/Amount/Frequency plus a few summary rows (e.g., "Time Range: Before Current Year › Your Retirement"); tapping a row expands just that section. An explicit "Advanced Options" toggle exists to reveal *all* fields at once for power users. This is the strongest transferable UI lesson in the whole product.
- **Inherit-or-override pattern**: numeric assumptions (growth rate, dividend yield) show a "Default" badge and a dropdown offering Default / Fixed / Advanced(schedule) / None — a plan-level assumptions hub cascades down until a user explicitly overrides at the item level.
- **Cards, not spreadsheets**: Income/Expenses/Accounts/Real Assets/Flows are all rendered as icon + name + amount + one-line summary cards in scrollable columns, not table rows — keeps a dense financial model approachable.
- **Icons carry real information**: a colored circular icon per item type (bank/piggy-bank/car/house/crypto symbol/etc.) is used consistently as the primary visual identifier across list rows, chart markers, and modal headers — one icon vocabulary reused everywhere.
- **Modals for everything**: adding/editing any object opens a full-screen-on-mobile, centered-on-desktop modal with Cancel/Save (or Close/Add) — no inline table editing.
- **Consistent paywall pattern**: blur the real (populated with the user's own sandbox numbers) chart/table behind it, show a one-line value-prop headline, one sentence of explanation, and a single black "Upgrade to Premium" button. Never a hard wall with no preview — always show *your own data*, teased.
- **Onboarding tour**: a dismissible tooltip-driven tour ("Skip Tour"/"Next") reappears per major section (Dashboard, then again inside a Plan) rather than one long tour.
- **Household-first, not user-first**: nearly every financial object asks "Owner: You / Spouse," and "About You" starts with "As a couple" as its own settable concept — the data model is built for a household, not retrofitted for one.

## 19. Important User Interactions

- Editing a milestone's trigger type live-updates the Net Worth chart and all downstream milestone positions immediately — no "recalculate" button, no perceptible lag on a ~37-year plan.
- Clicking any point/icon on the Net Worth chart both drops a vertical reference line and opens a tooltip summarizing every milestone near that date plus the net-worth value — a single interaction surfaces both annotation and value.
- The chart-type dropdown and the "Display Options" panel are independent affordances (one picks *what* series, the other configures *how* it's shown) rather than one combined settings surface.

## 20. Feature Dependencies

```
Current Finances (balances) ──┬─→ Accounts (if "Linked")
                               └─→ Dashboard Net Worth summary

Income/Expense streams ──→ Flows (waterfall) ──→ Account contributions ──→ Growth model ──→ Net Worth projection
                       ╲                                                                  ╱
                        ╲──────────────→ Milestones (triggers) ───────────────────────────
                                              │
                                              ├─→ other Income/Expense time ranges (start/end)
                                              ├─→ Chance of Success (Monte Carlo re-run)
                                              └─→ Tax Analytics / Reports (Premium consumers of the same projection)

Account tax settings (RMD / Roth Conversion / 72t) ──→ Tax Analytics + Optimize suite (Premium)
```
Everything downstream (Monte Carlo, Tax Analytics, Reports, Cash Flow) is a *view* over one underlying projection engine fed by Income/Expense/Account/Milestone objects — not separate calculators. This is why a single retirement-date edit propagated through the chart, the milestones, and the success rate simultaneously.

## 21. MVP Feature Set

For a first defensible version of Northstar, prioritize (in order):
1. Household setup (people, birthdates) + manual balance-sheet entry (cash, investment, real-asset, debt categories with owner attribution)
2. Income & Expense streams with: time range (fixed date/age *or* linked to a named milestone), a small set of growth rules (fixed %, match inflation, none)
3. A minimal Milestone system: at minimum "Retirement" and "End of Plan," each settable as a fixed age/date — even without the full metric-triggered rule engine, the *reference-not-literal-date* pattern should exist from day one, since retrofitting it later is expensive
4. A single deterministic Net Worth/Cash-Flow projection chart (nominal + real toggle)
5. A basic contribution waterfall or at least explicit per-account contribution %/match modeling for retirement accounts
6. One Monte-Carlo-style success metric, even simplified (e.g., fixed-distribution simulation rather than historical resampling) — this single number does enormous trust-building work for very little UI surface

## 22. Opportunities for Differentiation

- **Make scenario comparison free or much cheaper to reach.** ProjectionLab's hardest paywall sits exactly on the feature the research brief cares most about (what-if modeling). A competitor that makes "try two retirement ages side by side" free, and monetizes tax optimization / exports / advisor-grade reporting instead, targets a different, arguably more defensible value prop (engagement/virality vs. one-time report generation).
- **Expose the Monte Carlo outcome distribution for free**, gate only the deep drill-down — the headline % alone is good marketing but not enough for a truly informed decision; showing the band of outcomes (not just pass/fail) is achievable without heavy engineering and would differentiate on trust.
- **First-class actuals-vs-plan tracking** (ProjectionLab's "Progress") could be a core loop rather than a premium bolt-on — periodically asking "did reality match the plan?" is what turns a one-time projection into an ongoing product relationship.
- **Simplify the growth-rate model surface.** ~25 chart dataset variants is comprehensive but overwhelming; a smaller, well-chosen default set with a clear "advanced" escape hatch (which ProjectionLab already does at the *field* level via "Advanced Options," just not at the *chart* level) would reduce cognitive load.

## 23. Open Questions

- We could not verify whether "What If" scenarios are lightweight diffs with rollback, or full plan forks, since it never rendered past the paywall — worth confirming via a Premium trial or public docs before committing to a data model for Northstar's own scenario feature.
- Bank/institution linking (Plaid-style live sync) was not observed anywhere in this session; Current Finances appeared fully manual-entry. Unclear whether linking exists elsewhere in the product.
- The exact Monte Carlo methodology ("Historical, Random-Restart") and its outcome-category taxonomy (more than binary success/fail) were named but not explained — the mechanics behind "kinds of success and failure" remain unclear from the free tier alone.
- State/local tax computation appears to happen even on the free tier (chart-dataset names reference it) but its accuracy/coverage couldn't be assessed since the analytics view is gated.

## 24. Recommended Architecture for Our Own Product

1. **Core data model**: five object types — Income, Expense, Account, RealAsset/Debt, Milestone — each owned by a household member, each with a start/end that is a *reference* (to a fixed date OR to another Milestone OR to a metric threshold), not a plain date column. Build this reference system first; it is the architectural backbone everything else depends on.
2. **One projection engine, many views.** Compute a single time-series projection (net worth, cash flow, taxes, by year/month) from the object graph, and treat every chart/report/Monte-Carlo run as a read-only consumer of that projection — never a separate calculator that can drift out of sync.
3. **Global-default-with-override** for every rate assumption (inflation, investment growth, dividend yield) so users aren't forced to set 15 accounts' growth rates individually, but power users can override any one of them.
4. **Progressive-disclosure forms**: collapsed-by-default sections per object editor, with an explicit "show everything" escape hatch, rather than one long form or multiple wizard steps.
5. **Make the Monte Carlo/success-metric cheap to compute and always-on** (recompute on every material edit) — the ProjectionLab experiment above shows this single feedback loop is what makes edits feel consequential and trustworthy.
6. **Design the scenario/comparison feature (data model and UI) from day one**, even if its full UI ships later — retrofitting "compare two versions of a plan" onto a single-plan data model is exactly the kind of rework worth avoiding, and it's also the feature most worth differentiating on.
