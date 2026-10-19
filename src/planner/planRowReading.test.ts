import { describe, expect, it } from 'vitest';
import type { PlanResult } from '@northstar/engine';
import { planRowReading } from './planRowReading';

const result = (start: number, nws: number[]) =>
  ({ years: nws.map((netWorth, i) => ({ year: start + i, netWorth })) }) as unknown as PlanResult;

describe('planRowReading (V5-REVIEW-3 M1)', () => {
  it('compares both plans at the last year they share, not each at its own last year', () => {
    const active = result(2026, [1, 2, 3, 4, 5, 100]); // runs to 2031
    const other = result(2026, [10, 20, 30, 40]); // runs to 2029
    const r = planRowReading(active, other)!;
    expect(r.year).toBe(2029);
    expect(r.value).toBe(40);
    expect(r.delta).toBe(40 - 4); // vs the active plan's 2029, not its 2031 ($100)
    expect(r.values).toEqual([10, 20, 30, 40]);
  });

  it('clips a longer other plan to the active horizon', () => {
    const active = result(2026, [1, 2, 3]);
    const other = result(2026, [5, 6, 7, 8, 9]);
    const r = planRowReading(active, other)!;
    expect(r.year).toBe(2028);
    expect(r.value).toBe(7);
    expect(r.delta).toBe(4);
    expect(r.values).toEqual([5, 6, 7]);
  });

  it('returns null when the plans share no year', () => {
    expect(planRowReading(result(2026, [1]), result(2030, [1]))).toBeNull();
  });
});
