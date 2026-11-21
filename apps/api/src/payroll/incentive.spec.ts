import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIncentiveEligible, tallyMonthAttendance, type IncentiveRules } from './incentive';

const rules: IncentiveRules = {
  enabled: true,
  amount: 500,
  maxLateMarks: 0,
  requireNoHalfDay: true,
  requireNoAbsent: true,
  requireNoUlob: true,
};
const clean = { lateMarks: 0, absentDays: 0, halfDays: 0, ulobDays: 0 };

test('clean month is eligible', () => assert.equal(isIncentiveEligible(clean, rules), true));
test('absence disqualifies', () => assert.equal(isIncentiveEligible({ ...clean, absentDays: 2 }, rules), false));
test('half day disqualifies', () => assert.equal(isIncentiveEligible({ ...clean, halfDays: 1 }, rules), false));
test('ULOB disqualifies', () => assert.equal(isIncentiveEligible({ ...clean, ulobDays: 1 }, rules), false));
test('late marks above the limit disqualify', () => {
  assert.equal(isIncentiveEligible({ ...clean, lateMarks: 1 }, rules), false);
  assert.equal(isIncentiveEligible({ ...clean, lateMarks: 2 }, { ...rules, maxLateMarks: 2 }), true);
});
test('rules can be relaxed', () =>
  assert.equal(
    isIncentiveEligible({ ...clean, absentDays: 1, halfDays: 1 }, { ...rules, requireNoAbsent: false, requireNoHalfDay: false }),
    true,
  ));
test('disabled or zero amount is never eligible', () => {
  assert.equal(isIncentiveEligible(clean, { ...rules, enabled: false }), false);
  assert.equal(isIncentiveEligible(clean, { ...rules, amount: 0 }), false);
});
test('tally counts the month from records', () =>
  assert.deepEqual(
    tallyMonthAttendance([
      { status: 'P', isLate: true },
      { status: 'L', isLate: true },
      { status: 'A' },
      { status: 'HD', isLate: true },
      { status: 'ULOB' },
      { status: 'WO' },
    ]),
    { lateMarks: 3, absentDays: 1, halfDays: 1, ulobDays: 1 },
  ));
