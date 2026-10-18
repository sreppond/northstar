import { useMemo, useState } from 'react';
import { usePlanner } from '../PlannerContext';
import { ChartReadout, RangePicker, TimeSeriesChart, type ReadoutItem } from '../charts';
import { Cell, type CellMagnitude } from '../tabs/DataTable';
import { money, percent, planMetaLine, tableMoney, tablePercent } from '../format';
import { stubYearLabel } from '../ledger';
import { agesLabel, dangerBand } from './netWorthData';
import {
  buildExploreRows,
  downloadTextFile,
  EXPLORE_COLUMNS,
  exploreRowsToCsv,
  exploreRowsToJson,
  type ExploreRow,
} from '../reports';
import { Page, PageHeader, SectionCard, Segmented } from '../ui';

/** Expense-shaped columns get the "money out" hue; everything else (net
    worth, income, contributions, savings rate) reads as "money in" — the
    same income/cost convention the ledger tables use, just applied per
    COLUMN here since Reports transposes the ledger's axes (a row is a
    year, not a line item). `year` never gets a bar. */
const COST_COLUMNS = new Set<keyof ExploreRow>(['expenses', 'taxes', 'withdrawals']);

type ReportsTab = 'explore' | 'plots';

const TAB_OPTIONS = [
  { value: 'explore', label: 'Table' },
  { value: 'plots', label: 'Charts' },
];

const PLOT_DEFINITIONS: { key: keyof ExploreRow; label: string; color: string }[] = [
  { key: 'netWorth', label: 'Net Worth', color: 'var(--data-nw)' },
  { key: 'income', label: 'Income', color: 'var(--in)' },
  { key: 'expenses', label: 'Expenses', color: 'var(--out)' },
  { key: 'taxes', label: 'Taxes', color: 'var(--out)' },
  { key: 'contributions', label: 'Contributions', color: 'var(--in)' },
  // M16: this was `--cmp` (the compared-PLAN hue) — a colour reserved for
  // "the other line in a comparison," which withdrawals are not. Money
  // leaving the accounts is a cost, same as Expenses/Taxes above.
  { key: 'withdrawals', label: 'Withdrawals', color: 'var(--out)' },
  { key: 'contributionRatePercent', label: 'Contribution Rate', color: 'var(--in)' },
];

/**
 * The spreadsheet-style counterpart to every chart elsewhere: every plan
 * year as one row of the figures `runPlan` already produces, plus CSV/JSON
 * export. A power-user surface, not a narrative one — nothing here reads
 * differently depending on what's selected or scrubbed elsewhere.
 */
export function ReportsPage() {
  const { plan, result, stored, health, focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
  const [tab, setTab] = useState<ReportsTab>('explore');

  const rows = useMemo(() => buildExploreRows(result), [result]);
  const hasPlan = plan.accounts.length > 0 || plan.events.length > 1;
  const stub = stubYearLabel(plan.settings.startYear, plan.settings.startYear, plan.settings.asOfDate);
  const stubYear = plan.settings.startYear;
  const years = useMemo(() => rows.map((r) => r.year), [rows]);
  const danger = useMemo(() => dangerBand(health, result), [health, result]);
  const shortYears = useMemo(() => new Set(health.shortYears), [health.shortYears]);

  // Scaled per COLUMN, across every row — the Reports equivalent of
  // DataTable's "scaled per row" rule, just transposed: here a column IS
  // the series (every year's Net Worth, say), so that's the set a single
  // year's bar should read against, not the whole table's mixed units.
  const columnMax = useMemo(() => {
    const max = new Map<keyof ExploreRow, number>();
    for (const col of EXPLORE_COLUMNS) {
      if (col.key === 'year') continue;
      max.set(col.key, Math.max(1, ...rows.map((r) => Math.abs(r[col.key] as number))));
    }
    return max;
  }, [rows]);

  const summary = useMemo(() => {
    const netWorthAtHorizon = rows.at(-1)?.netWorth ?? 0;
    const avgContributionRate = rows.length
      ? rows.reduce((s, r) => s + r.contributionRatePercent, 0) / rows.length
      : 0;
    const totalTaxes = rows.reduce((s, r) => s + r.taxes, 0);
    const peakWithdrawalRow = rows.reduce<ExploreRow | undefined>(
      (best, r) => (r.withdrawals > (best?.withdrawals ?? 0) ? r : best),
      undefined,
    );
    return { netWorthAtHorizon, avgContributionRate, totalTaxes, peakWithdrawalRow };
  }, [rows]);

  // The old stat strip's other three figures, as the readout's small row. The
  // swatch hues follow the table: money in is --in, money out is --out.
  const summaryItems: ReadoutItem[] = [
    { id: 'rate', label: 'Avg. contribution rate', color: 'var(--in)', value: percent(summary.avgContributionRate, 0) },
    { id: 'taxes', label: 'Total taxes', color: 'var(--out)', value: money(summary.totalTaxes) },
    {
      id: 'peak',
      label: 'Peak withdrawal year',
      color: 'var(--out)',
      value: summary.peakWithdrawalRow
        ? `${summary.peakWithdrawalRow.year} · ${money(summary.peakWithdrawalRow.withdrawals)}`
        : 'None modeled',
    },
  ];

  function exportCsv() {
    downloadTextFile(`${fileSlug(stored.name)}-explore.csv`, exploreRowsToCsv(rows), 'text/csv');
  }
  function exportJson() {
    downloadTextFile(`${fileSlug(stored.name)}-explore.json`, exploreRowsToJson(rows), 'application/json');
  }

  return (
    <Page>
      <PageHeader
        title="Reports"
        meta={planMetaLine(stored, result.endYear)}
        actions={
          hasPlan && (
            <>
              {/* S1: was `ns-btn-ghost` (no border), which reads as no
                  button at all in dark mode — bordered secondary, same as
                  "Edit assumptions" elsewhere. */}
              <button type="button" className="ns-btn ns-btn-sm" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="ns-btn ns-btn-sm" onClick={exportJson}>
                Export JSON
              </button>
            </>
          )
        }
      />

      {!hasPlan ? (
        <div className="ns-card">
          <div className="ns-view-empty">Add an account or an event to see reports.</div>
        </div>
      ) : (
        <>
          <section className="ns-rpt-hero" aria-label="Plan totals">
            <ChartReadout
              label="Net worth at horizon"
              value={money(summary.netWorthAtHorizon)}
              yearLabel={String(rows.at(-1)?.year ?? result.endYear)}
              secondary={summaryItems}
            />
          </section>

          <SectionCard
            title="Plan by year"
            actions={
              <div className="ns-rpt-actions">
                {tab === 'plots' && <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={result.startYear} />}
                <Segmented options={TAB_OPTIONS} value={tab} onChange={(v) => setTab(v as ReportsTab)} size="sm" ariaLabel="View" />
              </div>
            }
            flush={tab === 'explore'}
          >
            {tab === 'explore' ? (
              // S5: dropped the 560px inner scroll — a plan's full year range
              // (~20-60 rows) reads fine as one plain scroll of the page,
              // and a sticky-inside-a-fixed-height panel hid rows with no
              // affordance that more existed below the fold.
              <div className="ns-table-scroll">
                <table className="ns-datatable">
                  <thead>
                    <tr>
                      {EXPLORE_COLUMNS.map((col) => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.year} className={shortYears.has(row.year) ? 'ns-col-danger' : undefined}>
                        {EXPLORE_COLUMNS.map((col) => {
                          if (col.key === 'year')
                            return (
                              <td key={col.key} className={shortYears.has(row.year) ? 'ns-rpt-short-year' : undefined}>
                                {shortYears.has(row.year) && (
                                  <span className="ns-year-short" role="img" aria-label="Plan runs short this year">
                                    ✗
                                  </span>
                                )}
                                {row.year}
                                {row.year === stubYear && stub && <div className="ns-table-year-sub">{stub.short}</div>}
                              </td>
                            );
                          const value = row[col.key] as number;
                          const max = columnMax.get(col.key) ?? 1;
                          const magnitude: CellMagnitude = {
                            fraction: Math.abs(value) / max,
                            tone: COST_COLUMNS.has(col.key) ? 'cost' : 'income',
                          };
                          return (
                            <td key={col.key}>
                              <Cell
                                value={col.percent ? tablePercent(value) : tableMoney(value)}
                                magnitude={magnitude}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ns-plot-grid">
                {PLOT_DEFINITIONS.map((p) => {
                  const percentFormat = p.key === 'contributionRatePercent';
                  return (
                    <div className="ns-plot-card" key={p.key}>
                      <TimeSeriesChart
                        years={years}
                        series={[
                          {
                            id: p.key,
                            label: p.label,
                            color: p.color,
                            kind: 'area',
                            values: rows.map((r) => r[p.key] as number),
                          },
                        ]}
                        range={chartRange}
                        todayYear={result.startYear}
                        height={190}
                        focusYear={focusYear}
                        onFocusYear={setFocusYear}
                        danger={danger}
                        onRequestRange={setChartRange}
                        yFormat={percentFormat ? (v) => `${Math.round(v)}%` : undefined}
                        readout={{
                          label: p.label,
                          size: 'compact',
                          format: percentFormat ? (v) => `${v.toFixed(1)}%` : undefined,
                          agesFor: (year) => agesLabel(plan, result.years.find((y) => y.year === year)),
                        }}
                        ariaLabel={`${p.label} by year`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </Page>
  );
}

function fileSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}
