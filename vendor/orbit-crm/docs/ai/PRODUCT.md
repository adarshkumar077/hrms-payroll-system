# PRODUCT

**Problem:** Indian SMBs (10–200 employees) run on 4–6 disconnected tools — CRM, a payroll app, Tally, spreadsheets, WhatsApp — so the CEO has no single source of truth and compliance (GST, PF/ESI, 2025 Labour Codes) is a monthly fire drill.

**Target user:** the SMB CEO/owner (primary buyer, lives in the cockpit) + their sales/HR/finance/ops staff. India-first.

**What it is:** one AI-native operating system unifying CRM/leads, HR, Payroll, Inventory, and GST-native Finance under a live CEO cockpit, with AI embedded in workflows.

## Tie-breaking principles
1. **Unify over point-solve.** The cross-module "one screen" is the whole thesis — never build a feature that only makes sense in isolation.
2. **Native GST/payroll compliance is the moat.** Correctness beats speed; statutory maths (`lib/compliance/`) is sacred.
3. **AI is a suggestion into a human-approved step** — never auto-send, auto-file, or auto-pay. Degrade gracefully, always.
4. **India-specific by default** (₹, GSTIN, HSN, PF/ESI, IndiaMART/JustDial), not a US SaaS reskin.
5. **SMB-simple:** a 25-person company should self-onboard in under 2 weeks, no consultant.

## NON-GOALS
- Manufacturing/MRP (BOM, shop floor), multi-country payroll/tax.
- A freeform "ask-anything" chatbot (the copilot classifies into fixed intents only).
- Rebuilding telephony/IVR or a public 3rd-party app store.
- Cloning SangamCRM feature-for-feature — build *past* it (see `sangamcrm-portal-audit.md`).

Full spec: `product-spec-prd.md`. Market rationale: `product-blueprint.md`.
