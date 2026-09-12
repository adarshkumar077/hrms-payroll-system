# Vendor: Orbit CRM (exact embed from CRM-CLONE)

**Source clone:** `C:\Users\Aadarsh\Projects\CRM-CLONE` (verbatim copy of `D:\CRM`)  
**Embedded at:** `vendor/orbit-crm/`  
**Host app:** EITF HRMS (`apps/api` + `apps/web`) — **not rebuilt**; CRM opens from HRMS sidebar under single login.

## Rules
- Do **not** modify `D:\CRM`.
- `CRM-CLONE` remains the standalone identical copy (includes `.git`).
- This `vendor/orbit-crm` tree is the in-repo merge of that clone (`.git` excluded to avoid nested repos).
- Runtime CRM UX/API is served by HRMS (`/crm/*`, `/api/v1/crm/*`) with one JWT session and one sidebar.
- Use this vendor tree as the reference implementation / asset source for Orbit Business OS CRM features.

## Mapping (Orbit → HRMS)

| Orbit (vendor) | HRMS route |
|----------------|------------|
| Leads | `/crm/leads` |
| Opportunities / Deals | `/crm/deals` |
| Accounts | `/crm/customers` |
| Pipeline | `/crm/pipeline` |
| Activities / Tasks | `/crm/tasks` |
| Follow-ups | `/crm/follow-ups` |
| Notes | `/crm/notes` |
| Reports | `/crm/reports` |
| CRM home | `/crm` |

Auth: HRMS `SUPER_ADMIN` / `HR` / `ADMIN` (employees: tasks + assigned leads only).
