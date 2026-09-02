import { describe, expect, it } from 'vitest';
import { annuityFeeForYear, contractYearFor, surrenderCharge } from '../src/annuity.js';
import { runPlan } from '../src/run.js';
import { asset, plan, rule } from './fixtures.js';

describe('annuityFeeForYear', () => {
  it('is zero for an account that sets no fee fields', () => {
    expect(annuityFeeForYear({}, 100_000, 6_500, 1)).toBe(0);
  });

  it('charges the flat fee alone when only that is set', () => {
    expect(annuityFeeForYear({ annuityFlatFeeAnnual: 240 }, 100_000, 6_500, 1)).toBeCloseTo(240, 6);
  });

  it('assesses the asset-based fee against the MID-year value, not the opening balance', () => {
    // open=100k, grossGrowth=10k -> midpoint = 105k. 1% of 105k = 1,050,
    // not 1% of the opening 100k (1,000) or the closing 110k (1,100).
    const fee = annuityFeeForYear({ annuityAssetFeePercent: 1 }, 100_000, 10_000, 1);
    expect(fee).toBeCloseTo(1_050, 6);
  });

  it('sums the asset-based and advisory percentages', () => {
    const fee = annuityFeeForYear(
      { annuityAssetFeePercent: 1, annuityAdvisoryFeePercent: 0.5 },
      100_000,
      0,
      1,
    );
    expect(fee).toBeCloseTo(100_000 * 0.015, 6);
  });

  it('scales both the flat and asset-based fee by yearFraction, like every other recurring flow', () => {
    const fullYear = annuityFeeForYear(
      { annuityFlatFeeAnnual: 240, annuityAssetFeePercent: 1 },
      100_000,
      0,
      1,
    );
    const halfYear = annuityFeeForYear(
      { annuityFlatFeeAnnual: 240, annuityAssetFeePercent: 1 },
      100_000,
      0,
      0.5,
    );
    expect(halfYear).toBeCloseTo(fullYear / 2, 6);
  });

  it('never drives the year below zero even with fees larger than the balance', () => {
    const fee = annuityFeeForYear({ annuityFlatFeeAnnual: 1_000_000 }, 100, 0, 1);
    expect(fee).toBeCloseTo(100, 6);
  });
});

describe('contractYearFor', () => {
  it('is year 1 in the account\'s own start year', () => {
    expect(contractYearFor(2020, 2015, 2020)).toBe(1);
  });

  it('counts up from there', () => {
    expect(contractYearFor(2020, 2015, 2023)).toBe(4);
  });

  it('falls back to the plan start year when the account has none of its own', () => {
    expect(contractYearFor(undefined, 2020, 2022)).toBe(3);
  });
});

describe('surrenderCharge', () => {
  const schedule = [
    { year: 1, percent: 7 },
    { year: 2, percent: 6 },
    { year: 3, percent: 5 },
  ];

  it('applies the percent listed for the current contract year', () => {
    expect(surrenderCharge(10_000, 1, schedule)).toBeCloseTo(700, 6);
    expect(surrenderCharge(10_000, 2, schedule)).toBeCloseTo(600, 6);
  });

  it('is zero once the contract year runs past the end of the schedule', () => {
    // Year 4 was never listed — the contract has left its surrender period,
    // and this is deliberately NOT "hold the last rate" the way a growth
    // schedule behaves.
    expect(surrenderCharge(10_000, 4, schedule)).toBe(0);
  });

  it('is zero before the schedule starts, and for an unset or empty schedule', () => {
    expect(surrenderCharge(10_000, 0, schedule)).toBe(0);
    expect(surrenderCharge(10_000, 1, undefined)).toBe(0);
    expect(surrenderCharge(10_000, 1, [])).toBe(0);
  });

  it('returns zero for a non-positive withdrawal', () => {
    expect(surrenderCharge(0, 1, schedule)).toBe(0);
  });
});

describe('runPlan — annuity fee drag', () => {
  it('reduces growth by the flat and asset-based fees, composing with the opening-balance growth rule', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [
          asset({
            id: 'va',
            name: 'Variable annuity',
            accountClass: 'taxDeferredInvestment',
            initialBalance: 100_000,
            growthRate: 10,
            annuityFlatFeeAnnual: 240,
            annuityAssetFeePercent: 1,
          }),
        ],
      }),
    );

    const row = result.years[0].accounts[0];
    const grossGrowth = 100_000 * 0.1; // 10,000
    const midYear = 100_000 + grossGrowth / 2;
    const expectedFee = 240 + midYear * 0.01;
    expect(row.annuityFeesDeducted).toBeCloseTo(expectedFee, 2);
    expect(row.growth).toBeCloseTo(grossGrowth - expectedFee, 2);
    expect(row.close).toBeCloseTo(100_000 + row.growth, 6);
  });

  it('leaves a plain account with no fee fields completely unaffected', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 10 })],
      }),
    );
    const row = result.years[0].accounts[0];
    expect(row.growth).toBeCloseTo(10_000, 6);
    expect(row.annuityFeesDeducted).toBeUndefined();
  });
});

describe('runPlan — surrender charges', () => {
  it('reduces net proceeds only inside the active contract-year window, stacking with tax and penalty', () => {
    const account = asset({
      id: 'va',
      name: 'Variable annuity',
      accountClass: 'taxDeferredInvestment',
      initialBalance: 500_000,
      growthRateMethod: 'noChange',
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
      annuitySurrenderSchedule: [{ year: 1, percent: 7 }],
    });

    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 66_000 } as never,
        accounts: [account],
        rules: [rule('va', 'withdrawal', 1)],
      }),
    );

    const y = result.years[0];
    // Same 24% tax + 10% penalty as run.test.ts's "grosses up a withdrawal"
    // case: covering the $66k net need alone (ignoring the surrender charge)
    // would need $100k gross. The surrender charge is an ADDITIONAL cost on
    // top, so the same $100k gross now nets less than $66k, and the shortfall
    // it leaves behind must show up somewhere (here: the account not fully
    // funding the need, since it is the only account in the waterfall).
    const gross = y.withdrawals[0].amount;
    const surrenderLine = y.expenses.find((e) => e.category === 'annuityCharge');
    expect(surrenderLine?.amount).toBeCloseTo(gross * 0.07, 2);
    // netCashFlow already runs negative whenever a withdrawal occurs (it
    // does not net the withdrawal's own proceeds back in — see run.ts §8);
    // adding the surrender charge as an expense makes that reported deficit
    // even larger, which is the correct direction: the household truly
    // received less than the $66k baseline need this year.
    expect(y.netCashFlow).toBeLessThan(-66_000);
  });

  it('charges nothing once the contract year is past the schedule', () => {
    // No explicit startYear, so contract year 1 is the plan's own start
    // year (2026) — the same "defaults to plan start" rule every other
    // account without its own startYear already follows.
    const account = asset({
      id: 'va',
      name: 'Variable annuity',
      accountClass: 'taxDeferredInvestment',
      initialBalance: 500_000,
      growthRateMethod: 'noChange',
      withdrawalTaxRate: 0,
      penaltyRate: 0,
      // Only contract years 1-2 (calendar 2026-2027) carry a charge.
      annuitySurrenderSchedule: [
        { year: 1, percent: 7 },
        { year: 2, percent: 6 },
      ],
    });

    const result = runPlan(
      plan({
        settings: { startYear: 2026, projectionYears: 3, baselineExpenses: 50_000 } as never,
        accounts: [account],
        rules: [rule('va', 'withdrawal', 1)],
      }),
    );

    const [y1, y2, y3] = result.years;
    const charge = (y: (typeof result.years)[number]) =>
      y.expenses.find((e) => e.category === 'annuityCharge')?.amount;

    expect(charge(y1)).toBeCloseTo(50_000 * 0.07, 2);
    expect(charge(y2)).toBeCloseTo(50_000 * 0.06, 2);
    // Contract year 3 (calendar 2028) was never listed — past the
    // surrender period, so nothing is charged, and the full $50k need is
    // met with no shortfall.
    expect(charge(y3)).toBeUndefined();
    expect(y3.withdrawals[0].amount).toBeCloseTo(50_000, 2);
    expect(y3.unfundedShortfall).toBeUndefined();
  });
});
