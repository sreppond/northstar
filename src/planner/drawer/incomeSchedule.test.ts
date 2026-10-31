import { describe, expect, it } from 'vitest';
import {
  addRaise,
  clampRaiseYear,
  clearOverride,
  previewRows,
  removeRaise,
  setOverride,
  updateRaise,
  type ScheduleConfig,
} from './incomeSchedule';

const span = { startYear: 2026, endYear: 2035 };

describe('clampRaiseYear', () => {
  it('keeps a year inside [startYear + 1, endYear]', () => {
    expect(clampRaiseYear(2030, span)).toBe(2030);
    expect(clampRaiseYear(2026, span)).toBe(2027);
    expect(clampRaiseYear(2099, span)).toBe(2035);
  });
});

describe('addRaise', () => {
  it('starts the first rule the year after the start, as a % raise', () => {
    const base: ScheduleConfig = { amount: 100_000, growthRate: 3 };
    const out = addRaise(base, span);
    expect(out.raises).toEqual([{ fromYear: 2027, kind: 'percent', value: 0 }]);
  });

  it('starts a new rule the year after the last one, copying its kind', () => {
    const config: ScheduleConfig = {
      amount: 100_000,
      raises: [
        { fromYear: 2028, kind: 'dollars', value: 5000 },
        { fromYear: 2030, kind: 'percent', value: 2 },
      ],
    };
    const out = addRaise(config, span);
    expect(out.raises?.at(-1)).toEqual({ fromYear: 2031, kind: 'percent', value: 0 });
    expect(out.raises).toHaveLength(3);
  });

  it('clamps the new start year to the end of the span', () => {
    const config: ScheduleConfig = { raises: [{ fromYear: 2035, kind: 'dollars', value: 1000 }] };
    expect(addRaise(config, span).raises?.at(-1)?.fromYear).toBe(2035);
  });

  it('does not change the config it was given', () => {
    const config: ScheduleConfig = { amount: 1 };
    addRaise(config, span);
    expect(config).toEqual({ amount: 1 });
  });
});

describe('updateRaise', () => {
  it('patches one rule and leaves the others alone', () => {
    const config: ScheduleConfig = {
      raises: [
        { fromYear: 2028, kind: 'percent', value: 3 },
        { fromYear: 2031, kind: 'dollars', value: 1000 },
      ],
    };
    const out = updateRaise(config, 1, { value: 2500 });
    expect(out.raises).toEqual([
      { fromYear: 2028, kind: 'percent', value: 3 },
      { fromYear: 2031, kind: 'dollars', value: 2500 },
    ]);
  });

  it('keeps the list sorted by start year when a year changes', () => {
    const config: ScheduleConfig = {
      raises: [
        { fromYear: 2028, kind: 'percent', value: 3 },
        { fromYear: 2031, kind: 'dollars', value: 1000 },
      ],
    };
    const out = updateRaise(config, 0, { fromYear: 2033 });
    expect(out.raises?.map((r) => r.fromYear)).toEqual([2031, 2033]);
    expect(out.raises?.[1]).toEqual({ fromYear: 2033, kind: 'percent', value: 3 });
  });

  it('returns the config unchanged for a missing index', () => {
    const config: ScheduleConfig = { raises: [{ fromYear: 2028, kind: 'percent', value: 3 }] };
    expect(updateRaise(config, 4, { value: 9 })).toBe(config);
  });
});

describe('removeRaise', () => {
  it('removes the rule at the index', () => {
    const config: ScheduleConfig = {
      raises: [
        { fromYear: 2028, kind: 'percent', value: 3 },
        { fromYear: 2031, kind: 'dollars', value: 1000 },
      ],
    };
    expect(removeRaise(config, 0).raises).toEqual([{ fromYear: 2031, kind: 'dollars', value: 1000 }]);
  });

  it('drops the key once the last rule is gone', () => {
    const config: ScheduleConfig = { amount: 5, raises: [{ fromYear: 2028, kind: 'percent', value: 3 }] };
    expect(removeRaise(config, 0)).toStrictEqual({ amount: 5 });
  });
});

describe('setOverride', () => {
  it('adds an override, kept sorted by year', () => {
    const config: ScheduleConfig = { overrides: [{ year: 2030, amount: 90_000 }] };
    const out = setOverride(config, 2028, 80_000);
    expect(out.overrides).toEqual([
      { year: 2028, amount: 80_000 },
      { year: 2030, amount: 90_000 },
    ]);
  });

  it('replaces an override already set for that year', () => {
    const config: ScheduleConfig = { overrides: [{ year: 2028, amount: 80_000 }] };
    expect(setOverride(config, 2028, 85_000).overrides).toEqual([{ year: 2028, amount: 85_000 }]);
  });

  it('floors a negative amount at 0', () => {
    const empty: ScheduleConfig = {};
    expect(setOverride(empty, 2028, -500).overrides).toEqual([{ year: 2028, amount: 0 }]);
  });

  it('ignores a non-finite amount', () => {
    const config: ScheduleConfig = { amount: 1 };
    expect(setOverride(config, 2028, Number.NaN)).toBe(config);
  });
});

describe('clearOverride', () => {
  it('removes only that year', () => {
    const config: ScheduleConfig = {
      overrides: [
        { year: 2028, amount: 80_000 },
        { year: 2030, amount: 90_000 },
      ],
    };
    expect(clearOverride(config, 2028).overrides).toEqual([{ year: 2030, amount: 90_000 }]);
  });

  it('returns the config unchanged when that year has no override', () => {
    const config: ScheduleConfig = { overrides: [{ year: 2030, amount: 90_000 }] };
    expect(clearOverride(config, 2028)).toBe(config);
  });

  it('drops the key once the last override is gone', () => {
    const config: ScheduleConfig = { amount: 5, overrides: [{ year: 2028, amount: 1 }] };
    expect(clearOverride(config, 2028)).toStrictEqual({ amount: 5 });
  });
});

describe('setOverride then clearOverride', () => {
  it('returns the config to its original state', () => {
    const original: ScheduleConfig = {
      amount: 50_000,
      growthRate: 2,
      raises: [{ fromYear: 2029, kind: 'dollars', value: 1500 }],
    };
    const round = clearOverride(setOverride(original, 2028, 70_000), 2028);
    expect(round).toStrictEqual(original);
  });

  it('also round-trips a config that never had overrides', () => {
    const original: ScheduleConfig = { amount: 50_000, growthRate: 2 };
    expect(clearOverride(setOverride(original, 2031, 1), 2031)).toStrictEqual(original);
  });
});

describe('previewRows', () => {
  it('matches the old closed form when there are no rules or overrides', () => {
    // 100 at 3% a year: 100, then 103, then 106.09.
    const rows = previewRows({ amount: 100, growthRate: 3 }, 2026, 2028);
    expect(rows[0].amount).toBeCloseTo(100, 10);
    expect(rows[1].amount).toBeCloseTo(103, 10);
    expect(rows[2].amount).toBeCloseTo(106.09, 10);
  });

  it('marks the first change null and reports the change after it', () => {
    const rows = previewRows({ amount: 100_000, growthRate: 3 }, 2026, 2028);
    expect(rows[0].change).toBeNull();
    expect(rows[1].change).toBeCloseTo(3000, 6);
    expect(rows[2].change).toBeCloseTo(3090, 6);
  });

  it('applies a dollar raise from its year: 100K at 3%, then +5K from 2028', () => {
    // 2026 100000; 2027 +3% = 103000 (no rule yet); 2028 +5000 = 108000; 2029 +5000 = 113000.
    const rows = previewRows(
      { amount: 100_000, growthRate: 3, raises: [{ fromYear: 2028, kind: 'dollars', value: 5000 }] },
      2026,
      2029,
    );
    expect(rows.map((r) => r.amount)).toEqual([100_000, 103_000, 108_000, 113_000]);
  });

  it('applies a percent raise that changes the rate mid-stream', () => {
    // 2026 100000; 2027 +3% = 103000; 2028 +10% = 113300; 2029 +10% = 124630.
    const rows = previewRows(
      { amount: 100_000, growthRate: 3, raises: [{ fromYear: 2028, kind: 'percent', value: 10 }] },
      2026,
      2029,
    );
    expect(rows[1].amount).toBeCloseTo(103_000, 6);
    expect(rows[2].amount).toBeCloseTo(113_300, 6);
    expect(rows[3].amount).toBeCloseTo(124_630, 6);
  });

  it('grows from an override: 2027 set to 150K, then +10% a year', () => {
    // 2026 100000; 2027 override 150000; 2028 +10% = 165000; 2029 +10% = 181500.
    const rows = previewRows(
      { amount: 100_000, growthRate: 10, overrides: [{ year: 2027, amount: 150_000 }] },
      2026,
      2029,
    );
    rows.forEach((r, i) => expect(r.amount).toBeCloseTo([100_000, 150_000, 165_000, 181_500][i], 6));
    expect(rows.map((r) => r.overridden)).toEqual([false, true, false, false]);
  });

  it('lets an override on the start year replace the base amount', () => {
    const rows = previewRows(
      { amount: 100_000, growthRate: 0, overrides: [{ year: 2026, amount: 40_000 }] },
      2026,
      2027,
    );
    expect(rows.map((r) => r.amount)).toEqual([40_000, 40_000]);
    expect(rows[0].overridden).toBe(true);
  });

  it('floors a dollar decrease at 0', () => {
    // 2026 10000; 2027 10000-15000 floors to 0; 2028 stays 0 (-15000 floors again).
    const rows = previewRows(
      { amount: 10_000, growthRate: 0, raises: [{ fromYear: 2027, kind: 'dollars', value: -15_000 }] },
      2026,
      2028,
    );
    expect(rows.map((r) => r.amount)).toEqual([10_000, 0, 0]);
    expect(rows[1].change).toBe(-10_000);
  });

  it('returns no rows when the span is empty', () => {
    expect(previewRows({ amount: 1 }, 2030, 2029)).toEqual([]);
  });
});
