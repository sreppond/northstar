# Financial Model, Account Types & Feature Inventory

**[OBSERVED]** unless flagged.

## Core data model (confirmed unchanged under premium, now battle-tested via the fixture build)

Five first-class object types, each with its own time semantics:

- **Income** — a stream: name, earner (household member), starting amount, frequency, Time Range (Start/End, each a literal date OR a milestone reference), Change Over Time (None/Increase/Decrease/Match Inflation/Match Inflation ±X%/Advanced schedule), Tax Handling (withholding %), More Options (Part-Time Work, Defined Benefit Pension, Advanced Options for full field exposure). Default end-of-range for new income = **Retirement** milestone.
- **Expense** — a stream, additionally tagged **Flexibility** (Essential/Discretionary/Hybrid/Not Spending) — feeds the Optimize → Flexible Spending guardrails engine directly (confirmed this session, previously only inferred). Default end-of-range = **End of Plan** (contrast with Income defaulting to Retirement — a deliberate asymmetry).
- **Account** — a balance with a growth model, optionally "Linked to Current Finances," optionally receiving Flows. A new account can be created two ways: directly in Current Finances (sets the starting balance) or inline from within a Flow's "+ Add" picker (sets up the ongoing contribution goal; starting balance defaults to $0 and must be set separately in Current Finances).
- **Real Asset / Debt** — a balance with its own appreciation/depreciation rate, optional amortizing loan (purchase price, current value, status, loan balance, APR, simple/compound interest, compounding frequency, computed years-to-payoff), and a scheduled sale date. Premium types (Rental/Commercial Property) add a full income+depreciation+QBI tax model (see [03_premium_feature_audit.md](03_premium_feature_audit.md)).
- **Milestone** — a point in time: a fixed date/year, "at/before another milestone" (chained), or "at/before a metric threshold" (Net Worth / Liquid Net Worth / Passive Income / Expenses / Spending / Discretionary or Essential Spending crosses a value). Edited only via Settings → Milestones or by clicking a milestone's chart icon — never inline.

**The unifying idea, reconfirmed:** almost any date field can reference a Milestone instead of a literal date, so one root-assumption edit cascades through the whole plan, every dependent milestone, Monte Carlo, Tax Analytics, and Estate simultaneously. See [09_controlled_experiments.md](09_controlled_experiments.md) for a live before/after demonstration.

**New this session — the Flow object, examined closely:**
A Flow (contribution goal) has a **Contribution** field with 3 modes: **Maximize Contribution** ("after satisfying higher-priority flows, dedicate as much leftover income as possible"), **% of Remaining Income**, or **Specific Amount** — which itself has a **Frequency** sub-field with 7 options (Yearly "spread throughout the year" / Once Per Year "one lump sum in the start month" / Quarterly / Monthly / Bi-Weekly / Weekly / Daily), each with a one-line clarifying subtitle. Retirement-account Flows additionally show a live **Yearly Contribution Limit** rule (defaulting to "US Limit") with the actual current-year IRS limit spelled out inline, e.g. for a 401(k): *"Maximum retirement account contribution for individuals is $24,500, with total employer + employee contribution limit of $72,000, plus catch-up contributions of $8,000 (50-59), $11,250 (60-63), $8,000 (64+)."* For an IRA: *"Maximum IRA contribution for individuals is $7,500, plus catch-up contributions of $1,100 (50+). Income limits may also apply."*

## Account type catalog (confirmed, US, country-localized)

**Cash:** Savings.

**Investment:**
- Taxable Investments (tracks Cost basis)
- Individual Retirement: IRA, Roth IRA
- Employer Retirement: 401k, Roth 401k, 403b, Roth 403b, 457b, Roth 457b, 401a
- Cryptocurrency
- HSA, 529 Plan

**Real Assets (14 types, all premium-unlocked):** House, Car, **Rental Property** (premium), **Commercial Property** (premium), Land, Building, Motorcycle, Boat, Jewelry, Precious Metals, Furniture, Instrument, Machinery, Custom Asset.

**Debt (unsecured):** Debt, Student Loans, Medical Debt, Credit Card Debt.

Every account/asset/debt has an **Owner** (You/Spouse/Joint under a Couple household; just You under Individual) for tax-filing-status attribution.

## Income & Expense templates (confirmed)

**Income (10):** Salary, Hourly Wage, RSU Grant, Inheritance, Side Hustle, **Tax Credit**, **Tax Deduction**, Pension Income, Social Security, Custom Income. (Notable: Tax Credit/Tax Deduction are modeled as first-class "income" line items — negative/offsetting cash-flow entries alongside real income, not a separate concept.)

**Expenses (14):** Living Expenses, Rent, Debt, Student Loans, Dependent, Education, Health Care, Vacation, Wedding, Charity, Travel, Medical Expenses, Emergency, Custom Expense.

## Feature inventory — CORE / IMPORTANT / SPECIALIZED / NICE-TO-HAVE

### CORE (product doesn't work as a serious planner without these)
| Feature | Location | User problem it solves |
|---|---|---|
| Manual balance-sheet entry with owner attribution | Current Finances | Single source of truth for "where I stand today" |
| Income/Expense stream modeling (time ranges, growth rules, tax handling) | Plan | Models a whole working + retired life, not just today |
| Account catalog incl. retirement-account mechanics (RMD/Roth conversion/72t) | Plan → Accounts | Retirement isn't a separate module; it's the same accounts with more toggles |
| Prioritized Flows waterfall | Plan → Flows | Answers "where should my next dollar go" |
| Milestone-referenced dates | throughout | Single-lever what-ifs propagate everywhere automatically |
| Net Worth projection + Monte Carlo headline % | Plan / Chance of Success | The core "am I on track" answer |
| Tax Analytics | Plan → Tax Analytics | Real, source-attributed effective tax rates, not a guess |
| Optimize suite | Plan → Optimize | Turns "I should probably do a Roth conversion" into a concrete, numbered plan |
| Reports / Explore data table + export | Plan → Reports | Power-user verification and portability |
| Estate | Plan → Estate | Legacy planning as a first-class citizen, not an afterthought |

### IMPORTANT (major differentiators, not strictly required for v1)
- Cash Flow Sankey (visual "where does the money go" — high emotional impact, lower information-density need than Tax Analytics)
- Compare → What If (low-friction scenario testing without cloning a whole plan)
- Multiple parallel Plans
- Progress (actual vs. plan over real time)
- Flexible Spending guardrails with live Monte Carlo preview
- Drawdown Order (explicit, reorderable withdrawal-sequencing waterfall)
- Plan-health notification system (proactive Out-of-Money/Early-Withdrawal-Penalty/Milestone-never-reached warnings)

### SPECIALIZED (real, deep, but a narrower slice of users needs them)
- Rental/Commercial Property with full depreciation + QBI modeling
- Roth Conversions / Gain Harvesting drill-in views (subsumed into the Tax Strategy composite for most users)
- IRMAA/NIIT/ACA-subsidy-cliff-aware Tax Strategy constraints
- Country-localized account catalogs

### NICE-TO-HAVE
- Theme switcher, Gift a Subscription, avatar customization
- Notes fields (Plan Notes, per-object notes)
- Chart appearance customization (Display Options → Appearance/Chart Type/Y-Axis/X-Labels/Grouping)

## Input-form UX pattern (confirmed again on fresh objects this session)

Every "add X" flow follows the same progressive-disclosure shape: **Name** + **one or two headline numeric fields** shown immediately, then a stack of collapsed accordion rows (Time Range / Change Over Time / Tax Handling / More Options, or the asset-specific equivalents: Purchase / Financing / Usage / Rental Income / Sale / Recurrence) that expand independently. A 3-dot overflow menu on numeric fields offers unit-mode switching (e.g., % of Earnings vs. Amount in Today's Currency vs. Amount in Actual Currency) — the same real-vs-nominal, rate-vs-fixed flexibility applies uniformly to income growth, expense growth, and contribution sizing. This is still the single strongest transferable UI lesson in the product.

## Plan-level assumption hubs — Settings deep dive (gap-closing pass)

**[OBSERVED]** — Settings ▾ has 8 destinations, each a real route (`/plan/{id}/settings/{section}`), not just a client-side panel: **Milestones, Rates, Dividends, Bonds, Tax, Metrics, Other Settings**, then a separator, then **Notes**. Opening the dropdown itself is a simple fade/scale-in menu anchored under the tab (see [08_ui_design_and_interaction.md](08_ui_design_and_interaction.md) animation inventory). Every section shares the same left sub-nav + mini Net-Worth-chart-with-milestone-icons header at desktop width (`settings-rates.png`, `settings-dividends-full.png`, `settings-bonds.png`, `settings-tax.png`, `settings-metrics.png`, `settings-other.png`).

### Rates
Plan-wide default return assumptions, editable in **3 mutually exclusive modes** via a segmented control (Fixed / Historical / Advanced), each instantly re-rendering the header mini-chart:
- **Fixed** (default): one flat % each for Inflation, Stocks (Growth Rate + Dividend Yield, shown as two chips e.g. "7% | 1.5%"), Bonds (Growth Rate + Dividend Yield, "1.5% | 3.5%"). Drilling into Stocks or Bonds swaps the list for a **master-detail back-button panel** (not an inline accordion) showing Growth Rate and Dividend Yield as separate editable fields plus a computed, non-editable **Real Return** figure (e.g. 7% growth + 1.5% dividend − 3% inflation ≈ **5.34%** real) — confirms the app pre-computes and surfaces the inflation-adjusted return rather than leaving the user to do that math.
- **Historical**: replaces the flat rates with a specific **Historical Sequence** (a starting year, e.g. "1928") that replays actual historical annual returns in order starting from that year; Inflation/Stocks/Bonds all switch to "Default" (i.e., inherit the historical sequence's real recorded values for those years) instead of a fixed %. Selecting this mode visibly transforms the header chart from a smooth compounding curve into a jagged, realistic sequence-of-returns line — a genuinely different chart shape, not just a relabeling.
- **Advanced**: each of Inflation/Stocks/Bonds shows a small inline sparkline instead of a %, implying a fully custom rate-over-time schedule per assumption (consistent with the "Advanced" custom-schedule pattern used for income/expense growth elsewhere in the product).
- **Critical, non-obvious finding (see Experiment B below): the Rates → Stocks Fixed assumption only drives the deterministic Plan/Cash-Flow/Tax-Analytics chart. It has no effect on Chance of Success's default Monte Carlo run**, whose "Data Sources: Historical Returns" methodology resamples real historical sequences independently of this Fixed-rate setting. A Northstar spec should decide explicitly whether a single "expected return" input drives every view, or — as ProjectionLab does — the deterministic projection and the probabilistic one are allowed to disagree.

### Dividends
A single **Stock Dividend Composition** control: two linked sliders, **Qualified Dividends** (taxed at LTCG rates, defaulted to 100%) and **Ordinary Dividends** (taxed at marginal rate, defaulted to 0%), each with drag-handle + live numeric readout, plus one-line explanatory copy for each ("Most domestic equity index fund dividends are 60-95% qualified."). Only affects taxable accounts. Below that, a separate **Dividend Reinvestment** dropdown (observed value: "Always") controls whether dividends compound in-account or pay out as cash flow, with an inline note "Individual accounts can override this setting" — the inherit-or-override pattern extended to a plan-wide default no prior pass had opened.

### Bonds
A single **Bond Allocation** segmented toggle: **None** (fixture default — "Your portfolio will not use bonds by default") vs. **Portfolio Allocation**. Helper copy explicitly notes "You can also define a bond allocation for each account individually in the Accounts section" — bonds are a plan-wide default that any account's own settings can override, matching the Rates/Dividends inheritance pattern.

### Tax
Four rows: **Tax Estimation** (jurisdiction — "United States, California" for the fixture, confirming the country/state tax-bracket engine is a plan-level, not account-level, setting), **Withholding** (plan-wide defaults, observed "Tax-Deferred: 20%, Taxable: 10%" — individually overridable per Income per the original research), **Assumptions** ("Default"), **More Options**.

### Metrics
Splits into **Global Metrics** (apply across every plan in the account: **Effective Tax Rate** definition and **Spending** definition, each "Default configuration") and **Plan Metrics** (specific to this plan: **Net Legacy**, "Default configuration," which feeds the Estate module). This is a direct, load-bearing correction to earlier [INFERRED] notes in this package: the "Effective Tax Rate" and "Spending" customization panels are **Metrics** settings, not bundled under "Other Settings" as previously guessed.

### Other Settings — corrected
**[OBSERVED], superseding an earlier guess.** Other Settings is a single control: **Year Alignment** — a dropdown (observed: "Calendar year"; copy implies rolling-year and fiscal/tax-year alternatives exist) governing whether the simulation's yearly boundaries follow the calendar, a rolling 12-month window from plan start, or a different fiscal year, with a note that the first simulated year is prorated to align future years to January. A toggle, **"Override Year Alignment For This Plan,"** lets a single plan diverge from the account-wide default set in Account Settings — yet another instance of the inherit-or-override pattern, this time at the account→plan level rather than plan→item level.

*Note on a separate, always-mounted panel:* every Settings sub-page's accessibility tree also contains **Textbook Withdrawals**, **Effective Tax Rate**, **Spending**, **Estate Settings**, **Plan Notes**, and a **Tax Strategy** teaser card, identically, regardless of which Settings tab is actually open. Combined with the Metrics-tab finding above, this is best explained as a separate, persistently-mounted quick-access drawer (likely triggered by the small colored icons next to the plan title in the top toolbar, not fully exercised this session) rather than genuine content of whichever Settings tab happens to be selected — **[INFERRED]**, flagged here so a future pass can confirm the trigger.
