# UI Design System, Components & Interaction Patterns

**[OBSERVED]** unless flagged. **Revised** after a follow-up pass captured real screenshots at true desktop width via Playwright (see [11_screenshot_index.md](11_screenshot_index.md)) — the initial pass in this package was written from the Claude_Browser pane, which never actually triggered this app's desktop CSS breakpoint even when its viewport was emulated at 1440px, so it under-reported the desktop experience significantly. The corrections below supersede the original "single responsive column at every size" conclusion. Screenshot files now exist in `research/screenshots/` and are referenced throughout.

## Visual design system

- **Layout is genuinely responsive with a real desktop breakpoint**, not one column at every size. At true desktop width (confirmed 1440×900 via Playwright, see `dashboard-desktop.png`, `plan-networth-desktop.png`, `current-finances-desktop.png`):
  - A persistent **icon-only left rail** (dark navy, ~56px wide) replaces the off-canvas hamburger drawer as the primary nav surface; the hamburger instead toggles the rail fully open/closed (`dashboard-sidebar-collapsed-desktop.png`) rather than swapping in a labeled/expanded state.
  - The **Dashboard** becomes a genuine 3-column layout: Net Worth chart | Assets table | Liabilities table, side by side, with Plan cards shown 2-up instead of stacked.
  - The **Plan tab's top nav bar shows all 9 tabs simultaneously** (Plan/Cash Flow/Tax Analytics/Chance of Success/Compare/Optimize/Reports/Estate/Settings) with no horizontal scrolling or truncation — the "tab bar scrolls when it overflows" behavior documented in the narrow-viewport pass was an artifact of that narrow render, not real product behavior at normal desktop width.
  - The **Plan tab chart gains a right-side info panel** (Net Worth / Liquid Net Worth / Portfolio Allocations, plus an age scrubber) that has no equivalent in the narrow view at all.
  - **Object-editing forms render as inline multi-column grids directly on the page** in Current Finances (e.g., a Real Asset's Purchase Price / Current Value / Owner / Status / Loan Balance / APR / Interest / Monthly Payment / Years-to-payoff all visible at once, `current-finances-desktop.png`) rather than the single-column modal sequence assumed from the narrow pass.
  - **Cash Flow's Sankey and Tax Analytics' bar chart render at full width with no cropping**, revealing considerably more detail (full expense itemization, a "Notable Events" side legend with lifetime cumulative figures) than the narrow pass could show.
  - A 4th summary ring — **Equity** — appears next to Net Worth/Assets/Liabilities on Current Finances at desktop width; not observed in the narrow pass.
- **Typography:** clean sans-serif throughout (system-UI-adjacent), bold weight for headline numbers at a notably large size relative to body text — the product consistently makes ONE number per screen visually dominant. This holds at both narrow and desktop widths.
- **Color:** teal/green for positive/growth, blue for milestone/flag markers and neutral chart lines, red/orange for warnings and negative deltas, purple/indigo for real-assets iconography, black/near-black for primary buttons and headline text. Confirmed consistent at desktop width.
- **Iconography:** one consistent colored-icon vocabulary per object type, reused across list rows, chart markers, and modal headers — confirmed unchanged at desktop width.
- **Cards vs. inline grids:** the "cards over tables" pattern documented originally holds for Income/Expenses/Flows lists, but Current Finances' balance-sheet editing is better described as an **inline data-entry grid** at desktop width, not a card list — a meaningful distinction for a product spec.
- **Modals for editing (Plan-tab objects):** still true for adding/editing Income/Expenses/Accounts within a Plan — these open modals at any width. Current Finances is the exception (inline grid, see above).
- **Disclaimer footers:** confirmed unchanged, domain-specific wording per analytical tab.

## Component inventory

Confirmed present and reused across the app (desktop-width additions marked):
- **Icon rail** (desktop primary nav, collapsible) / off-canvas drawer (narrow-width primary nav) — two different components for the same nav content, not one component reflowing
- Top toolbar (page title / notification bell with badge / display-options sliders icon / avatar / **a checkmark "saved" indicator, desktop-observed** on `optimize-tax-strategy-applied-desktop.png` / **a pin icon** next to the tab bar, desktop-observed, purpose not tested)
- Tab bar — **does not scroll/truncate at desktop width**; only does so in narrow viewports
- Metric card (label + big number + inline sparkline/ring/bar)
- Progress ring
- Accordion section
- Segmented control
- Dropdown menu
- Slider + text hybrid
- Toggle switch
- Waffle/dot-matrix chart
- Sankey diagram
- Bottom-sheet drawer (narrow width) — **[UNKNOWN]** whether Display Options/notifications render as a bottom sheet or a different pattern (e.g., side panel/popover) at desktop width; not directly re-tested in the follow-up pass
- Empty state
- Diagonal-hatch "deactivated" state
- Thumbs-up/thumbs-down outcome indicator
- Winner badge
- **Status badge** (Active/Off pill, observed on Optimize component cards at desktop width — `optimize-tax-strategy-applied-desktop.png`) — not seen in the narrow pass
- **Inline multi-column data grid** (Current Finances asset editing at desktop width) — a genuinely distinct component from the modal-based editing used elsewhere
- **Master-detail drill-in panel** (gap-closing pass — Settings → Rates → Stocks/Bonds): clicking a summary row swaps the whole list for a single-item detail view with a "‹ Back" pill as its header, rather than expanding in place like a standard accordion — a third distinct "reveal more detail" pattern alongside the accordion and the modal
- **Category-panel accordion with sibling collapse** (gap-closing pass — Plan tab's Accounts/Income/Expenses/Real Assets/Flows row): expanding one category doesn't just grow it — the other 4 simultaneously collapse from full panels into a compact icon+label pill strip, so exactly one category is ever fully expanded at a time

## Interaction & "feel" patterns

(Unchanged from the original pass — these were verified through direct interaction, not just visual width, so they hold regardless of viewport.)

- **Instant, no-spinner recompute** for most edits.
- **Live-preview simulation** — Optimize → Flexible Spending's live Monte Carlo re-run remains the standout.
- **Proactive, ambient warnings** via the notification bell.
- **Guardrail nudges on user action** (the emergency-fund modal).
- **Non-destructive override pattern** (Deactivate; What-If Keep/Revert/Fork).

## UI states observed

Unchanged from the original pass; re-confirmed at desktop width (loading spinners, empty states, disabled-button + validation-message pattern).

## Responsive behavior — corrected

**This section previously concluded the app has one identical layout at every width. That conclusion was wrong**, produced by a testing tool (the Claude_Browser pane) that did not actually render this app's desktop CSS breakpoint even with its viewport emulated at 1440×900. A follow-up pass using Playwright's own browser (which does render real desktop widths — confirmed by the icon rail, 3-column Dashboard, full 9-tab bar, and inline data grids described above) shows this is a **genuinely responsive product with a real, materially different desktop layout**, not a single mobile-first column reused everywhere.

Revised transferable lesson for Northstar: **don't assume a narrow browser-automation render surface tells you the truth about a product's desktop experience** — verify with a tool that actually triggers the relevant CSS breakpoints (as this correction demonstrates, viewport-emulation parameters alone were not sufficient in the tool originally used). On the product-design side, the corrected finding is arguably a better lesson than the original one: ProjectionLab evidently invests in a genuine desktop information architecture (persistent icon nav, multi-column dashboards, inline data grids, side panels) on top of a narrower mobile-first shell, rather than shipping one layout everywhere — worth deciding deliberately whether Northstar does the same, rather than defaulting to "mobile-first single column" as this package originally (incorrectly) implied ProjectionLab had chosen.

Mobile-width (375×812) behavior from the original pass — single column, off-canvas drawer nav — was tested in the Claude_Browser pane and is likely still accurate for genuinely narrow (phone) widths, since a narrow render surface is exactly what phone width is; the error was specifically in claiming *desktop* looked the same, not in the mobile description itself.

## Animation & transition inventory (gap-closing pass)

**Method note:** Playwright screenshots are discrete frames, not video, so exact easing curves and millisecond durations generally cannot be measured — every entry below is [OBSERVED] for trigger/start-state/end-state (captured via before/after screenshot pairs) and [INFERRED] or [UNKNOWN] for duration/easing, marked explicitly. Two computations (Monte Carlo, Optimize) turned out to have **no observable loading state at all** — a real, useful finding in its own right, not a measurement failure.

| # | Animation | Trigger | Start state | End state | What moves/fades/scales | Duration & feel | Interruptible? |
|---|---|---|---|---|---|---|---|
| 1 | **Sidebar rail toggle** | Click hamburger (☰) | Persistent dark icon rail visible (56px) | Rail fully hidden — content reflows to fill the freed width | Rail slides/fades out; main content's left edge shifts to x=0 | [UNKNOWN] duration; binary two-state toggle, not a hover-reveal | [UNKNOWN] |
| 2 | **Sidebar rail → labeled expansion** | Click hamburger again while hidden | Rail hidden | Full labeled sidebar (238px, "ProjectionLab" logo + text labels) | Rail slides/fades in at a wider width than the default icon rail | [UNKNOWN] | [UNKNOWN] |
| 3 | **Settings dropdown menu** | Click "Settings ▾" tab | Menu closed | 8-item menu (Milestones…Notes) appears anchored below the tab | Menu fades/scales in from the tab; chevron flips ▾→▲ | Fast, felt instant in screenshots — no intermediate frame caught | Assumed yes (Escape/outside-click closes it) |
| 4 | **Optimize / Compare dropdown menus** | Click "Optimize ▾" or "Compare ▾" tab | Menu closed | 5-item (Optimize) or fewer-item (Compare) menu appears | Same fade/scale-in pattern as #3 — one shared dropdown component reused across all "▾" tabs | Same as #3 | Same as #3 |
| 5 | **Object-edit modal open** (Account/Income/Expense/Real Asset) | Click a list-row item (e.g. "401k/403b" account row) | No modal; list visible | Centered modal, page behind it dimmed/darkened | Modal fades/scales in from center; backdrop opacity ramps to a dark overlay simultaneously | [UNKNOWN] duration; no partial-opacity frame captured | Yes — Escape closes it cleanly with no lingering DOM state observed |
| 6 | **Modal close** | Escape key | Modal + dim backdrop visible | Modal gone, backdrop fully cleared, underlying page interactive again | Reverse of #5 | [UNKNOWN] | N/A |
| 7 | **Accordion / master-detail category expand** (Plan tab: Accounts/Income/Expenses/Real Assets/Flows) | Click a category header (e.g. "Accounts") | All 5 categories shown as collapsed icon+label pills in a row | Clicked category expands to a full-width scrollable list; the other 4 categories collapse to a single-row pill strip on the right | The clicked category's panel grows; siblings shrink/reflow into pills; page auto-scrolls up slightly to bring the panel into view | [UNKNOWN] duration; a genuine layout reflow, not a simple height animation | [UNKNOWN] |
| 8 | **Settings sub-nav "drill-in" (Rates → Stocks/Bonds)** | Click a rate category row | Flat list (Inflation/Stocks/Bonds rows with chevrons) | List replaced by a single-item detail panel with a "‹ Stocks" back-button header | List content swaps for detail content; a back chevron replaces the forward chevron | [UNKNOWN] | Yes — clicking the "‹ Stocks" pill returns to the list (URL does not change; client-side view swap) |
| 9 | **Rates mode switch (Fixed/Historical/Advanced) — chart redraw** | Click a segmented-control pill | Header mini-chart shows one shape (e.g. smooth compounding curve under Fixed) | Chart redraws to a **different shape entirely** — Historical mode shows a jagged sequence-of-returns line; Advanced shows the same smooth curve but with sparkline previews replacing the % chips | Full chart re-render, not a tween between two data series — axis rescales, line path changes shape | Appeared instant/single-frame in screenshots — no intermediate draw state caught | [UNKNOWN] |
| 10 | **Milestone date field → live chart recompute** | Edit a milestone's date/year field and submit (Enter) | Plan chart shows one trajectory (e.g. depleting to $0 by ~67 under a bad retirement-age setting) | Chart redraws completely to a new trajectory (smooth growth to $5M+) within the same screenshot round-trip | Full area-chart redraw; axis Y-max rescales (was $800K-max, becomes $5M-max); milestone icons reposition along the X-axis; toolbar warning icons (bell badge "3") disappear | **No visible loading spinner or intermediate frame** — recompute completes before the next screenshot, consistent with "instant, no-spinner recompute" documented elsewhere in this package | N/A (no loading state to interrupt) |
| 11 | **Save-state indicator** | Any successful field edit (first observed after a stray click on the plan icon) | No indicator in top-right toolbar | A checkmark-in-cloud icon appears next to the theme/notification icons | Icon appears (fade-in assumed, not confirmed) | **Persists at least several seconds** (still visible across 2 consecutive screenshots ~2s apart) — behaves like a static "saved" state indicator rather than a transient toast that auto-dismisses quickly | [UNKNOWN] |
| 12 | **Hover tooltip** | Mouse hover over an icon (e.g. plan avatar) | No tooltip | Small dark tooltip bubble appears near the cursor (e.g. "Change plan icon") | Fades in near the hovered element | [UNKNOWN] — but the accessibility tree shows **~30-45 `tooltip` nodes mounted on every single page**, all empty/inactive until hovered — confirms tooltips are pre-mounted and toggled via visibility/opacity, not created on demand | N/A |
| 13 | **Chart-type dropdown (Net Worth / Income / etc. picker)** | Click the dataset-picker combobox on the Plan chart | Dropdown closed | Scrollable 40-item list opens below the combobox (see [07_outputs_charts_reports.md](07_outputs_charts_reports.md) for the full list) | List fades/slides in; internally scrollable via mouse wheel | Same as #3/#4 dropdown family | Yes |
| 14 | **Monte Carlo run — loading → result** | Click the "▶ Run" button in the center of the empty donut ring | Large empty gray donut ring, "Run" label centered, no numbers | Donut fully colored (green/blue or red depending on outcome), center shows "100.00%" or "0.00%", narrative sentence + outcome-category legend + percentile-band chart all populate simultaneously | **No loading spinner, progress indicator, or intermediate frame was ever captured** across 2 separate runs (baseline and Experiment A) — the 196-trial historical resample appears to complete client-side well under screenshot round-trip time (order of ~1s or less) | Confirmed instant in both baseline and post-spending-shock runs | N/A |
| 15 | **Optimize search — loading → result** | Select an objective ("Higher net worth") → select a search depth ("Quick") in the 3-step wizard | Step 3 of 3 ("Launch your search," 4 depth-option cards) | Full result screen: "$149.82K Gained in net worth," "51 strategies evaluated," a "Winner" badge on the top strategy card, Apply/Explore-alternatives buttons, and a redrawn Net Worth chart with the strategy applied | Wizard content is fully replaced by result content; URL changes from `/strategy/tax` to `/strategy/optimize` | **Also no loading/progress state observed** — even a 51-strategy beam search at "Quick" depth resolved before the next screenshot. [UNKNOWN] whether Standard/Deep/Extreme depths (not tested, to stay within scope) show a spinner for their longer, stated run times | Not tested at higher depths |
| 16 | **Cash Flow Sankey — year-scrubber recompute** | Move the age/year slider (Home key jumped to plan start) | One Sankey topology (e.g. drawdown-phase: 401k source → Withdrawals → Expenses, blue/red palette) | A **structurally different** Sankey (accumulation-phase: Salary source → Earned Income → 4 contribution destinations, green/teal palette) | Nodes, links, labels, and the color palette all change — not a value-only update on fixed nodes | [UNKNOWN] — a single click on the slider track did not register a change; only keyboard Home/Arrow interaction moved it, suggesting the drag handle requires a precise pointer-down-and-drag gesture that simple clicks don't satisfy | [UNKNOWN] |
| 17 | **Notification bell badge count** | Any plan edit that changes plan-health status | Badge shows one count (e.g. "3") | Badge updates to a new count (e.g. "2") or disappears entirely when all warnings clear | Numeral changes in place; badge itself appears/disappears | [UNKNOWN] | N/A |
| 18 | **Tab switch (Plan/Cash Flow/Tax Analytics/…)** | Click a top tab | Previous tab's content visible | New tab's content visible; URL changes (e.g. `/plan` → `/cash-flow`) | Full content-area swap; underline indicator moves to the new tab | Standard client-side route transition; no cross-fade artifact observed in screenshots | Yes (browser back navigates tabs too) |

### What remains [UNKNOWN] after this pass
- Exact easing curves (ease-out vs. spring vs. linear) for any of the above — not extractable via discrete screenshots.
- Millisecond durations for anything faster than the screenshot round-trip (roughly sub-second) — items #10, #14, #15 in particular may have a brief (<300ms) transition that simply completes before Playwright's next screenshot fires.
- Toast/error-message animations — no validation error or destructive-action confirmation was triggered this session.
- Whether Optimize's Standard/Deep/Extreme search depths (longer stated run times) surface a real progress indicator where Quick did not.
- Slider drag-animation feel (the live drag/momentum of dragging a handle) — only click-and-keyboard interactions were exercised, since the automation tooling used here can invoke keyboard/click but not a smooth pointer-drag gesture.
