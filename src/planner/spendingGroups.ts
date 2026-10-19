/**
 * Where a year's money goes, in six groups (docs/REDESIGN-V5.md §7.1): the
 * Cash Flow page's grouped rows and the spending donut both read this, so the
 * two can never disagree about what "kids" or "home" cost.
 *
 * Every line in `snapshot.expenses` lands in exactly one group, so the group
 * totals sum to `snapshot.totalExpenses` (tested, for the legacy sample and
 * the household model). `saving` is in that sum but is not spending; callers
 * that want spending leave it out, the same way `spendingThisYear` does.
 *
 * The split by owner mirrors `budgetView.ts` on purpose: an owner counts only
 * if they are an included participant, otherwise the line is shared, and a
 * lump sum or a contribution is pulled out of the monthly picture the same
 * way. Keep the two in step (the tests compare them).
 */
import type { LineItem, Plan, YearSnapshot } from '@northstar/engine';
import { KIDS_COLOR, SAVED_COLOR, SHARED_FIXED_COLOR } from './budgetView';

export type GroupKey = 'home' | 'kids' | 'shared' | 'personal' | 'oneTime' | 'saving';

export interface SpendingPart {
  key: string;
  label: string;
  amount: number;
  ownerId?: string;
  sourceEventId?: string;
  budgetLineId?: string;
}

export interface SpendingGroup {
  key: GroupKey;
  label: string;
  /** A CSS colour (a `var(--…)` token), the same hues the Budget page uses. */
  color: string;
  total: number;
  /** Largest first, except `kids` and `personal`, which follow household order. */
  parts: SpendingPart[];
}

/**
 * One colour per group. Home's donut reads this too (V5-REVIEW-3 m2), so
 * Kids is the same gold on Home and Budget.
 */
export const GROUP_COLOR: Record<GroupKey, string> = {
  home: 'var(--mix-2)',
  kids: KIDS_COLOR,
  shared: SHARED_FIXED_COLOR,
  personal: 'var(--mix-5)',
  oneTime: 'var(--mix-4)',
  saving: SAVED_COLOR,
};

/** Display order, and the order groups are returned in. */
const GROUPS: { key: GroupKey; label: string; color: string }[] = [
  { key: 'home', label: 'Home', color: GROUP_COLOR.home },
  { key: 'kids', label: 'Kids', color: GROUP_COLOR.kids },
  { key: 'shared', label: 'Shared', color: GROUP_COLOR.shared },
  { key: 'personal', label: 'Personal', color: GROUP_COLOR.personal },
  { key: 'oneTime', label: 'One-time', color: GROUP_COLOR.oneTime },
  { key: 'saving', label: 'Saving', color: GROUP_COLOR.saving },
];

/**
 * Groups with nothing in them are left out: a donut cannot draw a zero slice
 * and a table row of dashes says nothing.
 */
export function spendingGroups(plan: Plan, snapshot: YearSnapshot): SpendingGroup[] {
  const people = plan.participants.filter((p) => p.isIncluded);
  const personById = new Map(people.map((p) => [p.id, p]));
  const eventKind = new Map(plan.events.map((e) => [e.id, e.kind]));
  const eventName = new Map(plan.events.map((e) => [e.id, e.name]));

  const classify = (item: LineItem): GroupKey => {
    const owner = item.ownerId ? personById.get(item.ownerId) : undefined;
    const isHome = item.category === 'housing' || eventKind.get(item.sourceEventId ?? '') === 'buyAHome';

    // 1. Lump sums (and annuity surrender charges, which budgetView.ts also
    //    sets apart from the monthly picture) are one-time, except the home
    //    purchase: its down payment is housing, and reads best next to the
    //    mortgage and the upkeep.
    if ((item.oneTime || item.category === 'annuityCharge') && !isHome) return 'oneTime';
    // 2. Money moved into an account on purpose is saved, not spent.
    if (item.category === 'contribution') return 'saving';
    // 3. Housing, or anything the home purchase produced (its mortgage payment
    //    carries the event id but not the category).
    if (isHome) return 'home';
    // 4. A child's costs, or the older `haveAKid` event's (plans not yet moved
    //    onto the household model). Tested before the adult owner.
    if (owner?.role === 'child' || eventKind.get(item.sourceEventId ?? '') === 'haveAKid') return 'kids';
    // 5. An adult's own allowance or line.
    if (owner) return 'personal';
    // 6. Everything else is the household's.
    return 'shared';
  };

  const lineParts = new Map<GroupKey, SpendingPart[]>();
  /** kids/personal: one part per person (or per `haveAKid` event), summed. */
  const personParts = new Map<GroupKey, Map<string, SpendingPart>>();
  const totals = new Map<GroupKey, number>();

  snapshot.expenses.forEach((item, i) => {
    const group = classify(item);
    totals.set(group, (totals.get(group) ?? 0) + item.amount);

    const owner = item.ownerId ? personById.get(item.ownerId) : undefined;
    if ((group === 'kids' || group === 'personal') && (owner || item.sourceEventId)) {
      const byOwner = owner !== undefined;
      const key = byOwner ? `person:${owner.id}` : `event:${item.sourceEventId}`;
      const parts = personParts.get(group) ?? new Map<string, SpendingPart>();
      personParts.set(group, parts);
      const existing = parts.get(key);
      if (existing) {
        existing.amount += item.amount;
      } else {
        parts.set(key, {
          key,
          label: byOwner ? owner.name : (eventName.get(item.sourceEventId!) ?? item.label),
          amount: item.amount,
          ...(byOwner ? { ownerId: owner.id } : { sourceEventId: item.sourceEventId }),
        });
      }
      return;
    }

    const list = lineParts.get(group) ?? [];
    lineParts.set(group, list);
    list.push({
      key: item.budgetLineId ?? `${item.sourceEventId ?? item.accountId ?? 'plan'}:${item.label}:${i}`,
      label: item.label,
      amount: item.amount,
      ...(item.ownerId ? { ownerId: item.ownerId } : {}),
      ...(item.sourceEventId ? { sourceEventId: item.sourceEventId } : {}),
      ...(item.budgetLineId ? { budgetLineId: item.budgetLineId } : {}),
    });
  });

  const household = (id: string | undefined) => people.findIndex((p) => p.id === id);

  return GROUPS.flatMap(({ key, label, color }) => {
    const total = totals.get(key);
    if (total === undefined) return [];
    const perPerson = [...(personParts.get(key)?.values() ?? [])].sort(
      (a, b) => household(a.ownerId) - household(b.ownerId) || b.amount - a.amount,
    );
    const lines = (lineParts.get(key) ?? []).sort((a, b) => b.amount - a.amount);
    return [{ key, label, color, total, parts: [...perPerson, ...lines] }];
  });
}
