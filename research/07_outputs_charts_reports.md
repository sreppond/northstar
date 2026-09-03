# Outputs, Charts & Reports

**[OBSERVED]** unless flagged.

## Financial outputs — full inventory

| Output | Where | Form | Tier |
|---|---|---|---|
| Net Worth (projected) | Plan tab | area chart, milestone icons overlaid | Free (base dataset) |
| Net Worth (actual, real time) | Progress | line chart + Progress Points table | Premium |
| Chance of Success % | Chance of Success | donut + plain-language sentence | Free headline / Premium detail |
| Percentile-band Net Worth outcomes | Chance of Success | multi-line fan chart | Premium |
| Per-milestone timing distribution | Chance of Success | table (Earliest/Your Age/5–95%/All) | Premium |
| Cash Flow (sources→uses) | Cash Flow | Sankey, year-scrubbable | Premium |
| Effective/marginal tax by source | Tax Analytics | metric cards + stacked bar + table | Premium |
| Tax-strategy outcome deltas | Optimize | $ delta cards + 6-category table | Premium |
| Year-by-year full data table | Reports → Explore | table, 11 columns × full horizon | Premium |
| ~25-dataset chart library | Reports → Plots / Plan chart picker | line/bar/stacked variants | Premium (all but base Net Worth) |
| Estate breakdown | Estate | Sankey + itemized table + insights | Premium |
| Contribution waterfall status | Plan → Flows | ranked card list | Free |

## Chart inventory

### Net Worth chart (Plan tab, base — the one free dataset)
- **X-axis:** age (dual-age shown on hover for a Couple household)
- **Y-axis:** dollars, toggleable Today's-Currency (real) vs. nominal via Display Options → Inflation
- **Series:** single filled area line
- **Overlays:** milestone icons plotted at their computed year/value, colored by type (retirement=green palm, life expectancy=gray heart, financial independence=blue flag, real-asset purchase=house icon, etc.)
- **Interactions:** click any icon → deep-links to that milestone's Settings editor (confirmed this session — previously only "surfaces a tooltip" was documented; direct navigation is new information); click/hover the line itself → vertical reference line + tooltip (date, age(s), net worth, nearby milestones)
- **Display Options panel** (sliders icon): Inflation / Time Range (Next 10/20/30/40 Years, **Accumulation Phase**, **Drawdown Phase**, **Full Plan** — semantic presets, not just numeric zoom) / Datasets / Metrics / Appearance / Chart Type / Y-Axis / X-Labels / Grouping — 9 configuration groups, independent of the dataset-picker dropdown.

### Tax Analytics stacked bar
X = age, Y = $, stacked by income-type composition; filter row (Income/All/Composition dropdowns) changes both the scope and the visual mode; milestone icons overlaid identically to the Plan chart — confirms one shared chart component is reused across screens with different datasets/filters.

### Chance of Success percentile-band chart
X = age, Y = $; instead of one line, ~4 fanning lines from present value representing percentile outcomes (not all 196 raw trials) — a deliberate smoothing choice for legibility over raw-data fidelity.

### Cash Flow Sankey / Estate Flow Sankey
Same visual language reused for two very different questions (annual cash movement vs. one-time estate distribution) — nodes sized proportionally, dollar labels on every node, horizontally scrollable when wide.

**Year-scrubber interaction, confirmed (gap-closing pass):** the Cash Flow Sankey's top slider (labeled "Age N" / calendar year) defaults to the **last year of the plan** (Age 90/2086 for the fixture), not the current year — meaning the diagram opens already showing the drawdown-phase topology (401k → Withdrawals → Expenses/Cash/Tax-Free, in blue/red) rather than the accumulation phase. Moving the scrubber to the plan's **first year** (via keyboard Home, since a bare click on the slider track did not move it — only Home/Arrow keys registered) swaps the entire node/link topology, not just the values: at Age 30/2026 the diagram instead shows Salary → Earned Income → Tax Withholding + Inflows → Expenses + four separate contribution flows (Tax-Deferred/401k, Tax-Free/Roth IRA, Cash/Savings, Taxable/Brokerage), rendered in a green/teal accumulation palette (`cash-flow-scrubbed-start.png` vs. `cash-flow-baseline.png`). Confirms the Sankey is a genuinely re-computed per-year diagram, not one static topology with animated value labels.

### Optimize mini-charts
Waffle/dot-matrix charts (Strategic Conversions total, Total Gains Harvested) — a distinct visualization from line/bar/Sankey, used specifically for "progress toward a cumulative target" framing; each dot is independently hoverable with a year+value tooltip.

### Reports → Plots library — full inventory (40 datasets, gap-closing pass)
**[OBSERVED]** — the complete "Built-in Plots" dropdown was scrolled to its end (`reports-plots-dropdown.png` through `reports-plots-dropdown-scroll5-end.png`) and every entry recorded, correcting the prior pass's estimate of "~25, first 9 confirmed." The true count is **40**, each with its own icon, in on-screen order:

1. Net Worth
2. Stacked Net Worth
3. Income
4. Expenses
5. Spending
6. Spending Overview
7. Discretionary Spending
8. Essential Spending
9. Spending Flex
10. Taxes
11. Withdrawals
12. Taxable Income
13. State Taxable Income
14. Local Taxable Income
15. Savings Rate
16. Contributions
17. Contribs & Withdrawals
18. Goal Heatmap
19. Income Breakdown
20. Expenses Breakdown
21. Taxes Breakdown
22. Withdrawals Breakdown
23. Taxable Income Breakdown
24. State Taxable Income Breakdown
25. Local Taxable Income Breakdown
26. Non-Taxable Income
27. Passive Income
28. Contributions Breakdown
29. C/W Breakdown
30. Debt Payments Breakdown
31. Liquidity
32. Liquidity Breakdown
33. All Accounts
34. Change in Net Worth
35. Change in Net Worth Breakdown
36. Investment Growth
37. Investment Growth Breakdown
38. Allocations by Percent
39. Allocations by Amount
40. Allocations by Account

Structurally, the list groups into families: a base metric (e.g. "Taxable Income") is frequently paired with a **"— Breakdown"** variant (a stacked/decomposed view of the same metric by category) and, for taxable income specifically, further split by jurisdiction (**State**, **Local**). This same 40-item list populates both the Reports → Plots dropdown and the Plan tab's own chart-dataset picker (`anim-chart-dropdown-open.png` shows the same dropdown UI, same first ~8 entries, opened directly from the Plan tab) — confirming it is **one shared dataset registry**, not two separately maintained lists for two different screens.

## Reports tab structure

- **Explore** — the raw year-by-year data table. Columns: Year, Net Worth, Liquid Net Worth, Income, Expenses, Taxes, Effective Tax Rate, Savings Rate, Withdrawals, Withdrawal Rate, Contributions, Transfers. Rows: "Start" (pre-plan snapshot) then every year of the plan horizon (39 rows observed on the couple persona's 39-year plan). This is effectively the CSV export rendered live as a scrollable pivot table.
- **Summary** — default landing view. **Corrected at desktop width**: this is NOT a separate condensed view — it shows the exact same chart-plus-table combination as Explore, with the same full column set (Net Worth/Liquid Net Worth/Income/Expenses/Taxes/Effective Tax Rate/Savings Rate/Withdrawals/Withdrawal Rate/Contributions...), except each column header has a **toggleable colored dot** controlling whether that series is included in the chart above (`reports-desktop.png`, showing Net Worth active/filled, all others present but inactive/hollow). "Summary" vs. "Explore" may simply be two different default dot-selection presets over the same underlying table+chart component, not two different components — **[INFERRED]**, not confirmed by inspecting whether Explore's dots are independently toggleable too.
- **Plots** — the dataset library, browsable independent of the Explore table.
- **Toolbar:** fullscreen icon, download icon (Export: **CSV / JSON / PDF**, each with a distinct icon — spreadsheet / curly-braces / PDF document), 3-dot overflow.
- Every numeric table cell in Explore reflects real computed values down to the dollar (not rounded placeholders), confirming Reports draws from the same engine as every other tab, not a separately-cached summary.

## Export capability
CSV, JSON, and PDF export confirmed available (icons and labels observed; files not actually downloaded this session per file-download policy — downloading requires explicit user permission and wasn't necessary to confirm the capability). JSON export in particular signals the product expects power users to pipe plan data into their own tools/spreadsheets, not just print a PDF for an advisor meeting.
