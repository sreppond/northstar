import { useState } from 'react';
import type { Goal } from '@northstar/engine';
import { SWEEP_BUCKET_LABEL } from '@northstar/engine';
import { roundMoney } from '../format';

/**
 * The Goals-first waterfall (docs/REDESIGN.md §2.2, §4.5): "Fund: House, then
 * Retirement, then Savings," reorderable, instead of the raw priority-rule
 * list. This is a friendlier VIEW onto `draft.goals` — reordering calls
 * `onReorder`, which the caller (AssumptionsDrawer) turns back into
 * `PriorityRule`s via the same `mergeGoalRules` the store's own
 * `reorderGoals` action already runs, so the machinery underneath is exactly
 * what existed before. Nothing here invents a new mechanic.
 *
 * "Savings" is the always-present, unremovable last row: the unallocated
 * sweep every plan already has, named rather than left as the tail of a
 * waterfall nobody could see. It has no `Goal` object behind it — it is just
 * how this list's tail renders — so it carries no drag handle and no order
 * controls.
 */
interface Props {
  goals: Goal[];
  onReorder(goals: Goal[]): void;
}

export function GoalWaterfall({ goals, onReorder }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= goals.length) return;
    const next = [...goals];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  const reorderTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...goals];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const names = [...goals.map((g) => g.name), SWEEP_BUCKET_LABEL];

  return (
    <div className="ns-waterfall">
      <p className="ns-drawer-hint">Fund: {names.join(', then ')}.</p>

      {goals.map((goal, i) => (
        <div
          key={goal.id}
          className={`ns-wf-row ns-goal-row${dragIndex === i ? ' ns-goal-row-dragging' : ''}${
            overIndex === i && dragIndex !== null && dragIndex !== i ? ' ns-goal-row-over' : ''
          }`}
          draggable
          onDragStart={() => setDragIndex(i)}
          onDragOver={(e) => {
            e.preventDefault();
            if (overIndex !== i) setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) reorderTo(dragIndex, i);
            endDrag();
          }}
          onDragEnd={endDrag}
        >
          <span className="ns-goal-handle" aria-hidden="true">
            ⠿
          </span>
          <span className="ns-wf-order ns-num">{i + 1}</span>
          <span className="ns-wf-name">
            {goal.name}
            {goalMeta(goal) && <span className="ns-goal-meta ns-num">{goalMeta(goal)}</span>}
          </span>
          <button
            type="button"
            className="ns-wf-btn"
            aria-label={`Fund ${goal.name} earlier`}
            disabled={i === 0}
            onClick={() => move(i, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="ns-wf-btn"
            aria-label={`Fund ${goal.name} later`}
            disabled={i === goals.length - 1}
            onClick={() => move(i, 1)}
          >
            ↓
          </button>
        </div>
      ))}

      <div className="ns-wf-row ns-goal-row ns-goal-row-sweep">
        <span className="ns-goal-handle" aria-hidden="true" />
        <span className="ns-wf-order ns-num">{goals.length + 1}</span>
        <span className="ns-wf-name">
          {SWEEP_BUCKET_LABEL}
          <span className="ns-goal-meta">Everything left over — always last</span>
        </span>
      </div>
    </div>
  );
}

function goalMeta(goal: Goal): string | undefined {
  if (goal.targetAmount === undefined) return undefined;
  return goal.byYear ? `${roundMoney(goal.targetAmount)} by ${goal.byYear}` : roundMoney(goal.targetAmount);
}
