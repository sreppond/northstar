import { describe, expect, it } from 'vitest';
import { effectiveWithdrawalRate, grossUp } from '../src/tax.js';
import { asset } from './fixtures.js';

describe('effectiveWithdrawalRate', () => {
  it('taxes only the taxable share of a withdrawal', () => {
    const account = asset({
      id: 'a',
      name: 'Brokerage',
      withdrawalTaxRate: 20,
      taxableWithdrawalPercent: 50,
    });
    expect(effectiveWithdrawalRate(account, 40)).toBeCloseTo(0.1, 10);
  });

  it('adds the early-withdrawal penalty below the penalty-free age', () => {
    const account = asset({
      id: 'a',
      name: '401k',
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
    });
    expect(effectiveWithdrawalRate(account, 45)).toBeCloseTo(0.34, 10);
    expect(effectiveWithdrawalRate(account, 65)).toBeCloseTo(0.24, 10);
  });

  it('skips the penalty when the owner age is unknown', () => {
    const account = asset({
      id: 'a',
      name: '401k',
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
    });
    expect(effectiveWithdrawalRate(account, undefined)).toBeCloseTo(0.24, 10);
  });

  it('caps below 1 so the gross-up can never be infinite', () => {
    const account = asset({
      id: 'a',
      name: 'Punitive',
      withdrawalTaxRate: 100,
      taxableWithdrawalPercent: 100,
      penaltyRate: 100,
      penaltyFreeAge: 99,
    });
    expect(effectiveWithdrawalRate(account, 30)).toBeLessThan(1);
  });
});

describe('grossUp', () => {
  it('covers a shortfall net of tax and penalty', () => {
    // The worked example from docs/PLAN.md §4.5: netting $100k out of an
    // account losing 34% takes $151,515 gross, not $100k.
    expect(grossUp(100_000, 0.34)).toBeCloseTo(151_515.15, 2);
  });

  it('is the identity at a zero rate', () => {
    expect(grossUp(1_000, 0)).toBe(1_000);
  });

  it('returns zero for a non-positive need', () => {
    expect(grossUp(0, 0.3)).toBe(0);
    expect(grossUp(-5, 0.3)).toBe(0);
  });
});
