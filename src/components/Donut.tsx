import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCompactCurrency } from '../lib/utils';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export const Donut = ({ title, slices }: { title: string; slices: DonutSlice[] }) => {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 lg:p-8">
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6">{title}</h3>
      <div className="flex items-center gap-8">
        <div className="h-36 w-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="65%"
                outerRadius="100%"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {slices.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs font-medium text-slate-500 truncate">{s.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-slate-900">{formatCompactCurrency(s.value)}</span>
                <span className="text-[10px] font-bold text-slate-400 w-9 text-right">
                  {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
