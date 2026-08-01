# Phase 6 — Lifecycle (Onboarding, Assets, Exit & F&F)

## Status: COMPLETE

| Module | Item | Status |
|---|---|---|
| 15 | Onboarding checklist auto-start on hire + task tracking | Done |
| 16 | Assets CRUD, allocate/return, damage → payroll/F&F | Done |
| 21 | Resignation, clearance, F&F, experience/relieving letters | Done |
| UI | Web onboarding / assets / exit + mobile assets & resign | Done |

## Verified

- Migration `20260713140000_phase6_lifecycle` applied
- Onboarding checklist started for EITF001
- Asset `LAP-P6-1` created and allocated
- Full exit path: resign → approve → clearance → F&F → **FINALIZED** (netPayable **23500**)

## Try it

1. **Onboarding** — create employee (auto checklist) or Dashboard → Onboarding → Start
2. **Assets** — create → allocate → return / damage charge
3. **Exit** — employee resigns → HR approve → clear all steps → Generate F&F → Finalize
4. Letters: `/exit/:id/letters`

CEO: `ceo@eitf.local` / `ChangeMe@123`

## Next

**Phase 7 — Growth & ops:** Performance (17), Training (18), Helpdesk (20)
