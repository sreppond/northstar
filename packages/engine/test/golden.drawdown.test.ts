/**
 * Golden tests — drawdown capacity, overdrawn balances carried forward, and
 * the markers and deflation that read them (docs/V6.1-PLAN.md E1,
 * docs/MATH.md "Withdrawal capacity under the mid-year convention" and
 * "Overdrawn balance").
 *
 * As in golden.growth.test.ts, every expected number is derived BY HAND in
 * the comment above its assertion, so a reader can check the arithmetic
 * without trusting the engine that produced it.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { deflate } from '../src/inflation.js';
import { pathMarkers } from '../src/markers.js';
import type { PlanResult, YearSnapshot } from '../src/types.js';
import { asset, event, plan, rule } from './fixtures.js';

const yearOf = (result: PlanResult, year: number): YearSnapshot =>
  result.years.find((y) => y.year === year)!;

/**
 * The accounting identity every year must satisfy: net worth is assets less
 * liabilities, and liabilities include the overdrawn balance owed.
 */
function expectNetWorthIdentity(result: PlanResult): void {
  for (const y of result.years) {
    const loanBalances = y.accounts.filter((a) => a.isLiability).reduce((s, a) => s + a.close, 0);
    const owed = y.overdrawn?.close ?? 0;
    expect(y.liabilities).toBeCloseTo(loanBalances + owed, 6);
    expect(y.netWorth).toBeCloseTo(y.assets - y.liabilities, 6);
  }
}

describe('Golden: withdrawal capacity at the mid-year balance', () => {
  it('a $100k account at 21% drains to exactly 0, supplying $110k against a $120k need', () => {
    // Hand check. h = (1.21)^(1/2) − 1 = 1.1 − 1 = 0.1, a full year (f = 1).
    // Capacity = opening × (1 + h) = 100,000 × 1.1 = 110,000, so the waterfall
    // draws 110,000 (no tax: withdrawalTaxRate 0) and leaves 10,000 unfunded.
    // Growth on the drained account: growthBase = 100,000 − 110,000 = −10,000,
    // full-year factor F = 0.21, half-year factor H = 0.1, so
    //   growth = −10,000 × 0.21 + 110,000 × (0.21 − 0.1) = −2,100 + 12,100 = 10,000,
    //   close  = −10,000 + 10,000 = 0.
    // Before this change the capacity was the opening 100,000, which stranded
    // the 10,000 of half-year growth and closed at 10,000 (see the note in
    // docs/MATH.md "Withdrawal capacity").
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 120_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 21 })],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    const y = result.years[0];
    expect(y.withdrawals[0].amount).toBeCloseTo(110_000, 6);
    expect(y.accounts[0].withdrawals).toBeCloseTo(110_000, 6);
    expect(y.accounts[0].growth).toBeCloseTo(10_000, 6);
    expect(y.accounts[0].close).toBeCloseTo(0, 2);
    expect(y.unfundedShortfall).toBeCloseTo(10_000, 6);
    expect(y.overdrawn).toEqual({ open: 0, added: expect.any(Number), repaid: 0, close: expect.any(Number) });
    expect(y.overdrawn!.added).toBeCloseTo(10_000, 6);
    expect(y.overdrawn!.close).toBeCloseTo(10_000, 6);
  });

  it('a shrinking account (negative rate) also drains to exactly 0, not below it', () => {
    // Hand check. A −10% year: h = (0.9)^(1/2) − 1 ≈ −0.0513167, so the mid-year
    // value is 100,000 × (1 + h) ≈ 94,868.33. The waterfall can only draw that,
    // leaving 100,000 − 94,868.33 = 5,131.67 unfunded. Before this change the
    // account was drawn for its full 100,000 and closed at a NEGATIVE balance,
    // since the close is 100,000 × (r − h) = 100,000 × (−0.1 + 0.0513167) < 0.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 100_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: -10 })],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    const y = result.years[0];
    expect(y.accounts[0].withdrawals).toBeCloseTo(100_000 * Math.sqrt(0.9), 4);
    expect(y.accounts[0].close).toBeCloseTo(0, 4);
    expect(y.accounts[0].close).toBeGreaterThanOrEqual(0);
    expect(y.unfundedShortfall).toBeCloseTo(100_000 * (1 - Math.sqrt(0.9)), 4);
  });

  it('a drained annuity with fees closes at exactly 0: capacity uses gross growth', () => {
    // Hand check. $100,000 contract at 6%, full year, flat fee $100 and a 1%
    // asset fee. h = 1.06^(1/2) − 1 (gross, fees NOT netted), so capacity =
    // 100,000 × 1.06^0.5 ≈ 102,956.30 and the draw empties the contract.
    // The fee is charged on the post-draw balance and capped at what remains
    // (nothing), so it is 0 and close = (O − W)(1+r) + W(r − h) = 0.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineExpenses: 200_000 } as never,
        accounts: [
          asset({
            id: 'ann',
            name: 'Annuity',
            accountClass: 'variableAnnuity',
            initialBalance: 100_000,
            growthRate: 6,
            nonTaxableBase: 100_000,
            annuityAssetFeePercent: 1,
            annuityFlatFeeAnnual: 100,
          }),
        ],
        rules: [rule('ann', 'withdrawal', 1)],
      }),
    );
    const a = result.years[0].accounts[0];
    expect(a.withdrawals).toBeCloseTo(100_000 * Math.sqrt(1.06), 4);
    expect(a.close).toBeCloseTo(0, 2);
  });

  it('a purchase year drains a $796,207 taxable account to 0 and leaves the rest overdrawn', () => {
    // Synthetic version of the bug Spencer found (never his real data).
    // Opening 796,207 at 5%, full year, a $1,000,000 purchase in the same year.
    // h = 1.05^(1/2) − 1 ≈ 0.02469508, so capacity = 796,207 × 1.02469508
    // ≈ 815,870.6. Tax: 60% of each dollar is gain at 15%, so the effective
    // rate is 0.09 and a gross draw of 815,870.6 nets 815,870.6 × 0.91 ≈ 742,442.
    // The account closes at 0. The unfunded remainder is 1,000,000 − 742,442
    // ≈ 257,558 and is carried as overdrawn.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        events: [event({ id: 'home', kind: 'otherExpense', startYear: 2026, config: { amount: 1_000_000 } })],
        accounts: [
          asset({
            id: 'tax',
            name: 'Taxable investments',
            initialBalance: 796_207,
            growthRate: 5,
            withdrawalTaxRate: 15,
            taxableWithdrawalPercent: 60,
          }),
        ],
        rules: [rule('tax', 'withdrawal', 1)],
      }),
    );
    const y = result.years[0];
    const capacity = 796_207 * Math.pow(1.05, 0.5);
    expect(y.withdrawals[0].amount).toBeCloseTo(capacity, 4);
    expect(y.accounts[0].close).toBeCloseTo(0, 2);
    const netFromDraw = capacity * (1 - 0.09);
    expect(y.unfundedShortfall).toBeCloseTo(1_000_000 - netFromDraw, 2);
  });
});

describe('Golden: overdrawn balance carried forward', () => {
  // Shared plan, no growth so every number is a plain sum. Income 120k and
  // living costs 60k make a steady 60k surplus. A 150k one-off in 2027 is the
  // big year. Years: 2026 (year 1), 2027 (year 2, the shortfall), 2028
  // (year 3, repays first), 2029 (year 4, back to normal).
  const lifecycle = () =>
    plan({
      settings: { projectionYears: 4, baselineIncome: 120_000, baselineExpenses: 60_000 } as never,
      accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 0, growthRateMethod: 'noChange' })],
      events: [event({ id: 'big', kind: 'otherExpense', startYear: 2027, config: { amount: 150_000 } })],
      rules: [rule('b', 'allocation', 1), rule('b', 'withdrawal', 1)],
    });

  it('a one-off shortfall rises into overdrawn, and the next surplus repays it before any allocation', () => {
    const result = runPlan(lifecycle());

    // 2026: surplus 60,000, allocated in full. Brokerage = 60,000.
    expect(yearOf(result, 2026).accounts[0].close).toBeCloseTo(60_000, 6);
    expect(yearOf(result, 2026).overdrawn).toBeUndefined();

    // 2027: net = 60,000 − 150,000 = −90,000. The waterfall draws the whole
    // 60,000 (no growth, so capacity = balance), leaving 30,000 unfunded.
    // overdrawn: open 0, added 30,000, repaid 0, close 30,000.
    const y2027 = yearOf(result, 2027);
    expect(y2027.accounts[0].close).toBeCloseTo(0, 6);
    expect(y2027.unfundedShortfall).toBeCloseTo(30_000, 6);
    expect(y2027.overdrawn).toEqual({ open: 0, added: 30_000, repaid: 0, close: 30_000 });

    // 2028: net = 60,000 surplus. Repayment = min(60,000, 30,000) = 30,000,
    // pushed as the FIRST allocation line. Only the remaining 30,000 is
    // allocated to Brokerage. overdrawn: open 30,000, repaid 30,000, close 0.
    const y2028 = yearOf(result, 2028);
    expect(y2028.allocations.map((l) => l.label)).toEqual(['Paying back overdrawn', 'To Brokerage']);
    expect(y2028.allocations[0]).toEqual({
      label: 'Paying back overdrawn',
      amount: 30_000,
      category: 'overdrawnRepayment',
    });
    expect(y2028.allocations[1].amount).toBeCloseTo(30_000, 6);
    expect(y2028.accounts[0].close).toBeCloseTo(30_000, 6);
    expect(y2028.overdrawn).toEqual({ open: 30_000, added: 0, repaid: 30_000, close: 0 });

    // 2029: nothing owed, so the whole surplus is allocated and there is no
    // `overdrawn` key at all.
    const y2029 = yearOf(result, 2029);
    expect(y2029.allocations.map((l) => l.label)).toEqual(['To Brokerage']);
    expect(y2029.accounts[0].close).toBeCloseTo(90_000, 6);
    expect(y2029.overdrawn).toBeUndefined();
  });

  it('keeps net worth equal to assets minus liabilities every year, overdrawn included', () => {
    // Hand check, 2027: assets 0, liabilities 30,000 owed, so net worth = −30,000.
    // That is 90,000 lower than 2026's 60,000, exactly the 90,000 short year.
    // 2028: assets 30,000, nothing owed, so net worth = 30,000, up 60,000 on
    // the 60,000 surplus. No money is created or lost by the repayment: 30,000
    // leaves the surplus as debt paid, and 30,000 goes into the account.
    const result = runPlan(lifecycle());
    expectNetWorthIdentity(result);
    expect(yearOf(result, 2026).netWorth).toBeCloseTo(60_000, 6);
    expect(yearOf(result, 2027).netWorth).toBeCloseTo(-30_000, 6);
    expect(yearOf(result, 2028).netWorth).toBeCloseTo(30_000, 6);
  });

  it('carries a growing account\'s shortfall the same way, and the identity holds under growth', () => {
    // Same shape, but Brokerage grows at 6%. Growth changes the amounts, not
    // the mechanism, so this only checks the identity year by year and that
    // `overdrawn` reconciles: open + added − repaid = close.
    const result = runPlan(
      plan({
        settings: { projectionYears: 6, baselineIncome: 120_000, baselineExpenses: 60_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 0, growthRate: 6 })],
        events: [
          event({ id: 'big', kind: 'otherExpense', startYear: 2027, config: { amount: 200_000 } }),
          event({ id: 'later', kind: 'otherExpense', startYear: 2028, config: { amount: 20_000 } }),
        ],
        rules: [rule('b', 'allocation', 1), rule('b', 'withdrawal', 1)],
      }),
    );
    expectNetWorthIdentity(result);
    for (const y of result.years) {
      if (!y.overdrawn) continue;
      const { open, added, repaid, close } = y.overdrawn;
      expect(open + added - repaid).toBeCloseTo(close, 6);
    }
    expect(yearOf(result, 2027).overdrawn!.close).toBeGreaterThan(0);
  });
});

describe('Golden: a plan that is never short is unchanged by E1', () => {
  it('runPlan output is deep-equal to the pre-E1 engine, and no year carries overdrawn', () => {
    // A funded plan: two growing accounts, an annuity with a cost basis and
    // fees, a 401(k), 24% income tax, and withdrawals that never reach the
    // cap. The digest below is sha256(JSON.stringify(result)) recorded from
    // the engine at 10c967d, BEFORE the E1 change. Matching it means every
    // number, label and key in the output is identical, not just the totals.
    // The annuity's fee path and the cost-basis tax path are both exercised,
    // since those are where a capacity change could leak into funded draws.
    const result = runPlan(
      plan({
        settings: {
          startYear: 2026,
          projectionYears: 15,
          inflationRate: 2.5,
          dollarMode: 'futureDollars',
          baselineIncome: 260_000,
          baselineExpenses: 100_000,
          incomeTaxRate: 24,
        } as never,
        participants: [{ id: 'p1', name: 'A', birthYear: 1975, lifeExpectancy: 95, isIncluded: true }],
        accounts: [
          asset({
            id: 'cash',
            name: 'Cash',
            accountClass: 'cash',
            initialBalance: 50_000,
            growthRateMethod: 'noChange',
          }),
          asset({
            id: 'brok',
            name: 'Brok',
            initialBalance: 200_000,
            growthRate: 6.5,
            withdrawalTaxRate: 15,
            taxableWithdrawalPercent: 60,
          }),
          asset({
            id: 'k',
            name: '401k',
            accountClass: 'taxDeferredInvestment',
            initialBalance: 300_000,
            growthRate: 7,
            withdrawalTaxRate: 24,
            taxableWithdrawalPercent: 100,
          }),
          asset({
            id: 'ann',
            name: 'Annuity',
            accountClass: 'variableAnnuity',
            initialBalance: 100_000,
            growthRate: 6,
            nonTaxableBase: 60_000,
            withdrawalTaxRate: 24,
            annuityAssetFeePercent: 1,
            annuityFlatFeeAnnual: 100,
          }),
        ],
        rules: [
          rule('brok', 'allocation', 1),
          rule('cash', 'withdrawal', 1),
          rule('brok', 'withdrawal', 2),
          rule('ann', 'withdrawal', 3),
          rule('k', 'withdrawal', 4),
        ],
      }),
    );
    const digest = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    expect(digest).toBe('120f7463a354d43c62541c7c16194c97b14e66364d16fbb97bebe74b5a68cee0');

    expect(result.years.every((y) => y.overdrawn === undefined)).toBe(true);
    expect(result.years.every((y) => y.unfundedShortfall === undefined)).toBe(true);
    // Recorded totals as a second, readable check: net worth at the first and
    // last year-end, from the same pre-E1 run.
    expect(result.years[0].netWorth).toBeCloseTo(789_592, 0);
    expect(result.years[14].netWorth).toBeCloseTo(4_426_067, 0);
  });
});

describe('Golden: markers read the overdrawn span', () => {
  it('the shortfall span runs from the first short year while a balance is still owed', () => {
    // Plan: 60,000 surplus a year (as above), plus a 150,000 one-off in 2027
    // and a 40,000 one-off in 2028.
    // 2027: unfunded 30,000, close 30,000.
    // 2028: net = 60,000 − 40,000 = 20,000, all of it repays: close 30,000 − 20,000 = 10,000.
    // 2029: net 60,000 repays the last 10,000, so close 0, and 50,000 is allocated.
    // shortfallYears = years with a NEW shortfall or a balance owed at year end:
    //   2027 (30,000 new, 30,000 owed), 2028 (10,000 owed) — but not 2029 (owes 0).
    // shortfallTotal = 30,000, the sum of new shortfalls only.
    // overdrawnPeak = 30,000, the largest balance at any year end.
    const result = runPlan(
      plan({
        settings: { projectionYears: 4, baselineIncome: 120_000, baselineExpenses: 60_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 0, growthRateMethod: 'noChange' })],
        events: [
          event({ id: 'big', kind: 'otherExpense', startYear: 2027, config: { amount: 150_000 } }),
          event({ id: 'later', kind: 'otherExpense', startYear: 2028, config: { amount: 40_000 } }),
        ],
        rules: [rule('b', 'allocation', 1), rule('b', 'withdrawal', 1)],
      }),
    );
    expect(yearOf(result, 2028).overdrawn).toEqual({ open: 30_000, added: 0, repaid: 20_000, close: 10_000 });
    const m = pathMarkers(result);
    expect(m.shortfallYears).toEqual([2027, 2028]);
    expect(m.shortfallTotal).toBeCloseTo(30_000, 6);
    expect(m.overdrawnPeak).toBeCloseTo(30_000, 6);
  });

  it('reports no overdrawn peak and no shortfall years for a plan that is never short', () => {
    const m = pathMarkers(
      runPlan(
        plan({
          settings: { projectionYears: 3, baselineIncome: 120_000, baselineExpenses: 60_000 } as never,
          accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 0, growthRateMethod: 'noChange' })],
          rules: [rule('b', 'allocation', 1)],
        }),
      ),
    );
    expect(m.shortfallYears).toEqual([]);
    expect(m.shortfallTotal).toBe(0);
    expect(m.overdrawnPeak).toBe(0);
  });
});

describe('Golden: deflate scales overdrawn balances and flows separately', () => {
  it('balances take the balance deflator, flows the flow deflator, and added equals the deflated unfundedShortfall', () => {
    // Nominal lifecycle values (no inflation): 2027 open 0, added 30,000,
    // close 30,000. 2028 open 30,000, repaid 30,000, close 0. Deflating at
    // 10% from startYear 2026 (a full first year, so the stub fraction is 1):
    //   balance deflator 1.1^(1 + (year - 2026)): 1.1^2 = 1.21 (2027), 1.1^3 = 1.331 (2028)
    //   flow deflator    1.1^(year - 2026):       1.1^1 = 1.1  (2027), 1.1^2 = 1.21  (2028)
    // 2027: added 30,000 / 1.1 = 27,272.7 (a flow), close 30,000 / 1.21 = 24,793.4 (a balance).
    // 2028: open 30,000 / 1.331 = 22,539.4, repaid 30,000 / 1.21 = 24,793.4, close 0.
    // open + added - repaid != close in real dollars; the gap is inflation.
    const nominal = runPlan(
      plan({
        settings: { projectionYears: 4, baselineIncome: 120_000, baselineExpenses: 60_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 0, growthRateMethod: 'noChange' })],
        events: [event({ id: 'big', kind: 'otherExpense', startYear: 2027, config: { amount: 150_000 } })],
        rules: [rule('b', 'allocation', 1), rule('b', 'withdrawal', 1)],
      }),
    );
    const real = deflate(nominal, 10);

    const y27 = real.years.find((y) => y.year === 2027)!;
    expect(y27.overdrawn!.open).toBeCloseTo(0, 6);
    expect(y27.overdrawn!.added).toBeCloseTo(30_000 / 1.1, 6);
    expect(y27.overdrawn!.close).toBeCloseTo(30_000 / 1.21, 6);
    expect(y27.liabilities).toBeCloseTo(30_000 / 1.21, 6);
    // Cash Flow and Net Worth agree: the borrowed flow is the deflated shortfall.
    expect(y27.overdrawn!.added).toBeCloseTo(y27.unfundedShortfall!, 6);

    const y28 = real.years.find((y) => y.year === 2028)!;
    expect(y28.overdrawn!.open).toBeCloseTo(30_000 / 1.331, 6);
    expect(y28.overdrawn!.repaid).toBeCloseTo(30_000 / 1.21, 6);
    expect(y28.overdrawn!.close).toBeCloseTo(0, 6);
    // Repaid matches the deflated repayment allocation line.
    expect(y28.overdrawn!.repaid).toBeCloseTo(y28.allocations[0].amount, 6);

    // Years that never carried anything stay without the key.
    expect(real.years.find((y) => y.year === 2026)!.overdrawn).toBeUndefined();
    expect(real.years.find((y) => y.year === 2029)!.overdrawn).toBeUndefined();
  });
});
