import { useMemo } from 'react';
import type { Plan, PlanResult } from '@northstar/engine';
import { runPlan, withExpenseShift, yearsOfRunway } from '@northstar/engine';
import { roundMoney } from './format';

/**
 * "Spending less isn't reported in dollars, it's reported in time bought"
 * (docs/BORROW.md §8) — a runway delta reads as something a person can feel
 * in a way a terminal net worth figure does not.
 *
 * Five fixed deltas rather than an editable control: this is meant to be
 * read at a glance next to the hero figure, not operated. `withExpenseShift`
 * and `runPlan` are both pure and fast enough to run four extra times on
 * every render — same tradeoff the return-sensitivity fan already makes.
 */
const MONTHLY_DELTAS = [-1000, -500, 0, 500, 1000];

export function SpendingStrip({ plan, result }: { plan: Plan; result: PlanResult }) {
  const baseline = useMemo(() => yearsOfRunway(result), [result]);

  const tiles = useMemo(
    () =>
      MONTHLY_DELTAS.map((delta) => {
        if (delta === 0) return { delta, yearsDelta: 0 };
        const shifted = yearsOfRunway(runPlan(withExpenseShift(plan, delta)));
        return { delta, yearsDelta: shifted - baseline };
      }),
    [plan, baseline],
  );

  const less = tiles.filter((t) => t.delta < 0);
  const current = tiles.find((t) => t.delta === 0)!;
  const more = tiles.filter((t) => t.delta > 0);

  return (
    <div className="ns-spending-strip">
      <div className="ns-spending-strip-label">If monthly spending changed</div>
      {/* Two zones either side of "Current" rather than one flat row of
          five — five same-weight tiles reads as a list to scan, two pairs
          either side of an anchor reads as "less ← here → more". */}
      <div className="ns-spending-tiles">
        <div className="ns-spending-zone">
          {less.map((t) => (
            <SpendingTile key={t.delta} {...t} />
          ))}
        </div>
        <SpendingTile {...current} />
        <div className="ns-spending-zone">
          {more.map((t) => (
            <SpendingTile key={t.delta} {...t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SpendingTile({ delta, yearsDelta }: { delta: number; yearsDelta: number }) {
  return (
    <div
      className={
        'ns-spending-tile' +
        (delta === 0 ? ' ns-spending-tile-current' : '') +
        (yearsDelta > 0 ? ' ns-spending-tile-up' : yearsDelta < 0 ? ' ns-spending-tile-down' : '')
      }
    >
      <div className="ns-spending-tile-delta">
        {delta === 0 ? 'Current' : `${delta > 0 ? '+' : '-'}${roundMoney(Math.abs(delta))}/mo`}
      </div>
      {delta !== 0 && (
        <div className="ns-spending-tile-runway">
          {yearsDelta === 0
            ? 'no change in horizon'
            : `${yearsDelta > 0 ? '+' : ''}${yearsDelta} yr${Math.abs(yearsDelta) === 1 ? '' : 's'}`}
        </div>
      )}
    </div>
  );
}
