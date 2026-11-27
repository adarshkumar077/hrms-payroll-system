import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildTemplate, normalizeMobile, parseDate, parseEmployeeFile, validateRow, TEMPLATE_HEADERS } from './employee-import.parser';

async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const HEAD = ['Employee ID', 'Full Name', 'Mobile Number', 'Email', 'Joining Date', 'Department', 'Designation', 'Gross Monthly Salary'];
const good = ['T001', 'Test Person', '9876543210', 'Test.Person@Example.com', '01-04-2026', 'IT', 'Engineer', '45,000'];

describe('employee import parser', () => {
  test('reads an .xlsx with standard headers and normalises values', async () => {
    const p = await parseEmployeeFile('staff.xlsx', await xlsx([HEAD, good]));
    assert.deepEqual(p.missingColumns, []);
    const r = validateRow(p.rows[0].rowNumber, p.rows[0].values);
    assert.equal(r.status, 'ready', JSON.stringify(r.errors));
    assert.deepEqual(r.data, {
      employeeCode: 'T001', firstName: 'Test', lastName: 'Person', mobile: '9876543210', email: 'test.person@example.com',
      joiningDate: '2026-04-01', department: 'IT', designation: 'Engineer', grossMonthly: 45000, dateOfBirth: undefined, gender: undefined,
    });
  });

  test('accepts header aliases and Excel date / number cells', async () => {
    const p = await parseEmployeeFile('s.xlsx', await xlsx([
      ['Emp Code', 'Name', 'Phone', 'Email ID', 'DOJ', 'Dept', 'Position', 'Salary'],
      ['T002', 'A B', 9876543211, 'a@b.co', new Date(Date.UTC(2025, 0, 15)), 'HR', 'Exec', 30000],
    ]));
    const r = validateRow(2, p.rows[0].values);
    assert.equal(r.status, 'ready', JSON.stringify(r.errors));
    assert.equal(r.data!.joiningDate, '2025-01-15');
    assert.equal(r.data!.mobile, '9876543211');
  });

  test('reports missing required columns', async () => {
    const p = await parseEmployeeFile('s.xlsx', await xlsx([['Employee ID', 'Full Name'], ['T1', 'X']]));
    assert.deepEqual(p.missingColumns, ['Mobile Number', 'Email', 'Joining Date', 'Department', 'Designation', 'Gross Monthly Salary']);
  });

  test('reads CSV with quotes and a BOM', async () => {
    const csv = '\uFEFF' + HEAD.join(',') + '\n' + 'T003,"Doe, Jane",+91 98765 43212,jane@x.in,2026-02-01,Finance,"Sr, Accountant",52000\n';
    const p = await parseEmployeeFile('s.csv', Buffer.from(csv));
    const r = validateRow(2, p.rows[0].values);
    assert.equal(r.status, 'ready', JSON.stringify(r.errors));
    assert.equal(r.data!.designation, 'Sr, Accountant');
    assert.equal(r.data!.mobile, '9876543212');
  });

  test('rejects files that are not real xlsx/csv', async () => {
    await assert.rejects(parseEmployeeFile('evil.xlsx', Buffer.from('not a zip')), /\.xlsx/);
    await assert.rejects(parseEmployeeFile('evil.exe', Buffer.from('MZ')), /\.xlsx/);
  });

  test('flags each invalid field with a reason', () => {
    const r = validateRow(5, {
      employeeCode: '', fullName: '=HYPERLINK("x")', mobile: '12345', email: 'nope', joiningDate: '31-02-2026',
      department: '', designation: 'D', grossMonthly: '-5',
    });
    assert.equal(r.status, 'error');
    const fields = r.errors.map((e) => e.field).sort();
    assert.deepEqual(fields, ['Department', 'Email', 'Employee ID', 'Full Name', 'Gross Monthly Salary', 'Joining Date', 'Mobile Number']);
  });

  test('helpers', () => {
    assert.equal(normalizeMobile('+91-98765-43210'), '9876543210');
    assert.equal(normalizeMobile('09876543210'), '9876543210');
    assert.equal(normalizeMobile('5876543210'), null);
    assert.equal(parseDate('2026-04-01'), '2026-04-01');
    assert.equal(parseDate('01/04/2026'), '2026-04-01');
    assert.equal(parseDate(46113), '2026-04-01');
    assert.equal(parseDate('2026-13-01'), null);
  });

  test('template has the documented headers and no employee data', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildTemplate()) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Employees')!;
    assert.deepEqual((ws.getRow(1).values as unknown[]).slice(1), TEMPLATE_HEADERS);
    assert.equal(ws.rowCount, 1);
  });
});
