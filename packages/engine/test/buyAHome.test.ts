/**
 * buyAHome is the architecture test.
 *
 * If synthetic accounts, event-owned cash flows and the priority waterfalls
 * compose correctly, buying a house should — with no special-casing anywhere
 * in the year loop — simultaneously add an asset, add a mortgage, drain the
 * brokerage by the down payment, and start a stream of carrying costs.
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { monthlyPayment } from '../src/accounts.js';
import { asset, event, plan, rule } from './fixtures.js';

const BUY_YEAR = 2029;

function housePlan(config: Record<string, unknown> = {}) {
  return plan({
    settings: {
      startYear: 2026,
      projectionYears: 10,
      inflationRate: 0,
      baselineIncome: 250_000,
      baselineExpenses: 80_000,
      incomeTaxRate: 0,
    } as never,
    accounts: [
      asset({ id: 'c', name: 'Cash', accountClass: 'cash', initialBalance: 25_000, growthRateMethod: 'noChange' }),
      asset({ id: 'b', name: 'Brokerage', initialBalance: 600_000, growthRateMethod: 'noChange' }),
    ],
    events: [
      event({
        id: 'h',
        kind: 'buyAHome',
        name: 'House',
        startYear: BUY_YEAR,
        config: {
          price: 1_000_000,
          downPaymentPercent: 20,
          mortgageRate: 6.5,
          termYears: 30,
          closingCostPercent: 3,
          propertyTaxRate: 1.1,
          insuranceAnnual: 2_000,
          maintenancePercent: 1,
          appreciationRate: 4,
          ...config,
        },
      }),
    ],
    rules: [rule('b', 'allocation', 1), rule('b', 'withdrawal', 1), rule('c', 'withdrawal', 2)],
  });
}

describe('buyAHome', () => {
  const result = runPlan(housePlan());
  const yearOf = (y: number) => result.years.find((s) => s.year === y)!;
  const acct = (y: number, id: string) => yearOf(y).accounts.find((a) => a.accountId === id)!;

  it('creates exactly two synthetic accounts owned by the event', () => {
    const synthetic = yearOf(BUY_YEAR).accounts.filter((a) => a.accountId.startsWith('h:'));
    expect(synthetic.map((a) => a.accountId).sort()).toEqual(['h:home', 'h:mortgage']);
  });

  it('does not put the property on the balance sheet before the purchase', () => {
    expect(acct(BUY_YEAR - 1, 'h:home').close).toBe(0);
    expect(acct(BUY_YEAR - 1, 'h:mortgage').close).toBe(0);
  });

  it('books the property as an asset and the loan as a liability', () => {
    const home = acct(BUY_YEAR, 'h:home');
    const mortgage = acct(BUY_YEAR, 'h:mortgage');

    expect(home.open).toBe(1_000_000);
    expect(home.close).toBeCloseTo(1_040_000, 0); // 4% appreciation
    expect(mortgage.open).toBe(800_000);
    expect(mortgage.close).toBeLessThan(800_000); // a year of principal
  });

  it('drains the brokerage to fund the purchase', () => {
    // The clearest statement of the coupling: run the same plan with and
    // without the event. Without it the year is a surplus and nothing is
    // withdrawn; with it the brokerage is tapped for the shortfall.
    const control = runPlan({ ...housePlan(), events: [] });
    const controlBrokerage = control.years
      .find((y) => y.year === BUY_YEAR)!
      .accounts.find((a) => a.accountId === 'b')!;
    const withHouse = acct(BUY_YEAR, 'b');

    expect(controlBrokerage.withdrawals).toBe(0);
    expect(withHouse.withdrawals).toBeGreaterThan(100_000);
    expect(withHouse.close).toBeLessThan(controlBrokerage.close - 200_000);
  });

  it('sizes the withdrawal at exactly the funding gap', () => {
    // $250k income against $80k living + $230k down/closing + $23k carrying
    // + $60,678.53 mortgage = a $143,678.53 gap. No rounding slack.
    expect(acct(BUY_YEAR, 'b').withdrawals).toBeCloseTo(143_678.53, 2);
  });

  it('nets the purchase-year effect: a big asset and a big loan at once', () => {
    const before = yearOf(BUY_YEAR - 1);
    const during = yearOf(BUY_YEAR);
    expect(during.liabilities).toBeGreaterThan(750_000);
    expect(during.assets).toBeGreaterThan(before.assets);
  });

  it('charges the mortgage payment exactly once', () => {
    // The debt step owns the payment. If buyAHome also emitted it, this would
    // find two lines and the plan would be double-charged.
    const expected = monthlyPayment(800_000, 6.5, 30) * 12;
    const mortgageLines = yearOf(BUY_YEAR).expenses.filter((e) => e.accountId === 'h:mortgage');
    expect(mortgageLines).toHaveLength(1);
    expect(mortgageLines[0].amount).toBeCloseTo(expected, 0);
  });

  it('starts carrying costs in the purchase year and keeps them running', () => {
    for (const y of [BUY_YEAR, BUY_YEAR + 1, BUY_YEAR + 2]) {
      const carrying = yearOf(y).expenses.filter((e) => e.label.includes('upkeep'));
      expect(carrying).toHaveLength(1);
      expect(carrying[0].amount).toBeGreaterThan(0);
    }
    expect(yearOf(BUY_YEAR - 1).expenses.filter((e) => e.label.includes('upkeep'))).toHaveLength(0);
  });

  it('attributes every housing line back to the event', () => {
    const housing = yearOf(BUY_YEAR).expenses.filter((e) => e.category === 'housing');
    expect(housing.length).toBeGreaterThan(0);
    for (const line of housing) expect(line.sourceEventId).toBe('h');
  });

  it('amortizes the mortgage down over time', () => {
    const balances = [BUY_YEAR, BUY_YEAR + 1, BUY_YEAR + 2].map((y) => acct(y, 'h:mortgage').close);
    expect(balances[1]).toBeLessThan(balances[0]);
    expect(balances[2]).toBeLessThan(balances[1]);
  });
});

describe('buyAHome — selling', () => {
  const result = runPlan(housePlan({ sellYear: 2033, sellingCostPercent: 6 }));
  const yearOf = (y: number) => result.years.find((s) => s.year === y)!;
  const acct = (y: number, id: string) => yearOf(y).accounts.find((a) => a.accountId === id)!;

  it('closes both synthetic accounts in the sale year', () => {
    expect(acct(2033, 'h:home').close).toBe(0);
    expect(acct(2033, 'h:mortgage').close).toBe(0);
  });

  it('books sale proceeds as income and the payoff as an expense', () => {
    const y = yearOf(2033);
    expect(y.income.some((l) => l.label.includes('sale proceeds'))).toBe(true);
    expect(y.expenses.some((l) => l.label.includes('mortgage payoff'))).toBe(true);
    expect(y.expenses.some((l) => l.label.includes('selling costs'))).toBe(true);
  });

  it('stops carrying costs after the sale', () => {
    expect(yearOf(2034).expenses.filter((e) => e.label.includes('upkeep'))).toHaveLength(0);
  });
});
