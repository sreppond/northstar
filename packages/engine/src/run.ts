/**
 * runPlan -- the engine entry point.
 *
 * Pure: same plan in, same result out, no I/O, no clock, no globals. This is
 * what lets the browser re-run the whole projection on every keystroke and the
 * server produce byte-identical numbers for exports.
 *
 * The order of operations inside each year is the contract. It is spelled out
 * in docs/PLAN.md §4.3 and mirrored by the step comments below. Every
 * disagreement between two financial tools traces back to ordering, so do not
 * reorder these without updating the golden tests and the doc.
 */
import type {
  Account,
  AccountYear,
  LineItem,
  Plan,
  PlanResult,
  YearSnapshot,
} from './types.js';
import { accountExistsIn, amortizeYear, growthRateFor, scheduledAnnualPayment } from './accounts.js';
import { planAllocations, planWithdrawals, type WaterfallContext } from './priority.js';
import {
  type CashFlowItem,
  type CompileContext,
  type CompileFailure,
  type CompiledEvent,
  type ContributionItem,
  type IncomeSuppression,
  compileEvent,
} from './events/index.js';

const EPSILON = 0.005;

export function runPlan(plan: Plan): PlanResult {
  const warnings: string[] = [];
  const { settings } = plan;
  const startYear = settings.startYear;

  // --- resolve the horizon before compiling ---------------------------------
  // `endOfPlan` sets it; otherwise fall back to projectionYears. Compilation
  // needs the horizon, so this cannot wait for the compile pass.
  const endOfPlanEvent = plan.events.find((e) => e.kind === 'endOfPlan' && e.isIncluded);
  const endYear = endOfPlanEvent
    ? Math.max(startYear, endOfPlanEvent.startYear)
    : startYear + Math.max(1, settings.projectionYears) - 1;

  const inflationAt = (year: number) =>
    Math.pow(1 + settings.inflationRate / 100, year - startYear);

  const ctx: CompileContext = {
    settings,
    participants: plan.participants,
    startYear,
    endYear,
    inflationAt,
  };

  // --- phase A: compile ------------------------------------------------------
  const failures: CompileFailure[] = [];
  const compiled: CompiledEvent[] = plan.events
    .filter((e) => e.isIncluded)
    .map((e) => compileEvent(e, ctx, failures));
  for (const f of failures) warnings.push(f.message);

  // --- assemble the account set ---------------------------------------------
  const accounts: Account[] = [
    ...plan.accounts.filter((a) => a.isIncluded),
    ...compiled.flatMap((c) => c.accountsCreated),
  ];
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // --- index compiled output by year ----------------------------------------
  const cashFlowsByYear = groupBy(
    compiled.flatMap((c) => c.cashFlows),
    (cf) => cf.year,
  );
  const contributionsByYear = groupBy(
    compiled.flatMap((c) => c.contributions),
    (c) => c.year,
  );
  const terminationsByYear = groupBy(
    compiled.flatMap((c) => c.accountTerminations),
    (t) => t.year,
  );
  const suppressions = compiled.flatMap((c) => c.incomeSuppressions);
  // Lets a suppression tell "the salary I replaced" from "a job that starts
  // after me" without the events themselves having to know about each other.
  const eventStartYear = new Map(plan.events.map((e) => [e.id, e.startYear]));
  const expenseMultipliers = compiled.flatMap((c) => c.expenseMultipliers);
  const stopContributionsFrom = compiled
    .map((c) => c.stopContributionsFrom)
    .filter((y): y is number => y !== undefined)
    .reduce<number | undefined>((min, y) => (min === undefined ? y : Math.min(min, y)), undefined);

  // --- participant ages ------------------------------------------------------
  const included = plan.participants.filter((p) => p.isIncluded);
  const oldest = included.reduce<(typeof included)[number] | undefined>(
    (acc, p) => (acc === undefined || p.birthYear < acc.birthYear ? p : acc),
    undefined,
  );
  const ageForAccount = (accountId: string, year: number): number | undefined => {
    const account = accountById.get(accountId);
    const owner = account?.ownerParticipantId
      ? included.find((p) => p.id === account.ownerParticipantId)
      : oldest;
    return owner ? year - owner.birthYear : undefined;
  };

  // --- where unallocated surplus lands --------------------------------------
  const sweepAccount =
    accounts.find((a) => !a.isLiability && a.accountClass === 'cash') ??
    accounts.find((a) => !a.isLiability);
  if (!sweepAccount) warnings.push('No asset account to hold surplus cash.');

  // --- running state ---------------------------------------------------------
  const balances = new Map<string, number>();
  const closed = new Set<string>();
  const years: YearSnapshot[] = [];

  // --- phase B: simulate -----------------------------------------------------
  for (let year = startYear; year <= endYear; year++) {
    // 1. AGE ­-- and bring any account that starts this year into existence.
    const ages: Record<string, number> = {};
    for (const p of included) ages[p.id] = year - p.birthYear;

    for (const account of accounts) {
      const begins = account.startYear ?? startYear;
      if (year === begins && !closed.has(account.id)) {
        balances.set(account.id, account.initialBalance);
      }
    }

    const income: LineItem[] = [];
    const expenses: LineItem[] = [];
    const taxes: LineItem[] = [];
    const withdrawalLines: LineItem[] = [];
    const allocationLines: LineItem[] = [];

    const opening = new Map(balances);

    // 2. TERMINATIONS -- close accounts at their opening balance. An asset's
    //    balance becomes proceeds; a liability's becomes a payoff. Both then
    //    flow through the ordinary waterfalls below.
    for (const t of terminationsByYear.get(year) ?? []) {
      const account = accountById.get(t.accountId);
      if (!account || closed.has(t.accountId)) continue;
      const balance = balances.get(t.accountId) ?? 0;

      if (account.isLiability) {
        if (balance > EPSILON) {
          expenses.push({
            label: t.label,
            amount: balance,
            sourceEventId: t.sourceEventId,
            accountId: t.accountId,
          });
        }
      } else if (balance > EPSILON) {
        income.push({
          label: t.label,
          amount: balance,
          sourceEventId: t.sourceEventId,
          accountId: t.accountId,
        });
      }

      balances.set(t.accountId, 0);
      closed.add(t.accountId);
    }

    const yearFlows = cashFlowsByYear.get(year) ?? [];

    // 3. INCOME -- baseline wages plus event income. Suppression is resolved
    //    per line, so one retirement can keep different fractions of each.
    const baselineIncome =
      settings.baselineIncome *
      inflationAt(year) *
      replacementFactorFor(suppressions, year, { isEarned: true, isBaseline: true }, eventStartYear);
    if (baselineIncome > EPSILON) {
      income.push({ label: 'Baseline income', amount: baselineIncome, category: 'income' });
    }
    let taxableIncome = baselineIncome;

    for (const cf of yearFlows.filter((f) => f.kind === 'income')) {
      const amount =
        cf.amount *
        replacementFactorFor(
          suppressions,
          year,
          {
            sourceEventId: cf.sourceEventId,
            isEarned: cf.isEarned ?? false,
            isBaseline: false,
          },
          eventStartYear,
        );
      if (amount <= EPSILON) continue;
      income.push({
        label: cf.label,
        amount,
        sourceEventId: cf.sourceEventId,
        category: cf.category,
      });
      if (cf.taxable) taxableIncome += amount;
    }

    // 4. EXPENSES -- baseline living costs plus event expenses.
    const baselineExpenses =
      settings.baselineExpenses * inflationAt(year) * expenseFactor(expenseMultipliers, year);
    if (baselineExpenses > EPSILON) {
      expenses.push({ label: 'Living expenses', amount: baselineExpenses, category: 'living' });
    }

    for (const cf of yearFlows.filter((f) => f.kind === 'expense')) {
      if (cf.amount <= EPSILON) continue;
      if (cf.category === 'tax') {
        taxes.push({ label: cf.label, amount: cf.amount, sourceEventId: cf.sourceEventId });
      } else {
        expenses.push({
          label: cf.label,
          amount: cf.amount,
          sourceEventId: cf.sourceEventId,
          category: cf.category,
        });
      }
    }

    // 5. DEBT SERVICE -- computed here because the payment is a cash outflow,
    //    but the balance change is not applied until step 10.
    const amortization = new Map<string, ReturnType<typeof amortizeYear>>();
    for (const account of accounts) {
      if (!account.isLiability || closed.has(account.id)) continue;
      if (!accountExistsIn(account, year)) continue;

      const balance = balances.get(account.id) ?? 0;
      if (balance <= EPSILON) continue;

      const payment = scheduledAnnualPayment(account, balance);
      const result = amortizeYear(balance, account.interestRate ?? 0, payment);
      amortization.set(account.id, result);

      if (result.payment > EPSILON) {
        expenses.push({
          label: `${account.name} payment`,
          amount: result.payment,
          accountId: account.id,
          sourceEventId: account.sourceEventId,
          category: 'debt',
        });
      }
    }

    // 6. CONTRIBUTIONS -- standing plus event-driven. Employer match never
    //    touches cash flow.
    const contributionsThisYear: ContributionItem[] = [];
    const contributionsStopped =
      stopContributionsFrom !== undefined && year >= stopContributionsFrom;

    if (!contributionsStopped) {
      for (const account of accounts) {
        if (account.isLiability || closed.has(account.id)) continue;
        if (!accountExistsIn(account, year)) continue;
        const standing = account.yearlyPaycheckContribution ?? 0;
        if (standing <= EPSILON) continue;
        contributionsThisYear.push({
          year,
          accountId: account.id,
          amount: standing,
          label: `${account.name} — contribution`,
          sourceEventId: '',
          fromPaycheck: true,
          pretax: account.accountClass === 'taxDeferredInvestment',
        });
      }
      for (const c of contributionsByYear.get(year) ?? []) {
        if (closed.has(c.accountId)) continue;
        contributionsThisYear.push(c);
      }
    }

    const paycheckContributions = sum(
      contributionsThisYear.filter((c) => c.fromPaycheck).map((c) => c.amount),
    );
    const pretaxContributions = sum(
      contributionsThisYear.filter((c) => c.fromPaycheck && c.pretax).map((c) => c.amount),
    );

    for (const c of contributionsThisYear) {
      if (!c.fromPaycheck) continue;
      expenses.push({
        label: c.label,
        amount: c.amount,
        accountId: c.accountId,
        sourceEventId: c.sourceEventId || undefined,
        category: 'contribution',
      });
    }

    // 7. TAX on ordinary income, net of pretax contributions.
    const ordinaryTax =
      Math.max(0, taxableIncome - pretaxContributions) * (settings.incomeTaxRate / 100);
    if (ordinaryTax > EPSILON) {
      taxes.push({ label: 'Income tax', amount: ordinaryTax, category: 'tax' });
    }

    // 8. NET
    const totalIncome = sum(income.map((l) => l.amount));
    const expenseTotal = sum(expenses.map((l) => l.amount));
    const taxTotalBeforeWithdrawals = sum(taxes.map((l) => l.amount));
    const net = totalIncome - expenseTotal - taxTotalBeforeWithdrawals;

    // 9. ALLOCATE or WITHDRAW
    const waterfall: WaterfallContext = {
      year,
      accounts: accountById,
      balances,
      ageForAccount: (id) => ageForAccount(id, year),
    };

    const contributionsByAccount = new Map<string, number>();
    for (const c of contributionsThisYear) {
      contributionsByAccount.set(
        c.accountId,
        (contributionsByAccount.get(c.accountId) ?? 0) + c.amount,
      );
    }

    const withdrawalsByAccount = new Map<string, number>();
    let unfundedShortfall = 0;

    if (net > EPSILON) {
      const allocation = planAllocations(net, plan.rules, waterfall);
      for (const draw of allocation.draws) {
        const account = accountById.get(draw.accountId);
        if (!account) continue;
        if (account.isLiability) {
          // Extra principal against a debt.
          balances.set(draw.accountId, Math.max(0, (balances.get(draw.accountId) ?? 0) - draw.amount));
        } else {
          contributionsByAccount.set(
            draw.accountId,
            (contributionsByAccount.get(draw.accountId) ?? 0) + draw.amount,
          );
        }
        allocationLines.push({
          label: `To ${account.name}`,
          amount: draw.amount,
          accountId: draw.accountId,
        });
      }

      if (allocation.unallocated > EPSILON && sweepAccount) {
        contributionsByAccount.set(
          sweepAccount.id,
          (contributionsByAccount.get(sweepAccount.id) ?? 0) + allocation.unallocated,
        );
        allocationLines.push({
          label: `To ${sweepAccount.name} (unallocated)`,
          amount: allocation.unallocated,
          accountId: sweepAccount.id,
        });
      }
    } else if (net < -EPSILON) {
      const withdrawal = planWithdrawals(-net, plan.rules, waterfall);
      for (const draw of withdrawal.draws) {
        const account = accountById.get(draw.accountId);
        withdrawalsByAccount.set(
          draw.accountId,
          (withdrawalsByAccount.get(draw.accountId) ?? 0) + draw.gross,
        );
        withdrawalLines.push({
          label: `From ${account?.name ?? draw.accountId}`,
          amount: draw.gross,
          accountId: draw.accountId,
        });
        if (draw.tax > EPSILON) {
          taxes.push({
            label: `Withdrawal tax — ${account?.name ?? draw.accountId}`,
            amount: draw.tax,
            accountId: draw.accountId,
            category: 'tax',
          });
        }
      }

      // A dry waterfall means the plan FAILS this year. Surface it loudly
      // rather than letting a balance drift negative.
      if (withdrawal.unfunded > EPSILON) {
        unfundedShortfall = withdrawal.unfunded;
        warnings.push(
          `${year}: shortfall of ${Math.round(withdrawal.unfunded).toLocaleString()} could not be funded.`,
        );
      }
    }

    // 10. GROWTH and debt balances, then snapshot.
    //     Growth applies to the CLOSING balance, so money contributed during
    //     year Y first earns in Y+1 (docs/PLAN.md §4.3).
    const accountRows: AccountYear[] = [];

    for (const account of accounts) {
      const open = opening.get(account.id) ?? 0;

      if (!accountExistsIn(account, year)) {
        accountRows.push(zeroRow(account, 0));
        continue;
      }

      if (account.isLiability) {
        // `balances` already reflects any extra principal an allocation rule
        // routed here; the scheduled principal from step 5 applies on top.
        const amort = amortization.get(account.id);
        const afterExtraPrincipal = balances.get(account.id) ?? 0;
        const close = Math.max(0, afterExtraPrincipal - (amort?.principal ?? 0));
        balances.set(account.id, close);

        accountRows.push({
          accountId: account.id,
          name: account.name,
          accountClass: account.accountClass,
          isLiability: true,
          open,
          growth: 0,
          contributions: 0,
          withdrawals: 0,
          interest: amort?.interest ?? 0,
          principal: Math.max(0, open - close),
          close,
        });
        continue;
      }

      const contributions = contributionsByAccount.get(account.id) ?? 0;
      const withdrawals = withdrawalsByAccount.get(account.id) ?? 0;
      // The waterfall already debited withdrawals from the live balance.
      const beforeGrowth = (balances.get(account.id) ?? 0) + contributions;
      const rate = closed.has(account.id) ? 0 : growthRateFor(account, year) / 100;
      const growth = beforeGrowth * rate;
      const close = beforeGrowth + growth;

      balances.set(account.id, close);

      accountRows.push({
        accountId: account.id,
        name: account.name,
        accountClass: account.accountClass,
        isLiability: false,
        open,
        growth,
        contributions,
        withdrawals,
        interest: 0,
        principal: 0,
        close,
      });
    }

    const assets = sum(accountRows.filter((r) => !r.isLiability).map((r) => r.close));
    const liabilities = sum(accountRows.filter((r) => r.isLiability).map((r) => r.close));
    const totalTaxes = sum(taxes.map((l) => l.amount));

    years.push({
      year,
      ages,
      income,
      expenses,
      taxes,
      withdrawals: withdrawalLines,
      allocations: allocationLines,
      totalIncome,
      totalExpenses: sum(expenses.map((l) => l.amount)),
      totalTaxes,
      netCashFlow: totalIncome - sum(expenses.map((l) => l.amount)) - totalTaxes,
      accounts: accountRows,
      assets,
      liabilities,
      netWorth: assets - liabilities,
      ...(unfundedShortfall > EPSILON ? { unfundedShortfall } : {}),
    });
  }

  return { startYear, endYear, years, warnings };
}

// ---------------------------------------------------------------------------

function zeroRow(account: Account, open: number): AccountYear {
  return {
    accountId: account.id,
    name: account.name,
    accountClass: account.accountClass,
    isLiability: account.isLiability,
    open,
    growth: 0,
    contributions: 0,
    withdrawals: 0,
    interest: 0,
    principal: 0,
    close: 0,
  };
}

/**
 * How much of one income line survives the suppressions active in `year`.
 *
 * Resolved per line rather than once per year, because a suppression can now
 * name individual events: retirement keeps 40% of consulting while wages stop,
 * and a new job zeroes the salary it replaced but not itself.
 *
 * Most restrictive still wins when several overlap — two events that both cut
 * income should not cancel out into a raise.
 */
function replacementFactorFor(
  suppressions: IncomeSuppression[],
  year: number,
  line: { sourceEventId?: string; isEarned: boolean; isBaseline: boolean },
  eventStartYear: Map<string, number>,
): number {
  let factor = 1;

  for (const s of suppressions) {
    if (year < s.fromYear || year > s.toYear) continue;
    if (!line.isEarned && !s.includeUnearned) continue;
    if (line.isBaseline && s.affectsBaseline === false) continue;

    // A later event's income is not what this suppression was aimed at.
    if (
      s.exemptEventsStartingFrom !== undefined &&
      line.sourceEventId !== undefined &&
      (eventStartYear.get(line.sourceEventId) ?? -Infinity) >= s.exemptEventsStartingFrom
    ) {
      continue;
    }

    const override = line.sourceEventId
      ? s.retentionByEventId?.[line.sourceEventId]
      : undefined;
    const percent = override ?? s.replacementPercent;
    factor = Math.min(factor, percent / 100);
  }

  return factor;
}

/** Overlapping expense adjustments compound. */
function expenseFactor(
  multipliers: { fromYear: number; toYear: number; multiplier: number }[],
  year: number,
): number {
  let factor = 1;
  for (const m of multipliers) {
    if (year >= m.fromYear && year <= m.toYear) factor *= m.multiplier;
  }
  return Math.max(0, factor);
}

function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export type { CashFlowItem };
