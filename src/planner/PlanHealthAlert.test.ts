import { describe, expect, it } from 'vitest';
import { runPlan } from '@northstar/engine';
import { planHealth } from './health';
import { strandedClauses } from './PlanHealthAlert';
import { runsDryPlan } from './planFixtures';

describe('strandedClauses (V5-REVIEW-1 F6)', () => {
  it('names the stranded account classes and what is wrong with them', () => {
    const plan = runsDryPlan();
    const health = planHealth(runPlan(plan), plan);
    const clauses = strandedClauses(health.stranded);
    expect(clauses).toHaveLength(1);
    expect(clauses[0].reason).toBe('never');
    expect(clauses[0].text).toMatch(/Tax-deferred.* is set to never withdraw$/);
    expect(clauses[0].total).toBeGreaterThan(400_000);
  });

  it('groups by reason, biggest pile first, and joins several classes', () => {
    const clauses = strandedClauses([
      { accountId: 'a', accountClass: 'taxDeferredInvestment', balance: 500_000, reason: 'never' },
      { accountId: 'b', accountClass: 'variableAnnuity', balance: 300_000, reason: 'never' },
      { accountId: 'c', accountClass: 'taxFreeInvestment', balance: 900_000, reason: 'penalty' },
    ]);
    expect(clauses.map((c) => c.reason)).toEqual(['penalty', 'never']);
    expect(clauses[1].text).toContain('Tax-deferred investments and Variable annuity are set to never withdraw');
  });

  it('says nothing when nothing is stranded', () => {
    expect(strandedClauses([])).toEqual([]);
  });
});
