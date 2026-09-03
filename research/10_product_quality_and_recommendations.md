# Product Quality Analysis & Recommendations for Northstar

Synthesis and judgment calls, drawing on everything documented in files 01–09. Marked **[ANALYSIS]** throughout since this file is interpretation, not direct observation.

## 1. The 10 most important features
1. Milestone-referenced dates (the cascading-change architecture)
2. Prioritized Flows contribution waterfall
3. Chance of Success (Monte Carlo, graded outcomes)
4. Tax Analytics (per-source effective rates)
5. Optimize → Tax Strategy (presets + auto-solver)
6. Multiple Plans + What-If comparison
7. Cash Flow Sankey
8. Estate module
9. Reports (Explore table + export)
10. The always-on plan-health notification system

## 2. Core value proposition
"See your entire financial life as one connected model, change one assumption, and watch everything — net worth, taxes, retirement odds, your legacy — recompute together, instantly." The value isn't any single chart; it's the promise that the model is *coherent*, so a user can trust one part of it because they can see how it responds to changes everywhere else.

## 3. What makes the product feel sophisticated
Real, current tax-code detail wired in as live constraints (IRS contribution limits, IRMAA/NIIT/ACA cliffs, MACRS depreciation schedules, QBI deduction, the 2026 estate-tax exemption) rather than generic placeholders; a beam-search optimizer that's honest about its own limits ("none can guarantee an absolutely optimal result"); graded (not binary) success/failure categories; per-income-source tax attribution instead of one blended rate.

## 4. What makes it easy to use
Progressive disclosure on every form (headline fields visible, everything else collapsed); one dominant number per screen; consistent icon vocabulary; instant no-spinner recompute; proactive plain-English translations of every number ("Admin costs reduce the estate by $71.33K"); non-destructive interaction patterns (Deactivate, What-If Keep/Revert/Fork) that reduce fear of "breaking" a plan.

## 5. What makes it difficult to use
No dedicated Milestones nav entry (must click a chart icon or dig through a Settings dropdown to edit one); the fact that a household reassignment can silently desync fixed-date milestones with no warning until a downstream symptom (Out of Money) appears; Current Finances being globally shared across Plans is powerful but not obviously explained anywhere in the UI itself — a new user creating a second Plan could be surprised their "starting point" carries over automatically; the tab bar horizontally scrolls with no visible affordance, so Settings/Estate/Reports are easy to miss on first use.

## 6. Workflows that are particularly well designed
The Optimize → auto-solver flow (objective → depth → winner card → one-click apply) turns an intimidating decision ("should I do Roth conversions?") into a 3-click action with a clear, quantified payoff; the What-If Keep/Revert/Fork exit menu is a genuinely elegant solve for "let me try something without fear."

## 7. Workflows that are unnecessarily complicated
Editing a milestone requires knowing it lives under Settings, or finding its icon on a chart that may not even be visible at the current zoom level (we had to switch Time Range to "Full Plan" to even see the Retirement icon); the Flow contribution-mode picker (% of Earnings / % of Earnings up to Limit / Amount in Today's Currency / Amount in Actual Currency) is powerful but exposed as a small 3-dot popover on first use, easy to miss entirely and default to a mode the user didn't intend.

## 8. Features essential for an MVP
Manual balance-sheet entry, Income/Expense modeling with time ranges and growth rules, an Account catalog with owner attribution, a prioritized contribution waterfall, ONE milestone type at minimum (Retirement), a single Net Worth projection chart, and a Monte Carlo success percentage. This is roughly "the free tier," and it's a strong, complete MVP on its own merits.

## 9. Features that are premium differentiators
Everything in [03_premium_feature_audit.md](03_premium_feature_audit.md): Cash Flow, Tax Analytics, Monte Carlo detail, What-If, the Optimize suite, Reports, Estate, multiple Plans, Progress.

## 10. Features that could be deferred
Country localization beyond the primary launch market; premium real-asset depreciation/QBI modeling (Rental/Commercial Property); the beam-search auto-optimizer (ship the preset-strategy picker first, add "find the best one for me" later); Progress/real-time tracking (valuable but not core to the planning loop).

## 11. What would make an independent product substantially better than ProjectionLab
- **Make the milestone-identity-desync failure mode structurally impossible** — store ages/offsets by default, or run an automatic validation pass whenever a person's birth date or household composition changes, rather than relying on the user to notice a downstream symptom.
- **Surface Current-Finances sharing explicitly** the first time a user creates a second Plan ("this Plan starts from the same balances as your other Plans — edit Current Finances to change that everywhere, or add new-plan-only accounts here").
- **A dedicated Milestones list screen**, reachable from primary nav, not buried in a Settings dropdown or requiring a chart click.
- **Explain the tax-attribution stacking order** somewhere discoverable (a tooltip or help link on the per-source effective-tax-rate table) — right now a user has to trust the number without understanding why Savings Yield shows 37% and Salary shows 19% in the same year.
- Consider whether the graded 6-category outcome taxonomy (Large Surplus...Failed Early) should be user-facing and prominent everywhere Monte Carlo results appear, not just inside Optimize's comparison table — it's a genuinely better mental model than a bare percentage and is currently under-exposed.

## 12. Biggest technical challenges
Keeping one shared projection engine consistent across Cash Flow, Tax Analytics, Monte Carlo, Optimize, Reports, and Estate simultaneously (any bug in the core engine surfaces six times over); the tax-code detail (contribution limits, IRMAA/NIIT/ACA thresholds, estate exemptions, MACRS schedules) requires an annual maintenance commitment to stay current, which is a real, ongoing engineering cost, not a one-time build; the beam-search optimizer needs to run fast enough for a "Quick" tier to feel instant while still exploring a meaningful strategy space.

## 13. Biggest UX challenges
Progressive disclosure at this density risks features being "real but undiscoverable" (Milestones editing, the contribution-mode popover); explaining *why* a number is what it is (tax attribution, Monte Carlo methodology) without turning every screen into a wall of caveats; keeping the "one dominant number per screen" design promise intact as more premium detail gets added underneath it, without the page becoming overwhelming.

---

## MVP recommendation for Northstar (priority order)
1. Household/person setup + manual balance-sheet entry (owner-attributed)
2. Income/Expense stream modeling with flexible time ranges and growth rules
3. Account catalog with the core retirement-account mechanics (contribution limits, at minimum)
4. A prioritized contribution waterfall (Flows equivalent)
5. At least Retirement + Financial-Independence milestone types, with a deliberate, explicit choice on absolute-date vs. relative-age storage from day one
6. Single Net Worth projection chart with milestone overlays
7. A basic Monte Carlo success percentage with a plain-language sentence
8. THEN layer in: Tax Analytics → Cash Flow → What-If comparison → Optimize suite → Estate → Reports/export, roughly in that order of leverage-per-engineering-effort based on this audit.

## Architecture recommendation
Adopt the single-shared-projection-engine pattern deliberately: every analytical view (tax, cash flow, Monte Carlo, estate, optimize) should be a *read/transform* over one canonical Income/Expense/Account/Milestone/Flow data model, never a parallel calculator with its own copy of the logic — this is the single biggest reason ProjectionLab's cross-screen consistency (one milestone edit updates six screens at once) works. Decide the milestone date-storage question (absolute vs. relative) before building the Milestone object, since it's structurally hard to retrofit. Consider building the "translate every number into a plain-English sentence" pattern as a first-class, reusable component from the start, rather than bespoke copy per screen — it recurs on nearly every analytical tab in ProjectionLab and is clearly load-bearing for user trust.

## Open questions (things this session could not determine)
- Exact Monte Carlo "Success" definition (what specifically counts as a trial "surviving")
- Whether the beam-search optimizer explores un-named parameter combinations at Deep/Extreme depth, or only ranks the 13 named presets
- The exact per-source tax-attribution stacking order
- Whether "Compare" ever offers more than one option (a direct multi-Plan comparator) in other account states
- Full contents of Settings → Rates / Dividends / Bonds sub-screens (seen in the menu, not opened)
- Exact animation timing/easing (not extractable via this session's tooling)
- Pricing/plan-tier structure itself (out of scope — this research is about product functionality, not billing)
