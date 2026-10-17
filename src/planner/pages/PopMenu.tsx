import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A small anchored menu (docs/REDESIGN-V5.md §5.1.1): the Net worth series
 * switcher, the header's ⋯ and the table's quiet `+`. One implementation so
 * the three share keyboard behaviour: the first item takes focus on open,
 * arrows/Home/End move, Esc closes and returns focus to the trigger, and a
 * press outside closes. Items are `menuitem`s, or `menuitemradio`s when
 * `checked` is set on any of them.
 */
export interface PopMenuItem {
  key: string;
  label: ReactNode;
  /** Marks the current choice (a radio-style menu). */
  checked?: boolean;
  onSelect(): void;
}

export interface PopMenuGroup {
  /** Small heading above the group, e.g. "Assets". */
  label?: string;
  items: PopMenuItem[];
}

export function PopMenu({
  trigger,
  groups,
  label,
  align = 'start',
  className = '',
}: {
  /** Renders the trigger button's contents and gets `open` to flip a caret. */
  trigger: (open: boolean) => ReactNode;
  groups: PopMenuGroup[];
  /** Accessible name for the trigger and the menu. */
  label: string;
  align?: 'start' | 'end';
  /** Extra class on the trigger button. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const items = groups.flatMap((g) => g.items);
  const radio = items.some((i) => i.checked !== undefined);

  useEffect(() => {
    if (!open) return;
    const items = root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    // Land on the current choice when there is one, else the first item.
    const current = root.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (current ?? items?.[0])?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  function focusAt(delta: number | 'first' | 'last') {
    const els = [...(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (els.length === 0) return;
    const at = els.indexOf(document.activeElement as HTMLElement);
    const next = delta === 'first' ? 0 : delta === 'last' ? els.length - 1 : (at + delta + els.length) % els.length;
    els[next].focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') (e.preventDefault(), focusAt(1));
    else if (e.key === 'ArrowUp') (e.preventDefault(), focusAt(-1));
    else if (e.key === 'Home') (e.preventDefault(), focusAt('first'));
    else if (e.key === 'End') (e.preventDefault(), focusAt('last'));
    else if (e.key === 'Escape') {
      // Stop here: a Sheet underneath also listens for Esc on window.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') setOpen(false);
  }

  if (items.length === 0) return null;

  return (
    <div className="ns-nw-menu" ref={root}>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`ns-nw-menu-pop ns-nw-menu-pop-${align}`}
          onKeyDown={onMenuKey}
        >
          {groups.map((g, gi) =>
            g.items.length === 0 ? null : (
              <div key={g.label ?? gi} role="group" aria-label={g.label}>
                {g.label && (
                  <div className="ns-nw-menu-group" aria-hidden="true">
                    {g.label}
                  </div>
                )}
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role={radio ? 'menuitemradio' : 'menuitem'}
                    aria-checked={radio ? item.checked === true : undefined}
                    className="ns-nw-menu-item"
                    onClick={() => {
                      setOpen(false);
                      triggerRef.current?.focus();
                      item.onSelect();
                    }}
                  >
                    {item.label}
                    {item.checked && (
                      <span className="ns-nw-menu-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
