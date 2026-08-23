import { describe, expect, it } from 'vitest';
import {
  amortizedSeppPayment,
  lifeExpectancyFactor,
  mandatoryEndYear,
  planSepp,
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
