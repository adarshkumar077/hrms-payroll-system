export type NavItem = { label: string; href: string; icon: string; module: string };
export type NavGroup = { group: string; items: NavItem[] };

// `module` is the RBAC module key checked via can(session, module, "read").
// Nav filtering happens server-side in allowedNav() (lib/rbac-nav.ts).
export const NAV: NavGroup[] = [
  {
    group: "Command",
    items: [{ label: "CEO Cockpit", href: "/dashboard", icon: "🛰️", module: "dashboard" }],
  },
  {
    group: "CRM",
    items: [
      { label: "Leads", href: "/leads", icon: "🎯", module: "leads" },
      { label: "Opportunities", href: "/opportunities", icon: "💼", module: "opportunities" },
      { label: "Accounts", href: "/accounts", icon: "🏢", module: "accounts" },
      { label: "Contacts", href: "/contacts", icon: "👤", module: "contacts" },
      { label: "Quotations", href: "/quotations", icon: "🧾", module: "quotations" },
      { label: "Tickets", href: "/tickets", icon: "🎫", module: "tickets" },
      { label: "Contracts", href: "/contracts", icon: "📄", module: "contracts" },
      { label: "Installed Base", href: "/installed", icon: "🧰", module: "installed" },
      { label: "Calls", href: "/calls", icon: "📞", module: "calls" },
      { label: "Messages", href: "/messages", icon: "💬", module: "messages" },
      { label: "Products", href: "/products", icon: "🏷️", module: "products" },
      { label: "Activities", href: "/activities", icon: "✅", module: "activities" },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Employees", href: "/hr/employees", icon: "👥", module: "hr" },
      { label: "Leave & Attendance", href: "/hr/leave", icon: "🌴", module: "hr" },
      { label: "Payroll", href: "/payroll", icon: "💰", module: "payroll" },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "Inventory", href: "/inventory", icon: "📦", module: "inventory" },
      { label: "Purchase Orders", href: "/inventory/purchase-orders", icon: "🛒", module: "inventory" },
    ],
  },
  {
    group: "Money",
    items: [
      { label: "GST Invoices", href: "/finance/invoices", icon: "🇮🇳", module: "finance" },
      { label: "Vendor Bills (AP)", href: "/finance/bills", icon: "🧾", module: "finance" },
      { label: "Scan Bill (OCR)", href: "/finance/ocr", icon: "📸", module: "finance" },
      { label: "Bank Reconciliation", href: "/finance/bank", icon: "🏦", module: "finance" },
      { label: "Ledger & Journals", href: "/finance/ledger", icon: "📒", module: "finance" },
      { label: "Financial Reports", href: "/finance/reports", icon: "📊", module: "finance" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { label: "Ask Orbit (Copilot)", href: "/copilot", icon: "💬", module: "ai" },
      { label: "AI Console", href: "/ai", icon: "✨", module: "ai" },
    ],
  },
  {
    group: "Setup",
    items: [
      { label: "Studio", href: "/studio", icon: "🎛️", module: "studio" },
      { label: "Integrations", href: "/integrations", icon: "🔌", module: "integrations" },
      { label: "Documents", href: "/documents", icon: "📎", module: "documents" },
      { label: "Import / Export", href: "/import", icon: "📥", module: "import" },
      { label: "Admin & Users", href: "/admin", icon: "🛡️", module: "admin" },
      { label: "Billing", href: "/billing", icon: "💳", module: "billing" },
    ],
  },
];
