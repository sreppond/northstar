import { describe, expect, it } from 'vitest';
import { costBasisGrossUp, costBasisTax, effectiveGainRate } from '../src/tax.js';
import { runPlan } from '../src/run.js';
import { asset, plan, rule } from './fixtures.js';

describe('effectiveGainRate', () => {
  it('never multiplies by a taxable share — the gain is always fully taxable', () => {
    const account = asset({
      id: 'a',
      name: 'Annuity',
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 10, // must be ignored under the cost-basis model
    });
    expect(effectiveGainRate(account, 65)).toBeCloseTo(0.24, 10);
  });

  it('adds the early-withdrawal penalty below the penalty-free age', () => {
    const account = asset({
      id: 'a',
      name: 'Annuity',
      withdrawalTaxRate: 24,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
    });
    expect(effectiveGainRate(account, 45)).toBeCloseTo(0.34, 10);
    expect(effectiveGainRate(account, 65)).toBeCloseTo(0.24, 10);
  });
});

describe('costBasisTax', () => {
  it('taxes only the gain when the withdrawal stays inside it', () => {
    const result = costBasisTax(15_000, 100_000, 80_000, 0.24);
    expect(result.tax).toBeCloseTo(15_000 * 0.24, 6);
    expect(result.basisUsed).toBe(0);
  });

  it('splits a withdrawal that drains the gain and reaches into basis', () => {
    // 20k of gain, withdrawing 30k reaches 10k into the tax-free basis.
    const result = costBasisTax(30_000, 100_000, 80_000, 0.24);
    expect(result.tax).toBeCloseTo(20_000 * 0.24, 6);
    expect(result.basisUsed).toBeCloseTo(10_000, 6);
  });

  it('is entirely tax-free once the balance has already been drawn to the base', () => {
    const result = costBasisTax(5_000, 80_000, 80_000, 0.24);
    expect(result.tax).toBe(0);
    expect(result.basisUsed).toBe(5_000);
  });
});

describe('costBasisGrossUp', () => {
  it('matches a flat gross-up while the net stays inside the gain', () => {
    // Same shape as grossUp(15_000, 0.24) since none of it reaches basis.
    expect(costBasisGrossUp(15_000, 100_000, 80_000, 0.24)).toBeCloseTo(15_000 / 0.76, 6);
  });

  it('adds untaxed basis dollar-for-dollar once the gain is exhausted', () => {
    // 20k gain nets 20k*0.76=15,200. The remaining 9,800 of net comes
    // straight out of basis with no gross-up at all.
    const gross = costBasisGrossUp(25_000, 100_000, 80_000, 0.24);
    const netFromGain = 20_000 * 0.76;
    expect(gross).toBeCloseTo(20_000 + (25_000 - netFromGain), 6);
  });

  it('is the identity when there is no gain left at all', () => {
    expect(costBasisGrossUp(10_000, 80_000, 80_000, 0.24)).toBe(10_000);
  });
});

describe('runPlan — cost-basis withdrawals', () => {
  it('drains gain first (fully taxed), then basis tax-free, across years', () => {
    const account = asset({
      id: 'annuity',
      name: 'Variable annuity',
      accountClass: 'taxDeferredInvestment',
      initialBalance: 100_000,
      growthRateMethod: 'fixed',
      growthRate: 0,
      nonTaxableBase: 80_000,
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100, // must be ignored: nonTaxableBase governs
      penaltyRate: 0,
      withdrawalTiming: 'always',
    });

    const result = runPlan(
      plan({
        settings: { projectionYears: 2, baselineExpenses: 15_000 } as never,
        accounts: [account],
        rules: [rule('annuity', 'withdrawal', 1)],
      }),
    );

    const [y1, y2] = result.years;

    // Year 1: $20k of gain covers a $15k net need with room to spare — every
    // dollar out is taxable, none of it touches the $80k base.
    const y1Tax = y1.taxes.find((t) => t.accountId === 'annuity');
    expect(y1Tax?.amount).toBeCloseTo(15_000 * (0.24 / 0.76), 2);
    expect(y1.accounts[0].nonTaxableBaseRemaining).toBeCloseTo(80_000, 6);

    // Year 2: only ~$263 of gain is left (no growth), so the rest of the
    // $15k net need is drawn from basis, tax-free, and the base shrinks.
    const y2Tax = y2.taxes.find((t) => t.accountId === 'annuity');
    const remainingGainStartOfY2 = y1.accounts[0].close - 80_000;
    expect(y2Tax?.amount).toBeCloseTo(remainingGainStartOfY2 * 0.24, 2);
    expect(y2.accounts[0].nonTaxableBaseRemaining).toBeLessThan(80_000);
    expect(y2.accounts[0].nonTaxableBaseRemaining).toBeCloseTo(
      80_000 - (15_000 - remainingGainStartOfY2 * 0.76),
      2,
    );
  });

  it('falls back to the flat taxableWithdrawalPercent when nonTaxableBase is unset', () => {
    const account = asset({
      id: 'ira',
      name: 'Traditional IRA',
      accountClass: 'taxDeferredInvestment',
      initialBalance: 100_000,
      growthRateMethod: 'noChange',
      growthRate: 0,
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100,
      penaltyRate: 0,
      withdrawalTiming: 'always',
    });

    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 15_000 } as never,
        accounts: [account],
        rules: [rule('ira', 'withdrawal', 1)],
      }),
    );

    const tax = result.years[0].taxes.find((t) => t.accountId === 'ira');
    expect(tax?.amount).toBeCloseTo(15_000 * (0.24 / 0.76), 2);
    expect(result.years[0].accounts[0].nonTaxableBaseRemaining).toBeUndefined();
  });
});
