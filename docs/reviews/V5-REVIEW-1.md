# v5 Review 1: Opus review of Phases A–C

Oct 18, 2026. Branch `redesign-v5` at `4d13e1e`. Reviewer: Opus. No source edits were made.

**How this was checked**

- `npm run lint && npm test` is green: 478 + 320 + 85 tests.
- **Port 3000 (read only).** The stored "House Forecast" plan runs 2026–2091 and runs dry in 2071. I checked every page at 1440px in light. I also read this plan's account settings directly; that read is the source of the "set to never withdraw" finding in F6. Two caveats about this plan:
  - It has one adult, "You". It is not Spencer's two-adult installed plan, and there is an `agent-reset-backup` key in its storage.
  - Its tax-deferred account and variable annuity have `withdrawalTiming: 'never'`.
- **Port 3120 (scratch).** I loaded the example plan, ran household setup, added Sarah, and raised Shared to $11,000/mo so the plan runs dry in 2031. Playwright then:
  - took full-page shots at 1440 and 390, light and dark, with the horizon stretched to 66 years;
  - ran a frame-time probe during a real mouse scrub;
  - ran a 390px overflow probe.
- **Hands-on checks:** scrub, pin, the 1Y range, the series switcher, the account sheet, drag-dismiss (1:1 tracking confirmed), alert hide → Undo → "Show hidden alerts (1)", inline envelope edit → ghost + Impact → Keep, the Kids sheet, Add person, the keyboard event nudge (moved the event, one undo toast), and the old-route redirects.

**Screenshots** are in `/private/tmp/claude-501/-Users-spencerreppond-Coding-Northstar/dc7247a5-5a83-4f4d-ba84-6f708831c1f1/scratchpad/review1/`:

- `ex-<page>-{d,m}-{light,dark}.png`: the 3120 plan at 66 years.
- `real3000/*.jpg`: Spencer's dev plan.
- `perf-midscrub-*.png`.
- `shoot.mjs`: the driver, re-runnable with `LONG=1 node shoot.mjs shots|perf|overflow` against a 3120 server.

---

## Verdict

**Overall: 7.3 / 10.** The structure Spencer asked for is mostly in place:

- one headline page;
- a 7+2 rail;
- a scrubbable kit on every time chart;
- dismissible alerts;
- a pill, alert and band for running dry on every page;
- per-person envelopes;
- a person-lane Timeline;
- a spring sheet with drag-to-dismiss;
- native sideways scrolling.

It does not meet the bar yet, for four reasons:

1. **The thing Spencer liked most is broken while you use it.** While you scrub, the big readout number is invisible. Measured opacity mid-scrub is **0.00** on Net Worth, Cash Flow, Budget and Retirement. `AnimatedFigure` replays a 420ms blur-in on every value change, so a continuous scrub never lets it land.
2. **Several numbers are wrong or contradict each other on the danger path:**
   - The hatched band runs to the plan's end even after the plan recovers.
   - Budget labels every retirement drawdown year "✗ Short" and shows negative after-tax income.
   - Home says "✓ Pays every bill" on a plan that runs dry in 2071.
3. **The shell has a visible defect.** The rail scrolls away on every long page. The phone header overflows on long plans, which hides the "…" menu.
4. **The chart audit only half happened.** Three charts answer "income vs spending over time", and three answer "liquid money over time".

---

## Scores per requirement

| # | Requirement | Score | Evidence |
|---|---|---|---|
| R1 | Every chart scrubbable | **6** | Every time chart scrubs and pins. But the readout figure is at opacity 0 during a scrub (F1). The Annuity basis/gain donut is static ("Worth today"). Budget's "Your month in YEAR" follows only the pin, not hover. |
| R2 | Dismiss alerts | **9** | × → "Hidden · Undo" toast → "Show hidden alerts (1)" restores it. Keyed per signature. The rail pill stays, which is correct. |
| R3 | Running dry obvious everywhere | **6** | Rail pill, top alert, hatched bands, Short pills, tinted table columns, unfunded donut slices, a Timeline "RUNS DRY" band. Undermined by four problems: the band covers recovered years (F2); Budget shows false "Short" (F3); Home's price curve says "Pays every bill" (F7); and nothing explains *why* the plan runs dry while $875K sits in a 401(k) and annuity set to never withdraw (F6). |
| R4 | Cut overview; 1Y–40Y ranges | **8** | Ranges plus All, hidden when longer than the plan. 1Y draws 3 dotted points. The old Overview clutter is gone. At 390px on a long plan the range row pushes "What if" and "…" off-screen (F5). |
| R5 | Shared, then per-person budget | **7** | Inline editing of Shared and each adult writes the remainder or allowance line, with ghost, Impact, Keep and Undo. Three gaps: drawdown years read as "Short" with negative after-tax (F3); existing kids' stage options can't be edited (F9); the envelope values sit about 400px from their labels (F23). |
| R6 | Apple-design focus; rethink nav | **6** | The 7+2 IA, system font, springs and scrim-dimmed sheets are good. But: the rail scrolls off-page (F4); the theme flashes on load (F20); the sheet material lets the page bleed through (F15); Home is still 5 charts long; leftover explanatory copy. |
| R7 | NW chart + year split (balances \| spending donut), click pins with a white line | **8** | It works exactly as described, and the white pin line is right in dark mode. The hero says "Short $67.1K" (per year) while the donut beside it says "Short $5.6K a month" (F10). Zero-value legend rows add noise (F16). |
| R8 | Two-finger sideways scroll | **9** | Native `overflow-x`, a sticky first column and edge fades. The stub header "2026 / from Oct 18" takes 3 lines (F19). |
| R9 | Remove comparisons | **8** | The in-page pickers, fan, deltas and impact tags are gone. `PlannerContext` still runs the compare plan and the ±2pt fan (**3 extra full simulations per edit**) for nobody (D1). |
| R10 | Before/after donut instead of repeated bars | **8** | Home "Your budget" with a Before/After toggle that morphs. Its legend shows "Personal $0/mo 0%" and "One-time $0/mo 0%". |
| R11 | Chart audit: unique, helpful, interactive | **6** | Each page leads with a different form, but the rest repeats: Cash Flow hero ≈ Budget by-year ≈ Retirement source stack; NW Spendable ≈ Retirement Investable ≈ Home cash cushion (F8). The Cash Flow hero is crushed by a one-time spike (F11). |
| R12 | Delete Progress | **10** | The page, route, nav entry and shortcut are gone, and `/progress` redirects. Stored `progressPoints` are untouched. |
| R13 | Events by person, modern | **8** | Person lanes, career bars, stage segments, a dry band, sticky axis, a TODAY wash, and a lovely vertical phone layout. The second child's lane is brick red, the danger hue (F21). "Add person" is a full-height 600px sheet for two fields (F26). Lanes leave uneven empty space. |
| R14 | Cash Flow: groups, after-tax headline, underfunding | **7** | Income is after tax and expands to gross and tax; Home, Kids, Shared and One-time groups; waterfall; red Unfunded row. But the Unfunded row is not at the top of the totals (F12), the hero is dominated by the down-payment spike (F11), and its after-tax figure disagrees with Budget's (F3). |
| R15 | Less text, bigger charts | **7** | Mostly done. Leftovers: the account-type paragraph in the account sheet, the Retirement footnote, the Kids-sheet caption, "Net worth at 60 —" in the Impact strip. The account-sheet chart is 240px (F17b). |
| R16 | Overview + Accounts on one page | **9** | Chart, then the snapshot and donut split, then the balances table. |
| R17 | Account popout: smooth, line draws in, scrub, assumptions, ranges | **7** | Spring sheet, delayed draw-in, sheet-local range, inline form with ghost and Keep/Reset, drag-dismiss tracks 1:1. The chart is small, there is no row→header morph (F25), and the body is translucent so the page donut shows through (F15). |
| R18 | Reference look: value above, glow, glowing dots, dashed cursor | **7** | All present. Losing the value during scrub (F1) defeats the point of the pattern. Event ticks are 8px and nearly invisible (F18). |
| R19 | Pie popouts where they fit | **7** | NW donut slice → category sheet with a scrubbable line and its parts; the Unfunded slice jumps to Cash Flow. The Home-slice drill-down was **not exercised**; D2 should verify it. |
| R20 | Series switcher: net worth ↔ single account | **9** | The "Net worth ▾" menu (Net worth, Spendable, each class) redraws with the draw-in, and the readout label follows. |

**Mean: 7.65. Weighted overall: 7.3.** R1, R3 and R11 are the heart of the brief.

---

## Ranked fix list

Severity: **blocker** = contradicts the brief or shows wrong numbers. **major** = clearly visible quality or behaviour gap. **minor** = rough edge. **polish** = nice to have.

### F1 · blocker: the readout number is invisible while scrubbing
**Problem.** `AnimatedFigure` remounts every character with a fresh `key` on every string change. `.ns-figure-char` runs `ns-figure-in` (420ms, opacity 0 → 1, blur 6px → 0) plus a 16ms stagger per character. Scrub events arrive every frame, so the hero value, the snapshot rows and the donut center stay blurred or invisible. Probe: mid-scrub opacity `0.00,0.00,…` on 4 pages (`perf-midscrub-net-worth.png`). This also breaks planner.css's own rule, "anything you read does not move".

**Files:** `src/planner/AnimatedFigure.tsx`, `src/planner/planner.css` (the `.ns-figure-char` block only).

**Done when:**
- A change that arrives within ~250ms of the previous one swaps the text instantly (no animation).
- Only an isolated change (a pin, range, series switch or plan edit) plays an opacity-only cross-fade of ≤150ms. No blur and no per-character stagger on numbers.
- The `perf` probe reports opacity 1.00 for every character mid-scrub.
- Reduced motion: always instant.

### F2 · blocker: the danger band covers recovered years, and readouts say "Short" where nothing is short
**Problem.** `dangerBand()` (`pages/netWorthData.ts`), its copy in `decisionKit.ts`, and the inline versions in `CashFlowPage.tsx`, `BudgetPage.tsx` and `EventDrawer.tsx` all pass only `from: firstShortYear`. `TimeSeriesChart` therefore hatches through to the last year and flags `isShort` for every later year. With short years 2031–2045 the whole chart to 2091 is hatched, and the NW readout at 2091 shows "✗ Short" next to "Spendable $12.31M" (`ex-net-worth-m-dark.png`).

**Files:**
- Kit: `charts/types.ts` (DangerBand gets `years: number[]`; contiguous runs are drawn as separate rects, the chip goes on the first run, and `to` stays for back-compat); `charts/TimeSeriesChart.tsx` (`isShort` = membership in `years`).
- `health.ts`: export the single helper `healthDangerBand(health, result, perUnit?)`.
- `pages/netWorthData.ts` and `decisionKit.ts`: re-export or delegate to it.
- Pages: `CashFlowPage.tsx`, `BudgetPage.tsx`/`views/BudgetColumns.tsx` and `drawer/EventDrawer.tsx` call the helper (their own units).

**Done when:**
- A test fixture with non-contiguous short years draws one rect per run.
- The readout shows no Short pill outside `health.shortYears`.
- `grep "from: health.firstShortYear"` returns 0 hits.

### F3 · blocker: Budget calls every drawdown year "Short", and after-tax disagrees across pages
**Problem.** Spencer's plan, 2060 (retired; drawing from taxable; not a short year):

| Page | After tax /mo | Spending | Saved | Short? |
|---|---|---|---|---|
| Cash Flow | $0 | $10.8K (includes $976 tax on withdrawals) | Drawn down $10.8K | no |
| Budget | **−$976** | $9.9K | **−$10,848** | **✗ Short** pill, and a hatched "Short" donut slice |

Causes:
- `budgetView.ts` computes `afterTax = totalIncome − totalTaxes`, so withdrawal tax lands in after-tax income.
- `BudgetPage` turns any negative `saved` into a red "Short" (lines 182–192, 687–693).

**Files:** `budgetView.ts` (+ test), `pages/BudgetPage.tsx`, `views/BudgetColumns.tsx`, `cashFlowView.ts` (reference only; keep its definitions).

**Done when:**
- Budget's after tax = `incomeWithTax().total.net`, the same number as Cash Flow.
- Withdrawal tax shows as its own row, or is netted exactly as Cash Flow nets it.
- Negative saved reads as a neutral/orange "From savings −$X".
- "✗ Short" and the hatched slice appear only when `health.shortYears` includes the year, sized by `unfundedShortfall`.
- A reconciliation test asserts Budget after tax == Cash Flow after tax and Budget saved == Cash Flow saved (recurring basis, one-time labelled) for every year of `runsDryPlan()` and `kitchenSinkPlan()`.

### F4 · major: the rail scrolls away on every long page
**Problem.** `index.css` sets `html, body { overflow-x: hidden }`, which makes them scroll containers, so the rail's `position: sticky` never engages. Measured: rail `top: -500` at `scrollY: 500`. In screenshots the nav ends mid-page in a dark box (`budget-rail-scrolled-away-3120.jpg`, `real3000/cashflow-table-rail-gone.jpg`).

**Files:** `src/index.css`.

**Done when:**
- `overflow-x: clip` replaces `hidden` (WKWebView supports it).
- The rail stays pinned on Cash Flow, Budget, Home and Annuity at every scroll position.
- The 390px overflow probe is still clean, with no horizontal page scroll.

### F5 · major: phone header overflow on long plans
**Problem.** On a 66-year plan at 390px:
- Net Worth: `.ns-nw-actions` right edge at 445px; "What if" is clipped and "…" (Edit assumptions, + Add event) is unreachable.
- Cash Flow: `.ns-cf-controls` right edge at 419px.

**Files:**
- `pages/net-worth.css` and `pages/NetWorthPage.tsx` (U3);
- `pages/cash-flow.css` (U2);
- `charts/RangePicker.tsx` (U1: add a `compact` prop that renders the options in a horizontally scrollable pill track with edge fades, or a menu below 480px).

**Done when:** `LONG=1 node shoot.mjs overflow` prints `[]` for every page.

### F6 · major: health never says why the plan runs dry
**Problem.** On port 3000, in 2081, Tax-deferred holds $523K and the variable annuity $353K, but Spendable is $0 and $66K/yr goes unfunded. Both accounts have `withdrawalTiming: 'never'`, which is also the example plan's default for tax-deferred. Spencer will read "runs out of money" as a forecast fact when it is a settings artefact.

**Files:**
- `health.ts` (+ test): add `stranded: { accountId, accountClass, balance, reason: 'never' | 'noRule' | 'sepp' | 'penalty' }[]`, measured at `firstShortYear`.
- `PlanHealthAlert.tsx`: a second clause such as "…while $876K in Tax-deferred and Variable annuity is never drawn · Review", which opens that account's sheet.

**Done when:**
- Spencer's plan's alert names the stranded accounts with a one-click path to fix them.
- The test covers each `reason`.

### F7 · major: the Home price curve says "Pays every bill" on a plan that runs dry
**Problem.**
- Port 3000: "Plan ✓ Pays every bill", and the House-poor check "Pays every bill for 10 years · Yes".
- The same page's Impact strip says "Money lasts until 2071", and its footer says "Buying… causes the plan to run dry, in 2071".

The 10-year window hides the failure.

**Files:** `priceCurve.ts`, `views/PriceCurve.tsx`, `pages/HousePage.tsx`.

**Done when:**
- The readout's plan status for each price uses the full-horizon `firstShortYear`: "✓ Pays every bill through 2091" or "✗ Short from 2071".
- The check row is renamed to match.
- Same number as the rail pill for the current price.

### F8 · major: chart repetition (R11)
**Problem.** Two clusters of charts answer the same question:
- **Income vs spending over time:** Cash Flow hero (two lines + gap), Budget "by year" (spending columns + after-tax line), Retirement "What pays for each year" (source stack + need line).
- **Liquid money over time:** NW Spendable, Retirement "Investable balance", Home "cash cushion".

**Files:** `views/BudgetColumns.tsx` and `pages/BudgetPage.tsx` (U2); `views/RetirementForecastView.tsx` (U3).

**Done when:**
- **Budget by year** becomes "Where each after-tax dollar goes": a **100%-stacked area** of the envelopes (Shared, each adult, Kids, Saved; From-savings below zero) with no absolute after-tax line. It is a share-over-time form, unique in the app, and a hover drives "Your month in YEAR".
- **Retirement "Investable balance"** becomes a stacked area split into **"Can spend now"** and **"Locked"** (penalty, never-withdraw, SEPP), using F6's gates. It explains the failure instead of repeating NW's line.
- Home cash cushion stays; rent vs buy is unique.

### F9 · major: an existing child's stage options can't be edited
**Problem.** The Kids sheet lists "arrival" and "everyday costs" lines only. The daycare, school and college toggles from Family were lost in the merge, which is a regression.

**Files:** `KidsSheet.tsx`, `PersonSheet.tsx` (U4).

**Done when:**
- For each child, the stage toggles and their costs can be edited with preview, ghost and Keep.
- Each stage produces exactly one budget line, and a test covers it.

### F10 · major: Short amounts mix units
**Problem.**
- Budget in /mo mode shows "Short $66.4K" (annual).
- NW hero "Short $67.1K" sits beside the donut's "Short $5.6K a month".

**Files:** `charts/ChartReadout.tsx` (a `shortUnit` suffix prop, U1); `pages/BudgetPage.tsx`/`BudgetColumns.tsx` (U2: `shortFor` ÷ months); `pages/NetWorthPage.tsx` (U3: hero pill shows "/yr", or the donut switches to the same unit).

**Done when:** every Short figure on a page uses that page's unit, with an explicit suffix.

### F11 · major: the Cash Flow hero is crushed by one-time spikes
**Problem.** The down payment (a $40K/mo-equivalent spike) sets the y-domain, flattening 60 years of lines into the bottom third (`real3000/cashflow-top.jpg`, `ex-cashflow-d-dark.png`).

**Files:** `pages/CashFlowPage.tsx`.

**Done when:**
- The lines plot recurring spending.
- One-time lumps draw as labelled columns or markers from the baseline, with a capped height and a "↑ $230K" chip.
- The readout and waterfall still include them.

### F12 · minor: Unfunded row position
**Problem.** The red Unfunded row sits after Withdrawals. The spec says it goes at the top of the totals.

**Files:** `cashFlowView.ts` / `tabs/CashFlowTab.tsx`.

**Done when:** it is the first totals row whenever `health.status === 'short'`.

### F13 · minor: EventDrawer delays commit 260ms
**Problem.** `LEAVE_MS` holds Save/Cancel until the exit animation has played. Apple's guidance is to respond instantly.

**Files:** `drawer/EventDrawer.tsx` (and its mount in `App.tsx`).

**Done when:**
- Save commits synchronously.
- The sheet keeps a last-draft ref and plays its exit afterwards, as `AccountSheet` does.

### F14 · minor: reduced motion disables drag-to-dismiss
**Problem.** `onPointerDown` returns early under `reduce`. Direct 1:1 tracking is not vestibular motion.

**Files:** `ui/Sheet.tsx`.

**Done when:** under reduced motion, tracking still follows the finger, and a release past threshold closes with the 200ms fade.

### F15 · minor: the sheet body is too translucent
**Problem.** The page's donut and bars show through the account and Kids sheets (`real3000/account-sheet-taxdeferred.jpg`, `kids-sheet-3120.jpg`). This breaks the skill's "never stack translucent on content" rule.

**Files:** `ui/sheet.css`.

**Done when:**
- The body sits on a ≥0.94-opacity surface; keep the blur strongest at the header and edge.
- Under `prefers-reduced-transparency` it is solid.

### F16 · minor: zero rows in donut legends
**Problem.** Rows such as "Kids $0/mo 0%", "One-time $0/mo 0%", "Unfunded $0/mo 0%", "Personal $0".

**Files:** `charts/DonutChart.tsx`.

**Done when:** legend rows with |value| < 0.5 are hidden, while arcs keep their keys so the morph still works.

### F17 · minor: inconsistent focus-year defaults and hover-following
**Problem.**
- Home's hero reads 2031 while its cash cushion and "Owning it" read 2091.
- Budget's month follows only the pin, not hover.
- F17b: the account-sheet chart is 240px; make it 300px.

**Files:** `pages/HousePage.tsx`/`views/HouseForecastView.tsx` (U3), `pages/BudgetPage.tsx` (U2), `drawer/AccountInsight.tsx` (U3).

**Done when:**
- Every chart on a page defaults to the same year.
- Hovering any Budget chart previews the month.

### F18 · minor: event markers are almost invisible
**Problem.** The NW event ticks are 8px marks with labels only on hover.

**Files:** `charts/TimeSeriesChart.tsx`, `charts/charts.css`.

**Done when:** markers are a 12px tick plus a 5px tone dot, the hover chip is unchanged, and the marker sits outside the danger hatch so it stays readable.

### F19 · minor: axis ticks and stub labels
**Problem.**
- X ticks fall on odd steps (Today, 2035, 2044, 2053…).
- The stub column reads "2026 / from Oct 18" on 3 lines, and "Today / from Sep 2" appears under chart axes.

**Files:** `charts/seriesMath.ts` (`pickXTicks` prefers multiples of 5/10; U1); `tabs/DataTable.tsx`/`AccountsTab.tsx` (U3) and `tabs/CashFlowTab.tsx` (U2) for the header (year only; "from Oct 18" moves to a `title` tooltip); the `stubYear` prop on decision charts (U3: drop it).

### F20 · minor: theme flash on load
**Problem.** When the OS theme differs from the chosen theme, controls render in the wrong theme for about 2s (`real3000/annuity-load-flash.jpg`, `reports-load-flash.jpg`).

**Files:** `index.html` (an inline script that stamps `data-theme` from `localStorage['northstar:theme']` before paint), `ThemeToggle.tsx`.

**Done when:** a cold load with an OS/app mismatch shows no wrong-theme frame.

### F21 · minor: colours that collide with danger
**Problem.**
- The second child uses `--mix-5` (brick red).
- Real estate's bar is red.
- `ADULT_COLORS` has 2 entries, so a third adult reuses one.

**Files:** `budgetView.ts` (U2; ADULT_COLORS ≥4, CHILD_COLORS never mix-5); `ui/StackedBar.tsx` `ACCOUNT_CLASS_MIX` (U3 owns this function's colours only; D1 must not delete the file, see below).

### F22 · minor: text that hasn't earned its place
Cut or move behind an (i):
- the account-type paragraph in the account sheet (`AccountForm.tsx`/`AccountInsight.tsx`);
- "One-time costs, like a down payment, are left out." (`RetirementForecastView.tsx`);
- "Rounded national estimates in today's dollars." (`KidsSheet.tsx`);
- the "Net worth at 60 —" cell when it has no value (`ImpactStrip.tsx`).

Files are listed per unit below.

### F23 · minor: Budget envelope layout sprawls
**Problem.** At 1440px the labels sit at the left and the figures at the far right edge, about 400px apart. There is no edit affordance until you click.

**Files:** `pages/budget.css`, `pages/BudgetPage.tsx`.

**Done when:**
- The envelope list is ≤520px wide next to the donut.
- The figures show an underline or pencil on hover, focus and press.

### F24 · minor: phone hero heights
**Problem.** The Cash Flow hero is a fixed 420px on phone; the spec is 280.

**Files:** `pages/CashFlowPage.tsx`.

### F25 · polish: row→sheet morph
**Problem.** The `layoutId` morph was skipped everywhere.

**Files:** `NetWorthPage.tsx` snapshot rows → `AccountDrawer.tsx` header (U3).

**Done when:** the icon and label morph into the header, or the item is closed as won't-do with a note.

### F26 · polish: the Add person sheet is oversized
**Problem.** A full-height 600px panel for two fields.

**Files:** `pages/TimelinePage.tsx`/`PersonSheet.tsx` (U4).

**Done when:** a compact, content-height sheet or an anchored popover.

### F27 · minor: the Annuity basis/gain donut is static
**Files:** `pages/AnnuityPage.tsx` / `views/AnnuityAccountSection.tsx`.

**Done when:** it follows the focus year (basis left vs gain), with the center showing the year.

### F28 · minor: scrub re-renders the whole table
**Problem.** Page-level `hover` state re-renders the ScrollTable on every pointer move. 66-year Cash Flow showed frames up to 100ms (5 of 127 over 33ms); the median is 16.7ms on an M-series Mac, and WKWebView will be worse.

**Files:** `tabs/AccountsTab.tsx`, `tabs/DataTable.tsx` (U3), `tabs/CashFlowTab.tsx` (U2).

**Done when:**
- Each is wrapped in `React.memo` with stable props (no hover passed in).
- The `perf` probe shows max < 33ms on a 66-year plan.

### F29 · polish: dev routes ship in the production bundle
**Files:** `App.tsx`.

**Done when:** `DevChartsPage` and `DevUiPage` are `React.lazy` imports inside the `import.meta.env.DEV` branch.

**Not code fixes. Flag these to Spencer:**
- **(a)** The port 3000 plan has one adult. Per-person budgets need Sarah added as a participant.
- **(b)** The engine keeps funding 401(k) payroll contributions in years that are unfunded (example plan, 2032–34). This is an engine policy question.

---

## Work units: 4 parallel Sonnet units plus D1, with disjoint files

Every unit must:
- read §1 of `docs/REDESIGN-V5.md` and `~/.claude/skills/apple-design/SKILL.md`;
- run `npm run lint && npm test`;
- drive the UI at 1440 and 390, light and dark, on a scratch port (never change port 3000's data);
- re-run `scratchpad/review1/shoot.mjs` (`LONG=1 … perf|overflow|shots`) against its own server port, editing `BASE`.

**Ownership rules:**
- `planner.css` belongs to **U1 only**.
- `PlannerContext.tsx` belongs to **D1 only**.
- If a unit needs a kit change that isn't listed, it adds it backwards-compatibly in a separate commit touching only `src/planner/charts/`, and only if U1 has merged first. Otherwise it waits.

### U1 · Kit, figures and health (merge first)
**Owns:**
- `src/planner/charts/*` (TimeSeriesChart, types, seriesMath, ChartReadout, DonutChart, RangePicker, charts.css);
- `src/planner/AnimatedFigure.tsx`, `src/planner/planner.css`;
- `src/planner/health.ts` (+ test);
- `src/planner/pages/netWorthData.ts` (+ test), `src/planner/decisionKit.ts`.

**Fixes:** F1, F2 (kit + helper + the two shared helpers), F5 (the RangePicker `compact` mode), F6 (the `stranded` data), F10 (the ChartReadout unit prop), F16, F18, F19 (ticks).

**Verify:**
- `/dev/charts` has a non-contiguous band fixture.
- The `perf` probe shows mid-scrub figure opacity 1.00.
- Unit tests cover `healthDangerBand` runs and `stranded` reasons.

### U2 · Cash Flow and Budget (after U1)
**Owns:**
- `pages/CashFlowPage.tsx`, `pages/cash-flow.css`, `tabs/CashFlowTab.tsx`, `cashFlowView.ts` (+ test), `incomeTax.ts`;
- `pages/BudgetPage.tsx`, `pages/budget.css`, `pages/household.css`, `views/BudgetColumns.tsx`, `budgetView.ts` (+ test).

**Fixes:** F2 (adopt the helper), F3, F5 (cash-flow controls), F8 (Budget by-year as a 100%-stacked share), F10 (Budget units), F11, F12, F17 (Budget hover), F19 (CashFlowTab header), F21 (budgetView colours), F23, F24, F28 (CashFlowTab memo).

**Verify:**
- Reconciliation test (F3).
- Spencer's-plan-equivalent fixture: no "Short" in 2060.
- Overflow probe clean.
- Screenshots of Budget and Cash Flow, in a short year and a drawdown year.

### U3 · Net Worth and Decisions (after U1)
**Owns:**
- `pages/NetWorthPage.tsx`, `pages/net-worth.css`;
- `drawer/AccountDrawer.tsx`, `drawer/AccountInsight.tsx`, `drawer/AccountForm.tsx`;
- `tabs/AccountsTab.tsx`, `tabs/DataTable.tsx`;
- `pages/HousePage.tsx`, `views/PriceCurve.tsx`, `priceCurve.ts`, `views/HouseForecastView.tsx`, `views/AffordabilityMap.tsx`, `views/HomeBudgetDonut.tsx`;
- `pages/RetirementPage.tsx`, `views/RetirementForecastView.tsx`, `retirementSources.ts`;
- `pages/AnnuityPage.tsx`, `views/AnnuityAccountSection.tsx`, `views/SeppBars.tsx`, `pages/decisions.css`;
- `ui/StackedBar.tsx` (the `ACCOUNT_CLASS_MIX` colours only).

**Fixes:** F5 (NW header), F7, F8 (Retirement can-spend/locked split), F10 (NW pill), F17 (Home years, F17b), F19 (DataTable/AccountsTab headers, stubYear props), F21 (real-estate colour), F22 (account sheet + Retirement footnote), F25, F27, F28 (AccountsTab/DataTable memo).

**Verify:**
- Home price curve on a runs-dry-in-year-45 fixture says "Short from …".
- Overflow probe clean.
- Home slice → drill-down sheet exercised (R19).
- Account sheet chart at 300px with draw-in.

### U4 · Shell, sheets, Timeline and people (independent of U1)
**Owns:**
- `src/index.css`, `index.html`, `src/App.tsx`;
- `ThemeToggle.tsx`, `Sidebar.tsx`, `PlanHealthAlert.tsx`;
- `ui/Sheet.tsx`, `ui/sheet.css`;
- `drawer/EventDrawer.tsx`;
- `pages/TimelinePage.tsx`, `pages/timeline.css`, `timeline.ts` (+ test);
- `PersonSheet.tsx`, `KidsSheet.tsx`, `ImpactStrip.tsx`.

**Fixes:** F2 (EventDrawer adopts the helper; its import lands once U1 merges, or it inlines `years` from `health.shortYears`), F4, F6 (alert UI; it reads `health.stranded`, so merge after U1), F9, F13, F14, F15, F20, F22 (Kids caption, Impact "—" cell), F26, F29.

**Verify:**
- The rail stays pinned while scrolling Cash Flow and Home.
- A cold load with OS dark and app light shows no flash.
- Drag-dismiss works with reduced motion on.
- Editing kids' stages: preview → Keep → one undo.
- Event save closes with no 260ms wait.

---

## D1 · Scenarios, Reports and dead code (can run in this batch)

**Owns** (none of these overlap U1–U4):
- `pages/ComparePage.tsx`, `pages/ReportsPage.tsx`;
- `PlannerContext.tsx`;
- `NetWorthChart.tsx`, `CompareDiff.tsx`, `LedgerToolbar.tsx`;
- `ui/StatStrip.tsx`, `ui/StatCard.tsx`, `ui/ProgressBar.tsx`, `ui/DeltaTag.tsx`, `ui/index.ts`;
- `dashboard.ts`, `ledger.ts`, `progress.ts`;
- `pages/ledger.css`, `pages/analysis.css`;
- `chartMath.ts`, `levers.ts`, `detail.ts`.

**Tasks:**
1. **`PlannerContext`: remove `compare`, `comparePlan`, `spread`, `fan`, `showFan`, `toggleFan`, `windowYears` and the pager.**
   - `spread` currently runs **two extra full simulations on every plan change**, and `compare` a third. Nobody reads either.
   - Keep `compareToPlanId` in settings for old saves.
   - This is the single biggest perf win available.
2. **Compare → "Scenarios"** (Q1 default: keep).
   - Retitle it to match the nav.
   - Move its chart onto `TimeSeriesChart` (two series, readout shows both).
   - Delete `NetWorthChart.tsx` and `CompareDiff.tsx`. `HouseForecastView` only mentions `CompareDiff` in a comment; U3 can drop that comment.
3. **Reports.**
   - Replace the stat strip with the readout pattern, or cut it.
   - Charts tab on the kit.
   - Tint the short-year rows.
   - Export stays.
4. **Delete the unused** `LedgerToolbar.tsx`, `ui/ProgressBar.tsx` and `ui/DeltaTag.tsx`, and `ui/StatStrip`/`StatCard` once Reports no longer uses them, after a grep for each.
   - **Do not delete `ui/StackedBar.tsx` yet.** `accountClassColor` lives there and is used app-wide. Move `accountClassColor` and `ACCOUNT_CLASS_MIX` to a new `ui/accountColors.ts` **only after U3 merges**, or skip it this batch.
5. **`progress.ts`.** Move the `ProgressPoint` type into `store/planStore.ts` (the store and `ImportDrawer` still need it), then delete the rest and its test.
   - `ImportDrawer.tsx` is not owned by any unit, so D1 owns that one-line import change.
6. **Exports.** Strip `dashboard.ts`/`ledger.ts` exports that `grep` shows are unused, and the `NetWorthChart`-only helpers in `chartMath.ts`/`levers.ts`/`detail.ts`.
7. **Dead CSS** in `ledger.css` and `analysis.css`.
   - **Do not touch `planner.css`** (U1 owns it). List its dead selectors (fan, compare, stat strip, ledger toolbar, overview) in the D1 report for the next batch.
8. **Done when:** `npm run lint && npm test` is green, `grep` finds no references to the deleted symbols, and the Scenarios and Reports pages are checked at 1440/390 in light and dark.

## After this batch

Re-run this review (V5-REVIEW-2) with the same probes before D2/D3. **The bar for 10/10:**
- mid-scrub opacity is 1.00;
- the overflow probe is empty;
- Budget, Cash Flow and NW agree to the dollar in every year;
- no Short is shown outside `health.shortYears`;
- the rail never moves;
- every chart on the page follows hover.
