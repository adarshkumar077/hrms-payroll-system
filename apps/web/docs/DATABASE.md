# Database design notes

## Multi-tenancy

Every business table carries `company_id` (or is reached only via a tenant-owned parent). JWT payload includes `companyId`; services always scope queries by it.

## Core domains (Prisma)

```
Company
 ├─ CompanySetting / CompanyPolicy
 ├─ User / Role / UserRole / RefreshToken / OtpChallenge
 ├─ Employee (+ personal, employment, bank, government, documents)
 ├─ Holiday / Shift / AttendanceRecord / AttendancePunch
 ├─ LeaveType / LeaveBalance / LeaveApplication
 ├─ SalaryComponent / EmployeeSalaryStructure / PayrollRun / PayrollLine
 ├─ EsdLedgerEntry / LoanAdvance / ReimbursementClaim
 ├─ OnboardingChecklist / Asset / Resignation / FnfSettlement
 ├─ PerformanceGoal / Training / Ticket
 ├─ Notification / Announcement / DashboardMetricsCache
 ├─ ApprovalWorkflow / ApprovalInstance / ApprovalAction
 ├─ BackupRun
 ├─ IntegrationConfig / IntegrationEventLog
 ├─ AiChatMessage / ResumeScreening
 └─ AuditLog
```

## Migrations

Located in `apps/api/prisma/migrations/` — numbered by phase (`phase1_foundation` … `phase12_integrations_ai`).

Apply:

```bash
npm run prisma:deploy -w @eitf/api
```

## ERD

Generate visually:

```bash
npx prisma studio -w @eitf/api
# or: npx prisma generate && use your preferred ERD tool on schema.prisma
```

Authoritative schema: `apps/api/prisma/schema.prisma`.
