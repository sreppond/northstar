import { useMemo, useState } from 'react';
import { usePlanner } from '../PlannerContext';
import { MiniChart } from '../views/MiniChart';
import { Cell, type CellMagnitude } from '../tabs/DataTable';
import { money, percent, planMetaLine, tableMoney, tablePercent } from '../format';
import { stubYearLabel } from '../ledger';
import {
  buildExploreRows,
  downloadTextFile,
  EXPLORE_COLUMNS,
  exploreRowsToCsv,
  exploreRowsToJson,
  type ExploreRow,
} from '../reports';
import { Page, PageHeader, SectionCard, Segmented, Stat, StatStrip } from '../ui';

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
  const { plan, result, stored } = usePlanner();
  const [tab, setTab] = useState<ReportsTab>('explore');

  const rows = useMemo(() => buildExploreRows(result), [result]);
  const hasPlan = plan.accounts.length > 0 || plan.events.length > 1;
  const stub = stubYearLabel(plan.settings.startYear, plan.settings.startYear, plan.settings.asOfDate);
  const stubYear = plan.settings.startYear;

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
          <StatStrip>
            <Stat
              size="xl"
              label="Net worth at horizon"
              value={money(summary.netWorthAtHorizon)}
              explain={`Projected net worth in the plan's final modeled year, ${rows.at(-1)?.year ?? result.endYear}.`}
            />
            <Stat
              label="Avg. contribution rate"
              value={percent(summary.avgContributionRate, 0)}
              explain="Every year's contributions ÷ income, averaged across the whole plan — a different figure than Cash Flow's savings rate, which also nets out withdrawals spent and debt paid down."
            />
            <Stat
              label="Total taxes"
              value={money(summary.totalTaxes)}
              explain="Every projected year's income and capital-gains taxes, summed across the whole plan."
            />
            <Stat
              label="Peak withdrawal year"
              value={summary.peakWithdrawalRow ? String(summary.peakWithdrawalRow.year) : '—'}
              sub={summary.peakWithdrawalRow ? money(summary.peakWithdrawalRow.withdrawals) : 'None modeled'}
              explain="The single year with the largest total account withdrawals anywhere in the plan."
            />
          </StatStrip>

          <SectionCard
            title="Plan by year"
            actions={<Segmented options={TAB_OPTIONS} value={tab} onChange={(v) => setTab(v as ReportsTab)} size="sm" ariaLabel="View" />}
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
                      <tr key={row.year}>
                        {EXPLORE_COLUMNS.map((col) => {
                          if (col.key === 'year')
                            return (
                              <td key={col.key}>
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
                {PLOT_DEFINITIONS.map((p) => (
                  <div className="ns-plot-card" key={p.key}>
                    <div className="ns-section-title">{p.label}</div>
                    <MiniChart
                      height={150}
                      years={rows.map((r) => r.year)}
                      series={[{ label: p.label, color: p.color, values: rows.map((r) => r[p.key] as number) }]}
                      formatY={p.key === 'contributionRatePercent' ? (v) => `${Math.round(v)}%` : undefined}
                      stubYear={stub ? { year: stubYear, label: stub.short } : undefined}
                    />
                  </div>
                ))}
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
