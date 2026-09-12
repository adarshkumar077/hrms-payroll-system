import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportCard } from "./ImportCard";
import { importLeadsAction, importEmployeesAction, importItemsAction } from "./actions";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const LEADS_COLUMNS = ["name", "company", "email", "phone", "source", "status"];
const EMPLOYEES_COLUMNS = ["code", "name", "email", "department", "designation", "ctc"];
const ITEMS_COLUMNS = ["name", "sku", "hsn", "onHand", "reorderLevel", "costPrice"];

const LEADS_SAMPLE = `name,company,email,phone,source,status
Ravi Kumar,Kumar Traders,ravi@kumartraders.in,9876543210,IndiaMART,New
Priya Shah,Shah Textiles,priya@shahtextiles.in,9123456780,Website,Contacted`;

const EMPLOYEES_SAMPLE = `code,name,email,department,designation,ctc
EMP0001,Anita Desai,anita@company.in,Sales,Executive,480000
EMP0002,Vikram Rao,vikram@company.in,Engineering,Senior Engineer,900000`;

const ITEMS_SAMPLE = `name,sku,hsn,onHand,reorderLevel,costPrice
Steel Bracket 5mm,SKU-1001,7326,250,50,45.50
Cardboard Box Large,SKU-1002,4819,1000,200,12.75`;

const EXPORT_MODELS: { key: string; label: string; icon: string }[] = [
  { key: "leads", label: "Leads", icon: "🎯" },
  { key: "employees", label: "Employees", icon: "👥" },
  { key: "items", label: "Items (Inventory)", icon: "📦" },
  { key: "invoices", label: "Invoices", icon: "🇮🇳" },
];

export default async function ImportExportPage() {
  const s = await requireSession();
  if (!(await can(s, "import", "read"))) return <NoAccess label="Import" />;

  return (
    <div>
      <PageHeader title="Import / Export" subtitle="Bulk-load data via CSV, or export current records." />

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Import</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <ImportCard
          title="Leads"
          icon="🎯"
          columns={LEADS_COLUMNS}
          sampleCsv={LEADS_SAMPLE}
          action={importLeadsAction}
        />
        <ImportCard
          title="Employees"
          icon="👥"
          columns={EMPLOYEES_COLUMNS}
          sampleCsv={EMPLOYEES_SAMPLE}
          action={importEmployeesAction}
        />
        <ImportCard
          title="Items"
          icon="📦"
          columns={ITEMS_COLUMNS}
          sampleCsv={ITEMS_SAMPLE}
          action={importItemsAction}
        />
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Export</h2>
      <div className="card p-4">
        <p className="text-xs text-slate-500 mb-3">
          Download all of your tenant&apos;s records for a module as a CSV file.
        </p>
        <div className="flex flex-wrap gap-2">
          {EXPORT_MODELS.map((m) => (
            <a key={m.key} className="btn-ghost" href={`/api/export/${m.key}`}>
              {m.icon} Export {m.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
