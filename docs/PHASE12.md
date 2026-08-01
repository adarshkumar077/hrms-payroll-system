# Phase 12 — Integrations, Mobile & AI

## Status: COMPLETE

| Module | Item | Status |
|---|---|---|
| 27 | Integrations (Email/SMS/WhatsApp stubs, ESSL devices, Google Calendar sync stub, Accounting export) | Done |
| 27 | AI service (chatbot, predictions, resume screen, payroll anomalies, performance insights, report summary) | Done |
| 27 | Web: Integrations page, Ask HR AI widget, AI panels on Analytics/Onboarding/Payroll/Performance/Reports | Done |
| 27 | Mobile: role-gated hub + Approvals / Team Attendance / Reports / Notifications | Done |

## API

### Integrations
- `GET/PUT /integrations/configs/:provider`
- `POST /integrations/{email\|sms\|whatsapp}/send`
- `POST /integrations/google-calendar/sync`
- `GET /integrations/accounting/export`
- `GET/POST /integrations/biometric/devices`
- Existing: `POST /integrations/biometric/:companyId/webhook`

### AI
- `POST /ai/chat` · `GET /ai/chat/history`
- `GET /ai/predictions`
- `POST /ai/resume/screen` · `GET /ai/resume/screenings`
- `GET /ai/payroll/anomalies`
- `GET /ai/performance/insights`
- `POST /ai/reports/:kind/summary`

Optional: set `OPENAI_API_KEY` (and `OPENAI_MODEL`) for LLM chatbot; otherwise rules engine.

## Verified

- Migration `20260713240000_phase12_integrations_ai`
- Integrations configs **6** · AI predictions attrition outlook · payroll anomalies endpoint OK

## Try it

1. Dashboard → **Ask HR AI** (bottom-right)
2. Dashboard → **Integrations**
3. Analytics / Onboarding / Payroll / Performance / Reports AI surfaces
4. Mobile: `npm run dev:mobile` → login as CEO → Manager section

## Master build

Phases **1–12 complete** for the Module 1–27 scope (modules 2 & 14 skipped).

**Next:** Phase 13 — Production packaging (manuals, deployment, export engine, EAS) — see `docs/PHASE13.md`
