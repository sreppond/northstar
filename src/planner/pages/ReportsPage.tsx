import { useMemo, useState } from 'react';
import { usePlanner } from '../PlannerContext';
import { MiniChart } from '../views/MiniChart';
import { Cell, type CellMagnitude } from '../tabs/DataTable';
import { percent, tableMoney } from '../format';
import {
  buildExploreRows,
  downloadTextFile,
  EXPLORE_COLUMNS,
  exploreRowsToCsv,
  exploreRowsToJson,
  type ExploreRow,
} from '../reports';

/** Expense-shaped columns get the "money out" hue; everything else (net
    worth, income, contributions, savings rate) reads as "money in" — the
    same income/cost convention the ledger tables use, just applied per
    COLUMN here since Reports transposes the ledger's axes (a row is a
    year, not a line item). `year` never gets a bar. */
const COST_COLUMNS = new Set<keyof ExploreRow>(['expenses', 'taxes', 'withdrawals']);

type ReportsTab = 'explore' | 'plots';

const PLOT_DEFINITIONS: { key: keyof ExploreRow; label: string; color: string }[] = [
  { key: 'netWorth', label: 'Net Worth', color: 'var(--data-nw)' },
  { key: 'income', label: 'Income', color: 'var(--in)' },
  { key: 'expenses', label: 'Expenses', color: 'var(--out)' },
  { key: 'taxes', label: 'Taxes', color: 'var(--out)' },
  { key: 'contributions', label: 'Contributions', color: 'var(--in)' },
  { key: 'withdrawals', label: 'Withdrawals', color: 'var(--cmp)' },
  { key: 'savingsRatePercent', label: 'Savings Rate', color: 'var(--in)' },
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

  function exportCsv() {
    downloadTextFile(`${fileSlug(stored.name)}-explore.csv`, exploreRowsToCsv(rows), 'text/csv');
  }
  function exportJson() {
    downloadTextFile(`${fileSlug(stored.name)}-explore.json`, exploreRowsToJson(rows), 'application/json');
  }

  return (
    <div className="ns-card ns-card-view">
      <div className="ns-view-head">
        <div className="ns-view-title">Reports</div>
        <p className="ns-view-sub">
          Every plan year as one row of figures, or the same numbers plotted individually — the spreadsheet view of
          what the rest of the app already computes.
        </p>
      </div>

      {!hasPlan ? (
        <div className="ns-view-empty">Add an account or an event to see reports.</div>
      ) : (
        <>
          <div className="ns-reports-toolbar">
            <button
              type="button"
              className={`ns-btn ns-btn-sm${tab === 'explore' ? ' ns-btn-primary' : ' ns-btn-ghost'}`}
              onClick={() => setTab('explore')}
            >
              Explore
            </button>
            <button
              type="button"
              className={`ns-btn ns-btn-sm${tab === 'plots' ? ' ns-btn-primary' : ' ns-btn-ghost'}`}
              onClick={() => setTab('plots')}
            >
              Plots
            </button>
            <div className="ns-reports-toolbar-spacer" />
            <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" onClick={exportCsv}>
              Export CSV
            </button>
            <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" onClick={exportJson}>
              Export JSON
            </button>
          </div>

          {tab === 'explore' ? (
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
                        if (col.key === 'year') return <td key={col.key}>{row.year}</td>;
                        const value = row[col.key] as number;
                        const max = columnMax.get(col.key) ?? 1;
                        const magnitude: CellMagnitude = {
                          fraction: Math.abs(value) / max,
                          tone: COST_COLUMNS.has(col.key) ? 'cost' : 'income',
                        };
                        return (
                          <td key={col.key}>
                            <Cell
                              value={col.percent ? percent(value) : tableMoney(value)}
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
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function fileSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}
