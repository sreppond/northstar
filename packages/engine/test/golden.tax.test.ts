/**
 * Golden tests — taxes: flat income tax, capital-gains cost basis, and
 * early-withdrawal penalties (docs/ROADMAP-10.md "Track A: Truth",
 * docs/MATH.md).
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { costBasisGrossUp, costBasisTax, effectiveWithdrawalRate, grossUp } from '../src/tax.js';
import { asset, plan, rule } from './fixtures.js';

describe('Golden: flat income tax on salary', () => {
  it('taxes baseline income at the flat rate, with no pretax contribution to reduce it', () => {
    // Hand check: $120,000 income * 25% = $30,000 tax exactly.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineIncome: 120_000, baselineExpenses: 0, incomeTaxRate: 25 } as never,
      }),
    );
    const tax = result.years[0].taxes.find((t) => t.label === 'Income tax');
    expect(tax?.amount).toBeCloseTo(30_000, 6);
    expect(result.years[0].netCashFlow).toBeCloseTo(120_000 - 30_000, 6);
  });
});

describe('Golden: capital-gains basis on a taxable withdrawal (flat taxableWithdrawalPercent)', () => {
  it('grosses up a withdrawal by ONLY the taxable share × the rate (docs/PLAN.md §4.5)', () => {
    // Hand check: effectiveRate = 15% capital-gains rate * 60% taxable share
    // = 9%. To net $100,000: gross = 100,000 / (1 - 0.09) = 100,000 / 0.91
    // ≈ $109,890.11.
    const rate = effectiveWithdrawalRate(
      { taxableWithdrawalPercent: 60, withdrawalTaxRate: 15, penaltyRate: 0, penaltyFreeAge: undefined } as never,
      70,
    );
    expect(rate).toBeCloseTo(0.09, 10);
    expect(grossUp(100_000, rate)).toBeCloseTo(109_890.11, 2);

    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 100_000 } as never,
        accounts: [
          asset({
            id: 'b',
            name: 'Brokerage',
            initialBalance: 500_000,
            growthRateMethod: 'noChange',
            withdrawalTaxRate: 15,
            taxableWithdrawalPercent: 60,
          }),
        ],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    expect(result.years[0].withdrawals[0].amount).toBeCloseTo(109_890.11, 2);
    const taxLine = result.years[0].taxes.find((t) => t.category === 'tax');
    // Tax is the taxable SHARE of the gross, at the capital-gains rate:
    // 109,890.11 * 0.60 * 0.15 ≈ 9,890.11 (exactly gross - 100,000, since
    // the whole point of the gross-up is that gross - tax = net).
    expect(taxLine?.amount).toBeCloseTo(109_890.11 - 100_000, 2);
  });
});

describe('Golden: cost-basis (LIFO, gain-first) withdrawals', () => {
  it('drains embedded gain fully taxed first, then untaxed basis (docs/PLAN.md §4.5a worked example)', () => {
    // $100k balance, $80k of which is after-tax basis => $20k of gain.
    // Withdrawing enough to NET $30,000 at a 24% gain rate:
    //   netFromAllGain = 20,000 * (1 - 0.24) = 15,200 — not enough to cover
    //   the $30k need from gain alone, so basis must also come out:
    //   gross = gain + (netNeeded - netFromAllGain) = 20,000 + 14,800 = 34,800
    //   tax = 20,000 * 0.24 = 4,800 (the gain portion only)
    //   basisUsed = 34,800 - 20,000 = 14,800 (tax-free)
    // Check: net = gross - tax = 34,800 - 4,800 = 30,000. ✓.
    const gross = costBasisGrossUp(30_000, 100_000, 80_000, 0.24);
    expect(gross).toBeCloseTo(34_800, 6);
    const { tax, basisUsed } = costBasisTax(gross, 100_000, 80_000, 0.24);
    expect(tax).toBeCloseTo(4_800, 6);
    expect(basisUsed).toBeCloseTo(14_800, 6);
    expect(gross - tax).toBeCloseTo(30_000, 6);
  });

  it('runs the same worked example end-to-end through runPlan, and depletes remainingBasis by the basis used', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 30_000 } as never,
        participants: [{ id: 'p1', name: 'A', birthYear: 1950, lifeExpectancy: 90, isIncluded: true }], // >59.5, no penalty
        accounts: [
          asset({
            id: 'v',
            name: 'Annuity',
            accountClass: 'variableAnnuity',
            initialBalance: 100_000,
            growthRateMethod: 'noChange',
            withdrawalTaxRate: 24,
            nonTaxableBase: 80_000,
          }),
        ],
        rules: [rule('v', 'withdrawal', 1)],
      }),
    );
    const row = result.years[0].accounts[0];
    expect(row.withdrawals).toBeCloseTo(34_800, 2);
    expect(row.nonTaxableBaseRemaining).toBeCloseTo(80_000 - 14_800, 2);
    expect(row.close).toBeCloseTo(100_000 - 34_800, 2);
  });
});

describe('Golden: early-withdrawal penalty before 59½', () => {
  it('adds the penalty rate on top of ordinary tax before the penalty-free age', () => {
    // Owner turns 36 in 2026 (born 1990): under 59.5, so the 10% penalty
    // applies on top of 24% ordinary tax => 34% effective rate.
    // Hand check: 66,000 / (1 - 0.34) = 66,000 / 0.66 = 100,000 exactly.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 66_000 } as never,
        accounts: [
          asset({
            id: 'r',
            name: '401k',
            initialBalance: 500_000,
            growthRateMethod: 'noChange',
            withdrawalTaxRate: 24,
            taxableWithdrawalPercent: 100,
            penaltyRate: 10,
            penaltyFreeAge: 59.5,
          }),
        ],
        rules: [rule('r', 'withdrawal', 1)],
      }),
    );
    expect(result.years[0].withdrawals[0].amount).toBeCloseTo(100_000, 2);
  });

  it('drops the penalty once the owner reaches penaltyFreeAge, leaving only ordinary tax', () => {
    // Same account, but the owner is now 60 (born 1966): past 59.5, no
    // penalty. Hand check: 66,000 / (1 - 0.24) = 86,842.11.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 66_000 } as never,
        participants: [{ id: 'p1', name: 'A', birthYear: 1966, lifeExpectancy: 90, isIncluded: true }],
        accounts: [
          asset({
            id: 'r',
            name: '401k',
            initialBalance: 500_000,
            growthRateMethod: 'noChange',
            withdrawalTaxRate: 24,
            taxableWithdrawalPercent: 100,
            penaltyRate: 10,
            penaltyFreeAge: 59.5,
          }),
        ],
        rules: [rule('r', 'withdrawal', 1)],
      }),
    );
    expect(result.years[0].withdrawals[0].amount).toBeCloseTo(66_000 / 0.76, 2);
    expect(result.years[0].withdrawals[0].amount).toBeCloseTo(86_842.11, 2);
  });
});
