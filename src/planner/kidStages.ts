/**
 * Editing an existing child's life stages (V5-REVIEW-1 F9).
 *
 * `kids.ts` writes a child's budget lines from four stage choices when the
 * child is added: childcare, school, college, and a 529. The old Family page
 * only ever offered those choices at creation; once the child existed, nothing
 * could change them without hand-editing lines. This reads the choices back
 * off the plan and re-applies new ones.
 *
 * Only the stage whose choice changed is rewritten, and only that stage's
 * lines (by their template ids). A line the user tuned by hand in a stage they
 * did not touch, and every other line the child owns (arrival, food, health,
 * activities), stays exactly as it is. Each stage owns exactly one line id
 * (childcare also owns its after-school companion), so re-applying never
 * stacks a second copy.
 */
import type { Account, BudgetLine, Plan } from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';
import { KID_COSTS, kidStageLines, type ChildcareChoice, type CollegeChoice, type KidOptions, type SchoolChoice } from './kids';

/** What the plan's lines say today. `null` is a stage the user has hand-edited
    into something the template cannot name; no option is then pressed. */
export interface KidChoices {
  childcare: ChildcareChoice | null;
  school: SchoolChoice;
  college: CollegeChoice | null;
  collegeSavingsMonthly: number;
}

/** The stage -> template line suffixes each owns. */
const STAGE_KEYS = {
  childcare: ['childcare', 'afterschool'],
  school: ['school'],
  college: ['college'],
  saving: ['529'],
} as const;
type Stage = keyof typeof STAGE_KEYS;

const lineId = (childId: string, key: string) => `${childId}-${key}`;
const find = (plan: Plan, childId: string, key: string) =>
  (plan.budget ?? []).find((l) => l.id === lineId(childId, key) && l.owner === childId);

export function readKidChoices(plan: Plan, childId: string): KidChoices {
  const care = find(plan, childId, 'childcare');
  const college = find(plan, childId, 'college');
  const saving = find(plan, childId, '529');

  const childcare: ChildcareChoice | null = !care
    ? 'parent'
    : /nanny/i.test(care.name)
      ? 'nanny'
      : /daycare/i.test(care.name)
        ? 'daycare'
        : null;
  const collegeChoice: CollegeChoice | null = !college
    ? 'none'
    : ((['inState', 'outOfState', 'private'] as const).find((c) => KID_COSTS.college[c] === college.amount) ?? null);

  return {
    childcare,
    school: find(plan, childId, 'school') ? 'private' : 'public',
    college: collegeChoice,
    collegeSavingsMonthly: saving?.isIncluded ? saving.amount : 0,
  };
}

/** A `null` in `next` means "leave this stage as it is" (a hand-edited stage
    the user did not press an option for), so it never counts as a change. */
const changedStages = (before: KidChoices, next: KidChoices): Stage[] => {
  const out: Stage[] = [];
  if (next.childcare !== null && before.childcare !== next.childcare) out.push('childcare');
  if (before.school !== next.school) out.push('school');
  if (next.college !== null && before.college !== next.college) out.push('college');
  if (before.collegeSavingsMonthly !== next.collegeSavingsMonthly) out.push('saving');
  return out;
};

export function kidOptionsChanged(plan: Plan, childId: string, next: KidChoices): boolean {
  return changedStages(readKidChoices(plan, childId), next).length > 0;
}

export function applyKidOptions(plan: Plan, childId: string, next: KidChoices): Plan {
  const child = plan.participants.find((p) => p.id === childId && p.role === 'child');
  if (!child) return plan;
  const stages = changedStages(readKidChoices(plan, childId), next);
  if (stages.length === 0) return plan;

  const accountId = lineId(childId, '529');
  let accounts = plan.accounts;
  const wantsSaving = next.collegeSavingsMonthly > 0;
  if (stages.includes('saving')) {
    const has = accounts.some((a) => a.id === accountId);
    if (wantsSaving && !has) {
      const account: Account = {
        ...newAccountOfType('taxFreeInvestment'),
        id: accountId,
        name: `${child.name} 529`,
        initialBalance: 0,
        startYear: Math.max(plan.settings.startYear, child.birthYear),
        ownerParticipantId: undefined,
      };
      accounts = [...accounts, account];
    } else if (!wantsSaving && has) {
      accounts = accounts.filter((a) => a.id !== accountId);
    }
  }

  // The fresh template lines for just the stages being rewritten. The 529 line
  // points at its account, so that account has to exist by now.
  const savingsAccountId = accounts.some((a) => a.id === accountId) ? accountId : undefined;
  const options: KidOptions = { ...next, childcare: next.childcare ?? 'daycare', college: next.college ?? 'inState' };
  const fresh = kidStageLines(childId, child.name, options, savingsAccountId);
  const rewritten = new Set<string>(stages.flatMap((s) => STAGE_KEYS[s].map((k) => lineId(childId, k))));
  const kept = (plan.budget ?? []).filter((l) => !(l.owner === childId && rewritten.has(l.id)));
  const added: BudgetLine[] = fresh.filter((l) => rewritten.has(l.id));

  return { ...plan, accounts, budget: [...kept, ...added] };
}
