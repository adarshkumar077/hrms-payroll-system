'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  calcDailySalary,
  calcPayrollPreview,
  calendarDaysInMonth,
  defaultPayrollConfigJson,
  normalizePayrollConfig,
  EmployeePayrollConfigJson,
  TDS_PERCENT,
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
  const [workingDays, setWorkingDays] = useState(() => {
    const n = new Date();
    return calendarDaysInMonth(n.getFullYear(), n.getMonth() + 1);
  });
  const [config, setConfig] = useState<EmployeePayrollConfigJson>(defaultPayrollConfigJson());
  const calendarDaysNow = useMemo(() => {
    const n = new Date();
    return calendarDaysInMonth(n.getFullYear(), n.getMonth() + 1);
  }, []);
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
        const days = calendarDaysNow;
        setWorkingDays(days);
        setConfig(normalizePayrollConfig(cfg.config));
        if (cfg.grossMonthly) {
          setDailySalary(String(calcDailySalary(cfg.grossMonthly, days)));
        }
        setHistory(hist);
      })
      .catch((e) => onError?.(e instanceof Error ? e.message : 'Failed to load salary config'))
      .finally(() => setLoading(false));
  }, [employeeId, onError, calendarDaysNow]);

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
              setDailySalary(v ? String(calcDailySalary(numeric, calendarDaysNow)) : '');
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">
            Per-Day Salary (Gross ÷ {calendarDaysNow} calendar days)
          </span>
          <input
            type="number"
            min={0}
            disabled
            className="mt-1 w-full rounded border border-mist px-3 py-2 bg-mist/40"
            value={dailySalary}
            step="0.01"
            readOnly
          />
          <span className="text-xs text-ink/50">
            Uses actual calendar days of the selected payroll month (incl. leap years).
          </span>
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
          <span className="text-ink/70">Calendar Days (this month)</span>
          <input
            type="number"
            disabled
            className="mt-1 w-full rounded border border-mist px-3 py-2 bg-mist/40"
            value={workingDays}
            readOnly
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
          <div className="rounded border border-mist p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={config.deductions.pf.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    deductions: {
                      ...config.deductions,
                      pf: {
                        ...config.deductions.pf,
                        enabled: e.target.checked,
                        mode: 'fixed',
                        value: e.target.checked ? config.deductions.pf.value || 3600 : config.deductions.pf.value,
                      },
                    },
                  })
                }
              />
              Enable PF Deduction
            </label>
            {config.deductions.pf.enabled && (
              <label className="mt-2 block">
                <span className="text-ink/70">Monthly PF amount (₹)</span>
                <input
                  type="number"
                  min={0}
                  disabled={!isAdmin}
                  className="mt-1 w-full rounded border border-mist px-2 py-1"
                  step="0.01"
                  value={config.deductions.pf.value ?? ''}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      deductions: {
                        ...config.deductions,
                        pf: {
                          ...config.deductions.pf,
                          mode: 'fixed',
                          value: parseMoneyInput(e.target.value),
                        },
                      },
                    })
                  }
                />
              </label>
            )}
          </div>

          <div className="rounded border border-brand-200 bg-brand-50/40 p-3">
            <p className="font-medium text-brand-800">TDS (1%) — Mandatory for every employee</p>
            <p className="text-xs text-ink/60 mt-1">
              Automatically calculated as Applicable Monthly Gross × {TDS_PERCENT}%. Cannot be disabled.
            </p>
            <p className="mt-2 text-sm">
              This month TDS preview:{' '}
              <span className="font-semibold">{money(preview.tds)}</span>
            </p>
          </div>

          <div className="rounded border border-mist p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={config.deductions.esd.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    deductions: {
                      ...config.deductions,
                      esd: {
                        ...config.deductions.esd,
                        enabled: e.target.checked,
                        amount: e.target.checked
                          ? config.deductions.esd.amount || 500
                          : config.deductions.esd.amount,
                        type: config.deductions.esd.type || 'monthly',
                      },
                    },
                  })
                }
              />
              Enable Security Deposit Deduction
            </label>
            {config.deductions.esd.enabled && (
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-ink/70">Deduction type</span>
                  <select
                    disabled={!isAdmin}
                    className="mt-1 w-full rounded border border-mist px-2 py-1"
                    value={config.deductions.esd.type ?? 'monthly'}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deductions: {
                          ...config.deductions,
                          esd: {
                            ...config.deductions.esd,
                            type: e.target.value as 'monthly' | 'one_time' | 'custom',
                          },
                        },
                      })
                    }
                  >
                    <option value="monthly">Fixed monthly amount</option>
                    <option value="one_time">One-time deduction</option>
                    <option value="custom">Custom deduction amount</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-ink/70">
                    {config.deductions.esd.type === 'one_time'
                      ? 'One-time amount (₹)'
                      : 'Amount this month (₹)'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    className="mt-1 w-full rounded border border-mist px-2 py-1"
                    step="0.01"
                    value={config.deductions.esd.amount ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deductions: {
                          ...config.deductions,
                          esd: {
                            ...config.deductions.esd,
                            amount: parseMoneyInput(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-ink/70">Total deposit target (₹)</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    className="mt-1 w-full rounded border border-mist px-2 py-1"
                    step="0.01"
                    value={config.deductions.esd.totalAmount ?? ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deductions: {
                          ...config.deductions,
                          esd: {
                            ...config.deductions.esd,
                            totalAmount: parseMoneyInput(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-ink/70">Deducted to date (₹)</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!isAdmin}
                    className="mt-1 w-full rounded border border-mist px-2 py-1"
                    step="0.01"
                    value={config.deductions.esd.deductedToDate ?? 0}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        deductions: {
                          ...config.deductions,
                          esd: {
                            ...config.deductions.esd,
                            deductedToDate: parseMoneyInput(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </label>
                <p className="sm:col-span-2 text-xs text-ink/60">
                  Remaining balance preview: {money(preview.esdRemainingBalance)} · This month
                  deduction: {money(preview.esd)}
                </p>
              </div>
            )}
          </div>

          <div className="rounded border border-mist p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={config.deductions.professionalTax.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    deductions: {
                      ...config.deductions,
                      professionalTax: {
                        ...config.deductions.professionalTax,
                        enabled: e.target.checked,
                      },
                    },
                  })
                }
              />
              Professional Tax
            </label>
            {config.deductions.professionalTax.enabled && (
              <input
                type="number"
                min={0}
                disabled={!isAdmin}
                className="mt-2 w-full rounded border border-mist px-2 py-1"
                step="0.01"
                value={config.deductions.professionalTax.amount ?? ''}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    deductions: {
                      ...config.deductions,
                      professionalTax: {
                        ...config.deductions.professionalTax,
                        amount: parseMoneyInput(e.target.value),
                      },
                    },
                  })
                }
              />
            )}
          </div>
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
          <div className="flex justify-between text-red-700"><span>- TDS (1%)</span><span>{money(preview.tds)}</span></div>
          <div className="flex justify-between text-red-700"><span>- Security Deposit</span><span>{money(preview.esd)}</span></div>
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
