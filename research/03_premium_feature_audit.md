# Premium Feature Audit (High Priority)

Every item below was **paywalled/blurred in the prior free-tier research pass** and is now confirmed fully functional under premium. **[OBSERVED]** unless flagged. Priority ratings: CORE (product doesn't work without it) / IMPORTANT (major value driver) / SPECIALIZED (real but narrow audience) / NICE-TO-HAVE.

---

## 1. Cash Flow (Sankey diagram) — IMPORTANT
**Location:** Plan → Cash Flow tab.
**Purpose:** Answer "where does my money actually go this year?" at a glance.
**Inputs:** None direct — reads the current year's Income/Expense/Flow/Account state.
**Controls:** Year scrubber (circle-handle slider) below a "You NN | Spouse NN" header; the diagram re-renders per selected year.
**Output:** A left-to-right flow diagram — income sources → Earned Income → splits into Tax Withholding and Inflows → further splits into Savings/Cash/Transfers/etc. Every node shows a dollar label. Chart is wider than viewport (horizontally scrollable) for households with many flows.
**Notes:** A footnote clarifies partial-year prorating ("~4.18 months remaining in this year") with a link to a "Change in Net Worth" metric definition — a good example of the product explaining its own math inline rather than leaving it opaque.
**User value:** Turns an abstract Income/Expense/Flow list into a single intuitive picture; this is the highest-leverage "aha" screen for explaining the whole plan to a spouse or advisor in one glance.

## 2. Tax Analytics — CORE (for a serious planning tool)
**Location:** Plan → Tax Analytics tab.
**Inputs:** None direct — reads Income/Account/withdrawal state.
**Outputs:**
- 4 metric cards with inline sparkline/bar visualizations: **Legacy**, **Effective Tax Rate**, **Withdrawal Rate**, **Taxes** (segmented by tax type) — the card set is itself customizable ("4 Metrics ▾").
- **5 sub-tabs** confirmed at desktop width (not visible in the original narrow-viewport pass, which only showed the Income/All/Composition dropdowns): **Income / Taxes / Rates / Deductions / Credits** — Income Type table detail below is specifically the Income sub-tab; the other 4 were not opened this session. [see `tax-analytics-desktop.png`]
- A stacked bar chart by age (dataset/scope/view-mode dropdowns: Income / All / Composition), with the same milestone-icon overlay used on the Plan chart. At desktop width the chart shows the full plan horizon (39 years, ages 30–68 observed) with no cropping, plus a side "Notable Events" legend giving lifetime-cumulative figures per income-composition category (e.g., observed: Capital Gains Income $2.42M, Employer Contributions $690K, Wage Income $10.28M lifetime, Full Plan total $13.4M).
- An **Income Type table**: every income source (Savings Yield, Job, Stock Dividends, Employer Match, etc.) gets its OWN effective tax rate, gross income, total tax, and net income, plus a blended Total row. This "per-source marginal attribution" is the most sophisticated part of the screen.
- Top summary strip: current-year Effective Tax Rate, Capital Gains Income, RMDs, Ordinary Investment Income, Employer Contributions, cumulative Wage Income, "Next 10 Years" cumulative figure.
**User value:** Answers "am I actually paying what I think I'm paying, and from where?" — the free tier's blurred teaser undersold how granular this gets.

## 3. Chance of Success — full detail (headline % was free; everything below was premium) — CORE
**Location:** Plan → Chance of Success.
Pre-run empty state: circular "▶ Run" control + 5 config accordions (Data Sources, Methodology, Metrics, Outcome Categories, Success Rates; a "More Options" row appears post-run). At desktop width each accordion row shows its current value inline without expanding — confirmed directly (previously only inferred from post-run evidence): **Data Sources: "Historical Returns"**, **Methodology: "Historical, Random-Restart"**, **Metrics: "Net Worth, Expenses +1"**, **Outcome Categories: "Kinds of success and failure"** [`chance-of-success-desktop.png`].
**Newly-unlocked post-run detail:**
- **Percentile-band Net Worth chart** (dataset + Line/other display toggle) — ~4 fanning lines from the present (approx. 10th/25th/50th/90th percentile trajectories), not raw 196-line spaghetti.
- **Outcome-category legend with exact trial counts**, shown directly beside the donut (not just inferred from the Optimize screen) — observed on a 100%-success run: **Large Surplus 55.6% (109 trials)**, **Comfortable 44.4% (87 trials)** [`chance-of-success-result-desktop.png`].
- **Expenses before/after [Milestone] stat pair** — auto-picks a milestone (e.g., Retirement) and reports Median/Average/StdDev/Smallest/Largest expenses across all 196 trials, split by before/after.
- **Per-milestone timing-uncertainty table** — for every milestone (Financial Independence, Retirement, etc.): Earliest / Your Age / 5–95% / All, i.e., the % of trials where it fires and the age distribution when it does.
- **The literal list of the 196 historical resampling start-years** used (1928, 1929, ... with "Show More"), confirming the methodology is historical-sequence bootstrapping across every year with a long-enough remaining data window — not a synthetic/parametric Monte Carlo by default.
**User value:** Converts "93% chance of success" from a black box into an inspectable, source-cited number.

## 4. Compare → What If — IMPORTANT
**Location:** top nav "Compare ▾" → What If.
Enters a global staged-edit mode (persistent red-dot indicator on the Compare tab across every screen). Exit via a menu: **Keep Changes** / **Revert Changes** (discard back to the compared-against Baseline) / **Save as New Plan** (fork into a real second Plan, revert this one).
**User value:** Lets a user try "what if I bought a house" without fear of corrupting their real plan — the lightweight, reversible nature (vs. cloning a whole Plan) is the differentiator over just using "+ New Plan."

## 5. Optimize — the 5-tool suite — CORE (the single biggest premium differentiator)
**Location:** top nav "Optimize ▾" → Tax Strategy / Flexible Spending / Roth Conversions / Drawdown / Gain Harvesting.

All 5 are facets of **one shared composite Tax Strategy object** — editing any one edits the others' shared state; each sub-screen shows a "← [X] — Viewing Y only. Go back to view combined impact." breadcrumb.

### 5a. Tax Strategy
Setup wizard offers 3 entry points: **New strategy** (custom target/constraints), **Common strategy** (13 pre-built named presets), **Optimize** (auto-solver, see 5f).
**13 preset strategies** — real retirement-tax-planning patterns: bracket-ceiling Roth-conversion "shield" strategies at 12/22/24%, harvest-capital-gains variants (0%/15% LTCG thresholds), IRMAA-cliff-aware variants, "under all ceilings" variants respecting NIIT + IRMAA + ACA simultaneously, and pure withdrawal-shielding-only variants (10%/35%).
**Custom strategy builder** — Target (e.g., "Fill a specific marginal tax bracket each year" → bracket %), optional Capital Gains Bracket, Avoid NIIT toggle, Avoid IRMAA Surcharges toggle, Preserve ACA Subsidies toggle, optional Time Range scoping.
**Applied-strategy dashboard** — 4 component cards (Tax Strategy/Roth Conversions/Withdrawal Shielding/Gain Harvesting) each with a mini sparkline and, confirmed at desktop width, an explicit **Active/Off status badge** per card (`optimize-tax-strategy-applied-desktop.png` shows Roth Conversions: Active, Withdrawal Shielding: Active, Gain Harvesting: Off for a "Convert and shield to 22%" preset — i.e. each preset activates only the sub-strategies it actually needs, visibly); immediate outcome-delta cards ("$425.1K more in taxes" / "$452.5K lost in net legacy" in one observed run, "no change in taxes" / "no change in net legacy" in another — the exact delta is plan-state-dependent, not fixed per preset; red thumbs-down when a strategy underperforms, a neutral gray dot when it's a wash); a Net Worth Distribution table by the same 6 graded outcome categories used elsewhere.
Priority: CORE for any planning tool aiming at the "should I convert to Roth" audience — this is table stakes for a serious FIRE/retirement planning tool.

### 5b. Flexible Spending — IMPORTANT
Toggle None/Flexible. "Guardrails"-style dynamic spending: rule builder ("When performance is X% → flex discretionary spending Y%", stackable via "Add Rule"), optional Time Range scoping, Settings (Scope: Discretionary Spending; Interpolation: Step), and a **live in-editor Chance-of-Success preview** comparing No-Flex vs. Flex success rates as you tune the rule (a reduced-trial fast simulation, ~98 trials, re-runs live).

### 5c. Roth Conversions (drill-in view)
Strategic Conversions total (dot-matrix/waffle viz), Conversion Sources (which accounts, proportion bar), a Conversion Plan chart (bars/line by age, duration badge).

### 5d. Drawdown — IMPORTANT
**Withdrawal Shielding** toggle — caps tax-deferred withdrawals at the shared strategy's bracket target, shifting excess need to tax-free sources.
**Drawdown Order** — an explicit, reorderable 11-step withdrawal-sequencing waterfall: Excess Cash on Hand → Cryptocurrency → Taxable Investments → Qualified HSA → Qualified Tax-Deferred → Qualified Roth IRA → Past Roth IRA Contributions → Early Tax-Deferred → Early Roth → Non-Qualified HSA → Any Remaining Cash. Each rung shows a per-source mini sparkline of $ withdrawn over time.
**Textbook Withdrawals** toggle — overrides most normal plan events from a chosen age onward to compare a "textbook" strategy against the actual plan.

### 5e. Gain Harvesting
Total Gains Harvested (waffle viz with per-year tooltip), Harvesting Sources count, Harvesting Plan (empty-state pattern when inactive).

### 5f. Optimize (auto-solver) — IMPORTANT, novel
**6 objectives:** Lower lifetime taxes / Higher net legacy / Higher net worth / Lower effective tax rate / Lower RMDs / Reduce IRMAA surcharges.
**4 search-depth tiers:** Quick ⚡ / Standard 🐇 (default) / Deep 🔭 / Extreme 🔥 — explicitly disclosed as **beam search** over the strategy space ("none can guarantee an absolutely optimal result" — an honest disclaimer).
**Result:** headline $ delta, "N strategies evaluated," a Winner card (named preset + Apply strategy / Explore alternatives buttons), and a before/after comparison chart.

## 6. Reports — CORE
**Location:** top nav Reports. Sub-nav: **Explore** (full year-by-year data table: Year, Net Worth, Liquid Net Worth, Income, Expenses, Taxes, Effective Tax Rate, Savings Rate, Withdrawals, Withdrawal Rate, Contributions, Transfers — every row of the plan horizon) / **Summary** (default chart + table view) / **Plots** (the ~25-item Built-in Plots library: Net Worth, Stacked Net Worth, Income, Expenses, Spending, Spending Overview, Discretionary/Essential Spending, Spending Flex, and more).
**Export:** CSV / JSON / PDF, via a download-icon menu.
**User value:** The power-user "give me the spreadsheet" screen; JSON export signals the product expects some users to pipe data into their own tools.

## 7. Estate — CORE, entirely unexplored territory pre-premium
**Location:** top nav Estate. Full detail in [06_retirement_estate_life_events.md](06_retirement_estate_life_events.md).
Summary: Gross Estate / Estate Drag / Net Legacy metric cards with rings/progress bars; 3 auto-generated plain-English insight cards (including a real, current federal-estate-tax-exemption comparison, "$30M" — i.e. the 2026 post-OBBBA-doubled exemption level); an Estate Flow Sankey; an itemized Breakdown table (Item/Gross/Costs/Net, incl. Federal Estate Tax and Admin Costs rows); an Assumptions panel (Tax-Deferred Rate, Capital Gains Rate, Stepped-Up Basis, Asset Liquidation %, Charitable Giving %, Admin Costs %); and a fuller auto-generated Insights bullet list restating every number in plain English at least once.

## 8. Progress — IMPORTANT
**Location:** sidebar → Progress.
Net worth over real calendar time (1M/3M/1Y/5Y/10Y/ALL range selector, same chart component as Dashboard), plus a **Progress Points** table: automatically-created historical snapshots (Date/Net Worth/Assets/Liabilities) generated whenever Current Finances is updated, each row with a 3-dot menu.

## 9. Multiple Plans — CORE
**Location:** sidebar → Plans → + New Plan.
"Create Plan" modal: name, source (Start from scratch → full onboarding wizard, or Copy of an existing Plan → clone), Notes, "Show Advanced Options" gear. Confirms Current Finances is shared across all Plans (see [02_application_sitemap.md](02_application_sitemap.md)).

## 10. Premium Real Asset types — SPECIALIZED but genuinely deep
**Rental Property / Commercial Property** — not just extra icons. Rental Property gets a dedicated **Rental Income** section: Yearly Income (% of Value, default 8%), Property Management Costs, Self-Employment Income toggle, **Estimate Rental Deductions** toggle (auto tax deductions for depreciation/mortgage interest/other expenses, ON by default), **Apply QBI Deduction** toggle (Section 199A, up to 20% of qualified business income), Initial Building Value, and a **Tax Treatment** selector defaulting to "Residential property with a useful life of 27.5 years" (real IRS MACRS schedule; commercial presumably maps to 39 years, not directly confirmed [INFERRED]).

---

## What was already free (confirmed, for contrast)
Manual balance-sheet tracking, full Income/Expense modeling, full Account catalog, prioritized Flows, rule-based Milestones, the single Net Worth chart, the Monte Carlo headline % + narrative sentence, country/localization switching. See the prior free-tier document for full detail on these — this audit only covers what changed.
