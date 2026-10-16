/**
 * Children as members of the household, with costs that follow their age
 * (docs/REDESIGN-V4.md §4.3).
 *
 * The stage template is a starting point, not a claim: national ballpark
 * figures in today's dollars, monthly, labelled as such in the UI and every
 * one editable afterwards. Housing and transport are deliberately absent —
 * those are shared costs that a child changes the size of, not a line the
 * child owns.
 */
import type { Account, Anchor, BudgetLine, Plan } from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';

export type ChildcareChoice = 'daycare' | 'nanny' | 'parent';
export type SchoolChoice = 'public' | 'private';
export type CollegeChoice = 'none' | 'inState' | 'outOfState' | 'private';

export interface KidOptions {
  childcare: ChildcareChoice;
  school: SchoolChoice;
  college: CollegeChoice;
  /** Monthly 529 savings from birth to 18; 0 for none. */
  collegeSavingsMonthly: number;
}

export const KID_DEFAULTS: KidOptions = {
  childcare: 'daycare',
  school: 'public',
  college: 'inState',
  collegeSavingsMonthly: 0,
};

/** Monthly, today's dollars. Rounded national ballparks — the UI says so. */
export const KID_COSTS = {
  arrival: 4_500,
  childcare: { daycare: 1_400, nanny: 3_200, parent: 0 } satisfies Record<ChildcareChoice, number>,
  afterSchool: { daycare: 400, nanny: 400, parent: 0 } satisfies Record<ChildcareChoice, number>,
  babyGear: 200,
  foodAndClothing: 500,
  healthcare: 150,
  activities: 250,
  privateSchool: 1_300,
  college: { none: 0, inState: 2_300, outOfState: 3_800, private: 5_000 } satisfies Record<CollegeChoice, number>,
};

export const CHILDCARE_LABEL: Record<ChildcareChoice, string> = {
  daycare: 'Daycare',
  nanny: 'Nanny',
  parent: 'A parent at home',
};

export function kidStageLines(childId: string, name: string, options: KidOptions, savingsAccountId?: string): BudgetLine[] {
  const age = (n: number): Anchor => ({ kind: 'age', participantId: childId, age: n });
  const line = (
    key: string,
    label: string,
    category: BudgetLine['category'],
    amount: number,
    from: number,
    until: number | undefined,
    extra: Partial<BudgetLine> = {},
  ): BudgetLine | null =>
    amount > 0
      ? {
          id: `${childId}-${key}`,
          name: `${name} — ${label}`,
          owner: childId,
          category,
          essential: true,
          kind: 'expense',
          cadence: 'monthly',
          amount,
          from: age(from),
          ...(until !== undefined ? { until: age(until) } : {}),
          isIncluded: true,
          ...extra,
        }
      : null;

  const lines = [
    line('arrival', 'arrival', 'other', KID_COSTS.arrival, 0, undefined, { cadence: 'once' }),
    line('childcare', CHILDCARE_LABEL[options.childcare].toLowerCase(), 'childcare', KID_COSTS.childcare[options.childcare], 0, 5, {
      growth: { kind: 'fixed', rate: 3.5 },
    }),
    line('gear', 'diapers & gear', 'personal', KID_COSTS.babyGear, 0, 3),
    line('food', 'food & clothing', 'food', KID_COSTS.foodAndClothing, 0, 18),
    line('health', 'healthcare', 'health', KID_COSTS.healthcare, 0, 18),
    line('afterschool', 'after-school care', 'childcare', KID_COSTS.afterSchool[options.childcare], 5, 13),
    line('activities', 'activities', 'personal', KID_COSTS.activities, 5, 18, { essential: false }),
    options.school === 'private' ? line('school', 'private school', 'education', KID_COSTS.privateSchool, 5, 18) : null,
    line('college', 'college', 'education', KID_COSTS.college[options.college], 18, 22, { growth: { kind: 'fixed', rate: 4 } }),
    savingsAccountId && options.collegeSavingsMonthly > 0
      ? line('529', '529 savings', 'education', options.collegeSavingsMonthly, 0, 18, {
          kind: 'saving',
          accountId: savingsAccountId,
          essential: false,
        })
      : null,
  ];
  return lines.filter((l): l is BudgetLine => l !== null);
}

/** Monthly cost at each age 0–21 in today's dollars, before growth — the Add-a-child preview. */
export function kidCostByAge(options: KidOptions): number[] {
  const lines = kidStageLines('preview', 'Preview', options);
  return Array.from({ length: 22 }, (_, age) =>
    lines
      .filter((l) => l.cadence === 'monthly' && l.kind === 'expense')
      .filter((l) => (l.from as { age: number }).age <= age && (!l.until || age < (l.until as { age: number }).age))
      .reduce((sum, l) => sum + l.amount, 0),
  );
}

export function addChild(plan: Plan, input: { name: string; birthYear: number; options: KidOptions }): Plan {
  const childId = `kid-${Math.random().toString(36).slice(2, 8)}`;
  const name = input.name.trim() || `Kid ${plan.participants.filter((p) => p.role === 'child').length + 1}`;

  let accounts = plan.accounts;
  let savingsAccountId: string | undefined;
  if (input.options.collegeSavingsMonthly > 0) {
    const account: Account = {
      ...newAccountOfType('taxFreeInvestment'),
      id: `${childId}-529`,
      name: `${name} 529`,
      initialBalance: 0,
      startYear: Math.max(plan.settings.startYear, input.birthYear),
      ownerParticipantId: undefined,
    };
    accounts = [...accounts, account];
    savingsAccountId = account.id;
  }

  return {
    ...plan,
    accounts,
    participants: [
      ...plan.participants,
      { id: childId, name, birthYear: input.birthYear, lifeExpectancy: 95, isIncluded: true, role: 'child' },
    ],
    budget: [...(plan.budget ?? []), ...kidStageLines(childId, name, input.options, savingsAccountId)],
  };
}

/** The child, every line they own, and any 529 opened for them. */
export function removeChild(plan: Plan, childId: string): Plan {
  return {
    ...plan,
    participants: plan.participants.filter((p) => p.id !== childId),
    budget: (plan.budget ?? []).filter((l) => l.owner !== childId),
    accounts: plan.accounts.filter((a) => a.id !== `${childId}-529`),
  };
}
