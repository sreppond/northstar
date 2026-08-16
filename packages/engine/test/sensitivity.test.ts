import { describe, expect, it } from 'vitest';
import { headlineReturnRate, withReturnShift } from '../src/sensitivity.js';
import { runPlan } from '../src/run.js';
import { asset, liability, plan } from './fixtures.js';

describe('withReturnShift', () => {
  it('moves fixed-growth assets by the delta', () => {
    const base = plan({ accounts: [asset({ id: 'b', name: 'Brokerage', growthRate: 6.5 })] });
    expect(withReturnShift(base, 2).accounts[0].growthRate).toBe(8.5);
    expect(withReturnShift(base, -2).accounts[0].growthRate).toBe(4.5);
  });

  it('leaves cash alone — cash has no market return', () => {
    const base = plan({
      accounts: [
        asset({ id: 'c', name: 'Cash', accountClass: 'cash', growthRateMethod: 'noChange' }),
      ],
    });
    expect(withReturnShift(base, 2).accounts[0].growthRate).toBe(0);
  });

  it('shifts every anchor of a variable schedule together', () => {
    const base = plan({
      accounts: [
        asset({
          id: 'v',
          name: 'Variable',
          growthRateMethod: 'schedule',
          growthRateSchedule: [
            { year: 2026, rate: 7 },
            { year: 2040, rate: 4 },
          ],
        }),
      ],
    });
    // The curve moves; it must not flatten.
    expect(withReturnShift(base, -2).accounts[0].growthRateSchedule).toEqual([
      { year: 2026, rate: 5 },
      { year: 2040, rate: 2 },
    ]);
  });

  it('leaves liabilities alone — a mortgage rate is contractual', () => {
    const base = plan({
      accounts: [liability({ id: 'm', name: 'Mortgage', interestRate: 6 })],
    });
    expect(withReturnShift(base, 2).accounts[0]).toEqual(base.accounts[0]);
  });

  it('does not mutate the plan it was given', () => {
    const base = plan({ accounts: [asset({ id: 'b', name: 'B', growthRate: 6.5 })] });
    withReturnShift(base, 2);
    expect(base.accounts[0].growthRate).toBe(6.5);
  });

  it('returns the same object for a zero shift, so the base run is not duplicated', () => {
    const base = plan();
    expect(withReturnShift(base, 0)).toBe(base);
  });

  it('produces a strictly wider spread the further out the projection runs', () => {
    const base = plan({
      settings: { projectionYears: 20 } as never,
      accounts: [asset({ id: 'b', name: 'B', initialBalance: 100_000, growthRate: 6.5 })],
    });
    const low = runPlan(withReturnShift(base, -2));
    const mid = runPlan(base);
    const high = runPlan(withReturnShift(base, 2));

    const spreadAt = (i: number) => high.years[i].netWorth - low.years[i].netWorth;
    expect(spreadAt(0)).toBeLessThan(spreadAt(10));
    expect(spreadAt(10)).toBeLessThan(spreadAt(19));

    // And the base always sits inside its own fan.
    for (let i = 0; i < mid.years.length; i++) {
      expect(mid.years[i].netWorth).toBeGreaterThanOrEqual(low.years[i].netWorth);
      expect(mid.years[i].netWorth).toBeLessThanOrEqual(high.years[i].netWorth);
    }
  });
});

describe('headlineReturnRate', () => {
  it('reports the largest market rate, not whichever account happens to be first', () => {
    const base = plan({
      accounts: [
        asset({ id: 'a', name: 'Cash', growthRateMethod: 'noChange' }),
        asset({ id: 'b', name: 'Bonds', growthRate: 3 }),
        asset({ id: 'c', name: 'Equity', growthRate: 7 }),
      ],
    });
    expect(headlineReturnRate(base)).toBe(7);
  });

  it('sees scheduled accounts too, so the label matches what the fan flexes', () => {
    const base = plan({
      accounts: [
        asset({
          id: 'v',
          name: 'Variable',
          growthRateMethod: 'schedule',
          growthRateSchedule: [
            { year: 2026, rate: 7.5 },
            { year: 2040, rate: 4 },
          ],
        }),
      ],
    });
    expect(headlineReturnRate(base)).toBe(7.5);
  });

  it('is undefined when nothing has a market return, so the control can hide', () => {
    const base = plan({
      accounts: [asset({ id: 'a', name: 'Cash', growthRateMethod: 'noChange' })],
    });
    expect(headlineReturnRate(base)).toBeUndefined();
  });

  it('ignores excluded accounts', () => {
    const base = plan({
      accounts: [asset({ id: 'a', name: 'Old', growthRate: 20, isIncluded: false })],
    });
    expect(headlineReturnRate(base)).toBeUndefined();
  });
});
