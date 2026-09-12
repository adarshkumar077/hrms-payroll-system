export const NAV: { group: string; items: { label: string; to: string; icon: string }[] }[] = [
  { group: "Command", items: [{ label: "CEO Cockpit", to: "/", icon: "🛰️" }] },
  {
    group: "CRM",
    items: [
      { label: "Leads", to: "/leads", icon: "🎯" },
      { label: "Opportunities", to: "/opportunities", icon: "💼" },
      { label: "Accounts", to: "/accounts", icon: "🏢" },
      { label: "Contacts", to: "/contacts", icon: "📇" },
      { label: "Quotations", to: "/quotations", icon: "📝" },
      { label: "Tickets", to: "/tickets", icon: "🎫" },
      { label: "Activities", to: "/activities", icon: "🗓️" },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Employees", to: "/employees", icon: "👥" },
      { label: "Leave", to: "/leave", icon: "🏖️" },
      { label: "Attendance", to: "/attendance", icon: "🕘" },
      { label: "Payroll", to: "/payroll", icon: "💰" },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "Inventory", to: "/inventory", icon: "📦" },
      { label: "Purchase Orders", to: "/inventory/purchase-orders", icon: "🛒" },
      { label: "Warehouses", to: "/warehouses", icon: "🏬" },
    ],
  },
  {
    group: "Money",
    items: [
      { label: "GST Invoices", to: "/invoices", icon: "🇮🇳" },
      { label: "Vendor Bills", to: "/bills", icon: "🧾" },
      { label: "Bank", to: "/bank", icon: "🏦" },
      { label: "Financial Reports", to: "/reports", icon: "📊" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { label: "AI Console", to: "/ai", icon: "✨" },
      { label: "Copilot", to: "/copilot", icon: "💬" },
    ],
  },
  {
    group: "Admin",
    items: [
      { label: "Team", to: "/team", icon: "👤" },
      { label: "Settings", to: "/settings", icon: "⚙️" },
    ],
  },
];
