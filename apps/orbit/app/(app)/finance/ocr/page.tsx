import { requireSession } from "@/lib/auth";
import { ocrConfigured, ocrModelLabel } from "@/lib/ocr";
import { PageHeader, Badge } from "@/components/ui";
import { ScanBill } from "./ScanBill";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function ScanBillPage() {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;

  return (
    <div>
      <PageHeader
        title="Scan Bill (OCR)"
        subtitle="Upload a vendor bill image → AI extracts the fields → review → save as a Draft vendor bill."
      />

      <div className="card p-4 mb-6 border-l-4 border-l-brand-600">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ocrConfigured ? "green" : "amber"}>
            {ocrConfigured ? `Vision OCR: ${ocrModelLabel}` : "Manual mode — set OCR_MODEL in .env for AI extraction"}
          </Badge>
          <span className="text-sm text-slate-600">
            {ocrConfigured
              ? "The image is sent to the configured vision model and the fields below are pre-filled for your review."
              : "No vision model configured — the form below opens editable and empty; fill it in manually."}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          AI extraction is always a suggestion — nothing is saved until you review and confirm the form.
        </p>
      </div>

      <ScanBill />
    </div>
  );
}
