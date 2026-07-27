import { useEffect, useState } from 'react';

/**
 * Layout breakpoints, matched to planner.css.
 *
 * Used where a CSS media query cannot reach — chiefly the number of year
 * columns rendered. Showing fewer columns beats shrinking the type or making
 * someone scroll eight columns on a phone.
 */
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

const PHONE = '(max-width: 640px)';
const TABLET = '(max-width: 1024px)';

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => read());

  useEffect(() => {
    const phone = window.matchMedia(PHONE);
    const tablet = window.matchMedia(TABLET);
    const update = () => setBreakpoint(read());

    phone.addEventListener('change', update);
    tablet.addEventListener('change', update);
    return () => {
      phone.removeEventListener('change', update);
      tablet.removeEventListener('change', update);
    };
  }, []);

  return breakpoint;
}

function read(): Breakpoint {
  // SSR-safe, and safe in a test environment with no matchMedia.
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia(PHONE).matches) return 'phone';
  if (window.matchMedia(TABLET).matches) return 'tablet';
  return 'desktop';
}

/** Year columns that fit without the type shrinking. */
export function yearColumnsFor(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case 'phone':
      return 3;
    case 'tablet':
      return 5;
    default:
      return 8;
  }
}
