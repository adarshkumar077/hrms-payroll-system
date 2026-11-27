import ExcelJS from 'exceljs';

/**
 * Parsing and validation for the employee master file (.xlsx or .csv). Pure functions: no
 * database access, so they are unit-tested directly. Values are never logged.
 */

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

export type CanonicalField =
  | 'employeeCode'
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'mobile'
  | 'email'
  | 'joiningDate'
  | 'department'
  | 'designation'
  | 'grossMonthly'
  | 'dateOfBirth'
  | 'gender';

/** Header aliases (case / spacing / punctuation insensitive). */
const ALIASES: Record<CanonicalField, string[]> = {
  employeeCode: ['employee id', 'emp id', 'employee code', 'emp code', 'code', 'employee no', 'employee number', 'staff id'],
  fullName: ['full name', 'name', 'employee name'],
  firstName: ['first name', 'given name'],
  lastName: ['last name', 'surname', 'family name'],
  mobile: ['mobile', 'mobile number', 'mobile no', 'phone', 'phone number', 'contact number', 'contact no'],
  email: ['email', 'email address', 'email id', 'official email', 'work email', 'e mail'],
  joiningDate: ['joining date', 'date of joining', 'doj', 'join date', 'joined on', 'date joined'],
  department: ['department', 'dept'],
  designation: ['designation', 'job title', 'title', 'position', 'role'],
  grossMonthly: ['gross monthly salary', 'monthly gross salary', 'monthly gross', 'gross salary', 'gross', 'monthly salary', 'salary'],
  dateOfBirth: ['date of birth', 'dob', 'birth date'],
  gender: ['gender', 'sex'],
};

export const TEMPLATE_HEADERS = [
  'Employee ID',
  'Full Name',
  'Mobile Number',
  'Email',
  'Joining Date',
  'Department',
  'Designation',
  'Gross Monthly Salary',
  'Date of Birth',
  'Gender',
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type ParsedSheet = {
  mapping: Partial<Record<CanonicalField, string>>;
  unknownColumns: string[];
  missingColumns: string[];
  rows: { rowNumber: number; values: Partial<Record<CanonicalField, unknown>> }[];
};

export type RowError = { field: string; message: string };
export type ValidRow = {
  employeeCode: string;
  firstName: string;
  lastName?: string;
  mobile: string;
  email: string;
  joiningDate: string; // YYYY-MM-DD
  department: string;
  designation: string;
  grossMonthly: number;
  dateOfBirth?: string;
  gender?: 'Male' | 'Female' | 'Transgender';
};
export type CheckedRow = {
  rowNumber: number;
  employeeCode: string;
  name: string;
  status: 'ready' | 'error' | 'exists';
  errors: RowError[];
  data?: ValidRow;
};

/** Plain value of an ExcelJS cell (formula results, rich text, hyperlinks, dates). */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if ('result' in o) return cellValue(o.result as ExcelJS.CellValue);
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((r) => r.text).join('');
    if ('text' in o) return o.text;
    if ('error' in o) return null;
    return null;
  }
  return v;
}

function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); out.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

export function detectKind(fileName: string, buf: Buffer): 'xlsx' | 'csv' | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'xlsx' && buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'xlsx';
  if (ext === 'csv' && !buf.includes(0)) return 'csv';
  return null;
}

export async function parseEmployeeFile(fileName: string, buf: Buffer): Promise<ParsedSheet> {
  const kind = detectKind(fileName, buf);
  if (!kind) throw new Error('Upload an .xlsx (Excel) or .csv file.');
  let grid: unknown[][];
  if (kind === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('The workbook has no worksheet.');
    grid = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(r.getCell(c).value));
      grid.push(vals);
    });
  } else {
    grid = parseCsv(buf.toString('utf8').replace(/^﻿/, ''));
  }
  if (!grid.length) throw new Error('The file is empty.');
  const header = grid[0].map((h) => String(h ?? '').trim());
  const mapping: Partial<Record<CanonicalField, string>> = {};
  const colIndex: Partial<Record<CanonicalField, number>> = {};
  const unknownColumns: string[] = [];
  header.forEach((h, i) => {
    if (!h) return;
    const n = norm(h);
    const field = (Object.keys(ALIASES) as CanonicalField[]).find((f) => ALIASES[f].includes(n));
    if (field && colIndex[field] === undefined) { mapping[field] = h; colIndex[field] = i; }
    else unknownColumns.push(h);
  });
  const missingColumns: string[] = [];
  const need: [CanonicalField | CanonicalField[], string][] = [
    ['employeeCode', 'Employee ID'],
    [['fullName', 'firstName'], 'Full Name (or First Name)'],
    ['mobile', 'Mobile Number'],
    ['email', 'Email'],
    ['joiningDate', 'Joining Date'],
    ['department', 'Department'],
    ['designation', 'Designation'],
    ['grossMonthly', 'Gross Monthly Salary'],
  ];
  for (const [f, label] of need) {
    const fields = Array.isArray(f) ? f : [f];
    if (!fields.some((x) => colIndex[x] !== undefined)) missingColumns.push(label);
  }
  const rows = grid.slice(1).map((r, i) => {
    const values: Partial<Record<CanonicalField, unknown>> = {};
    for (const [f, idx] of Object.entries(colIndex) as [CanonicalField, number][]) values[f] = r[idx] ?? null;
    return { rowNumber: i + 2, values };
  });
  return { mapping, unknownColumns, missingColumns, rows };
}

const str = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v)).trim();

/** Accepts Excel dates, Excel serial numbers, YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY. */
export function parseDate(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number' && v > 20000 && v < 80000) d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000);
  else {
    const s = str(v);
    // Build the date and reject anything JavaScript would silently roll over (e.g. 31-02, month 13).
    const exact = (y: number, mo: number, day: number) => {
      const x = new Date(Date.UTC(y, mo - 1, day));
      return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === day ? x : null;
    };
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    if (m) {
      d = exact(+m[1], +m[2], +m[3]);
      if (!d) return null;
    }
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) {
      d = exact(+m[3], +m[2], +m[1]);
      if (!d) return null;
    }
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function normalizeMobile(v: unknown): string | null {
  let digits = str(v).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (/^\d+\.0+$/.test(digits)) digits = digits.split('.')[0]; // numeric Excel cell
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;

/** Validates one row (no DB). Duplicate / existing-record checks are done by the service. */
export function validateRow(rowNumber: number, v: Partial<Record<CanonicalField, unknown>>): CheckedRow {
  const errors: RowError[] = [];
  const code = str(v.employeeCode);
  let first = str(v.firstName);
  let last = str(v.lastName);
  const full = str(v.fullName);
  if (!first && full) {
    const parts = full.split(/\s+/);
    first = parts[0];
    last = last || parts.slice(1).join(' ');
  }
  if (!code) errors.push({ field: 'Employee ID', message: 'required' });
  else if (!/^[A-Za-z0-9][A-Za-z0-9_\-/]{0,29}$/.test(code)) errors.push({ field: 'Employee ID', message: 'use letters, digits, - _ / (max 30)' });
  if (!first) errors.push({ field: 'Full Name', message: 'required' });
  else if (/^[=+\-@]/.test(first) || first.length > 100) errors.push({ field: 'Full Name', message: 'invalid name' });

  const mobile = normalizeMobile(v.mobile);
  if (!str(v.mobile)) errors.push({ field: 'Mobile Number', message: 'required' });
  else if (!mobile) errors.push({ field: 'Mobile Number', message: 'must be a valid 10-digit Indian mobile number' });

  const email = str(v.email).toLowerCase();
  if (!email) errors.push({ field: 'Email', message: 'required' });
  else if (!EMAIL_RE.test(email) || email.length > 254) errors.push({ field: 'Email', message: 'invalid email address' });

  const joiningDate = parseDate(v.joiningDate);
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
  if (!str(v.joiningDate)) errors.push({ field: 'Joining Date', message: 'required' });
  else if (!joiningDate) errors.push({ field: 'Joining Date', message: 'unrecognised date (use DD-MM-YYYY or YYYY-MM-DD)' });
  else if (joiningDate < '1950-01-01' || joiningDate > maxDate) errors.push({ field: 'Joining Date', message: 'out of range' });

  const department = str(v.department);
  const designation = str(v.designation);
  if (!department) errors.push({ field: 'Department', message: 'required' });
  if (!designation) errors.push({ field: 'Designation', message: 'required' });

  const grossRaw = str(v.grossMonthly).replace(/[₹,\s]|rs\.?|inr/gi, '');
  const gross = Number(grossRaw);
  if (!grossRaw) errors.push({ field: 'Gross Monthly Salary', message: 'required' });
  else if (!Number.isFinite(gross) || gross <= 0 || gross > 10_000_000) errors.push({ field: 'Gross Monthly Salary', message: 'must be a positive amount' });

  let dateOfBirth: string | undefined;
  if (str(v.dateOfBirth)) {
    const dob = parseDate(v.dateOfBirth);
    if (!dob || dob < '1930-01-01' || dob > today) errors.push({ field: 'Date of Birth', message: 'invalid date' });
    else dateOfBirth = dob;
  }
  let gender: ValidRow['gender'];
  if (str(v.gender)) {
    const g = str(v.gender).toLowerCase();
    gender = g.startsWith('m') ? 'Male' : g.startsWith('f') ? 'Female' : g.startsWith('t') ? 'Transgender' : undefined;
    if (!gender) errors.push({ field: 'Gender', message: 'use Male, Female or Transgender' });
  }

  const name = [first, last].filter(Boolean).join(' ');
  if (errors.length) return { rowNumber, employeeCode: code, name, status: 'error', errors };
  return {
    rowNumber,
    employeeCode: code,
    name,
    status: 'ready',
    errors,
    data: {
      employeeCode: code,
      firstName: first,
      lastName: last || undefined,
      mobile: mobile!,
      email,
      joiningDate: joiningDate!,
      department,
      designation,
      grossMonthly: Math.round(gross * 100) / 100,
      dateOfBirth,
      gender,
    },
  };
}

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  ws.addRow(TEMPLATE_HEADERS);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 22));
  const notes = wb.addWorksheet('Instructions');
  [
    ['EITF HRMS – employee master import'],
    [''],
    ['Required columns: Employee ID, Full Name, Mobile Number, Email, Joining Date, Department, Designation, Gross Monthly Salary'],
    ['Optional columns: Date of Birth, Gender (Male / Female / Transgender)'],
    ['Mobile Number: 10-digit Indian mobile (+91 / 0 prefixes are accepted). Must be unique.'],
    ['Email: the employee\'s own email. Mobile OTP login codes are sent here. Must be unique.'],
    ['Dates: DD-MM-YYYY, YYYY-MM-DD or an Excel date cell.'],
    ['Gross Monthly Salary: number only (commas and ₹ are ignored).'],
    ['Existing Employee IDs are never overwritten: they are reported and skipped.'],
    ['Keep this file confidential. Do not email it or upload it to other services.'],
  ].forEach((r) => notes.addRow(r));
  notes.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
