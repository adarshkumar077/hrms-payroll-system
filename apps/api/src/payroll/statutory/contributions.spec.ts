import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../common/money';
import { computeEsi, computePf, computePt, defaultStatutoryRules, PT_STATE_CODES } from './index';

// Golden values computed independently with Python's decimal module.
const rules = defaultStatutoryRules('2026-27');
const n = (d: M.Decimal) => d.toNumber();

function pf(basic: number, restrictToWageCeiling?: boolean) {
  const r = computePf({ basicPlusDa: basic, rules, restrictToWageCeiling });
  return { wage: n(r.pfWage), employee: n(r.employee), eps: n(r.employerEps), epf: n(r.employerEpf), employer: n(r.employerTotal) };
}

test('PF at basic 12,000: 12% each side, EPS 8.33% (999.60 → ₹1,000), EPF the rest', () => {
  assert.deepEqual(pf(12000), { wage: 12000, employee: 1440, eps: 1000, epf: 440, employer: 1440 });
});

test('PF at basic 15,000 (the ceiling): EPS 1,249.50 → ₹1,250', () => {
  assert.deepEqual(pf(15000), { wage: 15000, employee: 1800, eps: 1250, epf: 550, employer: 1800 });
});

test('PF at basic 40,000: ceiling on (default) vs company option to compute on actual basic', () => {
  assert.deepEqual(pf(40000), { wage: 15000, employee: 1800, eps: 1250, epf: 550, employer: 1800 });
  // EPS stays on min(wage, 15,000); EPF takes 3.67% + the whole excess.
  assert.deepEqual(pf(40000, false), { wage: 40000, employee: 4800, eps: 1250, epf: 3550, employer: 4800 });
  const companyOff = { ...rules, pf: { ...rules.pf, restrictToWageCeiling: false } };
  assert.equal(n(computePf({ basicPlusDa: 40000, rules: companyOff }).employee), 4800);
});

test('PF on zero / negative wage is zero', () => {
  assert.deepEqual(pf(0), { wage: 0, employee: 0, eps: 0, epf: 0, employer: 0 });
  assert.deepEqual(pf(-5), { wage: 0, employee: 0, eps: 0, epf: 0, employer: 0 });
});

function esi(gross: number, periodEligible?: boolean | null) {
  const r = computeEsi({ monthlyGross: gross, rules, periodEligible });
  return { applicable: r.applicable, employee: n(r.employee), employer: n(r.employer), basis: r.basis };
}

test('ESI at gross 20,000 / 21,000 / 21,001 (rounded up to the next rupee)', () => {
  assert.deepEqual(esi(20000), { applicable: true, employee: 150, employer: 650, basis: 'THRESHOLD' });
  // 157.50 → 158, 682.50 → 683
  assert.deepEqual(esi(21000), { applicable: true, employee: 158, employer: 683, basis: 'THRESHOLD' });
  assert.deepEqual(esi(21001), { applicable: false, employee: 0, employer: 0, basis: 'THRESHOLD' });
  assert.deepEqual(esi(15333), { applicable: true, employee: 115, employer: 499, basis: 'THRESHOLD' });
});

test('ESI contribution period: covered at the start of the period stays covered after a raise', () => {
  // 24,000 × 0.75% = 180, × 3.25% = 780
  assert.deepEqual(esi(24000, true), { applicable: true, employee: 180, employer: 780, basis: 'CONTRIBUTION_PERIOD' });
  assert.deepEqual(esi(24000, null), { applicable: false, employee: 0, employer: 0, basis: 'THRESHOLD' });
  assert.equal(esi(0).applicable, false);
});

function pt(state: string, gross: number, month = 6, gender?: string) {
  return n(computePt({ monthlyGross: gross, stateCode: state, month, rules, gender }).amount);
}

test('PT: every seeded state is present', () => {
  for (const code of PT_STATE_CODES) assert.ok(rules.professionalTax[code], code);
  assert.equal(pt('NONE', 100000), 0);
  assert.equal(pt('XX', 100000), 0);
  assert.equal(computePt({ monthlyGross: 1, stateCode: 'XX', month: 1, rules }).known, false);
  assert.equal(pt('', 100000), 0);
});

test('PT Maharashtra: male slabs, February ₹300, female exemption up to ₹25,000', () => {
  assert.equal(pt('MH', 7500), 0);
  assert.equal(pt('MH', 7501), 175);
  assert.equal(pt('MH', 10000), 175);
  assert.equal(pt('MH', 10001), 200);
  assert.equal(pt('MH', 50000, 2), 300);
  assert.equal(pt('MH', 9000, 2), 175);
  assert.equal(pt('MH', 20000, 6, 'Female'), 0);
  assert.equal(pt('MH', 25001, 6, 'F'), 200);
  assert.equal(pt('MH', 25001, 2, 'FEMALE'), 300);
});

test('PT Karnataka: ₹200 from ₹25,000, ₹300 in February', () => {
  assert.equal(pt('KA', 24999), 0);
  assert.equal(pt('KA', 25000), 200);
  assert.equal(pt('KA', 80000, 2), 300);
});

test('PT West Bengal slabs', () => {
  assert.equal(pt('WB', 10000), 0);
  assert.equal(pt('WB', 12000), 110);
  assert.equal(pt('WB', 20000), 130);
  assert.equal(pt('WB', 30000), 150);
  assert.equal(pt('WB', 40001), 200);
});

test('PT Tamil Nadu: half-yearly slabs as a monthly equivalent', () => {
  assert.equal(pt('TN', 3500), 0); // 21,000 half-yearly
  assert.equal(pt('TN', 4000), 30); // 24,000 → 180 ÷ 6
  assert.equal(pt('TN', 6000), 70.83); // 36,000 → 425 ÷ 6
  assert.equal(pt('TN', 9000), 155); // 54,000 → 930 ÷ 6
  assert.equal(pt('TN', 12000), 170.83); // 72,000 → 1,025 ÷ 6
  assert.equal(pt('TN', 50000), 208.33); // > 75,000 → 1,250 ÷ 6
});

test('PT Telangana / Andhra Pradesh / Gujarat', () => {
  for (const s of ['TS', 'AP']) {
    assert.equal(pt(s, 15000), 0);
    assert.equal(pt(s, 18000), 150);
    assert.equal(pt(s, 20001), 200);
  }
  assert.equal(pt('GJ', 11999), 0);
  assert.equal(pt('GJ', 12000), 200);
  assert.equal(pt('GJ', 90000, 2), 200);
});
