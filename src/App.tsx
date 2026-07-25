import React, { useState, useMemo, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from 'recharts';
import {
  Plus,
  Trash2,
  Download,
  TrendingUp,
  ShieldAlert,
  User,
  Clock,
  Target,
  HelpCircle,
  Smile,
  Trophy,
  Settings,
  LayoutDashboard,
  RotateCcw,
  Save,
  Bookmark,
  ListTree,
} from 'lucide-react';
import { format, getYear } from 'date-fns';
import { ContributionPhase, SimulationParams, TaxFrequency, ContributionFrequency, SimulationMode } from './types';
import { runSimulation } from './lib/simulation';
import { cn, formatCurrency, formatCompactCurrency } from './lib/utils';
import { Sparkline } from './components/Sparkline';
import { Donut, DonutSlice } from './components/Donut';
import {
  PersistedState,
  Scenario,
  loadLastState,
  saveLastState,
  clearLastState,
  loadScenarios,
  saveScenario,
  deleteScenario,
} from './lib/storage';

// --- Defaults ---

const DEFAULT_STATE: PersistedState = {
  mode: 'brokerage',
  startingBalance: 50000,
  annualReturn: 10,
  taxRate: 35,
  annuityPenaltyRate: 10,
  taxFrequency: 'annually',
  birthDate: '1996-04-04',
  horizonYears: 5,
  januaryVacation: true,
  targetGoal: 500000,
  milestones: [
    { id: 'm1', year: 2027, emoji: '💍' },
    { id: 'm2', year: 2028, emoji: '👶' },
    { id: 'm3', year: 2030, emoji: '👶' },
    { id: 'm4', year: 2031, emoji: '🏠' },
  ],
  phases: [
    { id: '1', amount: 5000, frequency: 'quarterly', durationYears: 1 },
    { id: '2', amount: 10000, frequency: 'quarterly', durationYears: 2 },
    { id: '3', amount: 15000, frequency: 'quarterly', durationYears: 2 },
  ],
};

const PHASE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6'];

// --- Components ---

const CustomTick = (props: any) => {
  const { x, y, payload, milestones } = props;
  const year = parseInt(payload.value);
  const yearMilestones = milestones.filter((m: Milestone) => m.year === year);

  if (yearMilestones.length === 0) {
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={16} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight={700}>
          {payload.value}
        </text>
      </g>
    );
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#94a3b8" fontSize={11} fontWeight={700}>
        {payload.value}
      </text>
      <g transform={`translate(-${(yearMilestones.length * 22) / 2}, 24)`}>
        {yearMilestones.map((m: Milestone, idx: number) => (
          <g key={m.id} transform={`translate(${idx * 22}, 0)`}>
            <rect width="20" height="20" rx="4" fill="#f1f5f9" />
            <text x={10} y={14} textAnchor="middle" fontSize={12}>
              {m.emoji}
            </text>
          </g>
        ))}
      </g>
    </g>
  );
};

interface Milestone {
  id: string;
  year: number;
  emoji: string;
}

const EMOJI_OPTIONS = ['💍', '👶', '🍼', '🏠', '🚗', '🎓', '🌴', '💼', '🚀', '🎂', '🥂', '🏥', '🐕', '🐈', '✨', '🎉', '💰', '🏖️'];

const MilestoneItem: React.FC<{
  milestone: Milestone;
  onUpdate: (id: string, updates: Partial<Milestone>) => void;
  onDelete: (id: string) => void;
}> = ({ milestone, onUpdate, onDelete }) => {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 group relative">
      <input
        type="number"
        value={milestone.year}
        onChange={(e) => onUpdate(milestone.id, { year: parseInt(e.target.value) || getYear(new Date()) })}
        className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:border-emerald-500 shadow-sm"
      />

      <div className="relative flex-1">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm hover:border-emerald-500 transition-colors shadow-sm flex items-center justify-center"
        >
          {milestone.emoji}
        </button>

        {showPicker && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowPicker(false)} />
            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 z-[70] grid grid-cols-6 gap-1">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onUpdate(milestone.id, { emoji: e });
                    setShowPicker(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-emerald-50 rounded-md transition-colors text-sm"
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => onDelete(milestone.id)}
        className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded-lg"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

const SidebarSection = ({
  title,
  icon: Icon,
  children,
  badge,
  id,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  badge?: string;
  id?: string;
}) => (
  <div
    id={id}
    className="group/section bg-slate-900/60 rounded-[2rem] border border-slate-800 overflow-hidden transition-all hover:border-emerald-500/30 hover:bg-slate-900 scroll-mt-6"
  >
    <div className="px-6 py-4.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-800 rounded-xl text-slate-400 group-hover/section:text-emerald-400 transition-all border border-slate-700">
          <Icon size={14} />
        </div>
        <h2 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">{title}</h2>
      </div>
      {badge && (
        <span className="px-2.5 py-1 rounded-full bg-slate-800 text-emerald-400 text-[9px] font-extrabold uppercase tracking-tight border border-emerald-500/20 shadow-sm">
          {badge}
        </span>
      )}
    </div>
    <div className="p-6 space-y-6">{children}</div>
  </div>
);

const NavLink = ({ href, label, active }: { href: string; label: string; active?: boolean }) => (
  <a
    href={href}
    className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all',
      active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
    )}
  >
    <span className={cn('w-1 h-1 rounded-full', active ? 'bg-emerald-400' : 'bg-slate-700')} />
    {label}
  </a>
);

const FilterPill = ({ label, dotColor, active, onClick }: { label: string; dotColor: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all',
      active ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
    )}
  >
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
    {label}
  </button>
);

const HorizonPill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
      active ? 'bg-slate-900 border-slate-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
    )}
  >
    {label}
  </button>
);

const FormattedInputField = ({ label, value, onChange, suffix, prefix, type = 'text' }: any) => {
  const [isFocused, setIsFocused] = useState(false);

  const displayValue =
    isFocused || type === 'date'
      ? value.toString()
      : (prefix ? prefix : '') + (typeof value === 'number' ? value.toLocaleString() : value) + (suffix ? suffix : '');

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={displayValue}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => {
            if (type === 'date') {
              onChange(e.target.value);
              return;
            }
            const val = e.target.value.replace(/[^0-9.]/g, '');
            if (val === '' || !isNaN(parseFloat(val))) {
              onChange(val === '' ? 0 : parseFloat(val));
            }
          }}
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all appearance-none"
        />
      </div>
    </div>
  );
};

const PresetButton = ({ label, onClick, active, tooltip }: any) => (
  <div className="relative group/btn">
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-1 text-[10px] font-bold rounded-md transition-all border flex items-center gap-1',
        active ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      {label}
      {tooltip && <HelpCircle size={10} className="opacity-50" />}
    </button>
    {tooltip && (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
        {tooltip}
      </div>
    )}
  </div>
);

const SliderField = ({ label, value, onChange, min, max, step, suffix, presets }: any) => (
  <div className="space-y-3">
    <div className="flex justify-between items-center">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      <span className="text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
        {value}
        {suffix}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
    />
    {presets && (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {presets.map((p: any) => (
          <PresetButton key={p.value} label={p.label} onClick={() => onChange(p.value)} active={value === p.value} />
        ))}
      </div>
    )}
  </div>
);

const SummaryCard = ({
  label,
  value,
  subValue,
  icon: Icon,
  colorClass,
  highlighted,
  sparklineData,
  sparklineKey,
  sparklineColor,
  progress,
}: any) => (
  <div
    className={cn(
      'rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border',
      highlighted ? 'bg-slate-950 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-900'
    )}
  >
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className={cn('text-[10px] font-bold uppercase tracking-widest mb-1', highlighted ? 'text-slate-400' : 'text-slate-400')}>{label}</p>
        <h3 className={cn('text-2xl font-bold tracking-tight truncate', highlighted ? 'text-white' : 'text-slate-900')}>{value}</h3>
        {subValue && <p className={cn('text-xs mt-1 font-medium', highlighted ? 'text-slate-400' : 'text-slate-400')}>{subValue}</p>}
      </div>
      <div className={cn('p-2.5 rounded-xl shrink-0', highlighted ? 'bg-white/10 text-emerald-400' : colorClass)}>
        <Icon size={20} />
      </div>
    </div>
    {progress !== undefined ? (
      <div className="mt-4">
        <div className={cn('h-1.5 w-full rounded-full overflow-hidden', highlighted ? 'bg-white/10' : 'bg-slate-100')}>
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      </div>
    ) : (
      sparklineData && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparklineData} dataKey={sparklineKey} color={sparklineColor} id={label} />
        </div>
      )
    )}
  </div>
);

export default function App() {
  // --- State ---
  const [mode, setMode] = useState<SimulationMode>(DEFAULT_STATE.mode);
  const [startingBalance, setStartingBalance] = useState(DEFAULT_STATE.startingBalance);
  const [annualReturn, setAnnualReturn] = useState(DEFAULT_STATE.annualReturn);
  const [taxRate, setTaxRate] = useState(DEFAULT_STATE.taxRate);
  const [annuityPenaltyRate, setAnnuityPenaltyRate] = useState(DEFAULT_STATE.annuityPenaltyRate);
  const [taxFrequency, setTaxFrequency] = useState<TaxFrequency>(DEFAULT_STATE.taxFrequency);
  const [birthDate, setBirthDate] = useState(DEFAULT_STATE.birthDate);
  const [horizonYears, setHorizonYears] = useState(DEFAULT_STATE.horizonYears);
  const [januaryVacation, setJanuaryVacation] = useState(DEFAULT_STATE.januaryVacation);
  const [targetGoal, setTargetGoal] = useState(DEFAULT_STATE.targetGoal);
  const [mobileView, setMobileView] = useState<'settings' | 'chart'>('settings');
  const [milestones, setMilestones] = useState<Milestone[]>(DEFAULT_STATE.milestones);
  const [phases, setPhases] = useState<ContributionPhase[]>(DEFAULT_STATE.phases as ContributionPhase[]);

  const [hydrated, setHydrated] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');

  // --- Persistence: hydrate on mount ---
  useEffect(() => {
    const last = loadLastState();
    if (last) {
      setMode(last.mode);
      setStartingBalance(last.startingBalance);
      setAnnualReturn(last.annualReturn);
      setTaxRate(last.taxRate);
      setAnnuityPenaltyRate(last.annuityPenaltyRate);
      setTaxFrequency(last.taxFrequency);
      setBirthDate(last.birthDate);
      setHorizonYears(last.horizonYears);
      setJanuaryVacation(last.januaryVacation);
      setTargetGoal(last.targetGoal);
      setMilestones(last.milestones);
      setPhases(last.phases as ContributionPhase[]);
    }
    setScenarios(loadScenarios());
    setHydrated(true);
  }, []);

  // --- Persistence: auto-save on change ---
  useEffect(() => {
    if (!hydrated) return;
    saveLastState({
      mode,
      startingBalance,
      annualReturn,
      taxRate,
      annuityPenaltyRate,
      taxFrequency,
      birthDate,
      horizonYears,
      januaryVacation,
      targetGoal,
      milestones,
      phases,
    });
  }, [hydrated, mode, startingBalance, annualReturn, taxRate, annuityPenaltyRate, taxFrequency, birthDate, horizonYears, januaryVacation, targetGoal, milestones, phases]);

  // --- Derived Data ---
  const simulationParams: SimulationParams = useMemo(
    () => ({
      mode,
      startingBalance,
      annualReturn,
      taxRate,
      annuityPenaltyRate,
      taxFrequency,
      birthDate: new Date(birthDate),
      horizonYears,
      phases,
      januaryVacation,
    }),
    [mode, startingBalance, annualReturn, taxRate, annuityPenaltyRate, taxFrequency, birthDate, horizonYears, phases, januaryVacation]
  );

  const results = useMemo(() => runSimulation(simulationParams), [simulationParams]);

  const finalResult = results[results.length - 1];
  const totalTaxes = finalResult?.totalTaxes || 0;
  const finalBalance = finalResult?.balance || 0;
  const finalNetBalance = finalResult?.netBalance || 0;
  const finalContributions = finalResult?.totalContributions || 0;
  const finalGrowth = finalResult?.totalInterest || 0;

  const relevantBalance = mode === 'brokerage' ? finalBalance : finalNetBalance;

  const isGoalMet = useMemo(() => relevantBalance >= targetGoal, [relevantBalance, targetGoal]);
  const goalProgress = targetGoal > 0 ? (relevantBalance / targetGoal) * 100 : 0;
  const goalDeltaPct = targetGoal > 0 ? ((relevantBalance - targetGoal) / targetGoal) * 100 : 0;

  // Annual Breakdown - Group by calendar year and take the last available month of that year
  const annualBreakdown = useMemo(() => {
    const yearsMap = new Map<number, any>();
    results.forEach((r) => {
      const year = getYear(r.date);
      yearsMap.set(year, r);
    });
    return Array.from(yearsMap.values());
  }, [results]);

  // --- Handlers ---
  const addPhase = () => {
    const newPhase: ContributionPhase = {
      id: Math.random().toString(36).substr(2, 9),
      amount: 1000,
      frequency: 'monthly',
      durationYears: 5,
    };
    setPhases([...phases, newPhase]);
  };

  const removePhase = (id: string) => {
    setPhases(phases.filter((p) => p.id !== id));
  };

  const updatePhase = (id: string, field: keyof ContributionPhase, value: any) => {
    setPhases(phases.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const resetToDefaults = () => {
    setMode(DEFAULT_STATE.mode);
    setStartingBalance(DEFAULT_STATE.startingBalance);
    setAnnualReturn(DEFAULT_STATE.annualReturn);
    setTaxRate(DEFAULT_STATE.taxRate);
    setAnnuityPenaltyRate(DEFAULT_STATE.annuityPenaltyRate);
    setTaxFrequency(DEFAULT_STATE.taxFrequency);
    setBirthDate(DEFAULT_STATE.birthDate);
    setHorizonYears(DEFAULT_STATE.horizonYears);
    setJanuaryVacation(DEFAULT_STATE.januaryVacation);
    setTargetGoal(DEFAULT_STATE.targetGoal);
    setMilestones(DEFAULT_STATE.milestones);
    setPhases(DEFAULT_STATE.phases as ContributionPhase[]);
    clearLastState();
  };

  const currentPersistedState = (): PersistedState => ({
    mode,
    startingBalance,
    annualReturn,
    taxRate,
    annuityPenaltyRate,
    taxFrequency,
    birthDate,
    horizonYears,
    januaryVacation,
    targetGoal,
    milestones,
    phases,
  });

  const handleSaveScenario = () => {
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`;
    setScenarios(saveScenario(name, currentPersistedState()));
    setScenarioName('');
  };

  const handleLoadScenario = (s: Scenario) => {
    const st = s.state;
    setMode(st.mode);
    setStartingBalance(st.startingBalance);
    setAnnualReturn(st.annualReturn);
    setTaxRate(st.taxRate);
    setAnnuityPenaltyRate(st.annuityPenaltyRate);
    setTaxFrequency(st.taxFrequency);
    setBirthDate(st.birthDate);
    setHorizonYears(st.horizonYears);
    setJanuaryVacation(st.januaryVacation);
    setTargetGoal(st.targetGoal);
    setMilestones(st.milestones);
    setPhases(st.phases as ContributionPhase[]);
  };

  const handleDeleteScenario = (id: string) => {
    setScenarios(deleteScenario(id));
  };

  const exportCSV = () => {
    const headers = ['Date', 'Age', 'Gross Balance', 'Net Balance', 'Contribution', 'Interest', 'Total Contributions', 'Total Interest', 'Total Taxes'];
    const rows = results.map((r) => [
      format(r.date, 'MMM yyyy'),
      r.age,
      r.balance.toFixed(2),
      r.netBalance.toFixed(2),
      r.monthlyContribution.toFixed(2),
      r.monthlyInterest.toFixed(2),
      r.totalContributions.toFixed(2),
      r.totalInterest.toFixed(2),
      r.totalTaxes.toFixed(2),
    ]);

    const csvContent = [headers, ...rows].map((e) => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${mode}_simulation_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Chart Data Formatting ---
  const chartData = useMemo(() => {
    return results
      .filter((_, i) => i % 12 === 0 || i === results.length - 1)
      .map((r) => ({
        name: format(r.date, 'yyyy'),
        age: r.age,
        balance: Math.round(r.balance),
        netBalance: Math.round(r.netBalance),
        contributions: Math.round(r.totalContributions),
        growth: Math.round(r.totalInterest),
        taxes: Math.round(r.totalTaxes),
      }));
  }, [results]);

  // --- Composition donut data ---
  const compositionSlices: DonutSlice[] = useMemo(() => {
    if (mode === 'brokerage') {
      return [
        { label: 'Principal', value: finalContributions, color: '#3b82f6' },
        { label: 'Growth', value: finalGrowth, color: '#10b981' },
        { label: 'Tax Drag', value: totalTaxes, color: '#f87171' },
      ];
    }
    return [
      { label: 'Net After-Tax', value: finalNetBalance, color: '#10b981' },
      { label: 'Deferred Tax', value: totalTaxes, color: '#f87171' },
    ];
  }, [mode, finalContributions, finalGrowth, totalTaxes, finalNetBalance]);

  const phaseSlices: DonutSlice[] = useMemo(() => {
    const paymentsPerYear = { monthly: 12, quarterly: 4, annually: 1 } as const;
    return phases.map((p, i) => ({
      label: `Phase ${i + 1} · $${p.amount.toLocaleString()}/${p.frequency}`,
      value: p.amount * paymentsPerYear[p.frequency] * p.durationYears,
      color: PHASE_COLORS[i % PHASE_COLORS.length],
    }));
  }, [phases]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900 overflow-hidden flex flex-col">
      {/* Mobile Navigation Bar */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500 p-1 rounded-lg text-white">
            <TrendingUp size={18} />
          </div>
          <h1 className="font-bold text-base tracking-tight text-white">Northstar</h1>
        </div>
        <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button
            onClick={() => {
              setMobileView('settings');
            }}
            className={cn(
              'p-2 rounded-lg transition-all flex items-center gap-2',
              mobileView === 'settings' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500'
            )}
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => {
              setMobileView('chart');
            }}
            className={cn(
              'p-2 rounded-lg transition-all flex items-center gap-2',
              mobileView === 'chart' ? 'bg-slate-800 text-emerald-400' : 'text-slate-500'
            )}
          >
            <LayoutDashboard size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 h-full overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            'w-full lg:w-96 bg-slate-950 border-r border-slate-900 overflow-y-auto p-6 space-y-8 shrink-0 transition-all duration-300',
            mobileView === 'chart' ? 'hidden lg:block' : 'block'
          )}
        >
          <div className="hidden lg:flex items-center gap-2 mb-2">
            <div className="bg-emerald-500 p-1.5 rounded-lg text-white">
              <TrendingUp size={20} />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight text-white leading-none">NORTHSTAR</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mt-0.5">Forecast</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] px-3 mb-1">Simulator</p>
            <NavLink href="#overview" label="Overview" active />
            <NavLink href="#trend" label="Growth Trend" />
            <NavLink href="#composition" label="Composition" />
            <NavLink href="#breakdown" label="Annual Breakdown" />
            <NavLink href="#scenarios" label="Scenarios" />
          </div>

          <div className="space-y-10">
            <SidebarSection title="Investment" icon={TrendingUp}>
              <FormattedInputField
                label="Starting Balance"
                value={startingBalance}
                onChange={(v) => {
                  setStartingBalance(v);
                }}
                prefix="$"
              />

              <SliderField
                label="Horizon"
                value={horizonYears}
                onChange={(v) => {
                  setHorizonYears(v);
                }}
                min={0}
                max={50}
                step={1}
                suffix=" years"
                presets={[
                  { label: '3y', value: 3 },
                  { label: '5y', value: 5 },
                  { label: '10y', value: 10 },
                  { label: '20y', value: 20 },
                  { label: '30y', value: 30 },
                ]}
              />

              <SliderField
                label="Annual Return"
                value={annualReturn}
                onChange={(v) => {
                  setAnnualReturn(v);
                }}
                min={0}
                max={200}
                step={1}
                suffix="%"
                presets={[
                  { label: '10%', value: 10 },
                  { label: '20%', value: 20 },
                  { label: '50%', value: 50 },
                  { label: '100%', value: 100 },
                ]}
              />

              <FormattedInputField
                label="Target Goal"
                value={targetGoal}
                onChange={(v) => {
                  setTargetGoal(v);
                }}
                prefix="$"
              />
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'p-2 rounded-xl transition-all',
                      isGoalMet ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'
                    )}
                  >
                    <Trophy size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Goal Status</p>
                    <p className={cn('text-xs font-bold', isGoalMet ? 'text-emerald-400' : 'text-slate-400')}>
                      {isGoalMet ? 'Goal Achieved! 🎉' : 'Keep growing...'}
                    </p>
                  </div>
                </div>
              </div>
            </SidebarSection>

            <SidebarSection title="Tax Strategy" icon={ShieldAlert}>
              <SliderField
                label={mode === 'brokerage' ? 'Capital Gains Tax' : 'Ordinary Income Tax'}
                value={taxRate}
                onChange={(v) => {
                  setTaxRate(v);
                }}
                min={0}
                max={50}
                step={1}
                suffix="%"
                presets={
                  mode === 'brokerage'
                    ? [
                        { label: 'Long-Term (15%)', value: 15 },
                        { label: 'Short-Term (35%)', value: 35 },
                      ]
                    : [
                        { label: 'Low (22%)', value: 22 },
                        { label: 'Mid (32%)', value: 32 },
                        { label: 'High (37%)', value: 37 },
                      ]
                }
              />

              {mode === 'annuity' && (
                <SliderField
                  label="Annuity Penalty Fee"
                  value={annuityPenaltyRate}
                  onChange={(v) => {
                    setAnnuityPenaltyRate(v);
                  }}
                  min={0}
                  max={20}
                  step={1}
                  suffix="%"
                  presets={[
                    { label: 'Standard (10%)', value: 10 },
                    { label: 'None (0%)', value: 0 },
                  ]}
                />
              )}

              {mode === 'brokerage' && (
                <>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tax Frequency</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        {
                          label: 'Annually (March)',
                          value: 'annually',
                          tooltip: 'Taxes are calculated on accrued gains and deducted every March before tax season.',
                        },
                        {
                          label: 'Monthly',
                          value: 'monthly',
                          tooltip: 'Taxes are deducted from monthly interest immediately, simulating a high-frequency taxable account.',
                        },
                      ].map((opt) => (
                        <PresetButton
                          key={opt.value}
                          label={opt.label}
                          onClick={() => {
                            setTaxFrequency(opt.value as TaxFrequency);
                          }}
                          active={taxFrequency === opt.value}
                          tooltip={opt.tooltip}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group relative">
                      <div className="relative inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={januaryVacation}
                          onChange={() => {
                            setJanuaryVacation(!januaryVacation);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">January Vacation</span>
                        <HelpCircle size={14} className="text-slate-600" />
                      </div>

                      <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800 text-white text-[10px] rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl leading-relaxed">
                        <p className="font-bold mb-1 text-emerald-400">Wash Sale Protection</p>
                        Simulates exiting all positions for the month of January each year. During this month, the portfolio earns 0% return to ensure no
                        "trading" occurs, helping avoid wash sale rule complications.
                      </div>
                    </label>
                  </div>
                </>
              )}
            </SidebarSection>

            <SidebarSection
              title="Contributions"
              icon={Plus}
              badge={phases.length > 0 ? `${phases.length} Phase${phases.length > 1 ? 's' : ''}` : undefined}
            >
              <div className="flex items-center justify-between -mt-2">
                <p className="text-[10px] text-slate-500 font-medium italic">Define periodic deposits</p>
                <button onClick={addPhase} className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors border border-emerald-500/20">
                  <Plus size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {phases.map((phase, idx) => (
                  <div key={phase.id} className="p-4 bg-white rounded-2xl border border-slate-100 relative group shadow-sm">
                    <button
                      onClick={() => removePhase(phase.id)}
                      className="absolute -top-2 -right-2 p-1.5 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm z-10"
                    >
                      <Trash2 size={14} />
                    </button>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Phase {idx + 1}</span>
                        <div className="flex gap-1">
                          {(['monthly', 'quarterly', 'annually'] as ContributionFrequency[]).map((freq) => (
                            <button
                              key={freq}
                              onClick={() => updatePhase(phase.id, 'frequency', freq)}
                              className={cn(
                                'px-1.5 py-0.5 text-[8px] font-bold rounded uppercase transition-all border',
                                phase.frequency === freq ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                              )}
                            >
                              {freq.charAt(0)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormattedInputField label="Amount" value={phase.amount} onChange={(v: number) => updatePhase(phase.id, 'amount', v)} prefix="$" />
                        <FormattedInputField label="Years" value={phase.durationYears} onChange={(v: number) => updatePhase(phase.id, 'durationYears', v)} suffix="y" />
                      </div>
                    </div>
                  </div>
                ))}
                {phases.length === 0 && <p className="text-[10px] text-slate-500 italic text-center py-2">No contributions added</p>}
              </div>
            </SidebarSection>

            <SidebarSection
              title="Life Timeline"
              icon={Smile}
              badge={milestones.length > 0 ? `${milestones.length} Event${milestones.length > 1 ? 's' : ''}` : undefined}
            >
              <div className="space-y-6">
                <FormattedInputField label="Birthdate" type="date" value={birthDate} onChange={setBirthDate} />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-500 font-medium italic uppercase tracking-wider">Milestones</p>
                    <button
                      onClick={() => {
                        const year = getYear(new Date()) + 1;
                        const newMilestone: Milestone = {
                          id: Math.random().toString(36).substr(2, 9),
                          year,
                          emoji: '✨',
                        };
                        setMilestones([...milestones, newMilestone]);
                      }}
                      className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors border border-emerald-500/20"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {[...milestones]
                      .sort((a, b) => a.year - b.year)
                      .map((m) => (
                        <MilestoneItem
                          key={m.id}
                          milestone={m}
                          onUpdate={(id, updates) => {
                            setMilestones(milestones.map((ms) => (ms.id === id ? { ...ms, ...updates } : ms)));
                          }}
                          onDelete={(id) => {
                            setMilestones(milestones.filter((ms) => ms.id !== id));
                          }}
                        />
                      ))}
                    {milestones.length === 0 && <p className="text-[10px] text-slate-500 italic text-center py-2">No milestones added yet</p>}
                  </div>
                </div>
              </div>
            </SidebarSection>

            <SidebarSection id="scenarios" title="Scenarios" icon={Bookmark} badge={scenarios.length > 0 ? `${scenarios.length} Saved` : undefined}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={scenarioName}
                  onChange={(e) => setScenarioName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveScenario();
                  }}
                  placeholder="Name this scenario..."
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
                <button
                  onClick={handleSaveScenario}
                  className="p-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white transition-colors shadow-sm shrink-0"
                  title="Save current scenario"
                >
                  <Save size={14} />
                </button>
              </div>

              <div className="space-y-2">
                {scenarios.length === 0 && <p className="text-[10px] text-slate-500 italic text-center py-2">No scenarios saved yet</p>}
                {scenarios.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 group">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                      <p className="text-[9px] text-slate-400 font-medium">{format(new Date(s.savedAt), 'MMM d, yyyy · h:mm a')}</p>
                    </div>
                    <button
                      onClick={() => handleLoadScenario(s)}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors shrink-0"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleDeleteScenario(s.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded-lg shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </SidebarSection>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={cn(
            'flex-1 overflow-y-auto scroll-smooth bg-[#F9FAFB] p-4 lg:p-10 space-y-8 transition-all duration-300',
            mobileView === 'settings' ? 'hidden lg:block' : 'block'
          )}
        >
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Account Type</span>
              <FilterPill label="Brokerage" dotColor="#10b981" active={mode === 'brokerage'} onClick={() => setMode('brokerage')} />
              <FilterPill label="Variable Annuity" dotColor="#3b82f6" active={mode === 'annuity'} onClick={() => setMode('annuity')} />
            </div>
            <div className="hidden lg:block w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Horizon</span>
              {[3, 5, 10, 20, 30].map((y) => (
                <HorizonPill key={y} label={`${y}y`} active={horizonYears === y} onClick={() => setHorizonYears(y)} />
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-4">
              <p className="hidden xl:block text-[10px] text-slate-400 font-medium italic">Adjust filters to update every card below</p>
              <button
                onClick={resetToDefaults}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            </div>
          </div>

          {/* Header & Summary */}
          <div id="overview" className="flex flex-col md:flex-row md:items-center justify-between gap-6 scroll-mt-6">
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900">
                  {mode === 'brokerage' ? 'Brokerage Forecast' : 'Variable Annuity Forecast'}
                </h2>
                <span
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border',
                    isGoalMet ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', isGoalMet ? 'bg-emerald-500' : 'bg-amber-500')} />
                  {isGoalMet ? 'Tracking ahead of goal' : 'Building toward goal'}
                </span>
              </div>
              <p className="text-slate-500 font-medium text-sm lg:text-base">
                {mode === 'brokerage' ? 'Taxable growth with annual drag simulation' : 'Tax-deferred growth with withdrawal liability'}
              </p>
            </div>
            <button
              onClick={() => {
                exportCSV();
              }}
              className="flex items-center justify-center gap-2 bg-white border border-slate-200 px-5 py-2.5 rounded-2xl text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm shrink-0"
            >
              <Download size={18} />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <SummaryCard
              highlighted
              label={mode === 'brokerage' ? 'Final Balance' : 'Gross Balance'}
              value={formatCurrency(finalBalance)}
              subValue={`${goalDeltaPct >= 0 ? '▲' : '▼'} ${Math.abs(goalDeltaPct).toFixed(1)}% vs goal · In ${horizonYears} years`}
              icon={Target}
              colorClass="bg-emerald-50 text-emerald-600"
              sparklineData={chartData}
              sparklineKey="balance"
              sparklineColor="#34d399"
            />
            <SummaryCard
              label="Total Growth"
              value={formatCurrency(finalGrowth)}
              subValue={`${finalBalance > 0 ? Math.round((finalGrowth / finalBalance) * 100) : 0}% of final balance`}
              icon={TrendingUp}
              colorClass="bg-emerald-50 text-emerald-600"
              sparklineData={chartData}
              sparklineKey="growth"
              sparklineColor="#10b981"
            />
            <SummaryCard
              label={mode === 'brokerage' ? 'Total Taxes' : 'Deferred Tax Liability'}
              value={formatCurrency(totalTaxes)}
              subValue={mode === 'brokerage' ? `${taxRate}% ${taxFrequency}` : `${taxRate + annuityPenaltyRate}% at end`}
              icon={ShieldAlert}
              colorClass="bg-red-50 text-red-600"
              sparklineData={chartData}
              sparklineKey="taxes"
              sparklineColor="#f87171"
            />
            <SummaryCard
              label={mode === 'brokerage' ? 'Contributions' : 'Net After-Tax'}
              value={formatCurrency(mode === 'brokerage' ? finalContributions : finalNetBalance)}
              subValue={mode === 'brokerage' ? 'Total principal' : 'True value if liquidated'}
              icon={mode === 'brokerage' ? User : TrendingUp}
              colorClass={mode === 'brokerage' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}
              sparklineData={chartData}
              sparklineKey={mode === 'brokerage' ? 'contributions' : 'netBalance'}
              sparklineColor="#3b82f6"
            />
            <SummaryCard
              label="Goal Progress"
              value={`${Math.round(goalProgress)}%`}
              subValue={`${formatCompactCurrency(relevantBalance)} of ${formatCompactCurrency(targetGoal)} target`}
              icon={Trophy}
              colorClass="bg-amber-50 text-amber-600"
              progress={goalProgress}
            />
            <SummaryCard
              label="Horizon"
              value={`${horizonYears} Years`}
              subValue={`Ending ${getYear(new Date()) + horizonYears}`}
              icon={Clock}
              colorClass="bg-amber-50 text-amber-600"
              sparklineData={chartData}
              sparklineKey="contributions"
              sparklineColor="#f59e0b"
            />
          </div>

          <div id="trend" className="bg-white p-4 lg:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative group/chart scroll-mt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Portfolio Growth</h3>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Projected over {horizonYears} years · dashed = goal</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 lg:gap-6">
                {mode === 'brokerage' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Principal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Growth</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Gross Balance</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Net Balance</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="h-[300px] lg:h-[450px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={<CustomTick milestones={milestones} />} height={60} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => formatCompactCurrency(value)} tick={{ fontSize: 11, fontWeight: 700, fill: '#94a3b8' }} />
                  <ReferenceLine
                    y={targetGoal}
                    stroke="#0f172a"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{
                      position: 'right',
                      value: `Goal: ${formatCompactCurrency(targetGoal)}`,
                      fill: '#0f172a',
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-2xl min-w-[240px]">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">
                                {data.name} • Age {data.age}
                              </p>
                              <div className="flex gap-1">
                                {milestones
                                  .filter((m) => m.year === parseInt(data.name))
                                  .map((m) => (
                                    <span key={m.id} className="text-lg">
                                      {m.emoji}
                                    </span>
                                  ))}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-600">{mode === 'brokerage' ? 'Total Balance' : 'Gross Balance'}</span>
                                <span className="text-sm font-extrabold text-slate-900">{formatCurrency(data.balance)}</span>
                              </div>
                              {mode === 'annuity' && (
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium text-blue-600">Net Balance</span>
                                  <span className="text-sm font-extrabold text-blue-600">{formatCurrency(data.netBalance)}</span>
                                </div>
                              )}
                              <div className="h-px bg-slate-100" />
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                                  <span className="text-xs font-medium text-slate-500">Principal</span>
                                </div>
                                <span className="text-xs font-bold text-slate-700">{formatCurrency(data.contributions)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span className="text-xs font-medium text-slate-500">Growth</span>
                                </div>
                                <span className="text-xs font-bold text-emerald-600">{formatCurrency(data.growth)}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-red-400" />
                                  <span className="text-xs font-medium text-slate-500">Taxes</span>
                                </div>
                                <span className="text-xs font-bold text-red-500">-{formatCurrency(data.taxes)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {mode === 'brokerage' ? (
                    <>
                      <Area type="monotone" stackId="1" dataKey="contributions" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPrincipal)" />
                      <Area type="monotone" stackId="1" dataKey="growth" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorGrowth)" />
                    </>
                  ) : (
                    <>
                      <Area type="monotone" dataKey="balance" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorGrowth)" />
                      <Area type="monotone" dataKey="netBalance" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorPrincipal)" />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Composition Donuts */}
          <div id="composition" className="grid grid-cols-1 lg:grid-cols-2 gap-6 scroll-mt-6">
            <Donut title={mode === 'brokerage' ? 'Balance Composition' : 'Net vs. Deferred Tax'} slices={compositionSlices} />
            {phaseSlices.length > 0 ? (
              <Donut title="Contribution Mix by Phase" slices={phaseSlices} />
            ) : (
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 flex items-center justify-center text-center">
                <div>
                  <ListTree size={24} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-xs text-slate-400 font-medium">Add contribution phases to see the mix breakdown</p>
                </div>
              </div>
            )}
          </div>

          {/* Annual Breakdown Table */}
          <div id="breakdown" className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden scroll-mt-6">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Annual Breakdown</h3>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">End of year snapshots</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Year</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Age</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Balance</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Interest</th>
                    <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Taxes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {annualBreakdown.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 text-sm font-bold text-slate-900">{format(row.date, 'yyyy')}</td>
                      <td className="px-8 py-4 text-sm font-medium text-slate-500">{row.age}</td>
                      <td className="px-8 py-4 text-sm font-bold text-slate-900 text-right">{formatCurrency(row.balance)}</td>
                      <td className="px-8 py-4 text-sm font-bold text-emerald-600 text-right">+{formatCurrency(row.totalInterest)}</td>
                      <td className="px-8 py-4 text-sm font-bold text-red-500 text-right">-{formatCurrency(row.totalTaxes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
