import { useMemo, useState } from 'react';
import type { Plan, PlanResult } from '@northstar/engine';
import { DonutChart, type DonutSegment } from '../charts';
import { Segmented, Sheet } from '../ui';
import { money } from '../format';
import { monthsIn } from '../budgetView';
import { spendingGroups, type GroupKey } from '../spendingGroups';
import type { OwnCost } from '../homeView';
import '../pages/decisions.css';

/** One fixed key set, so the arcs MORPH between before and after rather than
    remounting: a group with nothing in a state is a 0 slice, not a missing one
    (docs/REDESIGN-V5.md §3.5). */
const KEYS: GroupKey[] = ['home', 'kids', 'shared', 'personal', 'oneTime'];
const FALLBACK: Record<GroupKey, { label: string; color: string }> = {
  home: { label: 'Home', color: 'var(--mix-2)' },
  kids: { label: 'Kids', color: 'var(--mix-6)' },
  shared: { label: 'Shared', color: 'var(--mix-1)' },
  personal: { label: 'Personal', color: 'var(--mix-4)' },
  oneTime: { label: 'One-time', color: 'var(--mix-3)' },
  saving: { label: 'Saving', color: 'var(--in)' },
};
const OWN_COLORS = ['var(--mix-1)', 'var(--mix-3)', 'var(--mix-6)', 'var(--mix-4)', 'var(--mix-5)', 'var(--mix-2)'];

type When = 'before' | 'after';

function monthlySegments(plan: Plan, result: PlanResult, year: number): DonutSegment[] {
  const snap = result.years.find((y) => y.year === year);
  const groups = snap ? spendingGroups(plan, snap) : [];
  const months = snap ? monthsIn(plan, year) || 12 : 12;
  return KEYS.map((key) => {
    const g = groups.find((x) => x.key === key);
    return { key, label: FALLBACK[key].label, color: FALLBACK[key].color, value: g ? g.total / months : 0 };
  });
}

/**
 * "Your budget, before and after" (docs/REDESIGN-V5.md §5.5, R10): one donut
 * of what a month costs, with a Before / After toggle. The arcs morph between
 * the two states, the centre reads the monthly total, and the Home slice
 * opens what owning costs (P&I, tax, insurance, upkeep, HOA) in a sheet.
 * This replaces the old pair of stacked bars.
 */
export function HomeBudgetDonut({
  plan,
  result,
  beforeYear,
  afterYear,
  own,
  showOwn,
  showRent,
}: {
  /** The plan with the purchase in it (the draft), and its result in display dollars. */
  plan: Plan;
  result: PlanResult;
  beforeYear: number;
  afterYear: number;
  own?: OwnCost;
  /** Nominal -> display dollars for an `own` figure in `afterYear`. */
  showOwn(nominal: number): number;
  /** Same, for the rent in `beforeYear`. */
  showRent(nominal: number): number;
}) {
  const [when, setWhen] = useState<When>('after');
  const [open, setOpen] = useState(false);
  const year = when === 'before' ? beforeYear : afterYear;
  const segments = useMemo(() => monthlySegments(plan, result, year), [plan, result, year]);
  const total = segments.reduce((s, x) => s + x.value, 0);

  const ownParts = own?.parts.map((p, i) => ({ key: p.label, label: p.label, value: showOwn(p.monthly), color: OWN_COLORS[i % OWN_COLORS.length] })) ?? [];
  const ownTotal = own ? showOwn(own.total) : 0;
  const rent = own && own.rentBefore > 0 ? showRent(own.rentBefore) : 0;

  return (
    <div className="ns-dec-section">
      <div className="ns-dec-head">
        <h2 className="ns-dec-title">Your budget</h2>
        <Segmented
          size="sm"
          ariaLabel="Before or after buying"
          value={when}
          onChange={(v) => setWhen(v as When)}
          options={[
            { value: 'before', label: 'Before buying' },
            { value: 'after', label: 'After buying' },
          ]}
        />
      </div>
      <div className="ns-dec-donut">
        <DonutChart
          segments={segments}
          center={{ value: money(total), label: `per month · ${year}` }}
          onSelect={(key) => {
            if (key === 'home' && own) setOpen(true);
          }}
          size={236}
          thickness={30}
          legend="side"
          format={(v) => `${money(v)}/mo`}
          ariaLabel={`Monthly spending ${when === 'before' ? 'before' : 'after'} buying`}
        />
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="What owning costs" width="min(480px, 100vw)">
        <DonutChart
          segments={ownParts}
          center={{ value: money(ownTotal), label: `per month · ${afterYear}` }}
          size={216}
          thickness={28}
          legend="below"
          format={(v) => `${money(v)}/mo`}
          ariaLabel="What owning costs each month"
        />
        {rent > 0 && (
          <div className="ns-ba-owncost">
            <div className="ns-ba-owncost-row">
              <span>Rent in {beforeYear}</span>
              <strong>{money(rent)}/mo</strong>
            </div>
            <div className="ns-ba-owncost-row">
              <span>Change from rent</span>
              <strong>
                {ownTotal >= rent ? '+' : '−'}
                {money(Math.abs(ownTotal - rent))}/mo
              </strong>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
