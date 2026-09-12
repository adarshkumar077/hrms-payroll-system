"use client";

import { useRef, useState, useTransition } from "react";
import { inr } from "@/lib/format";
import { Badge } from "@/components/ui";
import { extractAction, createBillFromOcrAction } from "./actions";
import type { ExtractedBill } from "@/lib/ocr";

type LineRow = { description: string; hsn: string; qty: number; unitPrice: number; taxRate: number; lineTotal: number };

const EMPTY_LINE: LineRow = { description: "", hsn: "", qty: 1, unitPrice: 0, taxRate: 18, lineTotal: 0 };

function toLineRows(lines: ExtractedBill["lines"]): LineRow[] {
  if (!lines.length) return [{ ...EMPTY_LINE }];
  return lines.map((l) => ({
    description: l.description || "",
    hsn: l.hsn || "",
    qty: l.qty ?? 1,
    unitPrice: l.unitPrice ?? 0,
    taxRate: l.taxRate ?? 18,
    lineTotal: l.lineTotal ?? 0,
  }));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ScanBill() {
  const [pending, startExtract] = useTransition();
  const [saving, startSave] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<"vision" | "stub" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [vendor, setVendor] = useState("");
  const [gstin, setGstin] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [date, setDate] = useState("");
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [total, setTotal] = useState(0);
  const [lines, setLines] = useState<LineRow[]>([{ ...EMPTY_LINE }]);
  const [hasExtracted, setHasExtracted] = useState(false);

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    startExtract(async () => {
      try {
        const dataUrl = await readAsDataUrl(file);
        setPreviewUrl(dataUrl);
        const result = await extractAction(dataUrl);
        setVendor(result.vendor);
        setGstin(result.gstin || "");
        setBillNumber(result.billNumber);
        setDate(toDateInputValue(result.date));
        setSubtotal(result.subtotal);
        setTax(result.tax);
        setTotal(result.total);
        setLines(toLineRows(result.lines));
        setNote(result.note || null);
        setMode(result.mode);
        setHasExtracted(true);
      } catch (err) {
        setError((err as Error).message || "Could not read that file — try another image.");
      }
    });
  }

  function updateLine(i: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function resetAll() {
    setPreviewUrl(null);
    setNote(null);
    setMode(null);
    setError(null);
    setVendor("");
    setGstin("");
    setBillNumber("");
    setDate("");
    setSubtotal(0);
    setTax(0);
    setTotal(0);
    setLines([{ ...EMPTY_LINE }]);
    setHasExtracted(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Upload + preview */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-1">1. Upload the bill</h3>
        <p className="text-xs text-slate-500 mb-3">A photo or scan of a vendor invoice (JPG/PNG).</p>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="input"
          onChange={onFileSelected}
          disabled={pending}
        />

        {pending && <p className="mt-3 text-sm text-slate-500">Extracting fields from the image…</p>}
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        {previewUrl && (
          <div className="mt-4">
            <img src={previewUrl} alt="Bill preview" className="max-h-80 rounded-md border border-slate-200 object-contain" />
          </div>
        )}

        {mode && (
          <div className="mt-4 flex items-center gap-2">
            <Badge tone={mode === "vision" ? "green" : "amber"}>
              {mode === "vision" ? "AI-extracted" : "Manual mode"}
            </Badge>
            {hasExtracted && (
              <button className="btn-ghost text-xs py-1" onClick={resetAll} type="button">
                Scan another bill
              </button>
            )}
          </div>
        )}
        {note && <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-md p-2">{note}</p>}
      </div>

      {/* Editable review form */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-1">2. Review &amp; confirm</h3>
        <p className="text-xs text-slate-500 mb-3">
          Edit anything the AI got wrong — nothing is saved until you confirm below.
        </p>

        <form action={(fd) => startSave(async () => { await createBillFromOcrAction(fd); })} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Vendor</label>
              <input name="vendor" className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} required />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input name="gstin" className="input" value={gstin} onChange={(e) => setGstin(e.target.value)} />
            </div>
            <div>
              <label className="label">Bill number</label>
              <input name="billNumber" className="input" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} required />
            </div>
            <div>
              <label className="label">Date</label>
              <input name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Subtotal</label>
              <input
                name="subtotal"
                type="number"
                step="0.01"
                className="input"
                value={subtotal}
                onChange={(e) => setSubtotal(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Tax</label>
              <input name="tax" type="number" step="0.01" className="input" value={tax} onChange={(e) => setTax(Number(e.target.value))} />
            </div>
            <div className="col-span-2">
              <label className="label">Total</label>
              <input
                name="total"
                type="number"
                step="0.01"
                className="input font-semibold"
                value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Line items</label>
              <button className="btn-ghost text-xs py-1" type="button" onClick={addLine}>
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center rounded-md bg-slate-50 p-2">
                  <input
                    className="input col-span-4 text-xs"
                    placeholder="Description"
                    name="line_description"
                    value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                  />
                  <input
                    className="input col-span-2 text-xs"
                    placeholder="HSN"
                    name="line_hsn"
                    value={l.hsn}
                    onChange={(e) => updateLine(i, { hsn: e.target.value })}
                  />
                  <input
                    className="input col-span-1 text-xs"
                    type="number"
                    placeholder="Qty"
                    name="line_qty"
                    value={l.qty}
                    onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                  />
                  <input
                    className="input col-span-2 text-xs"
                    type="number"
                    placeholder="Unit price"
                    name="line_unitPrice"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })}
                  />
                  <input
                    className="input col-span-1 text-xs"
                    type="number"
                    placeholder="Tax %"
                    name="line_taxRate"
                    value={l.taxRate}
                    onChange={(e) => updateLine(i, { taxRate: Number(e.target.value) })}
                  />
                  <input
                    className="input col-span-1 text-xs"
                    type="number"
                    placeholder="Total"
                    name="line_lineTotal"
                    value={l.lineTotal}
                    onChange={(e) => updateLine(i, { lineTotal: Number(e.target.value) })}
                  />
                  <button
                    type="button"
                    className="btn-ghost col-span-1 text-xs py-1 text-rose-600"
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Lines subtotal: {inr(lines.reduce((a, l) => a + (l.lineTotal || 0), 0))}
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button className="btn" disabled={saving || !vendor || !billNumber}>
              {saving ? "Saving…" : "Save as vendor bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function toDateInputValue(d: string | null): string {
  if (!d) return "";
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
