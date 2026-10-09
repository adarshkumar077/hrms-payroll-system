import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  lastSaturdayOfMonth,
  resolveCalendarDay,
  resolveLastSaturdayOff,
  WORKING_DAY_TAG,
} from './attendance-calendar';

describe('resolveCalendarDay — paid WO / holidays never auto-Absent', () => {
  const lastSat = { date: '2026-10-31', name: 'Last Saturday Weekly Off', isPaid: true };

  it('Sunday without check-in → WO paid', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-04',
      utcDay: 0,
      holiday: null,
      lastSaturday: lastSat,
      hasCheckIn: false,
    });
    assert.deepEqual(r, {
      autoStatus: 'WO',
      holidayName: 'Weekly Off',
      paid: true,
      holidayType: 'WEEKLY_OFF',
    });
  });

  it('Sunday WORKING_DAY override without check-in still → WO paid (never Absent)', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-04',
      utcDay: 0,
      holiday: {
        id: '1',
        name: 'Special Working Sunday',
        date: '2026-10-04',
        type: 'COMPANY',
        isPaid: true,
        systemTag: WORKING_DAY_TAG,
        dayStatus: 'WORK',
      },
      lastSaturday: lastSat,
      hasCheckIn: false,
    });
    assert.equal(r.autoStatus, 'WO');
    assert.equal(r.paid, true);
  });

  it('Festival holiday without check-in → PH paid by default', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-02',
      utcDay: 5,
      holiday: {
        id: '2',
        name: 'Gandhi Jayanti',
        date: '2026-10-02',
        type: 'FESTIVAL',
        isPaid: true,
        dayStatus: 'PH',
      },
      lastSaturday: lastSat,
      hasCheckIn: false,
    });
    assert.equal(r.autoStatus, 'PH');
    assert.equal(r.paid, true);
    assert.equal(r.holidayType, 'FESTIVAL');
  });

  it('Office holiday without check-in → PH paid by default', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-15',
      utcDay: 4,
      holiday: {
        id: '3',
        name: 'Office Closure',
        date: '2026-10-15',
        type: 'OFFICE',
        isPaid: true,
        dayStatus: 'PH',
      },
      lastSaturday: lastSat,
      hasCheckIn: false,
    });
    assert.equal(r.autoStatus, 'PH');
    assert.equal(r.paid, true);
  });

  it('Explicit unpaid festival stays unpaid', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-20',
      utcDay: 2,
      holiday: {
        id: '4',
        name: 'Unpaid fest',
        date: '2026-10-20',
        type: 'FESTIVAL',
        isPaid: false,
        dayStatus: 'PH',
      },
      lastSaturday: lastSat,
      hasCheckIn: false,
    });
    assert.equal(r.autoStatus, 'PH');
    assert.equal(r.paid, false);
  });

  it('Normal working day without holiday → no auto status', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-06',
      utcDay: 2,
      holiday: null,
      lastSaturday: lastSat,
      hasCheckIn: false,
    });
    assert.equal(r.autoStatus, null);
    assert.equal(r.holidayType, null);
  });

  it('Sunday with check-in → no auto status (punch wins)', () => {
    const r = resolveCalendarDay({
      dateKey: '2026-10-04',
      utcDay: 0,
      holiday: null,
      lastSaturday: lastSat,
      hasCheckIn: true,
    });
    assert.equal(r.autoStatus, null);
    assert.equal(r.holidayName, 'Weekly Off');
  });

  it('lastSaturdayOfMonth Oct 2026 is 31st', () => {
    assert.equal(lastSaturdayOfMonth(2026, 10), '2026-10-31');
    const off = resolveLastSaturdayOff(2026, 10, []);
    assert.equal(off.date, '2026-10-31');
    assert.equal(off.isPaid, true);
  });
});
