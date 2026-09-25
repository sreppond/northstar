import type { ReactNode } from 'react';
import { DeltaTag, type DeltaTone } from './DeltaTag';
import { Eyebrow } from './Eyebrow';

/**
 * The divider-separated stat strip (docs/REDESIGN-V3.md "Goodcast"): one XL
 * figure, a few quieter secondary ones, hairline vertical rules between
 * them instead of boxes. Replaces the four-equal-KPI-tile strip
 * docs/DESIGN-DIRECTION.md killed for uniform weighting — hierarchy (one
 * XL + several quieter `md` stats) is what makes this version work where
 * that one didn't.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="ns-ui-stat-strip">{children}</div>;
}

export function Stat({
  label,
  value,
  delta,
  sub,
  size = 'md',
  onClick,
  pressed,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: { value: string; tone: DeltaTone };
  sub?: ReactNode;
  size?: 'xl' | 'md';
  /** Renders the stat as a real `<button>` when given (docs/REVIEW.md M3) —
      for a stat that toggles something (Overview's "Range P10-P90"), rather
      than a caller wrapping `<Stat>` in its own `<button>`, which shifts
      this component's `:first-child`/`:nth-child` position in the strip out
      from under every divider/collision rule keyed to it. Additive: a
      caller that never passes this keeps rendering a plain `<div>`, byte
      for byte. */
  onClick?(): void;
  pressed?: boolean;
}) {
  const className = `ns-ui-stat ns-ui-stat-${size}${onClick ? ' ns-ui-stat-pressable' : ''}`;
  const content = (
    <>
      <div className="ns-ui-stat-label-row">
        <Eyebrow>{label}</Eyebrow>
        {delta && <DeltaTag value={delta.value} tone={delta.tone} />}
      </div>
      {/* Proportional figures, not tabular — .ns-num is deliberately not
          applied here (docs/REDESIGN-V3.md keeps the hero figure
          proportional so a display-size number reads as a number, not a
          printout; tabular-nums is for grids of small figures read as a
          column, which a lone stat never is). */}
      <div className="ns-ui-stat-value">{value}</div>
      {sub && <div className="ns-ui-stat-sub">{sub}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} aria-pressed={pressed} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
