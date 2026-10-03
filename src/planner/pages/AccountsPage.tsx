import { useEffect, useRef, useState } from 'react';
import type { AccountClass } from '@northstar/engine';
import { ACCOUNT_TYPES, ASSET_CLASSES, LIABILITY_CLASSES, newAccountOfType } from '@northstar/engine';
import { Plus } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { LedgerToolbar, LedgerCompareDiff } from '../LedgerToolbar';
import { AccountsTab } from '../tabs/AccountsTab';
import { asOfDateLabel, planMetaLine, money } from '../format';
import { assetMixToday, missingAccountClasses, netWorthStats } from '../ledger';
import { Page, PageHeader, StatStrip, Stat, SectionCard, StackedBar } from '../ui';
import './ledger.css';

export function AccountsPage() {
  const { windowYears, allAccounts, scrubYear, stored, result, setAccountDraft } = usePlanner();

  // "Today" and "at {endYear}" must come from the FULL projection, never the
  // paged table window — `windowYears` is whatever 8-year slice the pager
  // currently shows, so paging to "Later years" was reading a future year's
  // balance as "today" (REVIEW.md M1). Same reason the Add-account menu
  // below checks `result.years`: a class missing from a paged window isn't
  // necessarily missing from the plan.
  const stats = netWorthStats(result.years, result.opening);
  const mix = assetMixToday(result.years, result.opening);
  const asOf = stored.settings.asOfDate ?? `${stored.settings.startYear}-01-01`;
  const asOfLabel = asOfDateLabel(asOf);

  const missing = [
    ...missingAccountClasses(ASSET_CLASSES, false, allAccounts, result.years).map((accountClass) => ({
      accountClass,
      liability: false,
    })),
    ...missingAccountClasses(LIABILITY_CLASSES, true, allAccounts, result.years).map((accountClass) => ({
      accountClass,
      liability: true,
    })),
  ];

  return (
    <Page>
      <PageHeader
        title="Accounts"
        meta={planMetaLine(stored, result.endYear)}
        actions={<AddAccountMenu missing={missing} onPick={(accountClass) => setAccountDraft(structuredClone(newAccountOfType(accountClass)))} />}
      />

      <StatStrip>
        {/* No delta tag here (docs/ROADMAP-10.md C1) — a "+$3.85M" pill next
            to "NET WORTH TODAY" read as today's own change, when it's
            actually the horizon's. The arrow in the sub line already says
            that without needing a second, misplaced figure. */}
        <Stat
          size="xl"
          label="Net worth today"
          value={money(stats.netWorthToday)}
          sub={`→ ${money(stats.netWorthAtEnd)} by ${result.endYear}`}
          explain={`Every asset's balance minus every liability's, as of ${asOfLabel} — your plan's real "today," not the first plan year's projected Dec 31 close.`}
        />
        <Stat
          label="Assets"
          value={money(stats.assetsToday)}
          explain={`Every asset account's balance as of ${asOfLabel}, before subtracting liabilities.`}
        />
        <Stat
          label="Liabilities"
          value={money(stats.liabilitiesToday)}
          explain={`Every liability account's balance (mortgages, loans) as of ${asOfLabel}.`}
        />
        <Stat
          label="Liquid"
          value={money(stats.liquidToday)}
          sub="Cash + taxable"
          explain={`Cash and taxable-investment balances as of ${asOfLabel} — the two buckets you could spend without a withdrawal penalty or triggering a tax event.`}
        />
      </StatStrip>

      {mix.length > 0 && (
        <SectionCard title="Where it sits" meta="Today" divider={false}>
          <StackedBar segments={mix} format={money} />
        </SectionCard>
      )}

      <SectionCard title="Balance sheet" flush actions={<LedgerToolbar showPager />}>
        <LedgerCompareDiff />
        <AccountsTab
          window={windowYears}
          accounts={allAccounts}
          highlightYear={scrubYear}
          opening={result.opening}
          onEditType={(accountClass: AccountClass) => {
            const owned = stored.accounts.find(
              (a) => a.accountClass === accountClass && !a.isSynthetic,
            );
            setAccountDraft(structuredClone(owned ?? newAccountOfType(accountClass)));
          }}
        />
      </SectionCard>
    </Page>
  );
}

/**
 * The header's "+ Add account" action (docs/REDESIGN-V3.md "Accounts") — a
 * trigger + popover listing every account type not yet on the balance sheet,
 * reusing `Select`'s own popover chrome (`.ns-ui-select-popover`/`-option`
 * from `ui/ui.css`) since this is the same "trigger opens a listbox" shape,
 * just acting immediately on a pick instead of persisting a selection. Local
 * to this page rather than a new `ui/*` component — `AccountDrawer` has no
 * way to change an account's class once open, so this menu is the only
 * place that decision gets made, which is specific to Accounts.
 */
function AddAccountMenu({
  missing,
  onPick,
}: {
  missing: { accountClass: AccountClass; liability: boolean }[];
  onPick(accountClass: AccountClass): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Grouped under two eyebrow headings (REVIEW.md M12) rather than one flat
  // list — "Assets" then "Liabilities" — but still one flat set of arrow-key
  // stops, so `ordered` is what Up/Down/Home/End index into.
  const assets = missing.filter((m) => !m.liability);
  const liabilities = missing.filter((m) => m.liability);
  const ordered = [...assets, ...liabilities];

  useEffect(() => {
    if (!open) return;
    // Focus the first item on open — before this, Enter then ArrowDown left
    // focus stranded on the trigger (REVIEW.md M12).
    itemRefs.current[0]?.focus();
    const onMouseDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  if (missing.length === 0) return null;

  function close(returnFocusToTrigger: boolean) {
    setOpen(false);
    if (returnFocusToTrigger) triggerRef.current?.focus();
  }

  function focusItem(index: number) {
    const clamped = (index + ordered.length) % ordered.length;
    itemRefs.current[clamped]?.focus();
  }

  function onItemKeyDown(e: React.KeyboardEvent, index: number) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(ordered.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        // Let focus continue moving naturally, just close the popover.
        setOpen(false);
        break;
    }
  }

  const renderGroup = (label: string, items: { accountClass: AccountClass; liability: boolean }[]) =>
    items.length > 0 && (
      <div key={label}>
        <div className="ns-add-account-group" role="presentation">
          {label}
        </div>
        {items.map(({ accountClass }) => {
          const index = ordered.findIndex((m) => m.accountClass === accountClass);
          return (
            <button
              key={accountClass}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitem"
              className="ns-ui-select-option ns-add-account-item"
              onClick={() => {
                onPick(accountClass);
                close(false);
              }}
              onKeyDown={(e) => onItemKeyDown(e, index)}
            >
              <span>{ACCOUNT_TYPES[accountClass].label}</span>
            </button>
          );
        })}
      </div>
    );

  return (
    <div className="ns-add-account-menu" ref={root}>
      <button
        ref={triggerRef}
        type="button"
        className="ns-btn ns-btn-primary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={14} strokeWidth={2.25} aria-hidden /> Add account
      </button>
      {open && (
        <div className="ns-ui-select-popover" role="menu" aria-label="Add account">
          {renderGroup('Assets', assets)}
          {renderGroup('Liabilities', liabilities)}
        </div>
      )}
    </div>
  );
}
