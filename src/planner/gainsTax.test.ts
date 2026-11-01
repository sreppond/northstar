/**
 * An active-trading account's gains tax (docs/MATH.md "Taxable gains"): it is
 * a `gainsTax` tax line, and the UI files it under the investment-tax bucket
 * ("Tax on investments"), not under income tax. Everything else still
 * reconciles to the engine's totals.
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import type { Plan, YearSnapshot } from '@northstar/engine';
import { budgetView } from './budgetView';
import { cashFlowTree, yearFlow, type FlowNode } from './cashFlowView';
import { incomeWithTax } from './incomeTax';
import { savedThisYear } from './ledger';
import { healthyPlan, kitchenSinkPlan } from './planFixtures';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const gainsTaxOf = (s: YearSnapshot) => sum(s.taxes.filter((t) => t.category === 'gainsTax').map((t) => t.amount));

/** Every included brokerage in `plan` runs as active trading at 30%. */
function asActiveTrading(plan: Plan): Plan {
  return {
    ...plan,
    accounts: plan.accounts.map((a) =>
      a.accountClass === 'taxableInvestment' ? { ...a, gainsTaxTreatment: 'activeTrading', shortTermGainsRate: 30 } : a,
    ),
  };
}

// Healthy: surplus is allocated to the brokerage, so each year's growth is a
// realized gain and its tax is paid from that surplus, with no withdrawals.
// Kitchen sink: the same, but a gap year also draws on accounts, so the
// investment tax sits beside real withdrawal tax.
const plans: [string, Plan][] = [
  ['active trading, surplus', asActiveTrading(healthyPlan())],
  ['active trading, with a gap year', asActiveTrading(kitchenSinkPlan())],
];

describe('an active-trading account’s gains tax reconciles', () => {
  it.each(plans)('%s: every tax dollar lands in income tax or the investment bucket', (_name, plan) => {
    const result = runPlan(plan);
    expect(result.years.some((s) => gainsTaxOf(s) > 0)).toBe(true);

    for (const s of result.years) {
      const view = incomeWithTax(s);
      const withdrawalTaxLines = sum(s.taxes.filter((t) => t.label.startsWith('Withdrawal tax')).map((t) => t.amount));
      expect(view.withdrawalTax).toBeCloseTo(gainsTaxOf(s) + withdrawalTaxLines, 4);
      expect(sum(view.sources.map((x) => x.tax)) + view.withdrawalTax).toBeCloseTo(s.totalTaxes, 4);

      const flow = yearFlow(plan, s);
      expect(flow.afterTax).toBeCloseTo(s.totalIncome - (s.totalTaxes - flow.withdrawalTax), 4);
      expect(flow.afterTax - flow.withdrawalTax - flow.spent - flow.savedOnPurpose).toBeCloseTo(s.netCashFlow, 4);
      expect(flow.saved).toBeCloseTo(savedThisYear(s), 4);
    }
  });

  it.each(plans)('%s: Budget puts the same investment tax in its own bucket', (_name, plan) => {
    const result = runPlan(plan);
    const s = result.years.find((y) => gainsTaxOf(y) > 0)!;
    const view = budgetView(plan, s);
    const bucket = view.buckets.find((b) => b.key === 'wtax');
    expect(bucket?.label).toBe('Tax on investments');
    expect(bucket!.monthly * 12).toBeCloseTo(incomeWithTax(s).withdrawalTax, 4);
  });
});

describe('the gains tax is the investment-tax bucket, not income tax', () => {
  const plan = asActiveTrading(healthyPlan());
  const result = runPlan(plan);
  // The first year that owes tax on last year's gains.
  const dueYear = result.years.find((s) => gainsTaxOf(s) > 0)!;
  const dueTax = gainsTaxOf(dueYear);

  it('is booked as withdrawalTax, so income tax excludes it', () => {
    const flow = yearFlow(plan, dueYear);
    expect(flow.withdrawalTax).toBeCloseTo(dueTax, 4);
    // Income tax is what the engine's ordinary-tax line says, with none of the gains tax in it.
    const ordinaryLine = dueYear.taxes.find((t) => t.label === 'Income tax')?.amount ?? 0;
    expect(flow.incomeTax).toBeCloseTo(ordinaryLine, 4);
  });

  it('is shown in the Cash Flow table as "Tax on investments", even with no withdrawals that year', () => {
    expect(sum(dueYear.withdrawals.map((w) => w.amount))).toBe(0);
    const tree = cashFlowTree(plan, result.years);
    const row: FlowNode = tree.taxOnInvestments!;
    expect(row).toBeDefined();
    expect(row.label).toBe('Tax on investments');
    const i = tree.years.indexOf(dueYear.year);
    expect(row.values[i]).toBeCloseTo(dueTax, 4);
  });
});
