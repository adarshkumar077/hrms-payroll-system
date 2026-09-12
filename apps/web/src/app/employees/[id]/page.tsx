'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken, getStoredUser, getApiBaseUrl } from '@/lib/api';
import { buildEmployeeUpdatePayload } from '@/lib/employee-payload';
import {
  EMPLOYEE_CODE_EXISTS_MSG,
  EMPLOYMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  sanitizeMobileInput,
  validateEmployeeForm,
} from '@/lib/form-utils';
import { INDIAN_STATES_AND_UTS } from '@/lib/indian-states';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StickySaveButton } from '@/components/ui/StickySaveButton';
import { UnsavedChangesDialog } from '@/components/ui/UnsavedChangesDialog';
import { EmployeeSalaryConfig } from '@/components/employees/EmployeeSalaryConfig';
import { EmployeeSalaryTracker } from '@/components/employees/EmployeeSalaryTracker';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

const API_URL = getApiBaseUrl();

type Employee = {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  workEmail?: string | null;
  personalEmail?: string | null;
  department?: string | null;
  designation?: string | null;
  status: string;
  isActive: boolean;
  gender?: string | null;
  joinedAt?: string | null;
  personal?: Record<string, string | null> | null;
  employment?: Record<string, string | number | null> | null;
  bank?: Record<string, string | null> | null;
  government?: Record<string, string | null> | null;
  familyMembers?: { id: string; name: string; relation: string }[];
  emergencyContacts?: { id: string; name: string; phone: string; relation?: string | null }[];
  statusHistory?: { id: string; fromStatus?: string | null; toStatus: string; reason?: string | null; effectiveAt: string }[];
};

type Doc = {
  id: string;
  title?: string | null;
  fileName: string;
  documentType: { code: string; name: string };
  createdAt: string;
};

const TABS = ['Personal', 'Employment', 'Salary', 'Bank', 'Government', 'Family', 'Emergency', 'Status', 'Documents', 'Login'] as const;

type LoginInfo = {
  employeeCode: string;
  hasLogin: boolean;
  loginId?: string | null;
  username: string | null;
  email?: string | null;
  accountStatus: string | null;
  lockedAt: string | null;
  failedLoginAttempts: number;
  forcePasswordChange: boolean;
  employeeActive: boolean;
};

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function initialTabFromUrl(): (typeof TABS)[number] {
  if (typeof window === 'undefined') return 'Personal';
  const tab = new URLSearchParams(window.location.search).get('tab');
  return TABS.includes(tab as (typeof TABS)[number]) ? (tab as (typeof TABS)[number]) : 'Personal';
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTabFromUrl);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [docType, setDocType] = useState('AADHAAR');
  const [file, setFile] = useState<File | null>(null);
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const savedSnapshotRef = useRef<string>('');

  function payloadFor(employee: Employee) {
    return buildEmployeeUpdatePayload(employee);
  }

  function reload() {
    api<Employee>(`/employees/${id}`)
      .then((data) => {
        setEmp(data);
        savedSnapshotRef.current = JSON.stringify(payloadFor(data));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
    api<Doc[]>(`/employees/${id}/documents`)
      .then(setDocs)
      .catch(() => setDocs([]));
  }

  const isDirty = useMemo(() => {
    if (!emp) return false;
    return JSON.stringify(payloadFor(emp)) !== savedSnapshotRef.current;
  }, [emp, isAdmin]);

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!emp) return false;
    const errors = validateEmployeeForm(emp);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Please fix the highlighted fields before saving.');
      return false;
    }
    if (isAdmin && emp.employeeCode.trim()) {
      try {
        const res = await api<{ available: boolean }>(
          `/employees/check-code?code=${encodeURIComponent(emp.employeeCode.trim())}&excludeId=${id}`,
        );
        if (!res.available) {
          setFieldErrors({ employeeCode: EMPLOYEE_CODE_EXISTS_MSG });
          setError(EMPLOYEE_CODE_EXISTS_MSG);
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not validate Employee Code');
        return false;
      }
    }
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updated = await api<Employee>(`/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payloadFor(emp)),
      });
      setEmp(updated);
      savedSnapshotRef.current = JSON.stringify(payloadFor(updated));
      setMessage('Employee saved successfully.');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      if (msg.includes('Employee Code already exists')) {
        setFieldErrors({ employeeCode: EMPLOYEE_CODE_EXISTS_MSG });
      }
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [emp, id, isAdmin]);

  const { showDialog, confirmLeave } = useUnsavedChangesGuard({
    isDirty,
    onSave: performSave,
    onDiscard: () => reload(),
  });

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setIsAdmin(u.roles.includes('SUPER_ADMIN') || u.roles.includes('HR') || u.roles.includes('ADMIN'));
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  async function saveCore(e: React.FormEvent) {
    e.preventDefault();
    await performSave();
  }

  async function changeStatus(status: string) {
    const exitStatuses = ['INACTIVE', 'TERMINATED', 'RESIGNED'];
    if (exitStatuses.includes(status) && !isAdmin) {
      setError('Only Super Admin or HR can remove or deactivate employees');
      return;
    }
    try {
      const updated = await api<Employee>(`/employees/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: `Set to ${status}` }),
      });
      setEmp(updated);
      setMessage(`Status updated to ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    }
  }

  async function removeEmployee() {
    if (!isAdmin || !emp) return;
    const ok = window.confirm(
      `Remove ${emp.firstName} ${emp.lastName ?? ''} (${emp.employeeCode}) from the active employee list?\n\nTheir login access will be disabled.`,
    );
    if (!ok) return;
    setRemoving(true);
    setError('');
    setMessage('');
    try {
      await api(
        `/employees/${id}?reason=${encodeURIComponent('Removed by HR from active employee list')}`,
        { method: 'DELETE' },
      );
      setMessage('Employee removed and login disabled.');
      router.push('/employees');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemoving(false);
    }
  }

  async function loadLoginInfo() {
    if (!isAdmin) return;
    try {
      const info = await api<LoginInfo>(`/employees/${id}/login-info`);
      setLoginInfo(info);
      setNewUsername(info.username ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load login info');
    }
  }

  async function changeUsername() {
    if (!isAdmin || !newUsername.trim()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const info = await api<LoginInfo>(`/employees/${id}/username`, {
        method: 'PATCH',
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      setLoginInfo(info);
      setMessage('Username updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Username update failed');
    } finally {
      setSaving(false);
    }
  }

  async function setAccountLocked(locked: boolean) {
    if (!isAdmin) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const info = await api<LoginInfo>(`/employees/${id}/account/${locked ? 'lock' : 'unlock'}`, {
        method: 'POST',
      });
      setLoginInfo(info);
      setMessage(locked ? 'Account locked.' : 'Account unlocked.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account update failed');
    } finally {
      setSaving(false);
    }
  }

  async function generateCredentials() {
    if (!isAdmin || !emp) return;
    if (!resetPassword) {
      setError('Enter a new password — auto-generate is disabled for security.');
      return;
    }
    if (resetPassword !== confirmResetPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await api<{ username: string; message: string; employeeCode: string }>(
        `/employees/${id}/credentials/reset`,
        {
          method: 'POST',
          body: JSON.stringify({ password: resetPassword }),
        },
      );
      setResetPassword('');
      setConfirmResetPassword('');
      setShowResetPassword(false);
      await loadLoginInfo();
      setMessage(
        `Password reset for ${res.username}. Share the password you set through a secure channel (never email or chat).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credential reset failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc(doc: Doc) {
    const ok = window.confirm(`Delete "${doc.fileName}"? This cannot be undone.`);
    if (!ok) return;
    setSaving(true);
    setError('');
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' });
      setMessage('Document deleted.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  async function viewDoc(doc: Doc) {
    const token = getToken();
    const res = await fetch(`${API_URL}/documents/${doc.id}/view`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('View failed');
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
  }

  async function downloadDoc(doc: Doc) {
    const token = getToken();
    const res = await fetch(`${API_URL}/documents/${doc.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    a.click();
  }

  async function replaceDoc(docId: string, file: File) {
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', file.name);
      const token = getToken();
      const res = await fetch(`${API_URL}/documents/${docId}/replace`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Replace failed');
      }
      setMessage('Document replaced.');
      setReplaceDocId(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setSaving(false);
    }
  }

  async function uploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const [code, customTitle] = docType.startsWith('CUSTOM:')
        ? ['CUSTOM', docType.slice(7)]
        : [docType, file.name];
      fd.append('documentTypeCode', code);
      fd.append('title', customTitle || file.name);
      const token = getToken();
      const res = await fetch(`${API_URL}/employees/${id}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Upload failed');
      }
      setFile(null);
      setMessage('Document uploaded.');
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  if (!emp) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-ink/60">{error || 'Loading…'}</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      {tab !== 'Login' && tab !== 'Salary' && isAdmin && (
        <StickySaveButton saving={saving} onClick={() => void performSave()} />
      )}
      <UnsavedChangesDialog open={showDialog} onAction={(a) => void confirmLeave(a)} />
      <Link href="/employees" className="text-sm text-brand-600 hover:underline">
        ← Directory
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-brand-700">
            {emp.firstName} {emp.lastName}
          </h1>
          <p className="text-sm text-ink/60">
            {emp.employeeCode} · {emp.department ?? 'No dept'} · {emp.status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-mist px-2 py-1 text-sm"
            value={emp.status}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {Array.from(
              new Set([
                ...(isAdmin
                  ? ['PROBATION', 'ACTIVE', 'NOTICE', 'INACTIVE', 'TERMINATED', 'RESIGNED']
                  : ['PROBATION', 'ACTIVE', 'NOTICE']),
                emp.status,
              ]),
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {isAdmin && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setTab('Login');
                void loadLoginInfo();
              }}
              className="rounded border border-brand-200 bg-white px-3 py-1 text-sm text-brand-700 disabled:opacity-60"
            >
              View Login Info
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setTab('Login');
                void loadLoginInfo();
              }}
              className="rounded border border-brand-200 bg-white px-3 py-1 text-sm text-brand-700 disabled:opacity-60"
            >
              Reset Password
            </button>
          )}
          {isAdmin && emp.isActive && (
            <button
              type="button"
              disabled={removing}
              onClick={removeEmployee}
              className="rounded border border-red-200 bg-white px-3 py-1 text-sm text-red-700 disabled:opacity-60"
            >
              {removing ? 'Removing…' : 'Deactivate employee'}
            </button>
          )}
          {isAdmin && !emp.isActive && (
            <button
              type="button"
              onClick={() => changeStatus('ACTIVE')}
              className="rounded border border-emerald-200 bg-white px-3 py-1 text-sm text-emerald-700"
            >
              Activate employee
            </button>
          )}
        </div>
      </div>

      {message && <p className="mb-3 text-sm text-brand-700 bg-mist px-3 py-2 rounded">{message}</p>}
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.filter((t) => (t === 'Login' ? isAdmin : true)).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              if (t === 'Login') void loadLoginInfo();
            }}
            className={`px-3 py-1.5 text-sm rounded ${tab === t ? 'bg-brand-600 text-white' : 'bg-white border border-mist'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Login' && isAdmin && (
        <div className="bg-white/80 border border-brand-100 rounded-lg p-5 space-y-4 mb-4">
          <h2 className="font-display text-lg text-brand-700">Login information</h2>
          {loginInfo ? (
            <div className="text-sm space-y-2">
              <p><span className="text-ink/60">Employee ID:</span> {loginInfo.employeeCode}</p>
              <p><span className="text-ink/60">User ID (login):</span> {loginInfo.loginId ?? loginInfo.username ?? '—'}</p>
              <p><span className="text-ink/60">Email:</span> {loginInfo.email ?? '—'}</p>
              <p><span className="text-ink/60">Account status:</span> {loginInfo.accountStatus ?? 'No account'}</p>
              <p><span className="text-ink/60">Employee active:</span> {loginInfo.employeeActive ? 'Yes' : 'No'}</p>
              <p><span className="text-ink/60">Failed login attempts:</span> {loginInfo.failedLoginAttempts}</p>
              {loginInfo.lockedAt && (
                <p><span className="text-ink/60">Locked at:</span> {new Date(loginInfo.lockedAt).toLocaleString()}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink/60">Loading login information…</p>
          )}

          <label className="block text-sm">
                <span className="text-ink/70">Change User ID (login)</span>
            <div className="mt-1 flex gap-2">
              <input
                className="flex-1 rounded border border-mist px-3 py-2"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <button
                type="button"
                disabled={saving || !newUsername.trim()}
                onClick={changeUsername}
                className="px-3 py-2 text-sm rounded border border-mist bg-white disabled:opacity-60"
              >
                Update
              </button>
            </div>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || loginInfo?.accountStatus === 'LOCKED'}
              onClick={() => setAccountLocked(true)}
              className="px-3 py-2 text-sm rounded border border-red-200 text-red-700 bg-white disabled:opacity-60"
            >
              Lock account
            </button>
            <button
              type="button"
              disabled={saving || loginInfo?.accountStatus !== 'LOCKED'}
              onClick={() => setAccountLocked(false)}
              className="px-3 py-2 text-sm rounded border border-emerald-200 text-emerald-700 bg-white disabled:opacity-60"
            >
              Unlock account
            </button>
          </div>

          <div className="border-t border-mist pt-4 space-y-3">
            <h3 className="text-sm font-medium text-brand-700">Reset password</h3>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border border-mist px-3 py-2 text-sm"
                type={showResetPassword ? 'text' : 'password'}
                placeholder="New password (optional)"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
              />
              <button
                type="button"
                className="px-3 py-2 text-xs rounded border border-mist bg-white"
                onClick={() => setShowResetPassword((v) => !v)}
              >
                {showResetPassword ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="px-3 py-2 text-xs rounded border border-mist bg-white"
                onClick={() => {
                  const pwd = generateRandomPassword();
                  setResetPassword(pwd);
                  setConfirmResetPassword(pwd);
                  setShowResetPassword(true);
                }}
              >
                Generate
              </button>
            </div>
            <input
              className="w-full rounded border border-mist px-3 py-2 text-sm"
              type={showResetPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmResetPassword}
              onChange={(e) => setConfirmResetPassword(e.target.value)}
            />
            <button
              type="button"
              disabled={saving}
              onClick={generateCredentials}
              className="px-4 py-2 text-sm rounded bg-brand-600 text-white disabled:opacity-60"
            >
              Reset password
            </button>
          </div>
        </div>
      )}

      {tab === 'Salary' && (
        <div className="space-y-4 mb-4">
          <div className="bg-white/80 border border-brand-100 rounded-lg p-5">
            <EmployeeSalaryConfig
              employeeId={id}
              isAdmin={isAdmin}
              onMessage={setMessage}
              onError={setError}
            />
          </div>
          <div className="bg-white/80 border border-brand-100 rounded-lg p-5">
            <EmployeeSalaryTracker
              employeeId={id}
              title="Daily Attendance Earning Tracker"
            />
          </div>
        </div>
      )}

      {tab !== 'Login' && tab !== 'Salary' && (
      <form onSubmit={saveCore} className="bg-white/80 border border-brand-100 rounded-lg p-5 space-y-3">
        {tab === 'Personal' && (
          <>
            {(
              [
                ['firstName', 'First name'],
                ['middleName', 'Middle name'],
                ['lastName', 'Last name'],
                ['email', 'Email'],
                ['personalEmail', 'Personal email'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-ink/70">{label}{key === 'firstName' ? ' *' : ''}</span>
                <input
                  className={`mt-1 w-full rounded border px-3 py-2 ${fieldErrors[key] ? 'border-red-400' : 'border-mist'}`}
                  value={(emp[key] as string | null | undefined) ?? ''}
                  onChange={(e) => setEmp({ ...emp, [key]: e.target.value })}
                  required={key === 'firstName'}
                />
                {fieldErrors[key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>}
              </label>
            ))}
            <label className="block text-sm">
              <span className="text-ink/70">Mobile *</span>
              <input
                className={`mt-1 w-full rounded border px-3 py-2 ${fieldErrors.mobile ? 'border-red-400' : 'border-mist'}`}
                inputMode="numeric"
                maxLength={10}
                value={emp.mobile ?? ''}
                onChange={(e) => setEmp({ ...emp, mobile: sanitizeMobileInput(e.target.value) })}
                required
              />
              {fieldErrors.mobile && <p className="mt-1 text-xs text-red-600">{fieldErrors.mobile}</p>}
            </label>
            <label className="block text-sm">
              <span className="text-ink/70">Gender *</span>
              <select
                className={`mt-1 w-full rounded border px-3 py-2 ${fieldErrors.gender ? 'border-red-400' : 'border-mist'}`}
                value={emp.gender ?? ''}
                onChange={(e) => setEmp({ ...emp, gender: e.target.value })}
                required
              >
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              {fieldErrors.gender && <p className="mt-1 text-xs text-red-600">{fieldErrors.gender}</p>}
            </label>
            <label className="block text-sm">
              <span className="text-ink/70">Address line 1</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={emp.personal?.addressLine1 ?? ''}
                onChange={(e) =>
                  setEmp({
                    ...emp,
                    personal: { ...(emp.personal ?? {}), addressLine1: e.target.value },
                  })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink/70">City</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={emp.personal?.city ?? ''}
                onChange={(e) =>
                  setEmp({
                    ...emp,
                    personal: { ...(emp.personal ?? {}), city: e.target.value },
                  })
                }
              />
            </label>
            <SearchableSelect
              label="State"
              value={emp.personal?.state ?? ''}
              options={INDIAN_STATES_AND_UTS}
              onChange={(state) =>
                setEmp({
                  ...emp,
                  personal: { ...(emp.personal ?? {}), state },
                })
              }
              placeholder="Search state or UT…"
            />
            <label className="block text-sm">
              <span className="text-ink/70">Pincode</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={emp.personal?.pincode ?? ''}
                onChange={(e) =>
                  setEmp({
                    ...emp,
                    personal: { ...(emp.personal ?? {}), pincode: e.target.value },
                  })
                }
              />
            </label>
          </>
        )}

        {tab === 'Employment' && (
          <>
            {isAdmin && (
              <label className="block text-sm">
                <span className="text-ink/70">Employee Code *</span>
                <input
                  className={`mt-1 w-full rounded border px-3 py-2 ${fieldErrors.employeeCode ? 'border-red-400' : 'border-mist'}`}
                  value={emp.employeeCode}
                  onChange={(e) => setEmp({ ...emp, employeeCode: e.target.value })}
                  required
                />
                {fieldErrors.employeeCode && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.employeeCode}</p>
                )}
                <p className="mt-1 text-xs text-ink/50">Only Super Admin and HR can modify the Employee Code.</p>
              </label>
            )}
            {(
              [
                ['department', 'Department'],
                ['designation', 'Designation'],
                ['workEmail', 'Work email'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-ink/70">{label}</span>
                <input
                  className="mt-1 w-full rounded border border-mist px-3 py-2"
                  value={(emp[key] as string | null | undefined) ?? ''}
                  onChange={(e) => setEmp({ ...emp, [key]: e.target.value })}
                />
              </label>
            ))}
            {(
              [
                ['workLocation', 'Work location'],
                ['grade', 'Grade'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-ink/70">{label}</span>
                <input
                  className="mt-1 w-full rounded border border-mist px-3 py-2"
                  value={String(emp.employment?.[key] ?? '')}
                  onChange={(e) =>
                    setEmp({
                      ...emp,
                      employment: { ...(emp.employment ?? {}), [key]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <label className="block text-sm">
              <span className="text-ink/70">Employee type</span>
              <select
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={String(emp.employment?.employmentType ?? '')}
                onChange={(e) =>
                  setEmp({
                    ...emp,
                    employment: { ...(emp.employment ?? {}), employmentType: e.target.value },
                  })
                }
              >
                <option value="">Select type</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {tab === 'Bank' &&
          (
            [
              ['accountHolder', 'Account holder'],
              ['bankName', 'Bank name'],
              ['accountNumber', 'Account number'],
              ['ifsc', 'IFSC'],
              ['branch', 'Branch'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-ink/70">{label}</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={emp.bank?.[key] ?? ''}
                onChange={(e) =>
                  setEmp({ ...emp, bank: { ...(emp.bank ?? {}), [key]: e.target.value } })
                }
              />
            </label>
          ))}

        {tab === 'Government' &&
          (
            [
              ['aadhaarNumber', 'Aadhaar'],
              ['panNumber', 'PAN'],
              ['passportNumber', 'Passport'],
              ['uan', 'UAN'],
              ['pfNumber', 'PF'],
              ['esicNumber', 'ESIC'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-ink/70">{label}</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={emp.government?.[key] ?? ''}
                onChange={(e) =>
                  setEmp({
                    ...emp,
                    government: { ...(emp.government ?? {}), [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}

        {tab === 'Family' && (
          <div className="space-y-2">
            {(emp.familyMembers ?? []).map((m, i) => (
              <div key={m.id ?? i} className="grid grid-cols-2 gap-2">
                <input
                  className="rounded border border-mist px-3 py-2 text-sm"
                  placeholder="Name"
                  value={m.name}
                  onChange={(e) => {
                    const familyMembers = [...(emp.familyMembers ?? [])];
                    familyMembers[i] = { ...m, name: e.target.value };
                    setEmp({ ...emp, familyMembers });
                  }}
                />
                <input
                  className="rounded border border-mist px-3 py-2 text-sm"
                  placeholder="Relation"
                  value={m.relation}
                  onChange={(e) => {
                    const familyMembers = [...(emp.familyMembers ?? [])];
                    familyMembers[i] = { ...m, relation: e.target.value };
                    setEmp({ ...emp, familyMembers });
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-brand-600"
              onClick={() =>
                setEmp({
                  ...emp,
                  familyMembers: [...(emp.familyMembers ?? []), { id: `new-${Date.now()}`, name: '', relation: '' }],
                })
              }
            >
              + Add family member
            </button>
          </div>
        )}

        {tab === 'Emergency' && (
          <div className="space-y-2">
            {(emp.emergencyContacts ?? []).map((c, i) => (
              <div key={c.id ?? i} className="grid sm:grid-cols-3 gap-2">
                <input
                  className="rounded border border-mist px-3 py-2 text-sm"
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => {
                    const emergencyContacts = [...(emp.emergencyContacts ?? [])];
                    emergencyContacts[i] = { ...c, name: e.target.value };
                    setEmp({ ...emp, emergencyContacts });
                  }}
                />
                <input
                  className="rounded border border-mist px-3 py-2 text-sm"
                  placeholder="Phone"
                  value={c.phone}
                  onChange={(e) => {
                    const emergencyContacts = [...(emp.emergencyContacts ?? [])];
                    emergencyContacts[i] = { ...c, phone: e.target.value };
                    setEmp({ ...emp, emergencyContacts });
                  }}
                />
                <input
                  className="rounded border border-mist px-3 py-2 text-sm"
                  placeholder="Relation"
                  value={c.relation ?? ''}
                  onChange={(e) => {
                    const emergencyContacts = [...(emp.emergencyContacts ?? [])];
                    emergencyContacts[i] = { ...c, relation: e.target.value };
                    setEmp({ ...emp, emergencyContacts });
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-brand-600"
              onClick={() =>
                setEmp({
                  ...emp,
                  emergencyContacts: [
                    ...(emp.emergencyContacts ?? []),
                    { id: `new-${Date.now()}`, name: '', phone: '', relation: '' },
                  ],
                })
              }
            >
              + Add emergency contact
            </button>
          </div>
        )}

        {tab === 'Status' && (
          <ul className="text-sm space-y-2">
            {(emp.statusHistory ?? []).map((h) => (
              <li key={h.id} className="border-b border-mist pb-2">
                <span className="font-medium">
                  {h.fromStatus ?? '—'} → {h.toStatus}
                </span>
                <span className="text-ink/50 ml-2">{new Date(h.effectiveAt).toLocaleString()}</span>
                {h.reason && <p className="text-ink/60">{h.reason}</p>}
              </li>
            ))}
          </ul>
        )}

        {tab === 'Documents' && (
          <div className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-sm">
                Type
                <select
                  className="block mt-1 rounded border border-mist px-2 py-2"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {['AADHAAR', 'PAN', 'PASSPORT', 'RESUME', 'EDUCATIONAL', 'OFFER', 'APPOINTMENT', 'INCREMENT', 'EXPERIENCE', 'RELIEVING', 'BANK', 'CUSTOM'].map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                  {['DRIVING_LICENSE', 'PHOTO', 'SALARY_LETTER', 'CANCELLED_CHEQUE', 'PF_DOCUMENTS', 'ESI_DOCUMENTS', 'OTHER'].map(
                    (t) => (
                      <option key={t} value={`CUSTOM:${t}`}>
                        {t.replace(/_/g, ' ')}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button
                type="button"
                disabled={!file || saving}
                onClick={uploadDoc}
                className="bg-brand-600 text-white px-3 py-2 rounded text-sm disabled:opacity-60"
              >
                Upload
              </button>
            </div>
            <ul className="text-sm space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 border-b border-mist pb-2">
                  <span>
                    <span className="font-medium">{d.documentType.name}</span> — {d.fileName}
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => void viewDoc(d).catch((e) => setError(e instanceof Error ? e.message : 'View failed'))}>
                      View
                    </button>
                    <button type="button" className="text-brand-600 hover:underline" onClick={() => void downloadDoc(d).catch((e) => setError(e instanceof Error ? e.message : 'Download failed'))}>
                      Download
                    </button>
                    <button
                      type="button"
                      className="text-brand-600 hover:underline"
                      onClick={() => {
                        setReplaceDocId(d.id);
                        replaceInputRef.current?.click();
                      }}
                    >
                      Replace
                    </button>
                    <button type="button" className="text-red-700 hover:underline" onClick={() => void deleteDoc(d)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {docs.length === 0 && <li className="text-ink/50">No documents uploaded.</li>}
            </ul>
            <input
              ref={replaceInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && replaceDocId) void replaceDoc(replaceDocId, f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {tab !== 'Documents' && tab !== 'Status' && (
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-600 text-white px-4 py-2 rounded disabled:opacity-60 lg:hidden"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </form>
      )}
    </main>
  );
}
