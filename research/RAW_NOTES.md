# Raw observation log — Premium ProjectionLab research

Account confirmed: existing "Mid Career, Married" sandbox persona already loaded (You 47/Jan1979, Spouse 44/Jan1982, CA, USD). Net worth $1.24M (Savings $60K, Investments $628K, Real Assets $547K, Debts $0). Plan: "Current Projections". This is fictional persona data carried over from a prior free-tier research session — safe to explore/reuse.

Premium is CONFIRMED ACTIVE: top nav shows Plan / Cash Flow / Tax Analytics / Chance of Success / Compare / Optimize / Reports / Estate / Settings with NO lock/rocket icons and Cash Flow Sankey renders fully live (unblurred), unlike prior free-tier research where these were paywalled.

## Plan > Cash Flow (Sankey) [OBSERVED]
- Header: "You 47 | Spouse 44" · year "2026" with a scrubber/slider (circle handle) below — implies a year-by-year Sankey, one year at a time, scrollable through the plan horizon.
- Sankey nodes (left→right): My Job $150K, Spouse's Job $135K → Earned Income $285K → splits to Tax Withholding $71.25K and continues to Inflows $230.55K node.
- Employer Match: 401k/403b $10.8K and $6K (two separate employer accounts) → Other Inflows $16.8K → Inflows.
- Savings $35.01K → Cash $35.01K → Transfers $35.01K → (continues off right edge of viewport, chart is wider than viewport / horizontally scrollable).
- Footnote: "Note: the impacts of some events may be prorated based on ~4.18 months remaining in this year. See the Change in Net Worth metric for more details." — links out to a metric definition.
- This directly matches and CONFIRMS the prior free-tier research's inferred description (paywalled screenshot) — now verified live with real numbers.

## Settings drawer (captured via page text before opening panel visually — settings icon top right, the sliders icon) [OBSERVED]
Rich premium plan-level settings surfaced:
- **Textbook Withdrawals**: "Use a Textbook Withdrawal Strategy" toggle — overrides most normal plan events (expenses, asset purchases, transfers) starting at a defined age, to compare a textbook strategy vs the actual plan. Links to further docs ("Withdrawal Strategy Mode").
- **Effective Tax Rate customization**: toggles for what counts toward Total Income (Return of Capital, Non-Taxable Sale Proceeds, Tax-Free Distributions) and Total Taxes (Local Income Tax, Property Tax), and what counts as Spending (Tax Liability, Mortgage Payments, Mortgage Principal, Consumer Debt Principal). Note: "Rental property costs are always excluded from spending. For mixed-use (house hacking), the personal-use portion of eligible costs will be included."
- **Estate Settings**: configures how estate value is estimated at plan end, feeding a "Net Legacy" metric (net estate value after taxes/costs/debt). Sub-settings: Tax-Deferred Account Tax Rate (heirs pay ordinary income tax on full balance), Taxable Accounts + Stepped-up Basis toggle, Liquidation Costs (real estate/asset sale transaction costs), Charitable Giving % of gross estate (auto-allocated from most tax-inefficient accounts first), Administrative Costs (probate/legal/executor fees as % of gross estate).
- **Plan Notes**: free-text field "Document your assumptions, goals, or anything you want to remember about this plan."
- **Tax Strategy** section teaser: "Optimize — Find the best strategy" / "Compare — Explore alternatives" / "No tax strategy configured. Set one up from the Tax Strategy page." — links to Optimize.

## Plan > Tax Analytics [OBSERVED]
- Header "Plan Totals" dropdown + "4 Metrics" dropdown (customizable metric cards).
- 4 metric cards, each with an inline sparkline/bar visualization: **Legacy** $8.54M, **Effective Tax Rate** 17.37% (line sparkline trending up), **Withdrawal Rate** 2.70% (bar), **Taxes** $2.13M (segmented multi-color bar — by tax type).
- Chart filter row: "Income" / "All" / "Composition" dropdowns (dataset picker, scope picker, view-mode picker) driving a stacked bar chart by age (colors = income components), with milestone icons plotted above bars (same icon vocabulary as Plan chart) and a "Notable Events" toggle/legend.
- Below chart: **Brackets** view and an **Income Type table**: per-source row (Savings Yield, Spouse's Job, Stock Dividends, My Job, 2x Employer Match) × columns (Effective Tax Rate %, Gross Income, Total Tax, Net Income), with a Total row (25.12% blended effective rate). Interesting: each income *source* gets its own effective tax rate (e.g., Savings Yield 37.10% vs My Job 18.79%) — implies marginal-stacking tax attribution per source, not just a single blended number.
- Top summary strip also shows: Effective Tax Rate 25.7% (current-year, differs from Plan Totals card which may be lifetime-average), Capital Gains Income $113,676, RMDs $0, Ordinary Investment Income $216, Employer Contributions $182,597, Wage Income $3,097,621 (lifetime cumulative?), "Next 10 Years" $3,394,110 cumulative figure.
- Standard disclaimer footer: "All tax calculations are estimates for educational purposes only. ProjectionLab does not give, offer, or render financial, tax, or legal advice."
- Confirms per-account Settings drawer content (Textbook Withdrawals, Effective Tax Rate customization, Estate Settings, Plan Notes, Tax Strategy teaser) is shared/global across tabs (same DOM persists).

## Plan > Chance of Success (Monte Carlo) — FULL PREMIUM DETAIL [OBSERVED]
- Pre-run empty state: large circular progress ring placeholder, "▶ Run" button center, explainer paragraph, and 5 config rows (accordion, icon + label + chevron): Data Sources, Methodology, Metrics, Outcome Categories, Success Rates (+ "More Options" appears post-run).
- Post-run: donut fills to result color, headline sentence ("This chance of success looks excellent. Your portfolio survived 100% of the time, based on 196 trials using historical returns data." — "excellent" and "100%" and "196" are inline links, presumably to definitions), refresh + settings gear icons top-right.
- **Net Worth percentile-band chart** (dropdown: dataset picker "Net Worth" + display picker "Line") — this is the previously-paywalled outcome-distribution chart. Shows ~4 lines fanning out from the present (looked like ~10th/25th/50th/90th percentile bands) rather than 196 individual spaghetti lines — a smoothed percentile-band rendering, not raw spaghetti.
- **Expenses before/after [Milestone]** stat card pair: auto-picks a milestone (here "Your Retirement") and reports Median/Average/Standard Deviation/Smallest/Largest expense figures across all 196 trials, split before vs after that milestone.
- **N Milestones section**: table of every milestone with columns Earliest / Your Age / 5-95% / All — i.e., for each milestone (Financial Independence, Spouse's Retirement, Your Retirement) shows the % of trials it fires ("Always"/100%) and the Age at which it lands — this is how the tool communicates timing *uncertainty* per milestone, not just portfolio survival.
- **196 Trials index list**: literal list of historical start-years used for resampling (1928, 1929, 1930, ... 1963, "Show More") — confirms Methodology = historical-sequence resampling ("random-restart" bootstrapping across every historical starting year with enough remaining data), not synthetic/parametric Monte Carlo by default.
- Footer disclaimer: "For educational purposes only. ProjectionLab does not give, offer, or render financial, tax, or legal advice. Past performance does not guarantee future results."
- Baseline for this persona: **100.00% success** (196/196 trials), notably different/better than the 93.37% baseline the earlier free-tier research observed on what looks like the same/similar sandbox persona — either persona defaults drifted, or something in this account's plan differs (e.g., retirement age already delayed to 66 vs 56 originally tested). Confirms Section 16 controlled-experiment methodology: single-lever changes (retirement age) move this number a lot.

## Plan > Compare [OBSERVED, partial]
- "Compare" tab-bar item is a dropdown (chevron), not a direct page. Opening it shows one option so far: **What If** — "Make changes and see how they compare to the current state, with the option to roll back." Icon: two overlapping panels/arrows.
- Clicking "What If" routed back to the Plan tab; no obvious mode-change banner appeared in the viewport captured (625px-tall practical viewport in this pane, possibly clipping a banner). [UNKNOWN] whether a full second comparison plan/state is created immediately or only after an edit is made — needs a follow-up test: make an edit after entering What-If and see if a "vs Current" diff bar appears.
- This single "What If" is the ONLY Compare mechanism observed so far — no separate "multiple Plans" comparison surfaced in this dropdown; multi-Plan comparison instead lives at the Dashboard level (sidebar "+ New Plan"), consistent with prior free-tier research.

## IMPORTANT: What-If mode confirmed active [OBSERVED]
After clicking Compare > What If earlier, the **Compare tab nav item now permanently shows a red circular "recording" dot** next to the label ("● Compare") and stays highlighted/active while navigating to other tabs (seen on Optimize screen). This is the mode indicator I was looking for — What-If mode is a *global sticky state* across the whole plan, not scoped to one tab. Need to find its exit/rollback control (likely inside the Compare dropdown, now probably showing "Exit What If" / "Save" / "Discard" options instead of "What If").

## Plan > Optimize [OBSERVED]
Dropdown menu (from top nav "Optimize ▾"): **Tax Strategy, Flexible Spending, Roth Conversions, Drawdown, Gain Harvesting** — 5 sub-tools, each with its own icon (sparkles-lines, shopping-cart, bank-transfer, watering-can/plant, seedling).

### Optimize > Tax Strategy — setup screen [OBSERVED]
Headline "Set up your tax strategy" / "Discover savings and tax planning opportunities to help you reach your goals." Three entry-point cards:
1. **New strategy** — "Build your own tax strategy with specific targets and constraints." (icon: sliders)
2. **Common strategy** — "Choose a pre-configured retirement tax planning strategy." (icon: people)
3. **Optimize** — "Test multiple strategies and estimate the best one for your goals." (icon: sparkles) — this is the auto-optimizer/solver.
A top progress-dot indicator ("● ○") suggests this is step 1 of a 2-step wizard.

### Optimize > Tax Strategy > Common Strategy — 13 pre-built strategy templates [OBSERVED]
List (step 2 of wizard, "Choose your strategy"):
1. Convert and shield to 12% — "Convert to Roth and cap tax-deferred withdrawals up to the 12% bracket ceiling."
2. Convert and shield to 22%
3. Convert and shield to 24%
4. Convert, shield, and harvest to 12% — "...harvest capital gains at the 0% rate up to the 12% bracket ceiling."
5. Convert, shield, and harvest to 22% — "...harvest capital gains at the 15% rate up to the 22% bracket ceiling."
6. Convert, shield, and harvest to 24%
7. Convert and shield below IRMAA cliff 1 — "keeping income below the first IRMAA surcharge cliff."
8. Convert and shield below IRMAA cliff 2 — "...second IRMAA surcharge cliff."
9. Convert, shield, and harvest to 12% under all ceilings — "Respect NIIT, IRMAA, and ACA ceilings."
10. Convert, shield, and harvest to 22% under all ceilings
11. Convert, shield, and harvest to 24% under all ceilings
12. Shield to 10% — cap tax-deferred withdrawals to 10% bracket ceiling only (no conversion)
13. Shield to 35%
This is genuinely sophisticated retirement-tax-planning domain knowledge baked into product templates: bracket-ceiling Roth conversion laddering, 0%/15% LTCG harvesting thresholds, and awareness of NIIT (Net Investment Income Tax), IRMAA (Medicare premium surcharge cliffs), and ACA (subsidy cliff) as *constraints* a strategy must respect. [OBSERVED]

### Optimize > Tax Strategy — applied-strategy dashboard (selected "Convert and shield to 22%") [OBSERVED] — MAJOR FINDING
- 4 component cards summarizing the composite strategy, each with a mini inline chart and drill-in arrow: **Tax Strategy** (badge "22%"), **Roth Conversions** (step-shaped sparkline), **Withdrawal Shielding** (flat line), **Gain Harvesting** (flat/inactive line) — a tax strategy is a bundle of up to 4 independently-toggleable sub-strategies.
- **Immediate outcome-delta cards** (red thumbs-down icon when negative): "$425.1K more in taxes — Your strategy costs you an additional $425,110 in taxes over the life of your plan." and "$452.5K lost in net legacy — Your strategy reduces what you leave behind by $452,538." i.e. for THIS persona (already near-optimal / 100% success), a generic 22%-bracket-fill preset is actually worse than doing nothing — a valuable, honest negative result, not just sales-positive framing.
- Chart filter row: Income / Federal / Rates dropdowns + a filter badge ("1" = 1 active filter) + a compare icon + a chart-type icon, driving a stacked bar chart (olive-green) by age with milestone icons above bars — same visual language as Tax Analytics.
- **Optimize** and **Compare** action rows beneath: "Optimize — Find the best strategy for your goals" and "Compare — Explore and compare alternative strategies", plus a "No Change" baseline option.
- **Chance of Success impact**: With Strategy 100.0% vs No Strategy 100.0% ("No Change" — ceiling effect, this persona already always succeeds).
- **Net Worth Distribution / Outcome table — CONFIRMS the "kinds of success/failure" gradation inferred (not verified) in the prior free-tier research.** Six named outcome buckets, each row = % With Strategy | % No Strategy | Delta:
  - Large Surplus: 35.7% / 39.8% / -4.1%
  - Comfortable: 64.3% / 60.2% / +4.1%
  - Barely Made It: 0.0% / 0.0% / No Change
  - Almost Made It: 0.0% / 0.0% / No Change
  - Failed in the Middle: 0.0% / 0.0% / No Change
  - Failed Early: 0.0% / 0.0% / No Change
  This is the real Monte Carlo outcome taxonomy: success is graded (Large Surplus > Comfortable) and failure is graded by *when* it happens (Failed Early is worse than Failed in the Middle), not a flat binary. Important model concept for Northstar.
- Footer restates the two headline deltas + "Details" link + "39 years" (plan horizon length).

### Tax Strategy edit panel (target/constraints form, reached via the "22%" card or pencil) [OBSERVED]
- **Target** (single-select): "Fill a specific marginal tax bracket each year" (implies other target modes exist, not yet enumerated) → **Tax Bracket** selector, currently 22% — "Fill this marginal rate without crossing into the next."
- **Capital Gains Bracket** — "Stay within a specific capital gains tax bracket" (separate optional constraint)
- **Avoid NIIT** toggle — "Cap investment income to avoid the 3.8% net investment income tax."
- **Avoid IRMAA Surcharges** toggle — "Cap income to avoid Medicare premium surcharges."
- **Preserve ACA Subsidies** toggle — "Cap income to preserve subsidies in years with ACA marketplace coverage."
- **Time Range** — "Strategy activity may occur any time during the plan" + "Add Time Range" (can scope the strategy to specific years, e.g. only the Roth-conversion window between retirement and RMD age).
This is a constraint-solver style config: one Target metric plus a stack of independent ceiling constraints, very similar in spirit to the Monte Carlo config pattern (composable, named checkboxes with plain-English tooltips for tax-code concepts).

### Optimize > Optimize (auto-solver) [OBSERVED] — MAJOR FINDING
Step 1 "Define your objective" — 6 goal choices, each single-select card:
1. **Lower lifetime taxes** — "Cumulative tax liability over the life of your plan"
2. **Higher net legacy** — "Estate value after taxes, costs, and debt"
3. **Higher net worth** — "Total assets minus liabilities at end of plan"
4. **Lower effective tax rate** — "Average effective tax rate across your plan"
5. **Lower RMDs** — "Required Minimum Distributions are minimum amounts that a retirement account owner must withdraw annually, starting at a specific year."
6. **Reduce IRMAA surcharges** — "Income-related monthly adjustment amount (IRMAA) is a medicare surcharge for high-income earners."

Step 2 "Launch your search" — 4 depth/compute tiers, each a card: **Quick** ⚡ "Get fast results based on typical strategies" / **Standard** 🐇 "Explore common brackets, modules, and constraints" (default-selected) / **Deep** 🔭 "Search deeply for the best performing strategy options" / **Extreme** 🔥 "Test the widest range of configurations using a longer run time." Explainer discloses the actual algorithm: **"We'll explore a large space of possible strategies using a beam search, and progressively narrow down the best candidates. Deeper searches explore more of the strategy space, but none can guarantee an absolutely optimal result."** — notably honest about non-optimality.

Result screen (chose objective=Higher net legacy, depth=Quick, ~2s run):
- Big reveal number: **"$1.15M — Gained in net legacy vs. current settings."** / "51 strategies evaluated."
- **Winner card** (badge "★ Winner"): "Convert and shield to 24%" — "Convert to Roth and cap tax-deferred withdrawals up to the 24% bracket ceiling." badge "24%", with **Apply strategy** (primary black button) and **Explore alternatives** (secondary outline button).
- Below: restated "$1.15M gained in net legacy ▾" (dropdown — can retarget which metric's delta is displayed) with thumbs-up icon (blue, positive) and a comparison area chart (dashed line = baseline, solid = winning strategy) trending from ~$2.2M to $2.8M+.
- Confirms the optimizer is literally grid/beam-searching over the same named preset family (12-ish bracket-ceiling variants × modules) rather than a free-form numeric optimizer — the "New strategy" builder's parameters ARE the search space.

## Plan > Reports [OBSERVED]
- Sub-nav: **Explore / Summary / Plots** (Summary is default-selected, black pill). Toolbar: fullscreen icon, download icon, 3-dot overflow.
- **Export formats confirmed via download icon: CSV, JSON, PDF** (icons: spreadsheet, curly-braces, PDF doc).
- **Plots dropdown ("Built-in Plots")** — this is the ~25-item chart-dataset library referenced by name throughout the app (Plan chart, Tax Analytics, Optimize, etc.), scrollable list, observed items: Net Worth, Stacked Net Worth, Income, Expenses, Spending, Spending Overview, Discretionary Spending, Essential Spending, Spending Flex, (list continues beyond viewport — matches/exceeds prior free-tier count of ~25).
- **Explore tab = the full year-by-year data table**, columns: Year, Net Worth, Liquid Net Worth, Income, Expenses, Taxes, Effective Tax Rate, Savings Rate, Withdrawals, Withdrawal Rate, Contributions, Transfers. Runs "Start" (pre-plan snapshot) then every year 2026→2064 (39 rows = 39-year horizon, matches Chance-of-Success footer). Fully real numbers, e.g. 2026: NW $1,288,480, Income $304,205, Expenses $127,388, Taxes $84,151, Eff. Tax Rate 25.0%, Savings Rate 29.2%. Notice Savings Rate hits 0.0% and Withdrawal Rate turns positive starting ~2038 (retirement transition visible directly in the table), and by 2060+ Effective Tax Rate drops to 0.0% (all-Roth/tax-free withdrawal phase after conversions complete).
- This table view is effectively the CSV-export content rendered live in-app — "Explore" is a power-user pivot-table-style view of the underlying projection.

## Plan > Estate — full premium module [OBSERVED] — MAJOR FINDING (previously entirely unexplored/unknown)
- 3 metric cards: **Gross Estate** $7.13M (progress bar), **Estate Drag** $123.69K (2%, ring), **Net Legacy** $7.01M (98%, ring — this is the "Legacy" figure also surfaced in Tax Analytics Plan Totals).
- 3 auto-generated plain-language insight cards with icons: "Your heirs receive **98%** of your gross estate." / "**88%** of your estate is in tax-free accounts, which pass to heirs free of income tax." / "Your taxable estate of **$7.13M** is **under** the federal estate tax exemption of **$30M**." — note the app knows and applies the current federal estate tax exemption ($30M, i.e. 2026 post-OBBBA doubled exemption level) as a real threshold.
- **Estate Flow** Sankey chart (sparkle icon top-right — likely an "AI insight" or regenerate affordance, not yet tested) — Gross Estate $7.13M splits into Tax-Free Investments $6.25M, Real Assets $872.69K, Cash $5.76K.
- **Breakdown table** (grid/list view toggle icons): every estate component itemized — Item / Gross / Costs / Net. Rows: Roth IRA $2.74M, Roth IRA $2.61M, Roth IRA $905.91K, House $872.57K (Costs: -$52.35K liquidation), Savings $5.76K, Spouse's Car $118 (-$7), Federal Estate Tax $0, Admin Costs (-$71.33K). Total row: $7.13M gross / ($123.69K) costs / $7.01M net.
- **Assumptions panel** (mirrors the Settings > Estate Settings drawer, scoped to this plan): Tax-Deferred Rate 25%, Capital Gains Rate 15%, Stepped-Up Basis Yes, Asset Liquidation 6%, Charitable Giving 0%, Admin Costs 1%.
- **Insights** section (separate from the 3 top cards, a fuller auto-generated bullet list): restates heirs %, tax-free %, exemption comparison, then adds: "Gross estate value is $7.13M." / "Admin costs reduce the estate by $71.33K." / "Liquidation costs reduce the estate by $52.36K." / "Net legacy is $7.01M." — reads like a templated NLG (natural-language-generation) summary over the same numbers already shown in the cards/table, i.e. the product deliberately restates every number in plain English at least once — a strong "translate the spreadsheet into sentences" pattern worth carrying into Northstar.
- Disclaimer footer variant: "...does not give, offer, or render financial, tax, **estate planning**, or legal advice."

### Optimize > Flexible Spending — resolves prior [INFERRED] item [OBSERVED]
- Toggle: **None** / **Flexible**.
- Explainer: "Dynamically adjust discretionary spending based on portfolio performance. Set up rules that respond to market conditions, spending more when the market is high or tightening your belt when the market is down." — this is the classic retirement "guardrails" strategy (Guyton-Klinger style), and it directly consumes the Expense **Flexibility** field (Essential/Discretionary/Hybrid/Not Spending) documented in the free-tier research — CONFIRMED that field feeds this feature.
- Rule builder: "When performance is **20%**" (a threshold, direction unclear from text alone — likely 'above/below a target') → "Flex discretionary spending **30%**" (adjust spending by this %), plus **Add Rule** (multiple threshold bands, i.e. can stack more than one guardrail).
- **Time Range**: scope the flex-spending behavior to part of the plan (default: "throughout the entire plan") + Add Time Range.
- **Settings**: Scope (Discretionary Spending — implies other scopes selectable), Interpolation (Step — implies smooth/linear alternative exists).
- **Live Preview**: a "Spending Overview" chart plus a **Chance of Success comparison run live in the editor** — "No Flex: 100% (Waiting...)" vs "Flex: 100% (Trial 64 of 98)" — the Monte Carlo re-runs in real time (98 trials, fewer than the full 196 — a reduced-trial fast preview) as you tune guardrail parameters, so the user sees the success-rate impact of a spending rule before committing. Strong "instant feedback on a lever" pattern, same spirit as the Optimize solver preview.

### Optimize > Roth Conversions (drill-in of combined strategy) [OBSERVED]
- Header card: "Tax Strategy — Viewing Roth Conversions only. Go back to view combined impact." (breadcrumb/back arrow) — confirms the 4 Optimize sub-tools (Tax Strategy/Roth Conversions/Withdrawal Shielding/Gain Harvesting) are FACETS of one underlying composite Tax Strategy object, not independent settings — editing any one edits the shared strategy.
- **Strategic Conversions** card: $2M total, rendered as a dot-matrix/waffle chart (filled dots = portion of total already scheduled).
- **Conversion Sources** card: badge "🏦 2" (2 source accounts), horizontal proportion bar (two segments, dark/light purple) showing the split between the two 401k/403b-type accounts being converted.
- **Conversion Plan** chart: bar/line by age, "16 years" duration badge, collapsible (chevron).
- Same negative-outcome-delta framing as the combined view ($425.1K more in taxes / $452.5K lost in net legacy) — since this persona's baseline is already optimal, every preset strategy variant looks worse here.

### Optimize > Drawdown → "Withdrawal Shielding" + "Drawdown Order" [OBSERVED] — MAJOR FINDING
- **Withdrawal Shielding** toggle Off/On. Explainer: "Cap tax-deferred withdrawals at your tax strategy target each year. When the cap is reached, remaining withdrawal needs shift to tax-free sources if available." Linked to the shared Tax Strategy target (22% badge here too) + its own optional Time Range scoping.
- **Drawdown Order** — an explicit, numbered **11-step withdrawal sequencing waterfall** (icon strip suggests drag-to-reorder), in this account's current order:
  1. Excess Cash on Hand
  2. Cryptocurrency Withdrawals
  3. Taxable Investment Withdrawals
  4. Qualified HSA Distributions
  5. Qualified Tax-Deferred Withdrawals
  6. Qualified Roth IRA Withdrawals
  7. Past Roth IRA Contributions
  8. Early Tax-Deferred Withdrawals
  9. Early Roth Withdrawals
  10. Non-Qualified HSA Withdrawals
  11. Any Remaining Cash
  This is real retirement-withdrawal-sequencing domain expertise (distinguishing qualified vs early, contributions vs earnings for Roth basis withdrawals, HSA qualified-vs-non-qualified) expressed as a single reorderable list — a very clean UI solution to a notoriously complex planning problem.
- **Textbook Withdrawals** toggle (Off) — same feature described in the Settings drawer; sits inside Drawdown, not just Settings.
- For this persona: "no change in taxes" / "no change in net legacy" — withdrawal shielding is currently a no-op because the plan hasn't reached the tax-deferred withdrawal phase differently than default ordering already does.
- "Shielding Plan" card: "No planned withdrawal shielding" empty state + "Withdrawals / Categories" toggle + "Details" link + "39 years" footer (consistent plan-horizon figure throughout).

### Optimize > Drawdown Order detail screen [OBSERVED]
Each of the 11 drawdown-order rungs is its own card with icon, rank number, name, a 3-dot menu, and a per-source **mini sparkline of $ withdrawn from that source over the plan timeline** (e.g. "Excess Cash on Hand" spikes early then flattens; "Qualified HSA Distributions" stays at $0 then steps up late). Implies drag-to-reorder (visual affordance) though drag wasn't tested directly.

### Optimize > Gain Harvesting [OBSERVED]
- **Gain Harvesting Settings**: Off (currently inactive for this persona).
- **Total Gains Harvested**: $0, dot-matrix/waffle viz (hovering a dot shows a year+value tooltip, e.g. "2054 $0").
- **Harvesting Sources**: 0, empty proportion bar.
- **Harvesting Plan**: empty state — sparkle-chart icon + "No planned gains harvesting" (clean, consistent empty-state pattern reused across Drawdown/Gain Harvesting when a strategy component is inactive).
- Confirms all 4 Optimize sub-tools (Tax Strategy/Roth Conversions/Withdrawal Shielding/Gain Harvesting) share one back-navigation pattern: "← [Tool name] — Viewing X only. Go back to view combined impact." with 3 small colored icon badges (unlock/shield/plant) indicating which of the 3 non-Tax-Strategy modules are active.

## Compare > What-If exit menu [OBSERVED] — resolves earlier open question
Clicking the red-dot "Compare" tab while active opens: "Comparing to **Baseline**" header + 3 actions:
1. **Keep Changes** (black checkmark icon) — "Leave comparison mode and continue with the modified plan."
2. **Revert Changes** (red undo icon) — "Revert to the original version of the plan that you have been comparing against."
3. **Save as New Plan** (blue fork icon) — "Spin off the current state into a separate plan, and revert this plan back to its original state."
This fully confirms the prior free-tier research's inferred "diff/undo model" for What-If: it's a lightweight staged-edit mode with three clean exits (commit in place / discard / fork into a real second Plan) rather than a permanent branch. Reverted changes here to leave the sandbox persona's baseline plan clean.

## FICTIONAL USER SETUP — Plan "Northstar Fixture - Single 30" (New Plan wizard, "Start from scratch")
- Sidebar → Plans → **New Plan** opens a "Create Plan" modal: Plan name field, a "New Plan ▾" source-picker (**New Plan — "Start from scratch"** vs **Copy of [existing plan] — "Create a clone of your existing plan"**), Notes field, gear icon "Show Advanced Options". Confirms: Plans do NOT get their own household — Current Finances (people, balances) is account-wide/global and shared by every Plan; only the plan-specific objects (Income/Expenses/Accounts-in-plan/Milestones/Flows) are created fresh.
- Creating a plan launches the SAME onboarding wizard used for account setup, now scoped to just this plan — **"Let's make a plan." / "During the next few steps, you'll define the key elements needed to start making projections. These can always be changed later."** 6-step dot progress: **Milestones → Income → Flows → [more]**. (Expenses/Accounts did not appear as their own top-level wizard steps in this run — accounts get created inline from within a Flow's "+Add" picker instead; Expenses presumably comes later — see below.)
- **Milestones step**: pre-populated from the shared household (still showing the Mid-Career couple's ages/retirement dates at this point, since About You hadn't been changed yet) — Your Retirement (at date), Spouse's Retirement, Your/Spouse's Life Expectancy (default age 85), Financial Independence (Net Worth >= **25** × Spending — note: 25x here vs 20x seen in the earlier free-tier research session, i.e. this multiplier is itself a user-editable default, not fixed).
- **Income step**: "Add Income" → **10 income templates**: Salary, Hourly Wage, RSU Grant, Inheritance, Side Hustle, Tax Credit, Tax Deduction, Pension Income, Social Security, Custom Income. (Tax Credit/Tax Deduction as "income" types is notable — modeled as negative/offsetting cash-flow items alongside real income, not as a separate concept.) Added **Salary** $100,000/yr for "You"; wizard default Time Range = "Before Current Year → Your Retirement", default growth = **"Increased to match inflation"** (this is the true out-of-the-box default — the earlier free-tier research's "Increase 4.5%/yr capped at $215K" was evidently a persona-specific customization, not the template default).
- Each wizard step shows a **live preview** below the form (Net Worth + relevant metric mini-charts, e.g. Income) that updates immediately as fields are added — reinforces the "always show the live consequence of what you just entered" pattern seen everywhere else in the product.
- **Flows step**: "Where do you want your money to go? Build an emergency fund, invest extra income, contribute to retirement accounts, and more. Add the goals that matter to you and arrange them in priority order. Available income is allocated from top to bottom." Default fallback flow already present: **"Save anything left over"** (a catch-all savings goal, editable/removable via dropdown). "+ Add Flow" opens a picker with two tabs:
  - **Existing** — route money to an account already in Current Finances: Cash, Taxable Investments, Individual Retirement Accounts, Employer Retirement Accounts, Cryptocurrency, Financed Assets, Transfer.
  - **Add** — create a brand-new account inline (localized by a country-flag selector, US shown): Cash, Taxable Investments, Individual Retirement Accounts, Employer Retirement Accounts, Cryptocurrency, **HSA**, **529 Plan**. Employer Retirement Accounts submenu: 401k, Roth 401k, 403b, Roth 403b, 457b, Roth 457b, 401a (matches free-tier account-type catalog).
- **New-account-via-Flow form** (chose 401k): Name, Account Owner, then 3 collapsible sections **Goal / Mechanics / Time Range** (no separate "starting balance" field visible in this entry point — a Flow only defines the ongoing contribution goal; the actual starting balance presumably lives on the Account itself, edited afterward, OR the Flow *is* how a brand-new zero-balance account gets created and the balance stays $0 until Current Finances is separately updated).
- **Goal section detail (401k)**: **Source** = which income stream funds this goal (defaulted to the Salary just created), **Your Contribution** (% of Earnings) and **Employer Contribution** (% of Earnings) as two independent rate fields, **Yearly Contribution Limit** dropdown defaulting to **"US Limit"** with a live inline rule: *"Maximum retirement account contribution for individuals is $24,500, with total employer + employee contribution limit of $72,000, plus catch-up contributions of $8,000 (50-59), $11,250 (60-63), $8,000 (64+)."* — these are real, current (2026) IRS retirement-plan limits, wired in as an actual constraint the engine can enforce, not just copy.
- **Contribution amount unit picker** ("More Options" popover on the Your/Employer Contribution field) — **4 modes**: % of Earnings / % of Earnings up to Limit / Amount in Today's Currency / Amount in Actual Currency. This is the same real-vs-nominal, rate-vs-fixed flexibility seen on Income/Expense growth elsewhere, now applied to contribution sizing specifically.

### Flows step continued [OBSERVED]
- Set up all 3 fixture flows exactly per spec: **#1 401k** — From: Salary, Your Contribution $10K (fixed $, "Amount in Today's Currency"), Employer Contribution 0%; **#2 Roth IRA** — Specific Amount, $7K/yr; **#3 Taxable Investments** — Specific Amount, $3K/yr. Fallback "Save anything left over" flow remains beneath all three (money left after all explicit flows still gets saved somewhere, not lost).
- Clicking Continue with no Cash/emergency-fund flow present triggers a **guardrail modal**: "Want an emergency fund? — Without an Emergency Fund or Cash Reserve goal, the simulation may dedicate all cash on hand to other flows." Cancel / **Skip**. A proactive nudge toward good financial-planning practice baked into the wizard itself, not just a passive feature. Skipped intentionally (fixture spec has $0 cash / no emergency fund).
- **New-account-via-Flow "Specific Amount" contribution sub-fields**: Frequency selector with 6 options — **Yearly** ("Spread throughout the year"), **Once Per Year** ("One lump sum per year in the start month"), Quarterly, Monthly (default), Bi-Weekly, Weekly, Daily — each with a one-line clarifying subtitle. The Yearly-vs-Once-Per-Year distinction (smoothed vs lump-sum timing within the year) is a nice level of simulation realism most competitors wouldn't bother modeling.

### Expenses step + notification bell [OBSERVED]
- Expense template catalog confirmed (14, matches prior research): Living Expenses, Rent, Debt, Student Loans, Dependent, Education, Health Care, Vacation, Wedding, Charity, Travel, Medical Expenses, Emergency, Custom Expense.
- Added **Living Expenses** $50,000/yr; wizard default Time Range = "Before Current Year → **End of Plan**" (contrast with Income's default end = "Your Retirement" — expenses by default run the whole plan, income by default stops at retirement, a sensible asymmetric default).
- The Expenses step had **pre-populated Medicare - You / Medicare - Spouse** entries (age-triggered healthcare cost templates the app appears to auto-seed once retirement-age household members exist) — inherited from the shared couple household at this point in setup.
- **Real Assets step** showed the couple's existing real assets carried over from Current Finances (My Car, Spouse's Car, House with full loan/appreciation terms) — confirms real assets, like people, are part of the shared account state, editable per-plan only by adding NEW assets on top.
- Wizard's final step button is labeled **"Confirm"** (not Continue), completing plan creation and landing on the Plan tab.
- **Notification bell** (top toolbar, new element, badge count) — clicking it opened a bottom-sheet/drawer alert: **"⚠ Out of Money at 88 — Unable to cover expenses at age 88. If you just started building your plan, this situation may resolve as you add more details."** This is a proactive, always-on plan-health monitor distinct from the on-demand Chance of Success Monte Carlo — it appears to run a simple deterministic check and surface portfolio-depletion warnings immediately as you build, even mid-wizard, before you'd think to check Chance of Success.

## Milestones editor + Deactivate mechanism + fixture debugging [OBSERVED] — process notes
- **Real/linked items (Real Assets) show "Linked to Current Finances" + a 3-dot overflow menu with Expand Sections / Deactivate / Cancel.** "Deactivate" excludes a Current-Finances-linked item from THIS plan's projection only, without deleting it from Current Finances or affecting other Plans — the correct non-destructive way to say "ignore this shared asset in this scenario." Deactivated items render with a diagonal-hatch pattern + eye-slash icon in the list.
- **Milestones editor location found**: clicking a milestone's icon directly on the Net Worth chart navigates to **Settings > Milestones** (a full-width MILESTONES mini-chart + one card per milestone) — this is the only path to edit a milestone's own definition; the inline pickers on Income/Expense Time Range only choose *which* milestone to bind to, not edit the milestone itself.
- **Time Range display-option presets** (Display Options > Time Range): Next 10/20/30/40 Years, **Accumulation Phase**, **Drawdown Phase**, **Full Plan** — semantic, not just numeric, chart zoom presets.
- Process note: creating a new Plan under a shared Current Finances household carries over stale milestones (fixed calendar dates set for the old household's ages) — after reassigning "About You" from a 47-year-old married household to a 30-year-old individual, the old "Retirement: Jan 2039" fixed-date milestone silently became "retire at age 43," which combined with a modest $100K starting portfolio produced a cascading, realistic-looking failure: **Early Withdrawal Penalties (ages 48-58)** and **Out of Money at 58**. This is a good transferable lesson for Northstar: milestones pinned to literal dates (vs. relative ages/events) can silently desynchronize from a person's identity if that identity changes later — worth deciding deliberately whether milestones store an absolute date or an age offset.

## FIXTURE BASELINE ESTABLISHED [OBSERVED]
Plan "Northstar Fixture - Single 30": single male, age 30 (Jan 1996), CA, Salary $100K/yr (match-inflation growth), Living Expenses $50K/yr, Starting assets 401k $50K + Roth IRA $25K + Taxable $25K (Cash $0), Flows: 401k $10K/yr + Roth IRA $7K/yr + Taxable $3K/yr, Retirement at age 60 (Jan 2056), Life Expectancy age 90 (2086), Financial Independence = Net Worth >= 25x Spending. Legacy couple-household real assets (2 cars + house) deactivated for this plan.
**Baseline Chance of Success: 100.00% (196/196 historical trials).** Net worth trajectory: ~$100K at 30 → ~$666K+ by age 37 → climbing toward multi-million by retirement (chart auto-scaled, saw $600K+ by ~age 38 in the un-zoomed view).

## Plan > Settings dropdown menu — full structure [OBSERVED]
Top nav "Settings ▾": **Milestones, Rates, Dividends, Bonds, Tax, Metrics, Other Settings, Notes** — 8 sections. "Other Settings" is presumably where the earlier-seen Textbook Withdrawals / Effective Tax Rate customization / Estate Settings live. "Rates," "Dividends," "Bonds" are separate plan-level default-assumption hubs (matches the free-tier research's "every numeric default lives in a plan-level assumptions hub" pattern).

## CONTROLLED EXPERIMENT 1 — Retirement Age [OBSERVED]
- **Baseline**: Retirement at 60 (Jan 2056) → **100.00% success** (196/196).
- **Change**: Retirement moved to 45 (Jan 2041) — single lever, nothing else touched.
- **Result**: **65.82% success** ("fair" — the plain-language descriptor downgraded from "excellent" to "fair"), donut now shows 4-5 distinct colored arcs (green/dark-red/red/orange/yellow/blue) instead of green+blue — direct visual confirmation of the graded outcome-category system (Large Surplus/Comfortable/Barely Made It/Almost Made It/Failed in the Middle/Failed Early) documented earlier in Optimize > Tax Strategy.
- **User-facing consequence**: Retiring 15 years earlier on the same $100K-start/$100K-income/$50K-spend/$20K-contribution profile cuts accumulation time from 30 to 15 years, dropping success from certain to "fair." This mirrors the free-tier research's finding that retirement age is the single most dramatic lever in the product, now reproduced with concrete numbers on a controlled fixture (100% → 65.82%, a 34-point swing from one field edit, with the milestone re-propagating instantly through Plan chart, notification warnings, and Chance of Success).

## Premium Real Asset types — Rental/Commercial Property [OBSERVED] — confirms prior free-tier paywall
- New Asset catalog (14 types, no lock icons under premium): House, Car, **Rental Property, Commercial Property**, Land, Building, Motorcycle, Boat, Jewelry, Precious Metals, Furniture, Instrument, Machinery, Custom Asset.
- **Rental Property** gets 10 form sections (vs. House's ~8): Purchase, Financing, **Usage**, **Rental Income**, Change Over Time, Taxes, Expenses, Sale, Recurrence, More Options.
- **Rental Income section** — genuinely deep real-estate tax modeling: **Yearly Income** (% of Value, default 8%), **Property Management Costs** (% of Value), **Self-Employment Income** toggle ("Subject to self-employment taxes"), **Estimate Rental Deductions** toggle — ON by default — "Automatically estimate tax deductions for depreciation, mortgage interest, and other rental expenses," **Apply QBI Deduction** toggle — "Eligible taxpayers can deduct up to 20% of their qualified business income" (real 2017 TCJA Section 199A provision), **Initial Building Value** ("Required to estimate annual depreciation for the property's useful life"). This is real landlord-tax-return-level sophistication (depreciation schedules, QBI, self-employment tax treatment), not a toy "rental income" number.

## Responsive behavior [OBSERVED]
Tested the Plan screen at desktop (1440x900, though the Browser pane's own rendering surface is narrower) and mobile (375x812) emulated viewports. **Layout is visually IDENTICAL at both sizes** — same single-column, ~centered, max ~800px-wide content column, same top tab bar that horizontally truncates/scrolls when tabs overflow, same hamburger-triggered off-canvas sidebar. This strongly suggests ProjectionLab ships ONE responsive layout (mobile-first, single-column) rather than a distinct multi-column "desktop" arrangement — there is no sidebar-always-visible or multi-pane desktop mode observed at any tested width. Important product-design takeaway for Northstar: a dense financial-planning tool CAN successfully ship as a single responsive column without a bespoke desktop IA, if content is organized into accordion sections (Accounts/Income/Expenses/Real Assets/Flows) rather than a dashboard grid.

## Top nav tabs (confirmed via DOM text, all premium unlocked)
Plan, Cash Flow, Tax Analytics, Chance of Success, Compare, Optimize, Reports, Estate, Settings
Plan sub-sections: Net Worth (chart), Accounts, Income, Expenses, Real Assets, Flows
