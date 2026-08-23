import { describe, expect, it } from 'vitest';
import {
  ambiguousAccounts,
  applyImport,
  classify,
  parseSnapshot,
  previewImport,
  type MonarchAccount,
  type MonarchSnapshot,
} from '../src/monarch.js';
import { asset, liability, plan } from './fixtures.js';

function mAccount(over: Partial<MonarchAccount> & Pick<MonarchAccount, 'id' | 'name'>): MonarchAccount {
  return { type: 'depository', balance: 0, ...over };
}

function snapshot(over: Partial<MonarchSnapshot> = {}): MonarchSnapshot {
  return { capturedAt: '2026-08-23', accounts: [], ...over };
}

describe('classify', () => {
  it('maps the unambiguous Monarch types', () => {
    const cases: [string, string][] = [
      ['depository', 'cash'],
      ['credit', 'creditCard'],
      ['loan', 'loan'],
      ['real_estate', 'realEstate'],
      ['vehicle', 'otherAsset'],
      ['other_liability', 'loan'],
    ];
    for (const [type, expected] of cases) {
      const result = classify(mAccount({ id: 'a', name: 'A', type }));
      expect(result).toEqual({ kind: 'mapped', accountClass: expected, via: 'type' });
    }
  });

  it('refuses to guess the tax treatment of a bare brokerage', () => {
    // The heart of the import. get_accounts returns no subtype, so a 401(k)
    // and a taxable brokerage are the same string. Guessing "taxable" would
    // drop a retirement balance into an account with no penalty and no age
    // gate, and nothing on screen would say so.
    const result = classify(mAccount({ id: 'a', name: 'Fidelity', type: 'brokerage' }));
    expect(result.kind).toBe('needsChoice');
    expect(result.kind === 'needsChoice' && result.candidates).toEqual([
      'taxableInvestment',
      'taxDeferredInvestment',
      'taxFreeInvestment',
    ]);
  });

  it('uses subtype when the capture carries it', () => {
    expect(classify(mAccount({ id: 'a', name: 'A', type: 'brokerage', subtype: '401k' }))).toEqual({
      kind: 'mapped',
      accountClass: 'taxDeferredInvestment',
      via: 'subtype',
    });
    expect(classify(mAccount({ id: 'a', name: 'A', type: 'brokerage', subtype: 'Roth IRA' }))).toEqual({
      kind: 'mapped',
      accountClass: 'taxFreeInvestment',
      via: 'subtype',
    });
  });

  it('lets a saved override settle it, beating both type and subtype', () => {
    const account = mAccount({ id: 'acct-9', name: 'A', type: 'brokerage', subtype: 'brokerage' });
    expect(classify(account, { 'acct-9': 'taxFreeInvestment' })).toEqual({
      kind: 'mapped',
      accountClass: 'taxFreeInvestment',
      via: 'override',
    });
  });

  it('ignores an override naming a class that does not exist', () => {
    const account = mAccount({ id: 'acct-9', name: 'A', type: 'depository' });
    expect(classify(account, { 'acct-9': 'crypto' })).toEqual({
      kind: 'mapped',
      accountClass: 'cash',
      via: 'type',
    });
  });

  it('reports an unrecognised type rather than dropping it silently', () => {
    expect(classify(mAccount({ id: 'a', name: 'A', type: 'nft_vault' }))).toEqual({ kind: 'unknown' });
  });
});

describe('ambiguousAccounts', () => {
  it('is unchanged by the answers given to it', () => {
    // The queue must not shrink as it is filled in, or rows shift up under the
    // pointer and the next click lands on a different account than the one
    // aimed at — filing a 401(k) as taxable with nothing on screen to say so.
    const snap = snapshot({
      accounts: [
        mAccount({ id: '1', name: 'Individual', type: 'brokerage', balance: 10_000 }),
        mAccount({ id: '2', name: '401(k)', type: 'brokerage', balance: 20_000 }),
      ],
    });

    const before = ambiguousAccounts(snap);
    const after = ambiguousAccounts({
      ...snap,
      overrides: { '1': 'taxableInvestment', '2': 'taxDeferredInvestment' },
    });

    expect(before.map((q) => q.id)).toEqual(['1', '2']);
    expect(after).toEqual(before);
  });

  it('asks nothing about accounts a subtype already settles', () => {
    const questions = ambiguousAccounts(
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Roth', type: 'brokerage', subtype: 'roth_ira', balance: 1 }),
          mAccount({ id: '2', name: 'Checking', type: 'depository', balance: 1 }),
        ],
      }),
    );
    expect(questions).toHaveLength(0);
  });

  it('does not ask about closed or hidden accounts', () => {
    const questions = ambiguousAccounts(
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Old', type: 'brokerage', balance: 5, is_active: false }),
          mAccount({ id: '2', name: 'Hidden', type: 'brokerage', balance: 5, is_hidden: true }),
        ],
      }),
    );
    expect(questions).toHaveLength(0);
  });
});

describe('previewImport', () => {
  it('folds many linked accounts into one line per class', () => {
    const report = previewImport(
      plan(),
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Chase checking', type: 'depository', balance: 4_000 }),
          mAccount({ id: '2', name: 'Ally savings', type: 'depository', balance: 21_500 }),
        ],
      }),
    );

    expect(report.lines).toHaveLength(1);
    expect(report.lines[0].accountClass).toBe('cash');
    expect(report.lines[0].after).toBe(25_500);
    expect(report.lines[0].sources.map((s) => s.name)).toEqual(['Chase checking', 'Ally savings']);
  });

  it('does not leave a floating-point tail when folding balances', () => {
    const report = previewImport(
      plan(),
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Checking', type: 'depository', balance: 8_412.55 }),
          mAccount({ id: '2', name: 'Savings', type: 'depository', balance: 41_220.1 }),
        ],
      }),
    );
    expect(report.lines[0].after).toBe(49_632.65);
  });

  it('takes liability balances as magnitudes', () => {
    // Monarch signs debt negative; the engine keeps positive magnitudes and
    // uses isLiability instead (types.ts).
    const report = previewImport(
      plan(),
      snapshot({
        accounts: [mAccount({ id: '1', name: 'Amex', type: 'credit', balance: -3_200 })],
      }),
    );
    expect(report.lines[0].after).toBe(3_200);
  });

  it('nets liabilities out of the reported net worth', () => {
    const report = previewImport(
      plan(),
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Checking', type: 'depository', balance: 10_000 }),
          mAccount({ id: '2', name: 'Amex', type: 'credit', balance: -2_000 }),
        ],
      }),
    );
    expect(report.netWorth).toBe(8_000);
  });

  it('shows the before balance from the plan it would overwrite', () => {
    const report = previewImport(
      plan({ accounts: [asset({ id: 'cash', name: 'Cash', accountClass: 'cash', initialBalance: 9_000 })] }),
      snapshot({ accounts: [mAccount({ id: '1', name: 'Chase', type: 'depository', balance: 12_000 })] }),
    );
    expect(report.lines[0]).toMatchObject({ before: 9_000, after: 12_000, isNew: false });
  });

  it('marks a class the plan does not have yet as new', () => {
    const report = previewImport(
      plan(),
      snapshot({ accounts: [mAccount({ id: '1', name: 'Chase', type: 'depository', balance: 12_000 })] }),
    );
    expect(report.lines[0].isNew).toBe(true);
    expect(report.lines[0].before).toBe(0);
  });

  it('skips closed and hidden accounts, with the reason', () => {
    const report = previewImport(
      plan(),
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Old 401k', type: 'depository', balance: 5_000, is_active: false }),
          mAccount({ id: '2', name: 'Secret', type: 'depository', balance: 900, is_hidden: true }),
        ],
      }),
    );
    expect(report.lines).toHaveLength(0);
    expect(report.skipped.map((s) => s.reason)).toEqual(['Closed in Monarch', 'Hidden in Monarch']);
  });

  it('quarantines ambiguous brokerages instead of importing them', () => {
    const report = previewImport(
      plan(),
      snapshot({
        accounts: [mAccount({ id: '1', name: 'Fidelity', type: 'brokerage', balance: 250_000 })],
      }),
    );
    expect(report.lines).toHaveLength(0);
    expect(report.needsChoice).toHaveLength(1);
    expect(report.needsChoice[0]).toMatchObject({ name: 'Fidelity', balance: 250_000 });
    // Nothing ambiguous may reach net worth — a quarantined balance that still
    // counted would make the preview total disagree with what gets applied.
    expect(report.netWorth).toBe(0);
  });

  it('annualises cashflow and reports it beside what the plan already assumes', () => {
    const report = previewImport(
      plan({ settings: { baselineIncome: 100_000, baselineExpenses: 60_000 } as never }),
      snapshot({ cashflow: { income: 45_000, expenses: -21_000, months: 3 } }),
    );
    expect(report.baseline).toEqual({
      income: 180_000,
      expenses: 84_000,
      currentIncome: 100_000,
      currentExpenses: 60_000,
    });
  });
});

describe('applyImport', () => {
  it('writes the balance and leaves every assumption alone', () => {
    // The rule the whole design turns on: Monarch knows what you have, not
    // what you expect.
    const before = plan({
      accounts: [
        asset({
          id: 'brokerage',
          name: 'Taxable investments',
          accountClass: 'taxableInvestment',
          initialBalance: 50_000,
          growthRate: 7.2,
          withdrawalTaxRate: 18,
          taxableWithdrawalPercent: 55,
        }),
      ],
    });

    const { plan: after } = applyImport(
      before,
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Vanguard', type: 'brokerage', subtype: 'brokerage', balance: 83_400 }),
        ],
      }),
    );

    const account = after.accounts[0];
    expect(account.initialBalance).toBe(83_400);
    expect(account.growthRate).toBe(7.2);
    expect(account.withdrawalTaxRate).toBe(18);
    expect(account.taxableWithdrawalPercent).toBe(55);
  });

  it('does not mutate the plan it was given', () => {
    // planStore keeps whole-plan snapshots for undo and shares structure with
    // what is on screen; an in-place write corrupts the undo stack.
    const before = plan({
      accounts: [asset({ id: 'cash', name: 'Cash', accountClass: 'cash', initialBalance: 1_000 })],
    });
    applyImport(before, snapshot({ accounts: [mAccount({ id: '1', name: 'C', balance: 9_999 })] }));
    expect(before.accounts[0].initialBalance).toBe(1_000);
  });

  it('creates a missing class from its registry defaults', () => {
    const { plan: after } = applyImport(
      plan(),
      snapshot({ accounts: [mAccount({ id: '1', name: 'Amex', type: 'credit', balance: -1_500 })] }),
    );

    const card = after.accounts.find((a) => a.accountClass === 'creditCard');
    expect(card).toMatchObject({
      initialBalance: 1_500,
      isLiability: true,
      interestRate: 22,
      withdrawalTiming: 'never',
    });
  });

  it('never overwrites a synthetic account owned by an event', () => {
    // A home and its mortgage come from a buyAHome event and are rebuilt on
    // every run. Writing a real balance onto one puts today's money on a
    // purchase that has not happened.
    const before = plan({
      accounts: [
        asset({
          id: 'home',
          name: 'New home',
          accountClass: 'realEstate',
          initialBalance: 400_000,
          isSynthetic: true,
          sourceEventId: 'buy-1',
        }),
      ],
    });

    const { plan: after } = applyImport(
      before,
      snapshot({
        accounts: [mAccount({ id: '1', name: 'Current house', type: 'real_estate', balance: 615_000 })],
      }),
    );

    const synthetic = after.accounts.find((a) => a.isSynthetic);
    expect(synthetic?.initialBalance).toBe(400_000);

    const imported = after.accounts.find((a) => a.accountClass === 'realEstate' && !a.isSynthetic);
    expect(imported?.initialBalance).toBe(615_000);
  });

  it('leaves baselines alone unless cashflow is explicitly applied', () => {
    const before = plan({ settings: { baselineIncome: 120_000, baselineExpenses: 70_000 } as never });
    const snap = snapshot({ cashflow: { income: 12_000, expenses: -6_000, months: 1 } });

    const untouched = applyImport(before, snap).plan;
    expect(untouched.settings.baselineIncome).toBe(120_000);
    expect(untouched.settings.baselineExpenses).toBe(70_000);

    const applied = applyImport(before, snap, { applyCashflow: true }).plan;
    expect(applied.settings.baselineIncome).toBe(144_000);
    expect(applied.settings.baselineExpenses).toBe(72_000);
  });

  it('records provenance only from figures the snapshot actually carries', () => {
    const bare = applyImport(
      plan(),
      snapshot({ accounts: [mAccount({ id: '1', name: 'Amex', type: 'credit', balance: -1_000 })] }),
    ).plan;
    expect(bare.accounts[0].linkedInterestRate).toBeUndefined();

    const enriched = applyImport(
      plan(),
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Amex', type: 'credit', balance: -1_000, interest_rate: 19.9, planned_payment: 2_400 }),
          mAccount({ id: '2', name: 'Visa', type: 'credit', balance: -500, interest_rate: 24.5, planned_payment: 1_200 }),
        ],
      }),
    ).plan;
    // One row fronts two cards: the worst APR is the one worth surfacing, and
    // payments are additive.
    expect(enriched.accounts[0].linkedInterestRate).toBe(24.5);
    expect(enriched.accounts[0].linkedPlannedPayment).toBe(3_600);
  });

  it('is idempotent — re-importing the same capture changes nothing', () => {
    const snap = snapshot({
      accounts: [mAccount({ id: '1', name: 'Chase', type: 'depository', balance: 33_000 })],
    });
    const once = applyImport(plan(), snap).plan;
    const twice = applyImport(once, snap).plan;
    expect(twice.accounts).toEqual(once.accounts);
  });

  it('folds into an existing liability row rather than adding a second one', () => {
    const before = plan({
      accounts: [liability({ id: 'loan', name: 'Loans', accountClass: 'loan', initialBalance: 8_000, interestRate: 5.5 })],
    });
    const { plan: after } = applyImport(
      before,
      snapshot({
        accounts: [
          mAccount({ id: '1', name: 'Student', type: 'loan', balance: -14_000 }),
          mAccount({ id: '2', name: 'Auto', type: 'loan', balance: -9_000 }),
        ],
      }),
    );
    expect(after.accounts.filter((a) => a.accountClass === 'loan')).toHaveLength(1);
    expect(after.accounts[0].initialBalance).toBe(23_000);
    expect(after.accounts[0].interestRate).toBe(5.5);
  });
});

describe('parseSnapshot', () => {
  it('accepts a capture straight from the MCP tool', () => {
    const parsed = parseSnapshot({
      capturedAt: '2026-08-23',
      accounts: [
        {
          id: '170283',
          name: 'Chase Checking',
          type: 'depository',
          balance: 8_412.55,
          institution: 'Chase',
          is_active: true,
          is_hidden: false,
        },
      ],
    });
    expect(parsed.accounts[0].institution).toBe('Chase');
  });

  it('tolerates the nulls Monarch returns for absent fields', () => {
    const parsed = parseSnapshot({
      capturedAt: '2026-08-23',
      accounts: [{ id: '1', name: 'A', type: null, balance: null, institution: null }],
    });
    expect(parsed.accounts[0].balance).toBeNull();
  });

  it('rejects malformed JSON rather than importing garbage', () => {
    expect(() => parseSnapshot({ accounts: [] })).toThrow();
    expect(() => parseSnapshot({ capturedAt: '2026-08-23', accounts: [{ name: 'no id' }] })).toThrow();
    expect(() =>
      parseSnapshot({ capturedAt: '2026-08-23', accounts: [], cashflow: { income: 1, expenses: 1, months: 0 } }),
    ).toThrow();
  });
});
