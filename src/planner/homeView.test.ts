import { describe, expect, it } from 'vitest';
import type { HomeReading, Plan } from '@northstar/engine';
import { runPlan } from '@northstar/engine';
import { applyTerms, cashCushion, currentTerms, fromDisplay, nicePrice, ownCost, toDisplay, zoneOf } from './homeView';

function reading(over: Partial<HomeReading> = {}): HomeReading {
  return {
    year: 2030,
    price: 800_000,
    cashAtClosing: 184_000,
    housingMonthly: 3_000,
    afterTaxMonthly: 15_000,
    housingShare: 20,
    savingsRate: 20,
    liquidAfterClosing: 100_000,
    reserveMonths: 8,
    ...over,
  };
}

function plan(): Plan {
  return {
    id: 'p',
    name: 'P',
    settings: {
      startYear: 2026,
      asOfDate: '2026-01-01',
      projectionYears: 20,
      inflationRate: 2,
      dollarMode: 'todaysDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 25,
    },
    participants: [{ id: 'a', name: 'A', birthYear: 1996, lifeExpectancy: 95, isIncluded: true }],
    accounts: [
      {
        id: 'cash',
        name: 'Cash',
        accountClass: 'cash',
        isLiability: false,
        initialBalance: 400_000,
        isIncluded: true,
        growthRateMethod: 'fixed',
        growthRate: 0,
        withdrawalTiming: 'always',
        withdrawalTaxRate: 0,
        taxableWithdrawalPercent: 0,
        penaltyRate: 0,
      },
    ],
    events: [{ id: 'job', kind: 'job', name: 'Job', startYear: 2026, isIncluded: true, config: { salary: 200_000, annualRaise: 0 } }],
    rules: [],
    budget: [
      {
        id: 'rent',
        name: 'Rent',
        owner: 'shared',
        category: 'housing',
        essential: true,
        kind: 'expense',
        cadence: 'monthly',
        amount: 3_000,
        growth: { kind: 'none' },
        until: { kind: 'event', eventId: 'affordability-home' },
        isIncluded: true,
      },
    ],
  };
}

describe('zoneOf', () => {
  it('lands in the strictest zone every rule passes', () => {
    expect(zoneOf(reading())).toBe('comfortable');
    expect(zoneOf(reading({ housingShare: 30 }))).toBe('stretch');
    expect(zoneOf(reading({ reserveMonths: 2 }))).toBe('housePoor');
    expect(zoneOf(reading({ shortfallYear: 2031 }))).toBe('housePoor');
  });
});

describe('display dollars', () => {
  it('round-trip, and only deflate in today\'s dollars', () => {
    const p = plan();
    expect(toDisplay(p, 1_040_400, 2028)).toBeCloseTo(1_000_000, 6);
    expect(fromDisplay(p, toDisplay(p, 123_456, 2033), 2033)).toBeCloseTo(123_456, 6);
    expect(toDisplay({ settings: { ...p.settings, dollarMode: 'futureDollars' } }, 5, 2040)).toBe(5);
    expect(nicePrice(697_600)).toBe(700_000);
  });
});

describe('ownCost / cashCushion', () => {
  it('breaks owning into its parts next to the rent it replaces', () => {
    const p = plan();
    const withHome = applyTerms(p, { ...currentTerms(p), year: 2029, price: 600_000 });
    const own = ownCost(withHome, runPlan(withHome))!;
    expect(own.parts[0].label).toBe('Mortgage');
    expect(own.parts.map((x) => x.label)).toEqual(expect.arrayContaining(['Property tax', 'Insurance', 'Upkeep']));
    expect(own.rentBefore).toBeCloseTo(3_000, 6);
    expect(own.total).toBeCloseTo(own.parts.reduce((s, x) => s + x.monthly, 0), 6);
  });

  it('shows the down payment coming out of the cushion against renting', () => {
    const p = plan();
    const withHome = applyTerms(p, { ...currentTerms(p), year: 2029, price: 600_000 });
    const c = cashCushion(withHome, runPlan(withHome));
    const i = c.years.indexOf(2029);
    expect(c.renting[i] - c.withHome[i]).toBeGreaterThan(100_000);
  });
});
