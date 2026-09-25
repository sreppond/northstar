import type { ReactNode } from 'react';

/**
 * A bordered compact card for a row of secondary figures — Goodcast's
 * horizon cards ("30D [5.6% SPREAD] / $56.5M / P10 $54.9M … P90 $58.1M").
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
}: {
  label: ReactNode;
  badge?: ReactNode;
  value: ReactNode;
  footLeft?: ReactNode;
  footRight?: ReactNode;
  selected?: boolean;
  onClick?(): void;
}) {
  const className = `ns-ui-statcard${selected ? ' ns-ui-statcard-selected' : ''}${onClick ? ' ns-ui-statcard-clickable' : ''}`;

  // The badge renders twice — once for the head row, once for the foot row —
  // and CSS picks which copy shows (`.ns-ui-statcard-badge-head` /
  // `-foot`). A phone-width page can move the badge into the foot row
  // (docs/REVIEW.md S12: the "2031 · +5 YRS" label was wrapping to three
  // lines beside it in the head) purely by toggling that CSS, with no DOM
  // reordering and no second render prop to keep in sync.
  const body = (
    <>
      <div className="ns-ui-statcard-head">
        <span className="ns-ui-statcard-label">{label}</span>
        {badge && <span className="ns-ui-statcard-badge ns-ui-statcard-badge-head">{badge}</span>}
      </div>
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

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={selected}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
