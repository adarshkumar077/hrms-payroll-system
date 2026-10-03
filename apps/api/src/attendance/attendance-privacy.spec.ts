import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHECK_OUT_SOURCE,
  checkOutSourceLabel,
  isDueForSystemLogout,
  nextSystemLogoutAt,
  sanitizeAttendanceRecord,
  autoCheckoutUtcForDateKey,
} from './attendance-privacy';

describe('attendance privacy sanitization', () => {
  const sample = {
    id: 'rec1',
    status: 'P',
    checkInAt: new Date('2026-09-08T04:45:00.000Z'),
    checkOutAt: new Date('2026-09-08T13:00:00.000Z'),
    checkOutSource: CHECK_OUT_SOURCE.MANUAL_OUT,
    latitude: 19.1,
    longitude: 72.8,
    selfieUrl: 'data:image/jpeg;base64,aaa',
    checkInLatitude: 19.1,
    checkInLongitude: 72.8,
    checkInAddress: 'Borivali West, Mumbai',
    checkInSelfieUrl: 'data:image/jpeg;base64,in',
    checkInMapsUrl: 'https://www.google.com/maps?q=19.1,72.8',
    checkOutLatitude: 19.2,
    checkOutLongitude: 72.9,
    checkOutAddress: 'Andheri, Mumbai',
    checkOutSelfieUrl: 'data:image/jpeg;base64,out',
    checkOutMapsUrl: 'https://www.google.com/maps?q=19.2,72.9',
    sourceNote: '{"address":"secret"}',
    punches: [
      {
        punchType: 'IN',
        latitude: 19.1,
        longitude: 72.8,
        selfieUrl: 'data:image/jpeg;base64,in',
        address: 'Borivali',
        mapsUrl: 'https://maps.example',
      },
    ],
    auditLogs: [{ action: 'MARK_IN', beforeJson: '{"lat":1}', afterJson: '{"lng":2}' }],
  };

  it('never returns selfie or GPS fields to employees', () => {
    const out = sanitizeAttendanceRecord(sample, false);
    assert.equal('latitude' in out, false);
    assert.equal('longitude' in out, false);
    assert.equal('selfieUrl' in out, false);
    assert.equal('checkInLatitude' in out, false);
    assert.equal('checkInLongitude' in out, false);
    assert.equal('checkInAddress' in out, false);
    assert.equal('checkInSelfieUrl' in out, false);
    assert.equal('checkInMapsUrl' in out, false);
    assert.equal('checkOutLatitude' in out, false);
    assert.equal('checkOutLongitude' in out, false);
    assert.equal('checkOutAddress' in out, false);
    assert.equal('checkOutSelfieUrl' in out, false);
    assert.equal('checkOutMapsUrl' in out, false);
    assert.equal('sourceNote' in out, false);
    assert.equal(out.status, 'P');
    assert.equal(out.checkOutSource, CHECK_OUT_SOURCE.MANUAL_OUT);
    assert.equal(out.checkOutLabel, 'Manual OUT');
    assert.equal('latitude' in out.punches[0], false);
    assert.equal('selfieUrl' in out.punches[0], false);
    assert.equal('address' in out.punches[0], false);
    assert.equal(out.auditLogs[0].beforeJson, null);
    assert.equal(out.auditLogs[0].afterJson, null);
  });

  it('keeps selfie and GPS for HR / Admin / Super Admin', () => {
    const out = sanitizeAttendanceRecord(sample, true);
    assert.equal(out.checkInSelfieUrl, 'data:image/jpeg;base64,in');
    assert.equal(out.checkInLatitude, 19.1);
    assert.equal(out.checkOutMapsUrl, 'https://www.google.com/maps?q=19.2,72.9');
    assert.equal(out.checkOutLabel, 'Manual OUT');
  });

  it('labels AUTO CHECKOUT for both employee and privileged views', () => {
    const rec = { ...sample, checkOutSource: CHECK_OUT_SOURCE.SYSTEM_LOGOUT };
    assert.equal(sanitizeAttendanceRecord(rec, false).checkOutLabel, 'Auto Checkout');
    assert.equal(sanitizeAttendanceRecord(rec, true).checkOutLabel, 'Auto Checkout');
    assert.equal(checkOutSourceLabel(CHECK_OUT_SOURCE.SYSTEM_LOGOUT), 'Auto Checkout');
  });
});

describe('auto checkout schedule (Asia/Kolkata 9:00 PM)', () => {
  it('uses 15:30 UTC for 9:00 PM IST', () => {
    const t = autoCheckoutUtcForDateKey('2026-09-08');
    assert.equal(t.toISOString(), '2026-09-08T15:30:00.000Z');
  });

  it('schedules 9 PM same day when checked in before 9 PM', () => {
    // 9:00 AM IST = 03:30 UTC
    const checkIn = new Date('2026-09-08T03:30:00.000Z');
    assert.equal(nextSystemLogoutAt(checkIn).toISOString(), '2026-09-08T15:30:00.000Z');
    assert.equal(isDueForSystemLogout(checkIn, new Date('2026-09-08T15:29:59.000Z')), false);
    assert.equal(isDueForSystemLogout(checkIn, new Date('2026-09-08T15:30:00.000Z')), true);
  });

  it('schedules next-day 9 PM when checked in after 9 PM', () => {
    // 9:30 PM IST = 16:00 UTC
    const checkIn = new Date('2026-09-08T16:00:00.000Z');
    assert.equal(nextSystemLogoutAt(checkIn).toISOString(), '2026-09-09T15:30:00.000Z');
    assert.equal(isDueForSystemLogout(checkIn, new Date('2026-09-08T16:05:00.000Z')), false);
    assert.equal(isDueForSystemLogout(checkIn, new Date('2026-09-09T15:30:00.000Z')), true);
  });
});
