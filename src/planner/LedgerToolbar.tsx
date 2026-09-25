import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePlanner } from './PlannerContext';
import { CompareDiff } from './CompareDiff';
import { Select, type SelectOption } from './ui';

/**
 * The Compare picker + year-window pager, shared by the three ledger pages
 * (Accounts / Cash Flow / Events — `pages/*.tsx`). Meant to sit in a
 * `SectionCard`'s header `actions` (docs/REDESIGN-V3.md "Shared toolbar") —
 * the compact "‹ 2026–2033 ›" pager plus a real `Select` for Compare rather
 * than a native `<select>`. The diff panel that used to render directly
 * beneath this row is now `LedgerCompareDiff`, a separate export so a page
 * can place it in its `SectionCard`'s body instead of its header.
 */
export function LedgerToolbar({ showPager }: { showPager: boolean }) {
  const {
    visiblePlans,
    stored,
    comparePlan,
    updateSettings,
    windowLabel,
    clampedStart,
    maxStart,
    pageEarlier,
    pageLater,
  } = usePlanner();

  const compareOptions: SelectOption[] = [
    { value: '', label: 'No comparison' },
    ...visiblePlans.filter((p) => p.id !== stored.id).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="ns-ledger-toolbar">
      {comparePlan?.isWhatIfSnapshot ? (
        // A What-If's `compareToPlanId` points at a hidden snapshot, not a
        // plan this select ever lists (`visiblePlans` excludes it on
        // purpose) — showing the live picker here would either read "None"
        // (the value matches no option) or let a stray pick silently orphan
        // the snapshot. The Compare page owns keeping/reverting/forking it.
        <Link to="/compare" className="ns-compare-whatif-link">
          What-If in progress
        </Link>
      ) : (
        <Select
          placeholder="Compare"
          options={compareOptions}
          value={stored.settings.compareToPlanId ?? ''}
          onChange={(value) => updateSettings(stored.id, { compareToPlanId: value || undefined })}
        />
      )}

      {showPager && (
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
      )}
    </div>
  );
}

/** The Compare diff panel, when a compare plan is set — a page's own body
    content (typically the first thing inside its main `SectionCard`), kept
    separate from the toolbar row above so it doesn't have to live in a
    header. Renders nothing when there's no comparison in progress. */
export function LedgerCompareDiff() {
  const { plan, result, comparePlan, compare } = usePlanner();
  if (!comparePlan || !compare) return null;

  // A What-If's snapshot is the "before" (see the matching comment on
  // ComparePage.tsx), so plan/comparePlan swap here too, for the same
  // "moves OLD → NEW" reading.
  return comparePlan.isWhatIfSnapshot ? (
    <CompareDiff plan={comparePlan} comparePlan={plan} result={compare.result} compareResult={result} />
  ) : (
    <CompareDiff plan={plan} comparePlan={comparePlan} result={result} compareResult={compare.result} />
  );
}
