/**
 * Thin fetch wrappers — Node 18+ has a global `fetch`, so no HTTP client
 * dependency is needed. Two shapes: JSON calls to the Orbit connector API,
 * and raw XML posts to Tally's local HTTP/XML server.
 */

export interface PendingVoucherLine {
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxRate: number;
}

export interface PendingVoucherDTO {
  invoiceId: string;
  number: string;
  date: string;
  accountName: string;
  lines: PendingVoucherLine[];
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
}

export interface LedgerUpsertDTO {
  name: string;
  group?: string;
  closingBalance?: number;
  outstanding?: number;
  tallyGuid?: string;
  raw?: string;
}

export class OrbitApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "OrbitApiError";
  }
}

export class OrbitClient {
  constructor(private baseUrl: string, private connectorKey: string) {}

  private async request<T>(method: "GET" | "POST", pathname: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-connector-key": this.connectorKey,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    if (!res.ok) {
      const errMsg =
        parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : text.slice(0, 200);
      throw new OrbitApiError(`${method} ${pathname} -> HTTP ${res.status}: ${errMsg}`, res.status);
    }
    return parsed as T;
  }

  handshake(version: string, companyName?: string) {
    return this.request<{ ok: boolean; tenant?: unknown }>("POST", "/api/connector/tally/handshake", {
      version,
      companyName,
    });
  }

  pushLedgers(ledgers: LedgerUpsertDTO[]) {
    return this.request<{ upserted: number }>("POST", "/api/connector/tally/ledgers", { ledgers });
  }

  pendingVouchers() {
    return this.request<{ vouchers: PendingVoucherDTO[] }>("GET", "/api/connector/tally/pending-vouchers");
  }

  voucherAck(payload: { invoiceId: string; ok: true; tallyGuid?: string } | { invoiceId: string; ok: false; error: string }) {
    return this.request<{ ok: boolean }>("POST", "/api/connector/tally/voucher-ack", payload);
  }
}

export class TallyUnreachableError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "TallyUnreachableError";
  }
}

/** Posts an XML envelope to Tally's HTTP/XML port and returns the raw XML response text. Throws TallyUnreachableError on network failure/timeout/non-2xx. */
export async function postXmlToTally(tallyUrl: string, xml: string, timeoutMs = 20000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(tallyUrl, {
      method: "POST",
      headers: { "content-type": "text/xml" },
      body: xml,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new TallyUnreachableError(`Tally HTTP ${res.status}`);
    }
    return text;
  } catch (err) {
    if (err instanceof TallyUnreachableError) throw err;
    throw new TallyUnreachableError(`Could not reach Tally at ${tallyUrl}: ${(err as Error).message}`, err);
  } finally {
    clearTimeout(timer);
  }
}

/** Splits an array into chunks of at most `size` (used to respect the /ledgers 500-per-batch cap). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
