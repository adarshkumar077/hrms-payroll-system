'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type TaxSlab = { upTo: number | null; rate: number };
type Regime = {
  slabs: TaxSlab[];
  standardDeduction: number;
  rebate87A: { incomeLimit: number; maxRebate: number; marginalRelief: boolean };
  surcharge: { above: number; rate: number }[];
  allowsChapterVIADeductions: boolean;
};
type PtSlab = { upTo: number | null; amount: number; monthOverrides?: Record<string, number> };
type PtState = {
  name: string;
  periodicity: 'MONTHLY' | 'HALF_YEARLY';
  slabs: PtSlab[];
  femaleSlabs?: PtSlab[];
  notes?: string;
};
type RulesView = {
  financialYear: string;
  currentFinancialYear: string;
  availableYears: string[];
  source: 'DATABASE' | 'DEFAULT';
  verifyWithCA: boolean;
  updatedAt: string | null;
  rules: {
    incomeTax: {
      regimes: { NEW: Regime; OLD: Regime };
      cessPercent: number;
      surchargeMarginalRelief: boolean;
      monthlyTdsRounding: string;
    };
    pf: {
      wageCeiling: number;
      restrictToWageCeiling: boolean;
      employeePercent: number;
      employerPercent: number;
      epsPercent: number;
      epsWageCeiling: number;
      rounding: string;
    };
    esi: {
      grossThreshold: number;
      employeePercent: number;
      employerPercent: number;
      contributionPeriods: boolean;
      rounding: string;
    };
    professionalTax: Record<string, PtState>;
    notes?: string[];
  };
};

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function inr(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function bands<T extends { upTo: number | null }>(slabs: T[]) {
  let lower = 0;
  return slabs.map((s) => {
    const label = s.upTo == null ? `Above ${inr(lower)}` : `${inr(lower)} – ${inr(s.upTo)}`;
    lower = s.upTo ?? lower;
    return { slab: s, label };
  });
}

function RegimeTable({ title, r }: { title: string; r: Regime }) {
  return (
    <div className="rounded border border-mist p-3">
      <h3 className="font-medium text-brand-700">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-ink/60">
          <tr>
            <th className="py-1">Taxable income</th>
            <th className="py-1">Rate</th>
          </tr>
        </thead>
        <tbody>
          {bands(r.slabs).map(({ slab, label }) => (
            <tr key={label} className="border-t border-mist">
              <td className="py-1">{label}</td>
              <td className="py-1">{slab.rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-2 text-xs text-ink/70 space-y-0.5">
        <li>Standard deduction: {inr(r.standardDeduction)}</li>
        <li>
          87A rebate: up to {inr(r.rebate87A.maxRebate)} when taxable income ≤ {inr(r.rebate87A.incomeLimit)}
          {r.rebate87A.marginalRelief ? ' (with marginal relief)' : ''}
        </li>
        <li>
          Surcharge: {r.surcharge.map((s) => `${s.rate}% above ${inr(s.above)}`).join(' · ') || 'none'}
        </li>
        <li>Declared deductions (80C etc.) and PT allowed: {r.allowsChapterVIADeductions ? 'yes' : 'no'}</li>
      </ul>
    </div>
  );
}

export default function StatutoryRulesPage() {
  const router = useRouter();
  const [fy, setFy] = useState('');
  const [data, setData] = useState<RulesView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    const q = fy ? `?financialYear=${encodeURIComponent(fy)}` : '';
    api<RulesView>(`/payroll/statutory-rules${q}`)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load statutory rules'));
  }, [router, fy]);

  const r = data?.rules;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/payroll" className="text-sm text-brand-600 hover:underline">
        ← Payroll
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Statutory rules</h1>
      <p className="text-sm text-ink/60 mb-4">
        Income-tax slabs, PF, ESI and professional-tax tables used by payroll. Read-only.
      </p>

      <div className="rounded border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 mb-4">
        <strong>Verify with your CA before go-live.</strong> These tables are defaults entered from the
        published rules and have not been checked by a chartered accountant. Payroll uses them for TDS, PF,
        ESI and PT. See docs/PAYROLL-RULES.md for the formulas and known limitations.
      </div>

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      {data && r && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-ink/70">Financial year</span>
              <select
                className="rounded border border-mist px-2 py-1"
                value={data.financialYear}
                onChange={(e) => setFy(e.target.value)}
              >
                {data.availableYears.map((y) => (
                  <option key={y} value={y}>
                    FY {y}
                    {y === data.currentFinancialYear ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-ink/60">
              Source: {data.source === 'DATABASE' ? 'company rule set' : 'built-in defaults'}
              {data.verifyWithCA ? ' · not yet verified' : ' · verified'}
            </span>
          </div>

          <section className="grid md:grid-cols-2 gap-3">
            <RegimeTable title="New regime (default)" r={r.incomeTax.regimes.NEW} />
            <RegimeTable title="Old regime" r={r.incomeTax.regimes.OLD} />
          </section>
          <p className="text-xs text-ink/60">
            Health &amp; education cess {r.incomeTax.cessPercent}% on tax after rebate plus surcharge · surcharge
            marginal relief {r.incomeTax.surchargeMarginalRelief ? 'on' : 'off'} · monthly TDS rounded to{' '}
            {r.incomeTax.monthlyTdsRounding.toLowerCase().replace('_', ' ')}.
          </p>

          <section className="grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-mist p-3">
              <h3 className="font-medium text-brand-700">Provident Fund</h3>
              <ul className="mt-2 space-y-0.5">
                <li>Employee: {r.pf.employeePercent}% of Basic + DA</li>
                <li>
                  Wage ceiling: {inr(r.pf.wageCeiling)} (
                  {r.pf.restrictToWageCeiling ? 'contributions capped at the ceiling' : 'computed on actual basic'})
                </li>
                <li>
                  Employer: {r.pf.employerPercent}% — EPS {r.pf.epsPercent}% of wage up to {inr(r.pf.epsWageCeiling)},
                  EPF the rest
                </li>
                <li>Rounding: {r.pf.rounding.toLowerCase()}</li>
              </ul>
            </div>
            <div className="rounded border border-mist p-3">
              <h3 className="font-medium text-brand-700">ESI</h3>
              <ul className="mt-2 space-y-0.5">
                <li>Applies when monthly gross ≤ {inr(r.esi.grossThreshold)}</li>
                <li>Employee: {r.esi.employeePercent}% · Employer: {r.esi.employerPercent}% of gross</li>
                <li>
                  Contribution periods (Apr–Sep, Oct–Mar): {r.esi.contributionPeriods ? 'eligibility fixed for the period' : 'off'}
                </li>
                <li>Rounding: {r.esi.rounding.toLowerCase().replace('_', ' ')}</li>
              </ul>
            </div>
          </section>

          <section className="rounded border border-mist p-3 text-sm">
            <h3 className="font-medium text-brand-700">Professional tax (monthly gross)</h3>
            <div className="mt-2 grid md:grid-cols-2 gap-3">
              {Object.entries(r.professionalTax)
                .filter(([code]) => code !== 'NONE')
                .map(([code, st]) => (
                  <div key={code} className="rounded bg-mist/30 p-2">
                    <div className="font-medium">
                      {st.name} ({code}){st.periodicity === 'HALF_YEARLY' ? ' · half-yearly slabs' : ''}
                    </div>
                    <table className="mt-1 w-full text-xs">
                      <tbody>
                        {bands(st.slabs).map(({ slab, label }) => (
                          <tr key={label} className="border-t border-mist">
                            <td className="py-0.5">{label}</td>
                            <td className="py-0.5 text-right">
                              {inr(slab.amount)}
                              {slab.monthOverrides &&
                                Object.entries(slab.monthOverrides)
                                  .map(([m, v]) => ` (${MONTHS[Number(m)]}: ${inr(v)})`)
                                  .join('')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {st.femaleSlabs && (
                      <p className="mt-1 text-xs text-ink/60">
                        Women:{' '}
                        {bands(st.femaleSlabs)
                          .map(({ slab, label }) => `${label}: ${inr(slab.amount)}`)
                          .join(' · ')}
                      </p>
                    )}
                    {st.notes && <p className="mt-1 text-xs text-ink/60">{st.notes}</p>}
                  </div>
                ))}
            </div>
          </section>

          {r.notes && r.notes.length > 0 && (
            <ul className="text-xs text-ink/60 list-disc pl-5">
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
