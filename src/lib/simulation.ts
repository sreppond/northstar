import { addMonths, differenceInYears, getMonth, getYear } from "date-fns";
import { ContributionPhase, SimulationParams, SimulationResult } from "../types";

export function runSimulation(params: SimulationParams): SimulationResult[] {
  const { 
    mode,
    startingBalance, 
    annualReturn, 
    taxRate, 
    annuityPenaltyRate,
    taxFrequency, 
    birthDate, 
    horizonYears, 
    phases,
    januaryVacation
  } = params;
  
  const results: SimulationResult[] = [];
  const totalMonths = horizonYears * 12;
  
  if (totalMonths < 0) return [];

  let currentBalance = startingBalance;
  let totalContributions = 0;
  let totalInterest = 0;
  let paidTaxes = 0;
  
  // Track gains for tax purposes
  let calendarYearGains = 0;
  let pendingTaxGains = 0;
  
  const monthlyRate = Math.pow(1 + annualReturn / 100, 1 / 12) - 1;
  const startDate = new Date();

  const contributionSchedule: number[] = new Array(totalMonths + 1).fill(0);
  let monthCounter = 1;
  for (const phase of phases) {
    const phaseMonths = phase.durationYears * 12;
    const endMonth = Math.min(monthCounter + phaseMonths - 1, totalMonths);
    
    for (let m = monthCounter; m <= endMonth; m++) {
      const relativeMonth = m - monthCounter;
      if (phase.frequency === "monthly") {
        contributionSchedule[m] = phase.amount;
      } else if (phase.frequency === "quarterly" && relativeMonth % 3 === 0) {
        contributionSchedule[m] = phase.amount;
      } else if (phase.frequency === "annually" && relativeMonth % 12 === 0) {
        contributionSchedule[m] = phase.amount;
      }
    }
    monthCounter += phaseMonths;
  }

  for (let m = 0; m <= totalMonths; m++) {
    const currentDate = addMonths(startDate, m);
    const age = differenceInYears(currentDate, birthDate);
    const month = getMonth(currentDate);
    const isJanuary = month === 0;
    const isMarch = month === 2;

    let monthlyContribution = 0;
    let isTaxEvent = false;

    if (m > 0) {
      // 1. Handle Tax Events at start of month (Brokerage Annually)
      if (mode === "brokerage" && taxFrequency === "annually") {
        // At start of January, move last year's gains to pending
        if (isJanuary) {
          pendingTaxGains += calendarYearGains;
          calendarYearGains = 0;
        }
        // At start of March, pay tax on pending gains
        if (isMarch && pendingTaxGains > 0) {
          const taxAmount = pendingTaxGains * (taxRate / 100);
          currentBalance -= taxAmount;
          paidTaxes += taxAmount;
          pendingTaxGains = 0;
          isTaxEvent = true;
        }
      }

      monthlyContribution = contributionSchedule[m];
      currentBalance += monthlyContribution;
      totalContributions += monthlyContribution;

      // Calculate interest (skip if January Vacation is active)
      let interest = 0;
      if (!(mode === "brokerage" && januaryVacation && isJanuary)) {
        interest = currentBalance * monthlyRate;
      }
      
      currentBalance += interest;
      totalInterest += interest;
      
      // Track gains
      if (mode === "brokerage") {
        if (taxFrequency === "monthly") {
          const taxAmount = interest * (taxRate / 100);
          currentBalance -= taxAmount;
          paidTaxes += taxAmount;
          isTaxEvent = true;
        } else {
          calendarYearGains += interest;
        }
      }

      // Calculate Total Taxes (Paid + Accrued Liability)
      let totalTaxesForSummary = paidTaxes;
      let netBalance = currentBalance;

      if (mode === "brokerage") {
        const accruedLiability = (calendarYearGains + pendingTaxGains) * (taxRate / 100);
        totalTaxesForSummary += accruedLiability;
        netBalance = currentBalance - accruedLiability;
      } else if (mode === "annuity") {
        const costBasis = startingBalance + totalContributions;
        const gains = Math.max(0, currentBalance - costBasis);
        const deferredTax = gains * ((taxRate + annuityPenaltyRate) / 100);
        netBalance = currentBalance - deferredTax;
        totalTaxesForSummary = deferredTax;
      }

      results.push({
        date: currentDate,
        age,
        balance: currentBalance,
        netBalance,
        totalContributions,
        totalInterest,
        totalTaxes: totalTaxesForSummary,
        isTaxEvent,
        monthlyInterest: interest,
        monthlyContribution
      });
    } else {
      results.push({
        date: currentDate,
        age,
        balance: currentBalance,
        netBalance: currentBalance,
        totalContributions: 0,
        totalInterest: 0,
        totalTaxes: 0,
        isTaxEvent: false,
        monthlyInterest: 0,
        monthlyContribution: 0
      });
    }
  }

  return results;
}
