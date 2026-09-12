'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import {
  ModuleAlert,
  ModuleButton,
  ModuleInput,
  ModuleList,
  ModuleListItem,
  ModulePage,
  ModuleSecondaryButton,
  ModuleSection,
  ModuleSelect,
  StatusPill,
} from '@/components/layout/ModulePage';

type ManagedUser = {
  id: string;
  loginId: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  employee?: { employeeCode: string; firstName: string; lastName: string } | null;
  lastLoginAt?: string | null;
  protected: boolean;
};

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE'] as const;

export default function UserControlPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('EMPLOYEE');

  function load() {
    api<ManagedUser[]>('/admin/users')
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!isSuperAdmin(u) && !u.roles.includes('ADMIN')) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [router]);

  async function createUser() {
    setError('');
    setMessage('');
    try {
      await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({ loginId, email, displayName, password, confirmPassword: password, role }),
      });
      setMessage('User created');
      setLoginId('');
      setEmail('');
      setDisplayName('');
      setPassword('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function toggleActive(u: ManagedUser) {
    if (u.protected) return;
    const path = u.status === 'ACTIVE' ? 'deactivate' : 'activate';
    await api(`/admin/users/${u.id}/${path}`, { method: 'POST', body: '{}' });
    load();
  }

  async function resetPassword(id: string) {
    const pwd = prompt('New password (min 8 chars):');
    if (!pwd) return;
    await api(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password: pwd, confirmPassword: pwd }),
    });
    setMessage('Password reset');
  }

  async function changeRole(id: string, next: string) {
    await api(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: next }),
    });
    load();
  }

  async function permanentDelete(id: string, name: string) {
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    await api(`/admin/users/${id}/permanent`, { method: 'DELETE' });
    setMessage('User permanently deleted');
    load();
  }

  return (
    <ModulePage title="User Control" subtitle="Create, manage, and permanently delete accounts">
      {message && <ModuleAlert type="success">{message}</ModuleAlert>}
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      {isSuperAdmin(getStoredUser()) && (
      <ModuleSection>
        <p className="font-medium text-ink/80">Create user</p>
        <div className="grid gap-2 md:grid-cols-2">
          <ModuleInput placeholder="Login ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
          <ModuleInput placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <ModuleInput placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <ModuleInput type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <ModuleSelect value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </ModuleSelect>
        </div>
        <ModuleButton type="button" onClick={createUser}>
          Create user
        </ModuleButton>
      </ModuleSection>
      )}

      <ModuleList>
        {users.map((u) => (
          <ModuleListItem key={u.id}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-medium">
                  {u.displayName} · {u.loginId}
                  {u.protected && <span className="text-xs text-amber-700 ml-2">(protected)</span>}
                </p>
                <p className="text-ink/50 text-xs">
                  {u.email} · {u.roles.join(', ')} · {u.status}
                  {u.employee ? ` · ${u.employee.employeeCode}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <StatusPill tone={u.status === 'ACTIVE' ? 'success' : 'warn'}>{u.status}</StatusPill>
                {!u.protected && (
                  <>
                    <ModuleSelect
                      className="w-auto text-xs py-1"
                      value={u.roles[0] ?? 'EMPLOYEE'}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                    >
                      {ROLES.filter((r) => r !== 'SUPER_ADMIN' || u.roles.includes('SUPER_ADMIN')).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </ModuleSelect>
                    <ModuleSecondaryButton type="button" onClick={() => toggleActive(u)}>
                      {u.status === 'ACTIVE' ? 'Disable' : 'Activate'}
                    </ModuleSecondaryButton>
                    <ModuleSecondaryButton type="button" onClick={() => resetPassword(u.id)}>
                      Reset pwd
                    </ModuleSecondaryButton>
                    <button
                      type="button"
                      className="text-xs text-red-700 border border-red-200 px-2 py-1 rounded"
                      onClick={() => permanentDelete(u.id, u.displayName)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </ModuleListItem>
        ))}
      </ModuleList>
    </ModulePage>
  );
}
