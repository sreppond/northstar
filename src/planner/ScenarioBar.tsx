import { useEffect, useRef, useState } from 'react';
import type { Plan } from '@northstar/engine';

/**
 * Scenario pills, plus the lifecycle actions on the active one.
 *
 * Renaming happens in place: the pill becomes an input. A modal for a single
 * text field would be heavier than the thing it edits.
 */
export function ScenarioBar({
  plans,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: {
  plans: Plan[];
  activeId: string;
  onSelect(id: string): void;
  onCreate(): void;
  onRename(id: string, name: string): void;
  onDuplicate(id: string): void;
  onDelete(id: string): void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (!bar.current?.contains(e.target as Node)) setMenuFor(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuFor]);

  useEffect(() => setConfirmDelete(false), [menuFor]);

  return (
    <div className="ns-scenarios" ref={bar}>
      {plans.map((plan) => {
        const active = plan.id === activeId;

        if (renaming === plan.id) {
          return (
            <input
              key={plan.id}
              className="ns-scenario-rename"
              autoFocus
              defaultValue={plan.name}
              onBlur={(e) => {
                onRename(plan.id, e.target.value);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          );
        }

        return (
          <span key={plan.id} className="ns-scenario-wrap">
            <button
              type="button"
              className="ns-scenario"
              aria-pressed={active}
              onClick={() => onSelect(plan.id)}
            >
              <span className="ns-dot" />
              {plan.name}
              {active && (
                <span
                  role="button"
                  tabIndex={0}
                  className="ns-scenario-more"
                  aria-label="Scenario actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === plan.id ? null : plan.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuFor(menuFor === plan.id ? null : plan.id);
                    }
                  }}
                >
                  ⋯
                </span>
              )}
            </button>

            {menuFor === plan.id && (
              <div className="ns-menu" role="menu">
                <button
                  type="button"
                  className="ns-menu-item"
                  onClick={() => {
                    setRenaming(plan.id);
                    setMenuFor(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="ns-menu-item"
                  onClick={() => {
                    onDuplicate(plan.id);
                    setMenuFor(null);
                  }}
                >
                  Duplicate
                </button>
                {plans.length > 1 &&
                  (confirmDelete ? (
                    <button
                      type="button"
                      className="ns-menu-item ns-menu-danger"
                      onClick={() => {
                        onDelete(plan.id);
                        setMenuFor(null);
                      }}
                    >
                      Delete — are you sure?
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ns-menu-item ns-menu-danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete
                    </button>
                  ))}
              </div>
            )}
          </span>
        );
      })}

      <button type="button" className="ns-scenario ns-scenario-new" onClick={onCreate}>
        + New
      </button>
    </div>
  );
}
