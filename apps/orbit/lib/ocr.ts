// Invoice/document OCR — pluggable, vision-model based (highest-ROI AI back-office feature).
// Uses any OpenAI-compatible VISION model via LLM_BASE_URL/LLM_API_KEY + OCR_MODEL.
// Degrades to a manual-entry stub when no vision model is configured (so the flow always works).

const base = process.env.LLM_BASE_URL;
const key = process.env.LLM_API_KEY;
const model = process.env.OCR_MODEL; // e.g. a Groq vision model — text LLM_MODEL won't do vision

export const ocrConfigured = !!(base && key && model);
export const ocrModelLabel = model || "manual";

export type ExtractedBill = {
  vendor: string;
  gstin: string | null;
  billNumber: string;
  date: string | null; // ISO or as printed
  subtotal: number;
  tax: number;
  total: number;
  lines: { description: string; hsn?: string; qty?: number; unitPrice?: number; taxRate?: number; lineTotal?: number }[];
  mode: "vision" | "stub";
  note?: string;
};

const EMPTY: ExtractedBill = { vendor: "", gstin: null, billNumber: "", date: null, subtotal: 0, tax: 0, total: 0, lines: [], mode: "stub", note: "OCR model not configured — fill the fields manually or set OCR_MODEL in .env." };

const PROMPT =
  'Extract this vendor invoice/bill into STRICT JSON only (no prose): ' +
  '{"vendor":"","gstin":"","billNumber":"","date":"","subtotal":0,"tax":0,"total":0,' +
  '"lines":[{"description":"","hsn":"","qty":0,"unitPrice":0,"taxRate":0,"lineTotal":0}]}. ' +
  'Amounts as numbers (no currency symbols/commas). Use empty string / 0 where unknown. Indian GST invoice.';

/** dataUrl = "data:image/png;base64,...." */
export async function extractInvoice(dataUrl: string): Promise<ExtractedBill> {
  if (!ocrConfigured) return { ...EMPTY };
  try {
    const res = await fetch(`${base!.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OCR ${res.status}: ${await res.text().catch(() => "")}`);
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in OCR response");
    const p = JSON.parse(m[0]);
    return {
      vendor: String(p.vendor || ""),
      gstin: p.gstin || null,
      billNumber: String(p.billNumber || ""),
      date: p.date || null,
      subtotal: num(p.subtotal),
      tax: num(p.tax),
      total: num(p.total),
      lines: Array.isArray(p.lines)
        ? p.lines.map((l: any) => ({ description: String(l.description || ""), hsn: l.hsn || undefined, qty: num(l.qty), unitPrice: num(l.unitPrice), taxRate: num(l.taxRate), lineTotal: num(l.lineTotal) }))
        : [],
      mode: "vision",
    };
  } catch (e) {
    return { ...EMPTY, note: `OCR failed (${(e as Error).message}) — enter details manually.` };
  }
}

function num(v: any): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}
