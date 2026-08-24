import { describe, expect, it } from 'vitest';
import { RMD_START_AGE, requiredMinimumDistribution, uniformLifetimeDivisor } from '../src/rmd.js';

describe('uniformLifetimeDivisor', () => {
  it('looks up a tabulated age', () => {
    expect(uniformLifetimeDivisor(73)).toBe(26.5);
    expect(uniformLifetimeDivisor(90)).toBe(12.2);
  });

  it('clamps below the table rather than extrapolating', () => {
    expect(uniformLifetimeDivisor(40)).toBe(uniformLifetimeDivisor(72));
  });

  it('clamps above the table rather than extrapolating', () => {
    expect(uniformLifetimeDivisor(150)).toBe(uniformLifetimeDivisor(120));
  });
});

describe('requiredMinimumDistribution', () => {
  it('is 0 before RMD_START_AGE', () => {
    expect(requiredMinimumDistribution(1_000_000, RMD_START_AGE - 1)).toBe(0);
  });

  it('divides the balance by the tabulated divisor at RMD_START_AGE', () => {
    expect(requiredMinimumDistribution(1_000_000, RMD_START_AGE)).toBeCloseTo(1_000_000 / 26.5, 6);
  });

  it('returns 0 for a drained account', () => {
    expect(requiredMinimumDistribution(0, 80)).toBe(0);
  });

  it('grows as the divisor shrinks with age, even on a falling balance', () => {
    const early = requiredMinimumDistribution(1_000_000, 73) / 1_000_000;
    const late = requiredMinimumDistribution(1_000_000, 90) / 1_000_000;
    expect(late).toBeGreaterThan(early);
  });
});
