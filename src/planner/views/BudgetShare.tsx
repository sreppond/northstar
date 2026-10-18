import { useMemo, type ReactNode } from 'react';
import { ChartReadout, RangePicker, TimeSeriesChart, type ChartSeries, type DangerBand, type ReadoutItem, type RangeKey } from '../charts';
import { money } from '../format';

export interface ShareLayer {
  key: string;
  label: string;
  color: string;
  /** Percent of the year's money (0–100), one per year. They stack to 100. */
  values: number[];
}

const pct = (v: number) => `${Math.round(v)}%`;

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
 * envelopes fill the whole 100% (it is all spending), and the part that
 * savings paid for hangs BELOW zero in the orange "out" hue. Orange, not red:
 * drawing down is not being short; the hatched danger band alone says short.
 *
 * Hover previews that year for the whole page via `onHoverYear` (the donut
 * and envelope rows follow, F17); click pins it. The readout is this
 * component's own so its fallback year is the PAGE's year, not the window's.
 */
export function BudgetShare({
  years,
  layers,
  fromSavings,
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
  /** Percent of each year's base that savings paid for; plotted below zero. */
  fromSavings: number[];
  /** After-tax income per year in the page's unit, for the readout's big number. */
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
  const series = useMemo<ChartSeries[]>(
    () => [
      ...layers.map((l): ChartSeries => ({ id: l.key, label: l.label, color: l.color, values: l.values, kind: 'area' })),
      ...(hasFromSavings
        ? [
            {
              id: 'from-savings',
              label: 'From savings',
              color: 'var(--out)',
              kind: 'area',
              overlay: true,
              values: fromSavings.map((v) => -v),
              fillTo: fromSavings.map(() => 0),
              fillOpacity: 0.85,
              lineWidth: 1.5,
              activeDot: false,
            } satisfies ChartSeries,
          ]
        : []),
    ],
    [layers, fromSavings, hasFromSavings],
  );
  const ghost = useMemo<ChartSeries | undefined>(
    () => (draftSpentShare ? { id: 'draft', label: 'With your change', color: 'var(--ink)', values: draftSpentShare, dashed: true } : undefined),
    [draftSpentShare],
  );

  const drawn = i >= 0 ? (fromSavings[i] ?? 0) : 0;

  const secondary: ReadoutItem[] =
    i < 0
      ? []
      : [
          ...layers.filter((l) => (l.values[i] ?? 0) >= 0.5).map((l) => ({ id: l.key, label: l.label, color: l.color, value: pct(l.values[i]) })),
          ...(drawn >= 0.5 ? [{ id: 'from-savings', label: 'From savings', color: 'var(--out)', value: pct(drawn) }] : []),
          ...(draftSavedShare ? [{ id: 'draft', label: 'Saved, with your change', color: 'var(--ink)', value: pct(draftSavedShare[i] ?? 0), dashed: true }] : []),
        ];

  // "Short" only where the plan genuinely is (health.shortYears, via the band's
  // `years`); a drawdown year that savings cover is "From savings", not short.
  const isShort = !!danger?.years?.includes(shownYear);
  const shortAmount = isShort ? danger!.shortFor?.(shownYear) : undefined;

  return (
    <div className="ns-bgt-cols">
      <ChartReadout
        label={label}
        labelText="After tax"
        value={i >= 0 ? money(afterTax[i] ?? 0) : '–'}
        yearLabel={String(shownYear)}
        ages={agesFor?.(shownYear)}
        secondary={secondary}
        short={isShort}
        shortAmount={shortAmount && shortAmount > 0 ? money(shortAmount) : undefined}
        shortUnit={perLabel}
        actions={
          <>
            {actions}
            <RangePicker value={range} onChange={onRange} years={years} openingYear={todayYear} compact={compactRange} />
          </>
        }
      />
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
        yFormat={pct}
        readout={false}
        ariaLabel={`Where each after-tax dollar goes, by year: ${layers.map((l) => l.label).join(', ')}`}
      />
    </div>
  );
}
