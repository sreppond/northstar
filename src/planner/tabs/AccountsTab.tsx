import { Fragment, memo, useState } from 'react';
import type { Account, AccountClass, OpeningSnapshot, YearSnapshot } from '@northstar/engine';
import { ACCOUNT_TYPES, ASSET_CLASSES, LIABILITY_CLASSES } from '@northstar/engine';
import { signedTableMoney, tableMoney } from '../format';
import { accountDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { Cell, YearHeadCell, type CellMagnitude } from './DataTable';
import { useScrollToYear } from './useScrollToYear';
import { GearIcon } from '../icons';
import { ACCOUNT_ICON } from '../domainIcons';
import { classBalances, missingAccountClasses } from '../ledger';
import { PopMenu } from '../pages/PopMenu';
import { accountFlowRows } from '../pages/netWorthData';
import { rememberRow } from '../drawer/rowMorph';
import { ChevronRight, Plus } from 'lucide-react';

/** Negatives keep their real minus sign; everything else prints as the table does. */
const flowMoney = (value: number) => (value < 0 ? signedTableMoney(value) : tableMoney(value));

/**
 * Balances over time (docs/REDESIGN-V5.md §5.1.5): one row per ACCOUNT TYPE
 * rather than per linked account, across EVERY year in a sideways-scrolling
 * table with a leading "Today" column.
 *
 * A row opens the account sheet; the gear still shows the assumptions behind
 * the line on hover. A class a life event created (the house and its
 * mortgage) opens the same sheet read-only. Adding an account type lives in a
 * quiet `+` in the header's sticky label cell, where a scrolled table can't
 * carry it away.
 *
 * Memoised (V5-REVIEW-1 F28): the page re-renders on every pointer move over
 * its chart, and this is by far its biggest subtree. Nothing hover-driven is
 * passed in, so with stable props (`onFocusYear`, `onEditType` are the page's
 * useCallbacks) a scrub never touches it.
 */
export const AccountsTab = memo(function AccountsTab({
  years,
  accounts,
  highlightYear,
  focusYear,
  onFocusYear,
  dangerYears,
  onEditType,
  opening,
}: {
  /** Every projected year (the table scrolls sideways, there is no pager). */
  years: YearSnapshot[];
  accounts: Account[];
  /** The scrubbed year (docs/REDESIGN.md §4.1) — null/undefined highlights
      nothing. Alias of `focusYear` (docs/REDESIGN-V5.md §3.7). */
  highlightYear?: number | null;
  /** Same contract as `DataTable`'s: highlighted + scrolled to centre. */
  focusYear?: number | null;
  onFocusYear?(year: number | null): void;
  dangerYears?: number[];
  onEditType(accountClass: AccountClass): void;
  /** The plan's real "today" (docs/W3-REVIEW.md "A 'Today' column") — a
      leading column ahead of the projected years, so $168K (today) and
      $204K (the first plan year's projected Dec 31 close) don't sit side by
      side with nothing saying which is which. Optional only so a caller
      mid-migration (or a test) can still render the table without it. */
  opening?: OpeningSnapshot;
}) {
  // The table scrolls now, so "Today" no longer has to be dropped at phone
  // width to make room (it was, back when a pager trimmed to two years).
  const showOpening = Boolean(opening);

  const focus = focusYear !== undefined ? focusYear : highlightYear;
  const { pickYear, scrollerProps } = useScrollToYear(focus, onFocusYear);
  // Each class's flows (additions, withdrawals, growth) open under its row, as Cash Flow's groups do.
  const [expanded, setExpanded] = useState<Set<AccountClass>>(() => new Set());
  const toggle = (accountClass: AccountClass) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(accountClass)) next.delete(accountClass);
      else next.add(accountClass);
      return next;
    });
  const isDanger = (y: number) => dangerYears?.includes(y) === true;

  const yearLabels = years.map((y) => y.year);
  // +1 for the leading "Today" column when there's an opening snapshot to
  // show one from.
  const style = { ['--cols' as string]: yearLabels.length + (showOpening ? 1 : 0) };

  const classRow = (accountClass: AccountClass, liability: boolean) => classBalances(years, accountClass, liability);
  const openingClassBalance = (accountClass: AccountClass, liability: boolean) =>
    opening
      ? opening.accounts
          .filter((a) => a.accountClass === accountClass && a.isLiability === liability)
          .reduce((sum, a) => sum + a.balance, 0)
      : 0;

  /** Types with no balance anywhere and none set up by hand, as `+` menu entries. */
  const addGroups = [
    { label: 'Assets', classes: ASSET_CLASSES, liability: false },
    { label: 'Liabilities', classes: LIABILITY_CLASSES, liability: true },
  ].map(({ label, classes, liability }) => ({
    label,
    items: missingAccountClasses(classes, liability, accounts, years).map((accountClass) => ({
      key: accountClass,
      label: ACCOUNT_TYPES[accountClass].label,
      onSelect: () => onEditType(accountClass),
    })),
  }));

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

        // The leading "Today" cell, from the opening snapshot rather than
        // `cells` (which is the projected years only) — prepended so it
        // shares this row's own magnitude-bar scale below instead of
        // reading against a different max than the years next to it.
        const todayValue = showOpening ? openingClassBalance(accountClass, liability) : undefined;
        const rowValues = todayValue !== undefined ? [todayValue, ...cells] : cells;

        // Magnitude bar, scaled to THIS row's own max across its visible
        // columns (docs/REDESIGN.md §4.1) — an asset row reuses the "money
        // in" hue, a liability row the "money out" hue, the same tone
        // convention EventsTab.tsx's Gantt bars use, applied here to a
        // dollar magnitude rather than a time span.
        const rowMax = Math.max(1, ...rowValues.map((v) => Math.abs(v)));

        // The whole row opens the editor, not just its gear
        // (docs/REDESIGN-V3.md "Accounts") — but only when there's an
        // owned account to edit; a synthetic-only row's gear is locked for
        // the same reason. The row's click is a pointer convenience only: the
        // keyboard and assistive tech reach the same action through the name,
        // a real button beside the chevron and gear rather than a button role
        // wrapped around them.
        const editable = Boolean(owned) || synthetic.length > 0;
        const rowProps = editable
          ? {
              onClick: (e: React.MouseEvent<HTMLElement>) => {
                rememberRow(e.currentTarget, accountClass);
                onEditType(accountClass);
              },
            }
          : {};

        const open = expanded.has(accountClass);
        const flows = open ? accountFlowRows(years, accountClass, liability, opening) : [];

        return [
          <div
            key={accountClass}
            className="ns-grid ns-row-child ns-row-clickable"
            style={style}
            {...rowProps}
          >
            <div className="ns-type-cell">
              <button
                type="button"
                className="ns-group-toggle"
                aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${spec.label} flows`}
                onClick={(e) => {
                  // The row itself opens the account sheet; the chevron only expands.
                  e.stopPropagation();
                  toggle(accountClass);
                }}
              >
                <ChevronRight size={13} strokeWidth={2} aria-hidden />
              </button>
              {(() => {
                const Icon = ACCOUNT_ICON[accountClass];
                return <Icon size={14} strokeWidth={2} className="ns-type-icon" data-morph="icon" aria-hidden />;
              })()}
              {editable ? (
                <button type="button" className="ns-type-name ns-type-open" data-morph="label" title={spec.label}>
                  {spec.label}
                </button>
              ) : (
                <span className="ns-type-name" data-morph="label" title={spec.label}>
                  {spec.label}
                </span>
              )}
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
            {rowValues.map((v, i) => {
              const isToday = todayValue !== undefined && i === 0;
              const yearIndex = todayValue !== undefined ? i - 1 : i;
              const magnitude: CellMagnitude = {
                fraction: Math.abs(v) / rowMax,
                tone: liability ? 'cost' : 'income',
              };
              return (
                <Cell
                  key={isToday ? 'today' : yearLabels[yearIndex]}
                  value={tableMoney(v)}
                  magnitude={magnitude}
                  highlighted={!isToday && yearLabels[yearIndex] === focus}
                  danger={!isToday && isDanger(yearLabels[yearIndex])}
                  divider={isToday}
                />
              );
            })}
          </div>,
          ...flows.map((flow) => (
            <div key={flow.key} className="ns-grid ns-row-child ns-flow-line" style={style}>
              <div title={flow.label}>{flow.label}</div>
              {showOpening && <Cell value="" divider />}
              {flow.values.map((v, i) => (
                <Cell
                  key={yearLabels[i]}
                  value={flowMoney(v)}
                  highlighted={yearLabels[i] === focus}
                  danger={isDanger(yearLabels[i])}
                />
              ))}
            </div>
          )),
        ];
      });

  return (
    <div {...scrollerProps}>
      <div className="ns-grid ns-row-head" style={style}>
        <div className="ns-nw-acct-head">
          <span>Account</span>
          <PopMenu
            label="Add an account"
            className="ns-nw-add"
            groups={addGroups}
            trigger={() => <Plus size={14} strokeWidth={2.25} aria-hidden />}
          />
        </div>
        {showOpening && <div className="ns-col-divider">Today</div>}
        {yearLabels.map((y) => (
          <YearHeadCell
            key={y}
            year={y}
            focused={y === focus}
            danger={isDanger(y)}
            onFocusYear={pickYear}
          />
        ))}
      </div>

      <div className="ns-grid ns-row-total" style={style}>
        <div>Net worth</div>
        {showOpening && opening && <Cell value={tableMoney(opening.netWorth)} divider />}
        {years.map((y) => (
          <Cell key={y.year} value={tableMoney(y.netWorth)} highlighted={y.year === focus} danger={isDanger(y.year)} />
        ))}
      </div>

      <div className="ns-grid ns-row-group" style={style}>
        <div>Assets</div>
        {showOpening && opening && <Cell value={tableMoney(opening.assets)} divider />}
        {years.map((y) => (
          <Cell key={y.year} value={tableMoney(y.assets)} highlighted={y.year === focus} danger={isDanger(y.year)} />
        ))}
      </div>
      {renderGroup(ASSET_CLASSES, false)}

      <div className="ns-grid ns-row-group" style={style}>
        <div>Liabilities</div>
        {showOpening && opening && <Cell value={tableMoney(opening.liabilities)} divider />}
        {years.map((y) => (
          <Cell key={y.year} value={tableMoney(y.liabilities)} highlighted={y.year === focus} danger={isDanger(y.year)} />
        ))}
      </div>
      {renderGroup(LIABILITY_CLASSES, true)}
    </div>
  );
});
