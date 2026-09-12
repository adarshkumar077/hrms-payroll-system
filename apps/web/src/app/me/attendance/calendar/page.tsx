'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { ModuleAlert, ModulePage, ModuleSecondaryButton } from '@/components/layout/ModulePage';
import { Card } from '@/components/ui/Card';

type CalendarDay = {
  date: string;
  dayOfWeek: number;
  status: string;
  isToday: boolean;
  isWeekOff: boolean;
  isHoliday: boolean;
  holidayName?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkOutSource?: string | null;
  checkOutLabel?: string | null;
  workMinutes?: number | null;
  remarks?: string | null;
};

type CalendarResponse = {
  year: number;
  month: number;
  days: CalendarDay[];
  summary: {
    present: number;
    absent: number;
    late: number;
    halfDays: number;
    paidLeaves: number;
    wfh: number;
    holidays: number;
    weekOffs: number;
    totalWorkingDays: number;
  };
};

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  P: { label: 'Present', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  A: { label: 'Absent', color: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  L: { label: 'Late', color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  HD: { label: 'Half Day', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  PL: { label: 'Paid Leave', color: 'bg-sky-100 text-sky-800', dot: 'bg-sky-500' },
  WFH: { label: 'WFH', color: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  WO: { label: 'Week Off', color: 'bg-ink-100 text-ink-600', dot: 'bg-ink-300' },
  H: { label: 'Holiday', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  ULOB: { label: 'ULOB', color: 'bg-ink-800 text-white', dot: 'bg-ink-900' },
  OD: { label: 'OD', color: 'bg-amber-100 text-amber-900', dot: 'bg-amber-700' },
  NONE: { label: 'No Record', color: 'bg-white text-ink-500 ring-1 ring-ink-200', dot: 'bg-ink-200' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatHours(minutes?: number | null) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function AttendanceCalendarPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [selected, setSelected] = useState<CalendarDay | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<CalendarResponse>(`/me/attendance/calendar?year=${year}&month=${month}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [year, month]);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace('/');
      return;
    }
    if (!user.employeeId) {
      setError('No employee profile linked to your account.');
      return;
    }
    load();
  }, [router, load]);

  const monthLabel = useMemo(
    () => new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    [year, month],
  );

  const gridCells = useMemo(() => {
    if (!data) return [];
    const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const blanks = Array.from({ length: firstDow }, (_, i) => ({ key: `b-${i}`, blank: true as const }));
    const days = data.days.map((d) => ({ key: d.date, blank: false as const, day: d }));
    return [...blanks, ...days];
  }, [data, year, month]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelected(null);
  }

  return (
    <ModulePage title="My Attendance Calendar" subtitle="Monthly view of your attendance, leaves, and holidays">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
            {[
              ['Present', data.summary.present],
              ['Absent', data.summary.absent],
              ['Late', data.summary.late],
              ['Half Days', data.summary.halfDays],
              ['Paid Leaves', data.summary.paidLeaves],
              ['WFH', data.summary.wfh],
              ['Holidays', data.summary.holidays],
              ['Week Offs', data.summary.weekOffs],
            ].map(([label, value]) => (
              <Card key={label} className="p-3 text-center">
                <p className="text-xs text-ink-500">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <ModuleSecondaryButton type="button" onClick={() => shiftMonth(-1)}>← Previous</ModuleSecondaryButton>
              <h2 className="font-semibold">{monthLabel}</h2>
              <ModuleSecondaryButton type="button" onClick={() => shiftMonth(1)}>Next →</ModuleSecondaryButton>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-ink-500 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {gridCells.map((cell) => {
                if (cell.blank) return <div key={cell.key} />;
                const day = cell.day;
                const meta = STATUS_META[day.status] ?? STATUS_META.NONE;
                const dayNum = Number(day.date.slice(8, 10));
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelected(day)}
                    className={`aspect-square rounded-xl p-2 text-left transition ring-1 ${meta.color} ${
                      day.isToday ? 'ring-2 ring-brand-500' : 'ring-ink-200/60'
                    } hover:shadow-sm`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{dayNum}</span>
                      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 mt-6 text-xs">
              {Object.entries(STATUS_META).filter(([k]) => k !== 'NONE').map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
                  {v.label}
                </span>
              ))}
            </div>
          </Card>

          {selected && (
            <Card className="p-4 mt-4">
              <h3 className="font-semibold mb-2">
                {new Date(selected.date).toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </h3>
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div><dt className="text-ink-500">Status</dt><dd>{(STATUS_META[selected.status] ?? STATUS_META.NONE).label}</dd></div>
                <div><dt className="text-ink-500">Check-in</dt><dd>{formatTime(selected.checkInAt)}</dd></div>
                <div><dt className="text-ink-500">Check-out</dt><dd>{formatTime(selected.checkOutAt)}</dd></div>
                {selected.checkOutLabel && (
                  <div><dt className="text-ink-500">OUT source</dt><dd>{selected.checkOutLabel}</dd></div>
                )}
                <div><dt className="text-ink-500">Working hours</dt><dd>{formatHours(selected.workMinutes)}</dd></div>
                {selected.holidayName && (
                  <div><dt className="text-ink-500">Holiday</dt><dd>{selected.holidayName}</dd></div>
                )}
                {selected.remarks && (
                  <div className="md:col-span-2"><dt className="text-ink-500">Remarks</dt><dd>{selected.remarks}</dd></div>
                )}
              </dl>
            </Card>
          )}
        </>
      )}
    </ModulePage>
  );
}
