import type { Account, AccountClass, YearSnapshot } from '@northstar/engine';
import { ACCOUNT_TYPES, ASSET_CLASSES, LIABILITY_CLASSES } from '@northstar/engine';
import { money } from '../format';
import { accountDetail } from '../detail';
import { HoverCard } from '../HoverCard';

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
  onEditType,
}: {
  window: YearSnapshot[];
  accounts: Account[];
  onEditType(accountClass: AccountClass): void;
}) {
  const yearLabels = years.map((y) => y.year);
  const style = { ['--cols' as string]: yearLabels.length };

  const classRow = (accountClass: AccountClass, liability: boolean) =>
    years.map((y) =>
      y.accounts
        .filter((a) => a.isLiability === liability && a.accountClass === accountClass)
        .reduce((total, a) => total + a.close, 0),
    );

  /** Types not yet on the balance sheet, offered as a trailing add row. */
  const renderAddRow = (classes: AccountClass[], liability: boolean) => {
    const missing = classes.filter((accountClass) => {
      const hasValue = classRow(accountClass, liability).some((v) => Math.abs(v) >= 1);
      const owned = accounts.some((a) => a.accountClass === accountClass && !a.isSynthetic);
      return !hasValue && !owned;
    });
    if (missing.length === 0) return null;

    return (
      <div className="ns-grid ns-row-child ns-row-add" style={style}>
        <div className="ns-add-cell">
          <span className="ns-add-label">Add</span>
          {missing.map((accountClass) => (
            <button
              key={accountClass}
              type="button"
              className="ns-add-pill"
              onClick={() => onEditType(accountClass)}
            >
              + {ACCOUNT_TYPES[accountClass].label}
            </button>
          ))}
        </div>
        {yearLabels.map((y) => (
          <div key={y} />
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

        return (
          <div key={accountClass} className="ns-grid ns-row-child" style={style}>
            <div className="ns-type-cell">
              <span className="ns-type-name" title={spec.label}>
                {spec.label}
              </span>
              {owned ? (
                <HoverCard detail={accountDetail(owned, closing)}>
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
                <HoverCard detail={accountDetail(synthetic[0], closing)}>
                  <span className="ns-gear ns-gear-locked" aria-label="Managed by a life event">
                    <GearIcon />
                  </span>
                </HoverCard>
              ) : null}
            </div>
            {cells.map((v, i) => (
              <div key={i}>{money(v)}</div>
            ))}
          </div>
        );
      });

  return (
    <div>
      <div className="ns-grid ns-row-head" style={style}>
        <div>Balance sheet</div>
        {yearLabels.map((y) => (
          <div key={y}>{y}</div>
        ))}
      </div>

      <div className="ns-grid ns-row-total" style={style}>
        <div>Net worth</div>
        {years.map((y) => (
          <div key={y.year}>{money(y.netWorth)}</div>
        ))}
      </div>

      <div className="ns-grid ns-row-group" style={style}>
        <div>Assets</div>
        {years.map((y) => (
          <div key={y.year}>{money(y.assets)}</div>
        ))}
      </div>
      {renderGroup(ASSET_CLASSES, false)}
      {renderAddRow(ASSET_CLASSES, false)}

      <div className="ns-grid ns-row-group" style={style}>
        <div>Liabilities</div>
        {years.map((y) => (
          <div key={y.year}>{money(y.liabilities)}</div>
        ))}
      </div>
      {renderGroup(LIABILITY_CLASSES, true)}
      {renderAddRow(LIABILITY_CLASSES, true)}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
