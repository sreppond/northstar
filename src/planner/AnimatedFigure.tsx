import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A change arriving sooner than this after the previous one is part of a
 * continuous gesture (a scrub emits one per frame) and swaps in instantly.
 */
const SCRUB_GAP_MS = 250;

/**
 * Shows a formatted figure, cross-fading it only when the value SETTLES.
 *
 * V5-REVIEW-1 F1: this used to remount every character with a fresh `key` on
 * each string change and replay a 420ms blur-in, so during a scrub (one change
 * per frame) the readout never finished landing and sat at opacity 0. The
 * number is the thing Spencer reads while he scrubs, so:
 *  - a change within ~250ms of the previous one is a gesture in progress and
 *    swaps instantly, no animation at all;
 *  - an isolated change (a pin, a range or series switch, a plan edit) plays
 *    one opacity-only cross-fade, <=150ms, no blur and no per-character
 *    stagger;
 *  - the first render and reduced motion never animate.
 * Characters keep a stable per-index key, so an instant swap leaves them
 * mounted and any fade still running is dropped (the class goes away).
 */
export function AnimatedFigure({ value, className }: { value: string; className?: string }) {
  const [fade, setFade] = useState({ version: 0, on: false });
  const prev = useRef(value);
  const lastChange = useRef<number | null>(null);

  // Layout effect so the first frame of a fade is already at its start
  // opacity: a passive effect would paint the new text at full strength
  // for one frame and then flash it down.
  useLayoutEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    const now = performance.now();
    const gap = lastChange.current === null ? Infinity : now - lastChange.current;
    lastChange.current = now;
    const reduced =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const settle = gap >= SCRUB_GAP_MS && !reduced;
    setFade((f) => (settle ? { version: f.version + 1, on: true } : f.on ? { ...f, on: false } : f));
  }, [value]);

  return (
    <span className={className} aria-label={value}>
      {value.split('').map((char, i) => (
        <span
          key={`${i}-${fade.on ? fade.version : 'still'}`}
          className={fade.on ? 'ns-figure-char ns-figure-char-fade' : 'ns-figure-char'}
          aria-hidden="true"
        >
          {/* V5-REVIEW-2 N2: each char is an inline-block span, where a plain
              space collapses ("Short$10.2K"). Written as the \u00a0 escape so
              an editor can't turn it back into a regular space. */}
          {char === ' ' ? '\u00a0' : char}
        </span>
      ))}
    </span>
  );
}
