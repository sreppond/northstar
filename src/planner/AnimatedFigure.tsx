import { useEffect, useRef, useState } from 'react';

/**
 * Rolls each character in when the formatted string changes — a lighter,
 * dependency-free take on an odometer: no digit strip, since the string
 * carries `$`, `.` and a unit suffix as well as digits, just a per-character
 * slide-and-unblur that replays because the key changes, not because a
 * transition fires. Respects `prefers-reduced-motion` for free, via the
 * blanket `.ns *` rule in planner.css.
 */
export function AnimatedFigure({ value, className }: { value: string; className?: string }) {
  const [version, setVersion] = useState(0);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setVersion((v) => v + 1);
    }
  }, [value]);

  return (
    <span className={className} aria-label={value}>
      {value.split('').map((char, i) => (
        <span
          key={`${i}-${version}`}
          className="ns-figure-char"
          aria-hidden="true"
          style={{ animationDelay: `${i * 16}ms` }}
        >
          {char === ' ' ? ' ' : char}
        </span>
      ))}
    </span>
  );
}
