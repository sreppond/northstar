# Redesign v5: charts that do the talking

Plan, Oct 16, 2026. This builds on v4 (docs/REDESIGN-V4.md), which got the
household model right. v5 changes how the app looks and how you move around
it. Spencer's feedback, in short: the Overview chart is the best thing in
the app because you can scrub it. Everything else is cluttered or repeats
itself. Running out of money only shows up on one page. The layout makes
the point hard to follow.

Sonnet sub-agents will build this. Every work unit in §8 is self-contained.
It names the files it owns, what done looks like, and how to check it.

---

## 0. Requirements traceability

Every item Spencer asked for, with the section that delivers it. Mark each
one off in §10 as it ships.

| # | Ask | Where |
|---|---|---|
| R1 | Every chart scrubbable: hover shows that year's number | §3 chart kit, §6 audit |
| R2 | Alerts can be dismissed | §4.3 |
| R3 | Running out of money is obvious on every page, not just the summary | §4.2 plan health |
| R4 | Summary page: cut what doesn't help; range buttons 1Y/3Y/5Y/10Y/20Y/40Y | §5.1 |
| R5 | Budget: set the shared budget, then a budget for each person | §5.3 |
| R6 | Apply the apple-design skill: less bloat, a focused layout, rethought navigation | §1, §2, §4 |
| R7 | Accounts: scrubbable net-worth chart with the same ranges. Below it, the year and balances on the left and a pie of that year's spending on the right. The chart sets the year: hover follows, click pins it with a white vertical line | §5.1 |
| R8 | Balances over time: scroll sideways with two fingers instead of arrow buttons | §5.1, §3.7 |
| R9 | Remove the comparisons everywhere | §4.4 |
| R10 | Swap the repeated plain bar charts (e.g. budget before/after) for a donut with the total on top and a before/after breakdown | §3.5, §5.5 |
| R11 | Audit every chart: thoughtful, varied, useful, interactive | §6 |
| R12 | Delete the Progress page | §2, §4.5 |
| R13 | Events grouped by person, modern and polished (Lifeline-inspired, not copied) | §5.4 |
| R14 | Cash Flow: group more (home, kids). Income shows after-tax as the headline, with gross and tax under it. Make underfunding obvious | §5.2 |
| R15 | Less text. Bigger charts that are easier to use. Every element has to earn its place | §1, §6 |
| R16 | Merge Overview and Accounts into one headline page: net-worth chart first, scrollable numbers below | §2, §5.1 |
| R17 | Click an account to open a smooth popout: its own chart (the line draws left to right as it opens), scrubbable, with its assumptions and time ranges | §5.1.4 |
| R18 | The balance-chart look from the references: value and year above the chart, a glowing line, glowing dots, a dashed cursor | §3.2 |
| R19 | Pie popouts where they fit | §3.5, §3.6 |
| R20 | Switch the chart between total net worth and a single account's balance | §5.1.1 |

---

## 1. Design principles for v5

These come from the apple-design skill and apply to every work unit. Agents
should read `~/.claude/skills/apple-design/SKILL.md` before starting.

1. **Purpose: every element answers a question or it goes.** The questions
   are v4's five (home, budget, kids/leave, annuity/SEPP, retirement), plus
   "are we on track?" and "when do we run out?". Stat strips, explanatory
   sentences, eyebrow meta lines, `(i)` hints and spread cards are cut
   unless one of those questions needs them.
2. **The chart is the hero, and its readout replaces the stat strip.** Each
   page leads with one big, interactive chart (360–460px tall on desktop).
   The page's key number sits directly above it and follows the scrub.
   Charts don't use tooltips: the readout above the chart is the tooltip.
3. **One focus year across the app.** Hovering any time chart previews a
   year. Clicking pins it, drawn as a white line in dark mode and an ink
   line in light mode. The pinned year carries from page to page, so pinning
   2036 on Net Worth opens Cash Flow and Budget at 2036.
4. **Simplicity, not minimalism.** Show the common path first and put the
   detail one level deeper: an expand caret, a donut slice, a row that opens
   a sheet. Detail moves down a level. It doesn't disappear.
5. **Fluid, interruptible motion.** Springs are critically damped by
   default: `bounce: 0`, about 0.35s. Lines draw in from left to right. A
   range change animates the axis domain from where it is now; it never
   jumps. Sheets enter and leave along the same path. Press feedback fires
   on pointer-down. Every motion has a `prefers-reduced-motion` fallback
   (a short cross-fade).
6. **Materials, not boxes.** Fewer bordered cards. Sections sit on the page
   background, separated by space and a short title. The rail and sticky
   headers are translucent (`backdrop-filter`) with a scroll-edge fade
   instead of a 1px divider. Sheets dim what's behind them.
7. **Typography.** Switch from IBM Plex to the system font stack
   (`-apple-system, BlinkMacSystemFont, system-ui`). This is a Mac app, and
   SF Pro brings optical sizing and tabular numerals. Large figures use
   −0.02em tracking and 1.05 line-height. Body text stays near 0 tracking.
   Plex Mono goes; use `font-variant-numeric: tabular-nums` instead.
8. **Feedback has four kinds: status, completion, warning, error.**
   Running dry is an error and is never quiet (§4.2). Plan checks are
   warnings and can be dismissed (§4.3).
9. **Colour is data** (unchanged from docs/DESIGN-DIRECTION.md). Chrome
   stays neutral. Red/orange means money out or danger. The net-worth hue
   is the accent.

---

## 2. Information architecture

Today the rail has 12 destinations. v5 has 7 main ones, plus 2 under More.

```
Northstar
[ House Forecast ▾ ]  2026 → 2091 · through Sarah's 95
[ ● Runs dry in 2071 ]          ← plan-health pill, only when short (§4.2)
[ ⌕ Search or jump…  ⌘K ]

Net Worth        /net-worth   headline: the chart, year snapshot, spending donut, balances
Cash Flow        /cashflow    income after tax vs spending; grouped table
Budget           /budget      shared and personal budgets; split donut; by year
Timeline         /timeline    life lanes per person (Events + Family merged)

DECISIONS
Home             /house
Retirement       /retirement
Annuity & SEPP   /annuity

MORE  (collapsed group, quieter)
Scenarios        /compare     (see open question Q1)
Reports          /reports
```

**Route changes.** Old routes redirect so bookmarks and ⌘-shortcuts keep
working:

- `/overview` and `/accounts` go to `/net-worth`.
- `/events` and `/family` go to `/timeline`.
- `/progress` goes to `/net-worth`.
- `*` goes to `/net-worth`.

**Deleted:** the Overview page, Accounts page, Progress page, Events page
and Family page as separate routes. Their useful parts move:

- **Overview:** the chart becomes Net Worth's hero. The What-if levers go
  into a sheet. Goals, Coming up, horizon cards, the stat strip and the
  account-mix bar are cut.
- **Accounts:** the balance table and the account editor become Net Worth's
  balances and the account sheet.
- **Family:** members and career phases become Timeline lanes and the person
  sheet. Kids' cost by age goes to the Budget → Kids sheet. "Step back from
  work" goes to the person sheet.
- **Progress:** removed outright, along with its actuals overlay and the
  "Ahead/behind plan" line. Stored `progressPoints` stay in the persisted
  store untouched, so old saves still load, but nothing in the UI reads them.

Update `nav.ts`, `CommandPalette.tsx`, `shortcuts.ts` (⌘1–⌘7 follow the new
order) and `ShortcutSheet.tsx` together.

---

## 3. The chart kit: `src/planner/charts/`

This is the foundation. Every chart in the app moves onto it, which is how
"every chart scrubbable" (R1) stays true without fixing twelve components
one at a time. **The kit stays hand-rolled SVG, with no Recharts.** The
house rule is in docs/PLAN.md §3.2, and the two things this app needs most
(a year-band scrub with a readout above the chart, and a pinned year shared
app-wide) are exactly what a library's tooltip model fights. The pasted
Recharts/shadcn snippets are **visual references only**: glow filters,
gradient fills, dashed grids, active dots, center-labelled donuts.

**One new dependency: `motion`** (motion.dev, `import { … } from
'motion/react'`). It covers springs, `AnimatePresence` for sheets, and
`layoutId` for the row-to-sheet morph. Pin an exact version that is at least
two weeks old. Charts may use the kit's own small rAF spring (§3.8) instead
of `motion`, because they redraw SVG paths every frame.

### 3.1 `useScrub` (hook)

```ts
const scrub = useScrub({
  years,                       // full x-domain (number[])
  plot: { left, right },       // px within the measured SVG
  focusYear, onFocusYear,      // controlled pin (from PlannerContext, §4.1)
});
// → { hoverYear, activeYear /* hover ?? focus */, bind /* pointer + key handlers */, svgRef }
```

- **Pointer events.** Pointer-down sets hover immediately (respond on press).
  Move updates hover 1:1. Use `setPointerCapture` while a touch drag is
  scrubbing. Set `touch-action: pan-y` so vertical page scroll still works.
- **Click or tap without dragging** (under 4px of movement) pins the year.
  Clicking the pinned year again unpins it.
- **Leaving the chart** clears hover. The readout falls back to the pinned
  year, then to the chart's default year.
- **Keyboard.** The chart is focusable (`tabIndex=0`). ←/→ move the pin one
  year, Home/End jump to the window's ends, and Esc unpins.
- **Reuse `chartMath.ts`** (`yearForClientX`, `quantiseYear`, `clampYear`).
  Don't fork the math.
- The year chosen is the **nearest data point** in the current window.

### 3.2 `TimeSeriesChart`

One component covers lines, areas, stacked areas and columns. Its series
API is a **superset of `MiniChart`'s `ChartSeries`**: `values`, `fill`,
`fillTo`, `fillOpacity`, `lineWidth`, `dashed`, `dots`, `stepAt`. That way
`MiniChart` can become a thin wrapper first (§8, A1), and every current
MiniChart gains scrubbing on day one before any page is redesigned.

```ts
interface TimeSeriesChartProps {
  years: number[];
  series: ChartSeries[];               // + `id`, + optional `kind: 'line'|'area'|'column'`
  stacked?: boolean;
  range?: RangeKey;                     // §3.4; omitted = all years
  height?: number;                      // hero 420 desktop / 280 phone; compact 220
  focusYear?: number | null; onFocusYear?(y: number | null): void;
  onHoverYear?(y: number | null): void;
  readout?: ReadoutSpec | false;        // §3.3; false for charts whose page owns the readout
  danger?: DangerBand;                  // §4.2 shortfall band
  markers?: { year: number; label: string; tone: 'income' | 'cost' | 'neutral' }[];
  ghost?: ChartSeries;                  // draft preview, dashed ink, never a new hue
  yFormat?(v: number): string;          // default axisMoney
  drawIn?: boolean;                     // default true
  ariaLabel: string;
}
```

**Visual spec.** Match the reference charts' feel, using tokens:

- **Width.** Measure it with ResizeObserver so the viewBox is in real px.
  (`MiniChart` already does this; lift that code.)
- **Line.** 2px, monotone cubic (step where `stepAt` is set). Under it sits
  a **glow copy** of the same path: `stroke-width 6`, `opacity .35`, and a
  `feGaussianBlur stdDeviation≈5` filter. Put the glow on the copy, never on
  the main path, because a filter on the main path blurs the line itself.
- **Area.** A vertical gradient of the series colour from 0.28 at the top to
  0 at the baseline.
- **Grid.** Horizontal only, `stroke-dasharray 3 3`, `--rule` at 60%.
  4–5 ticks from `niceAxisTicks`. No axis lines.
- **Labels.** Y-labels are 11px, muted, in the left gutter. X-labels are
  years, thinned to fit, with the first tick reading "Today".
- **Hover.** A dashed vertical cursor (`--ink-3`, `4 4`). An **active dot**
  for each visible series: r=5 in the series colour, a 2px `--bg` stroke and
  a halo (r=11, 18% opacity). Small dots at every point when the window has
  ≤ 6 points (short ranges, §3.4).
- **Pinned year.** A solid 1.5px line in `--pin` (white in dark mode, near
  ink in light) with a small year chip at the top. It stays drawn while
  hover moves elsewhere.
- **Columns.** Rounded top corners (3px). On hover the active column stays
  at full strength and the rest dim to 55%.
- **Draw-in.** On mount, and when the series identity changes (a different
  account, for example), a `clipPath` rect animates its width from 0 to full
  over ~650ms with ease-out (`cubic-bezier(.2,.8,.2,1)`). Lines and areas
  reveal left to right together. With reduced motion, use a 150ms opacity
  fade.
- **Range change.** Spring both the x-domain and the y-domain from their
  current values to the new ones. Critically damped, response ~0.4s. Paths
  are recomputed every frame (≤ 70 points, so this is cheap). It must never
  jump.
- **Ghost.** A dashed ink line for an unsaved draft (levers, envelopes,
  assumptions). It is never a new colour.

### 3.3 `ChartReadout`

This is the header above every hero chart, the "account balance above the
chart" Spencer asked for:

```
Net worth                                        [1Y 3Y 5Y 10Y 20Y 40Y All]
$1,062,410                                       ← AnimatedFigure, 44–56px, tabular
2036 · Spencer 40 · Sarah 40                     ← year + adult ages (muted)
```

- Values come from `activeYear` (hover, then pin, then the default year).
  The default is the window's last year, so the headline reads "where we end
  up" until you scrub.
- With several series, the primary value is large and the others are a row
  of small `●label value` items under it, also tracking the scrub.
- **Short years.** When the active year is short (§4.2), the readout adds a
  red `Short $88.7K` pill. Never rely on colour alone: include the ✗ glyph
  and the word "Short".
- Reuse `AnimatedFigure.tsx` for the number.
- Announce changes through an `aria-live="polite"` region, throttled so a
  scrub doesn't flood screen readers.

### 3.4 `RangePicker` and range state

- **Options:** `1Y · 3Y · 5Y · 10Y · 20Y · 40Y · All`. "All" means through
  the horizon. **"All" is required** even though Spencer didn't list it:
  his plan runs dry in 2071, which is past 40 years, so without "All" the
  failure could fall outside every window.
- **Windows** count from today: the opening snapshot, then each year-end
  close. The engine is annual, so 1Y has three points (today, the 2026
  close, the 2027 close) and draws dots at each point. Don't interpolate
  monthly values: that would invent precision the engine doesn't have.
- **Hidden options.** Hide any option longer than the plan. 40Y collapses
  into All when the plan is shorter than 40 years.
- **Shared state.** The range lives in `PlannerContext` (§4.1) and is
  persisted per plan, so the same range carries across pages (R7: "same
  time frames as the summary page").
- **Rendering.** A `Segmented` control, 13px. The active pill slides between
  options on a spring (motion `layoutId`).
- **Pure helper** `rangeWindow(years, opening, range) → {from, to}` in
  `charts/range.ts`, with tests.

### 3.5 `DonutChart`

Visual references: the `chart-pie` snippet (center label) and the
animated-card donut (sweep).

```ts
<DonutChart
  segments={[{ key, label, value, color, tone? }]}   // tone 'danger' for an unfunded slice
  center={{ value: '$14.2K', label: 'Spent per month' }}
  onSelect={(key) => …}                               // slice → popout (§3.6)
  size={260} thickness={28} padAngle={2}
  legend="side" | "below" | false
/>
```

- **Arcs** are SVG paths with a 2° pad angle and rounded ends.
- **Entry:** the arcs sweep from 0° to their angles (~600ms spring).
- **Updates** happen when the focus year or the before/after toggle changes.
  Each arc's start and end angle springs from its current value. Arcs morph
  and never re-mount. This is what makes before/after (R10) and scrubbing
  the year feel alive.
- **Hover a slice:** it pushes out 4px along its bisector and the others dim
  to 50%. The center shows the slice's value, label and share.
- **Legend:** rows with a dot, the label, the value and the %. Hovering a
  legend row and hovering its slice highlight each other. The legend is the
  accessible fallback, so the donut itself is `aria-hidden`.
- **Danger slice:** an "Unfunded" slice gets a diagonal hatch pattern plus
  the `--out` colour.

### 3.6 `Sheet` (popout)

Account details (R17), donut-slice drill-downs (R19), the person sheet
(Timeline), What-if and assumptions all use this shell.

- **Desktop:** a right-side panel, `min(600px, 100vw)` wide and full height.
  **Phone (< 768px):** a bottom sheet at 92vh.
- **Open:** a motion spring (`bounce: 0`, `duration: .38`). The surface
  "materializes": translate, plus `backdrop-filter` blur rising from 0 to
  20px, plus opacity. A scrim fades in to `rgba(0,0,0,.32)`. **Close**
  reverses along the same path.
- **Shared element:** when it opens from a row, the row's label and value
  morph into the sheet's header with `layoutId`. If `layoutId` gets flaky
  inside the scroll container, drop it and keep the slide. Don't burn time
  here.
- **Drag to dismiss:** horizontal on desktop, vertical on phone. Track the
  pointer 1:1 and rubber-band past the open edge. On release, use the
  skill's `project(velocity)` momentum projection to decide close or
  snap-back, and hand the release velocity to the spring.
- **Dismiss controls:** Esc, the scrim, and the × button. Focus moves into
  the sheet on open. The background is `inert`, the same idiom
  `Sidebar.tsx` uses. Focus returns to the trigger on close.
- **Stacking:** a sheet opened from a sheet (slice, then line) pushes the
  parent back with scale .96 and a darker dim.
- Replaces the current drawer chrome (`AccountDrawer`, `EventDrawer`,
  `BudgetLineDrawer`, `AssumptionsDrawer`). The form bodies are kept; only
  the shell changes.

### 3.7 `ScrollTable` (sideways-scrolling year tables)

Used for Net Worth's balances and the Cash Flow table (R8).

- **Scrolling:** native `overflow-x: auto` across **all** years. No pager,
  so the two-finger trackpad scroll just works. Add `scroll-snap-type: x
  proximity` with snap on each year column.
- **Sticky first column** (row labels) with a translucent material
  background. **Scroll-edge fades** (mask-image gradients) appear on
  whichever side has more content, instead of arrows.
- **Focus year:** the column is highlighted, and when the focus year changes
  from outside, the table smooth-scrolls that column into view (`center`).
  Clicking a column header pins that year.
- Keeps `DataTable.tsx`'s row model (`TableRow`, magnitude bars, group/child
  kinds, expand carets). Build `ScrollTable` by **changing `DataTable`'s
  layout**, not by forking it.
- **Remove** `LedgerToolbar`'s pager and the `windowYears` paging from
  `PlannerContext` once nothing reads them.

### 3.8 `spring.ts`

A ~40-line critically damped spring stepper on rAF (damping ratio and
response, from the skill's §4) for the chart domain and donut angle
animations. It starts from the current value and carries velocity through
re-targets. Add pure tests that it settles and doesn't overshoot at
damping 1.

### 3.9 `/dev/charts` (hidden QA route)

A page that renders every kit component with fixture data: hero area, multi
line, stacked, columns, donut, danger band, short range, ghost. Agents use
it for visual checks without needing a real plan. Keep it out of the nav and
behind `import.meta.env.DEV`.

---

## 4. Cross-cutting behaviour

### 4.1 PlannerContext additions

- `focusYear: number | null` and `setFocusYear`. These replace `scrubYear`
  as the *pinned* year. Hover stays local to each chart, apart from the hero
  readouts it drives.
- `chartRange: RangeKey` and `setChartRange`, persisted per plan in
  `settings` (an additive, optional field; default `'all'`).
- `health: PlanHealth` (§4.2), computed once from `result`.
- Remove `compare`, `fan`/`showFan`/`toggleFan`/`spread`/`spreadAtEnd`,
  `windowYears` and the pager, once their last reader is gone (§4.4).

### 4.2 Plan health: making "runs dry" impossible to miss (R3)

**Why it gets missed today.** Net worth in Spencer's plan stays positive
(about $2.2M at 2091) while spending goes unfunded from 2071. Home equity
and locked or illiquid accounts hold up the total. So the net-worth line
never visibly fails. The UI needs to show the money you can actually
**spend**.

1. **`src/planner/health.ts` (pure, tested):**
   ```ts
   planHealth(result): {
     status: 'ok' | 'short';
     firstShortYear?: number; shortYears: number[]; unfundedTotal: number;
     spendable: number[];       // per year: cash + taxable + penalty-free retirement balances
     signature: string;         // `${firstShortYear}:${round(unfundedTotal,-3)}`, for dismissals
   }
   ```
   Build `markers.shortfallYears` and `shortfallTotal` from
   `@northstar/engine`. Don't recompute them.
2. **Rail pill** (every page, can't be dismissed): under the plan switcher,
   `● Runs dry in 2071`, styled as a danger chip. Clicking it pins 2071 and
   opens Cash Flow.
3. **Top-of-page danger alert** (every page, dismissible per signature):
   `✗ This plan runs out of money in 2071. 21 years go short, $1.37M
   unfunded.` with the action `See 2071 →` (pin the year, go to Cash Flow).
   Dismissing hides the alert until the signature changes, for example
   after a plan edit moves the year. The rail pill stays regardless.
4. **Every time chart** gets a `danger` band: a red-tinted, hatched region
   over the short years, with a `Runs dry · 2071` chip at its left edge.
   When the band is outside the current range, a chip on the right edge
   reads `Runs dry 2071 →`. Clicking it switches the range to All.
5. **The Net Worth hero adds a "Spendable" line** (thin, dashed), so the
   failure is visible as that line hitting zero inside the band.
6. **Readouts:** the red `✗ Short $X` pill (§3.3).
7. **Tables:** short-year columns are tinted. The "Unfunded" row moves to
   the **top** of the Cash Flow totals, in red, never hidden among the
   children.
8. **Donuts:** in a short year, the spending donut gets a hatched
   `Unfunded` slice, and the center label changes to `Short $X`.
9. **Overview's "21 warnings:"** goes away. Its warnings were the
   per-year shortfall messages, which this alert now says once.

### 4.3 Dismissible alerts (R2)

- **`ui/Alert.tsx`:** tone (`danger | warning | info`), an icon, a message,
  an optional action, and **× to dismiss**. Hide it with a 200ms
  height-and-opacity collapse. Undo arrives as a toast: "Hidden ·
  Undo".
- **`useDismissals(planId)`:** stores `Set<string>` of
  `${alertId}:${signature}` in `localStorage['ns-dismissed:'+planId]`.
  Wrap every read and write in try/catch.
- **Converted to `Alert`:** `PlanCheckBanner`, the Monarch snapshot banner
  and the roll-forward banner. Each plan check's signature is its message
  text, so editing the plan into a different problem brings it back.
- **Restoring:** the header menu gets "Show hidden alerts (n)".

### 4.4 Remove comparisons (R9)

Remove each of these, with its CSS, and the context fields that only they
read:

- `LedgerToolbar`'s **Compare** select and `LedgerCompareDiff` on every
  ledger page.
- The compare overlay, the **±2 pts range fan** (Plan/Range toggle, the
  "Range" stat) and the **+5 / +10 / horizon spread cards**.
- **Year-over-year delta tags** on stats (`moneyDelta` vs. the prior year)
  and the "Projected" delta pill.
- "Ahead / behind plan" (`planVsReality`).
- Counterfactual **impact tags** on events ("Retire −$23.89M by 2091").
  These read as alarming and confusing. They're cut from Timeline cards.
  The event sheet can show an event's effect as a ghost line instead.

**Kept:** draft previews (ghost line plus the Impact strip on decision
pages). Those are preview-then-keep, not comparisons. The Compare page
itself is kept under More, pending **Q1**.

### 4.5 Delete Progress (R12)

Delete `pages/ProgressPage.tsx` and its route, nav entry, command-palette
entry and shortcut. Also remove the actuals overlay and
`dashboard.planVsReality`. Delete `progress.ts` and its tests only if
nothing else imports them. Leave the store's `progressPoints` field and
persistence alone so saved data still loads.

---

## 5. Page by page

Wireframes are for desktop at 1440px. Every page also gets a 390px phone
pass: single column, the sheet becomes a bottom sheet, and split rows stack.

### 5.1 Net Worth (`/net-worth`), the headline page (R4, R7, R8, R16–R20)

```
[✗ Runs out of money in 2071 · 21 years short · $1.37M unfunded   See 2071 →   ×]

Net worth ▾                                      [1Y 3Y 5Y 10Y 20Y 40Y All]  [What if]
$2,204,180
2091 · Spencer 95 · Sarah 95          ● Spendable $0  ✗ Short $88.7K
┌──────────────────────────────────────────────────────────────────────────┐
│  glowing area: net worth · dashed: spendable · hatched band 2071→        │
│  event ticks on the baseline (Amazon, Home, Retire)                      │  420px
│  dashed hover cursor · white pinned line at 2036                         │
└──────────────────────────────────────────────────────────────────────────┘

2036                                    │  Spending in 2036
Spencer 40 · Sarah 40                   │      ╭───────╮     Home       $6.1K
                                        │     │ $14.2K │    Kids       $3.9K
Cash                 $18,200  ▸ ▬       │     │ /month │    Shared     $2.4K
Brokerage           $412,900  ▸ ▬▬▬▬    │      ╰───────╯     Personal   $1.8K
401(k)              $301,400  ▸ ▬▬▬                         One-time      —
Variable annuity    $128,700  ▸ ▬▬
Home                $1.21M    ▸ ▬▬▬▬▬▬
Mortgage           −$612,000  ▸ ▬▬▬
─────────────────────────────
Net worth         $1,459,200

Balances over time          ← two-finger scroll · sticky names · all years
Account      Today  2026  2027  2028 … 2091
…
```

**5.1.1 Hero chart**

- `TimeSeriesChart`, area kind, `readout` on.
- **Series switcher** (R20): the title "Net worth ▾" is a menu (Net worth,
  Spendable, then each account class present). Picking one redraws the
  chart with the draw-in animation. The readout label follows the choice.
  "Net worth" is the default and shows the dashed Spendable line under it.
- `danger` from plan health. **Event markers** are small tone-coloured
  ticks on the baseline that label themselves on hover. They're **not
  draggable** here; dragging moves to Timeline.
- **What if:** a button that opens a Sheet with the existing `Levers`
  (market return, spending, retirement year). It previews as a `ghost`
  line, with Apply and Reset. Edit assumptions and + Add event go in the
  header menu and the ⌘K palette, not as header buttons.

**5.1.2 Year snapshot (left).** A large year label (the focus year, or the
hovered year while scrubbing) with adult ages under it. Under that, one row
per account class with a balance at that year. Each row has a thin
proportional bar (its share of assets, or of liabilities) and a ▸. Clicking
a row opens the **account sheet** (5.1.4). The net-worth total row comes
last. Values animate as the year changes.

**5.1.3 Spending donut (right).** A `DonutChart` of that year's spending,
grouped by `spendingGroups` (§7.1): Home, Kids, Shared living, Personal,
One-time. Taxes are excluded, because taxes belong to income (R14). The
center reads `$X /month` (or /yr, following the global unit). A short year
adds the hatched Unfunded slice. Clicking a slice opens a **category sheet**
with that group's line over time (`TimeSeriesChart`, scrubbable) and its
parts listed.

**5.1.4 Account sheet (R17).** It opens from a snapshot row or a balances
row.

- The header morphs from the row (layoutId): the class icon, its name, and
  the readout value plus year.
- `RangePicker` (sheet-local, initialized from the page's range) and a
  `TimeSeriesChart` of that class's balance. The **line draws left to right
  when the sheet opens**, timed to start as the sheet's spring settles
  (~150ms delay). It's scrubbable, and a pin here updates the page's
  `focusYear` too.
- **"In {year}"** shows that year's flow for the class: opening balance,
  contributions, growth (fees netted), withdrawals, closing balance. It's a
  small **horizontal waterfall**, a different shape from the charts above
  it, read from `AccountYear`.
- **Assumptions:** the `AccountDrawer` form body (extract it into
  `drawer/AccountForm.tsx`) inline in the sheet. Edits preview live as a
  ghost line, with Keep and Reset. Keep calls `upsertAccount` and toasts
  with Undo.
- **Multiple accounts in a class:** a segmented row above the form picks
  which account to edit, and the chart shows the class total, with the
  selected account as a second line.

**5.1.5 Balances over time.** `ScrollTable` across every year, with a
"Today" column first. Class rows are clickable and open the account sheet.
The focus-year column is highlighted and auto-scrolled into view. The
Add-account menu stays as a quiet `+` at the end of the table header row.

**Cut from the old Overview and Accounts:** the stat strips, freshness chip
and meta line (freshness moves into the plan switcher's sub-label), the
range fan, horizon cards, Goals, Coming up, the "Where it sits" stacked
bars, the `BalanceTrajectory` stacked chart (its job is now the series
switcher plus the snapshot), the reality line and the warnings box.

### 5.2 Cash Flow (`/cashflow`) (R14)

```
Cash flow                                         [ranges]   [/mo  /yr]
2036 · After tax $21.4K/mo · Spent $18.9K · Saved $2.5K        ✗ Short — in red when short
┌───────────────────────────────────────────────────────────────────────┐
│ after-tax income line (in) vs spending line (out); the gap between    │
│ them filled green where saving, orange where drawing down;            │
│ hatched danger band over short years                                  │
└───────────────────────────────────────────────────────────────────────┘

Where 2036's money went                       ← waterfall, a distinct form
Gross $410K ▸ −Tax $118K ▸ = After tax $292K ▸ −Home ▸ −Kids ▸ −Shared ▸ −Personal ▸ = Saved $30K

Year by year   (ScrollTable, all years, sticky labels)
▾ Income (after tax)            headline row = net
   ▾ Amazon        net            ← headline per source
        Gross pay
        Tax (share)
   ▸ SEPP — Variable annuity  net
▾ Spending
   ▸ Home            (rent → mortgage, property tax, insurance, upkeep, HOA, down payment)
   ▸ Kids            ▸ First child (arrival, daycare, school…)  ▸ Second child
   ▸ Shared living   (other shared lines by category)
   ▸ Personal        ▸ Spencer  ▸ Sarah
   ▸ One-time
▸ Saved on purpose (401k, 529, home fund)
▸ Withdrawals      (from cash, from taxable; capital-gains tax as a child)
✗ Unfunded         ← red, only when there are short years, pinned at the top of the totals
= Saved / drawn down
```

- **Hero:** two lines, with the band between them filled. Fill green where
  income is higher and orange where spending is higher. That shading is
  the "when does money get tight" answer, and it's unique to this page.
  Replaces `CashFlowTrend`.
- **Waterfall** for the focus year: a new kit piece,
  `charts/Waterfall.tsx`, hover-linked to the table rows. It's the only
  waterfall in the app, so it isn't repetitive.
- **Taxes move under income** (§7.2). The Income group's headline is
  after-tax. Each source expands into Gross and Tax (its share).
  Withdrawal taxes sit under Withdrawals. There is no standalone "Taxes"
  row any more.
- **Grouping** comes from `spendingGroups` (§7.1), the same groups the
  donuts use. Kids group by child.
- The **stat strip with year-over-year deltas** and the year stepper are
  removed. The readout and the focus year replace them.

### 5.3 Budget (`/budget`) (R5, R10)

```
Budget                          2036 ▾ (focus year)      [/mo /yr] [Today's $ Future $]

Your month in 2036
            ╭──────────╮          Shared          $9,400  [ edit ]   ← big editable figure
           │  $21.4K   │          Spencer         $4,000  [ edit ]
           │ after tax │          Sarah           $4,000  [ edit ]
            ╰──────────╯          Kids            $3,100  ▸ (computed from kid stages)
                                  Saved              $900   (what's left; red if negative)

Budget by year    (stacked columns by owner under the after-tax line; scrubbable; ranges)

Shared  $9,400 ▾           ← envelope sections, each collapsible to its lines
   Rent / Mortgage ·· Groceries ·· Utilities ·· Other shared spending (remainder)
Spencer $4,000 ▸
Sarah   $4,000 ▸
Kids    $3,100 ▸   → opens Kids sheet: cost by age per child, stage bands, scrubbable
```

**Envelope model (R5).** No engine change.

- **Shared envelope** = the sum of every `owner: 'shared'` spending line.
  Its figure is directly editable (click it, type, or nudge with ↑/↓ in
  $100 steps). An edit **writes the difference into the shared remainder
  line**, "Other shared spending". Create that line if it's missing. Rent,
  groceries and the other detail lines don't change. An edit that would
  push the remainder below 0 clamps it to 0 and says so inline.
- **Each adult's envelope** = that person's allowance line, `kind:
  'allowance'`. Editing it sets the amount, or creates the line if there
  isn't one.
- **Kids** is computed from their stage lines and is **not** directly
  editable. Its ▸ opens the Kids sheet, which holds the stage options moved
  over from Family.
- **Saved** = after tax minus the envelopes. It's derived, never edited, and
  shown in red with the Short pill if it's negative.
- **Preview, then keep** (v4's principle). An envelope edit makes a draft.
  The by-year columns show it as a ghost, and the Impact strip appears with
  Keep, Save as scenario and Reset. While a draft exists, the edited figure
  shows an accent dot.
- An envelope edit applies to the line for all years. The line keeps its
  own `from`/`until` anchors. Say so in the edit popover: "Applies every
  year this line runs."
- **Donut** = `DonutChart` of after tax split into Shared, Spencer, Sarah,
  Kids and Saved. Hover links it to the envelope rows. It replaces the
  "Where each month goes" `StackedBar`.
- **Cut:** the answer sentence, the stat strip, the year stepper (the focus
  year replaces it) and `TryAChange`. Its rent and allowance levers are now
  the envelope figures. Its "other fixed bills ±%" lever moves into the
  Shared envelope's edit popover.

### 5.4 Timeline (`/timeline`): Events and Family merged (R13)

Inspiration is the Lifeline component, used for ideas only: a calm,
typographic horizontal life, an embedded scroller, a vertical layout on
phones, and a "today" emphasis.

```
                 2026     2028     2030     2032 …  (64px / year, two-finger scroll)
                 TODAY
Spencer  (S) 30  ━━━━━━━━ Amazon ━━━━━━━━┫━━━━━━━ RI · full ━━━━━━━━━━━━━━━━━━━━… ◆ Retire 2058
Sarah    (S) 30  ━━━ Sarah's job ━━━━┫ ░░ leave ░░ ┣━━ part-time ━━━━━…
Household        ◆ Wedding 2027            ◆ Buy a home 2034 ($2.5M)
First child                ● Born 2028  ▕daycare▏▕ school ………… ▏▕college▏
Second child                         ● Born 2030 ▕daycare▏…
            ↑ vertical scrub cursor: "2034 · Spencer 38 · Sarah 38"
```

- **Lanes:** one per adult (avatar initials in the owner colour, name, age
  today), then Household, then one per child. Use
  `participants`, `participantId` on events, and `role`.
- **Career phases** (`job.phases`, `careerSegments`) are continuous bars:
  solid for full-time, lighter for part-time, hatched for leave, a gap for
  off. Kids' lanes show stage segments (daycare, school, college) from
  their budget lines' anchors.
- **Events** are 10px dots or diamonds on their lane, labelled in plain text
  beside them. Labels pack with `packLabelLanes` so they don't overlap.
- **Assigning events to lanes:**
  - `job`, `income` and `careerBreak` go to their participant's lane.
  - `retirement` goes to its participant's lane if it has one. If it doesn't
    (check the engine type), it goes to Household.
  - `haveAKid` goes to the child's lane (its birth dot).
  - `buyAHome`, `windfall` and `annualExpense` go to Household.
  - Anything unassigned goes to Household, with a "Who?" affordance.
- **Hover or tap an event:** it lifts (scale 1.04 plus a shadow). **Click**
  opens the **event sheet**: the existing `EventDrawer` form body inside
  `Sheet`, plus its effect on spendable money as a ghost line on a small
  chart.
- **Drag an event** sideways to move its year. Port the threshold, ghost
  and land-squish logic from `EventsTab.tsx`, and commit with one
  `upsertEvent` (one undo).
- **Click a lane header** to open the **person sheet**:
  - Adults: name, birth year, the "Work over time" phases editor and the
    "Step back from work" decision (moved from Family, with its Impact
    strip).
  - Children: stage options and cost by age (moved from Family).
- **Add person / Add child** go in the page header, or in a `+` at the end
  of the lane labels.
- **The year axis** is sticky at the top, and lane labels are sticky on the
  left, so the whole thing scrolls sideways with the trackpad. On load it
  scrolls to "today". The TODAY column gets a soft accent wash and a label.
- **Scrub:** the pointer shows a vertical hairline with a `year · ages`
  chip. Click pins `focusYear`.
- **Phone:** a vertical timeline with one row per year that has something
  in it, grouped by person colour (the Lifeline vertical idea).
- **Cut:** the stat strip ("Events 3 / Income events 1 / Cost events 2"),
  the Compare picker, impact tags and the separate Family page.

### 5.5 Decisions: Home, Retirement, Annuity & SEPP

These pages already answer their questions. v5 moves their charts onto the
kit, cuts text, and makes the visuals more varied.

**Home (`/house`)**

- **Hero:** `AffordabilityMap`, made scrubbable through `useScrub`. The
  readout shows "2034 · Comfortable up to $1.4M · Stretch to $1.9M".
- **Price curve (new; replaces the Price ladder table).** For the chosen
  purchase year, x is the home price and y is housing cost as a % of
  take-home, drawn over comfortable / stretch / house-poor zone bands
  (25% and 35%). Hovering a price gives the readout: price, $/mo to own,
  % of take-home, cash left after closing, and whether the plan still runs
  dry. A marker shows the current choice, and clicking a price previews it
  as a draft. This is a unique chart and answers "how much" directly.
- **Budget before and after (R10).** One `DonutChart` with a `Before
  buying · After buying` segmented toggle. The arcs morph between the two
  states. The center reads `$X/mo` with a caption. The Home slice is
  clickable and opens the owning-cost parts (P&I, property tax, insurance,
  upkeep, HOA) as a second, smaller donut in a sheet. This replaces both
  "What owning costs each month" and "Your budget, before and after"
  (two `StackedBar`s).
- **Cash cushion:** a kit chart with a dashed 6-month-reserve line and the
  danger band. Two series, buy and rent; the gap is the point, so keep the
  second line.
- **House-poor check:** keep the verdict rows (✓ / ~ / ✗) but drop the
  explanatory paragraphs.

**Retirement (`/retirement`)**

- **Hero:** "What pays for each year", a stacked area by source (salary,
  SEPP, withdrawals by account, Social Security) with the spending need as
  a dashed line. Scrubbable, with the readout listing each source for the
  year. This is the v4 `SourceStack` idea, now built on the kit.
- **Investable balance:** a kit area chart with the danger band.
- **Retire-year control:** keep the existing drag. Cut the goal progress
  bar.

**Annuity & SEPP (`/annuity`)**

- **Start-year bars:** `SeppBars` on the kit's column kind. Hovering a start
  year shows the max SEPP for it in the readout, and clicking selects it.
- **With and without the SEPP:** a kit chart with two lines. The readout
  shows both values. That's intrinsic to the decision, so it isn't a
  "comparison" in the sense of R9.
- **Fee drag** and **surrender charge:** move into the variable annuity's
  **account sheet** (5.1.4) as an extra section. They describe the account,
  not the SEPP decision.
- **Year-by-year table:** `ScrollTable`.

### 5.6 More: Scenarios (Compare) and Reports

- **Compare:** if it's kept (Q1), it moves to the kit with two series and a
  readout showing both, and `NetWorthChart.tsx` is deleted. If Q1 says
  delete, remove the route and the component.
- **Reports:** its charts move to the kit. The export stays.

---

## 6. Chart audit (R11)

Every chart in the app today, and what happens to it. "Kit" means it is
rebuilt on `TimeSeriesChart`, `DonutChart` or `useScrub`, and so becomes
scrubbable.

| Today | Where | Verdict | Becomes |
|---|---|---|---|
| `NetWorthChart` (1,716 lines) | Overview, Compare | Keep the idea, rebuild it | Net Worth hero (kit area + spendable + danger + markers). The fan, compare line, standing event labels and drag are cut (drag moves to Timeline) |
| `BalanceTrajectory` stacked area | Accounts | Cut | Series switcher plus year snapshot |
| `StackedBar` "Where it sits" | Overview, Accounts | Cut, it repeats | Snapshot rows with proportional bars |
| Horizon `StatCard`s (+5/+10/horizon, spread) | Overview | Cut | Range buttons plus scrub |
| Goal `ProgressBar`s | Overview, Retirement, House view | Cut | The decision pages are the goals |
| "Coming up" list | Overview | Cut | Timeline |
| `CashFlowTrend` | Cash Flow | Replace | Income vs spending with gap shading (kit) |
| Cash flow table | Cash Flow | Rework | `ScrollTable`, grouped, taxes under income |
| (new) | Cash Flow | Add | Waterfall for the focus year |
| `StackedBar` "Where each month goes" | Budget | Replace | Envelope donut |
| `BudgetColumns` | Budget | Kit | Scrubbable stacked columns plus ghost |
| Family kids-cost `MiniChart` | Family | Move | Kids sheet: per-child stacked area with stage bands |
| Family career tracks | Family | Move | Timeline lanes |
| Events Gantt | Events | Replace | Timeline lanes |
| `AffordabilityMap` | Home | Kit | Scrubbable, with readout |
| Price ladder table | Home | Replace | Price curve with zone bands |
| `StackedBar` owning cost + before/after | Home | Replace both | One before/after morphing donut, plus a Home-slice drill-down |
| Cash cushion `MiniChart` | Home | Kit | Plus a reserve line and danger band |
| `HouseForecastView` ownership arc | Home | Kit | Scrubbable |
| Retirement income vs spending `MiniChart` | Retirement | Replace | Source stack with a need line |
| Retirement balance `MiniChart` | Retirement | Kit | Plus danger band |
| `SeppBars` | Annuity | Kit | Columns with readout |
| With/without SEPP `MiniChart` | Annuity | Kit | Two lines, both values in the readout |
| Fee drag / surrender | Annuity view | Move | Account sheet |
| `SeppForecastView` `MiniChart` | Retirement (old SeppTool) | Kit | Or delete it if Phase 5 of v4 already replaced SeppTool. Check before porting |
| Reports `MiniChart` | Reports | Kit | — |
| Progress `MiniChart` | Progress | Delete | — |

**Variety check.** Net Worth is a glowing area. Cash Flow is a two-line gap
plus a waterfall. Budget is a donut plus columns. Timeline is lanes. Home is
a zone map plus the price curve plus a morphing donut. Retirement is a
source stack. Annuity is selectable columns. No two pages lead with the same
form. Donuts appear in three places, but each one answers a different split:
spending by group, budget by owner, and housing before vs after.

---

## 7. Pure data modules (new, tested)

### 7.1 `src/planner/spendingGroups.ts`

```ts
type GroupKey = 'home' | 'kids' | 'shared' | 'personal' | 'oneTime' | 'saving';
spendingGroups(plan, snapshot): { key; label; color; total; parts: { key; label; amount; ownerId?; sourceEventId?; budgetLineId? }[] }[]
```

Classify each `LineItem` in `snapshot.expenses` in this order:

1. `oneTime` lump sums go to `oneTime`. The down payment goes to `home`
   instead (it's housing).
2. Saving lines (`kind: 'saving'`, or contribution labels) go to `saving`,
   which isn't spending.
3. `category === 'housing'`, or a `sourceEventId` pointing at a `buyAHome`,
   goes to `home`.
4. An `ownerId` belonging to a child participant, or a `haveAKid` event, goes
   to `kids`. Parts group per child.
5. An `ownerId` belonging to an adult (allowances, personal lines) goes to
   `personal`. Parts group per adult.
6. Everything else goes to `shared`.

**Invariant (tested):** the sum of every group except `saving`, plus
`saving`, equals `snapshot.totalExpenses`, every year, for the sample plan
and a household-model fixture. Reuse `budgetView.ts` where it already
splits lines, and don't classify the same line differently in two places.

### 7.2 `src/planner/incomeTax.ts`

```ts
incomeWithTax(snapshot): { sources: { key; label; gross; tax; net; sourceEventId? }[]; withdrawalTax: number; total: { gross; tax; net } }
```

Attribute tax lines in three ways:

- Tax lines that carry a `sourceEventId` or `accountId` (event-specific
  taxes, SEPP tax) attach to that source directly.
- The household "Income tax" line is split pro rata by each taxable source's
  share of ordinary income. Read `packages/engine/src/run.ts` (around lines
  400–600) to see which incomes are ordinary and which are tax-free.
- Capital-gains and withdrawal taxes go to `withdrawalTax`.

**Label the split honestly:** the UI says "Tax (share)" and its hover card
explains that brackets are household-wide. **Invariant (tested):** the
sum of every `tax` plus `withdrawalTax` equals `snapshot.totalTaxes`.

### 7.3 `src/planner/health.ts`

As described in §4.2. Test it against a fixture that runs dry and one that
doesn't. The `spendable` series must be ≤ the net-worth series every year.

### 7.4 `src/planner/charts/range.ts` and `charts/spring.ts`

As described in §3.4 and §3.8.

---

## 8. Build order and sub-agent work units

**Branch:** `redesign-v5`, off `main`. Each unit ends with a commit on its
own branch (worktree). The orchestrator merges units into `redesign-v5` in
the order shown. One PR at the end, or one per phase if review prefers.

**Every unit's agent must:**

1. Read this doc's sections for its unit, plus §1. Read
   `~/.claude/skills/apple-design/SKILL.md`. For any visual work, also read
   the `dataviz` skill.
2. Follow the code's own conventions:
   - `ns-` CSS class prefix, plain CSS files next to the component, tokens
     from `planner.css`.
   - `lucide-react` icons, no Tailwind.
   - Comment density like the surrounding code: explain *why*, and cite
     this doc's section (`docs/REDESIGN-V5.md §5.1`).
3. Keep changes surgical (`karpathy-guidelines`). Don't refactor
   neighbouring code the unit doesn't need. Delete only what the unit
   orphans.
4. Run `npm run lint && npm test` until they're green.
5. **Look at it.** The dev server is `npm run dev` on port 3000 (the
   `northstar-dev` launch config). Check `/dev/charts` and the unit's pages
   at 1440px and 390px, in light and dark mode, with reduced motion on and
   off. Keep before and after screenshots for the PR. Check that
   scrub, pin, range and draw-in work by actually driving the pointer, not
   just by reading code.
6. Not touch files another unit owns in the same phase. If the kit is
   missing something, add it **backwards-compatibly** in a separate commit
   touching only `src/planner/charts/`, and note it in the commit message.
7. End with a short report: what shipped, what was cut, screenshots, and
   anything that's left or uncertain.

### Phase A: foundations (3 units in parallel, no page changes)

| Unit | Owns | Done when |
|---|---|---|
| **A1 · Chart kit** | `src/planner/charts/*` (new), `views/MiniChart.tsx` (becomes a thin wrapper over `TimeSeriesChart`), `/dev/charts` route | Everything in §3.1–3.5, §3.8 and §3.9. Every existing MiniChart in the app scrubs and shows a readout without any page edits. Pure tests for range, spring and donut arc math |
| **A2 · Data and state** | `health.ts`, `spendingGroups.ts`, `incomeTax.ts` (new, with tests), `PlannerContext.tsx` (adds `focusYear`, `chartRange`, `health`; doesn't remove anything yet), the engine `PlanSettings.chartRange?` field (additive) | §4.1 additions and §7.1–7.3, with their invariants tested |
| **A3 · Foundations** | `package.json` (`motion`), `ui/Sheet.tsx`, `ui/Alert.tsx`, `useDismissals.ts`, typography/tokens in `planner.css`, `index.css`, `ui/ui.css` (system font, `--pin`, `--danger-band`, glow and material tokens), removing the Plex imports from `App.tsx` | §3.6 and §4.3 components exist and are shown on `/dev/charts`. The app-wide font switch is checked visually on every page, with no layout breaks at 390px |

### Phase B: shell and IA (1 unit, after A)

| Unit | Owns | Done when |
|---|---|---|
| **B1 · Shell** | `nav.ts`, `Sidebar.tsx`, `App.tsx` routes and redirects, `CommandPalette.tsx`, `shortcuts.ts`, `ShortcutSheet.tsx`, `PlanCheckBanner.tsx`, `HeaderMenu.tsx`, `LedgerToolbar.tsx`, deleting `ProgressPage.tsx` | The §2 nav. Redirects work. Rail health pill and global danger alert (§4.2.2–3). Every banner converted to a dismissible `Alert` (§4.3). The Compare picker and diff removed (§4.4). Progress deleted (§4.5). Overview and Accounts temporarily stay reachable as `/net-worth` (rendering the old Overview) until C1 lands |

### Phase C: pages (5 units in parallel, after B)

| Unit | Owns | Done when |
|---|---|---|
| **C1 · Net Worth** | `pages/NetWorthPage.tsx` (new), `net-worth.css`, `drawer/AccountForm.tsx` (extracted), `AccountDrawer.tsx` (becomes the account sheet), `tabs/AccountsTab.tsx`, `tabs/DataTable.tsx` (the §3.7 `ScrollTable` layout), deleting `OverviewPage`, `AccountsPage`, `BalanceTrajectory` and `overview.css` once they're unused | All of §5.1. The pinned year drives the snapshot and the donut. The sheet opens with a spring and the line draws in. Assumption edits preview as a ghost. The table scrolls with the trackpad |
| **C2 · Cash Flow** | `pages/CashFlowPage.tsx`, `tabs/CashFlowTab.tsx`, `charts/Waterfall.tsx`, deleting `views/CashFlowTrend.tsx` | All of §5.2. It uses `ScrollTable` from C1. C2 starts after C1 has committed the `DataTable` change, or else C2 owns that change and C1 waits: **the orchestrator decides at dispatch, and C1 owns it by default** |
| **C3 · Budget** | `pages/BudgetPage.tsx`, `household.css` (Budget parts), `views/BudgetColumns.tsx`, `budgetView.ts` (envelope helpers), a Kids sheet built from Family's kids-cost code | All of §5.3. The envelope edit semantics are unit tested: a shared edit writes only the remainder line, and an adult edit writes only that person's allowance line |
| **C4 · Timeline** | `pages/TimelinePage.tsx` (new), `timeline.css`, `tabs/EventsTab.tsx` (its drag logic is ported, then the file is deleted), `EventDrawer.tsx` (becomes the event sheet), deleting `EventsPage` and `FamilyPage` after moving their pieces (the person sheet holds Family's members, phases and step-back decision) | All of §5.4, on desktop and phone. The drag-to-move-year test (`EventsTab.test.ts`) is ported and passes |
| **C5 · Decisions** | `pages/HousePage.tsx`, `views/AffordabilityMap.tsx`, `views/HouseForecastView.tsx`, `pages/RetirementPage.tsx`, `views/RetirementForecastView.tsx`, `pages/AnnuityPage.tsx`, `views/SeppBars.tsx`, `views/AnnuityForecastView.tsx`, `views/SeppForecastView.tsx` | All of §5.5. The price curve and the before/after donut work. The fee and surrender sections hand off to C1's account sheet through an exported section component, `AnnuityAccountSection`, that C1 renders when the class is `variableAnnuity` |

### Phase D: cleanup and review (after C)

| Unit | Owns | Done when |
|---|---|---|
| **D1 · Scenarios and Reports, dead code** | `ComparePage.tsx`, `ReportsPage.tsx`, deleting `NetWorthChart.tsx`, `StatStrip`/`StatCard`/`StackedBar` if unused, `dashboard.ts` exports nobody reads, the `windowYears` pager and the compare/fan context fields | §5.6 (following Q1's answer) and §4.1's removals. `grep` shows no dead exports. `npm run lint && npm test` are green |
| **D2 · Design review** | No source changes except fixes | An independent pass with the `impeccable` / `design-review` skill against §1 and §6: 390px, dark mode, reduced motion, reduced transparency, keyboard-only scrub and pin, perf (a scrub holds 60fps on the 65-year plan; check in a Performance trace). It returns an ordered fix list. The orchestrator dispatches the fixes |
| **D3 · Ship** | `docs/REDESIGN-V5.md` §10, `docs/DESIGN-DIRECTION.md` (record the font switch and the motion rules) | Docs updated, then `npm run build:tauri` and a Tauri rebuild so the installed app shows v5. Merging to `main` stays Spencer's call |

**Running it with Sonnet sub-agents:**

- Phase A: three `Agent` calls in parallel (`model: "sonnet"`, `isolation:
  "worktree"`).
- Phase B: one.
- Phase C: five in parallel. C2 is gated on C1's `DataTable` commit (see
  above), so start C2 last or have it begin with the waterfall and table
  grouping logic.
- Phase D: D1, then D2, then the fix batch, then D3.
- After each phase, the orchestrator merges, runs `npm run lint && npm
  test`, and takes one look at every page before starting the next phase.

**Prompt skeleton for each unit** (fill in the unit's ID):

> You're building unit {ID} of Northstar's v5 redesign in
> `~/Coding/Northstar`. Read `docs/REDESIGN-V5.md`: §1, §{sections}, and §8's
> "Every unit's agent must" list, and follow them exactly. Read
> `~/.claude/skills/apple-design/SKILL.md` first. You own only these files:
> {files}. Done means: {done-when}. Verify by running `npm run lint && npm
> test` and by driving the UI in the browser at 1440px and 390px, in light
> and dark. Commit on your branch with a message that names the unit. End
> your report with screenshots and anything you cut or couldn't verify.

---

## 9. Open questions

Phase A can start without answers to any of these, because they only affect
Phase C/D. Each one has a default that applies if Spencer doesn't answer.

- **Q1. The Compare page itself.** "Take out the comparisons" clearly covers
  the in-page pickers and overlays. Does it also mean deleting the Compare
  (Scenarios) page? *Default: keep it under More.* D1 deletes it on a yes.
- **Q2. Merging Family into Timeline.** Spencer asked for events grouped by
  person. The Family page is already "people over time", so merging the two
  removes a near-duplicate. *Default: merge.*
- **Q3. What a budget envelope edit does.** Should editing Shared adjust
  the "Other shared spending" remainder (keeping the detail lines), or scale
  every shared line proportionally? *Default: remainder.* Should an edit
  apply every year, or from the focus year onward? *Default: every year.*
- **Q4. Switching the font.** IBM Plex to the system font (SF Pro). This
  visibly changes the whole app. *Default: switch*, because the
  apple-design skill says default to the platform font.
- **Q5. The 1Y and 3Y ranges.** The engine is annual, so these show 3–5
  points with dots. Monthly resolution would need an engine change.
  *Default: annual points, no interpolation.*

---

## 10. Status

**Oct 16, 2026:** Spencer approved the plan and took the default for each
of Q1–Q5. Phase A (units A1, A2 and A3) has been sent to Sonnet sub-agents,
each in its own worktree. Each unit ticks its R-numbers here when it
merges.

**Phase A coordination notes:**

- **Range type.** `RangeKey` uses the literal values `'1y' | '3y' | '5y' |
  '10y' | '20y' | '40y' | 'all'`. A2 adds it to the engine as
  `ChartRangeKey`, and A1 declares the same literals in
  `charts/range.ts`. At merge, `range.ts` switches to re-exporting the
  engine type.
- **Dev routes.** A1 adds `/dev/charts` and A3 adds `/dev/ui`. Both are
  one-line route additions to `App.tsx`, and the orchestrator resolves the
  conflict when merging.
