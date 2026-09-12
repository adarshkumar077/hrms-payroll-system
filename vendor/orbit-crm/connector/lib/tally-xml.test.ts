import { describe, it, expect } from "vitest";
import { escapeXml, unescapeXml, textTag, extractTag, extractBlocks, hasTag } from "./xml";
import {
  buildLedgerExportRequest,
  parseLedgerExportResponse,
  parseTallyAmount,
  buildSalesVoucherXml,
  parseVoucherImportResponse,
  toTallyDate,
  DEFAULT_LEDGER_NAMES,
  type PendingVoucher,
  type LedgerNames,
} from "./tally-xml";

describe("xml helpers", () => {
  describe("escapeXml / unescapeXml", () => {
    const cases: Array<[string | number, string]> = [
      ["Rao & Sons", "Rao &amp; Sons"],
      ['"Quoted"', "&quot;Quoted&quot;"],
      ["<tag>", "&lt;tag&gt;"],
      ["it's", "it&apos;s"],
      [42, "42"],
      ["plain", "plain"],
    ];
    it.each(cases)("escapes %j -> %j", (input, expected) => {
      expect(escapeXml(input)).toBe(expected);
    });

    it("round-trips escape -> unescape", () => {
      const raw = `Rao & Sons "Pvt" Ltd <India> it's`;
      expect(unescapeXml(escapeXml(raw))).toBe(raw);
    });

    it("decodes numeric character references", () => {
      expect(unescapeXml("&#65;&#66;")).toBe("AB");
    });
  });

  describe("textTag", () => {
    it("wraps and escapes value", () => {
      expect(textTag("NAME", "Rao & Sons")).toBe("<NAME>Rao &amp; Sons</NAME>");
    });
    it("stringifies numbers", () => {
      expect(textTag("AMOUNT", 1234.5)).toBe("<AMOUNT>1234.5</AMOUNT>");
    });
  });

  describe("extractTag", () => {
    const cases: Array<[string, string, string | undefined]> = [
      ["<NAME>Acme</NAME>", "NAME", "Acme"],
      ['<NAME ATTR="x">Acme</NAME>', "NAME", "Acme"],
      ["<name>Acme</name>", "NAME", "Acme"],
      ["<OTHER>Acme</OTHER>", "NAME", undefined],
      ["<NAME>Rao &amp; Sons</NAME>", "NAME", "Rao & Sons"],
      ["<NAME>  padded  </NAME>", "NAME", "padded"],
    ];
    it.each(cases)("extractTag(%j, %j) -> %j", (xml, tagName, expected) => {
      expect(extractTag(xml, tagName)).toBe(expected);
    });
  });

  describe("extractBlocks", () => {
    it("returns each occurrence's inner content", () => {
      const xml = "<LEDGER><NAME>A</NAME></LEDGER><LEDGER><NAME>B</NAME></LEDGER>";
      const blocks = extractBlocks(xml, "LEDGER");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toContain("<NAME>A</NAME>");
      expect(blocks[1]).toContain("<NAME>B</NAME>");
    });

    it("returns an empty array when the tag never appears", () => {
      expect(extractBlocks("<ENVELOPE></ENVELOPE>", "LEDGER")).toEqual([]);
    });
  });

  describe("hasTag", () => {
    it.each([
      ["<CREATED>1</CREATED>", "CREATED", true],
      ["<LINEERROR>bad</LINEERROR>", "CREATED", false],
    ] as const)("hasTag(%j, %j) -> %j", (xml, tagName, expected) => {
      expect(hasTag(xml, tagName)).toBe(expected);
    });
  });
});

describe("parseTallyAmount", () => {
  const cases: Array<[string, number]> = [
    ["1000.00", 1000],
    ["1000.00 Cr", -1000],
    ["1000.00 Dr", 1000],
    ["-500", -500],
    ["1,00,000.00", 100000],
    ["1,00,000.00 Cr", -100000],
    ["", 0],
    ["   ", 0],
    ["0", 0],
  ];
  it.each(cases)("parseTallyAmount(%j) -> %j", (input, expected) => {
    expect(parseTallyAmount(input)).toBe(expected);
  });
});

describe("buildLedgerExportRequest", () => {
  it("requests an Export Data / Collection envelope", () => {
    const xml = buildLedgerExportRequest();
    expect(xml).toContain("<TALLYREQUEST>Export Data</TALLYREQUEST>");
    expect(xml).toContain("<TYPE>Collection</TYPE>");
    expect(xml).toContain("<TYPE>Ledger</TYPE>");
    expect(xml).toContain("CLOSINGBALANCE");
    expect(xml).not.toContain("SVCURRENTCOMPANY");
  });

  it("includes SVCURRENTCOMPANY when a company name is given", () => {
    const xml = buildLedgerExportRequest({ companyName: "Acme Pvt Ltd" });
    expect(xml).toContain("<SVCURRENTCOMPANY>Acme Pvt Ltd</SVCURRENTCOMPANY>");
  });
});

describe("parseLedgerExportResponse", () => {
  it("parses multiple ledgers with balances and GUIDs", () => {
    const xml = `
      <ENVELOPE><COLLECTION>
        <LEDGER><NAME>Acme Pvt Ltd</NAME><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>15000.00</CLOSINGBALANCE><GUID>guid-1</GUID></LEDGER>
        <LEDGER><NAME>Sales</NAME><PARENT>Sales Accounts</PARENT><CLOSINGBALANCE>-250000.00</CLOSINGBALANCE><GUID>guid-2</GUID></LEDGER>
      </COLLECTION></ENVELOPE>
    `;
    const ledgers = parseLedgerExportResponse(xml);
    expect(ledgers).toHaveLength(2);
    expect(ledgers[0]).toMatchObject({ name: "Acme Pvt Ltd", group: "Sundry Debtors", closingBalance: 15000, tallyGuid: "guid-1" });
    expect(ledgers[1]).toMatchObject({ name: "Sales", group: "Sales Accounts", closingBalance: -250000, tallyGuid: "guid-2" });
  });

  it("skips ledger blocks with no NAME", () => {
    const xml = `<ENVELOPE><COLLECTION><LEDGER><PARENT>Orphan</PARENT></LEDGER></COLLECTION></ENVELOPE>`;
    expect(parseLedgerExportResponse(xml)).toEqual([]);
  });

  it("returns an empty array for an empty collection", () => {
    expect(parseLedgerExportResponse("<ENVELOPE><COLLECTION></COLLECTION></ENVELOPE>")).toEqual([]);
  });
});

describe("toTallyDate", () => {
  it.each([
    ["2026-07-12T00:00:00.000Z", "20260712"],
    ["2026-01-05T10:30:00.000Z", "20260105"],
  ])("toTallyDate(%j) -> %j", (iso, expected) => {
    expect(toTallyDate(iso)).toBe(expected);
  });
});

function makeVoucher(overrides: Partial<PendingVoucher> = {}): PendingVoucher {
  return {
    invoiceId: "inv-1",
    number: "INV-0001",
    date: "2026-07-12T00:00:00.000Z",
    accountName: "Acme Pvt Ltd",
    lines: [{ description: "Widget", qty: 2, rate: 500, amount: 1000, taxRate: 18 }],
    cgst: 90,
    sgst: 90,
    igst: 0,
    grandTotal: 1180,
    ...overrides,
  };
}

describe("buildSalesVoucherXml", () => {
  it("builds party Dr grandTotal / sales Cr subtotal / CGST+SGST Cr when igst is 0", () => {
    const xml = buildSalesVoucherXml(makeVoucher());

    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
    expect(xml).toContain("<VOUCHERNUMBER>INV-0001</VOUCHERNUMBER>");
    expect(xml).toContain("<DATE>20260712</DATE>");

    // Party: Dr grandTotal (1180) -> ISDEEMEDPOSITIVE Yes, AMOUNT negative
    expect(xml).toContain("<LEDGERNAME>Acme Pvt Ltd</LEDGERNAME>");
    expect(xml).toMatch(/<LEDGERNAME>Acme Pvt Ltd<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-1180\.00<\/AMOUNT>/);

    // Sales: Cr subtotal (1180 - 90 - 90 - 0 = 1000) -> ISDEEMEDPOSITIVE No, AMOUNT positive
    expect(xml).toMatch(/<LEDGERNAME>Sales<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>1000\.00<\/AMOUNT>/);

    // CGST/SGST Cr lines present, IGST absent since it's 0
    expect(xml).toMatch(/<LEDGERNAME>Output CGST<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>90\.00<\/AMOUNT>/);
    expect(xml).toMatch(/<LEDGERNAME>Output SGST<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>90\.00<\/AMOUNT>/);
    expect(xml).not.toContain("Output IGST");
  });

  it("emits an IGST line instead of CGST/SGST for an interstate sale", () => {
    const xml = buildSalesVoucherXml(makeVoucher({ cgst: 0, sgst: 0, igst: 180, grandTotal: 1180 }));
    expect(xml).not.toContain("Output CGST");
    expect(xml).not.toContain("Output SGST");
    expect(xml).toMatch(/<LEDGERNAME>Output IGST<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>180\.00<\/AMOUNT>/);
  });

  it("omits all tax lines when cgst/sgst/igst are all 0", () => {
    const xml = buildSalesVoucherXml(makeVoucher({ cgst: 0, sgst: 0, igst: 0, grandTotal: 1000 }));
    expect(xml).not.toContain("Output CGST");
    expect(xml).not.toContain("Output SGST");
    expect(xml).not.toContain("Output IGST");
    // Only two ledger entries: party + sales
    const entryCount = (xml.match(/<ALLLEDGERENTRIES\.LIST>/g) ?? []).length;
    expect(entryCount).toBe(2);
  });

  it("respects configured ledger names for tax lines", () => {
    const customNames: LedgerNames = { sales: "Domestic Sales", cgst: "CGST Payable", sgst: "SGST Payable", igst: "IGST Payable" };
    const xml = buildSalesVoucherXml(makeVoucher(), customNames);
    expect(xml).toContain("<LEDGERNAME>Domestic Sales</LEDGERNAME>");
    expect(xml).toContain("<LEDGERNAME>CGST Payable</LEDGERNAME>");
    expect(xml).toContain("<LEDGERNAME>SGST Payable</LEDGERNAME>");
  });

  it("defaults to the documented ledger names", () => {
    expect(DEFAULT_LEDGER_NAMES).toEqual({ sales: "Sales", cgst: "Output CGST", sgst: "Output SGST", igst: "Output IGST" });
  });

  it("includes SVCURRENTCOMPANY only when a company name is passed", () => {
    const withCompany = buildSalesVoucherXml(makeVoucher(), DEFAULT_LEDGER_NAMES, "Acme Pvt Ltd");
    expect(withCompany).toContain("<SVCURRENTCOMPANY>Acme Pvt Ltd</SVCURRENTCOMPANY>");
    const withoutCompany = buildSalesVoucherXml(makeVoucher());
    expect(withoutCompany).not.toContain("SVCURRENTCOMPANY");
  });

  it("escapes party/account names containing XML-sensitive characters", () => {
    const xml = buildSalesVoucherXml(makeVoucher({ accountName: `Rao & Sons "Pvt" Ltd` }));
    expect(xml).toContain("<LEDGERNAME>Rao &amp; Sons &quot;Pvt&quot; Ltd</LEDGERNAME>");
  });
});

describe("parseVoucherImportResponse", () => {
  it("reports success with a GUID when CREATED >= 1", () => {
    const xml = `<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><LASTVCHID>12345</LASTVCHID></RESPONSE>`;
    expect(parseVoucherImportResponse(xml)).toEqual({ ok: true, tallyGuid: "12345" });
  });

  it("reports success with no GUID when Tally doesn't return one", () => {
    const xml = `<RESPONSE><CREATED>1</CREATED></RESPONSE>`;
    expect(parseVoucherImportResponse(xml)).toEqual({ ok: true, tallyGuid: undefined });
  });

  it("reports failure with the LINEERROR message even if CREATED is present", () => {
    const xml = `<RESPONSE><CREATED>0</CREATED><LINEERROR>Ledger Output CGST does not exist</LINEERROR></RESPONSE>`;
    expect(parseVoucherImportResponse(xml)).toEqual({ ok: false, error: "Ledger Output CGST does not exist" });
  });

  it("reports failure with an EXCEPTION message when CREATED is 0 and there's no LINEERROR", () => {
    const xml = `<RESPONSE><CREATED>0</CREATED><EXCEPTION>Company not open</EXCEPTION></RESPONSE>`;
    expect(parseVoucherImportResponse(xml)).toEqual({ ok: false, error: "Company not open" });
  });

  it("falls back to a generic error when Tally gives no useful signal at all", () => {
    const xml = `<RESPONSE></RESPONSE>`;
    expect(parseVoucherImportResponse(xml)).toEqual({ ok: false, error: "Tally did not confirm voucher creation" });
  });
});
