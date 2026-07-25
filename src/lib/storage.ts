export interface PersistedState {
  mode: "brokerage" | "annuity";
  startingBalance: number;
  annualReturn: number;
  taxRate: number;
  annuityPenaltyRate: number;
  taxFrequency: "annually" | "monthly";
  birthDate: string;
  horizonYears: number;
  januaryVacation: boolean;
  targetGoal: number;
  milestones: { id: string; year: number; emoji: string }[];
  phases: { id: string; amount: number; frequency: "monthly" | "quarterly" | "annually"; durationYears: number }[];
}

export interface Scenario {
  id: string;
  name: string;
  savedAt: string;
  state: PersistedState;
}

const LAST_STATE_KEY = "northstar:lastState";
const SCENARIOS_KEY = "northstar:scenarios";

export function loadLastState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(LAST_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

export function saveLastState(state: PersistedState) {
  try {
    localStorage.setItem(LAST_STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private browsing, etc.) — silently skip persistence
  }
}

export function clearLastState() {
  try {
    localStorage.removeItem(LAST_STATE_KEY);
  } catch {
    // ignore
  }
}

export function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? (JSON.parse(raw) as Scenario[]) : [];
  } catch {
    return [];
  }
}

export function saveScenario(name: string, state: PersistedState): Scenario[] {
  const scenarios = loadScenarios();
  const scenario: Scenario = {
    id: Math.random().toString(36).substr(2, 9),
    name,
    savedAt: new Date().toISOString(),
    state,
  };
  const updated = [scenario, ...scenarios];
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteScenario(id: string): Scenario[] {
  const updated = loadScenarios().filter((s) => s.id !== id);
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(updated));
  return updated;
}
