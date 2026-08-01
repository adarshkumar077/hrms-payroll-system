'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredUser, updateStoredUser } from '@/lib/api';
import { getHomePathForUser } from '@/lib/home';

function ChangePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const required = searchParams.get('required') === 'true' || !!getStoredUser()?.forcePasswordChange;
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!getStoredUser()) router.replace('/');
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    if (form.newPassword !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api('/auth/password/change', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          confirmPassword: form.confirmPassword,
        }),
      });
      const nextUser = updateStoredUser({ forcePasswordChange: false });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMsg('Password updated successfully.');
      if (nextUser) {
        router.replace(getHomePathForUser(nextUser));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <h1 className="font-display text-2xl text-brand-700 mb-2">Change password</h1>
      {required && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          For security, you must set a new password before continuing.
        </p>
      )}
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      {msg && <p className="text-sm text-brand-700 mb-3">{msg}</p>}
      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <label className="block text-sm">
          <span className="text-ink/70">Current password</span>
          <input
            className="input mt-1.5 w-full"
            type="password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">New password</span>
          <input
            className="input mt-1.5 w-full"
            type="password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            required
            minLength={5}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Confirm new password</span>
          <input
            className="input mt-1.5 w-full"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
            minLength={5}
          />
        </label>
        <div className="flex gap-2 justify-end pt-2">
          {!required && (
            <Link href="/dashboard" className="px-4 py-2 text-sm text-ink/60">
              Cancel
            </Link>
          )}
          <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </main>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-md mx-auto px-4 py-10">
          <p className="text-sm text-ink/60">Loading…</p>
        </main>
      }
    >
      <ChangePasswordForm />
    </Suspense>
  );
}
