import { useEffect, useState } from 'react';

/**
 * Layout breakpoints, matched to planner.css.
 *
 * Used where a CSS media query cannot reach (chart heights, the sheet's
 * bottom-vs-side placement).
 */
export type Breakpoint = 'phone' | 'tablet' | 'desktop';

const PHONE = '(max-width: 640px)';
// 1023, not 1024 (docs/REDESIGN-V3.md review S10): a 1024px iPad-landscape
// viewport should read as desktop (persistent rail), not fall through to
// the mobile top bar, whose plan switcher then has no room to be readable.
const TABLET = '(max-width: 1023px)';

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
