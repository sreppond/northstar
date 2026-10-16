import { describe, expect, it } from 'vitest';
import { eventsPastHorizon, planEndYear, withHorizon, withHorizonAtLeast } from '../src/horizon.js';
import { runPlan } from '../src/run.js';
import { event, plan } from './fixtures.js';

const couple = [
  { id: 'a', name: 'A', birthYear: 1990, lifeExpectancy: 90, isIncluded: true },
  { id: 'b', name: 'B', birthYear: 1996, lifeExpectancy: 90, isIncluded: true },
];

describe('planEndYear', () => {
  it('falls back to projectionYears', () => {
    expect(planEndYear(plan({ settings: { projectionYears: 5 } as never }))).toBe(2030);
  });

  it('prefers an endOfPlan event over projectionYears', () => {
    const p = plan({ events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2046 })] });
    expect(planEndYear(p)).toBe(2046);
  });

  it('prefers the horizon setting over an endOfPlan event', () => {
    const p = plan({
      settings: { horizon: { mode: 'year', year: 2060 } } as never,
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2046 })],
    });
    expect(planEndYear(p)).toBe(2060);
  });

  it('age mode with no participant measures the youngest included adult', () => {
    const p = plan({ participants: couple, settings: { horizon: { mode: 'age', age: 95 } } as never });
    expect(planEndYear(p)).toBe(1996 + 95);
  });

  it('age mode can name a participant', () => {
    const p = plan({
      participants: couple,
      settings: { horizon: { mode: 'age', age: 90, participantId: 'a' } } as never,
    });
    expect(planEndYear(p)).toBe(2080);
  });

  it('age mode with nobody to measure falls back to the older sources', () => {
    const p = plan({ participants: [], settings: { horizon: { mode: 'age', age: 95 } } as never });
    expect(planEndYear(p)).toBe(2030);
  });

  it('never ends before the plan starts', () => {
    const p = plan({ settings: { horizon: { mode: 'year', year: 2001 } } as never });
    expect(planEndYear(p)).toBe(2026);
  });
});

describe('withHorizon', () => {
  it('drops the endOfPlan event and runPlan follows the setting', () => {
    const p = plan({ events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2030 })] });
    const next = withHorizon(p, { mode: 'year', year: 2040 });
    expect(next.events.some((e) => e.kind === 'endOfPlan')).toBe(false);
    expect(next.settings.projectionYears).toBe(15);
    expect(runPlan(next).endYear).toBe(2040);
  });

  it('withHorizonAtLeast only ever extends', () => {
    const p = plan({ settings: { horizon: { mode: 'year', year: 2050 } } as never });
    expect(withHorizonAtLeast(p, 2040)).toBe(p);
    expect(planEndYear(withHorizonAtLeast(p, 2070))).toBe(2070);
  });
});

describe('eventsPastHorizon', () => {
  it('finds a retirement set after the plan ends', () => {
    const p = plan({
      events: [
        event({ id: 'end', kind: 'endOfPlan', startYear: 2046 }),
        event({ id: 'r', kind: 'retirement', startYear: 2058 }),
        event({ id: 'k', kind: 'haveAKid', startYear: 2028 }),
      ],
    });
    expect(eventsPastHorizon(p).map((e) => e.id)).toEqual(['r']);
  });
});
