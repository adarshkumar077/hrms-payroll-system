'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { ModuleAlert, ModuleButton, ModuleInput, ModulePage, ModuleSecondaryButton, ModuleSection, ModuleTextarea } from '@/components/layout/ModulePage';

type Row = { id: string; employeeCode: string; name: string; taxableGross: number; tdsDeducted: number; professionalTax: number; source: string };
type SaveResult = {
  saved: boolean;
  summary: { rows: number; valid: number; errors: number; approvedRunsThisFy: number };
  errors: { row: number; employeeCode: string; message: string }[];
};

function currentFy() {
  const d = new Date();
  const start = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const inr = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** Parses "Employee ID, Taxable gross, TDS, PT" lines (comma or tab separated; header optional). */
function parse(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim()))
    .filter((c) => !/employee/i.test(c[0] ?? ''))
    .map(([employeeCode, taxableGross, tdsDeducted, professionalTax]) => ({ employeeCode, taxableGross, tdsDeducted, professionalTax }));
}

export default function TaxOpeningPage() {
  const router = useRouter();
  const [fy, setFy] = useState(currentFy());
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [check, setCheck] = useState<SaveResult | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u?.roles.includes('SUPER_ADMIN')) router.replace('/dashboard');
  }, [router]);

  function load() {
    api<{ rows: Row[] }>(`/payroll/tax-opening-balances?financialYear=${encodeURIComponent(fy)}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }
  useEffect(load, [fy]);

  async function submit(dryRun: boolean) {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const r = await api<SaveResult>('/payroll/tax-opening-balances', {
        method: 'PUT',
        body: JSON.stringify({ financialYear: fy, source, rows: parse(text), dryRun }),
      });
      setCheck(r);
      if (r.saved) {
        setMsg(`Saved ${r.summary.valid} opening balance(s) for FY ${fy}.`);
        setText('');
        load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModulePage title="TDS opening balances" subtitle="Salary paid and TDS deducted earlier this financial year, before payroll ran in this system">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}
      {msg && <ModuleAlert type="success">{msg}</ModuleAlert>}
      <ModuleSection>
        <p className="text-sm">
          Enter figures from your previous payroll records (and Form 12B for previous employers), verified by your CA. They are added to
          the months processed here when monthly TDS is projected. Enter only months <b>not</b> processed in this system.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <label className="text-sm">Financial year
            <ModuleInput value={fy} onChange={(e) => setFy(e.target.value.trim())} placeholder="2026-27" />
          </label>
          <label className="text-sm">Source of the figures
            <ModuleInput value={source} onChange={(e) => setSource(e.target.value)} placeholder="Apr–Nov 2026 old payroll, CA-verified" />
          </label>
        </div>
        <label className="text-sm block mt-3">Rows: Employee ID, Taxable gross, TDS deducted, Professional tax (one per line; paste from Excel)
          <ModuleTextarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'EITF014, 1200000, 90000, 1600\nEITF015, 640000, 0, 1600'} />
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          <ModuleSecondaryButton type="button" disabled={busy || !text.trim()} onClick={() => submit(true)}>Validate</ModuleSecondaryButton>
          <ModuleButton type="button" disabled={busy || !text.trim() || !check || check.errors.length > 0 || check.saved} onClick={() => submit(false)}>Save</ModuleButton>
        </div>
        {check && !check.saved && (
          <div className="text-sm mt-3">
            <p>{check.summary.valid} valid, {check.summary.errors} with errors.{check.summary.approvedRunsThisFy > 0 && ` Note: ${check.summary.approvedRunsThisFy} payroll run(s) of this FY are already approved in the system; do not include those months.`}</p>
            {check.errors.length > 0 && (
              <ul className="list-disc ml-5 mt-1">
                {check.errors.map((e) => <li key={e.row}>Row {e.row} {e.employeeCode && `(${e.employeeCode})`}: {e.message}</li>)}
              </ul>
            )}
            {check.errors.length === 0 && <p className="mt-1">All rows are valid. Click Save.</p>}
          </div>
        )}
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Saved for FY {fy} ({rows.length})</p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-slate-500 border-b"><th className="py-1">Employee</th><th>Taxable gross</th><th>TDS</th><th>PT</th><th>Source</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-1">{r.employeeCode} {r.name}</td><td>₹{inr(r.taxableGross)}</td><td>₹{inr(r.tdsDeducted)}</td><td>₹{inr(r.professionalTax)}</td><td className="text-xs">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ModuleSection>
    </ModulePage>
  );
}
