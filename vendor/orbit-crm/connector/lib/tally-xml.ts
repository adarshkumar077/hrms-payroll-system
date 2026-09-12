/**
 * Tally-specific XML envelope builders/parsers, built on the generic helpers
 * in ./xml. Pure functions only — no I/O — so they're cheap to unit test.
 *
 * Tally XML/HTTP reference (well-known public dialect, no SDK required):
 *  - Export Data / Import Data are picked via <TALLYREQUEST> in the header.
 *  - A "Collection" export lets you FETCH specific fields off a master type
 *    (here: Ledger) without needing a canned report name.
 *  - A voucher import posts a <TALLYMESSAGE> containing a <VOUCHER> with one
 *    <ALLLEDGERENTRIES.LIST> block per ledger line. Tally's sign convention:
 *    debit lines carry ISDEEMEDPOSITIVE=Yes with a NEGATIVE amount, credit
 *    lines carry ISDEEMEDPOSITIVE=No with a POSITIVE amount — the two sides
 *    net to zero, which is how Tally enforces Dr=Cr on import.
 */
import { textTag, extractTag, extractBlocks } from "./xml";

// ---------------------------------------------------------------------------
// Ledger export (pull)
// ---------------------------------------------------------------------------

export interface LedgerExportRequestOptions {
  companyName?: string;
}

/** Builds the "Export Data" envelope that asks Tally for every ledger's name/group/balances/GUID. */
export function buildLedgerExportRequest(opts: LedgerExportRequestOptions = {}): string {
  const svCompany = opts.companyName ? textTag("SVCURRENTCOMPANY", opts.companyName) : "";
  return (
    "<ENVELOPE>" +
    "<HEADER>" +
    "<VERSION>1</VERSION>" +
    "<TALLYREQUEST>Export Data</TALLYREQUEST>" +
    "<TYPE>Collection</TYPE>" +
    "<ID>OrbitLedgerExport</ID>" +
    "</HEADER>" +
    "<BODY>" +
    "<DESC>" +
    "<STATICVARIABLES>" +
    "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>" +
    svCompany +
    "</STATICVARIABLES>" +
    "<TDL><TDLMESSAGE>" +
    '<COLLECTION NAME="OrbitLedgerExport" ISMODIFY="No">' +
    "<TYPE>Ledger</TYPE>" +
    "<FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE,GUID</FETCH>" +
    "</COLLECTION>" +
    "</TDLMESSAGE></TDL>" +
    "</DESC>" +
    "</BODY>" +
    "</ENVELOPE>"
  );
}

export interface ParsedLedger {
  name: string;
  group?: string;
  closingBalance?: number;
  tallyGuid?: string;
  raw: string;
}

/**
 * Parses a "Cr"/"Dr"-suffixed or bare-signed Tally amount string into a
 * plain JS number. Tally reports credit balances as negative internally but
 * some report formats append a trailing "Cr"/"Dr" label instead of a sign —
 * handle both so this is robust across Tally versions/configs.
 */
export function parseTallyAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const isCr = /cr\s*$/i.test(trimmed);
  const isDr = /dr\s*$/i.test(trimmed);
  const numeric = trimmed.replace(/cr|dr/gi, "").replace(/,/g, "").trim();
  const n = Number(numeric);
  if (Number.isNaN(n)) return 0;
  if (isCr) return -Math.abs(n);
  if (isDr) return Math.abs(n);
  return n;
}

/** Splits a ledger Collection export response into one record per `<LEDGER>` block. */
export function parseLedgerExportResponse(xml: string): ParsedLedger[] {
  const blocks = extractBlocks(xml, "LEDGER");
  return blocks
    .map((block): ParsedLedger => {
      const name = extractTag(block, "NAME") ?? "";
      const group = extractTag(block, "PARENT");
      const closingRaw = extractTag(block, "CLOSINGBALANCE");
      const guid = extractTag(block, "GUID");
      return {
        name,
        group,
        closingBalance: closingRaw !== undefined ? parseTallyAmount(closingRaw) : undefined,
        tallyGuid: guid,
        raw: block.trim(),
      };
    })
    .filter((l) => l.name.length > 0);
}

// ---------------------------------------------------------------------------
// Sales voucher import (push)
// ---------------------------------------------------------------------------

export interface VoucherLine {
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxRate: number;
}

export interface PendingVoucher {
  invoiceId: string;
  number: string;
  /** ISO date string. */
  date: string;
  accountName: string;
  lines: VoucherLine[];
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
}

export interface LedgerNames {
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
}

export const DEFAULT_LEDGER_NAMES: LedgerNames = {
  sales: "Sales",
  cgst: "Output CGST",
  sgst: "Output SGST",
  igst: "Output IGST",
};

/** ISO date -> Tally's YYYYMMDD wire format. */
export function toTallyDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function ledgerEntry(name: string, amount: number, isDeemedPositive: boolean): string {
  const signedAmount = isDeemedPositive ? -Math.abs(amount) : Math.abs(amount);
  return (
    "<ALLLEDGERENTRIES.LIST>" +
    textTag("LEDGERNAME", name) +
    textTag("ISDEEMEDPOSITIVE", isDeemedPositive ? "Yes" : "No") +
    textTag("AMOUNT", signedAmount.toFixed(2)) +
    "</ALLLEDGERENTRIES.LIST>"
  );
}

/**
 * Builds the "Import Data" envelope for one Sales voucher, per the wave-D
 * contract's ledger-entry layout:
 *   party Dr grandTotal / sales Cr subtotal / CGST-SGST-IGST Cr each when > 0
 * where subtotal = grandTotal - cgst - sgst - igst.
 */
export function buildSalesVoucherXml(
  voucher: PendingVoucher,
  ledgerNames: LedgerNames = DEFAULT_LEDGER_NAMES,
  companyName?: string
): string {
  const subtotal = voucher.grandTotal - voucher.cgst - voucher.sgst - voucher.igst;

  const entries: string[] = [
    ledgerEntry(voucher.accountName, voucher.grandTotal, true), // party Dr grandTotal
    ledgerEntry(ledgerNames.sales, subtotal, false), // sales Cr subtotal
  ];
  if (voucher.cgst > 0) entries.push(ledgerEntry(ledgerNames.cgst, voucher.cgst, false));
  if (voucher.sgst > 0) entries.push(ledgerEntry(ledgerNames.sgst, voucher.sgst, false));
  if (voucher.igst > 0) entries.push(ledgerEntry(ledgerNames.igst, voucher.igst, false));

  const staticVars = companyName
    ? `<STATICVARIABLES>${textTag("SVCURRENTCOMPANY", companyName)}</STATICVARIABLES>`
    : "";

  return (
    "<ENVELOPE>" +
    "<HEADER>" +
    "<TALLYREQUEST>Import Data</TALLYREQUEST>" +
    "</HEADER>" +
    "<BODY>" +
    "<IMPORTDATA>" +
    "<REQUESTDESC>" +
    "<REPORTNAME>Vouchers</REPORTNAME>" +
    staticVars +
    "</REQUESTDESC>" +
    "<REQUESTDATA>" +
    '<TALLYMESSAGE xmlns:UDF="TallyUDF">' +
    '<VOUCHER VCHTYPE="Sales" ACTION="Create">' +
    textTag("DATE", toTallyDate(voucher.date)) +
    textTag("VOUCHERTYPENAME", "Sales") +
    textTag("VOUCHERNUMBER", voucher.number) +
    textTag("PARTYLEDGERNAME", voucher.accountName) +
    textTag("NARRATION", `Orbit invoice ${voucher.number}`) +
    entries.join("") +
    "</VOUCHER>" +
    "</TALLYMESSAGE>" +
    "</REQUESTDATA>" +
    "</IMPORTDATA>" +
    "</BODY>" +
    "</ENVELOPE>"
  );
}

export interface VoucherImportResult {
  ok: boolean;
  tallyGuid?: string;
  error?: string;
}

/**
 * Parses Tally's Import Data response for one voucher.
 * `<LINEERROR>` present -> failure with that message.
 * `<CREATED>` >= 1 (and no LINEERROR) -> success, GUID from whichever id tag
 * Tally included (varies by version).
 * Otherwise -> failure with the `<EXCEPTION>` text if present, else a
 * generic message.
 */
export function parseVoucherImportResponse(xml: string): VoucherImportResult {
  const lineError = extractTag(xml, "LINEERROR");
  if (lineError) {
    return { ok: false, error: lineError };
  }

  const createdRaw = extractTag(xml, "CREATED");
  const created = createdRaw !== undefined ? Number(createdRaw) : 0;
  if (created > 0) {
    const guid = extractTag(xml, "LASTVCHID") ?? extractTag(xml, "VCHID") ?? extractTag(xml, "GUID");
    return { ok: true, tallyGuid: guid };
  }

  const exception = extractTag(xml, "EXCEPTION");
  return { ok: false, error: exception ?? "Tally did not confirm voucher creation" };
}
