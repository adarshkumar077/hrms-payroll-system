'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, updateStoredUser } from '@/lib/api';
import { formatRoleLabel } from '@/lib/roles';
import { getHomePathForUser } from '@/lib/home';

type Setting = { key: string; label: string | null; value: unknown; group: string };
type Backup = {
  id: string;
  status: string;
  trigger: string;
  storagePath?: string | null;
  sizeBytes?: number | null;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
};
type AdminUser = {
  id: string;
  loginId?: string | null;
  email?: string | null;
  mobile?: string | null;
  displayName: string;
  status: string;
  roles: string[];
  roleLabels: string[];
};

export default function SecuritySettingsPage() {
  const router = useRouter();
  const passwordChangeRequired = !!getStoredUser()?.forcePasswordChange;
  const [settings, setSettings] = useState<Setting[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [currentLoginId, setCurrentLoginId] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [usernameForm, setUsernameForm] = useState({ username: '', currentPassword: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [hrForm, setHrForm] = useState({
    email: '',
    mobile: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });

  function load() {
    api<{ settings: Setting[] }>('/security/settings')
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
    api<Backup[]>('/security/backups')
      .then(setBackups)
      .catch(() => undefined);
    api<AdminUser[]>('/auth/admin-users')
      .then(setAdminUsers)
      .catch(() => undefined);
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (u.forcePasswordChange) {
      router.replace('/account/password?required=true');
      return;
    }
    if (!u.roles.includes('SUPER_ADMIN')) {
      router.replace('/dashboard');
      return;
    }
    setCurrentLoginId(u.loginId ?? '');
    setCurrentEmail(u.email ?? '');
    setUsernameForm({ username: u.loginId ?? '', currentPassword: '' });
    load();
  }, [router]);

  function setLocal(key: string, value: unknown) {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
  }

  function parseValue(raw: string, current: unknown): unknown {
    if (typeof current === 'boolean') return raw === 'true' || raw === '1';
    if (typeof current === 'number') return Number(raw);
    if (Array.isArray(current)) {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : raw.split(/[\s,]+/).filter(Boolean);
      } catch {
        return raw.split(/[\s,]+/).filter(Boolean);
      }
    }
    return raw;
  }

  async function save() {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const payload: Record<string, unknown> = {};
      for (const s of settings) payload[s.key] = s.value;
      const r = await api<{ settings: Setting[] }>('/security/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: payload }),
      });
      setSettings(r.settings);
      setMsg('Security settings saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runBackup() {
    setError('');
    setMsg('');
    try {
      await api('/security/backups/run', { method: 'POST', body: '{}' });
      setMsg('Backup completed');
      const list = await api<Backup[]>('/security/backups');
      setBackups(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed');
    }
  }

  async function start2fa() {
    setError('');
    try {
      const r = await api<{ qrDataUrl: string }>('/auth/2fa/setup', { method: 'POST', body: '{}' });
      setQr(r.qrDataUrl);
      setMsg('Scan QR then enter TOTP to confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : '2FA setup failed');
    }
  }

  async function confirm2fa() {
    setError('');
    try {
      await api('/auth/2fa/confirm', { method: 'POST', body: JSON.stringify({ totpCode }) });
      setMsg('2FA enabled');
      setQr(null);
      setTotpCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirm failed');
    }
  }

  async function createHrUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (hrForm.password !== hrForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api('/auth/admin-users', {
        method: 'POST',
        body: JSON.stringify({
          email: hrForm.email,
          mobile: hrForm.mobile,
          displayName: hrForm.displayName,
          password: hrForm.password,
          confirmPassword: hrForm.confirmPassword,
          role: 'HR',
        }),
      });
      setHrForm({ email: '', mobile: '', displayName: '', password: '', confirmPassword: '' });
      setMsg('HR account created.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function deactivateHrUser(id: string) {
    if (!window.confirm('Deactivate this HR account?')) return;
    setSaving(true);
    setError('');
    try {
      await api(`/auth/admin-users/${id}`, { method: 'DELETE' });
      setMsg('HR account deactivated.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    } finally {
      setSaving(false);
    }
  }

  async function changeUsername(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setSaving(true);
    try {
      const res = await api<{ message: string; username: string }>('/auth/username/change', {
        method: 'POST',
        body: JSON.stringify({
          username: usernameForm.username.trim(),
          currentPassword: usernameForm.currentPassword,
        }),
      });
      setCurrentLoginId(res.username);
      setUsernameForm({ username: res.username, currentPassword: '' });
      updateStoredUser({ loginId: res.username });
      setMsg('User ID updated. Use the new User ID on next login.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Username update failed');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api('/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      const nextUser = updateStoredUser({ forcePasswordChange: false });
      setMsg('Password updated successfully.');
      if (passwordChangeRequired && nextUser) {
        router.replace(getHomePathForUser(nextUser));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Security Settings</h1>
      <p className="text-sm text-ink/60 mb-4">
        2FA enforcement, password policy, IP allow-list, session timeout, backups
      </p>
      <div className="flex gap-3 text-sm mb-6">
        <Link href="/security/audit" className="text-brand-600 underline">
          Audit Log Viewer
        </Link>
        <Link href="/compliance" className="text-brand-600 underline">
          Compliance Reports
        </Link>
      </div>

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      {msg && <p className="text-sm text-brand-700 mb-3">{msg}</p>}
      {passwordChangeRequired && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          For security, you must change your password before continuing.
        </div>
      )}

      <section className="mb-8 bg-white/80 border border-brand-100 rounded-lg p-5">
        <h2 className="font-display text-xl text-brand-700 mb-1">My Login Credentials</h2>
        <p className="text-sm text-ink/60 mb-4">
          Change your Super Admin User ID and password here.
        </p>
        <div className="text-sm mb-4 space-y-1">
          <p>
            <span className="text-ink/50">Current User ID:</span>{' '}
            <span className="font-medium text-brand-700">{currentLoginId || '—'}</span>
          </p>
          <p>
            <span className="text-ink/50">Email address:</span>{' '}
            <span className="font-medium text-brand-700">{currentEmail || '—'}</span>
          </p>
          <p>
            <span className="text-ink/50">Role:</span>{' '}
            <span className="font-medium text-brand-700">Super Admin (locked)</span>
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-brand-100 bg-mist/40 px-3 py-2 text-xs text-ink/70">
          Your Super Admin role cannot be changed, deactivated, or converted to HR/Employee.
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {currentLoginId.toUpperCase() === 'SA001' ||
          currentEmail.toLowerCase() === 'superadmin@company.com' ? (
            <div className="space-y-2 text-sm rounded border border-mist p-3 bg-mist/20">
              <h3 className="font-medium text-ink/80">Change User ID</h3>
              <p className="text-ink/60 text-xs">
                The primary Super Admin User ID (SA001) is protected and cannot be changed.
              </p>
            </div>
          ) : (
          <form onSubmit={changeUsername} className="space-y-3 text-sm">
            <h3 className="font-medium text-ink/80">Change User ID</h3>
            <label className="block">
              <span className="text-ink/70">New User ID</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={usernameForm.username}
                onChange={(e) => setUsernameForm({ ...usernameForm, username: e.target.value })}
                required
                minLength={5}
              />
            </label>
            <label className="block">
              <span className="text-ink/70">Current password</span>
              <input
                type="password"
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={usernameForm.currentPassword}
                onChange={(e) => setUsernameForm({ ...usernameForm, currentPassword: e.target.value })}
                required
                minLength={5}
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Update User ID'}
            </button>
          </form>
          )}

          <form onSubmit={changePassword} className="space-y-3 text-sm">
            <h3 className="font-medium text-ink/80">Change Password</h3>
            <label className="block">
              <span className="text-ink/70">Current password</span>
              <input
                type="password"
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                required
                minLength={5}
              />
            </label>
            <label className="block">
              <span className="text-ink/70">New password</span>
              <input
                type="password"
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                required
                minLength={5}
              />
            </label>
            <label className="block">
              <span className="text-ink/70">Confirm new password</span>
              <input
                type="password"
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                required
                minLength={5}
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
      </section>

      <section className="space-y-3 mb-8">
        {settings.map((s) => (
          <label key={s.key} className="block text-sm">
            <span className="text-ink/70">{s.label ?? s.key}</span>
            <span className="block text-xs text-ink/40 mb-1">{s.key}</span>
            {typeof s.value === 'boolean' ? (
              <select
                className="w-full border border-brand-200 rounded px-3 py-2 bg-white"
                value={s.value ? 'true' : 'false'}
                onChange={(e) => setLocal(s.key, e.target.value === 'true')}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                className="w-full border border-brand-200 rounded px-3 py-2 bg-white"
                value={
                  Array.isArray(s.value) || typeof s.value === 'object'
                    ? JSON.stringify(s.value)
                    : String(s.value ?? '')
                }
                onChange={(e) => setLocal(s.key, parseValue(e.target.value, s.value))}
              />
            )}
          </label>
        ))}
        <button
          type="button"
          disabled={saving}
          onClick={() => save()}
          className="px-4 py-2 rounded bg-brand-600 text-white text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-2">Your 2FA</h2>
        <button
          type="button"
          onClick={() => start2fa()}
          className="text-sm px-3 py-1.5 rounded border border-brand-300 mr-2"
        >
          Setup / Reset 2FA
        </button>
        {qr && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="TOTP QR" className="w-40 h-40 border" />
            <div className="flex gap-2 mt-2">
              <input
                className="border border-brand-200 rounded px-2 py-1"
                placeholder="TOTP code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
              <button
                type="button"
                onClick={() => confirm2fa()}
                className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">Backup Destinations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            { name: 'Local Storage', enabled: true, description: 'Default — backups stored on server' },
            { name: 'Google Drive', enabled: false, description: 'Sync backups to Google Drive' },
            { name: 'OneDrive', enabled: false, description: 'Sync backups to Microsoft OneDrive' },
            { name: 'Dropbox', enabled: false, description: 'Sync backups to Dropbox' },
            { name: 'Cloud Storage (S3/GCS)', enabled: false, description: 'AWS S3 or Google Cloud Storage' },
          ].map((dest) => (
            <div key={dest.name} className="border border-brand-100 rounded-lg p-3 bg-white/70 flex items-center justify-between">
              <div>
                <p className="font-medium text-ink/80">{dest.name}</p>
                <p className="text-xs text-ink/50">{dest.description}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${dest.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-ink/40'}`}>
                {dest.enabled ? 'Active' : 'Not configured'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">Backup Format Options</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {['Database Backup (JSON)', 'Excel Export', 'PDF Export'].map((fmt) => (
            <div key={fmt} className="border border-brand-100 rounded-lg px-4 py-2 bg-white/70 text-ink/70">
              {fmt}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-display text-xl text-brand-700">Backup History</h2>
          <button
            type="button"
            onClick={() => runBackup()}
            className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white"
          >
            Run backup now
          </button>
        </div>
        {backups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-brand-100 rounded-lg overflow-hidden">
              <thead className="bg-brand-50">
                <tr>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Date</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Trigger</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Size</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-t border-brand-50">
                    <td className="px-3 py-2">{new Date(b.startedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${b.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : b.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink/60">{b.trigger}</td>
                    <td className="px-3 py-2 text-ink/60">{b.sizeBytes != null ? `${(b.sizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="px-3 py-2 text-red-600 text-xs">{b.errorMessage ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink/50 text-sm">No backups yet</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">Admin Accounts</h2>
        <p className="text-sm text-ink/60 mb-4">Super Admin can create and deactivate HR login accounts.</p>
        <ul className="space-y-2 mb-6 text-sm">
          {adminUsers.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 border border-brand-100 rounded-lg px-3 py-2">
              <div>
                <p className="font-medium">{u.displayName}</p>
                <p className="text-ink/50 text-xs">
                  {u.loginId || '—'} · {u.email || '—'} · {formatRoleLabel(u.roles[0] ?? '')} · {u.status}
                </p>
              </div>
              {u.roles.includes('HR') && u.status === 'ACTIVE' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deactivateHrUser(u.id)}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-700"
                >
                  Deactivate
                </button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={createHrUser} className="bg-white/80 border border-brand-100 rounded-lg p-4 space-y-3 text-sm">
          <h3 className="font-medium text-brand-700">Create HR account</h3>
          {(
            [
              ['email', 'Email address'],
              ['mobile', 'Mobile'],
              ['displayName', 'Display name'],
              ['password', 'Password'],
              ['confirmPassword', 'Confirm password'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-ink/70">{label}</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                type={key.includes('password') ? 'password' : 'text'}
                value={hrForm[key]}
                onChange={(e) => setHrForm({ ...hrForm, [key]: e.target.value })}
                required
                minLength={key === 'email' || key.includes('password') ? 5 : undefined}
              />
            </label>
          ))}
          <button type="submit" disabled={saving} className="bg-brand-600 text-white px-4 py-2 rounded text-sm">
            {saving ? 'Saving…' : 'Create HR account'}
          </button>
        </form>
      </section>
    </main>
  );
}
