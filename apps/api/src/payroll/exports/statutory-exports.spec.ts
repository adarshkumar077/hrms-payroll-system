import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsToCsv } from '../../common/export.engine';
import {
  ExportLine,
  buildBankRows,
  buildEcrFile,
  buildEcrLine,
  buildEsiRows,
  buildTdsRows,
  parseFinancialYear,
  validateExportLines,
} from './statutory-exports';

function line(over: Partial<ExportLine> = {}): ExportLine {
  return {
    employeeCode: 'E001',
    name: 'Asha Rao',
    uan: '100200300400',
    esicNumber: '1234567890',
    pan: 'ABCDE1234F',
    bankAccount: '000111222333',
    ifsc: 'hdfc0001234',
    regime: 'NEW',
    year: 2026,
    month: 6,
    lopDays: 2,
    gross: 30000,
    net: 25000.5,
    earnings: [{ code: 'BASIC', amount: 18000 }],
    deductions: [
      { code: 'PF', amount: 1800 },
      { code: 'TDS', amount: 500 },
    ],
    employerPfEps: 1249.5,
    employerPfEpf: 550.5,
    employerEsi: 0,
    statutory: {
      monthlyGross: 29999.6,
      taxRegime: 'NEW',
      pf: { actualWage: 18000, pfWage: 18000, employee: 1800 },
      esi: null,
    },
    ...over,
  };
}

test('ECR line has 11 #~# separated whole-rupee fields', () => {
  const f = buildEcrLine(line()).split('#~#');
  assert.equal(f.length, 11);
  assert.deepEqual(f, [
    '100200300400',
    'Asha Rao',
    '30000', // 29999.6 rounds half-up
    '18000',
    '15000', // EPS wage capped
    '15000',
    '1800',
    '1250', // 1249.5 half-up
    '551',
    '2', // NCP days
    '0',
  ]);
});

test('ECR strips separator characters from names and skips no-PF / no-UAN members', () => {
  const noPf = line({
    employeeCode: 'E2',
    deductions: [],
    employerPfEps: 0,
    employerPfEpf: 0,
    statutory: null,
  });
  const noUan = line({ employeeCode: 'E3', uan: ' ' });
  const odd = line({ employeeCode: 'E4', name: 'A#B~C' });
  const res = buildEcrFile([line(), noPf, noUan, odd]);
  assert.equal(res.included, 2);
  assert.equal(res.skippedNoPf, 1);
  assert.deepEqual(res.missingUan.map((l) => l.employeeCode), ['E3']);
  const lines = res.content.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].split('#~#')[1], 'A B C');
});

test('ESI rows: paid days, wages and blank optional columns', () => {
  const esi = line({
    lopDays: 3,
    deductions: [{ code: 'ESI', amount: 225 }],
    employerEsi: 975,
    statutory: { monthlyGross: 20000, esi: { applicable: true, employee: 150, employer: 650 } },
  });
  const rows = buildEsiRows([esi, line()]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    'IP Number': '1234567890',
    'IP Name': 'Asha Rao',
    'No. of Days for which wages paid': 27, // June has 30 days
    'Total Monthly Wages': 20000,
    'Reason Code for Zero Working Days': '',
    'Last Working Day': '',
    'Employee Contribution (ref)': 150,
    'Employer Contribution (ref)': 650,
  });
});

test('bank CSV escapes commas and quotes, 2dp amounts, skips incomplete bank rows', () => {
  const rows = buildBankRows(
    [
      line({ name: 'Rao, Asha "AR"' }),
      line({ employeeCode: 'E9', bankAccount: null }),
      line({ employeeCode: 'E8', net: 0 }),
    ],
    2026,
    6,
  );
  assert.equal(rows.length, 1);
  const csv = rowsToCsv(rows);
  assert.equal(
    csv,
    'Employee Name,Account Number,IFSC,Net Amount,Narration\n' +
      '"Rao, Asha ""AR""",000111222333,HDFC0001234,25000.50,Salary 06-2026',
  );
});

test('TDS FY aggregation spans April to March across calendar years', () => {
  const mk = (year: number, month: number, taxable: number, tds: number, code = 'E001') =>
    line({
      employeeCode: code,
      year,
      month,
      statutory: { monthlyGross: taxable },
      deductions: [{ code: 'TDS', amount: tds }],
    });
  const rows = buildTdsRows(
    [
      mk(2026, 4, 50000, 1000),
      mk(2026, 5, 50000, 1000),
      mk(2027, 3, 60000, 1500),
      mk(2026, 3, 99999, 999), // previous FY, ignored
      mk(2026, 4, 40000, 0, 'E002'),
    ],
    '2026-27',
  );
  assert.equal(rows.length, 2);
  const r = rows[0];
  assert.equal(r['Employee Code'], 'E001');
  assert.equal(r['Apr-2026 Taxable Gross'], 50000);
  assert.equal(r['Jun-2026 TDS'], '');
  assert.equal(r['Mar-2027 TDS'], 1500);
  assert.equal(r['Total Taxable Gross'], 160000);
  assert.equal(r['Total TDS'], 3500);
  assert.match(String(r['Note']), /not the official form/);
  assert.equal(rows[1]['Total TDS'], 0);
});

test('TDS rows reject malformed financial year; parseFinancialYear checks consecutive years', () => {
  assert.equal(parseFinancialYear('2026-27'), 2026);
  assert.equal(parseFinancialYear('2026-28'), null);
  assert.equal(parseFinancialYear('26-27'), null);
  assert.throws(() => buildTdsRows([], 'bad'));
});

test('validation detects missing UAN, ESIC, PAN and bank only where relevant', () => {
  const noIds = line({
    employeeCode: 'E5',
    uan: null,
    pan: '',
    bankAccount: null,
    ifsc: null,
    deductions: [
      { code: 'PF', amount: 1800 },
      { code: 'TDS', amount: 500 },
      { code: 'ESI', amount: 100 },
    ],
    esicNumber: null,
    statutory: { monthlyGross: 20000, pf: { pfWage: 15000, employee: 1800 }, esi: { applicable: true } },
  });
  const noObligations = line({
    employeeCode: 'E6',
    uan: null,
    pan: null,
    esicNumber: null,
    deductions: [],
    employerPfEps: 0,
    employerPfEpf: 0,
    statutory: null,
  });
  const v = validateExportLines([line(), noIds, noObligations]);
  assert.deepEqual(v.missingUan, [{ employeeCode: 'E5', name: 'Asha Rao' }]);
  assert.deepEqual(v.missingEsicNumber.map((x) => x.employeeCode), ['E5']);
  assert.deepEqual(v.missingPan.map((x) => x.employeeCode), ['E5']);
  assert.deepEqual(v.missingBank.map((x) => x.employeeCode), ['E5']);
});
