/* eslint-disable */
/*
 * EITF HRMS - DEMO / TRAINING data seeder.
 *
 *   npm run demo:seed                          (from repo root or apps/api)
 *   npm run demo:seed -- --xlsx <workbook>     (import real-shaped Oct-2026 sheet instead of built-ins)
 *   npm run demo:seed -- --pt-mh               (also set Professional-Tax state MH; off by default to match the source sheet)
 *   npm run demo:seed -- --force-demo          (required when NODE_ENV=production - never do this on a real tenant)
 *
 * Everything goes through the compiled Nest services in apps/api/dist (so validation, audit logs,
 * late-conversion and payroll rules apply). Run `npm run build:api` first (or keep the dev server
 * running - it rebuilds dist). tsx cannot be used: it does not emit decorator metadata.
 *
 * Idempotent: every step checks for existing data (reads via Prisma) and skips what is there.
 *
 * Direct Prisma is used ONLY for: existence checks (reads), the demo-user `forcePasswordChange=false`
 * flag, and announcements (no service exists). Everything else is a service call.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const API = path.resolve(__dirname, '..', '..');
const ROOT = path.resolve(API, '..', '..');
const req = createRequire(path.join(API, 'package.json'));
req('dotenv').config({ path: path.join(API, '.env'), quiet: true });

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const XLSX_PATH = opt('--xlsx');
const SET_PT = flag('--pt-mh');

function banner() {
  const line = '#'.repeat(78);
  console.warn(
    `\n${line}\n#  DEMO / TRAINING DATA SEEDER - FAKE DATA ONLY\n#  This creates fake employees, fake PAN/UAN/bank numbers, fake logins and approves\n#  a payroll run. NEVER run it against a production / real-customer database.\n${line}\n`,
  );
}
banner();
if (process.env.NODE_ENV === 'production' && !flag('--force-demo')) {
  console.error('Refusing to run: NODE_ENV=production. Pass --force-demo only for a dedicated demo instance.');
  process.exit(2);
}

const dist = (p) => path.join(API, 'dist', p);
if (!fs.existsSync(dist('app.module.js'))) {
  console.error('apps/api/dist is missing - run `npm run build:api` first.');
  process.exit(2);
}
const { NestFactory } = req('@nestjs/core');
const { PrismaClient } = req('@prisma/client');
const { AppModule } = req(dist('app.module.js'));
const { EmployeesService } = req(dist('employees/employees.service.js'));
const { EmployeePayrollService } = req(dist('employees/employee-payroll.service.js'));
const { AttendanceService } = req(dist('attendance/attendance.service.js'));
const { HolidaysService } = req(dist('holidays/holidays.service.js'));
const { PayrollService } = req(dist('payroll/payroll.service.js'));
const { LeaveService } = req(dist('leave/leave.service.js'));
const { AdminService } = req(dist('admin/admin.service.js'));
const { CompanyService } = req(dist('company/company.service.js'));
const { GrowthService } = req(dist('growth/growth.service.js'));
const { LifecycleService } = req(dist('lifecycle/lifecycle.service.js'));

const LOGINS_FILE = path.join(ROOT, 'DEMO-LOGINS.local.md');
const SHEET_NAME = 'attendance-payroll-all-2026-10.xlsx';

// ---------------------------------------------------------------------------------------------
// Built-in dataset (copied from the October 2026 sheet; used when --xlsx is not given)
// ---------------------------------------------------------------------------------------------
const PROFILES = [
  { n: 1, code: 'EITF001', first: 'Mukesh', last: 'Pandey', gender: 'Male', dept: 'Operations', title: 'HR Manager', role: 'HR', reportsToRajesh: false, gross: 50000, pf: 3600, esd: 0 },
  { n: 2, code: 'EITF002', first: 'Aadarsh', last: 'Vishwakarma', gender: 'Male', dept: 'Engineering', title: 'Software Engineer', role: 'EMPLOYEE', reportsToRajesh: true, gross: 20000, pf: 0, esd: 500 },
  { n: 3, code: 'EITF003', first: 'Rajesh', last: 'Yadav', gender: 'Male', dept: 'Operations', title: 'Operations Manager', role: 'ADMIN', reportsToRajesh: false, gross: 25000, pf: 3600, esd: 0 },
  { n: 4, code: 'EITF004', first: 'Foram', last: 'Bambhrolia', gender: 'Female', dept: 'Finance', title: 'Accounts Executive', role: 'EMPLOYEE', reportsToRajesh: true, gross: 25000, pf: 3600, esd: 0 },
  { n: 5, code: 'EITF005', first: 'Saroja', last: 'Mondi', gender: 'Female', dept: 'Engineering', title: 'QA Engineer', role: 'EMPLOYEE', reportsToRajesh: true, gross: 25000, pf: 3600, esd: 0 },
  { n: 6, code: 'EITF006', first: 'Rani', last: 'Sharma', gender: 'Female', dept: 'Sales', title: 'Sales Executive', role: 'EMPLOYEE', reportsToRajesh: true, gross: 25000, pf: 3600, esd: 0 },
  { n: 7, code: 'EITF007', first: 'Shakir', last: 'Shaikh', gender: 'Male', dept: 'Support', title: 'Support Engineer', role: 'EMPLOYEE', reportsToRajesh: true, gross: 22000, pf: 0, esd: 0 },
].map((p) => ({
  ...p,
  name: `${p.first} ${p.last}`,
  workEmail: `${p.first}.${p.last}@eitf-demo.test`.toLowerCase(),
  mobile: `900000000${p.n}`,
  dob: `1990-0${p.n}-1${p.n}`,
  pan: `AAAPD000${p.n}A`,
  uan: `10000000000${p.n}`,
  account: `00000000000${p.n}`,
}));
const PROFILE_BY_CODE = new Map(PROFILES.map((p) => [p.code, p]));

/** Built-in October 2026 exceptions. Everything not listed follows the base calendar. */
const OCT_EXCEPTIONS = {
  EITF001: { 6: 'A', 15: 'L', 29: 'A' },
  EITF002: {
    3: { late: 42, inT: '10:57' }, 6: { late: 19, inT: '10:33' }, 13: { late: 36, inT: '10:51' },
    14: { late: 82, inT: '11:36' }, 15: { late: 16, inT: '10:30' },
  },
  EITF003: { 22: 'L' },
  EITF004: { 22: 'HD', 29: 'L' },
  EITF005: { 13: 'A', 26: 'A', 29: 'L' },
  EITF006: { 22: 'L' },
  EITF007: { 1: 'A', 3: 'A', 5: 'A', 6: { status: 'A', late: 488, inT: '18:23' }, 15: 'L' },
};
const OCT_WEEKLY_OFF = new Set([4, 11, 18, 25, 31, 20]); // Sundays, last Saturday, and the sheet's 20th

const HOLIDAYS_2026 = [
  ['Republic Day', '2026-01-26', 'NATIONAL'],
  ['Holi', '2026-03-04', 'FESTIVAL'],
  ['Good Friday', '2026-04-03', 'FESTIVAL'],
  ['Independence Day', '2026-08-15', 'NATIONAL'],
  ['Gandhi Jayanti', '2026-10-02', 'NATIONAL'],
  ['Dussehra', '2026-10-20', 'FESTIVAL'],
  ['Diwali', '2026-11-08', 'FESTIVAL'],
  ['Christmas', '2026-12-25', 'FESTIVAL'],
];

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const istIso = (date, hhmm) => `${date}T${hhmm}:00+05:30`;
const addMin = (hhmm, mins) => {
  const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + mins;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const log = (s) => console.log(s);
const cell = (v) =>
  v && typeof v === 'object' && 'result' in v ? v.result : v && typeof v === 'object' && v.text ? v.text : v;

function genPassword() {
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ', L = 'abcdefghijkmnpqrstuvwxyz', D = '23456789', S = '!@#$%^&*-_+=';
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick(U), pick(U), pick(L), pick(L), pick(D), pick(D), pick(S), pick(S)];
  const all = U + L + D + S;
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function readStoredPassword() {
  if (!fs.existsSync(LOGINS_FILE)) return null;
  const m = fs.readFileSync(LOGINS_FILE, 'utf8').match(/^Password \(all demo accounts\): `(.+)`$/m);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------------------------
// data sources: built-in or xlsx
// ---------------------------------------------------------------------------------------------
function builtinOctober() {
  const days = new Map();
  const holidays = new Map();
  for (const p of PROFILES) {
    const ex = OCT_EXCEPTIONS[p.code] || {};
    const rows = [];
    for (let d = 1; d <= 31; d++) {
      const date = iso(2026, 10, d);
      let row = { iso: date, status: 'P', isLate: false, lateMin: 0, note: 'Demo built-in October attendance' };
      if (d === 2) row = { ...row, status: 'PH', note: 'Gandhi Jayanti' };
      else if (OCT_WEEKLY_OFF.has(d)) row = { ...row, status: 'WO', note: 'Weekly Off' };
      const e = ex[d];
      if (typeof e === 'string') row.status = e;
      else if (e) {
        row = { ...row, status: e.status || 'P', isLate: true, lateMin: e.late, inIso: istIso(date, e.inT), outIso: istIso(date, '21:00') };
      }
      rows.push(row);
    }
    days.set(p.code, rows);
  }
  holidays.set('2026-10-02', 'Gandhi Jayanti');
  return { days, holidays, employees: new Map(PROFILES.map((p) => [p.code, p])) };
}

async function xlsxOctober(file) {
  const ExcelJS = req('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const employees = new Map();
  wb.getWorksheet('Employee Payroll').eachRow((row, i) => {
    const r = row.values.slice(1).map(cell);
    if (i < 7 || !/^EITF\d+$/.test(String(r[0]))) return;
    const base = PROFILE_BY_CODE.get(r[0]);
    const name = String(r[1]).replace(/\s+/g, ' ').trim();
    const [first, ...rest] = name.split(' ');
    employees.set(r[0], { ...(base || { code: r[0], first, last: rest.join(' ') || undefined, role: 'EMPLOYEE' }), name, gross: Number(r[2]) });
  });
  wb.getWorksheet('PF & Security Deposit').eachRow((row, i) => {
    const r = row.values.slice(1).map(cell);
    const e = employees.get(r[0]);
    if (i < 7 || !e) return;
    e.pf = r[2] === 'Yes' ? Number(r[3]) || 0 : 0;
    e.esd = r[4] === 'Yes' ? Number(r[6]) || 0 : 0;
  });
  const days = new Map();
  const holidays = new Map();
  let cur = null;
  wb.getWorksheet('Daily Attendance').eachRow((row) => {
    const r = row.values.slice(1).map(cell);
    const m = String(r[0] ?? '').match(/Emp ID:\s*(\S+)/);
    if (m) {
      cur = m[1];
      days.set(cur, []);
      return;
    }
    const d = String(r[0] ?? '').match(/^(\d\d)-(\d\d)-(\d{4})$/);
    if (!d || !cur) return;
    const date = `${d[3]}-${d[2]}-${d[1]}`;
    const raw = String(r[2]).trim();
    const late = r[3] === 'Yes';
    const remark = String(r[10] ?? '');
    if (raw === 'PH' && remark) holidays.set(date, remark);
    const to24 = (t) => {
      const mm = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
      if (!mm) return undefined;
      let h = Number(mm[1]) % 12;
      if (mm[3].toLowerCase() === 'pm') h += 12;
      return istIso(date, `${pad(h)}:${mm[2]}`);
    };
    // In this app "L" = Late (present, paid) and "PL" = paid leave. "L"+late mark = late present;
    // "HD (Late)" = 3rd late (app re-derives the HD); "L" without a mark is kept as "L", as in the source.
    let status = raw;
    let isLate = late;
    if (raw === 'HD (Late)' || (raw === 'L' && late)) { status = 'P'; isLate = true; }
    if (!['P', 'A', 'L', 'PL', 'HD', 'PH', 'WO'].includes(status)) throw new Error(`Unknown status ${raw} on ${date}`);
    days.get(cur).push({
      iso: date, status, isLate,
      lateMin: isLate ? Number((remark.match(/Late (\d+)m/) || [])[1] || 0) : 0,
      inIso: isLate ? to24(r[5]) : undefined,
      outIso: isLate ? to24(r[6]) : undefined,
      note: `Imported from ${SHEET_NAME} (${raw}${remark ? '; ' + remark : ''})`,
    });
  });
  return { days, holidays, employees };
}

function novemberRows(p) {
  const rows = [];
  for (let d = 1; d <= 20; d++) {
    const date = iso(2026, 11, d);
    const base = { iso: date, status: 'P', isLate: false, lateMin: 0, note: 'Demo November attendance' };
    if (d === 8) { rows.push({ ...base, status: 'PH', note: 'Diwali' }); continue; }
    if (dow(date) === 0) { rows.push({ ...base, status: 'WO', note: 'Weekly Off' }); continue; }
    if (p.code === 'EITF002' && (d === 3 || d === 10)) {
      const inT = d === 3 ? '10:40' : '10:55';
      rows.push({ ...base, isLate: true, lateMin: d === 3 ? 25 : 40, inIso: istIso(date, inT), outIso: istIso(date, addMin(inT, 485)) });
      continue;
    }
    if (p.code === 'EITF007' && d === 17) { rows.push({ ...base, status: 'A', note: 'Demo absence' }); continue; }
    if (p.code === 'EITF004' && (d === 12 || d === 13)) { rows.push({ ...base, status: 'PL', note: 'Approved leave (demo)' }); continue; }
    const jitter = (p.n * 7 + d * 3) % 10; // 10:00..10:09, deterministic, never late (work start 10:15)
    const inT = `10:0${jitter}`;
    // worked time 8h05: a full day (>= 8h) with no overtime (the office day is 8h15)
    rows.push({ ...base, inIso: istIso(date, inT), outIso: istIso(date, addMin(inT, 485)) });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
async function main() {
  const data = XLSX_PATH ? await xlsxOctober(path.resolve(XLSX_PATH)) : builtinOctober();
  log(XLSX_PATH ? `Source: ${XLSX_PATH}` : 'Source: built-in demo values (no --xlsx given)');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = new PrismaClient();
  const summary = [];
  const done = (what, created, skipped = 0) => {
    summary.push(`${what}: ${created} created, ${skipped} already present`);
    log(`  ${what}: ${created} created, ${skipped} already present`);
  };

  try {
    const empSvc = app.get(EmployeesService);
    const cfgSvc = app.get(EmployeePayrollService);
    const attSvc = app.get(AttendanceService);
    const holSvc = app.get(HolidaysService);
    const payrollSvc = app.get(PayrollService);
    const leaveSvc = app.get(LeaveService);
    const adminSvc = app.get(AdminService);
    const companySvc = app.get(CompanyService);
    const growthSvc = app.get(GrowthService);
    const lifecycleSvc = app.get(LifecycleService);

    const actorOf = async (where) => {
      const u = await prisma.user.findFirst({ where, include: { userRoles: { include: { role: true } } } });
      if (!u) return null;
      return {
        id: u.id, companyId: u.companyId, email: u.email, displayName: u.displayName,
        roles: u.userRoles.map((ur) => ur.role.code), employeeId: u.employeeId, moduleAccess: [],
      };
    };
    let admin = await actorOf({ email: 'admin@eitf.in' });
    if (!admin) {
      const sa = await prisma.user.findFirst({ where: { userRoles: { some: { role: { code: 'SUPER_ADMIN' } } } } });
      admin = sa && (await actorOf({ id: sa.id }));
    }
    if (!admin) throw new Error('No SUPER_ADMIN user found - run `npm run db:seed` first.');
    const cid = admin.companyId;

    // ---- 0. Company profile --------------------------------------------------------------
    log('\n[0] Company');
    const company = await prisma.company.findUnique({ where: { id: cid } });
    if (company.state !== 'Maharashtra') {
      await companySvc.updateCompany(cid, admin.id, { state: 'Maharashtra', country: 'India' });
      done('company state', 1);
    } else done('company state', 0, 1);

    // ---- 1+2. Employees, profile, fake statutory/bank data --------------------------------
    log('\n[1-2] Employees');
    const ids = new Map();
    let created = 0, skipped = 0, updated = 0;
    const emps = [...data.employees.values()];
    // Rajesh must exist first (everyone reports to him)
    emps.sort((a, b) => (a.code === 'EITF003' ? -1 : b.code === 'EITF003' ? 1 : a.code.localeCompare(b.code)));
    let rajeshId = null;
    for (const e of emps) {
      const prof = PROFILE_BY_CODE.get(e.code) ? { ...PROFILE_BY_CODE.get(e.code), ...e } : e;
      const hasMeta = !!prof.dept;
      const desired = {
        firstName: prof.first, lastName: prof.last, displayName: prof.name,
        joinedAt: '2026-04-01',
        ...(hasMeta && {
          department: prof.dept, designation: prof.title, gender: prof.gender, dateOfBirth: prof.dob,
          workEmail: prof.workEmail, mobile: prof.mobile,
          reportingToId: prof.reportsToRajesh ? rajeshId : null,
          bank: { accountHolder: prof.name, bankName: 'Demo Bank', accountNumber: prof.account, ifsc: 'DEMO0000001', branch: 'Demo Branch', accountType: 'Savings' },
          government: { panNumber: prof.pan, uan: prof.uan },
        }),
      };
      let emp = await prisma.employee.findFirst({
        where: { companyId: cid, employeeCode: e.code }, include: { bank: true, government: true },
      });
      if (!emp) {
        emp = await empSvc.create(admin, { employeeCode: e.code, createLogin: false, ...desired, reportingToId: undefined });
        created++;
        emp = await prisma.employee.findFirst({ where: { id: emp.id }, include: { bank: true, government: true } });
      }
      if (e.code === 'EITF003') rajeshId = emp.id;
      ids.set(e.code, emp.id);
      // Joined 2026-04-01, so probation is over: confirm as ACTIVE through the status service.
      if (emp.status !== 'ACTIVE') {
        await empSvc.updateStatus(admin, emp.id, {
          status: 'ACTIVE',
          reason: 'Probation completed (demo)',
          effectiveAt: '2026-10-01',
        });
        updated++;
      }
      if (hasMeta) {
        const wantReport = prof.reportsToRajesh ? rajeshId : null;
        const same =
          emp.department === prof.dept && emp.designation === prof.title && emp.gender === prof.gender &&
          emp.workEmail === prof.workEmail && emp.mobile === prof.mobile &&
          (emp.reportingToId ?? null) === wantReport &&
          emp.dateOfBirth?.toISOString().slice(0, 10) === prof.dob &&
          emp.bank?.accountNumber === prof.account && emp.bank?.ifsc === 'DEMO0000001' &&
          emp.government?.panNumber === prof.pan && emp.government?.uan === prof.uan;
        if (!same) {
          await empSvc.update(admin, emp.id, { ...desired, reportingToId: wantReport });
          updated++;
        } else skipped++;
      }
    }
    done(`employees (${updated} profiles updated)`, created, skipped);

    // Salary / deductions config (upsert - same values each run)
    for (const e of emps) {
      const prof = PROFILE_BY_CODE.get(e.code) ? { ...PROFILE_BY_CODE.get(e.code), ...e } : e;
      await cfgSvc.upsertConfig(admin, ids.get(e.code), {
        grossMonthly: prof.gross, salaryType: 'MONTHLY', effectiveFrom: '2026-04-01', workingDays: 31,
        allowances: { basic: 0, hra: 0, medical: 0, travel: 0, internet: 0, overtime: 0, bonus: 0, incentive: 0, special: 0, custom: [] },
        deductions: {
          pf: prof.pf ? { enabled: true, mode: 'fixed', value: prof.pf } : { enabled: false, mode: 'statutory' },
          tds: { enabled: true, mode: 'statutory' },
          esi: { enabled: false, mode: 'statutory' },
          esd: { enabled: !!prof.esd, amount: prof.esd || 0, type: 'monthly', totalAmount: 500, deductedToDate: 0 },
          professionalTax: { enabled: true, mode: 'statutory', amount: 0 },
          custom: [],
        },
        taxRegime: 'NEW',
        ...(SET_PT ? { ptState: 'MH' } : {}),
      });
    }
    log(`  payroll configs upserted for ${emps.length} employees${SET_PT ? ' (ptState MH)' : ''}`);

    // ---- 3. Logins ---------------------------------------------------------------------
    log('\n[3] Demo logins');
    const metaEmps = emps.filter((e) => PROFILE_BY_CODE.has(e.code));
    let password = readStoredPassword();
    const fileMissing = !password;
    const existingUsers = new Map(
      (await prisma.user.findMany({ where: { companyId: cid, employeeId: { in: metaEmps.map((e) => ids.get(e.code)) } } }))
        .map((u) => [u.employeeId, u]),
    );
    if (!password) password = genPassword();
    let usersCreated = 0, usersKept = 0;
    for (const e of metaEmps) {
      const p = PROFILE_BY_CODE.get(e.code);
      const empId = ids.get(e.code);
      const existing = existingUsers.get(empId);
      if (!existing) {
        await adminSvc.createUser(admin, {
          loginId: e.code, email: p.workEmail, mobile: p.mobile, password, confirmPassword: password,
          displayName: p.name, role: p.role, employeeId: empId,
        });
        usersCreated++;
      } else {
        usersKept++;
        if (fileMissing) await adminSvc.resetPassword(admin, existing.id, { password, confirmPassword: password });
      }
    }
    // no service for this flag: demo accounts should not force a password change on first login
    await prisma.user.updateMany({
      where: { companyId: cid, employeeId: { in: metaEmps.map((e) => ids.get(e.code)) } },
      data: { forcePasswordChange: false },
    });
    if (usersCreated || fileMissing) {
      const lines = [
        '# EITF HRMS demo logins (LOCAL ONLY - gitignored, never commit)',
        '',
        `Generated by apps/api/scripts/demo/seed-demo.cjs on ${new Date().toISOString()}.`,
        'Demo/training data only. The pre-existing admin@eitf.in account is not part of this file.',
        '',
        `Password (all demo accounts): \`${password}\``,
        '',
        '| Login ID | Email | Role | Name |',
        '|---|---|---|---|',
        ...metaEmps.map((e) => {
          const p = PROFILE_BY_CODE.get(e.code);
          return `| ${e.code} | ${p.workEmail} | ${p.role} | ${p.name} |`;
        }),
        '',
      ];
      fs.writeFileSync(LOGINS_FILE, lines.join('\n'), { mode: 0o600 });
      log(`  wrote ${path.relative(ROOT, LOGINS_FILE)}`);
    }
    done('demo user accounts', usersCreated, usersKept);

    // per-person actors (needed for self-service calls: leave, loans, tickets)
    const actors = new Map();
    for (const e of metaEmps) actors.set(e.code, await actorOf({ employeeId: ids.get(e.code) }));

    // ---- 4. Holidays --------------------------------------------------------------------
    log('\n[4] Holidays');
    let hc = 0, hs = 0;
    const wanted = new Map(HOLIDAYS_2026.map(([name, date, type]) => [date, { name, type }]));
    for (const [date, name] of data.holidays) if (!wanted.has(date)) wanted.set(date, { name, type: 'FESTIVAL' });
    for (const [date, h] of wanted) {
      const exists = await prisma.holiday.findFirst({ where: { companyId: cid, date: new Date(date) } });
      if (exists) { hs++; continue; }
      await holSvc.create(cid, admin.id, { name: h.name, date, type: h.type, isPaid: true, notes: 'demo calendar - verify' });
      hc++;
    }
    done('holidays', hc, hs);

    // ---- October attendance (as imported) ------------------------------------------------
    log('\n[5a] Attendance - October 2026');
    const importMonth = async (year, month, rowsFor, label) => {
      let c = 0, s = 0;
      for (const e of emps) {
        const rows = rowsFor(e);
        if (!rows || !rows.length) continue;
        const empId = ids.get(e.code);
        const from = new Date(`${iso(year, month, 1)}T00:00:00Z`);
        const to = new Date(`${iso(year, month, 31)}T00:00:00Z`);
        const have = await prisma.attendanceRecord.count({ where: { employeeId: empId, date: { gte: from, lte: to } } });
        if (have >= rows.length) { s++; continue; }
        for (const r of rows) {
          await attSvc.correct(admin, empId, r.iso, {
            status: r.status,
            isLate: r.isLate,
            lateMinutes: r.isLate ? r.lateMin : 0,
            checkInAt: r.inIso,
            checkOutAt: r.outIso,
            correctionNote: r.note,
          });
        }
        await attSvc.reapplyLateConversionsForMonth(cid, empId, year, month);
        c++;
      }
      done(`attendance ${label} (employee-months)`, c, s);
    };
    await importMonth(2026, 10, (e) => data.days.get(e.code), 'Oct 2026');

    // ---- 5. Leave ------------------------------------------------------------------------
    log('\n[5] Leave');
    await leaveSvc.ensureDefaultTypes(cid); // service: seed default leave types + approval chain
    const types = Object.fromEntries((await prisma.leaveType.findMany({ where: { companyId: cid } })).map((t) => [t.code, t.id]));
    let lc = 0, ls = 0;
    const ALLOC = [['CL', 12], ['SL', 6], ['EL', 6]];
    for (const e of metaEmps) {
      for (const [code, days] of ALLOC) {
        const note = `Demo opening allocation 2026 (${code})`;
        const have = await prisma.leaveLedgerEntry.findFirst({ where: { employeeId: ids.get(e.code), note } });
        if (have) { ls++; continue; }
        await leaveSvc.adjust(admin, { employeeId: ids.get(e.code), leaveTypeId: types[code], days, note });
        lc++;
      }
    }
    done('leave balance allocations', lc, ls);

    const rajesh = actors.get('EITF003');
    const mukesh = actors.get('EITF001');
    const leaveDemo = [
      { code: 'EITF004', from: '2026-11-12', to: '2026-11-13', reason: 'Family function (demo)', end: 'APPROVED' },
      { code: 'EITF005', from: '2026-11-26', to: '2026-11-26', reason: 'Personal work (demo)', end: 'PENDING' },
      { code: 'EITF007', from: '2026-11-05', to: '2026-11-05', reason: 'Personal work (demo)', end: 'REJECTED', comment: 'Release week' },
    ];
    let lac = 0, las = 0;
    for (const l of leaveDemo) {
      const empId = ids.get(l.code);
      const exists = await prisma.leaveApplication.findFirst({ where: { employeeId: empId, fromDate: new Date(l.from) } });
      if (exists) { las++; continue; }
      const app1 = await leaveSvc.apply(actors.get(l.code), {
        leaveTypeId: types.CL, fromDate: l.from, toDate: l.to, reason: l.reason,
      });
      if (l.end === 'APPROVED') {
        await leaveSvc.review(rajesh, app1.id, { status: 'APPROVED', comment: 'Approved (demo)' }); // step 1: manager
        await leaveSvc.review(mukesh, app1.id, { status: 'APPROVED', comment: 'Approved (demo)' }); // step 2: HR
      } else if (l.end === 'REJECTED') {
        await leaveSvc.review(rajesh, app1.id, { status: 'REJECTED', comment: l.comment });
      }
      lac++;
    }
    done('leave applications', lac, las);

    // ---- 6. October payroll: regenerate + approve ----------------------------------------
    log('\n[6] Payroll - October 2026');
    let run = await prisma.payrollRun.findUnique({ where: { companyId_year_month: { companyId: cid, year: 2026, month: 10 } } });
    if (run && ['APPROVED', 'LOCKED'].includes(run.status)) {
      done('payroll Oct 2026 approval', 0, 1);
    } else {
      await payrollSvc.generate(admin, { year: 2026, month: 10 });
      run = await prisma.payrollRun.findUnique({ where: { companyId_year_month: { companyId: cid, year: 2026, month: 10 } } });
      await payrollSvc.approve(admin, run.id);
      done('payroll Oct 2026 approval', 1);
    }

    // ---- 7. November attendance 1-20 ------------------------------------------------------
    log('\n[7] Attendance - November 2026 (1-20)');
    await importMonth(2026, 11, (e) => (PROFILE_BY_CODE.has(e.code) ? novemberRows(PROFILE_BY_CODE.get(e.code)) : null), 'Nov 2026');
    for (const e of metaEmps) await attSvc.reapplyLateConversionsForMonth(cid, ids.get(e.code), 2026, 11);
    log('  late reconciliation re-applied for Nov 2026');

    // ---- 8. Loans / reimbursements --------------------------------------------------------
    log('\n[8] Loans & reimbursements');
    let mc = 0, ms = 0;
    const shakirId = ids.get('EITF007');
    if (await prisma.loanAdvance.findFirst({ where: { employeeId: shakirId, reason: 'Demo advance' } })) ms++;
    else {
      const loan = await payrollSvc.requestLoan(actors.get('EITF007'), { type: 'ADVANCE', amount: 10000, tenureMonths: 5, reason: 'Demo advance' });
      await payrollSvc.reviewLoan(admin, loan.id, { status: 'APPROVED', note: 'Approved (demo)' });
      mc++;
    }
    const claims = [
      { code: 'EITF001', category: 'Travel', amount: 1200, description: 'Demo: client visit travel', approve: true },
      { code: 'EITF004', category: 'Internet', amount: 800, description: 'Demo: monthly internet bill', approve: false },
    ];
    for (const c of claims) {
      if (await prisma.reimbursementClaim.findFirst({ where: { employeeId: ids.get(c.code), description: c.description } })) { ms++; continue; }
      const claim = await payrollSvc.submitReimbursement(actors.get(c.code), { category: c.category, amount: c.amount, description: c.description });
      if (c.approve) await payrollSvc.reviewReimbursement(admin, claim.id, { status: 'APPROVED' }); // SUPER_ADMIN satisfies HR+CEO steps
      mc++;
    }
    done('loan/reimbursement records', mc, ms);

    // ---- 9. Optional extras ---------------------------------------------------------------
    log('\n[9] Extras (asset, ticket, announcement)');
    let xc = 0, xs = 0;
    let asset = await prisma.asset.findFirst({ where: { companyId: cid, assetTag: 'DEMO-LAP-001' } });
    if (!asset) {
      asset = await lifecycleSvc.createAsset(admin, {
        assetTag: 'DEMO-LAP-001', type: 'LAPTOP', name: 'Demo Laptop 14"', brand: 'DemoBrand', model: 'D-14',
        serialNo: 'DEMO-SN-0001', purchaseDate: '2026-04-01', purchaseCost: 55000, notes: 'Demo asset',
      });
      xc++;
    } else xs++;
    if (asset.status !== 'ALLOCATED') {
      await lifecycleSvc.allocate(admin, asset.id, { employeeId: ids.get('EITF002') });
      xc++;
    } else xs++;
    const subject = 'Demo: VPN not connecting from home';
    if (await prisma.ticket.findFirst({ where: { companyId: cid, subject } })) xs++;
    else {
      await growthSvc.createTicket(actors.get('EITF006'), { category: 'IT', priority: 'MEDIUM', subject, description: 'Demo ticket raised from the seed script.' });
      xc++;
    }
    const title = 'Welcome to EITF HRMS (demo data)';
    if (await prisma.announcement.findFirst({ where: { companyId: cid, title } })) xs++;
    else {
      // no service exists for announcements - direct Prisma
      await prisma.announcement.create({
        data: { companyId: cid, title, body: 'This is a demo/training instance. All people, numbers and documents are fake.', audience: 'ALL', createdBy: admin.id },
      });
      xc++;
    }
    done('asset/ticket/announcement items', xc, xs);

    // ---- final counts ---------------------------------------------------------------------
    log('\nEntity counts in this database:');
    const counts = {
      employees: await prisma.employee.count({ where: { companyId: cid } }),
      users: await prisma.user.count({ where: { companyId: cid } }),
      holidays: await prisma.holiday.count({ where: { companyId: cid } }),
      attendanceRecords: await prisma.attendanceRecord.count({ where: { employee: { companyId: cid } } }),
      leaveTypes: await prisma.leaveType.count({ where: { companyId: cid } }),
      leaveBalances: await prisma.leaveBalance.count({ where: { companyId: cid } }),
      leaveApplications: await prisma.leaveApplication.count({ where: { companyId: cid } }),
      payrollRuns: await prisma.payrollRun.count({ where: { companyId: cid } }),
      payrollLines: await prisma.payrollLine.count({ where: { companyId: cid } }),
      loans: await prisma.loanAdvance.count({ where: { companyId: cid } }),
      reimbursements: await prisma.reimbursementClaim.count({ where: { companyId: cid } }),
      assets: await prisma.asset.count({ where: { companyId: cid } }),
      tickets: await prisma.ticket.count({ where: { companyId: cid } }),
      announcements: await prisma.announcement.count({ where: { companyId: cid } }),
    };
    for (const [k, v] of Object.entries(counts)) log(`  ${k}: ${v}`);
    log('\nDone. Demo logins are in DEMO-LOGINS.local.md (repo root, gitignored).');
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
