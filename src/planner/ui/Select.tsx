import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A replacement for the native `<select>` (docs/REDESIGN-V3.md audit item
 * 10 — native selects and mismatched buttons don't fit the crisp-chrome
 * button/card language). A trigger button opens a popover listbox; arrow
 * keys move the highlighted option, Enter commits it, Escape or an outside
 * click closes without changing anything, and typing jumps to the next
 * option whose label starts with what was typed.
 *
 * The trigger keeps focus the whole time the popover is open (rather than
 * moving focus into the listbox) — simpler to keep correct, and it's what
 * `aria-activedescendant` is for.
 *
 * Accessible name (docs/REDESIGN-V3.md review M11): a caller like the ledger
 * toolbar's Compare picker used to render only the current value ("None"),
 * so a screen reader announced "None, button" with no indication of what
 * the control does, and a sighted user had no visible label either.
 * `placeholder` now does double duty as that label — shown as a muted
 * prefix ahead of the value once one is chosen ("Compare  None") and used as
 * the accessible-name fallback — so an existing caller that only ever
 * passed `placeholder` gets both fixes for free. `ariaLabel` overrides that
 * fallback for a caller that wants a different (or no) visible prefix.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  placeholder = 'Select…',
}: {
  options: SelectOption[];
  value: string | undefined;
  onChange(value: string): void;
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typeahead = useRef('');
  const typeaheadTimer = useRef<number | undefined>(undefined);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const accessibleName = ariaLabel ?? label ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  function openAt(index: number) {
    setActiveIndex(Math.max(0, index));
    setOpen(true);
  }

  function commit(index: number) {
    const opt = options[index];
    if (opt) onChange(opt.value);
    setOpen(false);
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAt(options.findIndex((o) => o.value === value));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      window.clearTimeout(typeaheadTimer.current);
      typeahead.current += e.key.toLowerCase();
      const match = options.findIndex((o) => o.label.toLowerCase().startsWith(typeahead.current));
      if (match !== -1) setActiveIndex(match);
      typeaheadTimer.current = window.setTimeout(() => {
        typeahead.current = '';
      }, 500);
    }
  }

  return (
    <div className="ns-ui-select" ref={root}>
      {label && <span className="ns-ui-select-label">{label}</span>}
      <button
        type="button"
        role="combobox"
        className="ns-ui-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={accessibleName}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(options.findIndex((o) => o.value === value)))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="ns-ui-select-value">
          {selected ? (
            <>
              {placeholder && <span className="ns-ui-select-prefix">{placeholder}</span>}
              <span>{selected.label}</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <ul className="ns-ui-select-popover" role="listbox" id={listId} aria-label={accessibleName}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`ns-ui-select-option${i === activeIndex ? ' ns-ui-select-option-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(i)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check size={14} strokeWidth={2} aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
