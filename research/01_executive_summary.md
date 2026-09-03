# Executive Summary

**[OBSERVED throughout unless flagged]**

ProjectionLab is a **lifetime financial-projection engine**, not a budgeting app or a robo-advisor. Core loop: (1) enter your current financial state once ("Current Finances" — the source-of-truth balance sheet, shared across every Plan you create), (2) describe every income stream, expense, account, debt, and life event as a *time-bound, growth-modeled object* inside a Plan, (3) let one shared projection engine compute Net Worth, Cash Flow, Taxes, and Monte Carlo success decades out, (4) stress-test and optimize the plan with What-If comparisons and an auto-solving Optimize suite.

## What premium actually buys you

The free tier (per the prior research pass) is a single-plan, single-scenario calculator with a strong headline "Chance of Success" number — genuinely useful on its own. Premium is not a thin unlock of extra chart types; it is a **second product layer for decision-making**, confirmed this session with real numbers behind every previously-blurred screen:

- **Cash Flow** — a live, year-scrubbable Sankey diagram of every dollar in and out.
- **Tax Analytics** — per-income-source effective tax rates, a full bracket/composition breakdown, Legacy/Withdrawal-Rate/Taxes metric cards.
- **Chance of Success (full detail)** — percentile-band outcome charts, per-milestone timing-uncertainty tables, the literal list of 196 historical resampling years used.
- **Compare → What If** — a staged, revertible "try changes, keep/revert/fork" editing mode with a persistent visual indicator.
- **Optimize** — five sub-tools (Tax Strategy, Flexible Spending, Roth Conversions, Drawdown, Gain Harvesting) built on one shared composite strategy object, plus a **6-objective, 4-depth beam-search auto-optimizer** that finds and lets you apply the best preset strategy.
- **Reports** — a full year-by-year data table (Explore), a Plots library (~25 chart datasets), and PDF/CSV/JSON export.
- **Estate** — a completely separate module: Gross Estate / Estate Drag / Net Legacy metrics, an estate-flow Sankey, an itemized breakdown, and auto-generated plain-English insights.
- **Multiple Plans + Progress** — parallel what-if plans and real-calendar-time tracking of actual net worth vs. plan.

## The one big architectural idea (confirmed, still true under premium)

Nearly every date field in the system can point at a **Milestone** — "at Retirement," "at Financial Independence," "when Net Worth crosses $X" — instead of a literal date. Change one root assumption and the entire projection, every dependent milestone, the Monte Carlo success rate, the Tax Analytics numbers, and the Estate figures all recompute together, instantly, with no "recalculate" button. This session reproduced it exactly: moving one milestone (Retirement, 60→45) cascaded through the Plan chart, the plan-health warnings, and Chance of Success (100.00% → 65.82%) in under two seconds. See [09_controlled_experiments.md](09_controlled_experiments.md).

The corollary risk, also discovered directly this session: a milestone pinned to a **literal date** rather than a relative age can silently desync if the underlying person's identity changes (we reassigned a 47-year-old married household to a 30-year-old single person; the "Retirement: Jan 2039" milestone silently became "retire at age 43," triggering early-withdrawal penalties and portfolio depletion). Northstar should decide deliberately whether milestones store an absolute date or an age offset — or make that choice itself a first-class, migratable setting.

## Monetization shape

Premium sells **decision-making leverage layered on the same underlying data model**, not new data-entry surface area. Every Optimize/Compare/Estate/Reports screen consumes the exact same Income/Expense/Account/Milestone objects a free user already builds — there is no separate "premium data model." This is architecturally clean and worth deliberately deciding whether to copy: it means a user's free-tier work is never wasted, and the upgrade pitch is entirely about *what you can now do with what you already entered*.

## Real domain expertise, not toy numbers

A recurring pattern worth calling out on its own: the product embeds current, real tax-code detail as live constraints rather than cosmetic labels — 2026 IRA/401(k) contribution limits inline in an account-goal form, IRMAA/NIIT/ACA-subsidy-cliff awareness in the Tax Strategy builder, the current $30M federal estate-tax exemption in the Estate module, and real depreciation schedules (27.5-year residential / presumably 39-year commercial) plus the Section 199A QBI deduction on Rental Property. This is a credibility signal a from-scratch Northstar will need to match or consciously decide to simplify away from.
