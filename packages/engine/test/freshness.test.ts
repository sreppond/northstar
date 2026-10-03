import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planFreshness, STALE_AFTER_DAYS } from '../src/freshness.js';

function planWith(startYear: number, asOfDate?: string) {
  return { settings: { startYear, asOfDate } } as const;
}

describe('planFreshness', () => {
  // `planFreshness` now reads `today`'s LOCAL calendar date (W3#6), so these
  // pre-existing cases pin TZ=UTC to keep their exact day-count arithmetic
  // deterministic regardless of the machine running the suite — the
  // dedicated non-UTC cases below are what actually exercise the fix.
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'UTC';
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('is zero days stale on the as-of date itself', () => {
    const f = planFreshness(planWith(2026, '2026-08-23'), new Date('2026-08-23T12:00:00Z'));
    expect(f.daysSinceAsOf).toBe(0);
    expect(f.isStale).toBe(false);
    expect(f.needsRollover).toBe(false);
  });

  it('counts whole days elapsed since the as-of date', () => {
    const f = planFreshness(planWith(2026, '2026-08-23'), new Date('2026-09-10T00:00:00Z'));
    // Aug 23 -> Sep 10 is 18 days (Aug has 31 days: 31-23=8 to month end, +10).
    expect(f.daysSinceAsOf).toBe(18);
  });

  it('is NOT stale at exactly the threshold, and stale one day past it', () => {
    const atThreshold = planFreshness(
      planWith(2026, '2026-01-01'),
      new Date(Date.UTC(2026, 0, 1 + STALE_AFTER_DAYS)),
    );
    expect(atThreshold.daysSinceAsOf).toBe(STALE_AFTER_DAYS);
    expect(atThreshold.isStale).toBe(false);

    const pastThreshold = planFreshness(
      planWith(2026, '2026-01-01'),
      new Date(Date.UTC(2026, 0, 2 + STALE_AFTER_DAYS)),
    );
    expect(pastThreshold.daysSinceAsOf).toBe(STALE_AFTER_DAYS + 1);
    expect(pastThreshold.isStale).toBe(true);
  });

  it('falls back to January 1st of startYear when asOfDate is unset', () => {
    const f = planFreshness(planWith(2026, undefined), new Date('2026-02-01T00:00:00Z'));
    expect(f.daysSinceAsOf).toBe(31);
  });

  it('flags a rollover once the real calendar year passes startYear', () => {
    const sameYear = planFreshness(planWith(2026, '2026-01-01'), new Date('2026-12-31T00:00:00Z'));
    expect(sameYear.needsRollover).toBe(false);

    const nextYear = planFreshness(planWith(2026, '2026-01-01'), new Date('2027-01-01T00:00:00Z'));
    expect(nextYear.needsRollover).toBe(true);
  });

  // W3#6: the fix itself. An evening sync in the Pacific timezone, where the
  // UTC calendar has already turned over to tomorrow, must read "today" as
  // the local date, not misdate itself (or an early rollover offer) a day
  // ahead.
  describe('in a non-UTC timezone', () => {
    beforeEach(() => {
      process.env.TZ = 'America/Los_Angeles';
    });

    it('reads "today" as the local date, not the UTC one, in the evening', () => {
      // 2026-09-26T05:30:00Z is 2026-09-25 22:30 PDT -- still Sep 25 in Los
      // Angeles, even though the UTC calendar has already turned over to
      // Sep 26. The pre-fix UTC-only reading counted this one day staler
      // than it actually was.
      const evening = planFreshness(planWith(2026, '2026-09-25'), new Date('2026-09-26T05:30:00Z'));
      expect(evening.daysSinceAsOf).toBe(0);
      expect(evening.isStale).toBe(false);
    });

    it('does not flag needsRollover a day early on New Year\'s Eve evening', () => {
      // 2027-01-01T05:30:00Z is 2026-12-31 21:30 PST -- still Dec 31, 2026
      // locally, even though the UTC calendar already reads 2027.
      const nyeEvening = planFreshness(planWith(2026, '2026-01-01'), new Date('2027-01-01T05:30:00Z'));
      expect(nyeEvening.needsRollover).toBe(false);
    });
  });
});
