import { useEffect, useReducer, useRef, useState } from 'react';
import { easeDrawIn, isSettled, stepSpring, type SpringConfig, type SpringState } from './spring';

/**
 * The kit's small rAF spring (docs/REDESIGN-V5.md §3.8) as React hooks. Charts
 * use this rather than `motion` because they redraw SVG paths every frame
 * from the animated numbers; there is no element to hand to a library.
 */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface SpringValuesOptions extends SpringConfig {
  /** Settling threshold in each value's own units — about a tenth of a
      pixel. A number applies to all, an array per value. Default 1e-3. */
  eps?: number | number[];
  /** Jump straight to the targets (reduced motion; or a new series identity,
      where the old domain means nothing to the new data). */
  snap?: boolean;
  /** What a newly-appended index starts from; defaults to its own target. */
  seed?: number[];
}

/**
 * Springs every number in `targets` toward its target, returning the current
 * values. Starts from where each value IS now and keeps its velocity across
 * re-targets, so a second range click mid-animation redirects smoothly
 * instead of restarting (apple-design §3). A first render returns the
 * targets themselves: nothing animates on mount.
 */
export function useSpringValues(targets: number[], options: SpringValuesOptions = {}): number[] {
  const { eps = 1e-3, snap = false, seed, dampingRatio, response } = options;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const states = useRef<SpringState[]>([]);
  const targetsRef = useRef(targets);
  const frame = useRef(0);
  const last = useRef(0);
  const configRef = useRef({ dampingRatio, response, eps });
  configRef.current = { dampingRatio, response, eps };
  targetsRef.current = targets;

  // Keep the state array the same length as the targets. A new index starts
  // at its seed (or target); a vanished one is dropped.
  const st = states.current;
  while (st.length < targets.length) st.push({ value: seed?.[st.length] ?? targets[st.length], velocity: 0 });
  st.length = targets.length;
  if (snap) {
    for (let i = 0; i < targets.length; i++) st[i] = { value: targets[i], velocity: 0 };
  }

  // A stable key so the effect re-runs when any target moves, however the
  // caller built the array.
  const key = targets.join('|');
  useEffect(() => {
    const epsFor = (i: number) => {
      const e = configRef.current.eps;
      return Array.isArray(e) ? (e[i] ?? 1e-3) : e;
    };
    const anyMoving = () => states.current.some((s, i) => !isSettled(s, targetsRef.current[i], epsFor(i)));

    const tick = (now: number) => {
      const dt = Math.min((now - last.current) / 1000, 1 / 20);
      last.current = now;
      let moving = false;
      states.current = states.current.map((s, i) => {
        const target = targetsRef.current[i];
        const next = stepSpring(s, target, dt, configRef.current);
        if (isSettled(next, target, epsFor(i))) return { value: target, velocity: 0 };
        moving = true;
        return next;
      });
      rerender();
      frame.current = moving ? requestAnimationFrame(tick) : 0;
    };

    if (snap || !anyMoving()) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [key, snap]);

  return st.map((s) => s.value);
}

/**
 * The draw-in (docs/REDESIGN-V5.md §3.2): progress 0 -> 1 over `duration` ms,
 * restarting whenever `key` changes. While the key is stale the hook reports
 * 0 in the same render, so a new series never flashes fully drawn for a
 * frame before the animation begins. `enabled: false` is always 1.
 */
export function useReveal(key: string, enabled: boolean, duration = 650): number {
  const [state, setState] = useState<{ key: string; t: number }>({ key: '', t: 0 });

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const startedAt = performance.now();
    setState({ key, t: 0 });
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / duration);
      setState({ key, t: p });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, enabled, duration]);

  if (!enabled) return 1;
  return state.key === key ? easeDrawIn(state.t) : 0;
}

/** `value`, but updated at most once per `ms` (trailing edge, so the last
    value always lands). Feeds the chart's `aria-live` region so a scrub
    across 65 years announces a handful of readings, not 65. */
export function useThrottledValue<T>(value: T, ms = 600): T {
  const [shown, setShown] = useState(value);
  const lastAt = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, lastAt.current + ms - performance.now());
    const id = window.setTimeout(() => {
      lastAt.current = performance.now();
      setShown(value);
    }, wait);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return shown;
}
