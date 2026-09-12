'use client';

import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { isHr, isSuperAdmin } from '@/lib/roles';
import { ModuleAlert, ModuleButton, ModuleInput, ModulePage, ModuleSecondaryButton, ModuleSection, ModuleSelect } from '@/components/layout/ModulePage';

type Doc = { id: string; title: string; folder: string; category: string; fileName: string; expiresAt?: string | null; createdAt: string };

const FOLDERS = ['EMPLOYEE', 'HR', 'PAYROLL', 'COMPANY'];

export default function DocumentsLibraryPage() {
  const user = getStoredUser();
  const [folder, setFolder] = useState('COMPANY');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Doc[]>([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    const q = new URLSearchParams({ folder, ...(search ? { search } : {}) });
    api<Doc[]>(`/library/documents?${q}`).then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => { load(); }, [folder]);

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    fd.append('title', title || file.name);
    const token = localStorage.getItem('eitf_access_token');
    const res = await fetch('/api/v1/library/documents', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) { setError('Upload failed'); return; }
    setMsg('Uploaded');
    setFile(null);
    setTitle('');
    load();
  }

  return (
    <ModulePage title="Documents" subtitle="Enterprise library — Employee, HR, Payroll, and Company files with versions and expiry">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}
      {msg && <ModuleAlert type="success">{msg}</ModuleAlert>}
      <div className="flex flex-wrap gap-2 mb-4">
        {FOLDERS.map((f) => (
          <button key={f} type="button" onClick={() => setFolder(f)} className={`px-3 py-1.5 rounded-full text-sm ${folder === f ? 'bg-brand-600 text-white' : 'border border-ink-200'}`}>{f}</button>
        ))}
      </div>
      <ModuleSection>
        <div className="flex gap-2">
          <ModuleInput placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ModuleSecondaryButton type="button" onClick={load}>Filter</ModuleSecondaryButton>
        </div>
        {(isSuperAdmin(user) || isHr(user) || user?.roles.includes('ADMIN') || user?.roles.includes('EMPLOYEE')) && (
          <div className="grid md:grid-cols-3 gap-2 mt-3">
            <ModuleInput placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <ModuleButton type="button" onClick={upload}>Upload</ModuleButton>
          </div>
        )}
      </ModuleSection>
      <ul className="space-y-2 text-sm">
        {rows.map((d) => (
          <li key={d.id} className="card p-3 flex justify-between gap-3">
            <div>
              <p className="font-medium">{d.title}</p>
              <p className="text-xs text-ink-400">{d.folder} · {d.category} · {d.fileName}{d.expiresAt ? ` · expires ${new Date(d.expiresAt).toLocaleDateString()}` : ''}</p>
            </div>
            <div className="flex gap-2">
              <a className="text-brand-600 text-xs" href={`/api/v1/library/documents/${d.id}/preview`} target="_blank" rel="noreferrer">Preview</a>
              <a className="text-brand-600 text-xs" href={`/api/v1/library/documents/${d.id}/download`}>Download</a>
            </div>
          </li>
        ))}
      </ul>
    </ModulePage>
  );
}
