import { useState, type ReactNode } from 'react';
import { ChartReadout, RangePicker, TimeSeriesChart, type ChartSeries, type DangerBand, type ReadoutItem, type RangeKey } from '../charts';
import { money } from '../format';

export interface ColumnLayer {
  key: string;
  label: string;
  color: string;
  /** Spending per year, already in the unit the page shows (/mo or /yr). */
  values: number[];
}

/**
 * Budget by year (docs/REDESIGN-V5.md §5.3, §6): one column per year on the
 * kit's stacked column kind, stacked by whose spending it is, under a line
 * for after-tax income — the gap between a column's top and the line is what
 * is left to save. Scrub to read a year, click to pin it for the whole page.
 *
 * The readout is this component's own rather than the chart's, because the
 * year it falls back to when nothing is hovered is the PAGE's year (the
 * pinned one, or its default), not the window's last year — the donut above
 * and the columns below must never disagree about which year they show.
 */
export function BudgetColumns({
  years,
  layers,
  afterTax,
  draft,
  range,
  onRange,
  todayYear,
  focusYear,
  onFocusYear,
  shownYear,
  agesFor,
  danger,
  height,
  label,
  actions,
}: {
  years: number[];
  layers: ColumnLayer[];
  afterTax: number[];
  /** Total spending per year if the current draft is kept; drawn as the ghost line. */
  draft?: number[];
  range: RangeKey;
  onRange(range: RangeKey): void;
  todayYear: number;
  /** The app-wide pinned year. */
  focusYear: number | null;
  onFocusYear(year: number | null): void;
  /** The year the page is showing: the pin, else its default. */
  shownYear: number;
  agesFor?(year: number): string | undefined;
  danger?: DangerBand;
  height: number;
  label: string;
  actions?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const year = hover ?? shownYear;
  const i = years.indexOf(year);

  const series: ChartSeries[] = [
    ...layers.map((l): ChartSeries => ({ id: l.key, label: l.label, color: l.color, values: l.values, kind: 'column' })),
    { id: 'after-tax', label: 'After-tax income', color: 'var(--in)', values: afterTax, kind: 'line', overlay: true },
  ];
  const ghost: ChartSeries | undefined = draft ? { id: 'draft', label: 'With your change', color: 'var(--ink)', values: draft, dashed: true } : undefined;

  const total = i >= 0 ? layers.reduce((sum, l) => sum + (l.values[i] ?? 0), 0) : 0;
  const secondary: ReadoutItem[] =
    i < 0
      ? []
      : [
          ...layers.filter((l) => (l.values[i] ?? 0) > 0.5).map((l) => ({ id: l.key, label: l.label, color: l.color, value: money(l.values[i]) })),
          { id: 'after-tax', label: 'After tax', color: 'var(--in)', value: money(afterTax[i] ?? 0) },
          ...(draft ? [{ id: 'draft', label: 'With your change', color: 'var(--ink)', value: money(draft[i] ?? 0), dashed: true }] : []),
        ];

  const dTo = danger ? (danger.to ?? Infinity) : 0;
  const isShort = !!danger && year >= danger.from && year <= dTo;
  const shortAmount = isShort ? danger!.shortFor?.(year) : undefined;

  return (
    <div className="ns-bgt-cols">
      <ChartReadout
        label={label}
        value={i >= 0 ? money(total) : '–'}
        yearLabel={String(year)}
        ages={agesFor?.(year)}
        secondary={secondary}
        short={isShort}
        shortAmount={shortAmount && shortAmount > 0 ? money(shortAmount) : undefined}
        actions={
          <>
            {actions}
            <RangePicker value={range} onChange={onRange} years={years} openingYear={todayYear} />
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
        onHoverYear={setHover}
        onRequestRange={onRange}
        danger={danger}
        readout={false}
        ariaLabel="Monthly spending by year, stacked by owner, under after-tax income"
      />
    </div>
  );
}
