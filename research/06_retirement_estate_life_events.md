# Retirement, Estate & Life Events

**[OBSERVED]** unless flagged.

## Retirement mechanics

Retirement is not a distinct module — it is a **Milestone** (default type: fixed date, but can be redefined as "at another milestone" or "at a metric threshold") consumed by every other part of the app:
- Income streams default their end-of-range to it.
- Optimize → Drawdown's Withdrawal Shielding, Textbook Withdrawals, and the Drawdown Order waterfall all key off it.
- Chance of Success reports a timing-uncertainty distribution *for* it (in the fixture's 100%-success baseline, retirement was "Always" reached at exactly age 60; in the couple persona's original config it showed a 5–95% range).
- Tax Analytics and Estate both read plan state relative to it implicitly (pre- vs. post-retirement income/spending composition).

**Retirement-account-specific mechanics live on the Account itself** (RMD toggle, Roth Conversion toggle, 72(t)/SEPP toggle — confirmed from the prior free-tier pass, unchanged), reinforcing that "retirement" is a lens over the same Account/Income/Milestone objects used everywhere, not a separate calculator.

**Withdrawal sequencing** is now fully documented (was previously only "Premium — Optimize → Drawdown" from the outside): an explicit, numbered, reorderable **11-step waterfall** —
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

This distinguishes qualified vs. early, and Roth contribution-basis vs. earnings — real retirement-withdrawal-ordering domain knowledge (Roth contributions can be withdrawn tax/penalty-free before age 59½; earnings cannot) expressed as one clean reorderable list.

**Part-time/"coast" pre-retirement income reduction** remains a first-class toggle on any Income source (confirmed from prior pass, "Part-Time Work" under More Options), not a separate retirement concept.

**Retirement readiness communication** is graded, not binary: the plain-language sentence ("This chance of success looks excellent/fair/...") plus the 6-category outcome-distribution table plus the always-on notification-bell warnings ("Out of Money at age X") give three separate, reinforcing signals rather than one badge.

## Estate module (entirely new territory this session — was completely unknown pre-premium)

**Location:** top nav Estate.

**Top metric cards:**
- **Gross Estate** — $ + a progress-bar visualization
- **Estate Drag** — $ + % + a ring (i.e., the cost of dying: taxes + liquidation + admin costs as a % of gross estate)
- **Net Legacy** — $ + % ring (what heirs actually receive as a % of gross estate) — this figure is the same "Legacy" number surfaced as a metric card on Tax Analytics, confirming Estate and Tax Analytics share the underlying calculation.

**Auto-generated insight cards** (3, icon + one sentence each; the set appears to be dynamically selected from a larger pool rather than always the same fixed 3 — see below):
- Session 1 (household filing status: Couple), observed: "Your heirs receive **98%** of your gross estate." / "**88%** of your estate is in tax-free accounts, which pass to heirs free of income tax." / "Your taxable estate of **$7.13M** is **under** the federal estate tax exemption of **$30M**."
- Session 3 desktop-verification pass (household filing status had by then been switched to **Individual**, since Current Finances is shared account-wide — see [09_controlled_experiments.md](09_controlled_experiments.md)), observed on the same "Current Projections" plan: Gross Estate **$11.48M**, Estate Drag 14% (**$1.64M**), Net Legacy 86% (**$9.84M**), and the exemption card now reads "Your taxable estate of $11.48M is under the federal estate tax exemption of **$15M**" — plus a third, different insight card: "Taxable accounts receive stepped-up basis at inheritance, eliminating unrealized capital gains." [`estate-desktop.png`]
- **The exemption figure changed from $30M to $15M between the two observations, tracking the filing-status change exactly (couple = 2× individual)** — strong evidence the app applies the real federal estate-tax exemption as filing-status-aware (a single filer's individual exemption doubled for a married couple via portability), not a flat constant. [OBSERVED via this natural experiment; the underlying mechanism (portability calculation vs. a simple ×2) is INFERRED, not independently confirmed.]

**Estate Flow** — a Sankey diagram. At desktop width (`estate-desktop.png`) shows more nodes than the original narrow-viewport pass captured: Gross Estate splits into **Tax-Deferred Investments** ($5.34M observed), **Taxable Investments** ($4.71M), **Real Assets** ($872.69K), and **Tax-Free Investments** ($551.6K), recombining into **To Heirs** ($9.84M), **Income Tax** ($1.43M), and **Admin Costs** (value not fully visible, chart continues below the captured viewport) — richer than the original pass's "splits into Tax-Free Investments / Real Assets / Cash" description. A sparkle icon top-right suggests a regenerate/AI-insight affordance **[not tested]**.

**Breakdown table** (grid/list view toggle): every estate component itemized — Item / Gross / Costs / Net, including explicit **Federal Estate Tax** and **Admin Costs** rows, with a Total row reconciling to Net Legacy.

**Assumptions panel** (mirrors Settings → Other Settings → Estate Settings, scoped display here): Tax-Deferred Account Tax Rate, Capital Gains Rate, Stepped-Up Basis (yes/no), Asset Liquidation cost %, Charitable Giving %, Administrative Costs %.

**Estate Settings (editable, from Settings drawer):**
- Tax-Deferred Account Tax Rate — "The full balance is subject to ordinary income tax when withdrawn by heirs."
- Taxable Accounts / Stepped-up Basis toggle — "Assume inherited taxable accounts receive a stepped-up basis."
- Liquidation Costs — transaction costs for liquidating real estate and other assets.
- Charitable Giving — % of gross estate, "automatically allocated from the most tax-inefficient accounts first, maximizing the benefit to your heirs" (i.e., the engine picks which specific account to donate from, not just a blanket %).
- Administrative Costs — probate/legal/executor fees as % of gross estate.

**Fuller Insights list** (separate from the 3 top cards) restates every headline number as a sentence — e.g., "Admin costs reduce the estate by $71.33K," "Liquidation costs reduce the estate by $52.36K" — confirming a deliberate house style: **every number gets translated into a plain-English sentence at least once**, not just displayed as a figure.

Disclaimer variant specific to this tab: "...does not give, offer, or render financial, tax, **estate planning**, or legal advice."

## Life events / milestones (confirmed, extended)

Milestones remain dual-purpose: chart annotations AND date triggers consumed elsewhere. New this session:

- **Milestone editing location**: only via Settings → Milestones (a dedicated mini-chart + one card per milestone) or by clicking a milestone's icon directly on the Net Worth chart, which deep-links to the same screen. No inline "edit milestone" affordance exists on the fields that merely *reference* a milestone.
- **Editing a milestone's date**: the "At date" field is a combined text+slider control — typing a new "Mon YYYY" value and clicking away commits it; a horizontal slider beneath offers coarse drag-adjustment (in this session's test, one full drag-right only moved the date 1 year, suggesting fine slider granularity — direct text entry is faster for large jumps).
- **Financial Independence milestone** default rule observed twice, with different multipliers each time: "Net Worth ≥ 20 × Spending" (prior free-tier pass) vs. "Net Worth ≥ 25 × Spending" (this session's fresh wizard) — confirming the multiplier is itself a user/default-editable number, not a fixed 4%-rule constant, and that the wizard's default may not be perfectly stable across sessions/personas **[UNKNOWN why the default differed]**.
- **Silent milestone/identity desync (incident, documented in full in [09_controlled_experiments.md](09_controlled_experiments.md))**: a fixed-date milestone ("Retirement: Jan 2039") carried over from a 47-year-old household silently became "retire at age 43" once the household was reassigned to a 30-year-old, cascading into early-withdrawal penalties and portfolio depletion — a concrete argument for Northstar to decide explicitly whether milestone dates are stored absolute or as an age/offset.
- **Auto-seeded milestone-adjacent expenses**: the wizard pre-populated "Medicare - You" / "Medicare - Spouse" expense entries once retirement-age household members existed, at ages implying Medicare-eligibility timing — i.e. some expense templates appear to auto-instantiate based on milestone/age proximity, not purely user-initiated **[INFERRED from observed behavior, mechanism not confirmed]**.
