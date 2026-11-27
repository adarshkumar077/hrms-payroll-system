'use client';

import { useEffect, useState } from 'react';
import { api, authFetch, getStoredUser } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import {
  ModuleAlert,
  ModuleButton,
  ModulePage,
  ModuleSecondaryButton,
  ModuleSection,
  StatusPill,
} from '@/components/layout/ModulePage';

type RowError = { field: string; message: string };
type PreviewRow = { row: number; employeeCode: string; name: string; status: 'ready' | 'error' | 'exists'; errors: RowError[] };
type Preview = {
  jobId: string;
  fileSha256: string;
  summary: { totalRows: number; ready: number; existing: number; errors: number };
  unknownColumns: string[];
  canImport: boolean;
  rows: PreviewRow[];
};
type CommitResult = { jobId: string; status: string; created: number; skippedExisting: number; failed: { row: number; message: string }[] };
type Job = { id: string; fileName: string; status: string; totalRows: number; successRows: number; errorRows: number; createdAt: string };

/** Spreadsheet-safe CSV cell: quote everything and neutralise formula prefixes. */
function csvCell(v: unknown) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

async function readError(res: Response) {
  const body = await res.json().catch(() => ({}));
  const m = (body as { message?: string | string[] }).message;
  return Array.isArray(m) ? m.join('; ') : m || `Request failed (${res.status})`;
}

export default function EmployeeImportPage() {
  const user = getStoredUser();
  const superAdmin = isSuperAdmin(user);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<'all' | 'error' | 'ready' | 'exists'>('all');

  function loadJobs() {
    api<Job[]>('/employee-import/jobs').then(setJobs).catch(() => undefined);
  }
  useEffect(loadJobs, []);

  async function downloadTemplate() {
    setError('');
    const res = await authFetch('/api/v1/employee-import/template');
    if (!res.ok) return setError(await readError(res));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eitf-employee-import-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runPreview() {
    if (!file) return;
    setBusy(true);
    setError('');
    setPreview(null);
    setResult(null);
    setBackupConfirmed(false);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await authFetch('/api/v1/employee-import/preview', { method: 'POST', body: fd });
      if (!res.ok) return setError(await readError(res));
      setPreview(await res.json());
      loadJobs();
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!file || !preview || !backupConfirmed) return;
    const n = preview.summary.ready;
    if (!window.confirm(`Create ${n} new employee record(s) with login accounts? Existing employees will not be changed.`)) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('jobId', preview.jobId);
      fd.append('backupConfirmed', 'true');
      const res = await authFetch('/api/v1/employee-import/commit', { method: 'POST', body: fd });
      if (!res.ok) return setError(await readError(res));
      setResult(await res.json());
      setPreview(null);
      loadJobs();
    } finally {
      setBusy(false);
    }
  }

  function downloadErrorReport() {
    if (!preview) return;
    const lines = [['Row', 'Employee ID', 'Status', 'Field', 'Problem'].map(csvCell).join(',')];
    for (const r of preview.rows) {
      if (r.status === 'error') for (const e of r.errors) lines.push([r.row, r.employeeCode, 'error', e.field, e.message].map(csvCell).join(','));
      if (r.status === 'exists') lines.push([r.row, r.employeeCode, 'skipped', 'Employee ID', 'Already exists — will not be changed'].map(csvCell).join(','));
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const rows = preview?.rows.filter((r) => filter === 'all' || r.status === filter) ?? [];

  return (
    <ModulePage title="Secure employee import" subtitle="Validate an Excel/CSV file, review the preview, then a Super Admin approves the import">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <ModuleSection>
        <p className="font-medium">1. Prepare the file</p>
        <p className="text-sm text-slate-600 mt-1">
          Required columns: Employee ID, Full Name, Mobile Number (10-digit Indian mobile), Email, Joining Date, Department,
          Designation, Gross Monthly Salary. Mobile and email must be unique — the email receives OTP login codes.
        </p>
        <ModuleSecondaryButton type="button" className="mt-2" onClick={downloadTemplate}>Download template</ModuleSecondaryButton>
      </ModuleSection>

      <ModuleSection>
        <p className="font-medium">2. Upload and preview (nothing is saved yet)</p>
        <input
          className="block mt-2 text-sm max-w-full"
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }}
        />
        <ModuleButton type="button" className="mt-2" disabled={!file || busy} onClick={runPreview}>
          {busy && !preview ? 'Checking…' : 'Validate & preview'}
        </ModuleButton>
      </ModuleSection>

      {preview && (
        <ModuleSection>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium mr-2">Preview</p>
            <StatusPill>{preview.summary.totalRows} rows</StatusPill>
            <StatusPill tone="success">{preview.summary.ready} ready</StatusPill>
            <StatusPill>{preview.summary.existing} already exist (skipped)</StatusPill>
            <StatusPill tone="warn">{preview.summary.errors} with errors</StatusPill>
          </div>
          {preview.unknownColumns.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">Ignored columns: {preview.unknownColumns.join(', ')}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3 text-sm">
            {(['all', 'error', 'ready', 'exists'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`px-3 py-1 rounded-full border ${filter === f ? 'bg-slate-900 text-white' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'exists' ? 'existing' : f}
              </button>
            ))}
            {(preview.summary.errors > 0 || preview.summary.existing > 0) && (
              <ModuleSecondaryButton type="button" onClick={downloadErrorReport}>Download error report (CSV)</ModuleSecondaryButton>
            )}
          </div>
          <div className="overflow-x-auto mt-3 -mx-1">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1 px-1">Row</th>
                  <th className="py-1 px-1">Employee ID</th>
                  <th className="py-1 px-1">Name</th>
                  <th className="py-1 px-1">Status</th>
                  <th className="py-1 px-1">Problems</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((r) => (
                  <tr key={r.row} className="border-b align-top">
                    <td className="py-1 px-1">{r.row}</td>
                    <td className="py-1 px-1">{r.employeeCode || '—'}</td>
                    <td className="py-1 px-1">{r.name || '—'}</td>
                    <td className="py-1 px-1">
                      <StatusPill tone={r.status === 'ready' ? 'success' : r.status === 'error' ? 'warn' : 'neutral'}>
                        {r.status === 'exists' ? 'exists — skipped' : r.status}
                      </StatusPill>
                    </td>
                    <td className="py-1 px-1 text-xs">
                      {r.errors.map((e, i) => <div key={i}><b>{e.field}:</b> {e.message}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 500 && <p className="text-xs text-slate-500 mt-1">Showing first 500 rows — download the error report for the full list.</p>}
          </div>
        </ModuleSection>
      )}

      {preview && (
        <ModuleSection>
          <p className="font-medium">3. Approve the import</p>
          {!preview.canImport ? (
            <p className="text-sm text-slate-600 mt-1">
              {preview.summary.errors > 0
                ? 'Fix every error in the file and preview again. Rows with errors are never imported partially.'
                : 'There are no new employees to create in this file.'}
            </p>
          ) : !superAdmin ? (
            <p className="text-sm text-slate-600 mt-1">
              The file is valid. Ask a Super Admin to open this page, upload the same file and approve the import.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 mt-2 text-sm">
                <input type="checkbox" className="mt-1" checked={backupConfirmed} onChange={(e) => setBackupConfirmed(e.target.checked)} />
                <span>I confirm a verified database backup was taken in the last 24 hours (Security → Backups).</span>
              </label>
              <ModuleButton type="button" className="mt-2" disabled={!backupConfirmed || busy} onClick={runCommit}>
                {busy ? 'Importing…' : `Import ${preview.summary.ready} new employee(s)`}
              </ModuleButton>
            </>
          )}
        </ModuleSection>
      )}

      {result && (
        <ModuleAlert type={result.failed.length ? 'error' : 'success'}>
          Import {result.status.toLowerCase()}: {result.created} created, {result.skippedExisting} existing skipped
          {result.failed.length > 0 && `, ${result.failed.length} failed (${result.failed.map((f) => `row ${f.row}: ${f.message}`).join('; ')})`}.
          New employees must use mobile OTP login or the temporary password reset by HR.
        </ModuleAlert>
      )}

      {jobs.length > 0 && (
        <ModuleSection>
          <p className="font-medium">Import history</p>
          <ul className="text-xs space-y-1 mt-1">
            {jobs.map((j) => (
              <li key={j.id}>
                {new Date(j.createdAt).toLocaleString()} · {j.fileName} · {j.status} · {j.totalRows} rows · {j.successRows} ok · {j.errorRows} errors
              </li>
            ))}
          </ul>
        </ModuleSection>
      )}
    </ModulePage>
  );
}
