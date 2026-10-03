/**
 * Totals a Monarch snapshot's active accounts into assets vs. liabilities,
 * classified the SAME way the app classifies an import (`classify` +
 * `LIABILITY_CLASSES` from the engine) — never by the account's balance
 * SIGN. This used to sort by sign and misreported a credit card as an
 * ASSET whenever Monarch's own `displayBalance` for that account happened
 * to be non-negative (docs/W3-REVIEW.md "Monarch-sync reporting a credit
 * card as an asset"), while `applyImport` (reading `type`/`subtype`) filed
 * the very same account correctly as a liability.
 *
 * Pulled out of `monarch-sync.mjs` into its own module so this can be unit
 * tested without launching Chrome — that file's `main()` runs
 * unconditionally on import.
 */
export function summarizeBalances(snapshot, classify, LIABILITY_CLASSES) {
  const active = snapshot.accounts.filter((a) => a.is_active !== false && !a.is_hidden);
  let assets = 0;
  let liabilities = 0;
  for (const account of active) {
    const balance = Math.abs(account.balance ?? 0);
    const classification = classify(account, snapshot.overrides);
    const isLiability =
      classification.kind === 'mapped' && LIABILITY_CLASSES.includes(classification.accountClass);
    if (isLiability) liabilities += balance;
    else assets += balance;
  }
  return { assets, liabilities, netWorth: assets - liabilities, count: active.length };
}
