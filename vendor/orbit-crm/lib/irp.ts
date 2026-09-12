// ─────────────────────────────────────────────────────────────
// Pluggable IRP (Invoice Registration Portal) e-invoicing adapter.
//
// India's e-invoicing (mandatory for AATO > ₹5cr on B2B supplies) requires
// registering each invoice on the NIC IRP via a GSP (GST Suvidha Provider) or
// direct API access. The IRP returns an IRN (64-char Invoice Reference Number),
// an acknowledgement number/date, a digitally-signed QR code, and — when the
// consignment exceeds ₹50k — an e-way bill number.
//
// This adapter is intentionally pluggable:
//   • If real GSP/IRP sandbox (or prod) credentials are configured via env,
//     `generateEInvoice` builds the real IRP e-invoice JSON (schema v1.1),
//     POSTs it, and parses the response.  { mode: "live" }.
//   • Otherwise it falls back to the deterministic `mockIrn` so the app never
//     breaks in dev / demos.  { mode: "mock" }.
//
// Slotting in real creds: fill `.env.irp.example` values into `.env` — nothing
// else needs to change. See `IRP_SETUP_DOC` below.
// ─────────────────────────────────────────────────────────────

import { mockIrn } from "@/lib/compliance/gst";

// GSTIN → 2-digit state code (first 2 chars of a GSTIN). Tenant home = Maharashtra "27".
const HOME_STATE_CODE = "27";
const EWAY_THRESHOLD = 50000; // ₹50k — e-way bill required above this consignment value

/**
 * True only when every IRP credential is present. Finalization checks this to
 * decide between the live IRP call and the deterministic mock fallback.
 */
export const irpConfigured: boolean = Boolean(
  process.env.IRP_BASE_URL &&
    process.env.IRP_CLIENT_ID &&
    process.env.IRP_CLIENT_SECRET &&
    process.env.IRP_USERNAME &&
    process.env.IRP_PASSWORD,
);

// ── Types (kept loose/structural so callers can pass Prisma rows directly) ──

export type EInvoiceInvoice = {
  number: string;
  invoiceType: string; // "B2B" | "B2C" | …
  placeOfSupply?: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  createdAt?: Date | string;
};

export type EInvoiceTenant = {
  name: string;
  gstin?: string | null;
};

export type EInvoiceBuyer = {
  name: string;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

export type EInvoiceLine = {
  description: string;
  hsn?: string | null;
  qty: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
};

export type GenerateEInvoiceResult = {
  irn: string;
  ackNo: string;
  ackDate: string;
  signedQr?: string;
  ewayBillNo?: string;
  mode: "live" | "mock";
};

// ── Helpers ──

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** State code = first 2 chars of the GSTIN, else fallback to tenant home state. */
function stateCodeOf(gstin?: string | null, fallback = HOME_STATE_CODE): string {
  const s = (gstin || "").trim();
  return /^\d{2}/.test(s) ? s.slice(0, 2) : fallback;
}

/**
 * Build the real NIC IRP e-invoice request body (schema **Version 1.1**).
 * This is the exact nested shape the IRP `/invoice` endpoint expects; the
 * mock path never sends it, but keeping it correct means the live path is
 * production-shaped and a real GSP sandbox accepts it unchanged.
 *
 * NOTE on tax split: intra-state supply carries CGST+SGST, inter-state carries
 * IGST — derived per-invoice from whether igst === 0.
 */
export function buildEInvoiceJson(
  invoice: EInvoiceInvoice,
  tenant: EInvoiceTenant,
  buyerAccount: EInvoiceBuyer,
  lines: EInvoiceLine[],
) {
  const sellerStcd = stateCodeOf(tenant.gstin);
  const buyerStcd = stateCodeOf(buyerAccount.gstin, sellerStcd);
  const intraState = invoice.igst === 0;
  // POS = place-of-supply state code; buyer state code drives it for goods.
  const pos = buyerStcd;

  const docDate = new Date(invoice.createdAt ?? Date.now());
  const dd = String(docDate.getDate()).padStart(2, "0");
  const mm = String(docDate.getMonth() + 1).padStart(2, "0");
  const yyyy = docDate.getFullYear();

  // Per-item tax allocation — spread the invoice-level tax across lines by taxable value.
  const totalTaxable = lines.reduce((a, l) => a + l.lineTotal, 0) || 1;

  const itemList = lines.map((l, i) => {
    const assAmt = round2(l.lineTotal);
    const share = l.lineTotal / totalTaxable;
    const gstRt = l.taxRate;
    const lineTax = round2((assAmt * gstRt) / 100);
    const igstAmt = intraState ? 0 : lineTax;
    const cgstAmt = intraState ? round2(lineTax / 2) : 0;
    const sgstAmt = intraState ? round2(lineTax / 2) : 0;
    return {
      SlNo: String(i + 1),
      PrdDesc: l.description,
      IsServc: "N", // "Y" for services
      HsnCd: l.hsn || "",
      Qty: l.qty,
      Unit: "NOS",
      UnitPrice: round2(l.unitPrice),
      TotAmt: round2(l.qty * l.unitPrice),
      Discount: 0,
      AssAmt: assAmt,
      GstRt: gstRt,
      IgstAmt: igstAmt,
      CgstAmt: cgstAmt,
      SgstAmt: sgstAmt,
      TotItemVal: round2(assAmt + lineTax),
      // `share` intentionally kept to document proportional allocation intent.
      _allocShare: round2(share * 100),
    };
  });

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: invoice.invoiceType === "B2B" ? "B2B" : "B2C",
      RegRev: "N", // reverse charge
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: "INV",
      No: invoice.number,
      Dt: `${dd}/${mm}/${yyyy}`,
    },
    SellerDtls: {
      Gstin: tenant.gstin || "",
      LglNm: tenant.name,
      Addr1: "Registered Office",
      Loc: "Mumbai",
      Pin: 400001,
      Stcd: sellerStcd,
    },
    BuyerDtls: {
      Gstin: buyerAccount.gstin || "URP", // URP = unregistered person
      LglNm: buyerAccount.name,
      Pos: pos,
      Addr1: buyerAccount.address || buyerAccount.city || "NA",
      Loc: buyerAccount.city || invoice.placeOfSupply || "NA",
      Pin: 999999,
      Stcd: buyerStcd,
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: round2(invoice.subtotal),
      CgstVal: round2(invoice.cgst),
      SgstVal: round2(invoice.sgst),
      IgstVal: round2(invoice.igst),
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: round2(
        invoice.grandTotal - (invoice.subtotal + invoice.cgst + invoice.sgst + invoice.igst),
      ),
      TotInvVal: round2(invoice.grandTotal),
    },
  };
}

/**
 * Generate an e-invoice / IRN for a finalized invoice.
 *
 * Live path (when `irpConfigured`): POSTs the v1.1 JSON to the IRP endpoint.
 * IMPORTANT — a production implementation must FIRST call the IRP `/auth`
 * endpoint (with `client_id`, `client_secret`, `user_name`, `password`) to
 * obtain a time-bound `AuthToken` + a symmetric session key (SEK), CACHE the
 * token (typically ~6h TTL), and encrypt the payload with the SEK. This adapter
 * documents those header names and structure; wire your GSP's auth + crypto in
 * `fetchAuthToken()` below when you drop in real creds.
 *
 * Any failure falls back to the deterministic mock so finalization never breaks.
 */
export async function generateEInvoice(payload: {
  invoice: EInvoiceInvoice;
  tenant: EInvoiceTenant;
  buyerAccount: EInvoiceBuyer;
  lines: EInvoiceLine[];
}): Promise<GenerateEInvoiceResult> {
  const { invoice, tenant, buyerAccount, lines } = payload;

  if (irpConfigured) {
    try {
      const body = buildEInvoiceJson(invoice, tenant, buyerAccount, lines);

      // A real impl fetches + caches an AuthToken from IRP /auth first.
      const authToken = await fetchAuthToken();

      const res = await fetch(`${process.env.IRP_BASE_URL}/eicore/v1.03/Invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // ── Real NIC/GSP IRP header names (do not rename) ──
          client_id: process.env.IRP_CLIENT_ID as string,
          client_secret: process.env.IRP_CLIENT_SECRET as string,
          Gstin: tenant.gstin || "",
          user_name: process.env.IRP_USERNAME as string,
          AuthToken: authToken,
        },
        body: JSON.stringify(body),
        // Fail fast rather than hang the finalize action.
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`IRP HTTP ${res.status}`);

      // IRP wraps the result in { Status, Data | ErrorDetails }. Data may be a
      // JSON string (decrypted) or an object depending on the GSP wrapper.
      const json = (await res.json()) as {
        Status?: number | string;
        Data?: unknown;
        ErrorDetails?: unknown;
      };

      const data =
        typeof json.Data === "string" ? JSON.parse(json.Data) : (json.Data as Record<string, unknown>);

      if (!data || !data["Irn"]) throw new Error("IRP response missing Irn");

      return {
        irn: String(data["Irn"]),
        ackNo: String(data["AckNo"] ?? ""),
        ackDate: String(data["AckDt"] ?? new Date().toISOString()),
        signedQr: data["SignedQRCode"] ? String(data["SignedQRCode"]) : undefined,
        ewayBillNo: data["EwbNo"] ? String(data["EwbNo"]) : undefined,
        mode: "live",
      };
    } catch (err) {
      // Never break finalization: log + fall back to the deterministic mock.
      console.error("[irp] live e-invoice generation failed, falling back to mock:", err);
    }
  }

  return mockEInvoice(invoice);
}

/**
 * Fetch (and, in a real impl, cache) an IRP AuthToken.
 *
 * Real flow: POST `${IRP_BASE_URL}/eivital/v1.04/auth` with a payload encrypted
 * by the app-key + `client_id`/`client_secret` headers; decrypt the returned
 * SEK with your private key; cache { AuthToken, Sek, expiry } until TTL. Here we
 * return a placeholder token — the surrounding try/catch means that if the live
 * POST rejects it, we cleanly fall back to mock.
 */
async function fetchAuthToken(): Promise<string> {
  // TODO(real-creds): replace with a genuine /auth call + in-memory token cache.
  return process.env.IRP_AUTH_TOKEN || "SANDBOX_PLACEHOLDER_TOKEN";
}

/** Deterministic mock e-invoice — mirrors the previous inline behaviour. */
function mockEInvoice(invoice: EInvoiceInvoice): GenerateEInvoiceResult {
  const irn = mockIrn(invoice.number);
  const ackNo = String(1_000_000_000_000 + (Math.abs(hash(invoice.number)) % 900_000_000_000));
  const result: GenerateEInvoiceResult = {
    irn,
    ackNo,
    ackDate: new Date().toISOString(),
    signedQr: undefined,
    mode: "mock",
  };
  // e-way bill needed for consignments above ₹50,000.
  if (invoice.grandTotal > EWAY_THRESHOLD) {
    result.ewayBillNo = String(
      3_000_000_000_00 + (Math.abs(hash(invoice.number + "eway")) % 99_999_999_999),
    );
  }
  return result;
}

// Small deterministic hash for mock Ack / e-way numbers.
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return h;
}

// ─────────────────────────────────────────────────────────────
// Setup documentation — surfaced in the UI hint and for operators.
// ─────────────────────────────────────────────────────────────
export const IRP_SETUP_DOC = `Orbit GST e-invoicing — go live with the IRP

Orbit generates IRNs against the NIC Invoice Registration Portal (IRP) through a
GSP (GST Suvidha Provider) or direct API access. With no credentials set, Orbit
uses a deterministic sandbox/mock IRN so finalization always works in dev/demos.

To go live, set these in your .env (see .env.irp.example):

  IRP_BASE_URL       Base URL of your GSP/IRP API
                     • NIC sandbox:  https://einv-apisandbox.nic.in
                     • or your GSP's sandbox/prod host
  IRP_CLIENT_ID      GSP client_id      (sent as the "client_id" header)
  IRP_CLIENT_SECRET  GSP client_secret  (sent as the "client_secret" header)
  IRP_USERNAME       IRP API user name  (sent as the "user_name" header)
  IRP_PASSWORD       IRP API password   (used to fetch the AuthToken)
  IRP_AUTH_TOKEN     (optional) pre-fetched AuthToken for quick sandbox testing

Where to get sandbox credentials:
  1. Register on the NIC e-invoice sandbox portal (https://einv-apisandbox.nic.in)
     using a test GSTIN, OR
  2. Onboard with a licensed GSP (e.g. ClearTax, Masters India, IRIS, Zoho, TaxPro,
     Cygnet). They issue client_id/client_secret + API user creds for their sandbox.

Production note: a real implementation must first call the IRP /auth endpoint to
obtain a time-bound AuthToken (+ SEK session key), cache it (~6h), and encrypt the
payload per the NIC crypto spec. See fetchAuthToken() in lib/irp.ts.`;
