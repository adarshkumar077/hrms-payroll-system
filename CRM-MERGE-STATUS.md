# CRM clone + HRMS merge (2026-09-07)

## Exact clone
| Item | Path |
|------|------|
| Source (untouched) | `D:\CRM` |
| Identical clone | `C:\Users\Aadarsh\Projects\CRM-CLONE` |
| Verification | 13666 files; `.git`, `node_modules`, `.env`, `app`, `prisma`, `lib` present; `package.json` SHA match |

## Merge into HRMS (no HRMS rebuild)
| Item | Path |
|------|------|
| Host | `C:\Users\Aadarsh\Projects\eitf-hrms` |
| Embedded CRM tree | `vendor/orbit-crm/` (from CRM-CLONE; `.git` excluded) |
| Runtime CRM | HRMS `/crm/*` + `/api/v1/crm/*` |
| Login | Single HRMS JWT |
| Sidebar | CRM group → CRM Dashboard first |

See `vendor/ORBIT-CRM.md` for Orbit→HRMS route mapping.
