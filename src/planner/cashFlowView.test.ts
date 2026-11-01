import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan, YearSnapshot } from '@northstar/engine';
import { cashFlowTree, monthsInYear, waterfallBars, yearFlow, type FlowNode } from './cashFlowView';
import { toHouseholdModel } from './household';
import { healthyPlan, kitchenSinkPlan, runsDryPlan } from './planFixtures';
import { savedThisYear, spendingThisYear } from './ledger';
import { SAMPLE_PLANS } from './samplePlan';
import { spendingGroups } from './spendingGroups';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmt = (v: number) => `$${Math.round(v)}`;

/**
 * A synthetic plan with one big year: $120k in, $60k of living costs, and a
 * $150k one-off in 2027. Brokerage is the only account and does not grow.
 *
 *   2026  surplus 60,000, allocated to Brokerage.
 *   2027  net -90,000. The waterfall draws Brokerage's 60,000 and 30,000 is
 *         unfunded, so the household is short that year.
 *   2028  surplus 60,000. The first 30,000 repays the overdrawn balance, and
 *         only the remaining 30,000 is allocated to Brokerage.
 *   2029  back to normal: 60,000 allocated.
 */
function lifecyclePlan(): Plan {
  return {
    id: 'lifecycle',
    name: 'Lifecycle',
    settings: {
      startYear: 2026,
      projectionYears: 4,
      inflationRate: 0,
      dollarMode: 'futureDollars',
      baselineIncome: 120_000,
      baselineExpenses: 60_000,
      incomeTaxRate: 0,
    },
    participants: [{ id: 'p1', name: 'Alex', birthYear: 1980, lifeExpectancy: 95, isIncluded: true, role: 'adult' }],
    accounts: [
      {
        id: 'b',
        name: 'Brokerage',
        accountClass: 'taxableInvestment',
        isLiability: false,
        initialBalance: 0,
        isIncluded: true,
        growthRateMethod: 'noChange',
        growthRate: 0,
        withdrawalTiming: 'always',
        withdrawalTaxRate: 0,
        taxableWithdrawalPercent: 0,
        penaltyRate: 0,
      },
    ],
    events: [{ id: 'big', name: 'Big one-off', kind: 'otherExpense', startYear: 2027, isIncluded: true, config: { amount: 150_000 } }],
    rules: [
      { accountId: 'b', ruleType: 'allocation', order: 1 },
      { accountId: 'b', ruleType: 'withdrawal', order: 1 },
    ],
  };
}

const plans: [string, Plan][] = [
  ['sample (house forecast)', SAMPLE_PLANS[0]],
  ['sample (retirement forecast)', SAMPLE_PLANS[1]],
  ['sample on the household model', toHouseholdModel(SAMPLE_PLANS[1]).plan],
  ['kitchen sink', kitchenSinkPlan()],
  ['runs dry', runsDryPlan()],
  ['healthy', healthyPlan()],
  ['lifecycle (short in 2027, repaid in 2028)', lifecyclePlan()],
];

/** Every allocation line that is not the overdrawn repayment: what was put into accounts. */
const allocatedExcludingRepayment = (s: YearSnapshot) =>
  sum(s.allocations.filter((l) => l.category !== 'overdrawnRepayment').map((l) => l.amount));

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

  it.each(plans)('drawdown, repayment and owed read the engine fields (%s)', (_name, plan) => {
    for (const snapshot of runPlan(plan).years) {
      const f = yearFlow(plan, snapshot);
      const drawn = sum(snapshot.withdrawals.map((w) => w.amount));
      expect(f.drawdown).toBeCloseTo(drawn + (snapshot.unfundedShortfall ?? 0), 4);
      expect(f.unfunded).toBeCloseTo(snapshot.unfundedShortfall ?? 0, 4);
      expect(f.repaid).toBeCloseTo(sum(snapshot.allocations.filter((l) => l.category === 'overdrawnRepayment').map((l) => l.amount)), 4);
      expect(f.owed).toBeCloseTo(snapshot.overdrawn?.close ?? 0, 4);
    }
  });
});

describe('the year’s money adds up', () => {
  // The identity the Cash Flow rows add up to, for every year:
  //
  //   after tax − spending − tax on investments − repayment + drawdown
  //     = saved on purpose + allocations (every allocation line except the repayment)
  //
  // Left side: what the year's income, costs and draws leave to put away.
  // Right side: what the engine actually put into accounts (contributions are
  // the saved-on-purpose group; allocations and the sweep are the rest).
  it.each(plans)('after tax − spending − tax on investments − repayment + drawdown = saved + allocated (%s)', (_name, plan) => {
    for (const snapshot of runPlan(plan).years) {
      const f = yearFlow(plan, snapshot);
      const leftSide = f.afterTax - f.spent - f.withdrawalTax - f.repaid + f.drawdown;
      const rightSide = f.savedOnPurpose + allocatedExcludingRepayment(snapshot);
      expect(leftSide).toBeCloseTo(rightSide, 4);
    }
  });

  it('the lifecycle plan: a drawn year nets to zero, and a repaying year leaves only the rest', () => {
    const plan = lifecyclePlan();
    const years = runPlan(plan).years;
    const byYear = (y: number) => years.find((s) => s.year === y)!;

    // 2027: 120,000 − 210,000 = −90,000, all of it drawn (60,000 + 30,000 overdrawn).
    const f27 = yearFlow(plan, byYear(2027));
    expect(f27.afterTax - f27.spent - f27.withdrawalTax - f27.repaid + f27.drawdown).toBeCloseTo(0, 4);

    // 2028: 120,000 − 60,000 = 60,000, of which 30,000 repays and 30,000 is allocated.
    const f28 = yearFlow(plan, byYear(2028));
    expect(f28.repaid).toBeCloseTo(30_000, 4);
    expect(f28.afterTax - f28.spent - f28.repaid).toBeCloseTo(30_000, 4);
    expect(allocatedExcludingRepayment(byYear(2028))).toBeCloseTo(30_000, 4);
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

  it('a drawn year ends on one Drawdown bar that lands on the saved figure', () => {
    const dry = runsDryPlan();
    const short = runPlan(dry).years.find((y) => y.unfundedShortfall)!;
    expect(short).toBeDefined();
    const flow = yearFlow(dry, short);
    const bars = waterfallBars(flow, fmt);
    const last = bars[bars.length - 1];
    expect(last.key).toBe('drawdown');
    expect(last.kind).toBe('total');
    expect(last.to).toBeCloseTo(flow.saved, 4);
  });

  it('splits the Drawdown bar: the part from savings in the plain colour, the overdrawn part in danger', () => {
    const plan = lifecyclePlan();
    const flow = yearFlow(plan, runPlan(plan).years.find((y) => y.year === 2027)!);
    const drawdown = waterfallBars(flow, fmt).find((b) => b.key === 'drawdown')!;
    // Hand check: saved = −90,000. 60,000 came from Brokerage (plain), 30,000 is overdrawn (danger).
    expect(drawdown.to).toBeCloseTo(-90_000, 4);
    expect(drawdown.segments).toEqual([
      { from: 0, to: -60_000, color: 'var(--out)' },
      { from: -60_000, to: -90_000, color: 'var(--danger)' },
    ]);
  });

  it('a funded drawn year has no overdrawn part, so the Drawdown bar is not split', () => {
    const dry = runsDryPlan();
    const funded = runPlan(dry).years.find((y) => !y.unfundedShortfall && (y.withdrawals?.length ?? 0) > 0);
    expect(funded).toBeDefined();
    const bar = waterfallBars(yearFlow(dry, funded!), fmt).find((b) => b.key === 'drawdown');
    expect(bar?.segments).toBeUndefined();
  });

  it('a repaying year: Saved lands on the year’s saving, and the repayment bar takes the overdrawn out of it', () => {
    const plan = lifecyclePlan();
    const flow = yearFlow(plan, runPlan(plan).years.find((y) => y.year === 2028)!);
    const bars = waterfallBars(flow, fmt);
    const saved = bars.find((b) => b.key === 'saved')!;
    const repaid = bars.find((b) => b.key === 'repaid')!;
    expect(saved.to).toBeCloseTo(60_000, 4);
    expect(repaid.kind).toBe('delta');
    expect(repaid.from).toBeCloseTo(60_000, 4);
    expect(repaid.amount).toBeCloseTo(-30_000, 4);
    expect(repaid.to).toBeCloseTo(30_000, 4);
    expect(bars[bars.length - 1].key).toBe('repaid');
    expect(bars.some((b) => b.key === 'drawdown')).toBe(false);
  });

  it('a year with no repayment or drawdown has no Drawdown or repayment bar', () => {
    const plan = lifecyclePlan();
    const flow = yearFlow(plan, runPlan(plan).years.find((y) => y.year === 2026)!);
    const keys = waterfallBars(flow, fmt).map((b) => b.key);
    expect(keys).not.toContain('drawdown');
    expect(keys).not.toContain('repaid');
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
    const roots = [tree.income, tree.spending, tree.saving, tree.drawdown].filter((n): n is FlowNode => !!n);
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
      const withdrawalTax = tree.taxOnInvestments?.values[i] ?? 0;
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

  it('has a Drawdown row only when some year draws down, and Overdrawn is its last child', () => {
    const healthy = healthyPlan();
    expect(cashFlowTree(healthy, runPlan(healthy).years).drawdown).toBeUndefined();
    const dry = runsDryPlan();
    const tree = cashFlowTree(dry, runPlan(dry).years);
    expect(tree.drawdown).toBeDefined();
    expect(tree.drawdown!.link).toBe('drawdown');
    expect(tree.drawdown!.negate).toBe(true);
    const children = tree.drawdown!.children!;
    const overdrawn = children[children.length - 1];
    expect(overdrawn.label).toBe('Overdrawn');
    expect(overdrawn.tone).toBe('danger');
    expect(Math.max(...overdrawn.values)).toBeGreaterThan(0);
  });

  it('the lifecycle plan: Drawdown is 90,000 in 2027 (60,000 from Brokerage, 30,000 overdrawn), repaid 30,000 in 2028', () => {
    const plan = lifecyclePlan();
    const snapshots = runPlan(plan).years;
    const tree = cashFlowTree(plan, snapshots);
    // Years are 2026..2029, so the index is year − 2026.
    expect(tree.drawdown!.values.map(Math.round)).toEqual([0, 90_000, 0, 0]);
    const [fromBrokerage, overdrawn] = tree.drawdown!.children!;
    expect(fromBrokerage.label).toBe('From Brokerage');
    expect(fromBrokerage.values.map(Math.round)).toEqual([0, 60_000, 0, 0]);
    expect(fromBrokerage.negate).toBe(true);
    expect(overdrawn.values.map(Math.round)).toEqual([0, 30_000, 0, 0]);
    expect(overdrawn.tone).toBe('danger');
    expect(tree.repaid!.values.map(Math.round)).toEqual([0, 0, 30_000, 0]);
    expect(tree.repaid!.link).toBe('repaid');
    expect(tree.taxOnInvestments).toBeUndefined();
  });

  it('Tax on investments is its own row, present only when some year pays it', () => {
    const plan = kitchenSinkPlan();
    const snapshots = runPlan(plan).years;
    const tree = cashFlowTree(plan, snapshots);
    // The kitchen sink plan draws to cover a gap, and that draw is taxed (its fixture says so).
    const expected = snapshots.map((s) => sum(s.taxes.filter((t) => t.label.startsWith('Withdrawal tax') || t.category === 'gainsTax').map((t) => t.amount)));
    expect(expected.some((v) => v > 0)).toBe(true);
    expect(tree.taxOnInvestments!.values.map((v) => Math.round(v * 100) / 100)).toEqual(expected.map((v) => Math.round(v * 100) / 100));
    expect(tree.taxOnInvestments!.negate).toBe(true);
    const healthy = healthyPlan();
    expect(cashFlowTree(healthy, runPlan(healthy).years).taxOnInvestments).toBeUndefined();
  });

  it('Paying back overdrawn is absent unless some year repays', () => {
    const healthy = healthyPlan();
    expect(cashFlowTree(healthy, runPlan(healthy).years).repaid).toBeUndefined();
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
