import { db } from "@/lib/db";

/**
 * Orbit Studio — default tenant configuration.
 *
 * ensureStudioDefaults() lazily writes a config that reproduces today's
 * hardcoded behavior EXACTLY (same labels, same option values, same order),
 * so unconfigured tenants see zero change. Same lazy pattern as gl.ts's
 * ensureChart(). Idempotent and safe under concurrent first requests
 * (unique constraints + create-catch).
 *
 * Option `category` is the semantic anchor business logic keys on
 * (won/lost/open/converted/dead/marketplace/...) — labels and values are
 * tenant-editable, categories are not.
 */

export const DEFAULT_MODULES: {
  module: string;
  labelSingular: string;
  labelPlural: string;
  navGroup: string;
  navOrder: number;
}[] = [
  { module: "dashboard", labelSingular: "CEO Cockpit", labelPlural: "CEO Cockpit", navGroup: "Command", navOrder: 0 },
  { module: "leads", labelSingular: "Lead", labelPlural: "Leads", navGroup: "CRM", navOrder: 10 },
  { module: "opportunities", labelSingular: "Opportunity", labelPlural: "Opportunities", navGroup: "CRM", navOrder: 11 },
  { module: "accounts", labelSingular: "Account", labelPlural: "Accounts", navGroup: "CRM", navOrder: 12 },
  { module: "contacts", labelSingular: "Contact", labelPlural: "Contacts", navGroup: "CRM", navOrder: 13 },
  { module: "quotations", labelSingular: "Quotation", labelPlural: "Quotations", navGroup: "CRM", navOrder: 14 },
  { module: "tickets", labelSingular: "Ticket", labelPlural: "Tickets", navGroup: "CRM", navOrder: 15 },
  // Wave C: Service & AMC suite module registrations (contracts owns this
  // entry; the "installed" module's pages are a parallel agent's task this
  // wave — this entry just reserves the module/nav slot for them).
  { module: "contracts", labelSingular: "Contract", labelPlural: "Contracts", navGroup: "CRM", navOrder: 16 },
  { module: "installed", labelSingular: "Installed Product", labelPlural: "Installed Base", navGroup: "CRM", navOrder: 17 },
  // Wave D: telephony + WhatsApp/SMS module registrations.
  { module: "calls", labelSingular: "Call", labelPlural: "Calls", navGroup: "CRM", navOrder: 18 },
  { module: "messages", labelSingular: "Message", labelPlural: "Messages", navGroup: "CRM", navOrder: 19 },
  { module: "products", labelSingular: "Product", labelPlural: "Products", navGroup: "CRM", navOrder: 20 },
  { module: "hr", labelSingular: "Employee", labelPlural: "Employees", navGroup: "People", navOrder: 20 },
  { module: "payroll", labelSingular: "Payroll", labelPlural: "Payroll", navGroup: "People", navOrder: 21 },
  { module: "inventory", labelSingular: "Inventory", labelPlural: "Inventory", navGroup: "Operations", navOrder: 30 },
  { module: "finance", labelSingular: "Finance", labelPlural: "Finance", navGroup: "Money", navOrder: 40 },
  { module: "ai", labelSingular: "AI", labelPlural: "AI", navGroup: "Intelligence", navOrder: 50 },
  { module: "studio", labelSingular: "Studio", labelPlural: "Studio", navGroup: "Setup", navOrder: 59 },
  { module: "integrations", labelSingular: "Integration", labelPlural: "Integrations", navGroup: "Setup", navOrder: 60 },
  { module: "documents", labelSingular: "Document", labelPlural: "Documents", navGroup: "Setup", navOrder: 61 },
  { module: "import", labelSingular: "Import / Export", labelPlural: "Import / Export", navGroup: "Setup", navOrder: 62 },
  { module: "admin", labelSingular: "Admin", labelPlural: "Admin & Users", navGroup: "Setup", navOrder: 63 },
  { module: "billing", labelSingular: "Billing", labelPlural: "Billing", navGroup: "Setup", navOrder: 64 },
];

type DefaultOption = {
  value: string;
  label?: string; // defaults to value
  category?: string;
  tone?: string;
  isDefault?: boolean;
  meta?: Record<string, unknown>;
};

export const DEFAULT_PICKLISTS: { key: string; label: string; options: DefaultOption[] }[] = [
  {
    key: "lead_status",
    label: "Lead Status",
    options: [
      { value: "New", category: "open", tone: "blue", isDefault: true },
      { value: "Contacted", category: "open", tone: "amber" },
      { value: "Qualified", category: "open", tone: "violet" },
      { value: "Converted", category: "converted", tone: "emerald" },
      { value: "Dead", category: "dead", tone: "slate" },
    ],
  },
  {
    key: "opportunity_stage",
    label: "Pipeline Stage",
    options: [
      { value: "Qualification", category: "open", tone: "blue", isDefault: true, meta: { probability: 20 } },
      { value: "Proposal", category: "open", tone: "amber", meta: { probability: 50 } },
      { value: "Negotiation", category: "open", tone: "violet", meta: { probability: 75 } },
      { value: "ClosedWon", label: "Closed Won", category: "won", tone: "emerald", meta: { probability: 100 } },
      { value: "ClosedLost", label: "Closed Lost", category: "lost", tone: "rose", meta: { probability: 0 } },
    ],
  },
  {
    key: "ticket_status",
    label: "Ticket Status",
    options: [
      // Tones mirror the live UI (tickets page statusTone map), not guesses —
      // dev DBs seeded before this fix keep old tones until db:reset (unused for
      // ticket badges today, so no visual impact either way).
      { value: "Open", category: "open", tone: "amber", isDefault: true },
      { value: "InProgress", label: "In Progress", category: "open", tone: "blue" },
      { value: "Resolved", category: "closed", tone: "emerald" },
      { value: "Closed", category: "closed", tone: "slate" },
    ],
  },
  {
    key: "ticket_priority",
    label: "Ticket Priority",
    options: [
      // Wave C (C5): meta.slaHours drives ticket SLA due-date computation
      // (lib/contracts-automation.ts's ticketSlaHours/computeSlaDueAt) —
      // same config-as-data pattern as opportunity_stage's meta.probability.
      // These numbers ARE the legacy fallback (LEGACY_TICKET_SLA_HOURS in
      // that file, kept in sync deliberately) — there was no prior
      // priority→hours mapping in the app; these mirror the exact hour
      // values CreateTicketForm's manual SLA dropdown already offered
      // (4/8/24/48), assigned in conventional severity order.
      { value: "Low", category: "low", tone: "slate", meta: { slaHours: 48 } },
      { value: "Medium", category: "medium", tone: "blue", isDefault: true, meta: { slaHours: 24 } },
      { value: "High", category: "high", tone: "amber", meta: { slaHours: 8 } },
      { value: "Urgent", category: "critical", tone: "rose", meta: { slaHours: 4 } },
    ],
  },
  {
    key: "lead_source",
    label: "Lead Source",
    options: [
      { value: "Manual", category: "manual", tone: "slate", isDefault: true },
      { value: "Website", category: "inbound", tone: "blue" },
      { value: "WhatsApp", category: "inbound", tone: "emerald" },
      { value: "IndiaMART", category: "marketplace", tone: "amber" },
      { value: "JustDial", category: "marketplace", tone: "amber" },
      { value: "TradeIndia", category: "marketplace", tone: "amber" },
    ],
  },
  {
    key: "quotation_status",
    label: "Quotation Status",
    options: [
      { value: "Draft", category: "open", tone: "slate", isDefault: true },
      { value: "Sent", category: "open", tone: "blue" },
      { value: "Accepted", category: "won", tone: "emerald" },
      { value: "Rejected", category: "lost", tone: "rose" },
    ],
  },
  {
    key: "leave_type",
    label: "Leave Type",
    options: [
      { value: "Casual", tone: "blue", isDefault: true },
      { value: "Sick", tone: "amber" },
      { value: "Earned", tone: "emerald" },
      { value: "Unpaid", tone: "slate" },
    ],
  },
  {
    key: "activity_type",
    label: "Activity Type",
    options: [
      { value: "Task", tone: "blue", isDefault: true },
      { value: "Call", tone: "emerald" },
      { value: "Meeting", tone: "violet" },
      { value: "Note", tone: "slate" },
    ],
  },
  {
    // Wave A: lead Lost Reason — module "leads", also read by opportunities on close-lost.
    key: "lost_reason",
    label: "Lost Reason",
    options: [
      { value: "Price", category: "lost", tone: "rose", isDefault: true },
      { value: "Competitor", category: "lost", tone: "rose" },
      { value: "NoBudget", label: "No Budget", category: "lost", tone: "rose" },
      { value: "NoResponse", label: "No Response", category: "lost", tone: "rose" },
      { value: "NotAFit", label: "Not a Fit", category: "lost", tone: "rose" },
      { value: "Other", category: "lost", tone: "slate" },
    ],
  },
  {
    // Wave A: follow-up type on Lead/Opportunity (followUpType field).
    key: "follow_up_type",
    label: "Follow-up Type",
    options: [
      { value: "Call", category: "followup", tone: "emerald", isDefault: true },
      { value: "Email", category: "followup", tone: "blue" },
      { value: "Meeting", category: "followup", tone: "violet" },
      { value: "WhatsApp", category: "followup", tone: "emerald" },
      { value: "SiteVisit", label: "Site Visit", category: "followup", tone: "amber" },
    ],
  },
  {
    // Wave B: quotation builder's 7-stage lifecycle (Quotation.status field). Values
    // Draft/Sent/Accepted/Rejected are the pre-existing hardcoded set (see Quotation.status
    // comment + prisma/seed.ts quotation statuses) and MUST keep these exact value strings
    // so current rows map 1:1 — Under Review/Negotiation/Expired are new stages.
    key: "quotation_stage",
    label: "Quotation Stage",
    options: [
      { value: "Draft", category: "open", tone: "slate", isDefault: true },
      { value: "UnderReview", label: "Under Review", category: "open", tone: "amber" },
      { value: "Sent", category: "open", tone: "blue" },
      { value: "Negotiation", category: "open", tone: "violet" },
      { value: "Accepted", category: "won", tone: "emerald" },
      { value: "Rejected", category: "lost", tone: "rose" },
      { value: "Expired", category: "lost", tone: "slate" },
    ],
  },
  {
    // Wave C: ticket type (Ticket.typeKey field) — service/AMC vocabulary.
    key: "ticket_type",
    label: "Ticket Type",
    options: [
      { value: "AMCVisit", label: "AMC Visit", category: "service", tone: "emerald" },
      { value: "Breakdown", category: "reactive", tone: "rose" },
      { value: "Installation", category: "service", tone: "blue" },
      { value: "Delivery", category: "logistics", tone: "amber" },
      { value: "Survey", category: "service", tone: "violet" },
      { value: "SupportCall", label: "Support Call", category: "reactive", tone: "slate", isDefault: true },
    ],
  },
  {
    // Wave C: Contract.status field.
    key: "contract_status",
    label: "Contract Status",
    options: [
      { value: "Active", category: "active", tone: "emerald", isDefault: true },
      { value: "ExpiringSoon", label: "Expiring Soon", category: "active", tone: "amber" },
      { value: "Expired", category: "ended", tone: "rose" },
      { value: "Renewed", category: "ended", tone: "blue" },
      { value: "Cancelled", category: "ended", tone: "slate" },
    ],
  },
  {
    // Wave C: Contract.type field.
    key: "contract_type",
    label: "Contract Type",
    options: [
      { value: "AMC", category: "recurring", tone: "emerald", isDefault: true },
      { value: "Warranty", category: "recurring", tone: "blue" },
      { value: "OneTimeSupport", label: "One-time Support", category: "onetime", tone: "amber" },
      { value: "Project", category: "onetime", tone: "violet" },
    ],
  },
];

/**
 * Idempotently write default config for a tenant. Cheap when already present
 * (one count query). Never overwrites tenant edits — only fills gaps.
 */
export async function ensureStudioDefaults(tenantId: string): Promise<void> {
  // Missing-keys gate, not a raw count — same reasoning as the picklist top-up
  // below (C7 gate flagged the count comparison as the A6 anti-pattern: it only
  // works while nothing else ever creates ModuleConfig rows).
  const existingModuleKeys = new Set(
    (await db.moduleConfig.findMany({ where: { tenantId }, select: { module: true } })).map((m) => m.module)
  );
  if (!DEFAULT_MODULES.every((m) => existingModuleKeys.has(m.module))) {
    for (const m of DEFAULT_MODULES) {
      try {
        await db.moduleConfig.create({
          data: {
            tenantId,
            module: m.module,
            labelSingular: m.labelSingular,
            labelPlural: m.labelPlural,
            navGroup: m.navGroup,
            navOrder: m.navOrder,
          },
        });
      } catch {
        // exists (unique tenantId+module) — a concurrent request or earlier run created it
      }
    }
  }

  // Gated on missing keys (not a raw count) so tenants that already ran defaults
  // before new keys (e.g. lost_reason, follow_up_type) were added here still get
  // topped up — this loop is idempotent (create-catch) so it's safe to re-enter.
  // (A raw count comparison broke this: a tenant with extra/pre-existing picklists
  // could have havePicklists >= DEFAULT_PICKLISTS.length while still missing a key.)
  const existingKeys = new Set(
    (await db.picklistDef.findMany({ where: { tenantId }, select: { key: true } })).map((p) => p.key)
  );
  if (DEFAULT_PICKLISTS.every((pl) => existingKeys.has(pl.key))) return;

  for (const pl of DEFAULT_PICKLISTS) {
    let def = await db.picklistDef.findUnique({ where: { tenantId_key: { tenantId, key: pl.key } } });
    if (!def) {
      try {
        def = await db.picklistDef.create({ data: { tenantId, key: pl.key, label: pl.label, system: true } });
      } catch {
        def = await db.picklistDef.findUnique({ where: { tenantId_key: { tenantId, key: pl.key } } });
      }
    }
    if (!def) continue;
    for (let i = 0; i < pl.options.length; i++) {
      const o = pl.options[i];
      try {
        await db.picklistOption.create({
          data: {
            picklistDefId: def.id,
            value: o.value,
            label: o.label ?? o.value,
            tone: o.tone,
            category: o.category,
            meta: JSON.stringify(o.meta ?? {}),
            sortOrder: i,
            isDefault: !!o.isDefault,
          },
        });
      } catch {
        // option exists — never overwrite tenant edits
      }
    }
  }
}
