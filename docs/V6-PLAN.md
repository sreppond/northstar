# v6 — money controls

October 2026. Five requests from Spencer, built on `redesign-v5`, on branch
`v6-money-controls`.

Roles:
- **Opus** designs (this doc).
- **Haiku** executes the units, each in its own worktree.
- **Sonnet** is the manager. It reviews every unit against the acceptance
  criteria here, fixes small gaps itself, merges, verifies, and pushes.

Read before any unit:
- `docs/MATH.md` (conventions: compounding stub year, mid-year flows, opening vs `years[0]`)
- `docs/REDESIGN-V5.md` §7 (spending groups, after-tax definition)
- `src/planner/format.ts` (the number language; add no formatters)

Ground rules for every unit:
- Keep the diff surgical and in the codebase's voice: short "why" comments, named after behaviour, not after this doc.
- Pure logic goes in `.ts` modules with vitest tests. Components stay thin.
- Backward compatible: a plan saved before v6 must load and project **exactly** as before unless a unit says otherwise. Add a test that proves it.
- Never read, clear, or write the in-app Browser pane's localStorage, or `~/Library/Application Support/com.northstar.planner`. They hold Spencer's real plans. Test in vitest or in fresh Playwright contexts only.
- `npm run lint` and `npm test` must pass for your files before you report.

## What Spencer asked for, and the design

### R1 — Account rows expand to show the flows
"Under each asset/liability there should be a sub drop-down that shows
additions, withdrawals, growth."

The Net Worth page's **Balances over time** table (`src/planner/tabs/AccountsTab.tsx`)
gets a disclosure chevron on every account-class row, the same pattern the
Cash Flow table uses (`tabs/CashFlowTab.tsx`: `expanded` set, `aria-expanded`
toggle). Expanded, it shows these sub-rows with one value per year column:

- **Asset:** Additions (contributions), Withdrawals (including required distributions and SEPP), and Growth (net of fees).
- **Liability:** Borrowed (new debt), Principal paid, and Interest. Interest is paid in cash, so it doesn't move the balance; label it "Interest (paid from cash)".
- Add an "Inflation adjustment" sub-row only in years where `flowSteps` produces one.

Reuse `flowSteps()` in `src/planner/pages/netWorthData.ts`; don't re-derive.
For "Borrowed", extend `flowSteps` additively so the liability parts include a
`borrowed` step equal to `max(0, close − open + principal)`. That way a mortgage
taken out this year reconciles: open + borrowed − principal = close. The Today
column is blank on sub-rows. Withdrawals and principal print as negatives using
the existing signed table formatter. Zero years print the table's zero dash.

### R2 — Cash Flow by year or by month
The Cash Flow page (`src/planner/pages/CashFlowPage.tsx`, `src/planner/cashFlowView.ts`)
gets a **Years | Months** segmented toggle in the table header.

- **Years:** today's table. The existing /mo and /yr unit switch stays, and applies only here.
- **Months:** twelve columns, Jan–Dec, for the focused year (the app-wide pinned focus year), with a ‹ year › stepper.

The engine models money by year, so Months is a faithful *split* of the year,
not new data:
- Recurring rows (every node except the One-time group and its children) are split evenly across the months the year covers. That's 12 for a full year. For the partial first year, only the months from the as-of month onward have values; earlier months show the zero dash and the header reads "before today". The divisor is `monthsInYear()`, not 12.
- One-time items (the One-time group and its children) land whole in the first covered month: January, or the as-of month in the first year.
- Withdrawals and Unfunded are split evenly, like recurring rows.
- A one-line footnote under the table: "Northstar plans by year. Months split each year evenly; one-time items show in {Month}."

Put this in a pure function, `monthlyColumns(tree, yearIndex, plan)`, in
`cashFlowView.ts`. It returns the same node shape with 12 values. Test that:
- each row's 12 months sum to that row's year value, within a cent
- months before the as-of date are zero in the first year
- one-time items sit only in the first covered month

### R3 — Income lines: year-by-year control, in $ or %
Every `income` event (`packages/engine/src/events/income.ts`) gains two
optional config fields. Without them, the result is identical to today's
`amount × (1 + growthRate)^elapsed`.

```ts
/** From `fromYear` on, grow by `value` % or by $`value` a year, until the next step. */
raises?: { fromYear: number; kind: 'percent' | 'dollars'; value: number }[];
/** An exact amount for one year; later years grow from it. */
overrides?: { year: number; amount: number }[];
```

Add one exported pure function, `incomeAmounts(config, startYear, endYear): Map<year, amount>`,
which the engine's compile **and** the editor preview both call, so they can't
disagree. The algorithm:
- In `startYear`, `a = overrides[startYear] ?? amount`.
- For each following year y:
  - If `overrides[y]` exists, `a = overrides[y]`.
  - Otherwise apply the active raise: the latest raise with `fromYear ≤ y`. Percent is `a × (1 + v/100)`; dollars is `a + v`. With no raise active yet, use `growthRate` as a percent raise. Floor at 0.
- The stub year still prorates linearly (`recurring: true`), unchanged.

Tests:
- No raises or overrides gives exactly the old formula.
- A $ step from a given year.
- A % step that changes rate mid-stream.
- An override followed by growth from the override.
- A dollar decrease that would go below 0 floors at 0.

**Editor** (`src/planner/drawer/`; find where `EventDrawer` renders income
fields, and follow `JobSchedules.tsx`'s pattern): a new
`IncomeScheduleEditor.tsx` section titled **Raises & changes**:
1. A list of rules. The first is implicit: "From {startYear}: +{growthRate}% a year", editable. Each rule reads `From [year] [ +% a year | +$ a year ] [value]`, with add and remove. Year inputs are clamped to the event's span.
2. A year-by-year preview table: Year · Amount · change vs previous year. Each Amount cell is editable. Typing sets an override for that year, and the cell gets a small "reset" affordance that removes it. Rows that are overridden are marked. Read the preview from `incomeAmounts`.

Writes go through the existing event draft, so Save and Cancel work as they
do today. Amounts are entered as yearly figures, like the rest of the income
form. Hovering the label explains it: "Set how this income changes over time: a
steady % raise, a fixed $ raise each year, or an exact amount for any year."

### R4 — Rent belongs in Home
Spencer's Rent budget line is filed under category `other`, so Cash Flow's
spending groups (`src/planner/spendingGroups.ts`) put it in **Shared**. Home
means `category === 'housing'`. The fix has three parts:
1. **Migration.** Add `fileHousingLines(plan)` alongside the existing load migrations; find where `toHouseholdModel` and the other `migrate*` run when plans load in `src/planner/store/`. Budget lines named `/\b(rent|mortgage|hoa|renters? insurance)\b/i` with category `other` move to `housing`. It's idempotent. Spencer asked for this, so it applies on load. Test it, including leaving a line already filed elsewhere alone.
2. **Inference.** In `BudgetLineDrawer.tsx`, a *new* line whose name matches the same pattern defaults its category to housing (only while the user hasn't picked one).
3. **Wording.** The housing category's user-visible label becomes **Home** wherever categories are listed (`BudgetLineDrawer.tsx` maps `housing: 'Housing'`), so the picker and the Cash Flow group use one word.

The `rent-after-purchase` check in `checks.ts` already keys on housing, so
filing Rent under Home also lets that check end it at the home purchase.
That's expected; leave the check as is.

### R5 — Taxable investments: active trading vs long-term
Taxable investment accounts (`accountClass: 'taxableInvestment'`) gain:

```ts
/** How gains are taxed. Unset means 'longTerm' (today's behaviour). */
gainsTaxTreatment?: 'longTerm' | 'activeTrading';
/** Short-term rate for active trading. Unset: the plan's `settings.incomeTaxRate`. */
shortTermGainsRate?: number;
```

- **Long-term** (default): unchanged. Gains are taxed when sold, through the existing withdrawal tax (`withdrawalTaxRate` × `taxableWithdrawalPercent`).
- **Active trading:** each year's realized gain is taxed at the short-term rate (short-term gains are ordinary income), and **paid the following year**. In `packages/engine/src/run.ts`:
  - The year's gain G is the account's growth (net of fees) for that year, as the engine already computes it, stub year included.
  - Keep a per-account loss carryforward. A negative G adds to it, and a positive G is reduced by it first.
  - The tax T = max(0, G − carry) × rate is owed in year y+1. In year y+1, emit a tax line `{ label: 'Tax on {y} trading gains — {account}', category: 'gainsTax', amount: T }` into `taxes`, so it's included in `totalTaxes` and paid through the normal cash flow and withdrawal waterfall.
  - Because every gain was taxed as it was realized, **withdrawals from an active account carry no further gains tax**. Its effective taxable withdrawal share is 0.
  - The final year's gains fall after the horizon. Don't pay them. Add a `result.warnings` entry only if the amount is ≥ $1: "{account}: ${T} of tax on {endYear} trading gains falls due after the plan ends."
  - Don't change compounding: the tax comes out of cash flow, not out of the account.
- **Tax buckets.** `src/planner/incomeTax.ts`'s `incomeWithTax` treats a `gainsTax` line the way it treats withdrawal tax: a cost not deducted from income. Fold it into the existing withdrawal-tax bucket and rename that bucket's user-visible label to **Tax on investments** wherever it shows (the Cash Flow table row, the waterfall bar, and the Budget page). The arithmetic is untouched: `after tax = gross − (totalTaxes − investmentTax)`. The existing reconciliation tests must still pass, and a new test must cover an active account.
- **Engine golden tests** (hand derivation in comments), using $100K in an active account at 10% with the rate at 30% and full years:
  - Year 1 has no trading tax.
  - Year 2 has $3,000 of tax on year-1 gains, and the account still compounds at the full 10%.
  - A −20% year carries the loss forward and offsets the next gains.
  - A long-term account produces no annual gains tax, and its withdrawal is taxed as before.
  - A pre-v6 plan is byte-for-byte unchanged.
- **Form** (`src/planner/drawer/AccountForm.tsx`), for taxable investment accounts only: a segmented **Gains tax** control with two choices.
  - **Long-term — taxed when you sell**
  - **Active trading — gains taxed every year, paid the next year**

  Active trading reveals "Short-term rate" (a percent, with the placeholder showing the plan's income tax rate). Explain on hover: "Active trading realizes gains every year. They're taxed as ordinary income and paid the following spring, so withdrawals later owe nothing more."
- Add a section to `docs/MATH.md`, "Taxable gains: long-term vs active trading", that gives the formulas and the worked check.

### R6 — Housekeeping
- `packages/server/test/routes.test.ts` "refreshes into a stored snapshot" fails in the evening (Pacific time). The snapshot's capture date is local but its age is computed in UTC, so `ageDays` reads 1. Make the age computation and the capture date use the same calendar (local), fix the code rather than the test, and add a test that pins a late-evening time zone.

## Units and waves

| Wave | Unit | Requirement | Files (owns) | Executor |
|---|---|---|---|---|
| A | A1 | R3 engine: `raises`/`overrides` + `incomeAmounts` | `packages/engine/src/events/income.ts`, `index.ts` export, engine tests | Haiku |
| A | A2 | R5 engine + tax buckets | `packages/engine/src/{run,types}.ts`, engine tests, `src/planner/incomeTax.ts`, `cashFlowView.ts` labels, `budgetView.ts` labels, `docs/MATH.md` | Haiku |
| A | A3 | R4 rent → Home | store migration, `BudgetLineDrawer.tsx`, tests | Haiku |
| A | A4 | R1 account sub-rows | `tabs/AccountsTab.tsx`, `pages/netWorthData.ts` (+test), CSS for the table | Haiku |
| A | A5 | R6 server date bug | `packages/server/**` | Haiku |
| B | B1 | R3 editor | `drawer/IncomeScheduleEditor.tsx` (+ where EventDrawer mounts it) | Haiku |
| B | B2 | R5 form | `drawer/AccountForm.tsx` | Haiku |
| B | B3 | R2 Months view | `cashFlowView.ts` (+test), `pages/CashFlowPage.tsx`, `tabs/CashFlowTab.tsx`, `pages/cash-flow.css` | Haiku |

Wave B starts after the manager has merged wave A. B1 needs `incomeAmounts`,
B2 needs the account fields, and B3 needs A2's relabelled tax bucket in
`cashFlowView.ts`.

**Manager (Sonnet), after each wave:**
1. Read each unit's diff against this doc's acceptance criteria. Check the arithmetic tests yourself, not just whether they pass.
2. Fix small gaps directly. Return anything large to the orchestrator with a precise list.
3. Merge the unit branches into `v6-money-controls`.
4. Run `npm run lint`, `npm test` (all workspaces), and `npx vite build`.
5. After wave B, run real-browser checks in fresh Playwright contexts: an expanded account row, Months view with the partial first year, the income editor with an override, an active-trading account showing "Tax on investments" the next year, and Rent under Home.
6. Push.

## Status

- [x] Wave A: A1 · A2 · A3 · A4 · A5 (merged; lint, all three workspaces' tests, vite build and cargo check green)
  - A1: accepted as built; arithmetic re-checked by hand. Its `raises`/`overrides` fields show up as `custom` in `describeSchema`, so `schemaForm.test.ts` now lists them: B1's `IncomeScheduleEditor` must render both.
  - A2: accepted. Closing an active account adds no gain to tax (growth is 0 once closed; earlier gains were taxed as they arose); SEPP tax reads `withdrawalTaxRate` by design. Both written up in MATH.md.
  - A3: accepted as built.
  - A4: fixed. The first projected year now uses `result.opening` as the prior close (`classFlowSteps`/`accountFlowRows` take `opening`). The class name is a real button beside the chevron and gear instead of a `role=button` row wrapping them. Phone: the chevron overlays the indent and the hidden gear is dropped, so names keep their width.
  - A5: cherry-picked (it was based on old main). Fixed the test's TZ restore, which set the string "undefined".
- [ ] Wave B: B1 · B2 · B3
- [ ] Manager review and push
- [ ] Tauri build installed to /Applications
