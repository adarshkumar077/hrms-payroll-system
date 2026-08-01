# EITF HRMS — User Manuals (by portal / role)

## Shared login

1. Open the web app (default `http://localhost:3000`) or mobile app.
2. Sign in with username + password (OTP login also available on API).
3. If 2FA is enabled for your account, enter the authenticator code.
4. Super Admin may enforce 2FA company-wide under **Security**.

**First install:** If no Super Admin exists, complete the **Initial Super Admin Setup** on the login page. No default credentials are provided.

---

## Employee portal

**Web:** ESS, My Profile, Leave apply, Attendance mark, Payslips, Loans, Expenses, Assets, Exit, Trainings, Tickets, Notifications  
**Mobile:** Home → Attendance, Leave, Payslips, Documents, Notifications, Self-Service, Profile

| Task | Where |
|---|---|
| Punch / mark attendance | Attendance (web/mobile) |
| Apply leave | Leave → Apply |
| View payslips | Payslips / ESS |
| Upload/view documents | My Documents |
| Raise ticket | Helpdesk |
| Resign | Exit |

Editable profile fields are limited (personal email, address, emergency). Other changes: contact HR.

---

## Manager portal

Roles: `MANAGER` (often also CEO/HR)

| Task | Where |
|---|---|
| Approve leave / loans / expenses / resignations | **Approvals Inbox** (web) or Mobile → Approvals |
| Team attendance | Mobile → Team Attendance; web Attendance console |
| Team reports snapshot | Mobile → Team Reports; web Reports |
| Goals / reviews | Performance |

---

## HR portal

Roles: `HR`, `CEO`

| Task | Where |
|---|---|
| Company profile & business rules | Company Settings |
| Employees & documents | Employees |
| Holidays, shifts, attendance corrections | Holidays / Shifts / Attendance |
| Onboarding checklists + AI resume screen | Onboarding |
| Assets, exit & F&F | Assets / Exit |
| Workflow chains | Workflow Config |
| Security, audit, backups | Security |
| Integrations (ESSL, SMS, calendar…) | Integrations |

All thresholds (grace minutes, leave credit, lockout, etc.) live in **Company Settings** — never hardcode.

---

## Finance portal

Roles: `FINANCE`, `CEO`, `HR`

| Task | Where |
|---|---|
| CTC structures | Payroll → CTC |
| Payroll generate → review → lock | Payroll |
| ESD / loans / reimbursements | ESD, Loans, Reimbursements |
| Compliance registers (PF/ESIC/PT/TDS…) | Compliance |
| Payroll AI anomalies | Payroll (anomaly panel) |
| Accounting export stub | Integrations → Export payroll |

---

## Admin / CEO

| Task | Where |
|---|---|
| Full analytics + AI predictions | Analytics |
| Security policy, IP allow-list, 2FA enforce | Security |
| Backups | Security → Run backup |
| Reports & balance sheets + AI summary | Reports |
| Ask HR AI chatbot | Dashboard → **Ask HR AI** |

---

## Mobile notes

- Login lands on a role-gated hub.
- Managers see Approvals / Team Attendance / Reports.
- API base URL: `EXPO_PUBLIC_API_URL` (default `http://localhost:3001/api/v1`). On a physical device, use your LAN IP.
