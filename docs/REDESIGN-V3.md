# Redesign v3 — from "a chart in a card" to a finance workspace

Audit + plan, Sep 2026. Reference points: the "Goodcast · Forecast" and
"Fenisco" dashboards the owner shared. What we take from them is *structure*,
not skin:

- **Goodcast:** a page title with a mono "Data as of … · Run #" meta line and a
  status chip at the right; a **divider-separated stat strip** (one XL number,
  three secondary, small-caps mono labels, a tiny delta tag) — no boxes around
  each stat; a full-width chart with a dotted **TODAY** line, actual (solid ink)
  vs forecast (dashed, P10–P90 band) and **direct end labels** (P90 / P50 / P10)
  instead of a legend; a row of **horizon cards** (30D / 60D / Q-end: value,
  spread badge, P10 left / P90 right in mono) plus a "locked vs modeled"
  progress bar card; a **classification bar** (one stacked bar + dot legend with
  counts).
- **Fenisco:** a greeting/summary line, KPI tiles with a delta chip, a
  time-range segmented control (M / Y / All), a "recent activity" table with
  status pills, a side column for secondary objects.

What we keep from our own rules (docs/DESIGN-DIRECTION.md): **colour is data**
(chrome stays neutral; the four validated data hues are not touched), the
hero figure uses proportional figures, tables use tabular-nums, no motion on
numbers you read. DESIGN-DIRECTION killed the 4-equal-KPI strip for *uniform
weighting*; the Goodcast strip solves that with hierarchy (one XL + three
quieter, hairline dividers), which is what we adopt.

## Audit — what's wrong today (1440 / 390, light)

**Information architecture**
1. Ten flat nav rows in two groups. "Plan" mixes the ledger (Accounts, Cash
   Flow, Events) with goal lenses (Retirement, House, Annuity) — two different
   jobs.
2. No page has a real header. Accounts / Cash Flow / Events open straight into
   a card whose first element is a native `<select>` labelled "Compare".
3. Three pages are effectively empty on the example plan: Annuity (one line of
   text), Progress (empty table), Compare (two buttons). Retirement is empty
   until you drag a slider.
4. Overview has one number and one chart. Everything a returning user wants to
   glance at — net worth today, the range, goals funded, what's next, account
   mix — requires visiting another page.

**Visual**
5. Every page is a single white card floating in a grey field with large empty
   areas below; no composition, no grid.
6. The "jelly" chrome (gradient black primary button, heavy lit edges) reads
   dated next to the references' crisp 1px-border flat chrome.
7. The nav rail's active item is a saturated blue slab — the loudest element on
   every page, and it violates "colour is data".
8. Chart: event labels collide ("Second child" / "Buy a home"); event dots sit
   *below* the line; legend is a row of tiny chips; the range toggle is a
   separate "Range" button. No "today" marker, no end labels.
9. House: four equal KPI boxes then a chart with an unlabelled y-axis step; the
   "Buying costs $2.20M" line is an orange alert box with no context.
10. Native `<select>`s (Compare) and mismatched button styles (Reports' Explore
    / Plots vs Export).

**Mobile (390)**
11. Nav becomes an icon strip that scrolls off-screen; the plan name eats half
    of it. Balance sheet truncates account names ("Taxabl…").

## Target information architecture

Routes stay the same (no broken links, ⌘K keeps working). The rail regroups:

```
Northstar                       (brand)
[ House Forecast ▾ ]            plan switcher: name + "2026–2046 · 21 yrs"
[ ⌕ Search or jump…      ⌘K ]   opens the command palette

Overview

PLAN
  Accounts
  Cash Flow
  Events

GOALS
  Retirement
  House
  Annuity        (muted "Add" hint when the plan has no annuity)

ANALYSIS
  Progress
  Compare
  Reports

────────────
⚙ Settings   ◐ Theme   ⋯
```

Every page uses the same frame:

```
PageHeader: Title                                   [status chip] [actions]
            mono meta: "House Forecast · as of Sep 2, 2026 · 2026–2046"
StatStrip:  XL stat | stat | stat | stat            (hairline dividers)
Primary:    the page's main chart / table in a SectionCard
Secondary:  a grid of StatCards / SectionCards
```

## Page-by-page targets

**Overview (the dashboard).** Header "Overview", meta line, status chip
(Monarch synced / manual balances — from `monarch.status`). StatStrip: *Net
worth today* (XL) · *Projected at {endYear}* with a delta tag vs today ·
*Range P10–P90* as a % spread of P50 · *Savings rate this year* (or freedom
age if the plan has a retirement event). Then the net-worth chart (full width)
with a TODAY marker, P10/P50/P90 end labels when the range is on, and
non-colliding event labels. Then a row of horizon StatCards (+5y, +10y,
horizon: value, spread badge, P10 left / P90 right). Then a two-column row:
**Goals** card (each goal: name, target by year, a progress bar funded vs
target, on-track tag) and **Coming up** card (next 4–5 events: icon, name,
year, net-worth impact, click to edit). Then an **account mix** classification
bar (Cash / Taxable / Tax-deferred / Tax-free / Real estate / Annuity …, with
balances today).

**Accounts.** Header + StatStrip (Net worth · Assets · Liabilities · Liquid).
Account-mix bar. Balance sheet table in a SectionCard with a toolbar row
(segmented year window pager + a real Select for Compare). Wider name column,
no truncation at 390 (sticky first column, horizontal scroll for years).

**Cash Flow.** Header + StatStrip for the selected year (Income · Spending ·
Taxes · Saved, with savings rate). Year picker as a compact stepper in the
header. Sankey in a SectionCard; annual table below.

**Events.** Header with "+ Add event" primary action. StatStrip (events count
· income events · cost events · next event in N years). Gantt timeline in a
SectionCard with a TODAY line; rows clickable to edit.

**Retirement.** Renders a result immediately at a sensible default (the plan's
retirement event age, else 65); slider stays but in the header's action area
or a control bar. StatStrip: freedom age · income replacement · money lasts
until · safe withdrawal. Chart below.

**House.** Header, StatStrip (Home value at horizon · Equity at purchase ·
Equity at horizon · Payoff year). Down-payment readiness as a proper goal row
(progress bar, not a donut). Chart with direct end labels. Total cost of
buying as a neutral stat with an explanation, not an alarm box.

**Annuity.** If no annuity: an EmptyState that explains what the page will
show and offers "Add a variable annuity" (opens the account drawer for that
class). Otherwise existing content, reframed with header + StatStrip.

**Progress.** EmptyState with a primary "Log today's net worth" action that
pre-fills today's projected value; once points exist, an actual-vs-plan chart
above the table.

**Compare.** A card per other plan (name, net worth at horizon, delta vs the
active plan, tiny sparkline), click to compare; What-If as a prominent card
with a clear explanation.

**Reports.** Header with Export actions in the header, segmented control
(Table / Charts), StatStrip summarising the plan (horizon net worth, avg
savings rate, total taxes, peak withdrawal year). Table unchanged in
substance.

## Design system changes

- **Chrome goes crisp.** Buttons: flat, 1px border, 8px radius, 32–36px tall;
  primary = solid ink (no gradient) in light, solid near-white in dark.
  Cards: 1px `--border`, 14px radius, the lightest shadow. The jelly press
  squash stays only as a subtle `scale(0.98)` on `:active`.
- **Eyebrow labels:** 11px IBM Plex Mono, uppercase, +0.06em tracking,
  `--muted` — every stat label and section meta.
- **Rail:** light surface in light theme (surface bg, 1px right border), dark
  in dark theme. Active row: `--chip` background + ink text + medium weight;
  no saturated fill. Group labels are eyebrows.
- **Delta tag:** tiny mono tag, `--in-deep` on `--in-tint` for positive,
  `--out-deep` on `--out-tint` for negative (these are data: they encode a
  change in money).
- **Mobile (<1024px):** rail becomes a 56px top bar (brand mark, plan
  switcher, menu button); the menu button opens the full rail as a left
  sheet. StatStrips wrap to 2×2. Tables keep a sticky first column.

## Execution

Phase 1 (one agent): tokens, chrome, rail + IA, shared components in
`src/planner/ui/`. Phase 2 (three agents in parallel, disjoint files):
Overview · Plan pages · Goals + Analysis pages. Phase 3: an independent review
against this doc and the references, then a fix pass.
