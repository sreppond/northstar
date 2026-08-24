export type ViewId = 'netWorth' | 'retirement' | 'house' | 'sepp';

const VIEWS: { id: ViewId; name: string }[] = [
  { id: 'netWorth', name: 'Net Worth' },
  { id: 'retirement', name: 'Retirement' },
  { id: 'house', name: 'House' },
  { id: 'sepp', name: 'SEPP' },
];

// Lives in the header pill rather than behind the hamburger: with only four
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
