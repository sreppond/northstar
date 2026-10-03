/**
 * Golden tests — RMD start age & divisor, SEPP amount, annuity fees &
 * surrender, goals funding progress, and the retirement-age sweep
 * (docs/ROADMAP-10.md "Track A: Truth", docs/MATH.md).
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { RMD_START_AGE, requiredMinimumDistribution, uniformLifetimeDivisor } from '../src/rmd.js';
import { amortizedSeppPayment, lifeExpectancyFactor, planSepp } from '../src/sepp.js';
import { annuityFeeForYear, surrenderCharge } from '../src/annuity.js';
import { goalFundingProgress, requiredAnnualContribution } from '../src/goals.js';
import { retirementAgeSweep } from '../src/retirement.js';
import { asset, plan } from './fixtures.js';

describe('Golden: RMD start age and divisor', () => {
  it('forces nothing the year before RMD_START_AGE, and exactly balance/divisor at it', () => {
    expect(RMD_START_AGE).toBe(73);
    expect(requiredMinimumDistribution(1_000_000, 72)).toBe(0);
    // Hand check: the Uniform Lifetime Table gives divisor 26.5 at 73.
    expect(uniformLifetimeDivisor(73)).toBe(26.5);
    expect(requiredMinimumDistribution(1_000_000, 73)).toBeCloseTo(1_000_000 / 26.5, 6);
    expect(requiredMinimumDistribution(1_000_000, 73)).toBeCloseTo(37_735.85, 2);
  });

  it('runs end-to-end through runPlan at exactly RMD_START_AGE', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        participants: [{ id: 'p1', name: 'A', birthYear: 1953, lifeExpectancy: 90, isIncluded: true }], // age 73 in 2026
        accounts: [
          asset({ id: 'd', name: '401(k)', accountClass: 'taxDeferredInvestment', initialBalance: 1_000_000 }),
        ],
      }),
    );
    const rmd = result.years[0].income.find((l) => l.label.startsWith('Required minimum distribution'));
    expect(rmd?.amount).toBeCloseTo(1_000_000 / 26.5, 2);
  });
});

describe('Golden: SEPP (72(t)) amount, Fixed Amortization Method', () => {
  it('matches payment = balance × r / (1 − (1+r)^−n), n = the life-expectancy factor', () => {
    // Age 50's Single Life Expectancy factor is 36.2. Hand check:
    // 500,000 * 0.05 / (1 - 1.05^-36.2) ≈ 30,156.12.
    expect(lifeExpectancyFactor(50)).toBe(36.2);
    const expected = (500_000 * 0.05) / (1 - Math.pow(1.05, -36.2));
    expect(amortizedSeppPayment(500_000, 5, 36.2)).toBeCloseTo(expected, 6);
    expect(amortizedSeppPayment(500_000, 5, 36.2)).toBeCloseTo(30_156.12, 2);
  });

  it('takes the SAME fixed payment every year regardless of what the balance does', () => {
    const result = planSepp({
      startingBalance: 500_000,
      birthYear: 1976, // age 50 in 2026
      startYear: 2026,
      growthRatePercent: 7,
      seppRatePercent: 5,
      incomeTaxRatePercent: 0,
      horizonYear: 2030,
    });
    const payments = result.years.map((y) => y.payment);
    expect(new Set(payments.map((p) => Math.round(p * 100))).size).toBe(1); // all identical
    expect(payments[0]).toBeCloseTo(30_156.12, 2);
  });
});

describe('Golden: annuity fees and surrender schedule', () => {
  it('sums the flat fee and the (compounded) asset-based percentage against the mid-year value', () => {
    // Hand check: mid-year value = 100,000 + 10,000/2 = 105,000.
    // Asset-based fee at a full year (rate = the plain percent): 105,000 *
    // 0.01 = 1,050. Flat fee: 240. Total: 1,290.
    const fee = annuityFeeForYear({ annuityFlatFeeAnnual: 240, annuityAssetFeePercent: 1 }, 100_000, 10_000, 1);
    expect(fee).toBeCloseTo(1_290, 6);
  });

  it('charges the surrender percent listed for the current CONTRACT year, and nothing past the schedule', () => {
    const schedule = [{ year: 1, percent: 7 }, { year: 2, percent: 6 }];
    // Hand check: $50,000 gross in contract year 1 loses 7% = $3,500.
    expect(surrenderCharge(50_000, 1, schedule)).toBeCloseTo(3_500, 6);
    expect(surrenderCharge(50_000, 2, schedule)).toBeCloseTo(3_000, 6);
    expect(surrenderCharge(50_000, 3, schedule)).toBe(0); // past the schedule
  });
});

describe('Golden: goals funding progress', () => {
  it('derives the level annual contribution a goal needs, and reports it fully funded once reached', () => {
    // Hand check: $100,000 target by 2031, $20,000 already earmarked,
    // starting 2026: (100,000 - 20,000) / (2031 - 2026) = $16,000/yr.
    const required = requiredAnnualContribution(
      { id: 'g', name: 'House down payment', kind: 'house', targetAmount: 100_000, byYear: 2031, fundedFromAccountIds: ['save'] },
      { currentYear: 2026, earmarkedBalance: 20_000 },
    );
    expect(required).toBeCloseTo(16_000, 6);

    // Income - expenses is set to EXACTLY the required $16,000/yr so there
    // is no excess surplus left to sweep into 'save' on top of the capped
    // allocation — 'save' is the plan's only asset account, so it would
    // also catch any unallocated remainder as the fallback sweep target,
    // which would overfund the goal and defeat this check.
    const testPlan = plan({
      settings: { startYear: 2026, projectionYears: 5, baselineIncome: 116_000, baselineExpenses: 100_000 } as never,
      accounts: [asset({ id: 'save', name: 'Savings', accountClass: 'cash', initialBalance: 20_000, growthRateMethod: 'noChange' })],
      rules: [{ accountId: 'save', ruleType: 'allocation', order: 1, config: { maxAnnual: required } }],
      goals: [{ id: 'g', name: 'House down payment', kind: 'house', targetAmount: 100_000, byYear: 2031, fundedFromAccountIds: ['save'] }],
    });
    const result = runPlan(testPlan);
    // 5 years of exactly $16,000/yr on top of the $20,000 start, no growth:
    // 20,000 + 16,000 * 5 = 100,000 — funded exactly at the target date.
    const progress = goalFundingProgress(testPlan, result);
    expect(progress[0].byYearBalance).toBeCloseTo(100_000, 2);
    expect(progress[0].byYearFraction).toBeCloseTo(1, 4);
    expect(progress[0].funded).toBe(true);
  });
});

describe('Golden: the retirement-age sweep', () => {
  it('flags an early retirement candidate as failing and a late one as surviving, holding everything else fixed', () => {
    // A short, deliberately tight scenario: $100k/yr income, $90k/yr
    // expenses pre-retirement (a $10k/yr surplus swept into savings), a
    // $50,000 starting balance, and a participant who dies (life
    // expectancy) in 2040. Retiring drops income to 0% and expenses by only
    // 20% (the module defaults) — so retiring EARLY, with barely any
    // savings built up, cannot possibly cover ~$72k/yr of expenses with no
        // income for the remaining decade; retiring LATE, with over a decade of
    // $10k/yr surplus banked, comfortably covers the one or two years left.
    const base = plan({
      settings: { startYear: 2026, projectionYears: 1, baselineIncome: 100_000, baselineExpenses: 90_000 } as never,
      participants: [{ id: 'p1', name: 'A', birthYear: 1990, lifeExpectancy: 50, isIncluded: true }], // dies 2040
      accounts: [asset({ id: 'sv', name: 'Savings', accountClass: 'cash', initialBalance: 50_000, growthRateMethod: 'noChange' })],
      // Without a withdrawal rule, a shortfall has nowhere to draw from at
      // all — it goes straight to `unfundedShortfall` regardless of how
      // much sits in `sv`, which would make every candidate "fail" for the
      // wrong reason.
      rules: [{ accountId: 'sv', ruleType: 'withdrawal', order: 1 }],
    });

    const candidates = retirementAgeSweep({
      plan: base,
      participantId: 'p1',
      birthYear: 1990,
      lifeExpectancyYear: 2040,
      candidateStartYears: [2030, 2039],
    });

    const early = candidates.find((c) => c.year === 2030)!;
    const late = candidates.find((c) => c.year === 2039)!;
    expect(early.survivesToLifeExpectancy).toBe(false);
    expect(late.survivesToLifeExpectancy).toBe(true);
  });
});
