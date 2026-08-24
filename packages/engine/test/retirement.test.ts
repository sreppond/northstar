import { describe, expect, it } from 'vitest';
import { lifeExpectancyYearFor, retirementAgeSweep } from '../src/retirement.js';
import { asset, event, plan, rule } from './fixtures.js';

const participant = { id: 'p1', name: 'A', birthYear: 1976, lifeExpectancy: 60, isIncluded: true };

describe('lifeExpectancyYearFor', () => {
  it('adds life expectancy to birth year', () => {
    expect(lifeExpectancyYearFor({ birthYear: 1976, lifeExpectancy: 60 })).toBe(2036);
  });
});

describe('retirementAgeSweep', () => {
  it('finds an early freedom year when the portfolio comfortably covers post-retirement spending', () => {
    const testPlan = plan({
      settings: {
        startYear: 2026,
        projectionYears: 6,
        inflationRate: 0,
        dollarMode: 'futureDollars',
        baselineIncome: 0,
        baselineExpenses: 40_000,
        incomeTaxRate: 0,
      },
      participants: [participant],
      accounts: [
        asset({
          id: 'inv',
          name: 'Investments',
          accountClass: 'taxableInvestment',
          initialBalance: 5_000_000,
          withdrawalTiming: 'always',
        }),
      ],
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2031 })],
      rules: [rule('inv', 'withdrawal', 1)],
    });

    const sweep = retirementAgeSweep({
      plan: testPlan,
      participantId: 'p1',
      birthYear: 1976,
      lifeExpectancyYear: 2036,
      candidateStartYears: [2026, 2031, 2036],
    });

    expect(sweep).toHaveLength(3);
    // $5M against $32K/yr (40K less the default 20% retirement cut) survives
    // retiring immediately, so every candidate -- including the earliest --
    // should read as durable.
    expect(sweep.every((c) => c.survivesToLifeExpectancy)).toBe(true);
    expect(sweep[0]).toEqual({ year: 2026, age: 50, survivesToLifeExpectancy: true });
  });

  it('finds no survivable year when even a lifetime of saving falls short of what retirement costs', () => {
    const testPlan = plan({
      settings: {
        startYear: 2026,
        projectionYears: 6,
        inflationRate: 0,
        dollarMode: 'futureDollars',
        baselineIncome: 60_000,
        baselineExpenses: 58_000,
        incomeTaxRate: 0,
      },
      participants: [participant],
      accounts: [
        asset({
          id: 'cash',
          name: 'Cash',
          accountClass: 'cash',
          initialBalance: 5_000,
          withdrawalTiming: 'always',
        }),
      ],
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2031 })],
      rules: [rule('cash', 'withdrawal', 1)],
    });

    const sweep = retirementAgeSweep({
      plan: testPlan,
      participantId: 'p1',
      birthYear: 1976,
      lifeExpectancyYear: 2036,
      candidateStartYears: [2026, 2031, 2036],
    });

    // Only $2K/yr of surplus accumulates before retiring; even retiring in
    // the very last candidate year leaves nowhere near enough to cover the
    // post-retirement gap for even one more year.
    expect(sweep.every((c) => !c.survivesToLifeExpectancy)).toBe(true);
  });

  it('checks durability through life expectancy, not the plan\'s own shorter horizon', () => {
    const testPlan = plan({
      settings: {
        startYear: 2026,
        projectionYears: 3,
        inflationRate: 0,
        dollarMode: 'futureDollars',
        baselineIncome: 0,
        baselineExpenses: 40_000,
        incomeTaxRate: 0,
      },
      participants: [participant],
      accounts: [
        asset({
          id: 'cash',
          name: 'Cash',
          accountClass: 'cash',
          initialBalance: 100_000,
          withdrawalTiming: 'always',
        }),
      ],
      // The plan's own horizon ends in 2028 -- comfortably within what
      // $100K covers at $32K/yr (40K less the default -20%). Left
      // unextended, the sweep would wrongly call this candidate durable.
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2028 })],
      rules: [rule('cash', 'withdrawal', 1)],
    });

    const sweep = retirementAgeSweep({
      plan: testPlan,
      participantId: 'p1',
      birthYear: 1976,
      lifeExpectancyYear: 2036, // ten years out -- $100K at $32K/yr runs dry well before this
      candidateStartYears: [2026],
    });

    expect(sweep[0].survivesToLifeExpectancy).toBe(false);
  });

  it('holds the retirement config fixed across candidates so a bigger spending cut survives where the default does not', () => {
    const testPlan = plan({
      settings: {
        startYear: 2026,
        projectionYears: 11,
        inflationRate: 0,
        dollarMode: 'futureDollars',
        baselineIncome: 0,
        baselineExpenses: 50_000,
        incomeTaxRate: 0,
      },
      participants: [participant],
      accounts: [
        asset({
          id: 'cash',
          name: 'Cash',
          accountClass: 'cash',
          initialBalance: 200_000,
          withdrawalTiming: 'always',
        }),
      ],
      events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2036 })],
      rules: [rule('cash', 'withdrawal', 1)],
    });

    const withDefaultCut = retirementAgeSweep({
      plan: testPlan,
      participantId: 'p1',
      birthYear: 1976,
      lifeExpectancyYear: 2036,
      candidateStartYears: [2026],
      retirementConfig: { spendingChangePercent: -20 }, // $40K/yr -- $200K covers 5 years, not the full 10
    });
    const withDeeperCut = retirementAgeSweep({
      plan: testPlan,
      participantId: 'p1',
      birthYear: 1976,
      lifeExpectancyYear: 2036,
      candidateStartYears: [2026],
      retirementConfig: { spendingChangePercent: -80 }, // $10K/yr -- $200K comfortably covers 10 years
    });

    expect(withDefaultCut[0].survivesToLifeExpectancy).toBe(false);
    expect(withDeeperCut[0].survivesToLifeExpectancy).toBe(true);
  });

  it('drops candidate years outside [plan start, life expectancy]', () => {
    const testPlan = plan({ participants: [participant], events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2030 })] });

    const sweep = retirementAgeSweep({
      plan: testPlan,
      participantId: 'p1',
      birthYear: 1976,
      lifeExpectancyYear: 2036,
      candidateStartYears: [2000, 2026, 2050],
    });

    expect(sweep.map((c) => c.year)).toEqual([2026]);
  });
});
