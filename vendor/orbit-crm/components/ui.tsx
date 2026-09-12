import Link from "next/link";
import { inrLakh } from "@/lib/format";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "brand",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "brand" | "green" | "red" | "amber" | "slate" | "blue";
  href?: string;
}) {
  const colors: Record<string, string> = {
    brand: "border-l-brand-600",
    green: "border-l-emerald-500",
    red: "border-l-rose-500",
    amber: "border-l-amber-500",
    slate: "border-l-slate-400",
    blue: "border-l-blue-500",
  };
  const inner = (
    <div className={`card border-l-4 ${colors[accent]} p-4 h-full`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function MoneyStat({ label, amount, ...rest }: { label: string; amount: number; accent?: any; hint?: string; href?: string }) {
  return <StatCard label={label} value={inrLakh(amount)} {...rest} />;
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    brand: "bg-brand-50 text-brand-700",
  };
  return <span className={`badge ${tones[tone] || tones.slate}`}>{children}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-8 text-center text-sm text-slate-400">{children}</div>;
}
