# Phase 9 — Governance (Workflow & Approval Engine)

## Status: COMPLETE

| Module | Item | Status |
|---|---|---|
| 24 | Workflows + chain steps + instances + actions | Done |
| 24 | `POST /workflows/:type/config`, `POST /approvals/:id/act` | Done |
| 24 | Retrofitted leave, loan/advance, expense, resignation | Done |
| 24 | Notifications on approval transitions | Done |
| UI | Workflow config + Approvals inbox | Done |

## Verified

- Migration `20260713200000_phase9_workflows` applied
- 6 default workflows seeded
- ADVANCE loan requested → Approvals Inbox → **APPROVED** → loan **ACTIVE** (3 EMIs)

## Try it

1. Dashboard → **Workflow Config** (defaults seeded)
2. Employee submits leave / loan / expense
3. Dashboard → **Approvals Inbox** → Approve/Reject
4. Or use legacy module queues (they sync the engine)

## Next

**Phase 10 — Reporting:** Reports & Balance Sheets (22) — see `docs/PHASE10.md` (COMPLETE)

