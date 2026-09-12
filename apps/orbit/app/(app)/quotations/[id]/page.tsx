import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, options, optionTone, valuesByCategory } from "@/lib/studio/config";
import { computeQuote } from "@/lib/quote";
import { RecordShell } from "@/components/record/RecordShell";
import { InlineField, type InlineFieldOption } from "@/components/record/InlineField";
import { Timeline, type TimelineItem } from "@/components/record/Timeline";
import ConvertToInvoice from "@/components/quotations/ConvertToInvoice";
import { updateQuotationAction } from "../actions";
import { NewRevisionButton } from "./NewRevisionButton";
import { EditLinesSection } from "./EditLinesSection";
import { QuoteTotalsPanel } from "../QuoteTotalsPanel";
import type { LineRow, ProductOption } from "../LineGrid";

export const dynamic = "force-dynamic";

// Studio "quotation_stage" tone key -> components/ui.tsx Badge tone prop.
// Badge only knows slate/green/red/amber/blue/brand; the config's default
// tones (slate/amber/blue/violet/emerald/rose) don't map 1:1 so this covers
// every tone the default quotation_stage picklist uses (see lib/studio/defaults.ts).
const STAGE_TONE_TO_BADGE: Record<string, string> = {
  slate: "slate",
  amber: "amber",
  blue: "blue",
  violet: "brand",
  emerald: "green",
  rose: "red",
};

const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "quotation.created": (p) => (p.note as string) || "Quotation created",
  "quotation.status.changed": (p) => (p.note as string) || "Stage changed",
  "quotation.updated": (p) => `Updated ${(p.field as string) || "field"}`,
  "quotation.lines.updated": (p) => (p.note as string) || "Lines updated",
  "quotation.revision": (p) => (p.note as string) || "New revision",
  "quotation.converted": (p) => (p.note as string) || "Converted to invoice",
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "quotations", "read"))) return <NoAccess label="Quotations" />;

  const [quotation, config] = await Promise.all([
    db.quotation.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: {
        account: true,
        lines: { orderBy: { sortOrder: "asc" }, include: { product: true } },
      },
    }),
    getStudioConfig(s.tenantId),
  ]);
  if (!quotation) notFound();

  const [contact, products, events] = await Promise.all([
    quotation.contactId ? db.contact.findFirst({ where: { id: quotation.contactId, tenantId: s.tenantId } }) : null,
    db.product.findMany({ where: { tenantId: s.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, unitPrice: true, taxRate: true } }),
    db.eventLog.findMany({ where: { tenantId: s.tenantId, entity: "Quotation", entityId: quotation.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  // ── Lock rule (documented in full in ../actions.ts) ──
  // Fully locked once converted to an invoice: no edits at all. Short of
  // that, once the stage is in the "won"/"lost" category, lines + every
  // header field except `status` are locked — the stage can still be
  // reverted back to an "open" category value.
  const fullyLocked = !!quotation.convertedInvoiceId;
  const wonLostStages = valuesByCategory(config, "quotation_stage", "won", "lost");
  const linesLocked = !fullyLocked && wonLostStages.includes(quotation.status);

  const stageOptionsAll = options(config, "quotation_stage");
  const stageCategory = stageOptionsAll.find((o) => o.value === quotation.status)?.category ?? "open";
  const stageEditOptions: InlineFieldOption[] = (
    linesLocked
      ? stageOptionsAll.filter((o) => o.category === "open" || o.value === quotation.status)
      : stageOptionsAll
  ).map((o) => ({ value: o.value, label: o.label }));

  const result = computeQuote({
    lines: quotation.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate, optional: l.optional })),
    headerDiscount: quotation.discount,
    charges: quotation.charges,
    chargesTaxRate: quotation.chargesTaxRate,
    adjustment: quotation.adjustment,
  });

  const editableRows: LineRow[] = quotation.lines.map((l, i) => ({
    key: l.id,
    productId: l.productId ?? "",
    description: l.description,
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxRate: l.taxRate,
    uom: l.uom ?? "",
    optional: l.optional,
  }));
  const productOptions: ProductOption[] = products;

  const eventItems: TimelineItem[] = events.map((e) => {
    const payload = parsePayload(e.payload);
    return {
      id: e.id,
      kind: "Event",
      title: (EVENT_TITLES[e.type] ?? ((p: Record<string, unknown>) => (p.note as string) || e.type))(payload),
      at: e.createdAt,
    };
  });

  const header = (
    <div className="mb-4">
      <PageHeader
        title={quotation.number}
        subtitle={quotation.account?.name || "No account linked"}
        action={
          <div className="flex items-center gap-2">
            <NewRevisionButton quotationId={quotation.id} disabled={fullyLocked} />
            <ConvertToInvoice
              quotationId={quotation.id}
              stageCategory={stageCategory}
              converted={!!quotation.convertedInvoiceId}
              invoiceId={quotation.convertedInvoiceId}
            />
            <Link href="/quotations" className="btn-ghost">
              ← Back to quotations
            </Link>
          </div>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={STAGE_TONE_TO_BADGE[optionTone(config, "quotation_stage", quotation.status) || ""] || "slate"}>
          {quotation.status}
        </Badge>
        <Badge tone="slate">Rev {quotation.revisionNo}</Badge>
        {fullyLocked && <Badge tone="green">Converted to invoice</Badge>}
        {!fullyLocked && linesLocked && <Badge tone="amber">Locked — {stageCategory}</Badge>}
      </div>
    </div>
  );

  const left = (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-1">Details</div>
      {fullyLocked && <div className="text-xs text-slate-400 mb-2">Converted quotations are locked.</div>}
      {!fullyLocked && linesLocked && (
        <div className="text-xs text-slate-400 mb-2">Locked — only the stage can be reverted to an open stage.</div>
      )}
      <div className="divide-y divide-slate-100">
        <InlineField
          name="status"
          label="Stage"
          value={quotation.status}
          type="select"
          options={stageEditOptions}
          action={updateQuotationAction}
          recordId={quotation.id}
          readOnly={fullyLocked}
        />
        <InlineField
          name="validUntil"
          label="Valid until"
          value={quotation.validUntil ? quotation.validUntil.toISOString().slice(0, 10) : ""}
          type="date"
          action={updateQuotationAction}
          recordId={quotation.id}
          readOnly={fullyLocked || linesLocked}
        />
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Account</span>
          {quotation.account ? (
            <Link href={`/accounts/${quotation.account.id}`} className="text-brand-700 hover:underline truncate max-w-[60%]">
              {quotation.account.name}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Contact</span>
          <span className="text-slate-800 truncate max-w-[60%]">{contact?.name || "—"}</span>
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Grand total</span>
          <span className="text-slate-800 font-semibold">{inr(quotation.grandTotal)}</span>
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-800">{shortDate(quotation.createdAt)}</span>
        </div>
      </div>

      {(quotation.billingAddress || quotation.shippingAddress) && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3 text-sm">
          {quotation.billingAddress && (
            <div>
              <div className="text-slate-500 text-xs mb-0.5">Billing address</div>
              <div className="text-slate-800 whitespace-pre-wrap">{quotation.billingAddress}</div>
            </div>
          )}
          {quotation.shippingAddress && (
            <div>
              <div className="text-slate-500 text-xs mb-0.5">Shipping address</div>
              <div className="text-slate-800 whitespace-pre-wrap">{quotation.shippingAddress}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const center = (
    <>
      <QuoteTotalsPanel result={result} chargesLabel={quotation.chargesLabel ?? undefined} />

      <div className="card overflow-hidden">
        <div className="px-4 pt-4 pb-2 font-semibold text-slate-800">Line items</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Description</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Unit Price</th>
                <th className="th text-right">Disc %</th>
                <th className="th text-right">Tax %</th>
                <th className="th text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l, i) => {
                const computed = result.lines[i];
                return (
                  <tr key={l.id} className={l.optional ? "opacity-60" : undefined}>
                    <td className="td">
                      {l.description}
                      {l.optional && (
                        <>
                          {" "}
                          <Badge tone="slate">Optional</Badge>
                        </>
                      )}
                    </td>
                    <td className="td text-right">
                      {l.qty} {l.uom || ""}
                    </td>
                    <td className="td text-right">{inr(l.unitPrice)}</td>
                    <td className="td text-right">{l.discountPct}%</td>
                    <td className="td text-right">{l.taxRate}%</td>
                    <td className="td text-right font-medium text-slate-800">
                      {l.optional ? (
                        <span className="text-slate-400" title="Optional — not included in the quoted total">
                          {inr(computed?.preview?.total ?? 0)}
                        </span>
                      ) : (
                        inr(computed?.lineGrandTotal ?? 0)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <EditLinesSection
        quotationId={quotation.id}
        initialRows={editableRows}
        products={productOptions}
        headerDiscount={quotation.discount}
        charges={quotation.charges}
        chargesLabel={quotation.chargesLabel}
        chargesTaxRate={quotation.chargesTaxRate}
        adjustment={quotation.adjustment}
        locked={fullyLocked || linesLocked}
        lockedReason={fullyLocked ? "Converted quotations are locked." : linesLocked ? "Locked — revert the stage to an open stage to edit lines." : undefined}
      />

      <Timeline items={eventItems} />
    </>
  );

  const right = (
    <>
      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">Terms & Conditions</div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap">{quotation.termsText || "—"}</div>
      </div>
      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">Payment Terms</div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap">{quotation.paymentTermsText || "—"}</div>
      </div>
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
