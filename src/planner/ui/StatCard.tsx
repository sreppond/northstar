import type { ReactNode } from 'react';
import { ExplainHint } from '../HoverCard';

/**
 * A bordered compact card for a row of secondary figures — Goodcast's
 * horizon cards ("30D [5.6% SPREAD] / $56.5M / −2 pts $54.9M … +2 pts $58.1M").
 * Renders as a plain `div` unless `onClick` is given, in which case it
 * becomes a real `<button>` so it's keyboard-operable rather than a div
 * wearing a click handler.
 */
export function StatCard({
  label,
  badge,
  value,
  footLeft,
  footRight,
  selected,
  onClick,
  explain,
}: {
  label: ReactNode;
  badge?: ReactNode;
  value: ReactNode;
  footLeft?: ReactNode;
  footRight?: ReactNode;
  selected?: boolean;
  onClick?(): void;
  /** One or two plain sentences on what this card is, how it's computed, and
      which date it's as of (docs/ROADMAP-10.md C3) — rendered as a small
      "i" affordance next to the label via `ExplainHint`. Omitting this
      keeps a card rendering exactly as it did before. */
  explain?: ReactNode;
}) {
  const className = `ns-ui-statcard${selected ? ' ns-ui-statcard-selected' : ''}${onClick ? ' ns-ui-statcard-clickable' : ''}`;

  // The badge renders twice — once for the head row, once for the foot row —
  // and CSS picks which copy shows (`.ns-ui-statcard-badge-head` /
  // `-foot`). A phone-width page can move the badge into the foot row
  // (docs/REVIEW.md S12: the "2031 · +5 YRS" label was wrapping to three
  // lines beside it in the head) purely by toggling that CSS, with no DOM
  // reordering and no second render prop to keep in sync.
  const valueFoot = (
    <>
      <div className="ns-ui-statcard-value ns-num">{value}</div>
      {(footLeft || footRight || badge) && (
        <div className="ns-ui-statcard-foot">
          <span className="ns-num">{footLeft}</span>
          {badge && <span className="ns-ui-statcard-badge ns-ui-statcard-badge-foot">{badge}</span>}
          <span className="ns-num">{footRight}</span>
        </div>
      )}
    </>
  );

  // The outer element is always a `<div>` — never a `<button>` — because the
  // head row below holds `ExplainHint`'s own `<button>`, and a button can't
  // nest inside a button (docs/W3-REVIEW.md #9; this card had the same bug
  // `StatStrip.tsx`'s `Stat` did). `onClick` instead wraps just the
  // value/foot rows in a real button; the outer div keeps
  // `.ns-ui-statcard-clickable`'s hover/press chrome so the whole card still
  // reads as one pressable surface.
  return (
    <div className={className}>
      <div className="ns-ui-statcard-head">
        <span className="ns-ui-statcard-label">
          {label}
          {explain && <ExplainHint label={typeof label === 'string' ? label : undefined}>{explain}</ExplainHint>}
        </span>
        {badge && <span className="ns-ui-statcard-badge ns-ui-statcard-badge-head">{badge}</span>}
      </div>
      {onClick ? (
        <button type="button" className="ns-ui-statcard-press" onClick={onClick} aria-pressed={selected}>
          {valueFoot}
        </button>
      ) : (
        valueFoot
      )}
    </div>
  );
}
