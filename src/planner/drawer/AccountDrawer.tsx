import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Account } from '@northstar/engine';
import { ACCOUNT_TYPES, LIABILITY_CLASSES, newAccountOfType } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { ACCOUNT_ICON } from '../domainIcons';
import { presentResult } from '../impact';
import { monthlyDangerBand } from '../pages/netWorthData';
import { Segmented } from '../ui';
import { Sheet } from '../ui/Sheet';
import { AnnuityAccountSection } from '../views/AnnuityAccountSection';
import { AccountForm } from './AccountForm';
import { AccountInsight } from './AccountInsight';
import { AccountSheetHead } from './AccountSheetHead';

/**
 * Per-account-type settings, in a `Sheet` (docs/REDESIGN-V5.md §3.6, §5.1.4).
 *
 * Two layers. `AccountDrawer` is the plain shell — a sheet around
 * `AccountForm` with Cancel / Save — and is what `Onboarding` still uses,
 * outside any `PlannerProvider`. `AccountSheet` below is the connected one
 * `App.tsx` mounts for `accountDraft`: the same shell with the class's
 * balance chart and year waterfall above the form, edits previewing as a
 * ghost line, and Keep / Reset instead of Save / Cancel.
 */
interface Props {
  /** Defaults to true; the connected sheet flips it to play the exit. */
  open?: boolean;
  draft: Account;
  synthetic: Account[];
  planStartYear: number;
  planEndYear: number;
  onChange(next: Account): void;
  onSave(): void;
  onCancel(): void;
  /** Above the form: the chart and flow. */
  before?: ReactNode;
  /** Below the form: the annuity contract detail. */
  after?: ReactNode;
  /** Replaces Cancel / Save. */
  footer?: ReactNode;
  /** A life event's account: no form, the settings live on the event. */
  readOnly?: boolean;
}

export function AccountDrawer({
  open = true,
  draft,
  synthetic,
  planStartYear,
  planEndYear,
  onChange,
  onSave,
  onCancel,
  before,
  after,
  footer,
  readOnly = false,
}: Props) {
  const spec = ACCOUNT_TYPES[draft.accountClass];
  const Icon = ACCOUNT_ICON[draft.accountClass];
  const titleId = useId();
  // V5-REVIEW-1 F22: what this account type is lives behind the header's (i),
  // not in a paragraph above every form.
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={draft.name || spec.label}
      labelledBy={titleId}
      header={
        <AccountSheetHead
          Icon={Icon}
          title={draft.name || spec.label}
          titleId={titleId}
          accountClass={draft.accountClass}
          about={spec.blurb}
          aboutOpen={aboutOpen}
          onToggleAbout={() => setAboutOpen((v) => !v)}
        />
      }
      footer={
        footer ??
        (readOnly ? undefined : (
          <div className="ns-nw-sheet-foot">
            <button type="button" className="ns-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="ns-btn ns-btn-primary" onClick={onSave}>
              Save
            </button>
          </div>
        ))
      }
    >
      <div className="ns-nw-sheet-body">
        {aboutOpen && <p className="ns-drawer-hint ns-nw-about-note">{spec.blurb}</p>}
        {before}
        {readOnly ? (
          <div className="ns-readonly-note">
            <div className="ns-readonly-title">Set by a life event</div>
            {synthetic.map((a) => (
              <div key={a.id} className="ns-readonly-row">
                <span>{a.name}</span>
              </div>
            ))}
            <p className="ns-drawer-hint">This account is rebuilt from its event on every run, so its settings live there.</p>
          </div>
        ) : (
          <AccountForm
            draft={draft}
            synthetic={synthetic}
            planStartYear={planStartYear}
            planEndYear={planEndYear}
            onChange={onChange}
          />
        )}
        {after}
      </div>
    </Sheet>
  );
}

/**
 * The connected account sheet. Mounted once by `App.tsx`; `accountDraft`
 * (PlannerContext) decides whether it is open, so anything that calls
 * `setAccountDraft` — a table row, a snapshot row, a plan check, the Annuity
 * page — lands here.
 */
export function AccountSheet() {
  const { accountDraft } = usePlanner();
  // Keep the last draft while the exit plays: `accountDraft` is already null
  // by then, and a sheet with nothing to show would vanish instead of slide.
  const last = useRef<Account | null>(null);
  if (accountDraft) last.current = accountDraft;
  if (!last.current) return null;
  return <AccountSheetBody draft={last.current} open={accountDraft !== null} />;
}

function AccountSheetBody({ draft, open }: { draft: Account; open: boolean }) {
  const {
    stored,
    plan,
    result,
    allAccounts,
    health,
    focusYear,
    setFocusYear,
    chartRange,
    setChartRange,
    setAccountDraft,
    upsertAccount,
  } = usePlanner();

  const accountClass = draft.accountClass;
  const spec = ACCOUNT_TYPES[accountClass];
  const liability = LIABILITY_CLASSES.includes(accountClass);
  const synthetic = allAccounts.filter((a) => a.isSynthetic && a.accountClass === accountClass);
  const saved = stored.accounts.find((a) => a.id === draft.id);
  const isNew = !saved && !draft.isSynthetic;
  const readOnly = draft.isSynthetic === true;
  const dirty = isNew || (saved !== undefined && JSON.stringify(saved) !== JSON.stringify(draft));

  // Edits re-run the plan with the draft swapped in and show as a ghost line
  // (docs/REDESIGN-V4.md §1.4 "Preview, then keep"): the stored plan is
  // untouched until Keep.
  const ghostResult = useMemo(() => {
    if (!dirty || readOnly) return null;
    const accounts = plan.accounts.some((a) => a.id === draft.id)
      ? plan.accounts.map((a) => (a.id === draft.id ? draft : a))
      : [...plan.accounts, draft];
    return presentResult({ ...plan, accounts });
  }, [dirty, readOnly, plan, draft]);

  const siblings = stored.accounts.filter((a) => a.accountClass === accountClass && !a.isSynthetic);
  const pickerOptions = [
    ...siblings.map((a) => ({ value: a.id, label: a.name })),
    ...(isNew ? [{ value: draft.id, label: 'New' }] : []),
  ];

  const initialRange = useRef(chartRange).current;

  const before = (
    <>
      {pickerOptions.length > 1 && (
        <Segmented
          size="sm"
          ariaLabel={`${spec.label} accounts`}
          options={pickerOptions}
          value={draft.id}
          onChange={(id) => {
            const next = siblings.find((a) => a.id === id);
            if (next) setAccountDraft(structuredClone(next));
          }}
        />
      )}
      <AccountInsight
        plan={plan}
        result={result}
        accountClass={accountClass}
        label={spec.label}
        liability={liability}
        accountId={draft.id}
        showAccountLine={siblings.length > 1 && !isNew}
        ghostResult={ghostResult}
        initialRange={initialRange}
        focusYear={focusYear}
        onFocusYear={setFocusYear}
        danger={monthlyDangerBand(health, plan, result)}
        onRequestRange={setChartRange}
      />
    </>
  );

  return (
    <AccountDrawer
      open={open}
      draft={draft}
      synthetic={readOnly ? synthetic.filter((a) => a.id === draft.id) : []}
      planStartYear={stored.settings.startYear}
      planEndYear={result.endYear}
      onChange={setAccountDraft}
      onSave={() => upsertAccount(stored.id, draft)}
      onCancel={() => setAccountDraft(null)}
      readOnly={readOnly}
      before={before}
      after={
        accountClass === 'variableAnnuity' && saved ? (
          <AnnuityAccountSection plan={plan} result={result} account={saved} />
        ) : undefined
      }
      footer={
        readOnly ? undefined : (
          <div className="ns-nw-sheet-foot">
            <button
              type="button"
              className="ns-btn-ghost"
              disabled={!dirty}
              onClick={() => setAccountDraft(structuredClone(saved ?? newAccountOfType(accountClass)))}
            >
              Reset
            </button>
            <button type="button" className="ns-btn ns-btn-primary" disabled={!dirty} onClick={() => upsertAccount(stored.id, draft)}>
              {isNew ? 'Add' : 'Keep'}
            </button>
          </div>
        )
      }
    />
  );
}
