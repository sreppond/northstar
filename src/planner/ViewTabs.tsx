// SEPP stays a valid destination — `App.tsx` still renders `SeppForecastView`
// for it — it is just no longer a top-level tab. docs/REDESIGN.md §3.1: SEPP
// is one tactic for one situation, not a peer of the whole plan. Phase 4 gives
// it a real home as an expandable tool inside Retirement; until then it is
// simply unreachable from this row, not deleted.
export type ViewId = 'netWorth' | 'retirement' | 'house' | 'sepp';

const VIEWS: { id: ViewId; name: string }[] = [
  { id: 'netWorth', name: 'Net Worth' },
  { id: 'retirement', name: 'Retirement' },
  { id: 'house', name: 'House' },
];

// Lives in the header bar rather than behind the hamburger: with only three
// destinations, hiding them cost more in orientation than it saved in space.
export function ViewTabs({ view, onSelect }: { view: ViewId; onSelect(view: ViewId): void }) {
  return (
    <div className="ns-segmented ns-view-switch" role="tablist" aria-label="Forecast views">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          className="ns-tab"
          aria-selected={view === v.id}
          onClick={() => onSelect(v.id)}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}
