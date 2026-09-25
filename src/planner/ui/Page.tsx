import type { ReactNode } from 'react';

/**
 * The shared page container every route wraps its content in
 * (docs/REDESIGN-V3.md "Page frame + shared components"): a max-width
 * measure, consistent padding, and the vertical rhythm between a header, a
 * stat strip, a primary chart/table, and secondary cards. `.ns-main` used to
 * own this (max-width, padding, gap) directly; that moved here so it can
 * vary by breakpoint independently of the grid column that holds it, and so
 * a page that genuinely wants full-bleed content (none do yet) has
 * somewhere to opt out from.
 */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ns-page${className ? ` ${className}` : ''}`}>{children}</div>;
}
