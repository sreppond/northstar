# Design direction — an instrument, not a report

A UI/UX audit of the planner and the plan to act on it. Companion to
[`PLAN.md`](./PLAN.md) §7, which it amends: §7 describes the design as built,
this describes where it goes next.

Nothing here touches `packages/engine`. The projection is correct and stays as
it is.

## The diagnosis

The app isn't badly built. It's *competently generic* — the same
four-KPIs-and-a-chart skeleton every generated dashboard ships with. The tell
is not craft, it's **uniform weighting**: Northstar answers one question ("will
I be OK, and when does it break?") and currently presents four equal numbers, a
chart, a caption and a table at the same visual volume.

Specific findings, from the running app at 1600 / 834 / 390:

1. **The 4-up KPI strip** sits above the chart competing with it, and three of
   its four numbers are things nobody acts on.
2. **Two identical white cards, stacked** — same width, radius, shadow, weight.
   A vertical list of containers, not a composition.
3. **`INC` / `WND` / `JOB` / `KID` / `HSE` / `BRK` / `SSA`** — seven codes in
   coloured squares, detached from the curve they annotate, all clustered in the
   first third of the x-axis.
4. **The chart is a picture, not an instrument.** In a simulator the only
   affordances are hover and one toggle. Nothing is draggable.
5. **Colour means nothing.** Buttons, badges, pills, tabs, wordmark chip, chart
   line and income pins are all blue.
6. **Tables carry no magnitude encoding** — eight year-columns of raw digits.
7. **No dark mode, native `<select>`, no keyboard model** beyond ⌘Z.

### The palette fails a formal check

Not an opinion. The five chart series (`#12304C` net worth, `#2E8BD0` income,
`#E8C68A` cost, `#3F9D78` fan-high, `#8A99A7` compare) through a colour-vision
validator:

```
[FAIL] Lightness band         outside band: #12304C (0.302), #E8C68A (0.842)
[FAIL] Chroma floor           reads grey: #12304C, #E8C68A, #8A99A7
[WARN] CVD separation         #8A99A7↔#3F9D78 ΔE 6.5 (deutan)
[FAIL] Normal-vision floor    #8A99A7↔#3F9D78 ΔE 11.5 — below 15
[WARN] Contrast vs surface    #E8C68A 1.59:1 · #8A99A7 2.84:1
```

With the fan on *and* a comparison loaded, the compare line and the "better
market" edge are ΔE 11.5 apart for a reader with **normal colour vision**. Cost
amber is 1.59:1 against white.

The fix is fewer series, not better hues. **The fan is one plan under two
assumptions, not two things** — drawing it as one band in the net-worth hue
removes two slots and tells the truth. Four series pass cleanly in both modes:

| Role | Light | Dark |
|---|---|---|
| Net worth | `#2a78d6` | `#3987e5` |
| Money in | `#1baf7a` | `#199e70` |
| Money out | `#eb6834` | `#d95926` |
| Compared plan | `#4a3aa7` | `#9085e9` |

The one remaining light-mode warning (aqua at 2.74:1) is discharged by move 3 —
every event gets a visible name, which is the direct-label relief the check asks
for.

## Two rules that decide everything else

**1. Colour is data. Everything else is ink.** No saturated hue appears
anywhere unless it *encodes a value*. Chrome is neutral. This kills the generic
blue-SaaS read on its own, and it is why the app can go dark without becoming a
different product.

**2. The timeline is the interface.** Every number belongs to a year, and the
year is chosen by pointing at the curve. `runPlan` costs microseconds — the
engine is already fast enough to recompute on every pointer-move. That
capability is sitting unused.

## Seven moves, ordered by leverage

**1. Kill the KPI strip.** One hero figure (`clamp(3.2rem, 7vw, 5.4rem)`, 700,
tracking −0.03em, **proportional** figures — `tabular-nums` makes a display
number look loose) plus a plain-English reading: *"$4.28M by 2046. 15.6% a year,
through a house in 2031 and two kids."* Plus the risk read. The other three
stats demote to a mono metadata line.

**2. The chart becomes the spine.** Full-bleed, ~58vh, hero figure inside its
top-left corner. Y-ceiling from the data, not `niceCeiling()`. Drop the dot
lattice entirely (texture-as-decoration). Area fill 0.20 → 0.02. Tables become
a sheet rising over the plot's lower edge.

**3. Retire the codes.** Each event becomes a dot **on the curve** (r=4, 2px
surface ring, hue = money-in/out) with a 1px leader to a real name. Rank by
|Δ net worth at horizon|; label the top 4, rest on scrub. Fixes the detached pin
row, the void, the taxonomy and the contrast warning at once.

**4. Scrub the timeline.** Pointer Events + `setPointerCapture`, 1:1, no
debounce. Hero figure, balance-sheet window and cash-flow column all follow the
year under the pointer. Deletes the permanent hint caption, and is the phone
answer to "hover cards need a pointer".

**5. Drag events through time.** Grab a dot, slide it, projection recomputes
live. Respect the grab offset; quantise to year; ghost the original at 30%;
rubber-band at the bounds; release on a spring (damping 0.8 / response 0.3,
velocity handed off). One drag = one undo entry. This is the feature that would
make Northstar unlike anything else in the category, and every drawer already
previews a draft plan live — the mechanism exists.

**6. Give the tables shape.** Magnitude bar behind each row at 8–10% hue
opacity, 4px rounded end at the baseline, scaled **per row** not per table.
Cash flow gets a diverging bar. Keep `tabular-nums` here — this is where it
belongs.

**7. Dark mode and ⌘K.** Both modes stepped from the same ramps and validated
separately, never flipped. Every colour defined at `:root`; only tokens
redefined under the dark scopes. ⌘K absorbs the native `<select>`, the Compare
control, the year pager and the scenario chips — **with no open/close
animation**, because it is keyboard-initiated and used constantly.

## Motion: three cut, three added, one retuned

| Where | Today | Verdict |
|---|---|---|
| Button/tab/pin press | `--jsx/--jsy` squish, 90ms | **Keep** — fires on `:active`, in budget, purpose is feedback |
| Shortfall marker | `ns-mark-pulse 2.4s infinite` | **Cut** — infinite loop at 0.42 Hz on data being read |
| Drawer open | `480ms --spring` | **Retune** — damping 1.0, ~300ms, and give it a real exit |
| Chart pin entrance | `ns-plop 460ms` staggered | **Cut** — decorative group entrance on a functional chart |
| Scenario switch | none, line teleports | **Add** — 220ms crossfade + path interpolation |
| Tab content swap | none, teleports | **Add** — 150ms opacity, no transform |
| Event drag release | n/a | **Add** — the one place bounce is earned |
| Command palette | n/a | **None**, deliberately |

Net: the app ends with *less* motion than today, concentrated on the two moments
that carry meaning — a plan changing, and a thing you're holding.

## Phases

Each ends somewhere shippable.

1. **Foundation** (moves 1, 7) — re-token `planner.css` splitting chrome
   neutrals from data hues; both themes at `:root`; type scale; hero figure
   replaces the KPI strip.
2. **The chart becomes the spine** (moves 2, 3) — full-bleed plot, real
   y-ceiling, lattice gone, codes retired, fan redrawn as one band.
3. **It becomes an instrument** (moves 4, 5) — scrub, then drag-through-time
   with live reprojection.
4. **Density and polish** (move 6 + tail) — magnitude bars, ⌘K, motion gate
   applied, empty and first-run states so `samplePlan.ts` can stop being fake
   data.

## Deliberately not doing

- **Not adopting a component library.** A search of financial-dashboard
  component catalogues returns things that look like Northstar looks today —
  that *is* the generated aesthetic.
- **Not replacing the hand-rolled SVG chart.** Pins that dodge each other and
  year-band hover are exactly what a library fights you on. `PLAN.md` §3.2 was
  right.
- **Not touching the engine, or the hover/gear pattern.** "Hover shows the
  assumptions, clicking through edits them", generated from one schema, is a
  genuinely good idea applied consistently. It stays.
- **Not changing the typeface.** DM Sans is already a considered choice. It
  gains a mono companion for figures and labels, which is where an instrument's
  voice lives.
