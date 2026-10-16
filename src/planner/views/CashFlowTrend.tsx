import type { YearSnapshot } from '@northstar/engine';
import { savedThisYear, spendingThisYear } from '../ledger';
import { ChartLegend, MiniChart, type ChartSeries } from './MiniChart';

/**
 * Cash Flow's chart (docs/REDESIGN-V4.md §0 #7): income against spending
 * (taxes included) every year, with what's left as the filled savings line —
 * so the year a down payment or a new kid pushes savings below zero is the
 * dip you see first, instead of a figure in one year's Sankey.
 */
export function CashFlowTrend({
  years,
  markYear,
  stubYear,
}: {
  years: YearSnapshot[];
  markYear?: number;
  stubYear?: { year: number; label: string };
}) {
  const series: ChartSeries[] = [
    { label: 'Income', color: 'var(--in)', values: years.map((y) => y.totalIncome) },
    {
      label: 'Spending + taxes',
      color: 'var(--out)',
      values: years.map((y) => spendingThisYear(y) + y.totalTaxes),
    },
    {
      label: 'Saved',
      color: 'var(--data-nw)',
      values: years.map((y) => savedThisYear(y)),
      fill: true,
      fillOpacity: 0.12,
    },
  ];

  return (
    <>
      <MiniChart
        years={years.map((y) => y.year)}
        series={series}
        height={280}
        markYear={markYear}
        stubYear={stubYear?.year === years[0]?.year ? stubYear : undefined}
      />
      <ChartLegend series={series.map(({ label, color }) => ({ label, color }))} />
    </>
  );
}
