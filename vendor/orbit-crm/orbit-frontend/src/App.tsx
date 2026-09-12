import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { LeadsPage } from "./pages/crm/LeadsPage";
import { OpportunitiesPage } from "./pages/crm/OpportunitiesPage";
import { AccountsPage } from "./pages/crm/AccountsPage";
import { TicketsPage } from "./pages/crm/TicketsPage";
import { ContactsPage } from "./pages/crm/ContactsPage";
import { QuotationsPage } from "./pages/crm/QuotationsPage";
import { ActivitiesPage } from "./pages/crm/ActivitiesPage";
import { EmployeesPage } from "./pages/hr/EmployeesPage";
import { LeavePage } from "./pages/hr/LeavePage";
import { AttendancePage } from "./pages/hr/AttendancePage";
import { PayrollPage } from "./pages/payroll/PayrollPage";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { PurchaseOrdersPage } from "./pages/inventory/PurchaseOrdersPage";
import { WarehousesPage } from "./pages/inventory/WarehousesPage";
import { InvoicesPage } from "./pages/finance/InvoicesPage";
import { BillsPage } from "./pages/finance/BillsPage";
import { BankPage } from "./pages/finance/BankPage";
import { ReportsPage } from "./pages/finance/ReportsPage";
import { AiConsolePage } from "./pages/ai/AiConsolePage";
import { CopilotPage } from "./pages/ai/CopilotPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TeamPage } from "./pages/TeamPage";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            {/* CRM */}
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/opportunities" element={<OpportunitiesPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/quotations" element={<QuotationsPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            {/* People */}
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            {/* Operations */}
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/inventory/purchase-orders" element={<PurchaseOrdersPage />} />
            <Route path="/warehouses" element={<WarehousesPage />} />
            {/* Money */}
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/bills" element={<BillsPage />} />
            <Route path="/bank" element={<BankPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            {/* Intelligence */}
            <Route path="/ai" element={<AiConsolePage />} />
            <Route path="/copilot" element={<CopilotPage />} />
            {/* Admin */}
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
