import type { Account, AccountClass, YearSnapshot } from '@northstar/engine';
import { ACCOUNT_TYPES, ASSET_CLASSES, LIABILITY_CLASSES } from '@northstar/engine';
import { tableMoney } from '../format';
import { accountDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { Cell, type CellMagnitude } from './DataTable';
import { GearIcon } from '../icons';
import { ACCOUNT_ICON } from '../domainIcons';
import { classBalances, missingAccountClasses } from '../ledger';

/**
 * The balance sheet, one row per ACCOUNT TYPE rather than per linked account.
 *
 * Each type row carries a gear: hover it for the assumptions behind that line,
 * click to edit them. Synthetic accounts created by events roll into their
 * class row but are not editable from here.
 */
export function AccountsTab({
  window: years,
  accounts,
  highlightYear,
  onEditType,
}: {
  window: YearSnapshot[];
  accounts: Account[];
  /** The scrubbed year (docs/REDESIGN.md §4.1) — null/undefined highlights
      nothing. */
  highlightYear?: number | null;
  onEditType(accountClass: AccountClass): void;
}) {
  const yearLabels = years.map((y) => y.year);
  const style = { ['--cols' as string]: yearLabels.length };

  const classRow = (accountClass: AccountClass, liability: boolean) => classBalances(years, accountClass, liability);

  /**
   * Types not yet on the balance sheet, offered as a trailing add row — a
   * plain flush flex row spanning the table's full width rather than a
   * `.ns-grid` row confined to the 268px label column, which is what used
   * to wrap several pills into a vertical stack instead of one tidy row
   * (docs/REDESIGN-V3.md "Accounts").
   */
  const renderAddRow = (classes: AccountClass[], liability: boolean) => {
    const missing = missingAccountClasses(classes, liability, accounts, years);
    if (missing.length === 0) return null;

    return (
      <div className="ns-add-row-flush">
        <span className="ns-add-label">Add</span>
        {missing.map((accountClass) => (
          <button key={accountClass} type="button" className="ns-add-pill" onClick={() => onEditType(accountClass)}>
            + {ACCOUNT_TYPES[accountClass].label}
          </button>
        ))}
      </div>
    );
  };

  const renderGroup = (classes: AccountClass[], liability: boolean) =>
    classes
      .map((accountClass) => ({ accountClass, cells: classRow(accountClass, liability) }))
      .filter(({ accountClass, cells }) => {
        // Show a type when it has value in view, or when the user has set it up
        // even though it is currently zero.
        if (cells.some((v) => Math.abs(v) >= 1)) return true;
        return accounts.some((a) => a.accountClass === accountClass && !a.isSynthetic);
      })
      .map(({ accountClass, cells }) => {
        const owned = accounts.find((a) => a.accountClass === accountClass && !a.isSynthetic);
        const synthetic = accounts.filter(
          (a) => a.accountClass === accountClass && a.isSynthetic,
        );
        const spec = ACCOUNT_TYPES[accountClass];
        const closing = cells[cells.length - 1];
        const lastYearRow = years[years.length - 1];
        const baseRemaining = (id: string) =>
          lastYearRow?.accounts.find((a) => a.accountId === id)?.nonTaxableBaseRemaining;

        // Magnitude bar, scaled to THIS row's own max across its visible
        // columns (docs/REDESIGN.md §4.1) — an asset row reuses the "money
        // in" hue, a liability row the "money out" hue, the same tone
        // convention EventsTab.tsx's Gantt bars use, applied here to a
        // dollar magnitude rather than a time span.
        const rowMax = Math.max(1, ...cells.map((v) => Math.abs(v)));

        // The whole row opens the editor, not just its gear
        // (docs/REDESIGN-V3.md "Accounts") — but only when there's an
        // owned account to edit; a synthetic-only row's gear is locked for
        // the same reason.
        const rowProps = owned
          ? {
              role: 'button' as const,
              tabIndex: 0,
              onClick: () => onEditType(accountClass),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onEditType(accountClass);
                }
              },
            }
          : {};

        return (
          <div
            key={accountClass}
            className={`ns-grid ns-row-child${owned ? ' ns-row-clickable' : ''}`}
            style={style}
            {...rowProps}
          >
            <div className="ns-type-cell">
              {(() => {
                const Icon = ACCOUNT_ICON[accountClass];
                return <Icon size={14} strokeWidth={2} className="ns-type-icon" aria-hidden />;
              })()}
              <span className="ns-type-name" title={spec.label}>
                {spec.label}
              </span>
              {owned ? (
                <HoverCard detail={accountDetail(owned, closing, baseRemaining(owned.id))}>
                  <button
                    type="button"
                    className="ns-gear"
                    aria-label={`${spec.label} settings`}
                    onClick={() => onEditType(accountClass)}
                  >
                    <GearIcon />
                  </button>
                </HoverCard>
              ) : synthetic.length > 0 ? (
                <HoverCard
                  detail={accountDetail(synthetic[0], closing, baseRemaining(synthetic[0].id))}
                >
                  <span className="ns-gear ns-gear-locked" aria-label="Managed by a life event">
                    <GearIcon />
                  </span>
                </HoverCard>
              ) : null}
            </div>
            {cells.map((v, i) => {
              const magnitude: CellMagnitude = {
                fraction: Math.abs(v) / rowMax,
                tone: liability ? 'cost' : 'income',
              };
              return (
                <Cell
                  key={i}
                  value={tableMoney(v)}
                  magnitude={magnitude}
                  highlighted={yearLabels[i] === highlightYear}
                />
              );
            })}
          </div>
        );
      });

  return (
    <div className="ns-table-scroll">
      <div className="ns-grid ns-row-head" style={style}>
        {/* The SectionCard above already titles this "Balance sheet" —
            this column header just needs to say what its own rows are. */}
        <div>Account</div>
        {yearLabels.map((y) => (
          <div key={y} className={y === highlightYear ? 'ns-col-scrub' : undefined}>
            {y}
          </div>
        ))}
      </div>

      <div className="ns-grid ns-row-total" style={style}>
        <div>Net worth</div>
        {years.map((y) => (
          <Cell key={y.year} value={tableMoney(y.netWorth)} highlighted={y.year === highlightYear} />
        ))}
      </div>

      <div className="ns-grid ns-row-group" style={style}>
        <div>Assets</div>
        {years.map((y) => (
          <Cell key={y.year} value={tableMoney(y.assets)} highlighted={y.year === highlightYear} />
        ))}
      </div>
      {renderGroup(ASSET_CLASSES, false)}
      {renderAddRow(ASSET_CLASSES, false)}

      <div className="ns-grid ns-row-group" style={style}>
        <div>Liabilities</div>
        {years.map((y) => (
          <Cell key={y.year} value={tableMoney(y.liabilities)} highlighted={y.year === highlightYear} />
        ))}
      </div>
      {renderGroup(LIABILITY_CLASSES, true)}
      {renderAddRow(LIABILITY_CLASSES, true)}
    </div>
  );
}
