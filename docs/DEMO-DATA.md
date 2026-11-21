# Demo / training dataset

`apps/api/scripts/demo/seed-demo.cjs` builds a complete, fake demo company so a customer demo or
training instance can be rebuilt with one command. **Demo/training only - never run it against a
production or real-customer database.** The script prints a warning banner and refuses to run when
`NODE_ENV=production` unless `--force-demo` is passed (only for a dedicated demo instance).

## Command

```bash
npm run build:api                # the script uses the compiled apps/api/dist (a running dev server keeps it fresh)
npm run demo:seed                # built-in values
npm run demo:seed -- --xlsx /path/to/attendance-payroll-all-2026-10.xlsx   # optional workbook
npm run demo:seed -- --pt-mh     # also set Professional-Tax state MH on the employees (off by default)
```

The script is idempotent: every step checks what already exists, so re-running is a no-op (it
prints "N created, M already present" per entity). It goes through the app's own services
(validation, audit log, late-conversion and payroll rules all apply). Direct Prisma is used only for
existence checks, the `forcePasswordChange=false` flag on demo users, and announcements (no service).

### `--xlsx` option

Without `--xlsx` the 7 employees, salaries, PF/deposit settings and October 2026 attendance come
from a small constant inside the script (identical to the original sheet). With `--xlsx` they are
read from the workbook (sheets "Employee Payroll", "PF & Security Deposit", "Daily Attendance").
Do not commit workbooks.

## What it creates

- Company EITF Enhancing IT Infrastructure Pvt. Ltd., state set to Maharashtra. Employees get no PT state by default (the source sheet has no professional tax); pass `--pt-mh` to apply Maharashtra PT.
- 7 employees EITF001-EITF007 (departments, designations, reporting lines, gender, dummy DOB, joined
  2026-04-01, work emails `first.last@eitf-demo.test`, mobiles `9000000001`-`9000000007`).
- Fake statutory/bank data: PAN `AAAPD000nA`, UAN `10000000000n`, bank "Demo Bank", IFSC `DEMO0000001`.
- Salary/PF/security-deposit configs per employee.
- Logins: Mukesh = HR, Rajesh = ADMIN, others = EMPLOYEE, one shared random password, no forced password change.
- 2026 holidays (Republic Day ... Christmas; "demo calendar - verify").
- Leave types, 2026 balances (CL 12, SL 6, EL 6), one APPROVED (Foram, 12-13 Nov, full approval chain),
  one PENDING (Saroja, 26 Nov) and one REJECTED (Shakir, 5 Nov, "Release week") leave.
- October 2026 attendance and payroll (regenerated and approved, which locks it and posts the security deposit).
- November 2026 attendance 1-20 (two late marks for Aadarsh, one absence for Shakir, Foram on leave),
  late reconciliation applied. November payroll is intentionally NOT generated.
- A Rs 10,000 advance for Shakir over 5 EMIs (first EMI next month), reimbursements (Mukesh Travel
  Rs 1,200 approved, Foram Internet Rs 800 pending), one laptop asset assigned to Aadarsh, one helpdesk
  ticket from Rani and a welcome announcement.

## Logins

Login ids, emails, roles and the generated password are written to `DEMO-LOGINS.local.md` in the
repository root. That file matches `*.local.md` in `.gitignore`, so it is never committed; the
password is never printed to the terminal. If the file is deleted while the users still exist, the next
run resets the demo users' password and rewrites the file. The existing `admin@eitf.in` account is not touched.

## Resetting a demo database

```bash
# 1. drop and recreate the (demo) database
# 2. apply migrations
npm run prisma:deploy -w @eitf/api   # prisma migrate deploy
# 3. base seed (company, roles, admin account)
npm run db:seed
# 4. demo data
npm run demo:seed
```

Delete `DEMO-LOGINS.local.md` before a rebuild so a fresh password is generated.
