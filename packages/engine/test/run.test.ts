import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { asset, event, liability, plan, rule } from './fixtures.js';

describe('runPlan — horizon', () => {
  it('uses projectionYears when there is no endOfPlan event', () => {
    const result = runPlan(plan({ settings: { projectionYears: 3 } as never }));
    expect(result.years.map((y) => y.year)).toEqual([2026, 2027, 2028]);
  });

  it('lets an endOfPlan event override the horizon', () => {
    const result = runPlan(
      plan({
        events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2030, isRequired: true })],
      }),
    );
    expect(result.endYear).toBe(2030);
    expect(result.years).toHaveLength(5);
  });
});

describe('runPlan — growth timing', () => {
  // §4.3: growth applies to the OPENING balance net of withdrawals. Money paid
  // in across year Y first earns in Y+1. Growing contributions for a full year
  // is what made a 5% account report a 7.2% return.
  it('does not grow contributions in the year they are made', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 2, baselineIncome: 50_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 10 })],
        rules: [rule('b', 'allocation', 1)],
      }),
    );

    const first = result.years[0].accounts[0];
    expect(first.contributions).toBeCloseTo(50_000, 6);
    // 10% of the opening 100k — NOT of 150k.
    expect(first.growth).toBeCloseTo(10_000, 6);
    expect(first.close).toBeCloseTo(160_000, 6);

    // The contribution earns from the following year, on the new opening base.
    expect(result.years[1].accounts[0].growth).toBeCloseTo(16_000, 6);
  });

  it('grows the balance net of a withdrawal, not the opening balance', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 20_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 10 })],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    const row = result.years[0].accounts[0];
    expect(row.withdrawals).toBeCloseTo(20_000, 6);
    expect(row.growth).toBeCloseTo(8_000, 6);
  });
});

describe('runPlan — partial first year', () => {
  const stub = () =>
    plan({
      settings: { projectionYears: 2 } as never,
      accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 5 })],
    });

  it('prorates the first year of growth and runs full years after it', () => {
    const result = runPlan(stub(), { firstYearFraction: 5 / 12 });

    // Five months of a 5% year is ~2.08%.
    expect(result.years[0].accounts[0].close).toBeCloseTo(102_083.33, 2);
    expect(result.years[1].accounts[0].close).toBeCloseTo(102_083.33 * 1.05, 2);
  });

  it('runs a whole first year by default, so a plain call is unchanged', () => {
    expect(runPlan(stub()).years[0].accounts[0].close).toBeCloseTo(105_000, 6);
  });

  it('clamps a nonsense fraction rather than inventing negative growth', () => {
    expect(runPlan(stub(), { firstYearFraction: -3 }).years[0].accounts[0].growth).toBe(0);
    expect(
      runPlan(stub(), { firstYearFraction: 9 }).years[0].accounts[0].growth,
    ).toBeCloseTo(5_000, 6);
  });

  it('charges only the elapsed months of debt interest', () => {
    const debt = () =>
      plan({
        settings: { projectionYears: 1 } as never,
        // 1%/month against a payment that exactly covers it: interest only.
        accounts: [
          liability({
            id: 'l',
            name: 'Loan',
            initialBalance: 100_000,
            interestRate: 12,
            plannedPayment: 12_000,
          }),
        ],
      });

    expect(runPlan(debt()).years[0].accounts[0].interest).toBeCloseTo(12_000, 6);
    expect(
      runPlan(debt(), { firstYearFraction: 5 / 12 }).years[0].accounts[0].interest,
    ).toBeCloseTo(5_000, 6);
  });
});

describe('runPlan — growth', () => {
  it('compounds at the fixed rate on the closing balance', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 3 } as never,
        accounts: [
          asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 10 }),
        ],
      }),
    );
    const closes = result.years.map((y) => y.accounts[0].close);
    expect(closes[0]).toBeCloseTo(110_000, 6);
    expect(closes[1]).toBeCloseTo(121_000, 6);
    expect(closes[2]).toBeCloseTo(133_100, 6);
  });

  it('holds a noChange account flat', () => {
    const result = runPlan(
      plan({
        accounts: [
          asset({
            id: 'c',
            name: 'Cash',
            accountClass: 'cash',
            initialBalance: 10_000,
            growthRateMethod: 'noChange',
            growthRate: 99,
          }),
        ],
      }),
    );
    expect(result.years.at(-1)!.accounts[0].close).toBeCloseTo(10_000, 6);
  });
});

describe('runPlan — cash flow and the waterfalls', () => {
  it('sweeps an unallocated surplus into the cash account', () => {
    const result = runPlan(
      plan({
        settings: { baselineIncome: 100_000, baselineExpenses: 60_000 } as never,
        accounts: [asset({ id: 'c', name: 'Cash', accountClass: 'cash', growthRateMethod: 'noChange' })],
      }),
    );
    expect(result.years[0].netCashFlow).toBeCloseTo(40_000, 6);
    expect(result.years[0].accounts[0].close).toBeCloseTo(40_000, 6);
  });

  it('routes surplus down the allocation order, respecting caps', () => {
    const result = runPlan(
      plan({
        settings: { baselineIncome: 100_000, baselineExpenses: 40_000 } as never,
        accounts: [
          asset({ id: 'c', name: 'Cash', accountClass: 'cash', growthRateMethod: 'noChange' }),
          asset({ id: 'b', name: 'Brokerage', growthRateMethod: 'noChange' }),
        ],
        rules: [rule('b', 'allocation', 1, { maxAnnual: 20_000 })],
      }),
    );
    const [cash, brokerage] = result.years[0].accounts;
    expect(brokerage.close).toBeCloseTo(20_000, 6);
    expect(cash.close).toBeCloseTo(40_000, 6); // the remainder sweeps
  });

  it('drains accounts in withdrawal order to cover a shortfall', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineIncome: 0, baselineExpenses: 50_000 } as never,
        accounts: [
          asset({ id: 'c', name: 'Cash', accountClass: 'cash', initialBalance: 20_000, growthRateMethod: 'noChange' }),
          asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRateMethod: 'noChange' }),
        ],
        rules: [rule('c', 'withdrawal', 1), rule('b', 'withdrawal', 2)],
      }),
    );
    const [cash, brokerage] = result.years[0].accounts;
    expect(cash.close).toBeCloseTo(0, 2);
    expect(brokerage.close).toBeCloseTo(70_000, 2);
  });

  it('grosses up a withdrawal for tax and penalty', () => {
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
    // Owner turns 36 in 2026, so the 10% penalty applies: 66,000 / 0.66 = 100,000.
    expect(result.years[0].withdrawals[0].amount).toBeCloseTo(100_000, 2);
    expect(result.years[0].accounts[0].close).toBeCloseTo(400_000, 2);
  });

  it('reports an unfunded shortfall instead of going negative', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 50_000 } as never,
        accounts: [asset({ id: 'c', name: 'Cash', accountClass: 'cash', initialBalance: 5_000, growthRateMethod: 'noChange' })],
        rules: [rule('c', 'withdrawal', 1)],
      }),
    );
    expect(result.years[0].unfundedShortfall).toBeCloseTo(45_000, 2);
    expect(result.years[0].accounts[0].close).toBeCloseTo(0, 6);
    expect(result.warnings.join(' ')).toMatch(/shortfall/i);
  });

  it('never lets an asset balance go negative', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 10, baselineExpenses: 80_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRateMethod: 'noChange' })],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    for (const y of result.years) {
      for (const a of y.accounts) expect(a.close).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('runPlan — debt', () => {
  it('services a loan and reports interest and principal separately', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 2, baselineIncome: 100_000 } as never,
        accounts: [
          asset({ id: 'c', name: 'Cash', accountClass: 'cash', growthRateMethod: 'noChange' }),
          liability({
            id: 'l',
            name: 'Car loan',
            initialBalance: 30_000,
            interestRate: 6,
            termYears: 5,
          }),
        ],
      }),
    );
    const loan = result.years[0].accounts.find((a) => a.accountId === 'l')!;
    expect(loan.interest).toBeGreaterThan(0);
    expect(loan.principal).toBeGreaterThan(0);
    expect(loan.close).toBeCloseTo(loan.open - loan.principal, 6);
    expect(result.years[0].expenses.some((e) => e.accountId === 'l')).toBe(true);
  });

  it('counts liabilities against net worth', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [
          asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRateMethod: 'noChange' }),
          liability({ id: 'l', name: 'Loan', initialBalance: 40_000, interestRate: 0 }),
        ],
      }),
    );
    const y = result.years[0];
    expect(y.netWorth).toBeCloseTo(y.assets - y.liabilities, 6);
    expect(y.netWorth).toBeLessThan(100_000);
  });
});

describe('runPlan — invariants', () => {
  const built = runPlan(
    plan({
      settings: {
        projectionYears: 20,
        inflationRate: 2.5,
        baselineIncome: 180_000,
        baselineExpenses: 90_000,
        incomeTaxRate: 24,
      } as never,
      accounts: [
        asset({ id: 'c', name: 'Cash', accountClass: 'cash', initialBalance: 20_000, growthRateMethod: 'noChange' }),
        asset({ id: 'b', name: 'Brokerage', initialBalance: 150_000, growthRate: 6.5 }),
      ],
      events: [
        event({ id: 'h', kind: 'buyAHome', name: 'House', startYear: 2031, config: { price: 900_000 } }),
        event({ id: 'k', kind: 'haveAKid', name: 'Kid', startYear: 2029, config: {} }),
        event({ id: 'j', kind: 'newJob', name: 'Job', startYear: 2028, config: { salary: 200_000 } }),
        event({ id: 'r', kind: 'retirement', name: 'Retire', startYear: 2040, config: {} }),
      ],
      rules: [
        rule('b', 'allocation', 1),
        rule('c', 'withdrawal', 1),
        rule('b', 'withdrawal', 2),
      ],
    }),
  );

  it('keeps netWorth === assets - liabilities every year', () => {
    for (const y of built.years) {
      expect(y.netWorth).toBeCloseTo(y.assets - y.liabilities, 4);
    }
  });

  it('reconciles every asset row: close === open + contributions - withdrawals + growth', () => {
    for (const y of built.years) {
      for (const a of y.accounts) {
        if (a.isLiability) continue;
        expect(a.close).toBeCloseTo(a.open + a.contributions - a.withdrawals + a.growth, 4);
      }
    }
  });

  it('reconciles every liability row: close === open - principal', () => {
    for (const y of built.years) {
      for (const a of y.accounts) {
        if (!a.isLiability) continue;
        expect(a.close).toBeCloseTo(a.open - a.principal, 4);
      }
    }
  });

  it('carries each year closing balance into the next year opening balance', () => {
    for (let i = 1; i < built.years.length; i++) {
      const prev = new Map(built.years[i - 1].accounts.map((a) => [a.accountId, a.close]));
      for (const a of built.years[i].accounts) {
        const previousClose = prev.get(a.accountId);
        if (previousClose === undefined) continue;
        // An account born this year opens at its initial balance, not at the
        // prior year's zero. The house is the case in point.
        if (previousClose === 0) continue;
        expect(a.open).toBeCloseTo(previousClose, 4);
      }
    }
  });

  it('opens a synthetic account at its initial balance in its first year', () => {
    const house = built.years
      .find((y) => y.year === 2031)!
      .accounts.find((a) => a.accountId === 'h:home')!;
    expect(built.years.find((y) => y.year === 2030)!.accounts.find((a) => a.accountId === 'h:home')!.close).toBe(0);
    expect(house.open).toBe(900_000);
  });

  it('produces no NaN anywhere in the result', () => {
    const json = JSON.stringify(built);
    expect(json).not.toMatch(/null/);
    for (const y of built.years) {
      expect(Number.isFinite(y.netWorth)).toBe(true);
      expect(Number.isFinite(y.netCashFlow)).toBe(true);
    }
  });
});
