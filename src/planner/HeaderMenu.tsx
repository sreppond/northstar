import { useEffect, useRef, useState } from 'react';

/**
 * The header's overflow menu — everything that used to sit in a row of its
 * own on the plan card (docs/REDESIGN.md §3.2): Import, Sign out, and Undo /
 * Redo. Those four are occasional or keyboard-served (⌘Z / ⇧⌘Z already wired
 * in `App.tsx`), unlike "Edit assumptions" and "+ Add event", which stay on
 * the surface because they are what a session is actually for.
 *
 * Same disclosure pattern as the plan row's "⋯" menu in `Sidebar.tsx`: a
 * button toggles `.ns-menu` open, and a mousedown outside it closes it.
 */
export function HeaderMenu({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImport,
  onSignOut,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  onImport(): void;
  onSignOut(): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="ns-head-menu" ref={root}>
      <button
        type="button"
        className="ns-head-icon-btn"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>

      {open && (
        <div className="ns-menu ns-menu-right" role="menu">
          {canUndo && (
            <button
              type="button"
              className="ns-menu-item"
              role="menuitem"
              onClick={() => {
                onUndo();
                setOpen(false);
              }}
            >
              Undo <span className="ns-menu-hint">⌘Z</span>
            </button>
          )}
          {canRedo && (
            <button
              type="button"
              className="ns-menu-item"
              role="menuitem"
              onClick={() => {
                onRedo();
                setOpen(false);
              }}
            >
              Redo <span className="ns-menu-hint">⇧⌘Z</span>
            </button>
          )}
          <button
            type="button"
            className="ns-menu-item"
            role="menuitem"
            onClick={() => {
              onImport();
              setOpen(false);
            }}
          >
            Import…
          </button>
          <button
            type="button"
            className="ns-menu-item"
            role="menuitem"
            onClick={() => {
              onSignOut();
              setOpen(false);
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
