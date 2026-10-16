import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlanner } from './PlannerContext';

/**
 * The year-window pager shared by the ledger pages (Accounts / Cash Flow —
 * `pages/*.tsx`), meant to sit in a `SectionCard`'s header `actions`: the
 * compact "‹ 2026–2033 ›".
 *
 * The Compare picker and its `LedgerCompareDiff` panel used to live here and
 * are gone (docs/REDESIGN-V5.md §4.4, R9: comparisons are removed from the
 * ledger pages; the Scenarios page keeps its own picker). The pager stays
 * until Net Worth and Cash Flow swap it for a sideways-scrolling table
 * (§3.7), which is Phase C's job to remove.
 */
export function LedgerToolbar({ showPager }: { showPager: boolean }) {
  const { windowLabel, clampedStart, maxStart, pageEarlier, pageLater } = usePlanner();

  if (!showPager) return null;

  return (
    <div className="ns-ledger-toolbar">
      <div className="ns-window">
        <button
          type="button"
          className="ns-btn ns-btn-square"
          aria-label="Earlier years"
          disabled={clampedStart === 0}
          onClick={pageEarlier}
        >
          <ChevronLeft size={14} strokeWidth={2} aria-hidden />
        </button>
        <span className="ns-window-label">{windowLabel}</span>
        <button
          type="button"
          className="ns-btn ns-btn-square"
          aria-label="Later years"
          disabled={clampedStart >= maxStart}
          onClick={pageLater}
        >
          <ChevronRight size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
