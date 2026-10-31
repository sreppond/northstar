/**
 * Taxable gains: long-term vs active trading (docs/MATH.md "Taxable gains:
 * long-term vs active trading").
 *
 * Every expected number is derived BY HAND in the comment above its
 * assertion. Full years (no `asOfDate`) unless a test says otherwise; the
 * `plan()` fixture is a full-year plan with no tax on salary.
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { yearFractionRemaining } from '../src/partialYear.js';
import type { Account, Plan, PlanResult } from '../src/types.js';
import { asset, plan, rule } from './fixtures.js';

// A checking account pays any gains tax, so the brokerage balance is only
// ever changed by growth. It has no growth of its own.
const checking = asset({ id: 'cash', name: 'Checking', accountClass: 'cash', initialBalance: 50_000 });

/** $100K at 10% a year, active trading at 30%. */
function trading(over: Partial<Account> = {}): Account {
  return asset({
    id: 'brok',
    name: 'Brokerage',
    initialBalance: 100_000,
    growthRate: 10,
    gainsTaxTreatment: 'activeTrading',
    shortTermGainsRate: 30,
    ...over,
  });
}

/** Checking pays first, then the brokerage, so any gains tax comes out of cash. */
function withChecking(brokerage: Account, over: Partial<Plan['settings']> = {}): Plan {
  return plan({
    settings: { projectionYears: 3, ...over } as never,
    accounts: [checking, brokerage],
    rules: [rule('cash', 'withdrawal', 1), rule('brok', 'withdrawal', 2)],
  });
}

const gainsLines = (result: PlanResult, year: number) =>
  result.years.find((y) => y.year === year)!.taxes.filter((t) => t.category === 'gainsTax');

describe('active trading: each year’s gain is taxed the following year', () => {
  it('year 1 has no gains tax, year 2 pays 30% of year 1, and the account still compounds at 10%', () => {
    // Year 2026: open 100,000, growth 10% = 10,000, close 110,000.
    //   Gain G = 10,000, no carry, taxable = 10,000, tax = 10,000 × 30% = 3,000,
    //   due in 2027 (not paid in 2026).
    // Year 2027: the 3,000 line is in `taxes`, so the net cash flow is −3,000
    //   and Checking covers it. Growth still runs on the full 110,000:
    //   10% × 110,000 = 11,000, close 121,000. The tax is not taken from the
    //   account, so compounding is untouched.
    const result = runPlan(withChecking(trading()));

    expect(gainsLines(result, 2026)).toHaveLength(0);
    expect(result.years[0].accounts.find((a) => a.accountId === 'brok')!.close).toBeCloseTo(110_000, 6);

    const due = gainsLines(result, 2027);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      label: 'Tax on 2026 trading gains — Brokerage',
      category: 'gainsTax',
      accountId: 'brok',
    });
    expect(due[0].amount).toBeCloseTo(3_000, 6);

    const y2 = result.years[1];
    expect(y2.totalTaxes).toBeCloseTo(3_000, 6); // included in totalTaxes
    expect(y2.withdrawals.find((w) => w.label === 'From Checking')!.amount).toBeCloseTo(3_000, 6); // paid from cash
    expect(y2.withdrawals.some((w) => w.label === 'From Brokerage')).toBe(false); // the account is not drawn

    const brok = y2.accounts.find((a) => a.accountId === 'brok')!;
    expect(brok.growth).toBeCloseTo(11_000, 6);
    expect(brok.close).toBeCloseTo(121_000, 6);
  });

  it('a −20% year carries its loss forward and offsets the next gain', () => {
    // 2026: growth −20% of 100,000 = −20,000, close 80,000. G < 0, so the
    //   carry becomes 20,000 and nothing is taxable. No 2026 tax to pay in 2027.
    // 2027: growth +30% of 80,000 = 24,000, close 104,000. taxable =
    //   max(0, 24,000 − 20,000) = 4,000, carry = max(0, 20,000 − 24,000) = 0.
    //   Tax = 4,000 × 30% = 1,200, due in 2028.
    // 2028: schedule holds 30%; the 2027 tax of 1,200 is paid, and the
    //   plan is not expected to pay the 2028 gain (that is the final year).
    const result = runPlan(
      withChecking(
        trading({
          growthRateMethod: 'schedule',
          growthRate: 0,
          growthRateSchedule: [
            { year: 2026, rate: -20 },
            { year: 2027, rate: 30 },
          ],
        }),
      ),
    );

    const brok = (year: number) => result.years.find((y) => y.year === year)!.accounts.find((a) => a.accountId === 'brok')!;
    expect(brok(2026).close).toBeCloseTo(80_000, 6);
    expect(brok(2027).close).toBeCloseTo(104_000, 6);

    expect(gainsLines(result, 2027)).toHaveLength(0);
    const due = gainsLines(result, 2028);
    expect(due).toHaveLength(1);
    expect(due[0].label).toBe('Tax on 2027 trading gains — Brokerage');
    expect(due[0].amount).toBeCloseTo(1_200, 6);
  });

  it('an unset shortTermGainsRate uses the plan’s income tax rate', () => {
    // incomeTaxRate 25, no shortTermGainsRate: 2026 gain 10,000 × 25% = 2,500.
    const brok = asset({ id: 'brok', name: 'Brokerage', initialBalance: 100_000, growthRate: 10, gainsTaxTreatment: 'activeTrading' });
    const result = runPlan(withChecking(brok, { incomeTaxRate: 25 }));
    expect(gainsLines(result, 2027)[0].amount).toBeCloseTo(2_500, 6);
  });

  it('a stub year’s gain is included, at the compounded stub growth', () => {
    // asOfDate 2026-07-01: f = yearFractionRemaining (days left / 365). Growth
    //   is compounded over the stub, 100,000 × (1.1^f − 1) = G.
    //   Tax = G × 30%, due in 2027.
    const asOfDate = '2026-07-01';
    const f = yearFractionRemaining(2026, 2026, asOfDate);
    const gain = 100_000 * (Math.pow(1.1, f) - 1);
    const result = runPlan(withChecking(trading(), { asOfDate } as never));
    expect(result.years[0].accounts.find((a) => a.accountId === 'brok')!.growth).toBeCloseTo(gain, 6);
    expect(gainsLines(result, 2027)[0].amount).toBeCloseTo(gain * 0.3, 6);
  });

  it('gains realized in the final year are not paid, and the plan warns', () => {
    // One-year plan, 2026 only. G = 10,000, tax = 3,000. There is no 2027
    //   to pay it in, so no gains tax line appears. The warning names the
    //   account and the rounded tax.
    //   Warning: "Brokerage: $3,000 of tax on 2026 trading gains falls due after the plan ends."
    const result = runPlan(withChecking(trading(), { projectionYears: 1 }));
    expect(result.years.flatMap((y) => y.taxes).some((t) => t.category === 'gainsTax')).toBe(false);
    expect(result.warnings).toContain(
      'Brokerage: $3,000 of tax on 2026 trading gains falls due after the plan ends.',
    );
    // Compounding is untouched here too.
    expect(result.years[0].accounts.find((a) => a.accountId === 'brok')!.close).toBeCloseTo(110_000, 6);
  });

  it('a final-year tax under $1 does not warn', () => {
    // G = 10,000, rate 0.005%: tax = 10,000 × 0.005 / 100 = 0.50. Under the
    //   $1 threshold, so the warning is suppressed.
    const result = runPlan(withChecking(trading({ shortTermGainsRate: 0.005 }), { projectionYears: 1 }));
    expect(result.warnings.some((w) => w.includes('falls due after the plan ends'))).toBe(false);
  });
});

describe('long-term and unset accounts: unchanged', () => {
  it('a long-term account has no gains tax lines across years, and its balance compounds as before', () => {
    // $100K at 10%, long-term: 2027 close = 110,000 × 1.1 = 121,000.
    const result = runPlan(withChecking(asset({ id: 'brok', name: 'Brokerage', initialBalance: 100_000, growthRate: 10, gainsTaxTreatment: 'longTerm', shortTermGainsRate: 30 })));
    expect(result.years.flatMap((y) => y.taxes).some((t) => t.category === 'gainsTax')).toBe(false);
    expect(result.years[1].accounts.find((a) => a.accountId === 'brok')!.close).toBeCloseTo(121_000, 6);
    expect(result.warnings.some((w) => w.includes('trading gains'))).toBe(false);
  });

  it('a long-term withdrawal is taxed at the flat effective rate, as before', () => {
    // No checking here, so the shortfall comes from the brokerage alone.
    // Expenses 20,000 with no income, so net = −20,000.
    // Effective rate = withdrawalTaxRate × taxableWithdrawalPercent
    //   = 15% × 60% = 9%.
    // Gross = 20,000 / (1 − 0.09) = 21,978.02, tax = 21,978.02 × 9% = 1,978.02.
    const brok = asset({
      id: 'brok',
      name: 'Brokerage',
      initialBalance: 100_000,
      withdrawalTaxRate: 15,
      taxableWithdrawalPercent: 60,
      gainsTaxTreatment: 'longTerm',
    });
    const result = runPlan(plan({ settings: { projectionYears: 1, baselineExpenses: 20_000 } as never, accounts: [brok], rules: [rule('brok', 'withdrawal', 1)] }));
    const y = result.years[0];
    expect(y.withdrawals.find((w) => w.label === 'From Brokerage')!.amount).toBeCloseTo(20_000 / 0.91, 6);
    expect(y.taxes.find((t) => t.label === 'Withdrawal tax — Brokerage')!.amount).toBeCloseTo((20_000 * 0.09) / 0.91, 6);
  });

  it('an active-trading withdrawal owes no further tax, so the whole 20,000 is drawn', () => {
    // The same shortfall as above, but the account is active trading. Its
    //   gains were taxed as they arose, so the effective rate is 0: gross =
    //   net = 20,000, and no withdrawal tax line is written.
    const brok = trading({ withdrawalTaxRate: 15, taxableWithdrawalPercent: 60 });
    const result = runPlan(plan({ settings: { projectionYears: 1, baselineExpenses: 20_000 } as never, accounts: [brok], rules: [rule('brok', 'withdrawal', 1)] }));
    const y = result.years[0];
    expect(y.withdrawals.find((w) => w.label === 'From Brokerage')!.amount).toBeCloseTo(20_000, 6);
    expect(y.taxes.some((t) => t.label.startsWith('Withdrawal tax'))).toBe(false);
  });

  it('a plan with no new fields is deep-equal to the same plan marked longTerm', () => {
    // Build the same plan twice: once with the brokerage untouched, and once
    //   with `gainsTaxTreatment: 'longTerm'` and a `shortTermGainsRate` set.
    //   longTerm ignores the rate, so the two runs must match exactly.
    const base = (brok: Account): Plan =>
      plan({
        settings: { projectionYears: 5, baselineIncome: 150_000, baselineExpenses: 60_000, incomeTaxRate: 25, inflationRate: 2 } as never,
        accounts: [checking, brok],
        rules: [rule('brok', 'allocation', 1), rule('cash', 'withdrawal', 1), rule('brok', 'withdrawal', 2)],
      });
    const untouched = asset({ id: 'brok', name: 'Brokerage', initialBalance: 100_000, growthRate: 10, withdrawalTaxRate: 15, taxableWithdrawalPercent: 60 });
    const longTerm: Account = { ...untouched, gainsTaxTreatment: 'longTerm', shortTermGainsRate: 40 };

    expect(runPlan(base(longTerm))).toEqual(runPlan(base(untouched)));
  });
});
