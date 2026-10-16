import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { lifeExpectancyFactor, seppStartOptions, seppYearRows, withSeppElection, amortizedSeppPayment } from '../src/sepp.js';
import type { Account, Plan } from '../src/types.js';
import { asset, plan, rule } from './fixtures.js';

/** A nonqualified annuity like Spencer's: $150K, $66,741 basis, flat + 0.35% fees, owner born 1996. */
function annuity(over: Partial<Account> = {}): Account {
  return asset({
    id: 'va',
    name: 'Variable annuity',
    accountClass: 'variableAnnuity',
    initialBalance: 150_000,
    nonTaxableBase: 66_741.34,
    growthRate: 7,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 24,
    penaltyRate: 10,
    penaltyFreeAge: 59.5,
    annuityFlatFeeAnnual: 240,
    annuityAssetFeePercent: 0.35,
    ...over,
  });
}

function household(accounts: Account[] = [annuity()]): Plan {
  return plan({
    settings: { projectionYears: 45 } as Plan['settings'],
    participants: [{ id: 's', name: 'Spencer', birthYear: 1996, lifeExpectancy: 95, isIncluded: true }],
    accounts: [asset({ id: 'cash', name: 'Cash', accountClass: 'cash', initialBalance: 1_000 }), ...accounts],
    rules: [rule('cash', 'withdrawal', 1), rule('va', 'withdrawal', 2), rule('va', 'allocation', 1)],
  });
}

const sepp = { startYear: 2027, method: 'amortization' as const, ratePercent: 5 };

describe('SEPP election', () => {
  const p = withSeppElection(household(), 'va', sepp);
  const rows = seppYearRows(p, runPlan(p), 'va');
  const row = (year: number) => rows.find((r) => r.year === year)!;

  it('pays a fixed amortized amount every year from the start through age 60', () => {
    // Sized on the balance at the start of 2027, at age 31.
    const open2027 = row(2027).open;
    const expected = amortizedSeppPayment(open2027, 5, lifeExpectancyFactor(31));
    expect(row(2027).payment).toBeCloseTo(expected, 6);
    expect(row(2040).payment).toBeCloseTo(expected, 6);
    expect(row(2056).payment).toBeCloseTo(expected, 6); // age 60
    expect(row(2057).payment).toBe(0); // lock over
    expect(row(2056).locked).toBe(true);
    expect(row(2057).locked).toBe(false);
  });

  it('takes no penalty, and taxes only the gain while there is gain (LIFO)', () => {
    const r = row(2027);
    expect(r.taxable).toBeCloseTo(r.payment, 6); // all gain at first
    expect(r.tax).toBeCloseTo(r.payment * 0.24, 6); // 24%, no +10%
    expect(r.basisLeft).toBeCloseTo(66_741.34, 2); // basis untouched
  });

  it('keeps contract fees running and the balance can still grow under the payment', () => {
    expect(row(2030).fees).toBeGreaterThan(240);
    expect(row(2030).close).toBeGreaterThan(row(2027).open); // 7% growth outruns a ~$7K draw
  });

  it('locks the account: no surplus lands in it while the SEPP runs', () => {
    const y = runPlan(p).years.find((x) => x.year === 2030)!;
    expect(y.allocations.some((a) => a.accountId === 'va')).toBe(false);
    expect(y.accounts.find((a) => a.accountId === 'va')!.contributions).toBe(0);
  });

  it('the RMD method recomputes from each year\'s balance', () => {
    const rmd = withSeppElection(household(), 'va', { ...sepp, method: 'rmd' });
    const r = seppYearRows(rmd, runPlan(rmd), 'va');
    const a = r.find((x) => x.year === 2027)!;
    const b = r.find((x) => x.year === 2035)!;
    expect(a.payment).toBeCloseTo(a.open / lifeExpectancyFactor(31), 6);
    expect(b.payment).toBeCloseTo(b.open / lifeExpectancyFactor(39), 6);
  });

  it('removing the election puts the plan back exactly', () => {
    const back = withSeppElection(p, 'va', undefined);
    expect(runPlan(back).years.map((y) => y.netWorth)).toEqual(runPlan(household()).years.map((y) => y.netWorth));
  });
});

describe('seppStartOptions', () => {
  it('sizes each start year on that year\'s projected balance', () => {
    const base = household();
    const result = runPlan(base);
    const opts = seppStartOptions(base, result, 'va', [2026, 2030, 2040], 'amortization', 5);
    expect(opts.map((o) => o.startYear)).toEqual([2026, 2030, 2040]);
    expect(opts[0].balance).toBe(150_000);
    const close2029 = result.years.find((y) => y.year === 2029)!.accounts.find((a) => a.accountId === 'va')!.close;
    expect(opts[1].balance).toBeCloseTo(close2029, 6);
    expect(opts[2].annualPayment).toBeGreaterThan(opts[1].annualPayment);
    expect(opts[1].lockedUntil).toBe(2056);
  });
});
