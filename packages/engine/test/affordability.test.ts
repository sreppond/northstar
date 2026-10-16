import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZONES,
  HYPOTHETICAL_HOME_ID,
  affordabilityCurve,
  fitsZone,
  maxAffordablePrice,
  readCandidate,
  withHomePurchase,
} from '../src/affordability.js';
import { runPlan } from '../src/run.js';
import type { Plan } from '../src/types.js';
import { asset, event, plan, rule } from './fixtures.js';

const [comfortable, stretch] = DEFAULT_ZONES;

/** $200K salary at 25% tax ($12,500/mo after tax), $4K/mo rent until the purchase, $250K saved. */
function renters(over: Partial<Plan> = {}): Plan {
  return plan({
    settings: { incomeTaxRate: 25, projectionYears: 40 } as Plan['settings'],
    accounts: [
      asset({ id: 'cash', name: 'Cash', accountClass: 'cash', initialBalance: 50_000 }),
      asset({ id: 'b', name: 'Brokerage', accountClass: 'taxableInvestment', initialBalance: 200_000, growthRate: 5 }),
    ],
    events: [event({ id: 'job', kind: 'job', startYear: 2026, config: { salary: 200_000, annualRaise: 0 } })],
    rules: [rule('b', 'allocation', 1), rule('cash', 'withdrawal', 1), rule('b', 'withdrawal', 2)],
    budget: [
      {
        id: 'rent',
        name: 'Rent',
        owner: 'shared',
        category: 'housing',
        essential: true,
        kind: 'expense',
        cadence: 'monthly',
        amount: 4_000,
        until: { kind: 'event', eventId: HYPOTHETICAL_HOME_ID },
        isIncluded: true,
      },
    ],
    ...over,
  });
}

describe('withHomePurchase', () => {
  it('adds a hypothetical home, and rent anchored to it stops that year', () => {
    const p = withHomePurchase(renters(), 2029, 600_000);
    const y = (year: number) => runPlan(p).years.find((x) => x.year === year)!;
    expect(y(2028).expenses.some((e) => e.budgetLineId === 'rent')).toBe(true);
    expect(y(2029).expenses.some((e) => e.budgetLineId === 'rent')).toBe(false);
    expect(y(2029).expenses.some((e) => e.accountId === `${HYPOTHETICAL_HOME_ID}:mortgage`)).toBe(true);
  });

  it('moves the plan\'s own home instead of adding a second', () => {
    const own = renters({
      events: [
        event({ id: 'job', kind: 'job', startYear: 2026, config: { salary: 200_000, annualRaise: 0 } }),
        event({ id: 'house', kind: 'buyAHome', startYear: 2034, config: { price: 2_500_000, mortgageRate: 5 } }),
      ],
    });
    const moved = withHomePurchase(own, 2030, 900_000);
    const homes = moved.events.filter((e) => e.kind === 'buyAHome');
    expect(homes).toHaveLength(1);
    expect(homes[0]).toMatchObject({ id: 'house', startYear: 2030, config: { price: 900_000, mortgageRate: 5 } });
  });
});

describe('readCandidate', () => {
  it('reads housing cost, savings rate and the reserve left after closing', () => {
    const r = readCandidate(renters(), 2030, 800_000)!;
    // 20% down + 3% closing.
    expect(r.cashAtClosing).toBeCloseTo(184_000, 0);
    expect(r.afterTaxMonthly).toBeCloseTo(12_500, 0);
    // Mortgage on $640K at 6.5% ≈ $4,045/mo plus tax, insurance and upkeep.
    expect(r.housingMonthly).toBeGreaterThan(5_000);
    expect(r.housingShare).toBeCloseTo((r.housingMonthly / r.afterTaxMonthly) * 100, 6);
    expect(r.shortfallYear).toBeUndefined();
  });

  it('a home the savings can\'t cover fails on the shortfall rule', () => {
    const r = readCandidate(renters(), 2027, 3_000_000)!;
    expect(r.shortfallYear).toBe(2027);
    expect(fitsZone(r, stretch)).toBe(false);
  });
});

describe('maxAffordablePrice / affordabilityCurve', () => {
  it('finds a comfortable price below the stretch price, and both pass their own rules', () => {
    const c = maxAffordablePrice(renters(), 2030, comfortable);
    const s = maxAffordablePrice(renters(), 2030, stretch);
    expect(c).toBeGreaterThan(0);
    expect(s).toBeGreaterThan(c);
    expect(fitsZone(readCandidate(renters(), 2030, c)!, comfortable)).toBe(true);
    expect(fitsZone(readCandidate(renters(), 2030, c + 20_000)!, comfortable)).toBe(false);
    expect(fitsZone(readCandidate(renters(), 2030, s)!, stretch)).toBe(true);
  });

  it('waiting longer lets the household afford more, and runs fast enough to draw live', () => {
    const t0 = performance.now();
    const curve = affordabilityCurve(renters(), [2027, 2030, 2033, 2036, 2039, 2042, 2045, 2048, 2051, 2054, 2057, 2060]);
    const ms = performance.now() - t0;
    expect(curve[0].byZone.stretch).toBeLessThanOrEqual(curve[2].byZone.stretch);
    expect(curve.every((p) => p.byZone.stretch >= p.byZone.comfortable)).toBe(true);
    expect(ms).toBeLessThan(3_000);
  });
});
