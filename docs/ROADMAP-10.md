# Roadmap to 10/10 — trust, freshness, feel

Sep 2026, after Redesign v3 (docs/REDESIGN-V3.md, scored 8/10 by an
independent review). What separates 8 from 10 in a personal-finance tool is not
more chrome. It is three things: **every number is true and says what it
means**, **the numbers stay fresh without typing**, and **the app feels like
an instrument** (fast, direct, forgiving).

## Track A: Truth (engine + semantics)

The math has to survive a line-by-line fact check, and the UI must never
label a number with something it isn't.

Known defects, found by reading the code and the running app:

1. **"Today" is not today.** Every "Net worth today" / "Where it sits today"
   reads `result.years[0]`, the *projected close of the first plan year*
   (Dec 31). With an as-of date of Sep 25 the example plan shows $204.5K
   "today" while its actual opening balances total $168K. The engine should
   expose an explicit opening snapshot (balances at `asOfDate`) and the UI
   should use it wherever it says "today".
2. **The stub year is invisible.** The first plan year runs from `asOfDate` to
   Dec 31, so 2026 income, spending and savings rate are ~27% of a year. That
   is correct math, but tables and stats present it as a full "2026" (savings
   rate 41% next to 34% in 2027). Label it ("2026 · from Sep 25") everywhere a
   first-year figure appears.
3. **Partial-year growth convention.** Growth in the stub year is
   `balance × rate × fraction` (simple proration). It needs an explicit, tested
   convention (decided with the owner), applied consistently to growth, fees,
   interest, salary, and contributions.
4. **Contribution timing.** Contributions earn nothing in the year they are
   made (end-of-year convention), which understates growth for anything
   contributed monthly. It needs a documented, tested convention.
5. **Year rollover and staleness.** When the calendar passes the plan's
   as-of date, balances are stale; when it passes into a new year, `startYear`
   should roll forward. Neither is surfaced today.

The audit is a golden-test suite: hand-computed expected values for each
mechanic (growth, stub year, contributions, withdrawals and waterfall order,
taxes, capital-gains basis, mortgage amortization, home appreciation, RSU and
comp steps, raises, inflation and dollar mode, RMDs, SEPP, Social Security
COLA, annuity fees and surrender, goals funding, the retirement sweep). Every
expected number is derived in the test's comments so a human can check it.

## Track B: Freshness (Monarch drop-in, local only)

The owner scrapes Monarch with Playwright roughly monthly. That should be the
only step.

- `npm run monarch:sync` launches Chrome with a persistent, local-only
  profile. The first run is headed so the owner logs in themselves (the script
  never sees or stores credentials); later runs reuse the session. It pulls
  accounts, and optionally monthly cash flow, through Monarch's own GraphQL
  from inside the logged-in page, which is sturdier than scraping the DOM. It
  normalizes them with the existing snapshot mapper and writes
  `~/Library/Application Support/com.northstar.planner/monarch/<YYYY-MM-DD>.json`
  plus `latest.json`. Everything stays on this machine.
- The app discovers new snapshots itself: a Tauri command in the desktop app,
  a Vite dev-server route in the browser. It offers "New Monarch snapshot ·
  Sep 25 · Review", which opens the existing diff drawer (`previewImport` /
  `applyImport`). Applying also sets the plan's `asOfDate` to the snapshot
  date and appends a Progress point. Monthly syncs therefore build the
  actual-versus-plan history automatically.
- Drag-and-drop or pick a snapshot JSON file as a fallback.
- Plans are also written to a local JSON backup (the app data dir, rotated)
  so the webview's localStorage is never the only copy.

## Track C: Feel (UX 8 → 10)

**C1. Finish the review.** Close every open item in the final review (the
scratchpad FINAL-REVIEW.md list, checked against the code, since some were
fixed in the last pass): mobile chart label overlap, the chart card header
wrapping at 390, ceiling-tick crowding, stat-strip column balance, Gantt on
phones, the Retirement rhythm, header dividers, breakpoint consolidation, and
dead CSS.

**C2. One number language.** A single formatting rule: stats use 3–4
significant figures with no trailing ".0" ($204.5K, $12K, $230K); tables use
compact 3 sig figs; deltas are always signed. Axis ticks are round. Percent
series format as percents. Audit every `money*` call site.

**C3. Explain every number.** Each stat and horizon card gets a hover or focus
explainer: what it is, how it's computed, and which date it's as of. This is
the trust layer the references don't have. Reuse `HoverCard`.

**C4. Plan vs reality on Overview.** Once Progress points exist, from Monarch
or manual: "Ahead of plan by $12K since Sep 1", the actual line on the chart,
and a freshness chip ("Monarch · synced 24 days ago") that turns amber after
35 days.

**C5. Levers.** A compact "What if" panel on Overview: market return,
annual spending, retirement year. The chart shows a ghost line against the
saved plan with the horizon delta live, then Apply (one undo entry) or Reset.
The engine runs in microseconds, so this should track the pointer 1:1.

**C6. Desktop-native.** Tauri overlay title bar (traffic lights inset into the
rail, drag region), remembered window size, and keyboard map: ⌘1–⌘9 pages,
⌘N add event, ⌘, settings, ⌘Z/⇧⌘Z, `?` shortcut sheet. Feedback toasts with
Undo for edits ("Moved Buy a home to 2032 · Undo"), hand-rolled, no new
dependency.

**C7. Page depth where it's thin.**
- **Events:** each row shows its net-worth impact at the horizon, and bars
  are draggable on the Gantt (same commit path as the chart drag).
- **House:** the value and mortgage lines step at purchase instead of
  ramping from the prior year.
- **Cash Flow:** Sankey links carry amounts and the redundant "CASH FLOW"
  caption goes.

## Execution

Wave 1, in parallel on disjoint files:
- A: engine audit and fixes (`packages/engine`, plus the UI helpers that say
  "today")
- B: Monarch sync backend (`scripts/`, `src-tauri/`, a Vite plugin, a client
  module, ImportDrawer file-drop)
- C1 + C2: UX finish

Wave 2: C3–C7, plus the Monarch/freshness UI on top of wave 1.

Wave 3: independent Opus evaluation, then a Sonnet fix pass.
