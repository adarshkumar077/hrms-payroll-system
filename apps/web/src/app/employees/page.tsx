'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import {
  EMPLOYEE_CODE_EXISTS_MSG,
  EMPLOYMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  sanitizeMobileInput,
  validateEmployeeForm,
} from '@/lib/form-utils';
import {
  calcDailySalary,
  calcPayrollPreview,
  defaultPayrollConfigJson,
} from '@/lib/payroll-calculator';

type EmployeeRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  department?: string | null;
  designation?: string | null;
  status: string;
  isActive: boolean;
};

type CreateEmployeeResponse = EmployeeRow & {
  loginCredentials?: {
    employeeCode: string;
    username: string;
    passwordDelivered?: boolean;
  };
};

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function parseMoneyInput(value: string | number) {
  if (typeof value === 'number') return value;
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

const emptyForm = () => ({
  employeeCode: '',
  codeEntryMode: 'manual' as 'manual' | 'auto',
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  gender: '',
  employmentType: '',
  department: '',
  designation: '',
  username: '',
  password: '',
  confirmPassword: '',
  grossMonthly: '',
  dailySalary: '',
  salaryType: 'MONTHLY' as 'MONTHLY' | 'DAILY',
  salaryEffectiveFrom: new Date().toISOString().slice(0, 10),
  workingDays: 30,
  payrollConfig: defaultPayrollConfigJson(),
});

export default function EmployeesPage() {
  const router = useRouter();
  const [items, setItems] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    employeeCode: string;
    username: string;
    password: string;
    id: string;
  } | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showInactive, setShowInactive] = useState(false);

  const salaryPreview = useMemo(
    () => calcPayrollPreview({ grossMonthly: parseMoneyInput(form.grossMonthly), config: form.payrollConfig }),
    [form.grossMonthly, form.payrollConfig],
  );

  function load(q = search) {
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (!showInactive) params.set('isActive', 'true');
    api<{ items: EmployeeRow[]; total: number }>(`/employees?${params}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  async function openCreateForm() {
    setError('');
    setFieldErrors({});
    setShowPassword(false);
    setForm(emptyForm());
    setShowCreate(true);
  }

  async function generateEmployeeCode() {
    try {
      const res = await api<{ employeeCode: string }>('/employees/next-code');
      setForm((prev) => ({
        ...prev,
        employeeCode: res.employeeCode,
        codeEntryMode: 'auto',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate Employee Code');
    }
  }

  async function assertUniqueEmployeeCode(code: string) {
    try {
      const res = await api<{ available: boolean }>(
        `/employees/check-code?code=${encodeURIComponent(code.trim())}`,
      );
      if (!res.available) {
        setFieldErrors({ employeeCode: EMPLOYEE_CODE_EXISTS_MSG });
        setError(EMPLOYEE_CODE_EXISTS_MSG);
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify Employee Code');
      return false;
    }
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN', 'ADMIN', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    setIsAdmin(u.roles.includes('SUPER_ADMIN') || u.roles.includes('HR'));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, showInactive]);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (!isAdmin) {
      setError('Only Super Admin or HR can add employees');
      return;
    }

    const errors = validateEmployeeForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Please fix the highlighted fields before saving.');
      return;
    }
    if (form.username.trim() && form.username.trim().length < 5) {
      setError('Username must be at least 5 characters.');
      return;
    }
    if (form.password.length < 5) {
      setError('Password must be at least 5 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setCreating(true);
    try {
      if (!(await assertUniqueEmployeeCode(form.employeeCode))) return;

      const created = await api<CreateEmployeeResponse>('/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: form.employeeCode.trim(),
          firstName: form.firstName,
          lastName: form.lastName || undefined,
          email: form.email || undefined,
          mobile: form.mobile,
          gender: form.gender,
          department: form.department || undefined,
          designation: form.designation || undefined,
          employment: form.employmentType ? { employmentType: form.employmentType } : undefined,
          username: form.username || undefined,
          password: form.password,
          confirmPassword: form.confirmPassword,
          createLogin: true,
        }),
      });

      const grossMonthly = parseMoneyInput(form.grossMonthly);
      const dailySalary = parseMoneyInput(form.dailySalary);
      let salaryWarning = '';
      if (grossMonthly > 0) {
        try {
          await api(`/employees/${created.id}/payroll-config`, {
            method: 'PUT',
            body: JSON.stringify({
              grossMonthly,
              dailySalary: dailySalary || calcDailySalary(grossMonthly, form.workingDays),
              salaryType: form.salaryType,
              effectiveFrom: form.salaryEffectiveFrom,
              workingDays: form.workingDays,
              allowances: form.payrollConfig.allowances,
              deductions: form.payrollConfig.deductions,
            }),
          });
        } catch (payrollErr) {
          salaryWarning =
            payrollErr instanceof Error
              ? `Employee created, but salary setup failed: ${payrollErr.message}`
              : 'Employee created, but salary setup failed. Configure salary from the employee profile.';
        }
      }

      setShowCreate(false);
      setForm(emptyForm());
      load();
      const creds = created.loginCredentials;
      const pwdUsed = form.password;
      if (creds && pwdUsed) {
        setCreatedCredentials({
          employeeCode: creds.employeeCode,
          username: creds.username,
          password: pwdUsed,
          id: created.id,
        });
      }
      if (salaryWarning) setError(salaryWarning);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      if (msg.includes('Employee Code already exists')) {
        setFieldErrors({ employeeCode: EMPLOYEE_CODE_EXISTS_MSG });
      }
      if (msg.toLowerCase().includes('mobile')) {
        setFieldErrors((prev) => ({ ...prev, mobile: msg }));
      }
      if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('username')) {
        setFieldErrors((prev) => ({
          ...prev,
          ...(form.username ? { username: msg } : { email: msg }),
        }));
      }
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  async function removeEmployee(row: EmployeeRow) {
    if (!isAdmin) return;
    const ok = window.confirm(
      `Remove ${row.firstName} ${row.lastName ?? ''} (${row.employeeCode}) from the active employee list?\n\nTheir login access will be disabled.`,
    );
    if (!ok) return;
    setRemovingId(row.id);
    setError('');
    try {
      await api(`/employees/${row.id}?reason=${encodeURIComponent('Removed by HR from active employee list')}`, {
        method: 'DELETE',
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="font-display text-3xl text-brand-700 mt-2">Employee Directory</h1>
          <p className="text-sm text-ink/60">
            {total} employee{total === 1 ? '' : 's'}
            {!showInactive ? ' (active only)' : ' (including inactive)'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreateForm}
            className="bg-brand-600 text-white px-4 py-2 rounded"
          >
            Add employee
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          className="flex-1 min-w-[200px] rounded border border-mist px-3 py-2 bg-white"
          placeholder="Search code, name, email, department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button type="button" onClick={() => load()} className="px-4 py-2 rounded bg-white border border-mist">
          Search
        </button>
        <label className="flex items-center gap-2 text-sm text-ink/70 px-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {error && <p className="text-red-700 mb-4 text-sm">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white/80">
        <table className="w-full text-sm">
          <thead className="bg-mist/60 text-left">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Designation</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Contact</th>
              {isAdmin && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-3 py-8 text-center text-ink/50">
                  No employees yet.
                  {isAdmin ? ' Click Add employee to onboard the first person.' : ''}
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-mist hover:bg-mist/30">
                  <td className="px-3 py-2">
                    <Link href={`/employees/${row.id}`} className="text-brand-600 font-medium hover:underline">
                      {row.employeeCode}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="px-3 py-2">{row.department ?? '—'}</td>
                  <td className="px-3 py-2">{row.designation ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${row.isActive ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-600'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink/70">{row.email ?? row.mobile ?? '—'}</td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/employees/${row.id}`} className="text-xs text-brand-700 hover:underline">
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={removingId === row.id}
                          onClick={() => removeEmployee(row)}
                          className="text-xs text-red-700 hover:underline disabled:opacity-60"
                        >
                          {removingId === row.id ? 'Removing…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && isAdmin && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={createEmployee}
            className="bg-white rounded-lg p-6 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <h2 className="font-display text-xl text-brand-700">Add employee</h2>
            <p className="text-xs text-ink/60">
              Login credentials are created only after you save. The employee cannot sign in until then.
            </p>
            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <label className="block text-sm">
              <span className="text-ink/70">Employee Code *</span>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="codeEntryMode"
                    checked={form.codeEntryMode === 'manual'}
                    onChange={() => setForm({ ...form, codeEntryMode: 'manual' })}
                  />
                  Manual Entry
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="codeEntryMode"
                    checked={form.codeEntryMode === 'auto'}
                    onChange={() => {
                      setForm({ ...form, codeEntryMode: 'auto' });
                      void generateEmployeeCode();
                    }}
                  />
                  Auto Generate
                </label>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className={`flex-1 rounded border px-3 py-2 ${fieldErrors.employeeCode ? 'border-red-400' : 'border-mist'}`}
                  value={form.employeeCode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      employeeCode: e.target.value,
                      codeEntryMode: 'manual',
                    })
                  }
                  placeholder="Enter a unique Employee Code"
                  required
                />
                {form.codeEntryMode === 'auto' && (
                  <button
                    type="button"
                    className="px-3 py-2 text-xs rounded border border-mist bg-white whitespace-nowrap"
                    onClick={() => void generateEmployeeCode()}
                  >
                    Regenerate
                  </button>
                )}
              </div>
              {fieldErrors.employeeCode && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.employeeCode}</p>
              )}
            </label>

            {(
              [
                ['firstName', 'First name', true],
                ['lastName', 'Last name', false],
                ['email', 'Email', false],
                ['mobile', 'Mobile', true],
                ['department', 'Department', false],
                ['designation', 'Designation', false],
                ['username', 'Username / Employee Login ID', false],
              ] as const
            ).map(([key, label, required]) => (
              <label key={key} className="block text-sm">
                <span className="text-ink/70">{label}{required ? ' *' : ''}</span>
                <input
                  className={`mt-1 w-full rounded border px-3 py-2 ${fieldErrors[key] ? 'border-red-400' : 'border-mist'}`}
                  value={form[key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [key]: key === 'mobile' ? sanitizeMobileInput(e.target.value) : e.target.value,
                    })
                  }
                  required={required}
                  minLength={key === 'username' ? 5 : undefined}
                  maxLength={key === 'mobile' ? 10 : undefined}
                  inputMode={key === 'mobile' ? 'numeric' : undefined}
                />
                {fieldErrors[key] && <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p>}
              </label>
            ))}

            <label className="block text-sm">
              <span className="text-ink/70">Gender *</span>
              <select
                className={`mt-1 w-full rounded border px-3 py-2 ${fieldErrors.gender ? 'border-red-400' : 'border-mist'}`}
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
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
              <span className="text-ink/70">Employee type</span>
              <select
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
              >
                <option value="">Select type</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <div className="border-t border-mist pt-3 mt-2">
              <h3 className="text-sm font-medium text-brand-700 mb-2">Salary setup (optional)</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-ink/70">Gross Monthly Salary</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full rounded border border-mist px-3 py-2"
                    value={form.grossMonthly}
                    onChange={(e) => {
                      const grossMonthly = e.target.value;
                      const numericGross = parseMoneyInput(grossMonthly);
                      setForm({
                        ...form,
                        grossMonthly,
                        dailySalary: grossMonthly ? String(calcDailySalary(numericGross, form.workingDays)) : '',
                      });
                    }}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink/70">Daily Salary</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full rounded border border-mist px-3 py-2"
                    value={form.dailySalary}
                    onChange={(e) => setForm({ ...form, dailySalary: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink/70">Salary Type</span>
                  <select
                    className="mt-1 w-full rounded border border-mist px-3 py-2"
                    value={form.salaryType}
                    onChange={(e) => setForm({ ...form, salaryType: e.target.value as 'MONTHLY' | 'DAILY' })}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="DAILY">Daily</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-ink/70">Salary Effective Date</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded border border-mist px-3 py-2"
                    value={form.salaryEffectiveFrom}
                    onChange={(e) => setForm({ ...form, salaryEffectiveFrom: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {(['pf', 'tds', 'esd'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={
                        key === 'esd'
                          ? form.payrollConfig.deductions.esd.enabled
                          : form.payrollConfig.deductions[key].enabled
                      }
                      onChange={(e) => {
                        const payrollConfig = { ...form.payrollConfig, deductions: { ...form.payrollConfig.deductions } };
                        if (key === 'esd') {
                          payrollConfig.deductions.esd = {
                            ...payrollConfig.deductions.esd,
                            enabled: e.target.checked,
                            amount: e.target.checked ? 500 : payrollConfig.deductions.esd.amount,
                          };
                        } else {
                          payrollConfig.deductions[key] = {
                            ...payrollConfig.deductions[key],
                            enabled: e.target.checked,
                            mode: key === 'pf' ? 'fixed' : 'percent',
                            value: key === 'pf' ? 3600 : 1,
                          };
                        }
                        setForm({ ...form, payrollConfig });
                      }}
                    />
                    {key === 'pf' ? 'Enable PF' : key === 'tds' ? 'Enable TDS' : 'Enable Deposit'}
                  </label>
                ))}
              </div>
              {parseMoneyInput(form.grossMonthly) > 0 && (
                <div className="mt-3 rounded border border-brand-100 bg-mist/30 p-3 text-sm">
                  <div className="flex justify-between"><span>Gross Salary</span><span>₹{salaryPreview.grossSalary.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between text-green-700"><span>+ Allowances</span><span>₹{salaryPreview.totalAllowances.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between text-red-700"><span>- Deductions</span><span>₹{salaryPreview.totalDeductions.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between font-semibold text-brand-700 mt-1"><span>Net Salary</span><span>₹{salaryPreview.netSalary.toLocaleString('en-IN')}</span></div>
                </div>
              )}
              <p className="text-xs text-ink/50 mt-2">Full allowances and deductions can be configured on the employee Salary tab after creation.</p>
            </div>

            <label className="block text-sm">
              <span className="text-ink/70">Password</span>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded border border-mist px-3 py-2"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={5}
                />
                <button
                  type="button"
                  className="px-3 py-2 text-xs rounded border border-mist bg-white"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 text-xs rounded border border-mist bg-white"
                  onClick={() => {
                    const pwd = generateRandomPassword();
                    setForm({ ...form, password: pwd, confirmPassword: pwd });
                    setShowPassword(true);
                  }}
                >
                  Generate
                </button>
              </div>
            </label>

            <label className="block text-sm">
              <span className="text-ink/70">Confirm password</span>
              <input
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                type={showPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
                minLength={5}
              />
            </label>

            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
              >
                {creating ? 'Saving…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {createdCredentials && (
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md space-y-4">
            <h2 className="font-display text-xl text-brand-700">Employee Created</h2>
            <p className="text-sm text-ink/70">
              Save these credentials — the password will not be shown again.
            </p>
            <div className="bg-mist/40 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-ink/60">User ID (use this to login)</span>
                <span className="font-mono font-medium text-brand-700">
                  {createdCredentials.employeeCode}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink/60">Email / username</span>
                <span className="font-medium break-all">{createdCredentials.username}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink/60">Temporary password</span>
                <span className="font-mono font-medium text-brand-700">{createdCredentials.password}</span>
              </div>
            </div>
            <p className="text-xs text-ink/50">
              Login at the home page with User ID <strong>{createdCredentials.employeeCode}</strong> or
              the email above, then the temporary password. A password change is required on first login.
            </p>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="px-4 py-2 rounded text-sm border border-mist"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const employeeId = createdCredentials.id;
                  setCreatedCredentials(null);
                  router.push(`/employees/${employeeId}?tab=Salary`);
                }}
                className="bg-white border border-brand-200 text-brand-700 px-4 py-2 rounded text-sm"
              >
                Configure Salary →
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = createdCredentials.id;
                  setCreatedCredentials(null);
                  router.push(`/employees/${id}`);
                }}
                className="bg-brand-600 text-white px-4 py-2 rounded text-sm"
              >
                Go to Employee Profile →
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
