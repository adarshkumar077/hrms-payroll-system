# UNIFIED-MERGE.md — HRMS + CRM + Enterprise Attendance

**Target:** `C:\Users\Aadarsh\Projects\eitf-hrms`  
**CRM source (read-only clone):** `C:\Users\Aadarsh\Projects\_crm-source-readonly` (copied from `D:\CRM`)  
**Original `D:\CRM`:** never modified

## Result

One unified NestJS + Next.js app:

| Area | Status |
|------|--------|
| Single login | HRMS JWT (`SUPER_ADMIN` / HR / Employee) |
| Single sidebar | CRM + Attendance + existing HRMS modules |
| No iframe | Native `/crm` and `/attendance` routes |
| CRM | Native CRM module + **CRM Dashboard** at `/crm` |
| Enterprise Attendance | Selfie + mandatory GPS + address + maps + OT + earnings + sheet |
| Production build | `npm run build:api` and `npm run build:web` both pass |

## CRM

- Sidebar **CRM → CRM Dashboard** opens `/crm`
- Modules: leads, deals, customers, pipeline, follow-ups, tasks, notes, sales reports
- APIs under `/api/v1/crm/*`
- Orbit CRM at `D:\CRM` was cloned for reference; HRMS already hosts an integrated CRM (not a second login)

## Enterprise Attendance

### Schema
- Check-in/out: lat, lng, address, selfie URL, Google Maps URL
- `workMinutes`, `overtimeMinutes`, `todaysEarnings`
- `AttendanceAuditLog` for every mark/edit

### Employee mark (`/attendance/mark`)
- Selfie + live GPS **required**
- Reverse-geocoded full address
- Blocked if location permission denied

### HR
- Manual attendance (`POST /attendance/manual`)
- Console with selfie + maps
- Attendance Sheet (`/attendance/sheet`): Date, Day, In Time–Location, Out Time–Location, Status, Working Hours, Overtime, Today's Earnings
- Audit endpoints

### Auto calculations
- Working hours from check-in/out
- Overtime vs scheduled day / shift
- Today's earnings from daily salary + OT multiplier

## Database

Dedicated embedded Postgres for this project:

- Port **5435** (avoids conflict with other local clones on 5433)
- Data dir: `data/pg-hrms`
- `DATABASE_URL=postgresql://eitf:eitf_dev_password@localhost:5435/eitf_hrms?schema=public`

## Seed logins

| Role | User | Password |
|------|------|----------|
| Super Admin | `superadmin` | `Super@123` |
| Admin | `admin` | `Admin@123` |
| HR | `hr001` | `HR@123` |
| Employee | `emp001` | `Emp@123` |

## Run

```powershell
cd C:\Users\Aadarsh\Projects\eitf-hrms
npm run db:up          # keep open — :5435
npm run dev:api        # :3001
npm run dev:web        # :3000
```

## Build

```powershell
npm run build:api
npm run build:web
```

Both completed successfully (2026-09-07).
