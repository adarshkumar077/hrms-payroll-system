import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  annotateLateCycle,
  aggregateEmployeeMonth,
  displayDailyEarning,
  lateMarksToHalfDays,
} from './late-conversion';

describe('late-conversion cycle', () => {
  it('maps 3/6/9/12 lates to 1/2/3/4 half days', () => {
    assert.deepEqual(lateMarksToHalfDays(3), {
      lateMarks: 3,
      convertedHd: 1,
      remainingLate: 0,
      threshold: 3,
    });
    assert.deepEqual(lateMarksToHalfDays(6), {
      lateMarks: 6,
      convertedHd: 2,
      remainingLate: 0,
      threshold: 3,
    });
    assert.deepEqual(lateMarksToHalfDays(9), {
      lateMarks: 9,
      convertedHd: 3,
      remainingLate: 0,
      threshold: 3,
    });
    assert.deepEqual(lateMarksToHalfDays(12), {
      lateMarks: 12,
      convertedHd: 4,
      remainingLate: 0,
      threshold: 3,
    });
    assert.deepEqual(lateMarksToHalfDays(4), {
      lateMarks: 4,
      convertedHd: 1,
      remainingLate: 1,
      threshold: 3,
    });
  });

  it('marks exactly the 3rd/6th/9th late day as lateGeneratedHd and resets counting', () => {
    const days = [
      { date: '2026-10-01', isLate: true, status: 'L' }, // 1
      { date: '2026-10-02', isLate: true, status: 'L' }, // 2
      { date: '2026-10-03', isLate: true, status: 'L' }, // 3 → HD
      { date: '2026-10-06', isLate: false, status: 'P' },
      { date: '2026-10-07', isLate: true, status: 'L' }, // 4 → restart 1
      { date: '2026-10-08', isLate: true, status: 'L' }, // 5 → 2
      { date: '2026-10-09', isLate: true, status: 'L' }, // 6 → HD
      { date: '2026-10-10', isLate: true, status: 'L' }, // 7 → restart 1
      { date: '2026-10-13', isLate: true, status: 'L' }, // 8 → 2
      { date: '2026-10-14', isLate: true, status: 'L' }, // 9 → HD
    ];
    const annotated = annotateLateCycle(days, 3);
    const byDate = Object.fromEntries(annotated.map((d) => [d.date, d]));
    assert.equal(byDate['2026-10-01'].lateGeneratedHd, false);
    assert.equal(byDate['2026-10-01'].lateIndex, 1);
    assert.equal(byDate['2026-10-02'].lateGeneratedHd, false);
    assert.equal(byDate['2026-10-03'].lateGeneratedHd, true);
    assert.equal(byDate['2026-10-03'].lateIndex, 3);
    assert.equal(byDate['2026-10-07'].lateIndex, 4);
    assert.equal(byDate['2026-10-07'].lateGeneratedHd, false);
    assert.equal(byDate['2026-10-09'].lateGeneratedHd, true);
    assert.equal(byDate['2026-10-09'].lateIndex, 6);
    assert.equal(byDate['2026-10-10'].lateIndex, 7);
    assert.equal(byDate['2026-10-10'].lateGeneratedHd, false);
    assert.equal(byDate['2026-10-14'].lateGeneratedHd, true);
    assert.equal(byDate['2026-10-14'].lateIndex, 9);
  });

  it('leaves absent daily earnings blank and sums monthly pay without −daily', () => {
    assert.equal(displayDailyEarning('A', -1000), null);
    assert.equal(displayDailyEarning('P', 1000), 1000);
    assert.equal(displayDailyEarning('HD', 500), 500);

    const agg = aggregateEmployeeMonth(
      [
        { status: 'P', isLate: false, todaysEarnings: 1000, dailySalary: 1000 },
        { status: 'A', isLate: false, todaysEarnings: -1000, dailySalary: 1000 },
        {
          status: 'HD',
          isLate: true,
          lateGeneratedHd: true,
          todaysEarnings: 500,
          dailySalary: 1000,
        },
        { status: 'L', isLate: true, todaysEarnings: 1000, dailySalary: 1000 },
        { status: 'L', isLate: true, todaysEarnings: 1000, dailySalary: 1000 },
      ],
      { lateToHalf: 3 },
    );
    assert.equal(agg.netPayable, 3500);
    assert.equal(agg.lateMarks, 3);
    assert.equal(agg.convertedHd, 1);
    assert.equal(agg.lateGeneratedHalfDays, 1);
    assert.equal(agg.absentDays, 1);
  });
});
