import type { AccountClass, YearSnapshot } from '@northstar/engine';
import { DataTable, type TableRow } from './DataTable';
import { money } from '../format';

/** Presentation grouping for the balance sheet. */
const ASSET_GROUPS: { label: string; classes: AccountClass[] }[] = [
  { label: 'Cash', classes: ['cash'] },
  { label: 'Taxable investments', classes: ['taxableInvestment'] },
  { label: 'Tax-deferred investments', classes: ['taxDeferredInvestment'] },
  { label: 'Tax-free investments', classes: ['taxFreeInvestment'] },
  { label: 'Real estate', classes: ['realEstate'] },
  { label: 'Other assets', classes: ['otherAsset'] },
];

const LIABILITY_GROUPS: { label: string; classes: AccountClass[] }[] = [
  { label: 'Mortgage', classes: ['mortgage'] },
  { label: 'Loans', classes: ['loan'] },
  { label: 'Credit cards', classes: ['creditCard'] },
];

export function AccountsTab({ window }: { window: YearSnapshot[] }) {
  const years = window.map((y) => y.year);
  const rows: TableRow[] = [];

  rows.push({
    key: 'networth',
    kind: 'total',
    label: 'Net worth',
    cells: window.map((y) => money(y.netWorth)),
  });

  rows.push({
    key: 'assets',
    kind: 'group',
    label: 'Assets',
    cells: window.map((y) => money(y.assets)),
  });
  for (const group of ASSET_GROUPS) {
    const cells = window.map((y) => sumClass(y, group.classes, false));
    if (cells.every((v) => Math.abs(v) < 1)) continue;
    rows.push({
      key: `a-${group.label}`,
      kind: 'child',
      label: group.label,
      cells: cells.map(money),
    });
  }

  const hasLiabilities = window.some((y) => y.liabilities > 1);
  rows.push({
    key: 'liabilities',
    kind: 'group',
    label: 'Liabilities',
    cells: window.map((y) => money(y.liabilities)),
  });
  if (hasLiabilities) {
    for (const group of LIABILITY_GROUPS) {
      const cells = window.map((y) => sumClass(y, group.classes, true));
      if (cells.every((v) => Math.abs(v) < 1)) continue;
      rows.push({
        key: `l-${group.label}`,
        kind: 'child',
        label: group.label,
        cells: cells.map(money),
      });
    }
  }

  return <DataTable caption="Balance sheet" years={years} rows={rows} />;
}

function sumClass(snapshot: YearSnapshot, classes: AccountClass[], liability: boolean): number {
  return snapshot.accounts
    .filter((a) => a.isLiability === liability && classes.includes(a.accountClass))
    .reduce((total, a) => total + a.close, 0);
}
