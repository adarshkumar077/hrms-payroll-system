import Link from 'next/link';
import { ReactNode } from 'react';

type ModulePageProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: '3xl' | '6xl';
};

/** Standard HRMS module page shell — matches Attendance, Helpdesk, etc. */
export function ModulePage({ title, subtitle, children, maxWidth = '6xl' }: ModulePageProps) {
  const width = maxWidth === '3xl' ? 'max-w-3xl' : 'max-w-6xl';
  return (
    <main className={`${width} mx-auto px-4 py-10`}>
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">{title}</h1>
      {subtitle ? <p className="text-sm text-ink/60 mb-4">{subtitle}</p> : <div className="mb-4" />}
      {children}
    </main>
  );
}

export function ModuleSection({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2 ${className}`}>
      {children}
    </section>
  );
}

export function ModuleList({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 text-sm">{children}</ul>;
}

export function ModuleListItem({ children }: { children: ReactNode }) {
  return <li className="bg-white/80 border border-brand-100 rounded-lg p-3">{children}</li>;
}

export function ModuleAlert({ type, children }: { type: 'error' | 'success'; children: ReactNode }) {
  const cls = type === 'error' ? 'text-red-700' : 'text-brand-700';
  return <p className={`text-sm ${cls} mb-2`}>{children}</p>;
}

export function ModuleInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`border border-mist rounded px-2 py-2 w-full ${props.className ?? ''}`}
    />
  );
}

export function ModuleSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`border border-mist rounded px-2 py-2 w-full ${props.className ?? ''}`}
    />
  );
}

export function ModuleTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`border border-mist rounded px-2 py-2 w-full ${props.className ?? ''}`}
    />
  );
}

export function ModuleButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`bg-brand-600 text-white px-4 py-2 rounded disabled:opacity-50 ${props.className ?? ''}`}
    />
  );
}

export function ModuleSecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`border border-mist px-3 py-1.5 rounded text-sm ${props.className ?? ''}`}
    />
  );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warn' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
  };
  return <span className={`text-xs px-2 py-0.5 rounded ${tones[tone]}`}>{children}</span>;
}
