# v5 Review 3: final check after U6–U10

Oct 18, 2026. Branch `redesign-v5` at `967bb1a`. Reviewer: Opus. No source edits and no state-changing git commands.

**How this was checked**

- **Scratch dev server on port 3161**, run from this checkout and seeded with `review2/storage-long.json`. The plan runs dry 2031–45, recovers 2046–60, and runs dry again 2061–91: 46 short years.
- **Spencer's own plan on port 3000**, opened read only in a private tab. I hovered and read, and clicked nothing that writes. The plan is "House Forecast": one adult, runs dry in 2071, 21 short years, $1.37M unfunded. Tax-deferred and the variable annuity are both set to `never`. The annuity has a 30-year SEPP and a $66.7K basis.
- **Probes** are in `/private/tmp/claude-501/-Users-spencerreppond-Coding-Northstar/dc7247a5-5a83-4f4d-ba84-6f708831c1f1/scratchpad/review3/`:
  - `shoot.mjs` and `interact.mjs` are copied from review 2. In my copy of `interact.mjs`, the stale selectors are fixed: `.ns-sheet-headline` for the sheet title, `.ns-donut-row` for slices, and `.tl-scroller` for the timeline.
  - `probe3.mjs` covers the phone alert, Budget by pinned year, the sheet waterfall, Timeline tags, Reports shared hover, Home figures and Scenarios.
  - `theme3.mjs` gives a pixel diff of OS dark against toggle dark on all 9 pages at 1440 and 390.
  - `recon3.ts` is the engine reconciliation with the U6 identity added.
  - `scn.ts` checks the Scenarios dollar basis.
- **Screenshots:**
  - `ex-*`: every page at 1440 and 390, in light and dark;
  - `th-*-{os,tog}`: dark-mode parity;
  - `p3-*`, `i-*`: interactions;
  - `c-*`, `cs-*`: crops and contact sheets.

---

## Verdict

**Overall: 9.6 / 10. Fix first.** Every round-2 blocker is closed. Budget's danger path is now true to the dollar, there is one dark theme, the palette passes the validator, the phone alert is compact, and Review lands on the setting.

The score is held below 10 by **three money figures that are still wrong, two of them on Spencer's own plan**:

1. **Scenarios inflates the other plan's lead by about 6×.** On the landing row, Spencer's plan reads "Retirement Forecast $25.37M **+$23.17M**". The seed reads "+$23.45M", yet the same comparison opened shows "Net worth **+$3.82M** at 2086". The row compares the other plan in its own future dollars at 2086 against this plan in today's dollars at 2091.
2. **The Annuity basis/gain split is wrong for any future year in today's dollars.** Hovering 2045 on Spencer's annuity shows "Basis $66.7K 53% · Gain $60.3K 47%". The true split is 33% basis to 67% gain. `deflate()` deflates the balance but not `nonTaxableBaseRemaining`, so the donut divides a nominal basis by a deflated balance. This is the part of the account he pays tax on.
3. **Home still shows two prices.** The affordability map marker reads "$1.01M · 2031". The slider, the price curve and Timeline all read $1.02M. This shows on both the seed and Spencer's plan. `AffordabilityMap.tsx` wasn't in U9's file list and still calls `nicePrice`.

The rest of the list is colour and label consistency. Each item takes a few lines to fix.

### Round-1 bar and round-2 additions

| Bar item | Result |
|---|---|
| Mid-scrub opacity 1.00 | **Met.** The minimum is 1.00 on all 6 hero pages. Median frame time is 16.7ms in the dev build. |
| Overflow probe empty | **Met.** It prints `{}` at 390 dark, 390 light and 1440 light. |
| Budget = Cash Flow = Net Worth to the dollar | **Met.** The worst gaps are 1e-10 (NW donut against Budget spending) and 6e-11 (after tax). |
| No Short outside `health.shortYears` | **Met.** 781 scrub positions over 11 charts, 0 violations. |
| Rail never moves | **Met.** Top is 0 at every scroll position on 9 pages. |
| Every chart follows hover | **Met.** The Annuity donut follows hover ("In 2045"), and Reports' 7 charts share one cursor. The Scenarios row sparkline is a static thumbnail, which is acceptable. |
| From savings ≤ withdrawals; Unfunded = Short pill | **Met.** See the U6 ruling. Unfunded matches the engine shortfall to 6e-11. 2033 shows "✗ Unfunded $2,349" beside "Short $2,349/mo". |
| No figure collapses a space | **Met.** "Short $10.2K", "Short $5.6K". |
| Toggle dark ≡ OS dark | **Met.** 0 pixels differ by more than 24 on 18 page captures. Antialiasing gives 4 stray pixels on the Annuity phone capture. |
| Every categorical set passes the validator | **Met.** I re-ran the validator: accounts light and dark pass, with only contrast WARNs, which visible labels relieve. |
| Home: one price, one cash-left, matching Timeline | **Not met.** Cash-left is $7.8K everywhere. Price is $1.02M everywhere except the map marker ($1.01M). |
| Phone alert ≤ 64px collapsed | **Met.** 57px (`c-alert-pair.jpg`). |
| Review lands on the withdrawal setting | **Met.** The sheet scrolls to "Available to spend · Never" and focuses it (`i-alert-review.png`). |

---

## Scores per requirement

| # | Requirement | R2 | **R3** | Evidence / remaining gap |
|---|---|---|---|---|
| R1 | Every chart scrubbable | 9 | **9.5** | Scrub, pin and keyboard all work. The first ← now gives 2090. The Annuity donut follows hover, and Reports shares hover. Deduction: the Annuity donut's split is wrong in future years (M2). |
| R2 | Dismiss alerts | 10 | **10** | Hide, Undo, stays hidden on other pages, and restore all work. |
| R3 | Running dry obvious everywhere | 8 | **9.5** | Budget's three states are true; the phone alert is 57px with Why?; Back on track appears on both timelines; RMDs are named as RMDs. Deduction: the share chart labels its lower half "Paid from savings ↓" over unfunded money, and draws a red stroke along 0 in surplus years (m3). |
| R4 | Cut overview; 1Y–40Y ranges | 9 | **10** | On a phone, What if and … sit on the title row. |
| R5 | Shared, then per-person budget | 9 | **9.5** | Envelope and kid edits work. Deduction: the same money is called "Into savings" in the donut and "Saved on purpose" in the list directly below (m3). |
| R6 | Apple-design focus; nav | 8.5 | **9.5** | One dark theme, Scenarios is a plain list, and Reports' grid sits on the page. Deduction: the Scenarios row figure is wrong (M1). |
| R7 | NW chart + split; pin line | 8.5 | **9.5** | Sheets read "Short $10.2K/mo". Deduction: the donut center "Short $10.2K" nearly touches the inner ring at 1440 (polish). |
| R8 | Two-finger sideways scroll | 10 | **10** | scrollLeft goes from 0 to 640, page scrollX stays 0, and snap is x. |
| R9 | Remove comparisons | 10 | **10** | — |
| R10 | Before/after donut | 10 | **9.5** | The morph and the parts sheet work. Deduction: Home's donut uses its own colours, so Kids is teal here and gold on Budget (m2). |
| R11 | Chart audit | 8 | **9** | The cushion is readable now (12-year window, rent clipped with a chip). SEPP bars end at the last bar. Price ticks are clean. Deductions: Retirement draws "Required distributions" in Cash's teal, in the same legend (m1); the share chart's Unfunded area is only a slightly darker pink than the backdrop hatch (m3). |
| R12 | Delete Progress | 10 | **10** | — |
| R13 | Events by person | 9 | **9.5** | Timeline shows $1.02M, matching Home. Deduction: the Home map marker doesn't (M3). |
| R14 | Cash Flow: groups, after-tax headline, underfunding | 9.5 | **10** | "Required distributions · Tax-deferred investments" is untruncated at 1440. The stub is empty. |
| R15 | Less text, bigger charts | 8.5 | **9.5** | The Scenarios paragraph and the id leaks are gone. Reports has one pill. Leftover: the Home "COSTS" footer sentence. |
| R16 | Overview + Accounts merged | 10 | **10** | — |
| R17 | Account popout | 9 | **9.5** | The waterfall reads Opening / Contributions / "Growth (net of fees)" / "Required distributions −$52.4K" / Closing, with no Other row. The ghost and Keep work. Deduction: the Home "Owning it" pill reads "Short $50K/yr" on a page that uses /mo (m4). |
| R18 | Reference look | 9 | **9.5** | Space restored, and dark parity holds. |
| R19 | Pie popouts | 9.5 | **9.5** | Every slice opens its sheet. Deduction: the Annuity split (M2). |
| R20 | Series switcher | 10 | **10** | — |

**Mean: 9.68. Weighted overall: 9.6.** R1, R3 and R11 carry double weight, as before.

---

## N# status

| N# | Status | Evidence |
|---|---|---|
| N1 Budget danger path | **Verified** | 2033: Into savings $841, From savings $20, ✗ Unfunded $2,349 next to "Short $2,349/mo". 2065: From savings $0, Unfunded 83%. The identity holds to 1e-11 (`recon3`). |
| N2 space collapse | **Verified** | The ` ` escape. "Short $10.2K" on the seed, "Short $5.6K" on port 3000. |
| N3 two dark themes | **Verified** | `tokens.test.ts`; computed tokens are identical; pixel diff is 0. |
| N4 palette | **Verified** | I re-ran the validator: ALL CHECKS PASS in both modes. Liabilities and real estate are neutral. |
| N5 RMD / never / penalty | **Verified** | The alert says "never drawn to cover a shortfall". The sheet reads "Required distributions −$52.4K", and Cash Flow reads "Required distributions · …". `penalty` is no longer in `stranded`. Retirement has three layers. |
| N6 phone alert | **Verified** | 57px collapsed. Why? expands to 132px. |
| N7 one home price / cash-left | **Partial** | Cash-left is $7.8K everywhere; the slider, curve and Timeline read $1.02M. **The map marker reads $1.01M** (M3). |
| N8 cash cushion | **Verified** | 2029–2041 window, rent clipped with a "↑ Keep renting $1.12M" chip. |
| N9 share axis / readout | **Verified** | The axis reads 100%·50%·0·50%·100%. The readout leads with "Saved 21%" or "✗ Unfunded 11%", and after tax is secondary. |
| N10 sheet units | **Verified** | Account and category sheets read "Short $10.2K/mo". (Home "Owning it" is still /yr: m4.) |
| N11 Review lands on setting | **Verified** | "Available to spend: Never" is in view and focused. |
| N12 Scenarios | **Partial** | Plain list, primary button, names not ids, "Plan length 66 years → 21 years". The opened comparison reads "+$3.82M at 2086", which is correct. **The landing row delta is wrong** (M1). |
| N13 Reports | **Verified** | One shared readout, 7 cursors move together, no inner borders, the stub reads just the year. |
| N14 phone recovery | **Verified** | "2046 BACK ON TRACK" on the phone, and over 2046 on desktop. |
| N15 CSS hygiene | **Verified** | 4 scrims are prefixed and the `DataTable` comment is fixed. One orphan, `.ns-view-sub`, remains; that's negligible. |
| N16 Other residual | **Verified** | "Growth (net of fees)", no Other row. |
| N17 SEPP axis | **Verified** | Seed bars end at 2050. On Spencer's plan the bars run to 2055 and the axis stops there. |
| N18 first arrow | **Verified** | ← ← gives 2090, 2089. |
| N19 Annuity donut hover | **Verified (behaviour)** | It follows hover ("In 2045"). Its numbers are wrong in future years (M2). |
| N20 Cash Flow stub | **Verified** | Empty. |
| N21 price-curve ticks | **Verified** | $200K … $1.4M, evenly spaced. |
| N22 phone NW actions | **Verified** | On the title row. |

## Rulings on the unit reports

- **U6 · gross-withdrawal bound: accepted. My round-2 net bound was wrong.**
  - Budget lists "Tax on withdrawals" as its own outgoing, so From savings has to be the gross draw for the identity to balance.
  - `recon3` shows the net bound over-claims by exactly the withdrawal tax ($30,162 in 2061), and the gross bound holds to 1e-10.
- **U6 · Unfunded as a red area over the danger hatch: accepted, with m3.**
  - Its own hatch would merge with the backdrop hatch anyway.
  - The area does have a red stroke. But the lower-half label "Paid from savings ↓" contradicts it, and the stroke runs along 0 through surplus years. Fix both.
- **U6 · "Year by year" heading: accepted.**
- **U8 · 58px alert with Why?: accepted.** I measure 57px.
- **U8 · Review focuses "Available to spend": accepted.** That is the field's real label.
- **U8 · Required distributions / SEPP payments / Inflation adjustment rows: accepted.** Seen live.
- **U9 · single source: accepted for the files U9 owned.** The miss is in `AffordabilityMap.tsx` (M3).
- **U9 · Timeline deflates to the event year: accepted.**
  - Side effect: dragging the home from 2031 to 2033 relabels it $967.5K, because the stored nominal price is fixed while the display year moves.
  - Home does the same, so the two stay consistent. Not a defect.
- **U9 · cushion window: accepted.**
- **U9 · three-layer stack: accepted.**
- **U9 · SeppBars trim: accepted.** It holds on both plans.
- **U9 · Annuity donut follows hover: accepted as behaviour. The numbers are M2.**
- **U7 · validator: accepted.** My re-run gives the same result. Gold at 2.11–2.17 contrast is legal because every series carries a text label.
- **U7 · identical dark blocks: verified.**
- **U7 · 61 dead classes: verified.** One orphan remains.
- **U10 · plain list: accepted.**
- **U10 · pin-style hover rule on Reports: accepted.** Reports has no pin of its own to confuse it with. A controlled-hover prop can wait.

## Spencer's plan (port 3000, read only)

- **Two-second test: passes on every page.**
  - Net Worth: a hatched block from 2071 with "Runs dry · 2071"; the spendable line hits $0 there.
  - Budget: an orange drawdown 2058–70, then hatched Unfunded.
  - Retirement: "Short $67.1K/yr" over a grey "Locked $805.8K".
  - Timeline: "RUNS DRY" at 2071.
- **Runs-dry story: clear and correct.**
  - The alert reads "$908.6K in Tax-deferred investments and Variable annuity are never drawn to cover a shortfall".
  - That figure is exactly the two balances at 2071 ($689K + $220K).
  - Review opens Tax-deferred on the setting. Retirement's "Earliest safe age 58 · 2054" gives the other lever.
- **Numbers agree across pages:**
  - Net Worth 2091 is $2.20M, Short $5.6K/mo; Retirement shows $67.1K/yr (= 12 × $5.6K).
  - Locked $805.8K = Tax-deferred $282.7K + annuity $523.1K.
  - Reports' horizon is $2.20M.
  - The home is $1.02M on Timeline, the slider and the curve.
  - **Exceptions:** the map marker ($1.01M, M3), the Scenarios row (+$23.17M, M1) and the Annuity split (M2).

---

## Remaining findings

### Blocker

None.

### Major

- **M1 · Scenarios landing row compares the wrong dollars and the wrong year.**
  - **File:** `src/planner/pages/ComparePage.tsx`, `PlanRow`.
  - **Cause:**
    - `runPlan(plan)` gives the other plan in its own dollar mode: the seed's "Retirement Forecast" is `futureDollars`, so $25.14M nominal.
    - `delta` subtracts `activeNetWorthAtHorizon`, which is this plan's **last** year (2091, today's dollars), from the other plan's value at its last year (2086).
  - **Fix:**
    - Present the other plan in the **active** plan's dollar mode, exactly as `compareResult` already does (`dollarMode === 'todaysDollars' ? deflate(raw, inflationRate) : raw`, using the active plan's settings).
    - Compute the delta against `result.years.find((y) => y.year === readYear).netWorth`.
  - **Done when:** the seed row reads "$5.69M +$3.82M · Net worth in 2086", matching the opened comparison's "Net worth +$3.82M at 2086".
- **M2 · Annuity basis/gain donut divides a nominal basis by a deflated balance.**
  - **File:** `packages/engine/src/inflation.ts`, `deflate()`.
  - **Fix:** in the `accounts.map`, add `...(a.nonTaxableBaseRemaining !== undefined ? { nonTaxableBaseRemaining: a.nonTaxableBaseRemaining / balanceF } : {})`. It is a stock like `close`.
  - **Test:** in the engine's inflation test, for a plan with `nonTaxableBase`, `deflate(r).years[k].accounts[j].nonTaxableBaseRemaining / close` equals the raw ratio.
  - **Done when:** on a variable annuity with a basis, the hovered-year donut's basis share equals the nominal `basis / close` share. On Spencer's plan, 2045 should read about 33% / 67%, not 53% / 47%.
  - The other consumers (`AccountsTab`, `detail.ts`) then show the basis in the same dollars as the balance beside it, which is the intent.
- **M3 · Home map marker reads $1.01M.**
  - **File:** `src/planner/views/AffordabilityMap.tsx:167, :242`.
  - **Fix:** use `money(selected.price)` instead of `money(nicePrice(selected.price))`. The "Comfortable up to" and "Stretch to" figures may keep `nicePrice`, because they are thresholds, not the user's price.
  - **Done when:** every price on Home and Timeline reads $1.02M.

### Minor

- **m1 · Retirement: "Required distributions" uses `--mix-6`, which is Cash's account hue, in the same legend.**
  - **File:** `src/planner/retirementSources.ts` `BUCKETS`.
  - **Fix:** use `color-mix(in srgb, var(--mix-3) 55%, var(--surface))`. RMDs come out of tax-deferred, so a tint of its gold is semantically right and distinct from both Cash and a tax-deferred withdrawal layer.
  - **Done when:** no two series in the Retirement legend share a hue.
- **m2 · Home "Your budget" donut ignores the group colours.**
  - **Files:** `src/planner/views/HomeBudgetDonut.tsx` (its `FALLBACK` map) and `src/planner/spendingGroups.ts`.
  - **Problem:** `FALLBACK` hard-codes Kids `--mix-6`, Personal `--mix-4` and One-time `--mix-3`, where `spendingGroups` has `KIDS_COLOR` (gold), `--mix-5` and `--mix-4`.
  - **Fix:** export the `GROUPS` colour map from `spendingGroups.ts` (e.g. `GROUP_COLOR: Record<GroupKey, string>`) and use it in `HomeBudgetDonut`'s `FALLBACK`.
  - **Done when:** Kids is the same gold on Budget and Home.
- **m3 · Budget share chart and naming.**
  - **Files:** `src/planner/views/BudgetShare.tsx`, `src/planner/budgetView.ts` (one label).
  - **Fixes:**
    1. Rename the inside-plot label "Paid from savings ↓" to "Not covered by income ↓". The lower half holds From savings **and** Unfunded.
    2. Don't stroke the Unfunded series where its value is 0, so no red line runs along 0 through 2026–30 and 2046–60.
    3. Raise the Unfunded area to a visibly stronger fill than the backdrop hatch (`--danger` at ~0.35 opacity under its stroke).
    4. In `budgetView.ts`, label the `into-savings` bucket "Saved on purpose" (keeping the "still paid in" caption), so the donut uses the same name as the envelope list and Cash Flow.
  - **Done when:**
    - the 2033 screenshot shows no red line outside short years;
    - the lower-half label reads "Not covered by income ↓";
    - the donut and list both say "Saved on purpose".
- **m4 · Home "Owning it" pill reads "Short $50K/yr" on a /mo page.**
  - **File:** `src/planner/views/HouseForecastView.tsx`.
  - **Fix:** build the band like `NetWorthPage` does: re-unitise per month with `monthsIn(stored, year)` and pass `shortUnit: '/mo'`.
  - **Done when:** it reads "Short $4.2K/mo" for 2031 on the seed.

### Polish (not worth a unit; listed for later)

- The NW donut center "Short $10.2K" nearly touches the inner ring at 1440; a 2px smaller size would give it air.
- Reports mini-charts: the "$0" y-tick collides with the cursor dot at the left edge.
- Timeline bar labels ("Amazon", "School") scroll out of view with the bar's start.
- The Budget donut lists "Tax on withdrawals $2" in years with a trivial draw; hide it below $10.
- The Home map's x-ticks crowd at the end ("2045 2046").
- The Home "COSTS" footer sentence.
- The Scenarios diff line "Amazon — Person You → —".
- One orphan rule, `.ns-view-sub`.

---

## Fix units (parallel; disjoint files)

**Every unit must:**
- run `npm run lint && npm test` until green;
- start its own server (`npx vite --port 31NN --host 127.0.0.1`) and never touch port 3000;
- re-run the overflow probe and `short` from `review3/shoot.mjs` (set `BASE`);
- look at its pages at 1440 and 390, in light and dark;
- commit on its own branch with a message naming the unit.

### U11 · Money truth: Scenarios, Annuity basis, Home (M1, M2, M3, m4)

**Owns:**
- `src/planner/pages/ComparePage.tsx`;
- `packages/engine/src/inflation.ts` and its test file;
- `src/planner/views/AffordabilityMap.tsx`;
- `src/planner/views/HouseForecastView.tsx`.

**Done when:**
- the seed's Scenarios row reads "+$3.82M · Net worth in 2086";
- the Annuity donut's basis share in a hovered future year equals the nominal ratio (new engine test);
- Home shows $1.02M in all four places;
- "Owning it" reads `/mo`;
- `npm test` is green, including `packages/engine`.

### U12 · Colour and label consistency (m1, m2, m3)

**Owns:**
- `src/planner/retirementSources.ts`;
- `src/planner/views/HomeBudgetDonut.tsx`;
- `src/planner/spendingGroups.ts`;
- `src/planner/views/BudgetShare.tsx`;
- `src/planner/budgetView.ts` (the `into-savings` label only; update any test asserting the old label).

**Done when:**
- no two series in the Retirement legend share a hue;
- Kids is gold on Home and Budget;
- the share chart has no red stroke outside short years and reads "Not covered by income ↓";
- the donut and list both say "Saved on purpose".

After U11 and U12, a quick re-check of M1–M3 on port 3000 (read only) is enough to call this 10/10. Nothing else stands between this build and handing it to Spencer.
