import type { AccountClass } from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { LedgerToolbar } from '../LedgerToolbar';
import { AccountsTab } from '../tabs/AccountsTab';

export function AccountsPage() {
  const { windowYears, allAccounts, scrubYear, stored, setAccountDraft } = usePlanner();

  return (
    <section className="ns-card">
      <LedgerToolbar showPager />
      <AccountsTab
        window={windowYears}
        accounts={allAccounts}
        highlightYear={scrubYear}
        onEditType={(accountClass: AccountClass) => {
          const owned = stored.accounts.find(
            (a) => a.accountClass === accountClass && !a.isSynthetic,
          );
          setAccountDraft(structuredClone(owned ?? newAccountOfType(accountClass)));
        }}
      />
    </section>
  );
}
