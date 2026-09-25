import type { ReactNode } from 'react';

/**
 * The 11px mono uppercase +0.06em muted label used everywhere a stat, a
 * section, or a group of nav links needs a small-caps header
 * (docs/REDESIGN-V3.md "Design system changes"). One component so every
 * eyebrow in the app shares the exact same four properties rather than each
 * page re-declaring them slightly differently.
 */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`ns-eyebrow${className ? ` ${className}` : ''}`}>{children}</span>;
}
