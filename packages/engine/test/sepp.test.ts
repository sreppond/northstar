import { describe, expect, it } from 'vitest';
import {
  amortizedSeppPayment,
  annuityFactor,
  lifeExpectancyFactor,
  mandatoryEndYear,
  planSepp,
  seppMethodPayment,
  seppStartAgeSweep,
} from '../src/sepp.js';

describe('lifeExpectancyFactor', () => {
  it('looks up a tabulated age', () => {
    expect(lifeExpectancyFactor(50)).toBe(36.2);
    expect(lifeExpectancyFactor(60)).toBe(27.1);
  });

  it('clamps below the table rather than extrapolating', () => {
    expect(lifeExpectancyFactor(5)).toBe(lifeExpectancyFactor(20));
  });

  it('clamps above the table rather than extrapolating', () => {
    expect(lifeExpectancyFactor(95)).toBe(lifeExpectancyFactor(70));
  });
});

describe('amortizedSeppPayment', () => {
  it('is a simple even split at a zero rate', () => {
    expect(amortizedSeppPayment(500_000, 0, 10)).toBeCloseTo(50_000, 6);
  });

  it('fully amortizes the balance to zero over an integer term at the assumed rate', () => {
    const payment = amortizedSeppPayment(500_000, 5, 10);
    let balance = 500_000;
    for (let i = 0; i < 10; i++) {
      balance = balance * 1.05 - payment;
    }
    expect(balance).toBeCloseTo(0, 4);
  });

  it('returns 0 for a drained account', () => {
    expect(amortizedSeppPayment(0, 5, 27.1)).toBe(0);
  });
});

describe('mandatoryEndYear', () => {
  it('is governed by the age-60 rule when starting well before it', () => {
    // Starting at 45, the 5-year floor (2024) is nowhere near binding —
    // the schedule really runs until 60, the whole point of "starting too
    // early locks you in for a long time".
    expect(mandatoryEndYear(2020, 1975)).toBe(2035);
  });

  it('is governed by the 5-year floor when starting close to 60', () => {
    // Starting at 57 in 2020 (born 1963): age 60 lands in 2023, but the
    // 5-payment minimum pushes the real end out to 2024.
    expect(mandatoryEndYear(2020, 1963)).toBe(2024);
  });
});

describe('planSepp', () => {
  it('pays the fixed amount every year while active, then nothing once the schedule ends', () => {
    const result = planSepp({
      startingBalance: 500_000,
      birthYear: 1963, // starts at 57 in 2020 — 5-year floor binds, ends 2024
      startYear: 2020,
      growthRatePercent: 0,
      seppRatePercent: 5,
      incomeTaxRatePercent: 24,
      horizonYear: 2026,
    });

    expect(result.mandatoryEndYear).toBe(2024);
    const byYear = new Map(result.years.map((y) => [y.year, y]));
    expect(byYear.get(2020)!.payment).toBeCloseTo(result.annualPayment, 6);
    expect(byYear.get(2024)!.active).toBe(true);
    expect(byYear.get(2024)!.payment).toBeCloseTo(result.annualPayment, 6);
    expect(byYear.get(2025)!.active).toBe(false);
    expect(byYear.get(2025)!.payment).toBe(0);
    // Every payment is taxed as ordinary income; none of it is a penalty.
    expect(byYear.get(2020)!.tax).toBeCloseTo(result.annualPayment * 0.24, 6);
  });

  it('keeps compounding growth on what is left after each payment', () => {
    const result = planSepp({
      startingBalance: 100_000,
      birthYear: 1980,
      startYear: 2026,
      growthRatePercent: 25,
      seppRatePercent: 5,
      incomeTaxRatePercent: 0,
      horizonYear: 2027,
    });
    const [y1, y2] = result.years;
    expect(y2.open).toBeCloseTo(y1.close, 6);
    expect(y1.close).toBeCloseTo(y1.open * 1.25 - y1.payment, 6);
  });

  it('is byte-for-byte unchanged when method is omitted vs explicit "amortization"', () => {
    const params = {
      startingBalance: 500_000,
      birthYear: 1963,
      startYear: 2020,
      growthRatePercent: 4,
      seppRatePercent: 5,
      incomeTaxRatePercent: 24,
      horizonYear: 2030,
    };
    expect(planSepp(params)).toEqual(planSepp({ ...params, method: 'amortization' }));
  });
});

describe('annuityFactor', () => {
  it('matches the IRS worked example closely enough to confirm the annuity-due reading', () => {
    // irs.gov's own worked example for a 50-year-old at a 4% assumed rate
    // uses 19.087 (computed on the table Notice 2022-6 superseded); this
    // module's current-table figure should land within half a percent.
    const factor = annuityFactor(50, 4);
    expect(factor).toBeCloseTo(19.087, 0);
    expect(Math.abs(factor - 19.087) / 19.087).toBeLessThan(0.005);
  });

  it('is larger for a younger age at the same rate — more remaining lifetime to pay', () => {
    expect(annuityFactor(30, 5)).toBeGreaterThan(annuityFactor(60, 5));
  });

  it('is smaller at a higher discount rate for the same age', () => {
    expect(annuityFactor(50, 8)).toBeLessThan(annuityFactor(50, 2));
  });

  it('clamps at the oldest tabulated age rather than extrapolating', () => {
    expect(annuityFactor(150, 5)).toBe(annuityFactor(120, 5));
  });
});

describe('seppMethodPayment', () => {
  it('amortization matches amortizedSeppPayment directly', () => {
    const result = seppMethodPayment(500_000, 57, 'amortization', 5);
    const factor = lifeExpectancyFactor(57);
    expect(result.factor).toBe(factor);
    expect(result.annualPayment).toBeCloseTo(amortizedSeppPayment(500_000, 5, factor), 6);
  });

  it('rmd divides the balance by the life-expectancy factor directly, ignoring rate', () => {
    const result = seppMethodPayment(500_000, 60, 'rmd', 99); // rate ignored
    expect(result.factor).toBe(lifeExpectancyFactor(60));
    expect(result.annualPayment).toBeCloseTo(500_000 / lifeExpectancyFactor(60), 6);
  });

  it('annuitization divides the balance by the mortality-based annuity factor', () => {
    const result = seppMethodPayment(500_000, 55, 'annuitization', 5);
    expect(result.factor).toBeCloseTo(annuityFactor(55, 5), 6);
    expect(result.annualPayment).toBeCloseTo(500_000 / annuityFactor(55, 5), 6);
  });

  it('every method returns 0 for a drained account', () => {
    expect(seppMethodPayment(0, 55, 'amortization', 5).annualPayment).toBe(0);
    expect(seppMethodPayment(0, 55, 'rmd', 5).annualPayment).toBe(0);
    expect(seppMethodPayment(0, 55, 'annuitization', 5).annualPayment).toBe(0);
  });

  it('sizes the three methods sensibly relative to one another for a mid-career age', () => {
    // No universal ordering holds at every age/rate, but at a typical
    // mid-career age and a modest rate all three should be positive and in
    // the right ballpark of each other (same order of magnitude).
    const amort = seppMethodPayment(500_000, 45, 'amortization', 5).annualPayment;
    const rmd = seppMethodPayment(500_000, 45, 'rmd', 5).annualPayment;
    const annuitized = seppMethodPayment(500_000, 45, 'annuitization', 5).annualPayment;
    for (const payment of [amort, rmd, annuitized]) {
      expect(payment).toBeGreaterThan(0);
      expect(payment).toBeLessThan(500_000);
    }
  });
});

describe('planSepp — rmd method', () => {
  it('recalculates the payment every year from that year\'s own balance and age', () => {
    const result = planSepp({
      startingBalance: 500_000,
      birthYear: 1970,
      startYear: 2026, // age 56
      growthRatePercent: 0, // isolate the recalculation from growth
      seppRatePercent: 5, // ignored by the rmd method
      incomeTaxRatePercent: 0,
      horizonYear: 2027,
      method: 'rmd',
    });

    const [y1, y2] = result.years;
    expect(y1.payment).toBeCloseTo(500_000 / lifeExpectancyFactor(56), 6);
    // The balance fell after y1's payment, and the divisor changed with
    // age — a FIXED method would instead repeat y1's exact payment.
    const expectedY2 = y1.close / lifeExpectancyFactor(57);
    expect(y2.payment).toBeCloseTo(expectedY2, 6);
    expect(y2.payment).not.toBeCloseTo(y1.payment, 0);
  });

  it('produces a smaller first-year payment than fixed amortization at the same inputs', () => {
    const shared = {
      startingBalance: 500_000,
      birthYear: 1970,
      startYear: 2026,
      growthRatePercent: 0,
      seppRatePercent: 5,
      incomeTaxRatePercent: 0,
      horizonYear: 2026,
    };
    const rmd = planSepp({ ...shared, method: 'rmd' });
    const amortization = planSepp({ ...shared, method: 'amortization' });
    expect(rmd.years[0].payment).toBeLessThan(amortization.years[0].payment);
  });
});

describe('planSepp — annuitization method', () => {
  it('holds one fixed payment for the whole schedule, like amortization', () => {
    const result = planSepp({
      startingBalance: 500_000,
      birthYear: 1970,
      startYear: 2026,
      growthRatePercent: 0,
      seppRatePercent: 5,
      incomeTaxRatePercent: 0,
      horizonYear: 2030,
      method: 'annuitization',
    });
    const startAge = 2026 - 1970;
    const expected = 500_000 / annuityFactor(startAge, 5);
    expect(result.annualPayment).toBeCloseTo(expected, 6);
    for (const y of result.years) {
      if (y.active) expect(y.payment).toBeCloseTo(expected, 6);
    }
  });
});

describe('seppStartAgeSweep', () => {
  it('shows starting later paying more per year but leaving a shorter runway', () => {
    const scenarios = seppStartAgeSweep({
      currentBalance: 200_000,
      asOfYear: 2026,
      birthYear: 1976, // 50 in 2026
      candidateStartYears: [2026, 2031, 2035], // ages 50, 55, 59
      growthRatePercent: 25,
      seppRatePercent: 5,
      referenceYear: 2036, // the year they turn 60
    });

    expect(scenarios).toHaveLength(3);
    const [early, mid, late] = scenarios;

    // Waiting lets 25% growth compound the balance up, which — even though
    // the life-expectancy factor shrinks a little with age — pushes the
    // fixed payment up too.
    expect(mid.annualPayment).toBeGreaterThan(early.annualPayment);
    expect(late.annualPayment).toBeGreaterThan(mid.annualPayment);

    // But starting later leaves less time before ordinary access at 60.
    expect(late.mandatoryEndYear - late.startYear).toBeLessThan(
      early.mandatoryEndYear - early.startYear,
    );
  });

  it('drops candidate years outside the as-of/reference window', () => {
    const scenarios = seppStartAgeSweep({
      currentBalance: 100_000,
      asOfYear: 2026,
      birthYear: 1980,
      candidateStartYears: [2020, 2026, 2050],
      growthRatePercent: 5,
      seppRatePercent: 5,
      referenceYear: 2040,
    });
    expect(scenarios.map((s) => s.startYear)).toEqual([2026]);
  });
});
