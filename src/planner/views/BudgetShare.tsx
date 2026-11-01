import { useMemo, type ReactNode } from 'react';
import { ChartReadout, RangePicker, TimeSeriesChart, rangeWindow, type ChartSeries, type DangerBand, type ReadoutItem, type RangeKey } from '../charts';
import { money } from '../format';
import { FROM_SAVINGS_COLOR, UNFUNDED_COLOR } from '../budgetView';

export interface ShareLayer {
  key: string;
  label: string;
  color: string;
  /** Percent of the year's money (0–100), one per year. They stack to 100. */
  values: number[];
}

const pct = (v: number) => `${Math.round(v)}%`;
/** Axis labels are sizes, not signs: below zero is "from savings" or unfunded, labelled in the plot (V5-REVIEW-2 N9). */
const axisPct = (v: number) => (Math.abs(v) < 0.5 ? '0' : pct(Math.abs(v)));

/**
 * Budget by year: "Where each after-tax dollar goes" (V5-REVIEW-1 F8,
 * docs/REDESIGN-V5.md §5.3). A 100%-stacked AREA of the envelopes: Shared,
 * each adult, Kids, tax on withdrawals, Saved. It is a share-over-time form,
 * which no other chart in the app is: Cash Flow's hero already answers "income
 * vs spending" in dollars, so this one drops the absolute scale and the
 * after-tax line and shows only how the mix shifts (kids arrive, the
 * mortgage ends, retirement starts).
 *
 * A year that spends more than comes in is drawn the honest way: the
 * envelopes and what was set aside fill the whole 100% (it is all
 * outgoings), and the gap hangs BELOW zero in two separate pieces
 * (V5-REVIEW-2 N1): orange "From savings" for what accounts really paid, and
 * red hatched "Unfunded" for what nothing paid. Savings never get credit for
 * unfunded money; the hatched danger band, the red area and the Short pill
 * say short, and only in `health.shortYears`.
 *
 * Hover previews that year for the whole page via `onHoverYear` (the donut
 * and envelope rows follow, F17); click pins it. The readout is this
 * component's own so its fallback year is the PAGE's year, not the window's.
 */
export function BudgetShare({
  years,
  layers,
  saved,
  intoSavings,
  fromSavings,
  unfunded,
  afterTax,
  draftSpentShare,
  draftSavedShare,
  range,
  onRange,
  todayYear,
  focusYear,
  onFocusYear,
  onHoverYear,
  shownYear,
  agesFor,
  danger,
  perLabel,
  height,
  label,
  actions,
  compactRange,
}: {
  years: number[];
  layers: ShareLayer[];
  /** Percent saved out of a surplus year (0 in a gap year); the readout's answer when nothing is drawn. */
  saved: number[];
  /** Percent set aside on purpose in a gap year (0 otherwise). It is the `saved` layer's height in those years. */
  intoSavings: number[];
  /** Percent of each year's base that real accounts paid; plotted below zero. */
  fromSavings: number[];
  /** Percent of each year's base that nothing paid; plotted below `fromSavings`, hatched red. */
  unfunded: number[];
  /** After-tax income per year in the page's unit, for the readout's secondary row. */
  afterTax: number[];
  /** With a draft: the top of the spending stack (percent), as a dashed ghost. */
  draftSpentShare?: number[];
  /** With a draft: the Saved share (percent), for the readout's ghost row. */
  draftSavedShare?: number[];
  range: RangeKey;
  onRange(range: RangeKey): void;
  todayYear: number;
  /** The app-wide pinned year. */
  focusYear: number | null;
  onFocusYear(year: number | null): void;
  /** Reports the hovered year up so the donut and envelope rows can follow. */
  onHoverYear(year: number | null): void;
  /** The year the page is showing: hover, else the pin, else its default. */
  shownYear: number;
  agesFor?(year: number): string | undefined;
  danger?: DangerBand;
  /** "/mo" or "/yr": the unit of `afterTax` and of the Short pill. */
  perLabel: string;
  height: number;
  label: string;
  actions?: ReactNode;
  compactRange?: boolean;
}) {
  const i = years.indexOf(shownYear);

  const hasFromSavings = fromSavings.some((v) => v > 0.5);
  const hasUnfunded = unfunded.some((v) => v > 0.5);
  // V5-REVIEW-3 m3: the half below zero holds From savings and/or Unfunded, so
  // name only what is actually drawn ("Paid from savings" was wrong over money
  // nothing paid).
  // The label follows the visible window, so it never names money that is not
  // on screen.
  const win = rangeWindow(years, todayYear, range);
  const inWin = (v: number, idx: number) => v > 0.5 && years[idx] >= win.from && years[idx] <= win.to;
  const winFrom = fromSavings.some(inWin);
  const winUnfunded = unfunded.some(inWin);
  const lowerLabel = winFrom && winUnfunded ? 'From savings · Unfunded' : winUnfunded ? 'Unfunded' : 'From savings';
  const series = useMemo<ChartSeries[]>(
    () => [
      ...layers.map((l): ChartSeries => ({ id: l.key, label: l.label, color: l.color, values: l.values, kind: 'area' })),
      ...(hasFromSavings
        ? [
            {
              id: 'from-savings',
              label: 'From savings',
              color: FROM_SAVINGS_COLOR,
              kind: 'area',
              overlay: true,
              values: fromSavings.map((v) => -v),
              fillTo: fromSavings.map(() => 0),
              fillOpacity: 0.85,
              // No stroke: it would run along 0 through every surplus year.
              lineWidth: 0,
              activeDot: false,
            } satisfies ChartSeries,
          ]
        : []),
      // Below From savings, and a separate shape from it: money nothing paid.
      // The chart's danger band is the hatch (it covers exactly
      // `health.shortYears`); this area wears the danger red over it at low
      // opacity so the hatch reads through, and the line gives it an edge.
      ...(hasUnfunded
        ? [
            {
              id: 'unfunded',
              label: 'Unfunded',
              color: UNFUNDED_COLOR,
              kind: 'area',
              overlay: true,
              values: unfunded.map((v, i) => -((fromSavings[i] ?? 0) + v)),
              fillTo: fromSavings.map((v) => -v),
              // V5-REVIEW-3 m3: a stronger fill than the backdrop hatch, and no
              // stroke at all. A stroke runs along 0 through every surplus year
              // (the series is 0 there), reading as a danger line where nothing
              // is wrong; the red area's own edge is enough.
              fillOpacity: 0.4,
              lineWidth: 0,
              activeDot: false,
            } satisfies ChartSeries,
          ]
        : []),
    ],
    [layers, fromSavings, unfunded, hasFromSavings, hasUnfunded],
  );
  const ghost = useMemo<ChartSeries | undefined>(
    () => (draftSpentShare ? { id: 'draft', label: 'With your change', color: 'var(--ink)', values: draftSpentShare, dashed: true } : undefined),
    [draftSpentShare],
  );

  const drawn = i >= 0 ? (fromSavings[i] ?? 0) : 0;
  const unpaid = i >= 0 ? (unfunded[i] ?? 0) : 0;
  const into = i >= 0 ? (intoSavings[i] ?? 0) : 0;

  const secondary: ReadoutItem[] =
    i < 0
      ? []
      : [
          { id: 'after-tax', label: 'After tax', color: 'var(--muted-light)', value: money(afterTax[i] ?? 0) },
          ...layers
            // Plain Saved is the headline answer, so it is not repeated here.
            .filter((l) => (l.values[i] ?? 0) >= 0.5 && !(l.key === 'saved' && into < 0.5))
            // In a gap year the Saved layer is what was still set aside on purpose.
            .map((l) => ({ id: l.key, label: l.key === 'saved' && into >= 0.5 ? 'Saved on purpose' : l.label, color: l.color, value: pct(l.values[i]) })),
          ...(drawn >= 0.5 ? [{ id: 'from-savings', label: 'From savings', color: FROM_SAVINGS_COLOR, value: pct(drawn) }] : []),
          ...(unpaid >= 0.5 ? [{ id: 'unfunded', label: '✗ Unfunded', color: UNFUNDED_COLOR, value: pct(unpaid) }] : []),
          ...(draftSavedShare ? [{ id: 'draft', label: 'Saved, with your change', color: 'var(--ink)', value: pct(draftSavedShare[i] ?? 0), dashed: true }] : []),
        ];

  // The chart's own answer for the year (V5-REVIEW-2 N9), in the order of
  // seriousness: unfunded money, then a real drawdown, then plain saving.
  // Non-breaking spaces so the figure's per-character spans keep them.
  const nb = (text: string) => text.replace(/ /g, '\u00A0');
  const answer =
    i < 0 ? '–' : unpaid >= 0.5 ? nb(`✗ Unfunded ${pct(unpaid)}`) : drawn >= 0.5 ? nb(`From savings ${pct(drawn)}`) : nb(`Saved ${pct(saved[i] ?? 0)}`);

  // "Short" only where the plan genuinely is (health.shortYears, via the band's
  // `years`); a drawdown year that savings cover is "From savings", not short.
  const isShort = !!danger?.years?.includes(shownYear);
  const shortAmount = isShort ? danger!.shortFor?.(shownYear) : undefined;

  return (
    <div className="ns-bgt-cols">
      <ChartReadout
        label={label}
        labelText="Where each dollar goes"
        value={answer}
        yearLabel={String(shownYear)}
        ages={agesFor?.(shownYear)}
        secondary={secondary}
        short={isShort}
        shortAmount={shortAmount && shortAmount > 0 ? money(shortAmount) : undefined}
        shortWord={shortAmount && shortAmount > 0 ? 'Short' : 'Overdrawn'}
        shortUnit={perLabel}
        actions={
          <>
            {actions}
            <RangePicker value={range} onChange={onRange} years={years} openingYear={todayYear} compact={compactRange} />
          </>
        }
      />
      <div className="ns-bgt-plot">
      <TimeSeriesChart
        years={years}
        series={series}
        stacked
        ghost={ghost}
        range={range}
        todayYear={todayYear}
        height={height}
        focusYear={focusYear}
        onFocusYear={onFocusYear}
        onHoverYear={onHoverYear}
        onRequestRange={onRange}
        danger={danger}
        yFormat={axisPct}
        readout={false}
        ariaLabel={`Where each dollar goes, by year: ${layers.map((l) => l.label).join(', ')}. Below zero: ${lowerLabel.toLowerCase().replace(' · ', ' or ')}.`}
      />
      {(winFrom || winUnfunded) && (
        <span className="ns-bgt-plot-lower" aria-hidden="true">
          {lowerLabel} ↓
        </span>
      )}
      </div>
    </div>
  );
}
