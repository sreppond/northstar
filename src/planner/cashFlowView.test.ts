import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan } from '@northstar/engine';
import {
  cashFlowTree,
  monthlyColumns,
  monthsInYear,
  waterfallBars,
  yearFlow,
  type CashFlowTree,
  type FlowNode,
  type FlowRows,
} from './cashFlowView';
import { toHouseholdModel } from './household';
import { healthyPlan, kitchenSinkPlan, runsDryPlan } from './planFixtures';
import { savedThisYear, spendingThisYear } from './ledger';
import { SAMPLE_PLANS } from './samplePlan';
import { spendingGroups } from './spendingGroups';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmt = (v: number) => `$${Math.round(v)}`;

const plans: [string, Plan][] = [
  ['sample (house forecast)', SAMPLE_PLANS[0]],
  ['sample (retirement forecast)', SAMPLE_PLANS[1]],
  ['sample on the household model', toHouseholdModel(SAMPLE_PLANS[1]).plan],
  ['kitchen sink', kitchenSinkPlan()],
  ['runs dry', runsDryPlan()],
  ['healthy', healthyPlan()],
];

describe('yearFlow reconciles with the engine totals', () => {
  it.each(plans)('%s', (_name, plan) => {
    for (const snapshot of runPlan(plan).years) {
      const f = yearFlow(plan, snapshot);
      expect(f.gross).toBeCloseTo(snapshot.totalIncome, 4);
      expect(f.incomeTax + f.withdrawalTax).toBeCloseTo(snapshot.totalTaxes, 4);
      expect(f.afterTax).toBeCloseTo(snapshot.totalIncome - (snapshot.totalTaxes - f.withdrawalTax), 4);
      // Spending plus what was set aside is every dollar of expenses.
      expect(f.spent + f.savedOnPurpose).toBeCloseTo(snapshot.totalExpenses, 4);
      expect(f.spent).toBeCloseTo(spendingThisYear(snapshot), 4);
      // ...so what is left is what the ledger already calls saved.
      expect(f.saved).toBeCloseTo(savedThisYear(snapshot), 4);
      expect(f.afterTax - f.withdrawalTax - f.spent - f.savedOnPurpose).toBeCloseTo(snapshot.netCashFlow, 4);
    }
  });
});

describe('waterfallBars', () => {
  const plan = healthyPlan();
  const snapshot = runPlan(plan).years[3];

  it('walks gross to saved, each delta landing on the next running total', () => {
    const bars = waterfallBars(yearFlow(plan, snapshot), fmt);
    expect(bars.map((b) => b.key)[0]).toBe('gross');
    expect(bars.some((b) => b.key === 'afterTax')).toBe(true);
    const deltas = bars.filter((b) => b.kind === 'delta');
    for (const d of deltas) expect(d.to).toBeCloseTo(d.from + d.amount, 6);
    const last = bars[bars.length - 1];
    expect(last.key).toBe('saved');
    expect(last.to).toBeCloseTo(savedThisYear(snapshot), 4);
  });

  it('ends a short year on Unfunded, and the pieces add up to the draw-down', () => {
    const dry = runsDryPlan();
    const short = runPlan(dry).years.find((y) => y.unfundedShortfall)!;
    expect(short).toBeDefined();
    const flow = yearFlow(dry, short);
    const bars = waterfallBars(flow, fmt);
    const last = bars[bars.length - 1];
    expect(last.key).toBe('unfunded');
    expect(last.tone).toBe('danger');
    expect(last.to).toBeCloseTo(flow.saved, 4);
    expect(-last.amount).toBeLessThanOrEqual(short.unfundedShortfall! + 1e-6);
  });

  it('a funded year never shows Unfunded', () => {
    const dry = runsDryPlan();
    const funded = runPlan(dry).years.find((y) => !y.unfundedShortfall)!;
    expect(waterfallBars(yearFlow(dry, funded), fmt).some((b) => b.key === 'unfunded')).toBe(false);
  });
});

describe('cashFlowTree', () => {
  const walk = (n: FlowNode, f: (n: FlowNode) => void) => {
    f(n);
    n.children?.forEach((c) => walk(c, f));
  };

  it.each(plans)('every group equals the sum of its children (%s)', (_name, plan) => {
    const snapshots = runPlan(plan).years;
    const tree = cashFlowTree(plan, snapshots);
    const roots = [tree.income, tree.spending, tree.saving].filter((n): n is FlowNode => !!n);
    for (const root of roots) {
      walk(root, (node) => {
        if (!node.children?.length) return;
        // A source's tax is shown as a deduction under its net, not summed into it.
        if (node.key.startsWith('income:')) return;
        node.values.forEach((v, i) => {
          expect(sum(node.children!.map((c) => c.values[i]))).toBeCloseTo(v, 3);
        });
      });
    }
    // A source's gross less its tax is its net.
    for (const source of tree.income.children ?? []) {
      const [gross, tax] = source.children!;
      source.values.forEach((v, i) => expect(gross.values[i] - tax.values[i]).toBeCloseTo(v, 4));
    }
  });

  it.each(plans)('totals tie to the snapshots (%s)', (_name, plan) => {
    const snapshots = runPlan(plan).years;
    const tree = cashFlowTree(plan, snapshots);
    snapshots.forEach((s, i) => {
      const gross = sum((tree.income.children ?? []).map((c) => c.children![0].values[i]));
      const tax = sum((tree.income.children ?? []).map((c) => c.children![1].values[i]));
      const withdrawalTax = tree.withdrawals?.children?.find((c) => c.key === 'wd:tax')?.values[i] ?? 0;
      expect(gross).toBeCloseTo(s.totalIncome, 3);
      expect(tax + withdrawalTax).toBeCloseTo(s.totalTaxes, 3);
      expect(tree.income.values[i]).toBeCloseTo(s.totalIncome - tax, 3);
      expect(tree.spending.values[i] + (tree.saving?.values[i] ?? 0)).toBeCloseTo(s.totalExpenses, 3);
      expect(tree.saved[i]).toBeCloseTo(savedThisYear(s), 3);
    });
  });

  it('agrees with spendingGroups: each group and each person under it', () => {
    const plan = kitchenSinkPlan();
    const snapshots = runPlan(plan).years;
    const tree = cashFlowTree(plan, snapshots);
    snapshots.forEach((s, i) => {
      for (const g of spendingGroups(plan, s)) {
        if (g.key === 'saving') continue;
        const node = tree.spending.children!.find((c) => c.key === `spend:${g.key}`)!;
        expect(node.values[i]).toBeCloseTo(g.total, 4);
        if (g.key === 'kids' || g.key === 'personal') {
          for (const part of g.parts.filter((p) => p.ownerId)) {
            const person = node.children!.find((c) => c.key === `spend:${g.key}:person:${part.ownerId}`)!;
            expect(person.values[i]).toBeCloseTo(part.amount, 4);
            expect(person.label).toBe(part.label);
          }
        }
      }
    });
  });

  it('has an Unfunded row only when some year is short', () => {
    expect(cashFlowTree(healthyPlan(), runPlan(healthyPlan()).years).unfunded).toBeUndefined();
    const dry = runsDryPlan();
    const tree = cashFlowTree(dry, runPlan(dry).years);
    expect(tree.unfunded).toBeDefined();
    expect(Math.max(...tree.unfunded!)).toBeGreaterThan(0);
  });
});

describe('monthsInYear', () => {
  it('is 12 for a full year, and for any year but the first', () => {
    expect(monthsInYear(2027, 2026, '2026-09-25')).toBe(12);
    expect(monthsInYear(2026, 2026)).toBe(12);
    expect(monthsInYear(2026, 2026, '2026-01-01')).toBe(12);
  });
  it('prorates the stub first year', () => {
    // Sep 25 -> Dec 31 is 98 of 365 days.
    expect(monthsInYear(2026, 2026, '2026-09-25')).toBeCloseTo((12 * 98) / 365, 6);
    expect(monthsInYear(2026, 2026, '2026-07-02')).toBeCloseTo((12 * 183) / 365, 6);
  });
});

describe('monthlyColumns', () => {
  const asOf = (plan: Plan, date: string): Plan => ({ ...plan, settings: { ...plan.settings, asOfDate: date } });
  // The plan's first year, with the as-of date partway through it.
  const firstYear = (plan: Plan) => asOf(plan, `${plan.settings.startYear}-10-30`);
  const cases: [string, Plan][] = [
    ...plans,
    ...plans.map(([name, plan]): [string, Plan] => [`${name}, as of Oct 30`, firstYear(plan)]),
  ];

  const flatten = (n: FlowNode): FlowNode[] => [n, ...(n.children ?? []).flatMap(flatten)];
  const rowsOf = (t: FlowRows) =>
    [t.income, t.spending, ...(t.saving ? [t.saving] : []), ...(t.withdrawals ? [t.withdrawals] : [])].flatMap(flatten);
  const isOneTime = (key: string) => key === 'spend:oneTime' || key.startsWith('spend:oneTime:');

  /** Every year of a plan, with its tree and the plan that built it. */
  function eachYear(plan: Plan, check: (tree: CashFlowTree, yi: number) => void) {
    const tree = cashFlowTree(plan, runPlan(plan).years);
    tree.years.forEach((_, yi) => check(tree, yi));
  }

  it.each(cases)('each row’s twelve months sum to its year value (%s)', (_name, plan) => {
    eachYear(plan, (tree, yi) => {
      const m = monthlyColumns(tree, yi, plan);
      expect(m.months).toHaveLength(12);
      const yearRows = rowsOf(tree);
      const monthRows = rowsOf(m);
      expect(monthRows.map((r) => r.key)).toEqual(yearRows.map((r) => r.key));
      yearRows.forEach((row, ri) => {
        expect(monthRows[ri].values).toHaveLength(12);
        expect(Math.abs(sum(monthRows[ri].values) - row.values[yi])).toBeLessThan(0.01);
      });
      expect(Math.abs(sum(m.saved) - tree.saved[yi])).toBeLessThan(0.01);
      if (tree.unfunded) expect(Math.abs(sum(m.unfunded!) - tree.unfunded[yi])).toBeLessThan(0.01);
    });
  });

  it.each(cases)('saved is income less investment tax less spending, month by month (%s)', (_name, plan) => {
    eachYear(plan, (tree, yi) => {
      const m = monthlyColumns(tree, yi, plan);
      const wtax = m.withdrawals?.children?.find((c) => c.key === 'wd:tax')?.values ?? new Array<number>(12).fill(0);
      for (let i = 0; i < 12; i++) {
        expect(m.saved[i]).toBeCloseTo(m.income.values[i] - wtax[i] - m.spending.values[i], 6);
      }
    });
  });

  it.each(cases)('uncovered months are zero in every row (%s)', (_name, plan) => {
    eachYear(plan, (tree, yi) => {
      const m = monthlyColumns(tree, yi, plan);
      const uncovered = m.months.flatMap((mo, i) => (mo.covered ? [] : [i]));
      for (const row of rowsOf(m)) for (const i of uncovered) expect(row.values[i]).toBe(0);
      for (const i of uncovered) expect(m.saved[i]).toBe(0);
    });
  });

  it.each(cases)('one-time items sit only in the lump month (%s)', (_name, plan) => {
    eachYear(plan, (tree, yi) => {
      const m = monthlyColumns(tree, yi, plan);
      for (const row of rowsOf(m).filter((r) => isOneTime(r.key))) {
        row.values.forEach((v, i) => {
          if (i !== m.lumpMonth) expect(v).toBe(0);
        });
      }
    });
  });

  it('a full year covers January to December, with one-time items in January', () => {
    const plan = kitchenSinkPlan();
    const tree = cashFlowTree(plan, runPlan(plan).years);
    // A year with a one-time lump, or the January check proves nothing.
    const yi = tree.spending.children!.find((c) => c.key === 'spend:oneTime')!.values.findIndex((v) => v > 0);
    expect(yi).toBeGreaterThan(-1);
    const m = monthlyColumns(tree, yi, plan);
    expect(m.months.map((mo) => mo.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(m.months.every((mo) => mo.covered)).toBe(true);
    expect(m.lumpMonth).toBe(0);
    for (const v of m.income.values) expect(v).toBeCloseTo(tree.income.values[yi] / 12, 6);
    expect(m.spending.children!.find((c) => c.key === 'spend:oneTime')!.values[0]).toBeCloseTo(tree.spending.children!.find((c) => c.key === 'spend:oneTime')!.values[yi], 6);
  });

  it('a partial first year starts at the as-of month and splits that month by the days left in it', () => {
    const plan = firstYear(kitchenSinkPlan());
    const tree = cashFlowTree(plan, runPlan(plan).years);
    const m = monthlyColumns(tree, 0, plan);
    expect(m.months.map((mo) => mo.covered)).toEqual([...Array(9).fill(false), true, true, true]);
    expect(m.lumpMonth).toBe(9);
    // 2 of October's 31 days, then all of November and December.
    expect(m.income.values[10] / m.income.values[9]).toBeCloseTo(31 / 2, 6);
    expect(m.income.values[11] / m.income.values[10]).toBeCloseTo(1, 6);
    expect(sum(m.income.values)).toBeCloseTo(tree.income.values[0], 2);
  });
});
