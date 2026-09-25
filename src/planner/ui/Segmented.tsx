import { useRef } from 'react';

export interface SegmentedOption {
  value: string;
  label: string;
}

/**
 * A segmented control with real radiogroup semantics: one tab-stop (the
 * checked option), arrow keys move both focus and the selection, matching
 * how a native radio group already behaves everywhere else in the OS.
 */
export function Segmented({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  options: SegmentedOption[];
  value: string;
  onChange(value: string): void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  function move(delta: number) {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    root.current?.querySelector<HTMLButtonElement>(`[data-value="${cssEscape(next.value)}"]`)?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    }
  }

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`ns-ui-segmented ns-ui-segmented-${size}`}
      onKeyDown={onKeyDown}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={o.value}
            tabIndex={active ? 0 : -1}
            className={`ns-ui-segment${active ? ' ns-ui-segment-active' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
