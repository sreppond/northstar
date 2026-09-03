import type { PlanResult } from '@northstar/engine';

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
  expenses: number;
  taxes: number;
  savingsRatePercent: number;
  contributions: number;
  withdrawals: number;
}

export function buildExploreRows(result: PlanResult): ExploreRow[] {
  return result.years.map((snapshot) => {
    const contributions = snapshot.accounts.reduce((sum, a) => sum + a.contributions, 0);
    const withdrawals = snapshot.accounts.reduce((sum, a) => sum + a.withdrawals, 0);
    return {
      year: snapshot.year,
      netWorth: snapshot.netWorth,
      income: snapshot.totalIncome,
      expenses: snapshot.totalExpenses,
      taxes: snapshot.totalTaxes,
      savingsRatePercent: snapshot.totalIncome > 0 ? (contributions / snapshot.totalIncome) * 100 : 0,
      contributions,
      withdrawals,
    };
  });
}

export const EXPLORE_COLUMNS: { key: keyof ExploreRow; label: string; percent?: boolean }[] = [
  { key: 'year', label: 'Year' },
  { key: 'netWorth', label: 'Net Worth' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'savingsRatePercent', label: 'Savings Rate', percent: true },
  { key: 'contributions', label: 'Contributions' },
  { key: 'withdrawals', label: 'Withdrawals' },
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
