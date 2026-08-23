import { useEffect } from 'react';
import { MenuIcon } from './icons';

export type ViewId = 'netWorth' | 'retirement' | 'house' | 'sepp';

const VIEWS: { id: ViewId; name: string; blurb: string }[] = [
  { id: 'netWorth', name: 'Net worth', blurb: 'The whole plan: balance sheet, cash flow, events.' },
  { id: 'retirement', name: 'Retirement forecast', blurb: 'Income, spending, and the portfolio around retirement.' },
  { id: 'house', name: 'House forecast', blurb: 'Home value, mortgage payoff, and equity over time.' },
  { id: 'sepp', name: 'SEPP forecast', blurb: 'Fixed early-withdrawal payments from a tax-deferred account.' },
];

export function HamburgerButton({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="ns-hamburger" aria-label="Open menu" onClick={onClick}>
      <MenuIcon />
    </button>
  );
}

export function Sidebar({
  view,
  onSelect,
  onClose,
}: {
  view: ViewId;
  onSelect(view: ViewId): void;
  onClose(): void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="ns-scrim" onClick={onClose} />
      <aside className="ns-sidebar" role="dialog" aria-modal="true" aria-label="Forecast views">
        <div className="ns-sidebar-head">
          <div className="ns-drawer-title">Views</div>
          <button type="button" className="ns-btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <nav className="ns-sidebar-list">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="ns-sidebar-item"
              aria-current={view === v.id}
              onClick={() => {
                onSelect(v.id);
                onClose();
              }}
            >
              <span className="ns-sidebar-item-name">{v.name}</span>
              <span className="ns-sidebar-item-blurb">{v.blurb}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
