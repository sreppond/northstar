import type { PlanResult } from '@northstar/engine';
import { savedThisYear, savingsRatePercent, spendingThisYear } from './ledger';

/**
 * The Reports lens: every plan-year reduced to one row of numbers already
 * computed elsewhere (`YearSnapshot`'s own totals) — a spreadsheet-style
 * surface for a user who wants the underlying figures rather than a chart's
 * reading of them. Columns are deliberately limited to what `runPlan`
 * already outputs; nothing here computes anything new.
 */
export interface ExploreRow {
  year: number;
  netWorth: number;
  income: number;
  /** Living expenses + event costs — contributions excluded, same as
      `ledger.ts`'s `spendingThisYear` (docs/MATH.md "Savings rate and
      spending", W3#5). Before that fix this was the raw `totalExpenses`,
      which STILL included paycheck/allocation contributions — the exact
      mismatch the review found between this column and Cash Flow's
      "Expenses" stat, which already excluded them via `netCashFlow`. */
  expenses: number;
  taxes: number;
  /** Contributions ÷ income — deliberately named for what it actually
      measures (S5), not "savings rate": that label belongs to `savingsRate`
      below, a DIFFERENT figure (`ledger.ts`'s `savingsRatePercent`, the one
      shared definition used by Overview and Cash Flow too). The two aren't
      interchangeable — savings also counts whatever's left over after
      contributions (a surplus swept to cash, say), contribution rate
      doesn't — so this stays its own column rather than silently reusing
      either the other's number or its label. */
  contributionRatePercent: number;
  contributions: number;
  withdrawals: number;
  /** Income − spending, contributions counted as saved — `ledger.ts`'s
      `savedThisYear` / `savingsRatePercent`, the same definition Overview's
      and Cash Flow's "Savings rate" stats already read off. */
  saved: number;
  savingsRatePercent: number;
}

export function buildExploreRows(result: PlanResult): ExploreRow[] {
  return result.years.map((snapshot) => {
    const contributions = snapshot.accounts.reduce((sum, a) => sum + a.contributions, 0);
    const withdrawals = snapshot.accounts.reduce((sum, a) => sum + a.withdrawals, 0);
    return {
      year: snapshot.year,
      netWorth: snapshot.netWorth,
      income: snapshot.totalIncome,
      expenses: spendingThisYear(snapshot),
      taxes: snapshot.totalTaxes,
      contributionRatePercent: snapshot.totalIncome > 0 ? (contributions / snapshot.totalIncome) * 100 : 0,
      contributions,
      withdrawals,
      saved: savedThisYear(snapshot),
      savingsRatePercent: savingsRatePercent(snapshot) ?? 0,
    };
  });
}

export const EXPLORE_COLUMNS: { key: keyof ExploreRow; label: string; percent?: boolean }[] = [
  { key: 'year', label: 'Year' },
  { key: 'netWorth', label: 'Net Worth' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'contributionRatePercent', label: 'Contribution Rate', percent: true },
  { key: 'contributions', label: 'Contributions' },
  { key: 'withdrawals', label: 'Withdrawals' },
  { key: 'saved', label: 'Saved' },
  { key: 'savingsRatePercent', label: 'Savings Rate', percent: true },
];

// CSV/JSON only. Every Explore value is a plain finite number — never text a
// delimiter or quote could appear in — so no CSV-escaping is needed here.
export function exploreRowsToCsv(rows: ExploreRow[]): string {
  const header = EXPLORE_COLUMNS.map((c) => c.label).join(',');
  const lines = rows.map((row) => EXPLORE_COLUMNS.map((c) => String(row[c.key])).join(','));
  return [header, ...lines].join('\n');
}

export function exploreRowsToJson(rows: ExploreRow[]): string {
  return JSON.stringify(rows, null, 2);
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
