import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import * as M from './money';

test('0.1 + 0.2 is exactly 0.3', () => {
  assert.notEqual(0.1 + 0.2, 0.3); // the float bug this module exists to avoid
  assert.ok(M.add(0.1, 0.2).equals('0.3'));
  assert.equal(M.toNumber(M.add(0.1, 0.2)), 0.3);
  assert.equal(M.add('0.1', '0.2').toString(), '0.3');
});

test('constructors accept number, string, Decimal and treat null/NaN/garbage as 0', () => {
  assert.equal(M.money(12.5).toString(), '12.5');
  assert.equal(M.money('33333.33').toString(), '33333.33');
  assert.equal(M.money(new Prisma.Decimal('1.23')).toString(), '1.23');
  for (const v of [null, undefined, '', 'abc', NaN, Infinity]) {
    assert.ok(M.money(v as M.MoneyInput).isZero(), `money(${String(v)})`);
  }
});

test('round half-up at .005 (HALF_UP = half away from zero)', () => {
  assert.equal(M.round2('1.005').toFixed(2), '1.01');
  assert.equal(M.round2('2.675').toFixed(2), '2.68'); // Math.round(2.675*100)/100 gives 2.67
  assert.equal(M.round2('1.004999').toFixed(2), '1.00');
  assert.equal(M.round2('-1.005').toFixed(2), '-1.01');
  assert.equal(M.toNumber(1.005), 1.01); // number literal 1.005 → "1.005" → 1.01
  assert.equal(M.toNumber('0.125'), 0.13);
  assert.equal(M.toNumber('0.135'), 0.14);
});

test('add / sub / mul / div / percentOf', () => {
  assert.equal(M.sub(100, 33.33, 33.33).toString(), '33.34');
  assert.equal(M.mul('19.99', 3).toString(), '59.97');
  assert.equal(M.round2(M.div(100, 3)).toString(), '33.33');
  assert.ok(M.div(100, 0).isZero(), 'divide by zero → 0');
  assert.equal(M.percentOf(33333.33, 1).toString(), '333.3333');
  assert.equal(M.round2(M.percentOf(33333.33, 1)).toString(), '333.33');
  assert.equal(M.round2(M.percentOf('15000', 12)).toString(), '1800');
});

test('sum / sumBy are exact over many paise values', () => {
  const tenCents = Array.from({ length: 10 }, () => 0.1);
  assert.notEqual(tenCents.reduce((a, b) => a + b, 0), 1);
  assert.equal(M.sum(tenCents).toString(), '1');
  assert.equal(M.sumBy([{ a: 0.07 }, { a: 0.01 }, { a: 0.02 }], (r) => r.a).toString(), '0.1');
});

test('min / max / nonNegative', () => {
  assert.equal(M.max(1, '2.5', 2).toString(), '2.5');
  assert.equal(M.min(1, '0.5', 2).toString(), '0.5');
  assert.ok(M.nonNegative(-5).isZero());
  assert.equal(M.nonNegative(5).toString(), '5');
});

test('toNumber / toNumberOrNull / toDb / toFixed2', () => {
  assert.equal(M.toNumber(new Prisma.Decimal('1234.5')), 1234.5);
  assert.equal(M.toNumber(new Prisma.Decimal('-0.001')), 0); // no -0
  assert.equal(M.toNumberOrNull(null), null);
  assert.equal(M.toNumberOrNull('7.777'), 7.78);
  assert.equal(M.toDb('99.999').toFixed(2), '100.00');
  assert.equal(M.toDbOrNull(undefined), null);
  assert.equal(M.toFixed2(5), '5.00');
});

test('serializeMoney converts nested Decimals to 2dp numbers and leaves the rest alone', () => {
  const d = new Date('2026-01-01T00:00:00Z');
  const buf = Buffer.from('x');
  const input = {
    netPay: new Prisma.Decimal('45000.5'),
    paidAmount: null,
    lopDays: 1.5,
    name: 'A',
    when: d,
    file: buf,
    lines: [{ amount: new Prisma.Decimal('0.125') }, { amount: 3 }],
    nested: { deep: { balanceAfter: new Prisma.Decimal('10') } },
  };
  const out = M.serializeMoney(input);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), {
    netPay: 45000.5,
    paidAmount: null,
    lopDays: 1.5,
    name: 'A',
    when: d.toISOString(),
    file: JSON.parse(JSON.stringify(buf)),
    lines: [{ amount: 0.13 }, { amount: 3 }],
    nested: { deep: { balanceAfter: 10 } },
  });
  assert.equal(out.when, d);
  assert.equal(out.file, buf);
  // input is not mutated
  assert.ok(M.isDecimal(input.netPay));
});

test('serializeMoney handles shared references without blowing up', () => {
  const shared = { amount: new Prisma.Decimal('1.5') };
  const out = M.serializeMoney({ a: shared, b: shared, list: [shared] });
  assert.deepEqual(out, { a: { amount: 1.5 }, b: { amount: 1.5 }, list: [{ amount: 1.5 }] });
});
