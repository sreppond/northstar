import type { ReactNode } from 'react';
import { TimeSeriesChart } from '../charts';
import { money } from '../format';

/**
 * "How much is the SEPP I could begin taking that year?" (docs/REDESIGN-V4.md
 * §4.8, rebuilt on the v5 kit, docs/REDESIGN-V5.md §5.5): one column per start
 * year, its height the largest yearly payment the method allows on the balance
 * the account would have by then.
 *
 * It is the kit's column kind, so hovering a column reads that start year's
 * maximum in the readout above, and a click (or ←/→) selects it. The selected
 * year is the pin: the kit draws it as the pinned line and dims the other
 * columns, the same "this one" language as every other chart. Selecting is
 * page state (the draft), not the app-wide focus year, so it is controlled
 * here rather than read from the context.
 */
export function SeppBars({
  options: allOptions,
  selectedYear,
  onSelect,
  onHoverYear,
  height,
  actions,
}: {
  options: { startYear: number; age: number; annualPayment: number; lockedUntil?: number }[];
  selectedYear: number;
  onSelect(year: number): void;
  onHoverYear?(year: number | null): void;
  height: number;
  /** The account and method controls, top right of the readout. */
  actions?: ReactNode;
}) {
  if (allOptions.length === 0) return null;
  // V5-REVIEW-2 N17: the x-domain ends at the last bar's year (+0.5, the kit's
  // column padding). Start years past the last non-empty bar are zero-height, and
  // used to leave years of empty axis; the chosen year always stays.
  let lastBar = -1;
  allOptions.forEach((o, i) => {
    if (o.annualPayment > 0.5 || o.startYear === selectedYear) lastBar = i;
  });
  const options = allOptions.slice(0, Math.max(0, lastBar) + 1);
  const byYear = new Map(options.map((o) => [o.startYear, o]));

  return (
    <TimeSeriesChart
      years={options.map((o) => o.startYear)}
      series={[{ id: 'sepp', label: 'Largest SEPP', color: 'var(--data-nw)', kind: 'column', values: options.map((o) => o.annualPayment) }]}
      height={height}
      onHoverYear={onHoverYear}
      focusYear={selectedYear}
      // Clicking the selected year again would unpin it; a start year is
      // always chosen, so only a real year counts.
      onFocusYear={(year) => {
        if (year !== null) onSelect(year);
      }}
      readout={{
        label: 'Largest SEPP if you start in',
        format: (v) => `${money(v)}/yr`,
        agesFor: (year) => {
          const o = byYear.get(year);
          return o ? `Age ${o.age}${o.lockedUntil !== undefined ? ` · locked until ${o.lockedUntil}` : ''}` : undefined;
        },
        actions,
      }}
      yFormat={(v) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`)}
      ariaLabel="Largest SEPP payment by start year. Arrow keys move between start years; selecting one previews it."
    />
  );
}
