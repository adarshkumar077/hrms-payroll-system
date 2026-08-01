import { ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: boolean;
};

export function Card({ children, className = '', hover = false, padding = true }: CardProps) {
  return (
    <div className={`${hover ? 'card-hover' : 'card'} ${padding ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  change,
  changeType = 'neutral',
  icon,
  suffix,
}: {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
  suffix?: string;
}) {
  const changeColor =
    changeType === 'positive' ? 'text-success-dark' : changeType === 'negative' ? 'text-danger-dark' : 'text-ink-400';

  return (
    <div className="kpi-card group">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <p className="text-3xl font-display font-bold text-ink-900 animate-count-up">{value}</p>
        {suffix && <span className="text-sm text-ink-400">{suffix}</span>}
      </div>
      {change && <p className={`text-xs font-medium ${changeColor}`}>{change}</p>}
    </div>
  );
}

export function StatBar({ label, value, max, color = 'bg-brand-500' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-ink-600">{label}</span>
        <span className="font-semibold text-ink-800">{value}</span>
      </div>
      <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
