'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  calcDailySalary,
  calcPayrollPreview,
  defaultPayrollConfigJson,
  normalizePayrollConfig,
  EmployeePayrollConfigJson,
} from '@/lib/payroll-calculator';

type Props = {
  employeeId: string;
  isAdmin: boolean;
  onMessage?: (msg: string) => void;
  onError?: (msg: string) => void;
};

const ALLOWANCE_FIELDS: { key: keyof EmployeePayrollConfigJson['allowances']; label: string }[] = [
  { key: 'basic', label: 'Basic Salary' },
  { key: 'hra', label: 'HRA' },
  { key: 'medical', label: 'Medical Allowance' },
  { key: 'travel', label: 'Travel Allowance' },
  { key: 'internet', label: 'Internet Allowance' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'incentive', label: 'Incentive' },
  { key: 'special', label: 'Special Allowance' },
];

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseMoneyInput(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

export function EmployeeSalaryConfig({ employeeId, isAdmin, onMessage, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grossMonthly, setGrossMonthly] = useState('');
  const [dailySalary, setDailySalary] = useState('');
  const [hourlySalary, setHourlySalary] = useState('');
  const [salaryType, setSalaryType] = useState<'MONTHLY' | 'DAILY'>('MONTHLY');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [workingDays, setWorkingDays] = useState(30);
  const [config, setConfig] = useState<EmployeePayrollConfigJson>(defaultPayrollConfigJson());
  const [history, setHistory] = useState<
    {
      year: number;
      month: number;
      netSalary: number;
      status: string;
      workingDays?: number | null;
      presentDays?: number | null;
      absentDays?: number | null;
      halfDays?: number | null;
      leaveDays?: number | null;
      grossSalary?: number;
      pf?: number;
      tds?: number;
      deposit?: number;
      professionalTax?: number;
      otherDeductions?: number;
      totalEarnings?: number;
      totalDeductions?: number;
    }[]
  >([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<{
        grossMonthly: number;
        dailySalary: number;
        hourlySalary: number | null;
        salaryType: string;
        effectiveFrom: string;
        workingDays: number;
        config: EmployeePayrollConfigJson;
      }>(`/employees/${employeeId}/payroll-config`),
      api<{ year: number; month: number; netSalary: number; status: string }[]>(
        `/employees/${employeeId}/payroll-history`,
      ).catch(() => []),
    ])
      .then(([cfg, hist]) => {
        setGrossMonthly(cfg.grossMonthly ? String(cfg.grossMonthly) : '');
        setDailySalary(
          cfg.dailySalary != null
            ? String(cfg.dailySalary)
            : cfg.grossMonthly
              ? String(calcDailySalary(cfg.grossMonthly ?? 0, cfg.workingDays ?? 30))
              : '',
        );
        setHourlySalary(cfg.hourlySalary != null ? String(cfg.hourlySalary) : '');
        setSalaryType((cfg.salaryType as 'MONTHLY' | 'DAILY') ?? 'MONTHLY');
        setEffectiveFrom(String(cfg.effectiveFrom).slice(0, 10));
        setWorkingDays(cfg.workingDays ?? 30);
        setConfig(normalizePayrollConfig(cfg.config));
        setHistory(hist);
      })
      .catch((e) => onError?.(e instanceof Error ? e.message : 'Failed to load salary config'))
      .finally(() => setLoading(false));
  }, [employeeId, onError]);

  const preview = useMemo(
    () => calcPayrollPreview({ grossMonthly: parseMoneyInput(grossMonthly), config }),
    [grossMonthly, config],
  );

  function updateAllowance(key: keyof EmployeePayrollConfigJson['allowances'], value: number) {
    if (typeof config.allowances[key] === 'number') {
      setConfig({ ...config, allowances: { ...config.allowances, [key]: value } });
    }
  }

  async function save() {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await api(`/employees/${employeeId}/payroll-config`, {
        method: 'PUT',
        body: JSON.stringify({
          grossMonthly: parseMoneyInput(grossMonthly),
          dailySalary: parseMoneyInput(dailySalary),
          hourlySalary: hourlySalary ? Number(hourlySalary) : undefined,
          salaryType,
          effectiveFrom,
          workingDays,
          allowances: config.allowances,
          deductions: config.deductions,
        }),
      });
      onMessage?.('Salary configuration saved.');
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-ink/60">Loading salary configuration…</p>;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink/70">Gross Monthly Salary</span>
          <input
            type="number"
            min={0}
            disabled={!isAdmin}
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            step="0.01"
            value={grossMonthly}
            onChange={(e) => {
              const v = e.target.value;
              const numeric = parseMoneyInput(v);
              setGrossMonthly(v);
              setDailySalary(v ? String(calcDailySalary(numeric, workingDays)) : '');
              setConfig((prev) => ({
                ...prev,
                deductions: {
                  ...prev.deductions,
                  tds: prev.deductions.tds.enabled
                    ? { ...prev.deductions.tds, mode: 'percent', value: 1 }
                    : prev.deductions.tds,
                },
              }));
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Daily Salary (auto / editable)</span>
          <input
            type="number"
            min={0}
            disabled={!isAdmin}
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            value={dailySalary}
            step="0.01"
            onChange={(e) => setDailySalary(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Hourly Salary (optional)</span>
          <input
            type="number"
            min={0}
            disabled={!isAdmin}
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            step="0.01"
            value={hourlySalary}
            onChange={(e) => setHourlySalary(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Salary Type</span>
          <select
            disabled={!isAdmin}
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            value={salaryType}
            onChange={(e) => setSalaryType(e.target.value as 'MONTHLY' | 'DAILY')}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="DAILY">Daily</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Salary Effective Date</span>
          <input
            type="date"
            disabled={!isAdmin}
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Working Days / Month</span>
          <input
            type="number"
            min={1}
            disabled={!isAdmin}
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            value={workingDays}
            onChange={(e) => {
              const wd = Number(e.target.value) || 30;
              setWorkingDays(wd);
              setDailySalary(grossMonthly ? String(calcDailySalary(parseMoneyInput(grossMonthly), wd)) : '');
            }}
          />
        </label>
      </div>

      <section>
        <h3 className="text-sm font-medium text-brand-700 mb-2">Allowances</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {ALLOWANCE_FIELDS.map(({ key, label }) => (
            <label key={key} className="block text-sm">
              <span className="text-ink/70">{label}</span>
              <input
                type="number"
                min={0}
                disabled={!isAdmin}
                className="mt-1 w-full rounded border border-mist px-3 py-2"
                step="0.01"
                value={(config.allowances[key] as number) || ''}
                onChange={(e) => updateAllowance(key, parseMoneyInput(e.target.value))}
              />
            </label>
          ))}
        </div>
        {isAdmin && (
          <button
            type="button"
            className="mt-2 text-sm text-brand-600"
            onClick={() =>
              setConfig({
                ...config,
                allowances: {
                  ...config.allowances,
                  custom: [...config.allowances.custom, { name: '', amount: 0 }],
                },
              })
            }
          >
            + Add custom allowance
          </button>
        )}
        {(config.allowances.custom ?? []).map((c, i) => (
          <div key={i} className="mt-2 grid grid-cols-2 gap-2">
            <input
              className="rounded border border-mist px-3 py-2 text-sm"
              placeholder="Allowance name"
              disabled={!isAdmin}
              value={c.name}
              onChange={(e) => {
                const custom = [...config.allowances.custom];
                custom[i] = { ...c, name: e.target.value };
                setConfig({ ...config, allowances: { ...config.allowances, custom } });
              }}
            />
            <input
              type="number"
              className="rounded border border-mist px-3 py-2 text-sm"
              disabled={!isAdmin}
              value={c.amount || ''}
              onChange={(e) => {
                const custom = [...config.allowances.custom];
                custom[i] = { ...c, amount: parseMoneyInput(e.target.value) };
                setConfig({ ...config, allowances: { ...config.allowances, custom } });
              }}
            />
          </div>
        ))}
      </section>

      <section>
        <h3 className="text-sm font-medium text-brand-700 mb-2">Deductions</h3>
        <div className="space-y-3 text-sm">
          {(
            [
              ['pf', 'Provident Fund (PF)'],
              ['tds', 'TDS'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="rounded border border-mist p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={config.deductions[key].enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      deductions: {
                        ...config.deductions,
                        [key]: {
                          ...config.deductions[key],
                          enabled: e.target.checked,
                          mode: key === 'pf' ? 'fixed' : 'percent',
                          value: key === 'pf' ? 3600 : 1,
                        },
                      },
                    })
                  }
                />
                {label}
              </label>
              {config.deductions[key].enabled && (
                <div className="mt-2 flex gap-2">
                  <select
                    disabled={!isAdmin}
                    className="rounded border border-mist px-2 py-1"
                    value={config.deductions[key].mode ?? 'percent'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deductions: {
                          ...config.deductions,
                          [key]: {
                            ...config.deductions[key],
                            mode: e.target.value as 'percent' | 'fixed',
                          },
                        },
                      })
                    }
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    className="flex-1 rounded border border-mist px-2 py-1"
                    step="0.01"
                    value={config.deductions[key].value ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deductions: {
                          ...config.deductions,
                          [key]: {
                            ...config.deductions[key],
                            value: parseMoneyInput(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </div>
              )}
            </div>
          ))}
          {(
            [
              ['esd', 'Employee Security Deposit'],
              ['professionalTax', 'Professional Tax'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="rounded border border-mist p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={config.deductions[key].enabled}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      deductions: {
                        ...config.deductions,
                        [key]: {
                          ...config.deductions[key],
                          enabled: e.target.checked,
                          amount:
                            key === 'esd' && e.target.checked
                              ? 500
                              : config.deductions[key].amount,
                        },
                      },
                    })
                  }
                />
                {label}
              </label>
              {config.deductions[key].enabled && (
                <input
                  type="number"
                  min={0}
                  disabled={!isAdmin}
                  className="mt-2 w-full rounded border border-mist px-2 py-1"
                  step="0.01"
                  value={config.deductions[key].amount ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      deductions: {
                        ...config.deductions,
                        [key]: {
                          ...config.deductions[key],
                          amount: parseMoneyInput(e.target.value),
                        },
                      },
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <button
            type="button"
            className="mt-2 text-sm text-brand-600"
            onClick={() =>
              setConfig({
                ...config,
                deductions: {
                  ...config.deductions,
                  custom: [...config.deductions.custom, { name: '', amount: 0, description: '' }],
                },
              })
            }
          >
            + Add other deduction
          </button>
        )}
        {config.deductions.custom.map((c, i) => (
          <div key={i} className="mt-2 grid grid-cols-3 gap-2">
            <input
              className="rounded border border-mist px-3 py-2 text-sm"
              placeholder="Name"
              disabled={!isAdmin}
              value={c.name}
              onChange={(e) => {
                const custom = [...config.deductions.custom];
                custom[i] = { ...c, name: e.target.value };
                setConfig({ ...config, deductions: { ...config.deductions, custom } });
              }}
            />
            <input
              type="number"
              className="rounded border border-mist px-3 py-2 text-sm"
              disabled={!isAdmin}
              value={c.amount || ''}
              onChange={(e) => {
                const custom = [...config.deductions.custom];
                custom[i] = { ...c, amount: parseMoneyInput(e.target.value) };
                setConfig({ ...config, deductions: { ...config.deductions, custom } });
              }}
            />
            <input
              className="rounded border border-mist px-3 py-2 text-sm"
              placeholder="Description"
              disabled={!isAdmin}
              value={c.description ?? ''}
              onChange={(e) => {
                const custom = [...config.deductions.custom];
                custom[i] = { ...c, description: e.target.value };
                setConfig({ ...config, deductions: { ...config.deductions, custom } });
              }}
            />
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-brand-200 bg-mist/30 p-4 text-sm">
        <h3 className="font-medium text-brand-700 mb-3">Live Salary Preview</h3>
        <div className="space-y-1">
          <div className="flex justify-between"><span>Gross Salary</span><span>{money(preview.grossSalary)}</span></div>
          <div className="flex justify-between text-green-700"><span>+ Total Allowances</span><span>{money(preview.totalAllowances)}</span></div>
          <div className="flex justify-between text-red-700"><span>- PF</span><span>{money(preview.pf)}</span></div>
          <div className="flex justify-between text-red-700"><span>- TDS</span><span>{money(preview.tds)}</span></div>
          <div className="flex justify-between text-red-700"><span>- Employee Security Deposit</span><span>{money(preview.esd)}</span></div>
          <div className="flex justify-between text-red-700"><span>- Professional Tax</span><span>{money(preview.professionalTax)}</span></div>
          <div className="flex justify-between text-red-700"><span>- Other Deductions</span><span>{money(preview.otherDeductions)}</span></div>
          <div className="border-t border-mist my-2" />
          <div className="flex justify-between font-semibold text-brand-700">
            <span>Final Net Salary</span><span>{money(preview.netSalary)}</span>
          </div>
        </div>
      </section>

      {isAdmin && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save salary configuration'}
        </button>
      )}

      {history.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-brand-700 mb-2">Payroll History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left bg-mist/50">
                <tr>
                  <th className="px-2 py-1">Month</th>
                  <th className="px-2 py-1">Working</th>
                  <th className="px-2 py-1">Present</th>
                  <th className="px-2 py-1">Absent</th>
                  <th className="px-2 py-1">Gross</th>
                  <th className="px-2 py-1">Deductions</th>
                  <th className="px-2 py-1">Net</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={`${h.year}-${h.month}`} className="border-t border-mist">
                    <td className="px-2 py-1">{h.month}/{h.year}</td>
                    <td className="px-2 py-1">{h.workingDays ?? '—'}</td>
                    <td className="px-2 py-1">{h.presentDays ?? '—'}</td>
                    <td className="px-2 py-1">{h.absentDays ?? '—'}</td>
                    <td className="px-2 py-1">{money(h.grossSalary ?? h.totalEarnings ?? 0)}</td>
                    <td className="px-2 py-1 text-red-700">{money(h.totalDeductions ?? 0)}</td>
                    <td className="px-2 py-1 font-medium">{money(h.netSalary)}</td>
                    <td className="px-2 py-1">{h.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
