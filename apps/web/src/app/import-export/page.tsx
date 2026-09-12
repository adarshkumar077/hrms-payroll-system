'use client';

import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { isEmployeeUser, isSuperAdmin } from '@/lib/roles';
import { ModuleAlert, ModuleButton, ModulePage, ModuleSection, ModuleSelect } from '@/components/layout/ModulePage';

type Jobs = {
  imports: { id: string; entity: string; status: string; dryRun: boolean; successRows: number; errorRows: number; fileName: string }[];
  exports: { id: string; entity: string; format: string; status: string; fileName?: string | null }[];
};

const ENTITIES = ['employees', 'attendance', 'leave', 'payroll', 'departments', 'designations'];

export default function ImportExportPage() {
  const user = getStoredUser();
  const employeeOnly = isEmployeeUser(user);
  const [entity, setEntity] = useState('employees');
  const [jobs, setJobs] = useState<Jobs | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    if (employeeOnly) return;
    api<Jobs>('/import/jobs').then(setJobs).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => { load(); }, []);

  async function runImport(dryRun: boolean) {
    if (!file) return;
    const token = localStorage.getItem('eitf_access_token');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/v1/import/${entity}?dryRun=${dryRun}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.message ?? 'Import failed'); return; }
    setMsg(`${dryRun ? 'Dry run' : 'Import'} complete · ${body.successRows} ok · ${body.errorRows} errors`);
    load();
  }

  async function runExport(format: 'CSV' | 'XLSX' | 'PDF') {
    const token = localStorage.getItem('eitf_access_token');
    const res = await fetch(`/api/v1/export/${entity}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) { setError('Export failed'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entity}.${format.toLowerCase()}`;
    a.click();
    setMsg(`Exported ${entity} as ${format}`);
  }

  return (
    <ModulePage title="Import / Export" subtitle="Templates, field mapping, dry run, and bulk migration for EITF HR data">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}
      {msg && <ModuleAlert type="success">{msg}</ModuleAlert>}
      <ModuleSection>
        <p className="font-medium">Entity</p>
        <ModuleSelect value={entity} onChange={(e) => setEntity(e.target.value)}>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </ModuleSelect>
      </ModuleSection>
      {!employeeOnly && (
        <ModuleSection>
          <p className="font-medium">Import (Excel / CSV)</p>
          <a className="text-sm text-brand-600" href={`/api/v1/import/templates/${entity}`}>Download template</a>
          <input className="block mt-2" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="flex gap-2 mt-2">
            <ModuleButton type="button" onClick={() => runImport(true)}>Dry run</ModuleButton>
            <ModuleButton type="button" onClick={() => runImport(false)}>Bulk import</ModuleButton>
          </div>
        </ModuleSection>
      )}
      <ModuleSection>
        <p className="font-medium">Export</p>
        <div className="flex gap-2">
          <ModuleButton type="button" onClick={() => runExport('CSV')}>CSV</ModuleButton>
          <ModuleButton type="button" onClick={() => runExport('XLSX')}>Excel</ModuleButton>
          <ModuleButton type="button" onClick={() => runExport('PDF')}>PDF</ModuleButton>
        </div>
      </ModuleSection>
      {jobs && (
        <ModuleSection>
          <p className="font-medium">Job status</p>
          <ul className="text-xs space-y-1">
            {jobs.imports.map((j) => (
              <li key={j.id}>IMPORT {j.entity} · {j.status} · {j.fileName} · ok {j.successRows} / err {j.errorRows}{j.dryRun ? ' · dry-run' : ''}</li>
            ))}
            {jobs.exports.map((j) => (
              <li key={j.id}>EXPORT {j.entity} · {j.format} · {j.status}</li>
            ))}
          </ul>
        </ModuleSection>
      )}
      {isSuperAdmin(user) ? null : null}
    </ModulePage>
  );
}
