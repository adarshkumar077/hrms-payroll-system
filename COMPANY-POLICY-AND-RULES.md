# Enhance IT Infrastructure (EITF)
## Company Policy, Rules & Access Manual

These are the **system-enforced** rules from the EITF HRMS as of 8 September 2026. Super Admin or HR may change numbers in Company Settings; if they do, the system follows the new values.

This pack is for copy-paste into Word, email, onboarding letters, or the HRMS Company Policies screen.

---

# 1. Who we are

1. The organization is **Enhance IT Infrastructure (EITF)**.
2. Legal name in the system: **EITF Enhancing IT Infrastructure Pvt. Ltd.**
3. Country: India. Time zone: Asia/Kolkata. Currency: INR.
4. The product supports **one organization only**. There is no company selector.
5. All employees, attendance, leave, and payroll belong to this single company.

---

# 2. Roles

There are only four roles.

| Role | Who it is | Typical use |
|------|-----------|-------------|
| Super Admin | Platform owner | Full control: payroll generate/approve, users, studio, security, final reimbursement approve |
| Admin | Operations / reporting manager | Leave first approval (if they are the employee’s reporting manager), loans, some operations |
| HR | Human Resources | Employees, attendance corrections, leave second approval, onboarding, exit review, reports |
| Employee | Staff | Self-service: punch, leave, payslips, claims, tickets, AI assistant |

There is no separate CEO, Manager, or Finance role in the system. Super Admin is the highest role.

---

# 3. Who can access what

| Area | Super Admin | Admin | HR | Employee |
|------|-------------|-------|----|----------|
| Own dashboard | Yes | Yes (HR-style dashboard) | Yes | Yes (self-service dashboard) |
| Admin / Employee sidebar toggle | Yes | Yes | Yes | No (Employee view only) |
| Employee directory | Yes | View | Yes | No |
| Create / edit / lock employees | Yes | No | Yes | Own profile only |
| Mark own attendance (selfie + GPS) | Yes | Yes | Yes | Yes |
| Attendance console / corrections | Yes | Console view | Yes | No |
| Apply leave | — | — | — | Yes |
| Approve leave | Yes (any step) | Yes, if reporting manager (step 1) | Yes (step 2 / any pending) | No |
| Generate / approve payroll | Yes | No (API). Screen may show approve — system API is Super Admin only | No | View own payslips after approve |
| ESD / loans / reimbursements (own) | Yes | Yes | Yes | Yes |
| Loan review queue | Yes | Yes | Yes | No |
| Reimbursement final approve | Yes | No | View queue only | No |
| Onboarding / exit review | Yes | Limited | Yes | Resign via API; Exit page is for HR/Admin |
| Reports / compliance export | Yes | Yes | Yes | No |
| Studio (branding) | View + write | View | No | No |
| AI Assistant | Yes | Yes | Yes | Yes |
| AI Console | Yes | View | No | No |
| Integrations | Yes | Limited | Limited | No |
| Security / backups / audit | Yes | No | Nav may show Security; page is Super Admin only | No |
| Admin & Users | Yes | List / limited | No | No |
| Import | Yes | Yes | Yes | No |
| Export | Yes | Yes | Yes | Yes (own/allowed exports) |

---

# 4. Attendance policy

## 4.1 Office time

1. Reporting time: **10:15**.
2. End time: **18:30**.
3. Grace period: **0 minutes**. Punch after 10:15 is late (unless a shift assignment sets a different start/grace).
4. Full day: **8 hours** worked.
5. Half day: **4 hours** worked. Less than 4 hours is treated as **Absent**.

## 4.2 How to punch

1. Employees must punch from Mark Attendance.
2. Selfie, live GPS (latitude/longitude), and address are required.
3. Allowed methods by default: Manual, Selfie, Web, GPS. QR, geofence, and biometric can be enabled in settings.
4. Work from home (WFH) and on-duty (OD) are **not** self-punched. HR or Super Admin corrects the day’s status.

## 4.3 Late, half-day, ULOB

1. Late marking is **on**.
2. Every **3rd late** in the counting window turns that day into a **Half Day**.
3. On the **4th late** in a **6-month** rolling window, the day becomes **ULOB** (Unpaid Leave of Absence). The late counter resets; ULOB count increases.
4. Late is not applied on a weekly-off punch.

## 4.4 Week-off and holidays

1. Default weekly off: **Sunday**.
2. Company holidays are maintained in Holidays. Unpunched holiday days show as Holiday.
3. Unpunched Sunday shows as Week Off.

## 4.5 Day codes (what the sheet means)

| Code | Meaning |
|------|---------|
| P | Present |
| A | Absent |
| L | Late (still counted as present for daily pay) |
| HD | Half day |
| PL | Paid leave |
| ULOB | Unpaid leave of absence |
| WO | Week off |
| H | Holiday |
| WFH | Work from home (HR correction) |
| OD | Official duty (HR correction) |

## 4.6 Overtime and incentive

1. Overtime after scheduled hours is paid at **1.5 times**.
2. Monthly attendance incentive: **Rs 500**, enabled.
3. Incentive is paid only if late marks stay at **0** (max late marks allowed = 0).
4. Settings also say “no half day / no absent / no ULOB” for incentive; the calculator currently checks **late count only**. Treat zero late as the enforced rule.

## 4.7 SOP — Mark attendance

1. Open Attendance → Mark Attendance.
2. Allow camera and location.
3. Confirm address.
4. Punch IN at start of work; punch OUT at end of work.
5. Late, half-day, and ULOB apply automatically. Do not ask HR to ignore GPS unless they use Manual mark.

---

# 5. Leave policy

## 5.1 Leave types

| Code | Name | Rule |
|------|------|------|
| CL | Casual Leave | Needs approval |
| SL | Sick Leave | Needs approval **and attachment** |
| EL | Earned Leave | Needs approval; eligible for carry-forward |
| CO | Comp Off | Paid; balance check can be skipped |
| OTHER | Other | Needs a note; balance check can be skipped |

## 5.2 Accrual

1. First **6 months** (probation): **0** leave credited by the monthly accrual run.
2. At end of probation: **6 days** credited.
3. After that: **1 day per month**.
4. Carry-forward is **on**. Maximum in settings is 999 days (if the setting is missing, the service may use 12).
5. Leave expiry is **off**.
6. Accrual and carry-forward are started by HR/Super Admin in the system (they are not a silent nightly job).

## 5.3 Apply and withdraw

1. Employee applies from Leave → Apply (dates, type, optional half day = 0.5).
2. Employee may **withdraw** before final approval.
3. Balance = opening + accrued + carry-forward + adjustments − used − encashed.

## 5.4 Approval

1. Default chain: **Step 1 — Admin (reporting manager)** → **Step 2 — HR**.
2. Super Admin and HR may act on any pending step.
3. On final approve, leave is deducted from balance.

## 5.5 SOP — Apply leave

1. Open Leave → Apply.
2. Choose type and dates. Attach file for Sick Leave.
3. Submit. Wait for reporting manager, then HR.
4. To cancel a pending request, use Withdraw.

---

# 6. Payroll policy

## 6.1 Processing

1. Super Admin generates the monthly payroll run. Status starts as **Draft**.
2. Super Admin **approves** the run. After approve, the run is locked. Payslips become visible to employees.
3. Approved payslips are treated as **immutable**.
4. Loss of pay (LOP) is taken from **Basic**, in proportion to: Absent days + ULOB days + half of Half-Day days, over calendar days in the month.
5. Present for LOP purposes includes: Present, Paid Leave, WFH, OD.

## 6.2 Deductions and deposits (as configured in the employee’s payroll, not as Indian statute)

These are **toggles on each employee**. They are not a government PF/TDS engine.

| Item | Default in system |
|------|-------------------|
| PF | Off. If turned on: fixed **Rs 3,600** (not 12% of basic unless someone changes the mode to percent) |
| TDS | Off. If turned on: **1% of gross** |
| Professional Tax | Off. Amount 0 unless entered |
| ESD (security deposit) | Company default **Rs 500 / month** when enabled; employee config can override |
| Loan / advance EMI | Deducted if the loan is Active |
| Asset damage | Deducted if charged |
| Attendance incentive | Added if eligible (see attendance incentive) |

## 6.3 Payslips

Employees see payslips only after the run is **Approved** or **Locked**.

## 6.4 SOP — Run payroll (Super Admin)

1. Confirm CTC / payroll config and attendance for the month.
2. Open Payroll → Generate.
3. Review lines (LOP, PF, TDS, ESD, loans, claims).
4. Approve to lock and post deposits / loan recoveries.
5. Staff collect payslips from My Payslips.

---

# 7. Money & claims

1. **Loans / advances:** Employee submits. Super Admin, HR, or Admin review the queue.
2. **Reimbursements:** Employee submits. HR can see the queue. **Only Super Admin** can give the final system approve/reject.
3. **ESD:** Monthly deposit as configured. Annual interest rate default is **0%**.
4. **Assets:** HR/Super Admin allocate and take return. Damage charges can hit payroll.

---

# 8. Approvals (all types)

The system supports workflows for: **Leave, Loan, Advance, Expense, Salary, Resignation**.

| Process | Who completes it in practice |
|---------|------------------------------|
| Leave | Reporting Admin, then HR |
| Loan / Advance | Super Admin, HR, or Admin |
| Reimbursement / expense | Super Admin (final HTTP approve) |
| Salary / payroll lock | Super Admin |
| Resignation | Super Admin or HR review; F&F generate Super Admin/Admin/HR; F&F finalize Super Admin or Admin |
| Shift change | Super Admin, HR, or Admin |

Statuses: Pending, Approved, Rejected, Cancelled.

---

# 9. Employee lifecycle (SOP)

1. HR or Super Admin creates the employee (often on Probation).
2. Start onboarding checklist; mark tasks done.
3. Employee punches, applies leave, and is paid after payroll approve.
4. Goals, training, and helpdesk tickets as assigned.
5. Employee submits resignation (with documents if asked).
6. HR or Super Admin approve or reject.
7. Clearance steps and exit interview.
8. Generate Full & Final; Super Admin or Admin finalize.
9. Issue experience letter and relieving letter.

---

# 10. IT and security rules

1. Sign in with **User ID or email** (or employee code / mobile) and password. Mobile OTP exists; SMS is console-only unless a provider is connected.
2. Password minimum length: **5 characters**. Uppercase, number, and special character are **not** required unless Super Admin turns those flags on.
3. After **5** failed logins the account locks for **30 minutes**.
4. Session length: **8 hours** (480 minutes).
5. Two-factor (authenticator) is **optional** unless Super Admin requires it for Super Admin / HR / Admin.
6. Super Admin may set an IP allow-list (empty = all IPs allowed).
7. Do not share passwords. Change password from Account. Protected Super Admin cannot be deactivated or stripped of role.

---

# 11. Intelligence and setup (staff rules)

1. **EITF AI Assistant** is available to signed-in staff, including employees. Use it for HR/leave/attendance/payroll questions. Do not paste secrets.
2. **AI Console** (prompts, model, logs) is Super Admin write; Admin may view.
3. **Studio** (logo, colours, org name) is Super Admin write; Admin may view.
4. Company documents library and import/export follow the access table in section 3.

---

# 12. Short rules for notice boards

Copy these 12 lines as a poster:

1. Office time 10:15 to 18:30. No grace.
2. Punch with selfie and GPS.
3. Under 4 hours = Absent. Under 8 hours = Half Day.
4. 3 lates = Half Day. 4 lates in 6 months = ULOB.
5. Weekly off is Sunday unless Holidays say otherwise.
6. WFH / OD only if HR marks it.
7. Incentive Rs 500 only with zero late marks.
8. Leave: 6 months probation, then 6 days, then 1 day a month.
9. Sick leave needs a document. Manager then HR must approve.
10. Payroll is draft until Super Admin approves. Then payslips open.
11. PF, TDS, ESD follow each employee’s payroll switches, not assumed government rates.
12. Reimbursement final approve is Super Admin only.

---

*End of policy pack. Technical system detail lives in PRODUCT-POLICY-MANUAL.md.*
