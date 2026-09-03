# Scenarios, Optimization & Taxes — Workflows

Feature-by-feature detail already lives in [03_premium_feature_audit.md](03_premium_feature_audit.md). This file covers the **user journeys** end-to-end and a few mechanics not covered there. **[OBSERVED]** unless flagged.

## Workflow: "What if I retire earlier?" (What-If comparison)

```
Chance of Success tab (or any tab)
→ click "Compare" in top nav
→ dropdown shows one option: "What If" — "Make changes and see how they compare
   to the current state, with the option to roll back."
→ click it → routes to Plan tab; Compare tab now shows a persistent red dot
  ("● Compare") visible from every other tab — this is the global mode indicator
→ make any edits anywhere in the plan (tested: applying an Optimize tax strategy)
→ click the red-dot Compare tab again → "Comparing to Baseline" menu:
    - Keep Changes  (commit, exit compare mode)
    - Revert Changes (discard, return to pre-What-If state)
    - Save as New Plan (fork the changes into a separate Plan, revert this one)
```
No confirmation dialog on entry, but re-entering "Compare" mid-session always shows the exit menu, never re-offers "What If" — the mode is a stack of exactly one level.

## Workflow: "Should I do Roth conversions?" (Tax Strategy)

```
Optimize ▾ → Tax Strategy
→ "Set up your tax strategy" — 3 entry cards: New strategy / Common strategy / Optimize
```
**Path A — pick a named preset (fastest):**
```
→ Common strategy → "Choose your strategy" → 13 cards (bracket-ceiling Roth-conversion
  "shield" strategies, gain-harvest variants, IRMAA-aware variants, shield-only variants)
→ select one → applied-strategy dashboard renders immediately:
    4 component cards (Tax Strategy/Roth Conversions/Withdrawal Shielding/Gain Harvesting)
    → outcome-delta cards (thumbs up/down, $ impact on taxes and net legacy)
    → Chance-of-Success impact (with/without strategy)
    → 6-category outcome-distribution table (Large Surplus...Failed Early)
```
**Path B — build a custom strategy:**
```
→ New strategy → Target picker ("Fill a specific marginal tax bracket each year" → %
  selector) → optional Capital Gains Bracket → Avoid NIIT / Avoid IRMAA / Preserve ACA
  toggles → optional Time Range scoping → same applied-strategy dashboard as Path A
```
**Path C — let the app find the best one:**
```
→ Optimize → "Define your objective" (6 goals) → "Launch your search" (4 depth tiers,
  explicitly described as beam search) → run (few seconds even at "Quick") →
  reveal: "$X gained in [objective]" + "N strategies evaluated" + a Winner card
  (named preset) with Apply strategy / Explore alternatives buttons
```
In this session's fixture experiment, "Higher net legacy" at "Quick" depth evaluated 51 strategies and surfaced "Convert and shield to 24%" as the winner, worth +$1.15M in net legacy vs. doing nothing — i.e. the same underlying 13-preset family is the actual search space; the optimizer is a fast ranker over named strategies, not a free-form numeric solver. **[INFERRED: the beam search may also explore un-named parameter combinations at Deep/Extreme depth — not verified, since only Quick was run.]**

## Tax bracket / composition mechanics (Tax Analytics)

Per-source effective tax rate is genuinely per-source, not a blended estimate distributed after the fact — observed rates on the couple persona ranged from 0.00% (employer match, pre-tax) to 37.10% (savings yield) to 18.79% (primary salary) in the SAME year, with a 25.12% Total blended row. This implies the engine stacks income sources in a specific order (likely ordinary → preferential-rate → tax-free) and attributes marginal tax to each source based on where it lands in the stack, rather than splitting a single blended rate proportionally. **[INFERRED mechanism; the exact stacking order was not independently reverse-engineered.]**

## Monte Carlo methodology detail

- **Data Sources / Methodology** config rows — confirmed directly at desktop width without needing to expand them, each shows its current value inline: **Data Sources: "Historical Returns"**, **Methodology: "Historical, Random-Restart"** [`chance-of-success-desktop.png`], matching what the post-run evidence (196 trials, each keyed to a historical start-year from 1928 onward) had already implied. "Random-Restart" specifically names the resampling technique: repeatedly restarting the historical sequence from different starting years rather than a single fixed backtest. The empty-state copy ("You can backtest on historical data or define your own probability distributions") implies a parametric/custom-distribution mode also exists **[INFERRED, not exercised]** — the leaf/expanded content of these two config rows (i.e., what other options exist besides the current selection) was still not opened this session.
- **Outcome Categories** — the pre-run config row's inline value literally reads **"Kinds of success and failure"** [`chance-of-success-desktop.png`], and the 6 graded buckets are confirmed via both the Optimize distribution table AND directly on the Chance of Success result screen's own legend (not just inferred): a 100%-success run on the couple persona showed exactly **Large Surplus 55.6% (109 trials)** and **Comfortable 44.4% (87 trials)** as its only two non-zero categories [`chance-of-success-result-desktop.png`], confirming the full category set (Large Surplus, Comfortable, Barely Made It, Almost Made It, Failed in the Middle, Failed Early) only shows the categories that actually occurred, not all 6 always. Success is graded by magnitude; failure is graded by *timing* (failing early in retirement is worse than failing near the end).
- **Success Rates** config row — presumably the threshold/definition of what counts as "success" per trial; not opened to leaf content. **[UNKNOWN exact definition]**.
- Chance-of-Success donut color count scales with the number of non-zero outcome categories present in a run — the 100%-success fixture baseline showed 2 colors (green/blue); the 65.82%-success experiment (retire-at-45) showed 5–6 distinct arcs, a direct visual tell for "this plan has real failure-mode diversity."

## Flexible Spending — guardrails mechanics detail

The rule ("When performance is 20% → Flex discretionary spending 30%") reads as a **market-performance-triggered spending adjustment**, i.e. a Guyton-Klinger-style guardrail, though the exact direction (spend more when performance is X% *above* target vs. X% *below*) was not disambiguated from the UI copy alone — **[INFERRED]** the pattern from the explainer text ("spending more when the market is high or tightening your belt when the market is down"), not confirmed by testing both directions. The live-preview Monte Carlo re-run (98 trials, a reduced subset of the full 196) while tuning the rule is the standout UX detail — no other config screen in the product offers instant live-simulation feedback at this granularity.

## Cross-references
- Full feature-by-feature detail: [03_premium_feature_audit.md](03_premium_feature_audit.md)
- Retirement-specific mechanics (RMDs, drawdown order): [06_retirement_estate_life_events.md](06_retirement_estate_life_events.md)
- The controlled retirement-age experiment that exercises the Monte Carlo end-to-end: [09_controlled_experiments.md](09_controlled_experiments.md)
