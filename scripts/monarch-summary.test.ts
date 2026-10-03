import { describe, expect, it } from 'vitest';
import { classify } from '../packages/engine/src/monarch.ts';
import { LIABILITY_CLASSES } from '../packages/engine/src/accountTypes.ts';
import { summarizeBalances } from './monarch-summary.mjs';

/**
 * docs/W3-REVIEW.md "Monarch-sync reporting a credit card as an asset" —
 * the terminal summary used to classify by the account's balance SIGN
 * rather than its `type`/`subtype`, so a credit card whose Monarch
 * `displayBalance` happened to be reported as non-negative counted toward
 * "assets" instead of "liabilities".
 */
describe('summarizeBalances', () => {
  it('classifies a credit card as a liability even when its reported balance is non-negative', () => {
    const snapshot = {
      capturedAt: '2026-01-01',
      accounts: [
        {
          id: '1',
          name: 'Visa',
          type: 'credit',
          subtype: null,
          balance: 2300,
          is_active: true,
          is_hidden: false,
        },
        {
          id: '2',
          name: 'Checking',
          type: 'depository',
          subtype: 'checking',
          balance: 5000,
          is_active: true,
          is_hidden: false,
        },
      ],
    };

    const result = summarizeBalances(snapshot, classify, LIABILITY_CLASSES);

    expect(result.liabilities).toBe(2300);
    expect(result.assets).toBe(5000);
    expect(result.netWorth).toBe(2700);
    expect(result.count).toBe(2);
  });

  it('still treats a negative-balance liability correctly (the ordinary case)', () => {
    const snapshot = {
      capturedAt: '2026-01-01',
      accounts: [
        {
          id: '1',
          name: 'Mortgage',
          type: 'loan',
          subtype: 'mortgage',
          balance: -300000,
          is_active: true,
          is_hidden: false,
        },
      ],
    };

    const result = summarizeBalances(snapshot, classify, LIABILITY_CLASSES);

    expect(result.liabilities).toBe(300000);
    expect(result.assets).toBe(0);
  });

  it('excludes inactive and hidden accounts from both totals', () => {
    const snapshot = {
      capturedAt: '2026-01-01',
      accounts: [
        {
          id: '1',
          name: 'Closed card',
          type: 'credit',
          subtype: null,
          balance: 500,
          is_active: false,
          is_hidden: false,
        },
        {
          id: '2',
          name: 'Hidden savings',
          type: 'depository',
          subtype: 'savings',
          balance: 1000,
          is_active: true,
          is_hidden: true,
        },
      ],
    };

    const result = summarizeBalances(snapshot, classify, LIABILITY_CLASSES);

    expect(result.assets).toBe(0);
    expect(result.liabilities).toBe(0);
    expect(result.count).toBe(0);
  });
});
