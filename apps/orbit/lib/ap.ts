import { postJournal } from "./gl";

// Accounts Payable postings. Vendor bill approval and bill payment hit the GL.
// (ITC/input-GST nuance is simplified: the full bill total is expensed to keep the
//  entry self-balancing; a real impl would split input GST to an ITC asset account.)

/** Approve a vendor bill → Dr Operating Expense (total), Cr Accounts Payable (total). */
export async function postVendorBillJournal(tenantId: string, bill: { billNumber: string; vendor: string; total: number }) {
  return postJournal({
    tenantId,
    narration: `Vendor bill ${bill.billNumber} — ${bill.vendor}`,
    reference: `BILL-${bill.billNumber}`,
    source: "vendorbill",
    lines: [
      { code: "5200", debit: bill.total }, // Dr Operating Expense
      { code: "2000", credit: bill.total }, // Cr Accounts Payable
    ],
  });
}

/** Pay a vendor bill → Dr Accounts Payable (total), Cr Bank (total). */
export async function postBillPaymentJournal(tenantId: string, bill: { billNumber: string; vendor: string; total: number; method?: string }) {
  const cashCode = bill.method === "Cash" ? "1000" : "1010";
  return postJournal({
    tenantId,
    narration: `Paid vendor bill ${bill.billNumber} — ${bill.vendor}`,
    reference: `BILLPAY-${bill.billNumber}`,
    source: "vendorbill",
    lines: [
      { code: "2000", debit: bill.total }, // Dr Accounts Payable
      { code: cashCode, credit: bill.total }, // Cr Bank/Cash
    ],
  });
}
