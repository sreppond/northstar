export type TaxFrequency = "annually" | "monthly";
export type ContributionFrequency = "monthly" | "quarterly" | "annually";
export type SimulationMode = "brokerage" | "annuity";

export interface ContributionPhase {
  id: string;
  amount: number;
  frequency: ContributionFrequency;
  durationYears: number;
}

export interface SimulationResult {
  date: Date;
  age: number;
  balance: number;
  netBalance: number; // Balance after deferred tax (for annuity)
  totalContributions: number;
  totalInterest: number;
  totalTaxes: number;
  isTaxEvent: boolean;
  monthlyInterest: number;
  monthlyContribution: number;
}

export interface SimulationParams {
  mode: SimulationMode;
  startingBalance: number;
  annualReturn: number;
  taxRate: number; // Capital gains for brokerage, Ordinary for annuity
  annuityPenaltyRate: number; // Default 10%
  taxFrequency: TaxFrequency;
  birthDate: Date;
  horizonYears: number;
  phases: ContributionPhase[];
  januaryVacation: boolean;
}
