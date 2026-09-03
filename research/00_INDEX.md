# ProjectionLab Premium Research — Index & Investigation Log

**Purpose:** Full-product specification reference for designing Northstar independently. Supersedes the prior free-tier-only research (`docs/PROJECTIONLAB-RESEARCH.md`, kept for the historical record) now that this account has premium/trial access. This is not a spec to copy — it is a survey of a mature competitor's decisions, used to make our own decisions deliberately, including decisions to differ.

**Method:** Live interactive exploration of an authenticated premium ProjectionLab account, in four passes:
1. **Sandbox breadth pass** — the account's pre-existing "Mid Career, Married" persona (couple, ages 47/44, California, $1.24M net worth), carried over from a prior free-tier research session. Used to tour every premium tab/feature at realistic scale. Conducted via a browser-automation pane that, as discovered in pass 3, never actually rendered this app's true desktop layout.
2. **Controlled fixture pass** — a purpose-built single-person plan ("Northstar Fixture - Single 30"): age 30, $100K salary, $50K spending, $100K starting assets (401k $50K / Roth IRA $25K / Taxable $25K), $20K/yr total contributions, retiring at 60, planning to age 90. Used for reproducible before/after experiments.
3. **Desktop-verification / screenshot pass** — a separate, self-contained Playwright browser session (already authenticated via a persistent profile) was used to capture 12 real screenshot files at true 1440×900 desktop width. This surfaced a significant correction: the desktop layout is materially richer than passes 1–2 could see (persistent icon nav, multi-column Dashboard, full 9-tab bar, inline data-entry grids, a right-side info panel on the Plan chart) — see [11_screenshot_index.md](11_screenshot_index.md) and the corrected [08_ui_design_and_interaction.md](08_ui_design_and_interaction.md).
4. **Gap-closing pass** — a targeted follow-up (same Playwright session) closing 4 specific gaps flagged after pass 3: the full animation/transition inventory, the complete Reports→Plots dataset list, a Settings→Rates/Dividends/Bonds deep dive, and two more controlled experiments (spending shock, investment-return shock). ~45 additional screenshots in `research/screenshots/gap_pass/`. See the "Gap-closing pass" findings below and the updated [04](04_financial_model_and_features.md)/[07](07_outputs_charts_reports.md)/[08](08_ui_design_and_interaction.md)/[09](09_controlled_experiments.md)/[11](11_screenshot_index.md) files.

## Observation labels
Used throughout this package:
- **[OBSERVED]** — directly verified live in the running application this session.
- **[INFERRED]** — reasonably inferred from observed UI/copy but not directly exercised (e.g., a feature described in a tooltip but not clicked through).
- **[UNKNOWN]** — could not be determined in this session.

## File map
- [01_executive_summary.md](01_executive_summary.md) — what the product is, how it makes money, the one big architectural idea
- [02_application_sitemap.md](02_application_sitemap.md) — full navigation tree, every tab/drawer/modal discovered
- [03_premium_feature_audit.md](03_premium_feature_audit.md) — **HIGH PRIORITY**: everything unlocked by premium that was paywalled in the prior free-tier pass
- [04_financial_model_and_features.md](04_financial_model_and_features.md) — data model, account types, input inventory, feature-by-feature inventory with CORE/IMPORTANT/NICE-TO-HAVE/SPECIALIZED ratings
- [05_scenarios_optimization_taxes.md](05_scenarios_optimization_taxes.md) — What-If comparison, the 5-tool Optimize suite, Tax Analytics, Monte Carlo detail
- [06_retirement_estate_life_events.md](06_retirement_estate_life_events.md) — retirement mechanics, the Estate module, milestones/life events
- [07_outputs_charts_reports.md](07_outputs_charts_reports.md) — every chart, the Reports/Explore data table, exports
- [08_ui_design_and_interaction.md](08_ui_design_and_interaction.md) — visual design system, component inventory, interaction/animation patterns, responsive behavior, UI states
- [09_controlled_experiments.md](09_controlled_experiments.md) — the fixture build log + before/after experiment results
- [10_product_quality_and_recommendations.md](10_product_quality_and_recommendations.md) — product-quality analysis, MVP recommendation, architecture recommendation, open questions
- [11_screenshot_index.md](11_screenshot_index.md) — the 12 real screenshot files captured at true desktop width, with the desktop-layout correction explained

## Investigation log

### Completed
- Full sitemap (sidebar + top nav + every premium tab) ✓
- Premium feature audit — Cash Flow, Tax Analytics, Chance of Success detail, Compare/What-If, full Optimize suite (Tax Strategy, Flexible Spending, Roth Conversions, Drawdown, Gain Harvesting), Reports (Explore/Summary/Plots + exports), Estate ✓
- Monte Carlo methodology, outcome-category taxonomy, milestone timing distributions ✓
- Tax Strategy presets (13), optimizer (6 objectives × 4 search depths, beam search), Drawdown Order (11-step waterfall) ✓
- Account type catalog incl. premium Rental/Commercial Property with real depreciation/QBI tax modeling ✓
- Fresh onboarding wizard (New Plan flow) walked start-to-finish ✓
- Controlled fixture built and one lever-change experiment run (retirement age 60→45: 100%→65.82% success) ✓
- Responsive check (desktop vs. mobile viewport) ✓
- Milestones editor, Settings menu structure, Deactivate mechanism for linked assets ✓
- **True desktop-width screenshot pass (12 files) via a separate authenticated Playwright browser** — corrected a significant error in the original responsive-design finding; see [11_screenshot_index.md](11_screenshot_index.md) ✓
- **Gap-closing pass**: full animation/transition inventory (18 entries, incl. the finding that Monte Carlo and Optimize have no observable loading state) ✓; complete Reports → Plots list (40 datasets, not ~25) ✓; Settings → Rates/Dividends/Bonds/Tax/Metrics/Other Settings fully opened and documented, correcting an earlier mis-attribution of the Effective-Tax-Rate/Spending panels ✓; two more controlled experiments — spending +80% (100%→0% success) and Stocks growth rate 7%→4% (deterministic chart fails, Monte Carlo unchanged at 100% — a real engine-decoupling finding) ✓; fixture restored to true baseline (retirement 60, spending $50K, growth 7%) at the end ✓

### Not reached / explicitly out of scope
- Reports PDF/CSV/JSON files not actually downloaded (declined per file-download policy; export UI and format list fully documented)
- Multi-plan "Compare" beyond What-If (dashboard-level side-by-side of 2+ named Plans) not exercised in depth
- Account/profile-level settings (Theme switcher, Gift a Subscription, Resources/Support menus) noted from sidebar but not opened — low research value, out-of-scope external links/marketing pages
- Exact animation ms/easing curves — confirmed not extractable via screenshot-based automation (see [08_ui_design_and_interaction.md](08_ui_design_and_interaction.md) animation table for what could be determined instead: trigger, start/end state, and — notably — that some "animations" turn out to have no observable transition at all)
- Optimize search at Standard/Deep/Extreme depths (only Quick was run) — [UNKNOWN] whether longer searches surface a real progress indicator where Quick did not
- Toast/validation-error animations — no destructive action or invalid input was triggered this session
- Further single-variable experiments beyond the 3 run (retirement age, spending, investment return): contribution-rate change, Social Security timing, home purchase, large one-time expense — methodology is fully established and repeatable against the same saved fixture Plan

## Important findings (see linked files for full detail)
1. **The product has a genuine, materially richer desktop layout that an earlier pass in this research missed entirely** — persistent icon nav, 3-column Dashboard, full 9-tab bar, inline multi-column data-entry grids, a right-side Plan-chart info panel. Corrected in [08_ui_design_and_interaction.md](08_ui_design_and_interaction.md) using real screenshots; see [11_screenshot_index.md](11_screenshot_index.md). Worth reading as a caution about trusting a narrow automation surface's idea of "desktop."
2. **Premium is a genuine unlock, not a teaser** — every previously-paywalled screen (Cash Flow Sankey, Monte Carlo detail, Optimize suite, Estate, Reports) is fully functional with real numbers, not blurred previews.
3. **Tax Strategy is a single composite object** with 4 facets (Tax Strategy bracket target / Roth Conversions / Withdrawal Shielding / Gain Harvesting) — editing any one edits the shared strategy; the Optimize auto-solver beam-searches the same preset family.
4. **Monte Carlo has a real graded outcome taxonomy** (Large Surplus / Comfortable / Barely Made It / Almost Made It / Failed in the Middle / Failed Early), not a binary pass/fail — confirmed via the Optimize outcome-delta table AND directly on the Chance of Success screen itself with exact trial counts (e.g. Large Surplus 55.6%/109 trials, Comfortable 44.4%/87 trials).
5. **The Estate module is a fully separate, fully-featured tab** (Gross Estate / Estate Drag / Net Legacy, an estate-flow Sankey, a line-item breakdown, and an auto-generated plain-English insights list) — entirely unknown territory in the prior free-tier pass. Its federal estate-tax-exemption figure appears to be filing-status-aware ($15M individual vs. $30M couple) — see [11_screenshot_index.md](11_screenshot_index.md).
6. **Real-world tax-code details are wired in as live constraints**, not just labels: 2026 IRA/401k contribution limits inline in the account-goal form, IRMAA/NIIT/ACA-subsidy-cliff toggles in Tax Strategy, real depreciation schedules (27.5yr residential) and QBI deduction on Rental Property.
7. **A background plan-health monitor** (bell icon) proactively surfaces "Out of Money at age X" / "Early Withdrawal Penalties" / "Milestone never reached" warnings continuously as you edit — separate from the on-demand Monte Carlo.
8. **Milestones can silently desynchronize from a person's identity** if pinned to literal dates rather than relative ages — discovered by direct incident (see [09_controlled_experiments.md](09_controlled_experiments.md)).
9. **The deterministic projection engine and the Monte Carlo engine can silently disagree** (gap-closing pass): the Rates → Stocks *Fixed* growth-rate assumption drives the single-path Plan/Cash-Flow/Tax-Analytics chart, but Chance of Success's default "Historical Returns" data source ignores it entirely. Cutting the Fixed rate from 7%→4% crashed the deterministic chart to $0 by ~80 while Monte Carlo stayed at 100.00% success, unchanged — with no UI signal anywhere that the two numbers were computed from different assumptions. See [09_controlled_experiments.md](09_controlled_experiments.md) Experiment B.
10. **Two of the product's heaviest computations have no observable loading state**: both the Monte Carlo run (196 historical trials) and the Optimize search (51 strategies at "Quick" depth) resolved to their full result before the next screenshot could be captured — no spinner, no progress bar, no intermediate frame, across 4 separate runs. See the animation inventory in [08_ui_design_and_interaction.md](08_ui_design_and_interaction.md).
