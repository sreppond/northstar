import { useEffect, useRef, useState } from 'react';
import { shortcutList } from './shortcuts';

/**
 * The `?` shortcut sheet (docs/ROADMAP-10.md C6). A tiny module-level
 * open/close bus — same shape as `ui/Toast.tsx`'s bus — because the two
 * callers that need to open it (`shortcuts.ts`'s registry, which has no
 * React tree, and `CommandPalette.tsx`'s "Keyboard shortcuts" command) have
 * no shared ancestor state to reach into short of threading it through
 * `PlannerContext.tsx`, which owns none of this feature's state.
 *
 * Deliberately has NO open/close animation — same rule as `CommandPalette.tsx`
 * (docs/DESIGN-DIRECTION.md "Dark mode and ⌘K": keyboard-initiated surfaces
 * don't animate open/close, because instant is what a surface used this
 * often should feel like, not a missed chance for delight).
 */

let open = false;
const listeners = new Set<(open: boolean) => void>();

function set(next: boolean) {
  open = next;
  for (const l of listeners) l(next);
}

export function openShortcutSheet(): void {
  set(true);
}

export function closeShortcutSheet(): void {
  set(false);
}

function useSheetOpen(): boolean {
  const [value, setValue] = useState(open);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

const FOCUSABLE = 'button, [href], input, [tabindex]:not([tabindex="-1"])';

export function ShortcutSheet() {
  const isOpen = useSheetOpen();
  const rootRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // Focus trap + Escape, the same `inert`-on-siblings idiom
  // `Sidebar.tsx`'s mobile sheet already uses (M13): confines Tab (and a
  // screen reader's virtual cursor) to the dialog without a hand-rolled
  // trap loop, and restores focus to whatever opened it on close.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;

    const rail = document.querySelector('.ns-rail');
    const topbar = document.querySelector('.ns-topbar');
    const main = document.querySelector('.ns-main');
    rail?.setAttribute('inert', '');
    topbar?.setAttribute('inert', '');
    main?.setAttribute('inert', '');

    rootRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeShortcutSheet();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      rail?.removeAttribute('inert');
      topbar?.removeAttribute('inert');
      main?.removeAttribute('inert');
      restoreFocus.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="ns-shortcut-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeShortcutSheet();
      }}
    >
      <div
        ref={rootRef}
        className="ns-shortcut-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
      >
        <div className="ns-shortcut-head">
          <h2 className="ns-shortcut-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="ns-head-icon-btn"
            aria-label="Close"
            onClick={() => closeShortcutSheet()}
          >
            ×
          </button>
        </div>
        <dl className="ns-shortcut-list">
          {shortcutList().map((s) => (
            <div className="ns-shortcut-row" key={s.label}>
              <dt>{s.label}</dt>
              <dd>
                <kbd>{s.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
