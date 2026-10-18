# v5 Review 2: Opus re-review after U1–U5 and D1

Oct 18, 2026. Branch `redesign-v5` at `efc842e`. Reviewer: Opus. No source edits were made.

**How this was checked**

- `npm run lint && npm test` is green: 441 + 320 + 85 tests.
- **Port 3000 (read only).** I opened my own tab on the stored "House Forecast" plan and read the Net Worth and Annuity pages. Nothing was edited. This plan has one adult ("You"), runs dry in 2071, and has two accounts set to `never`: Tax-deferred and the variable annuity.
- **Port 3121 (scratch dev server).** I seeded the example plan, ran household setup, added Sarah, set Shared to $11,000/mo, added a retirement in 2058 and stretched the horizon to 66 years (2026–2091). The plan **runs dry 2031–2045, recovers 2046–2060, and runs dry again 2061–2091**: 46 short years and two bands.
- **Port 3122 (production build).** `vite build` output served by `vite preview`, used for the perf numbers.
- **Probes** live in `/private/tmp/claude-501/-Users-spencerreppond-Coding-Northstar/dc7247a5-5a83-4f4d-ba84-6f708831c1f1/scratchpad/review2/`:
  - `shoot.mjs`, with modes `shots | perf | overflow | rail | short | mut | hover`;
  - `interact.mjs`, with modes `nw | alert | home | budget | timeline | kids | event | reduced`;
  - `perf2.mjs` (frame times and long tasks, `THROTTLE=4`, `HEADED=1`);
  - `pin.mjs`, `kbd.mjs`, `ghost.mjs`, `slice.mjs`, `theme.mjs`;
  - `recon.ts` / `health-probe.ts` (engine-level reconciliation, bundled with esbuild).
  - The seed is `storage-long.json`. Run the `short` mode with `SHORTYEARS="$(cat shortyears.json | tr -d '[]' | sed 's/^/[/;s/$/]/')"`, or paste the list.
- **Screenshots:**
  - `ex-<page>-{d,m}-{light,dark}.png`: every page at 1440 and 390, in light and dark.
  - `i-*.png`: interaction frames.
  - `c-*.jpg`: crops.

---

## Verdict

**Overall: 8.9 / 10. Not yet 10.** Round 1's six-point bar is almost fully met:

| Bar item | Result |
|---|---|
| Mid-scrub opacity 1.00 | **Met.** Min opacity is 1.00 on Net Worth, Cash Flow, Budget, Retirement, Home and Annuity. |
| Overflow probe empty | **Met.** `{}` at 390 dark, 390 light and 1440 light, on all 9 pages. This run used a stricter probe that also catches left overflow and document scroll width. |
| Budget = Cash Flow = Net Worth to the dollar | **Met for what is shown.** After tax and spending agree to $0.00 in every year (`recon.ts`). **But** Budget's "From savings" figure is wrong in short years (N1). |
| No Short outside `health.shortYears` | **Met.** 710 scrub positions across every time chart on 6 pages, 0 violations. |
| Rail never moves | **Met.** Rail top is 0 at scroll positions 0, 600, 1500 and 4000, and at the bottom, on all 9 pages. |
| Every chart follows hover | **Mostly met.** Every time chart and every donut follows hover. The exceptions: the Annuity basis/gain donut follows the pin but not hover; Reports' 7 small multiples don't share hover; Scenarios' landing sparkline is static. |

Performance is **closed**. The production build holds a flat 60fps on every hero scrub **at 4× CPU throttle**: median 16.7ms, max 16.8ms, 0 long tasks. A headed browser without throttle gives max 18.8ms. The only long tasks appear in the dev build, where `jsxDEV` accounts for 45% of self time, and that build never ships. Tables see 0 DOM mutations during a scrub.

**What keeps this from 10:**

1. **Budget tells a false story on the danger path (blocker).** In a short year, Budget says the shortfall came "From savings". In 2065, savings paid $0 and the whole gap went unfunded, yet the share chart shows "From savings 79%". In 2033 the envelope list reads "From savings −$1,528" right beside "✗ Short $2,349/mo", which a reader can't reconcile. The missing $821 is the payroll contribution the engine still makes while short.
2. **The headline donut prints "Short$10.2K".** This regressed from F1: `AnimatedFigure` now renders a plain space inside an inline-block span, where it collapses. It appeared on Spencer's real plan too ("Short$5.6K").
3. **The in-app dark toggle gives a second, stale dark theme.** `:root[data-theme='dark']` still has the old pastel mix palette (it fails every validator check), blue glows, and no `--inverse`, `--on-inverse` or `--danger-btn`. OS dark and toggle dark look different.
4. **Home contradicts itself:**
   - The same home reads $1.01M on the price slider, $1.02M on the price-curve readout, and $1.15M on Timeline.
   - "Cash left after closing" is $7.8K in the readout and $7.6K in the check row.
   - The cash-cushion chart is unreadable: the rent line sets the y-axis to $7M, so the buy line sits at the baseline.
5. **The account palette fails the dataviz validator** in both modes (details under N4), and the liabilities reuse asset hues.
6. **The "never withdraw" story is half true on screen.** The alert says Tax-deferred is set to never withdraw. That account's own sheet then shows "Withdrawals −$52.4K" in 2091; those are RMDs, but the row doesn't say so. The `penalty` stranded reason is simply false (see the ruling below).
7. **The phone health alert is 6 lines.** It takes about 320px, or 38% of the first screen, on every page.

---

## Scores per requirement

| # | Requirement | R1 | **R2** | Evidence |
|---|---|---|---|---|
| R1 | Every chart scrubbable | 6 | **9** | Every time chart scrubs, pins, takes the keyboard (←/→/Home/Esc) and stays legible (opacity 1.00). Deductions: the "Short$10.2K" collapse (N2); the Annuity donut follows the pin only; Reports' small multiples aren't linked; the Scenarios landing sparkline is static. |
| R2 | Dismiss alerts | 9 | **10** | × gives a "Hidden · Undo" toast. The alert stays hidden on other pages, the rail pill stays, and "Show hidden alerts" restores it (`interact.mjs alert`). |
| R3 | Running dry obvious everywhere | 6 | **8** | Two separate hatched runs, a chip on the first, Short only in short years, the Unfunded row on top, the stranded clause in the alert, and a "RUNS DRY" tag on the phone timeline. Deductions: Budget's From savings mislabels unfunded money (N1); the 6-line phone alert (N6); Review lands at the top of the sheet, not on the setting (N11); the RMD/never contradiction (N5); the phone timeline never shows the recovery (N14). |
| R4 | Cut overview; 1Y–40Y ranges | 8 | **9** | Ranges and All work, and nothing overflows at 390. On a phone, the Net Worth header stacks title, value, ages, Spendable, ranges, and What if on its own row. That is about 400px before the chart starts (N22). |
| R5 | Shared, then per-person budget | 7 | **9** | Inline envelope edit, then ghost, accent dot, Impact, Keep (`c-env-draft.jpg`). Kids stages edit with preview, Keep and an Undo toast (F9). Deduction: the deficit-year envelope rows are wrong (N1). |
| R6 | Apple-design focus; nav | 6 | **8.5** | The rail is pinned, there's no theme flash, the sheet is opaque (0.96), and reduced motion is honoured. Deductions: two dark themes (N3); Scenarios' landing is still bordered cards with a paragraph; Reports nests boxes and repeats 7 readouts (N12, N13). |
| R7 | NW chart + split; pin line | 8 | **8.5** | Hover drives the snapshot, the donut and the readout. A pin carries to Cash Flow, Budget, Home, Retirement and Annuity (`pin.mjs`). Deductions: "Short$10.2K" in the donut center (N2); the account and category sheets show Short per year on a per-month page (N10). |
| R8 | Two-finger sideways scroll | 9 | **10** | A wheel with deltaX moves the table: scrollLeft goes from 0 to 640, the page's scrollX stays 0, and snap is `x`. The stub reads "Today / 2026". |
| R9 | Remove comparisons | 8 | **10** | `PlannerContext` runs one `runPlan`. NetWorthChart, CompareDiff and LedgerToolbar are deleted. |
| R10 | Before/after donut | 8 | **10** | The arcs morph. Zero rows are hidden. The Home slice opens "What owning costs": a donut of mortgage, property tax, insurance and upkeep. |
| R11 | Chart audit | 6 | **8** | The share-of-dollar chart and the can-spend/locked split are new, distinct forms. Deductions: the share chart has −100% ticks and a wrong lower half (N1, N9); the cash cushion is unreadable (N8); Reports' 7 small multiples carry 7 readouts. |
| R12 | Delete Progress | 10 | **10** | — |
| R13 | Events by person | 8 | **9** | The second child is green. Drag moves an event, with a "Moved Buy a home to 2033 · Undo" toast. Add person is a compact 400×208 sheet. Deductions: Timeline shows the home at $1.15M (nominal) while every page around it uses today's dollars (N7); the phone layout has no recovery marker (N14). |
| R14 | Cash Flow: groups, after-tax headline, underfunding | 7 | **9.5** | Unfunded is the first row. One-time lumps are capped, with an "↑ $223.6K" chip. Gross, tax and after tax all reconcile. Deductions: the label "Required minimum distribution — T…" is truncated; the table stub says "Per year" on a per-month table (N20). |
| R15 | Less text, bigger charts | 7 | **8.5** | Account-type copy has moved behind an (i) and the footnotes are gone. Leftovers: the Scenarios paragraph, the diff list leaking "Amazon — Person p1 → —", the Home "COSTS" footer sentence, and Reports' Short pill repeated 7× (it even appears on Contribution Rate). |
| R16 | Overview + Accounts merged | 9 | **10** | — |
| R17 | Account popout | 7 | **9** | The FLIP morph works: the label is in flight at 40ms (`c-morph-grid.jpg`). The chart is 300px and draws in. An edit shows a ghost line and a "Draft" readout; Keep gives an Undo toast. Deductions: the sheet shows "Short $122.9K/yr" over a page that says "/mo"; there's an unexplained "Other +$163" row; "Withdrawals" means RMDs (N5, N10, N16). |
| R18 | Reference look | 7 | **9** | Glow, glowing active dots, dashed cursor, and the value above the chart, which stays readable while scrubbing. Deduction: N2. |
| R19 | Pie popouts | 7 | **9.5** | Driven end to end: on Net Worth, the Shared slice opens a category sheet with its own chart, and the Unfunded slice goes to Cash Flow. On Home, the Home slice opens a parts donut. On Budget, the Kids slice opens the Kids sheet, and the Shared or a person's slice expands that section. |
| R20 | Series switcher | 9 | **10** | Choosing an account draws it in, and the label follows. |

**Mean: 9.23. Weighted overall: 8.9.** R1, R3 and R11 carry double weight, as in round 1.

---

## Round-1 fixes

| Fix | Status | Evidence / gap |
|---|---|---|
| F1 figure legible while scrubbing | **Partial** | Mid-scrub opacity is 1.00 everywhere, and the 140ms fade only plays on isolated changes. **Regression:** U1 replaced the NBSP (`' '`) in `AnimatedFigure.tsx` with `' '`. In `display:inline-block` spans a lone space collapses, so the donut center reads "Short$10.2K" (N2). |
| F2 multi-run danger bands | **Verified** | Two rects (2031–45 and 2061–91), the chip on the first, and `healthDangerBand` used by every page. `grep "from: health.firstShortYear"` finds only a comment. |
| F3 one after-tax definition | **Partial** | After tax and withdrawal tax agree to the dollar every year, the reconciliation test exists, and Short appears only in short years. **Gap:** in short years, "From savings" includes the unfunded dollars, and the contributions the engine still makes are not in the envelope identity (N1). |
| F4 rail pinned | **Verified** | `shoot.mjs rail`: top 0 at every scroll position on 9 pages. |
| F5 overflow | **Verified** | `shoot.mjs overflow`: `{}` in three modes. |
| F6 stranded explanation | **Partial** | The alert names "$143.1K in Tax-deferred investments is set to never withdraw", and Review opens that sheet. **Gaps:** the sheet opens at the top, with the withdrawal-timing control five fields down (N11); the `penalty` reason is false (ruling below); the sheet's "Withdrawals" row contradicts "never" (N5). |
| F7 price curve horizon | **Verified** | "Plan ✗ Short from 2031" and "Pays every bill through 2091 — Short from 2031". |
| F8 Budget share chart; Retirement can-spend/locked | **Partial** | Both shipped and both are distinct forms. **Gaps:** the share chart has −100% ticks and a lower half that calls unfunded money "From savings" (N1, N9); Retirement's "Locked" includes penalty-age money that the engine does draw (N5). |
| F9 kid stages editable | **Verified** | Private school produces a ghost, then Keep gives "Updated First child's stages · Undo". |
| F10 Short units | **Partial** | Each page agrees with itself (Net Worth /mo, Cash Flow and Budget follow their toggle, Retirement /yr). **Gaps:** the account and category sheets use /yr over Net Worth's /mo; the Retirement readout value carries no unit; Reports repeats the pill 7× (N10, N13). |
| F11 capped lumps | **Verified** | The 2031 column is capped, with an "↑ $223.6K" chip. Lines plot recurring spending. |
| F12 Unfunded on top | **Verified** | — |
| F13 instant event save | **Verified** | 81ms from Save to the label updating. |
| F14 reduced-motion drag | **Verified** | The panel follows the pointer (68 → 121px), and releasing past the threshold closes it. |
| F15 opaque sheet body | **Verified (Chromium)** | 0.96 white. **But** WebKit doesn't support `prefers-reduced-transparency`, so in Tauri the solid fallback never fires (N15). |
| F16 zero legend rows | **Verified** | — |
| F17 consistent years; hover previews | **Verified** | Hovering Budget's share chart changes "Your month in 2033". Home's charts all read 2031. The sheet chart is 300px. |
| F18 event markers | **Verified** | — |
| F19 ticks and stub labels | **Partial** | Ticks read Today / 2040 / 2060 / 2080. The Net Worth and Cash Flow stubs are fixed. **Reports** still shows "2026 / from Oct 18". |
| F20 theme flash | **Verified (code)** | `index.html` stamps `data-theme` before first paint. That stamp is exactly what exposes the stale dark block (N3). |
| F21 danger-colliding colours | **Partial** | The second child is green, real estate is no longer red, and `ADULT_COLORS` has 4 entries. **But** the palette fails the validator, and mortgage reuses taxable's green and loan reuses tax-deferred's gold (N4). |
| F22 text cuts | **Verified** | — |
| F23 envelope layout | **Verified** | A 505px list, plus an edit affordance with a dotted underline and an accent dot. |
| F24 phone hero height | **Verified** | — |
| F25 row → sheet morph | **Verified** | A hand-rolled FLIP in `drawer/rowMorph.ts` and `AccountSheetHead.tsx`; the label is visibly in flight at 40ms. |
| F26 compact Add person | **Verified** | 400×208. |
| F27 annuity donut follows the year | **Verified (pin only)** | The center reads "In {year}" when a year is pinned. It doesn't follow hover (N19). |
| F28 memoised tables | **Verified** | 0 mutations during a 60-step scrub on Net Worth, Cash Flow and Annuity. 60fps in the production build at 4× throttle. |
| F29 dev routes out of prod | **Verified** | The production bundle has no `DevCharts` or `dev/charts` string. |
| D1 context, Scenarios, Reports | **Verified** | One `runPlan` in `PlannerContext`, and both pages are on the kit. Remaining issues are N12 and N13. |

---

## Rulings on the open items

- **The "never withdraw" contradiction: the engine is right, and the alert is right for `never`.** `priority.ts isWithdrawable()` returns `false` for `'never'`, so the shortfall waterfall (`planWithdrawals`) never touches that account. I confirmed this on the scratch plan: there are zero `From Tax-deferred` withdrawal lines in any year.
  - The only money that leaves a `never` 401(k) is the **RMD** (`run.ts` §7.5). It is legally required, carries no penalty, starts at age 75 for someone born in 1996, and is booked as income. Nothing is drawn "with a penalty".
  - **The alert is wrong for `penalty`.** I set the 401(k) to `'always'` and added a withdrawal rule. The engine then drains it before age 59½ and pays the penalty in its tax (2031: −$85.6K drawn, $29.1K tax). Yet `health.stranded` still lists $14K of it as "still under the early-withdrawal age", as if it were being held back. That residual is the payroll contribution, refilled each year and drawn again.
  - **Fix in `health.ts`:** never emit `penalty` as a stranded reason (U7).
  - **Copy fixes:** label RMDs as RMDs wherever they appear (U8, U9), and in the alert say "never drawn to cover a shortfall".
  - No engine change. The engine policy flag from round 1 still stands: it keeps making payroll 401(k) contributions in unfunded years.
- **Phone health alert.** Make it compact below 640px (U8): one line ("✗ Runs dry 2031 · $4.03M short"), a "Why?" disclosure for the stranded clause, and the See and × controls inline.
- **R19 drill-downs.** Driven end to end; they pass.
- **Dead `planner.css` classes.** 60 class selectors are unreferenced anywhere in `src/` or `index.html` (the brief's list plus `ns-x-tick*`, `ns-y-tick`, `ns-today-*`, `ns-split-bar*`, `ns-ref*`, `ns-mini-grid*`, `ns-view-head/title`, `ns-sidebar-item-blurb`, `ns-sidebar-section-label` and others). U7 deletes them.
- **Stale `DataTable.tsx` comment.** U10 fixes it.
- **Perf.** Closed; see the Verdict.
- **Budget "From savings" in short years.** Wrong; this is blocker N1 (U6).
- **Palette.** It fails the validator (N4). The validated replacement values are in U7.
- **WebKit / Tauri.** Spencer runs Darwin 27, so WKWebView is current WebKit, and the following are all safe: `:has` (26 uses), `overflow-x: clip`, `color-mix` (57), `dvh`, prefixed `mask-image`, scroll-snap, `text-wrap`, and the CSS `translate` property read in `AccountSheetHead`. Real risks:
  1. Four scrims in `planner.css` (`.ns-rail-scrim`, `.ns-scrim`, `.ns-palette-scrim`, `.ns-shortcut-scrim`) use unprefixed `backdrop-filter` only. That works on Safari 18 and later; add `-webkit-backdrop-filter` anyway (U7).
  2. WebKit doesn't support `prefers-reduced-transparency`, so the Sheet's JS check and the CSS fallbacks never fire in Tauri. Note it; a native bridge isn't worth it now.
  3. `scrollbar-width` needs Safari 18.2 or later. Before that it's only cosmetic (scrollbars show).

---

## New findings, ranked

**Blocker**

- **N1 · Budget calls unfunded money "From savings".** `budgetView.ts` sets `saved = afterTax − withdrawalTax − spending`, and `budgetShares` sets `fromSavings = pct(max(0, −saved))`. In a short year, savings are empty and the gap is unfunded. Evidence:
  - From `recon.ts`, in nominal dollars:

    | Year | Budget's "from savings" | Net withdrawals actually received | Unfunded |
    |---|---|---|---|
    | 2065 | $344,773/yr | $0 | $344,772 |
    | 2035 | $17,525 | $0 | $29,525 |

    The 2035 unfunded figure is larger because it includes $12,000 of contributions the engine still paid.
  - In the UI, 2033 shows "From savings −$1,528" next to "✗ Short $2,349/mo".
  - The share chart shows an orange "From savings" area at 75–100% across 2061–2091.

**Major**

- **N2 · `AnimatedFigure` collapses spaces.** "Short$10.2K" appears in the Net Worth donut center, on both the scratch plan and port 3000.
- **N3 · The toggle's dark theme is a second, stale palette.** `planner.css` `:root[data-theme='dark']`, lines 408–484, differs from the `@media (prefers-color-scheme: dark)` block, lines 321–406:
  - its `--mix-1..6` are the old pastels (`#7fa1c4…`): lightness, chroma, CVD and normal-vision checks all FAIL;
  - its `--glow-1/2` are blue-tinted;
  - it is missing `--inverse`, `--on-inverse` and `--danger-btn`, which therefore fall back to the light-mode values (`--inverse: #0b1d2e` on a near-black page);
  - evidence: `i-theme-explicit-dark.png` against `ex-net-worth-d-dark.png`.
- **N4 · The account-class palette fails the validator.**
  - Light: CVD teal↔violet ΔE 5.4 (FAIL).
  - OS dark: the variable-annuity `color-mix` blend against cash gives ΔE 7.3 for normal vision (hard FAIL) and 3.8 under CVD.
  - Liabilities reuse asset hues: mortgage = taxable green, loan = tax-deferred gold, other asset = cash blue.
  - Budget envelopes (light): Saved `--in #1baf7a` against Kids `#00a5aa` is ΔE 8.5 for normal vision (FAIL).
- **N5 · RMDs read as withdrawals from a "never" account.** The account sheet's "In 2091" waterfall shows "Withdrawals −$52.4K" under an alert that says "set to never withdraw". Cash Flow labels the same money "Required minimum distribution — T…" (truncated). Retirement's "Locked" band also includes penalty-age balances that the engine does draw.
- **N6 · The phone health alert is 6 lines**, about 320px or 38% of the first screen, repeated on every page (`c-nw-m-dark-top.jpg`).
- **N7 · Home numbers disagree:**
  - The price lever shows `money(nicePrice(shownPrice))` = $1.01M; the price-curve readout shows `money(shownPrice)` = $1.02M.
  - `HousePoorCheck` deflates `liquidAfterClosing` at `firstYear` (t.year+1) and shows $7.6K. The curve and cushion use `t.year` and show $7.8K.
  - Timeline's "Buy a home $1.15M" is the nominal config price, while every page around it uses today's dollars.
- **N8 · The cash-cushion chart is unreadable.** "Keep renting" grows to $7.17M and sets the y-domain, so the buy line and the 6-month reserve sit at the baseline for 60 years (`ex-house-d-light.png`).

**Minor**

- **N9 · Share chart axis and readout.**
  - The y-axis labels read −100% and −50%.
  - The readout's big "$13.9K after tax /mo" repeats the donut center directly above it, so the chart's own answer (its shares) is demoted to small text.
- **N10 · Short units in sheets.** `AccountDrawer` and `NetWorthPage`'s `CategorySheet` show "Short $122.9K/yr" over Net Worth's "/mo". Retirement's readout value "$52.4K" has no unit.
- **N11 · Review lands on the wrong spot.** The alert's Review opens the account sheet at the top. The control that fixes the problem ("Withdrawals: Any time / From a year / Never") is below the fold, with no highlight.
- **N12 · Scenarios.**
  - The landing is two bordered `SectionCard`s with an explanatory paragraph.
  - The diff list leaks internals: "Amazon — Person p1 → —", "Projection years 66 → 21".
  - "Net worth +$3.99M at 2091" compares against a plan that ends in 2086.
- **N13 · Reports.**
  - The Charts view is 7 bordered cards inside a bordered card. Each repeats "2091 · You 95 · Sarah 100 ✗ Short $122.9K/yr", including the Contribution Rate card.
  - The cards don't share hover.
  - The table stub still reads "2026 from Oct 18".
- **N14 · Phone Timeline shows no recovery.** It shows "RUNS DRY" at 2031 and 2061 but never where the plan recovers (2046).
- **N15 · CSS hygiene:**
  - 60 dead `planner.css` classes;
  - 4 scrims without `-webkit-backdrop-filter`;
  - the stale `.ns-bar-income` comment in `DataTable.tsx:10`.

**Polish**

- **N16** The account sheet's "Other +$163" is a deflation residual shown as a row.
- **N17** The SEPP bars' x-axis runs 7 years past the last bar (2049–2055 empty).
- **N18** On an unpinned chart, the first ← pins the default year (2091) instead of moving to 2090.
- **N19** The Annuity basis/gain donut follows the pin but not hover.
- **N20** The Cash Flow table stub reads "Per year" under a "per month" heading.
- **N21** The price-curve x-ticks crowd at the end ("$1.1M … $1.3M $1.4M").
- **N22** On a phone, Net Worth's What if and "…" take their own row under the ranges.

---

## Fix units (parallel; disjoint files)

**Every unit must:**
- read §1 of `docs/REDESIGN-V5.md` and `~/.claude/skills/apple-design/SKILL.md`;
- run `npm run lint && npm test` until green;
- start its own server (`npx vite --port 31NN --host 127.0.0.1`) and never touch port 3000;
- copy `review2/shoot.mjs`, `review2/interact.mjs` and `review2/storage-long.json` into its own scratch folder, set `BASE` to its port, and re-run `overflow`, `short` and `perf`, plus the interaction modes listed below;
- look at its pages at 1440 and 390, in light, **OS dark and toggle dark** (`localStorage['northstar:theme']='dark'`; see `theme.mjs`);
- commit on its own branch with a message naming the unit.

Do not touch a file another unit owns. If something outside your list must change, stop and report it.

### U6 · Budget danger path (blocker N1, plus N9)

**Owns:**
- `src/planner/budgetView.ts`, `src/planner/budgetView.test.ts`;
- `src/planner/pages/BudgetPage.tsx`, `src/planner/views/BudgetShare.tsx`;
- `src/planner/pages/budget.css`, `src/planner/pages/household.css`;
- `src/planner/spendingGroups.ts` (the `GROUPS` colours only).

**Fixes:**

1. **`budgetView()` gains four monthly fields.** `contributions` already exists as rows; sum them.

   ```ts
   intoSavings: number;   // sum(contributions[].monthly)
   gap: number;           // max(0, spending + intoSavings + withdrawalTax − afterTax)
   unfundedMonthly: number; // = unfunded (already per month)
   fromSavings: number;   // max(0, gap − unfundedMonthly)
   ```

   - Keep `saved` exactly as it is for surplus years, so the Cash Flow reconciliation test still passes.
   - Add `shortfall: boolean` = `unfundedMonthly ≥ 0.5`.
2. **Envelope rows in a year where `gap > 0`.** Replace the single "From savings −$X" row with three rows:
   - **"Into savings · $X"** (`intoSavings`), shown only when ≥ $0.5, with the caption "still paid in". It is an outflow row, not editable.
   - **"From savings · $X"** (`fromSavings`), neutral orange, no ✗.
   - **"✗ Unfunded · $X"** (`unfundedMonthly`), in the danger style with the existing Short pill. It replaces the current pill-on-Saved.
   - In surplus years, keep "Saved $X" as today.
3. **Budget donut ("Your month in YEAR").** In a gap year, the slices are the envelopes plus Into savings, From savings, and a hatched `tone:'danger'` "Unfunded" slice. The center reads `Short $X /mo` when `unfundedMonthly > 0`.
4. **`budgetShares()`.**
   - `base = max(afterTax, spending + intoSavings + withdrawalTax)`.
   - The lower half becomes two segments: `fromSavings` (`FROM_SAVINGS_COLOR`) and `unfunded` (drawn with the kit's danger hatch fill and `--out`, labelled "✗ Unfunded").
   - Upper-half shares are unchanged.
5. **`BudgetShare.tsx`:**
   - Y-tick labels show absolute values: `100% · 50% · 0 · 50% · 100%`. Add a muted 11px "Paid from savings ↓" label inside the plot, at the lower-left edge.
   - The readout's main value becomes the chart's answer for the active year:
     - "Saved 21%" when `saved ≥ 0`;
     - "From savings 64%" when the gap is fully funded;
     - "✗ Unfunded 64%" when any of it is unfunded;
     - the label is "Where each dollar goes".
   - After-tax moves to the secondary row ("After tax $13.9K").
6. **Colours, validated in the review** (they depend on U7's re-stepped tokens):
   - `ADULT_COLORS = ['var(--mix-5)', 'var(--mix-4)', tint('var(--mix-5)'), tint('var(--mix-4)')]`
   - `CHILD_COLORS = ['var(--mix-3)', 'var(--mix-2)', tint('var(--mix-3)'), tint('var(--mix-2)')]`
   - In `spendingGroups.ts` `GROUPS`: home `--mix-2`, kids `KIDS_COLOR`, shared `SHARED_FIXED_COLOR`, personal `--mix-5`, oneTime `--mix-4`.

**Tests (in `budgetView.test.ts`):**
- For every year of `runsDryPlan()`, `kitchenSinkPlan()` and `drawdownPlan()` with no one-time lumps:

  `afterTax + fromSavings + unfundedMonthly ≈ spending + intoSavings + withdrawalTax` (within $0.01/mo).
- For every short year:

  `fromSavings × months ≤ (Σ snapshot.withdrawals.amount − withdrawalTax × months) + 1`

  That is, Budget never claims more came from savings than was actually withdrawn.
- The existing reconciliation tests stay green.

**Done when:**
- On the 3121 seed, pinning 2033 shows Into savings ≈ $821, From savings ≈ $0, and ✗ Unfunded ≈ $2,349. That matches the Short pill to the dollar.
- 2065 shows From savings ≈ $0.
- The share chart's lower half is hatched Unfunded across 2061–2091.
- `shoot.mjs short` reports 0 violations, and the overflow probe prints `{}`.

**Verify:** `interact.mjs budget`; screenshots at 2027 (surplus), 2033 (short) and 2055 (drawdown, not short: From savings, no ✗).

### U7 · Kit, figures, tokens, health (N2, N3, N4 tokens, N5 health, N15 CSS, N18)

**Owns:**
- `src/planner/AnimatedFigure.tsx`, `src/planner/planner.css`, `src/planner/ui/StackedBar.tsx` (`ACCOUNT_CLASS_MIX` only);
- `src/planner/health.ts`, `src/planner/health.test.ts`;
- `src/planner/charts/useScrub.ts`;
- a new `src/planner/tokens.test.ts`.

**Fixes:**

1. **N2.** In `AnimatedFigure.tsx`, render a space as `' '`, written as the escape so it can't be lost again: `{char === ' ' ? ' ' : char}`. Add a comment saying why.
2. **N3 · one dark theme.**
   - Make `:root[data-theme='dark']` declare **exactly** the same custom properties and values as the `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` block. Copy the media block's values; add the missing `--inverse`, `--on-inverse`, `--danger-btn` and the neutral `--glow-1/2`.
   - Add `tokens.test.ts`. It reads `planner.css` as text, extracts the two blocks' `--name: value` pairs, and asserts they are equal maps. This is what stops future drift.
3. **N4 · re-step `--mix-*`.** Validated with `dataviz/scripts/validate_palette.js`; every set passes, apart from contrast WARNs that the labels relieve.

   | Token | Light | Dark (both dark scopes) |
   |---|---|---|
   | `--mix-1` | `#005ba1` (unchanged) | `#1469b0` (unchanged) |
   | `--mix-2` | `#008300` | `#008300` |
   | `--mix-3` | `#eda100` | `#c98500` |
   | `--mix-4` | `#6250d6` | `#9085e9` |
   | `--mix-5` | `#e87ba4` (no longer brick red) | `#d55181` |
   | `--mix-6` | `#0097a7` | `#0aa3b0` |

   `ACCOUNT_CLASS_MIX`:

   | Classes | Colour |
   |---|---|
   | cash | `--mix-6` |
   | taxableInvestment | `--mix-2` |
   | taxDeferredInvestment | `--mix-3` |
   | variableAnnuity | `--mix-4` (delete the `color-mix` blend) |
   | taxFreeInvestment | `--mix-5` |
   | realEstate, otherAsset | `var(--muted)` (illiquid, so neutral) |
   | creditCard, loan, mortgage | `var(--muted-light)` (both tokens exist in all three theme blocks; there is no `--ink-3` token) |

   Update the F21 comment. Re-run the validator for these sets and paste the output in the commit message:
   - accounts in class order: `#0097a7,#008300,#eda100,#6250d6,#e87ba4` light on `#ffffff`, and the dark equivalents on `#181b22`;
   - budget: `--mix-1, --mix-5, --mix-4, --mix-3, --in, --out`;
   - groups: `--mix-2, --mix-3, --mix-1, --mix-5, --mix-4`.
4. **N5 (health).** In `strandedAt`, skip any account whose `blockReason` is `'penalty'`, because the engine does draw it. Keep `'penalty'` in the type, in the `isSpendable` gate (spendable stays penalty-free, as §4.2 specifies) and in the docs. Update the JSDoc on `StrandedReason` to say "penalty: excluded from `stranded`; the engine draws these at a penalty".
   - Test: a fixture with a ruled, `'always'` 401(k) whose owner is under 59½ in the short year produces `stranded` without it.
   - Keep the existing tests for the other reasons.
5. **N15.**
   - Delete the 60 unreferenced class rule blocks. Re-run the scan in this review (a Python snippet: collect `.ns-*` selectors from `planner.css` and keep those whose name appears nowhere in `src/**/*.ts(x)` or `index.html`, nor as a `${…}`-built prefix). It must print 0.
   - Add `-webkit-backdrop-filter` beside the four unprefixed scrims (`.ns-rail-scrim`, `.ns-scrim`, `.ns-palette-scrim`, `.ns-shortcut-scrim`).
6. **N18.** In `useScrub`, the first ←/→ on an unpinned chart pins `activeYear ∓ 1`, not `activeYear`. Home and End unchanged.

**Done when:**
- The Net Worth donut center reads "Short $10.2K" with a visible space, at 1440 and 390.
- `theme.mjs`, rewritten to screenshot Net Worth, Budget and Home under toggle dark, matches OS dark pixel for pixel in hue.
- `tokens.test.ts` passes.
- The dataviz validator passes for all three sets in both modes.
- `npm test` is green.

**Verify:** `shoot.mjs perf` (opacity still 1.00), `kbd.mjs`, and screenshots of Net Worth, Budget, Timeline and Home in light, OS dark and toggle dark.

### U8 · Net Worth sheets and the health alert (N5 sheet, N6, N10 sheets, N11, N16, N22)

**Owns:**
- `src/planner/PlanHealthAlert.tsx`, `src/planner/PlanHealthAlert.test.ts`, `src/planner/plan-health-alert.css`;
- `src/planner/drawer/AccountDrawer.tsx`, `src/planner/drawer/AccountInsight.tsx`, `src/planner/drawer/AccountForm.tsx`;
- a new `src/planner/drawer/sheetFocus.ts`;
- `src/planner/pages/netWorthData.ts` (+ its test), `src/planner/pages/NetWorthPage.tsx`, `src/planner/pages/net-worth.css`.

**Fixes:**

1. **N6 · compact phone alert.**
   - Below 640px, the alert renders one line: `✗ Runs dry {year} · {money(unfundedTotal)} short`, then `See {year} →` and ×.
   - The stranded clause sits behind a "Why?" text button that expands it inline with a 200ms height transition. Under reduced motion it is instant.
   - Desktop is unchanged.
   - Done when the 390px alert is ≤ 64px tall when collapsed.
2. **N11 · Review lands on the setting.**
   - `sheetFocus.ts` exports `requestAccountFocus(field: 'withdrawalTiming')` and `takeAccountFocus()`. It is module-level, like `rowMorph.ts`, and requests expire after 600ms.
   - Review calls `requestAccountFocus('withdrawalTiming')` before `setAccountDraft`.
   - `AccountForm` claims the request on mount, scrolls that field into view (`block: 'center'`) and focuses its first radio. It flashes the field once with an accent ring (400ms; under reduced motion, a static ring for 1s).
3. **N5 · sheet copy.**
   - In `netWorthData.ts`'s flow steps, split withdrawals into three rows:
     - **"Required distributions"**: the sum of `snapshot.income` lines with `accountId` in the class and a label starting `Required minimum distribution`;
     - **"SEPP payments"**: `category === 'sepp'`, same account match;
     - **"Withdrawals"**: the remainder.
   - Show each row only when |value| ≥ $1.
   - In `PlanHealthAlert`, set `REASON_PHRASE.never = 'never drawn to cover a shortfall'`.
4. **N16.** Fold the "Other" residual into Growth when |other| < max($1,000, 0.5% of opening), and label the Growth row "Growth (net of fees)". Otherwise show it as "Inflation adjustment".
5. **N10.**
   - `AccountDrawer` builds its band like `NetWorthPage` does: `healthDangerBand(health, result)` re-unitised per month with `monthsIn(stored, year)`, and passes `shortUnit: '/mo'`.
   - `CategorySheet` does the same.
   - The pill then reads "Short $10.2K/mo" in the sheet, matching the page.
6. **N22.** Below 480px, move What if and "…" onto the "Net worth ▾" title row, right-aligned. The range picker keeps its own row.

**Done when:**
- `interact.mjs alert` shows that Review opens the Tax-deferred sheet with "Withdrawals: Never" focused and in view.
- The 2091 waterfall reads "Required distributions −$52.4K", with no "Withdrawals" row and no "Other" row.
- The phone alert measures ≤ 64px tall.
- The overflow probe prints `{}`.

**Verify:** `interact.mjs nw`, `interact.mjs alert`, `ghost.mjs`, `slice.mjs`; phone screenshots of every page with the alert both collapsed and expanded.

### U9 · Home, Cash Flow, Retirement, Annuity, Timeline (N5 labels, N7, N8, N14, N17, N19, N20, N21)

**Owns:**
- `src/planner/pages/HousePage.tsx`, `src/planner/views/PriceCurve.tsx`, `src/planner/priceCurve.ts`;
- `src/planner/cashFlowView.ts` (+ test), `src/planner/tabs/CashFlowTab.tsx`;
- `src/planner/views/RetirementForecastView.tsx`, `src/planner/retirementSources.ts` (+ test);
- `src/planner/views/SeppBars.tsx`, `src/planner/views/AnnuityForecastView.tsx`;
- `src/planner/timeline.ts` (+ test), `src/planner/pages/TimelinePage.tsx`, `src/planner/pages/timeline.css`.

**Fixes:**

1. **N7 · one price everywhere.**
   - The price lever's `display` uses `money(shownPrice)`; drop `nicePrice` from the label (snapping the value is fine).
   - `HousePoorCheck` gets `show={(v) => show(v, t.year)}` for the cash row. Housing costs keep `firstYear`.
   - `timeline.ts`'s figure for `buyAHome` (and any money figure) is shown in the plan's display dollars, deflated to the event's year exactly as Home does (`toDisplay(plan, nominal, event.startYear)`). Pass what it needs from `TimelinePage`.
   - Add a test: Timeline's figure equals Home's `shownPrice` for the same plan.
2. **N8 · cash cushion.**
   - The cushion chart's default window is `[t.year − 2, t.year + 10]`, clamped to the plan. The `RangePicker` still offers All.
   - The y-domain is computed from the buy series and the reserve line only.
   - The rent series is clipped at the top, with an "↑ Keep renting $X" chip at the right edge, using the kit's `ChartNote`.
3. **N5 labels.**
   - In `cashFlowView.ts`, display income-source labels matching `/^Required minimum distribution — (.+)$/` as `Required distributions · $1`.
   - In `retirementSources.ts`, split the "Locked" band into **Locked** (never, noRule, SEPP) and **"With 10% penalty"** (the penalty gate), drawn as `can-spend` at 45% opacity, with the legend in that order.
4. **N14 · phone recovery.** The phone timeline adds a "BACK ON TRACK" tag, in green `--in`, on the first non-short year after each short run (e.g. 2046), styled like `tl-dry-tag`. Desktop gets the same label at the end of each hatched run.
5. **N17.** In `SeppBars`, the x-domain ends at the last bar's year + 0.5.
6. **N19.** The Annuity basis/gain donut follows `hoverYear ?? focusYear`, from the page's two kit charts. Lift their `onHoverYear` into `AnnuityForecastView`'s parent. The center reads `In {year}`.
7. **N20.** The Cash Flow table stub header reads empty, not "Per year".
8. **N21.** The price curve's x-ticks use `niceAxisTicks` on the price domain. Don't force the last tick.
9. **Retirement readout unit.** The hero label becomes "What pays for each year · per year".

**Done when:**
- Home shows one price ($1.02M) on the slider, the curve and Timeline, and one cash-left figure ($7.8K).
- The cushion chart's buy line fills at least 40% of the plot height at default.
- Cash Flow's income row reads "Required distributions · Tax-deferred investments" without truncation at 1440.
- The phone timeline shows "BACK ON TRACK · 2046".
- `npm test` is green.

**Verify:** `interact.mjs home`, `interact.mjs timeline`, the `shoot.mjs hover` mode (the Annuity donut must report "follows"), and screenshots.

### U10 · Scenarios, Reports, hygiene (N12, N13, N15 comment, F19 leftover)

**Owns:**
- `src/planner/pages/ComparePage.tsx`, `src/planner/pages/ReportsPage.tsx`;
- `src/planner/diff.ts` (+ `diff.test.ts`), `src/planner/reports.ts`;
- `src/planner/pages/analysis.css`;
- `src/planner/tabs/DataTable.tsx` (comment only).

**Fixes:**

1. **N12 · Scenarios landing.**
   - Replace the two `SectionCard`s with plain sections: a title, plus one row per plan as a list. Each row has the name, a 160×40 sparkline and "Net worth in {active end year}".
   - Put "Start a What-If" as a primary button in the page header. Delete the paragraph.
   - In `diff.ts`, render people by name (look up `participantId` in `plan.participants`) and never print an id. Rename "Projection years" to "Plan length" ("66 → 21 years").
   - In the outcomes, compare net worth at the last year **both** plans have, labelled with that year.
2. **N13 · Reports Charts.**
   - One shared readout row above the grid: the year and ages, plus a **single** Short pill when that year is short.
   - Each card shows only its label and value.
   - Cards share one `hoverYear` state, so hovering any card moves every card's cursor.
   - Drop the inner card borders and lay the grid on the page background.
   - No Short pill on the Contribution Rate card.
   - The table stub's first column reads just the year; move "from Oct 18" into a `title` tooltip.
3. **N15.** Fix the `DataTable.tsx:10` comment. It names `.ns-bar-income`, which no longer exists; name the current magnitude-bar classes.

**Done when:**
- Scenarios has no bordered card, no paragraph and no participant ids.
- In Reports, hovering one chart moves all 7 cursors, and the Short pill appears exactly once.
- The overflow probe prints `{}`.

**Verify:** `more.mjs` (Scenarios selected, Reports charts) and screenshots at 1440 and 390, in light and dark.

---

## After this batch

Re-run this review (V5-REVIEW-3) with `review2/` probes and add:
- `recon.ts` extended with the U6 identity;
- `theme.mjs` comparing toggle dark against OS dark;
- the dataviz validator on all three sets.

**The 10/10 bar:**
- everything in round 1's bar still holds;
- in every short year, Budget's From savings ≤ the net withdrawals actually received, and Unfunded matches the Short pill to the dollar;
- no figure in the app collapses a space;
- toggle dark ≡ OS dark;
- every categorical set passes the validator;
- Home shows one price and one cash-left figure, matching Timeline;
- the phone alert is ≤ 64px when collapsed;
- Review lands on the withdrawal setting.
