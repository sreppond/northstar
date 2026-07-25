import { runPlan } from '../src/run.js';
import type { Plan } from '../src/types.js';

const plan: Plan = {
  id: 'demo', name: 'House Forecast',
  settings: {
    startYear: 2026, projectionYears: 12, inflationRate: 2.5,
    dollarMode: 'futureDollars', baselineIncome: 138_000,
    baselineExpenses: 98_600, incomeTaxRate: 24,
  },
  participants: [{ id: 'p1', name: 'Spencer', birthYear: 1996, lifeExpectancy: 90, isIncluded: true }],
  accounts: [
    { id: 'cash', name: 'Cash', accountClass: 'cash', isLiability: false, initialBalance: 7_700,
      isIncluded: true, growthRateMethod: 'noChange', growthRate: 0,
      withdrawalTiming: 'always', withdrawalTaxRate: 0, taxableWithdrawalPercent: 0, penaltyRate: 0 },
    { id: 'brok', name: 'Taxable Investments', accountClass: 'taxableInvestment', isLiability: false,
      initialBalance: 97_900, isIncluded: true, growthRateMethod: 'fixed', growthRate: 6.5,
      withdrawalTiming: 'always', withdrawalTaxRate: 15, taxableWithdrawalPercent: 60, penaltyRate: 0 },
  ],
  events: [
    { id: 'job', kind: 'newJob', name: 'Reppond (Base)', startYear: 2028, isIncluded: true,
      config: { salary: 250_000, bonusPercent: 0, annualRaise: 0 } },
    { id: 'kid1', kind: 'haveAKid', name: 'Have a kid', startYear: 2028, isIncluded: true,
      config: { firstYearCost: 22_500, annualCost: 18_000, supportUntilAge: 18, collegeAnnualCost: 0 } },
    { id: 'house', kind: 'buyAHome', name: 'Buy a home', startYear: 2031, isIncluded: true,
      config: { price: 1_150_000, downPaymentPercent: 20, mortgageRate: 6.5, termYears: 30,
                appreciationRate: 3, propertyTaxRate: 1.1, maintenancePercent: 1 } },
    { id: 'end', kind: 'endOfPlan', name: 'End of plan', startYear: 2037, isIncluded: true, isRequired: true, config: {} },
  ],
  rules: [
    { accountId: 'brok', ruleType: 'allocation', order: 1 },
    { accountId: 'cash', ruleType: 'withdrawal', order: 1 },
    { accountId: 'brok', ruleType: 'withdrawal', order: 2 },
  ],
};

const r = runPlan(plan);
const m = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : `$${Math.round(n/1000)}K`);
console.log('YEAR   NETWORTH    ASSETS    LIABS    INCOME    EXPENSE   NETFLOW');
for (const y of r.years) {
  console.log(
    String(y.year).padEnd(6),
    m(y.netWorth).padStart(9), m(y.assets).padStart(9), m(y.liabilities).padStart(8),
    m(y.totalIncome).padStart(9), m(y.totalExpenses).padStart(9), m(y.netCashFlow).padStart(9),
    y.unfundedShortfall ? ` !! SHORTFALL ${m(y.unfundedShortfall)}` : '');
}
console.log('\n2031 (purchase year) cash-flow detail:');
const p = r.years.find(y => y.year === 2031)!;
for (const l of [...p.income.map(x=>['IN ',x] as const), ...p.expenses.map(x=>['OUT',x] as const), ...p.taxes.map(x=>['TAX',x] as const)])
  console.log(' ', l[0], l[1].label.padEnd(46), m(l[1].amount).padStart(9), l[1].sourceEventId ? `[${l[1].sourceEventId}]` : '');
console.log('\nwarnings:', r.warnings.length ? r.warnings : 'none');
