import type { YearSnapshot } from '@northstar/engine';
import { balanceStack } from '../ledger';
import { ChartLegend, MiniChart, type ChartSeries } from './MiniChart';

/**
 * Accounts' trajectory (docs/REDESIGN-V4.md §4.4): what net worth is made of,
 * year by year, above the balance sheet that itemises it. Asset classes stack
 * above zero in the same colours the "Where it sits" bar uses, debt hangs
 * below zero, and net worth is the one line through it all.
 */
export function BalanceTrajectory({
  years,
  stubYear,
}: {
  years: YearSnapshot[];
  stubYear?: { year: number; label: string };
}) {
  const stack = balanceStack(years);
  const hasDebt = stack.debt.some((v) => v < -1);

  const series: ChartSeries[] = [
    ...stack.layers.map((l) => ({
      label: l.label,
      color: l.color,
      values: l.upper,
      fill: true,
      fillTo: l.lower,
      fillOpacity: 0.78,
      lineWidth: 0,
    })),
    ...(hasDebt
      ? [{ label: 'Debt', color: 'var(--out)', values: stack.debt, fill: true, fillOpacity: 0.3, lineWidth: 0 }]
      : []),
    { label: 'Net worth', color: 'var(--data-nw)', values: stack.netWorth, lineWidth: 2.5 },
  ];

  return (
    <>
      <MiniChart years={stack.years} series={series} height={300} stubYear={stubYear} />
      <ChartLegend series={series.map(({ label, color }) => ({ label, color }))} />
    </>
  );
}
