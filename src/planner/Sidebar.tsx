import { useEffect, useRef, useState } from 'react';
import type { Plan } from '@northstar/engine';

// View switching lives in the header now (see ViewTabs) — this drawer's one
// job is the thing that doesn't fit in a header pill: managing plans.
export function Sidebar({
  onClose,
  plans,
  activePlanId,
  onSelectPlan,
  onCreatePlan,
  onRenamePlan,
  onDuplicatePlan,
  onDeletePlan,
}: {
  onClose(): void;
  plans: Plan[];
  activePlanId: string;
  onSelectPlan(id: string): void;
  onCreatePlan(): void;
  onRenamePlan(id: string, name: string): void;
  onDuplicatePlan(id: string): void;
  onDeletePlan(id: string): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="ns-scrim" onClick={onClose} />
      <aside className="ns-sidebar" role="dialog" aria-modal="true" aria-label="Plans">
        <div className="ns-sidebar-head">
          <div className="ns-drawer-title">Plans</div>
          <button type="button" className="ns-btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <nav className="ns-sidebar-list">
          {plans.map((p) => (
            <PlanRow
              key={p.id}
              plan={p}
              active={p.id === activePlanId}
              canDelete={plans.length > 1}
              onSelect={() => {
                onSelectPlan(p.id);
                onClose();
              }}
              onRename={(name) => onRenamePlan(p.id, name)}
              onDuplicate={() => onDuplicatePlan(p.id)}
              onDelete={() => onDeletePlan(p.id)}
            />
          ))}
          <button type="button" className="ns-sidebar-item ns-sidebar-item-new" onClick={onCreatePlan}>
            <span className="ns-sidebar-item-name">+ New plan</span>
          </button>
        </nav>
      </aside>
    </>
  );
}

function PlanRow({
  plan,
  active,
  canDelete,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
}: {
  plan: Plan;
  active: boolean;
  canDelete: boolean;
  onSelect(): void;
  onRename(name: string): void;
  onDuplicate(): void;
  onDelete(): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!row.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => setConfirmDelete(false), [menuOpen]);

  if (renaming) {
    return (
      <input
        className="ns-scenario-rename"
        autoFocus
        defaultValue={plan.name}
        onBlur={(e) => {
          onRename(e.target.value);
          setRenaming(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setRenaming(false);
        }}
      />
    );
  }

  return (
    <div className="ns-sidebar-item ns-plan-row" ref={row}>
      <button type="button" className="ns-plan-row-select" aria-current={active} onClick={onSelect}>
        <span className="ns-dot" />
        <span className="ns-sidebar-item-name">{plan.name}</span>
      </button>
      <span
        role="button"
        tabIndex={0}
        className="ns-scenario-more"
        aria-label="Plan actions"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }
        }}
      >
        ⋯
      </span>

      {menuOpen && (
        <div className="ns-menu" role="menu">
          <button
            type="button"
            className="ns-menu-item"
            onClick={() => {
              setRenaming(true);
              setMenuOpen(false);
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="ns-menu-item"
            onClick={() => {
              onDuplicate();
              setMenuOpen(false);
            }}
          >
            Duplicate
          </button>
          {canDelete &&
            (confirmDelete ? (
              <button
                type="button"
                className="ns-menu-item ns-menu-danger"
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
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
    </div>
  );
}
