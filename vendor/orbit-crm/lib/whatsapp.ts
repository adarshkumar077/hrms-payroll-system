// ─────────────────────────────────────────────────────────────
// Pluggable WhatsApp adapter (mock-or-live like lib/irp.ts).
//
// Every outbound message is logged to `MessageLog` first (so the /messages
// list always reflects reality even if the provider call fails), then sent:
//   • WHATSAPP_PROVIDER="exotel" + creds present → live Exotel WhatsApp
//     Messaging API call. On failure the row is marked "failed" — the caller
//     is never thrown at.
//   • Otherwise ("mock" / unset) → the row flips straight to "sent" with a
//     deterministic-looking `mock-<id>` providerMsgId so demos always work.
//
// Delivery updates arrive later via the provider's status-callback webhook
// (app/api/webhooks/whatsapp/route.ts), which calls `parseDeliveryWebhook`
// (pure, unit-tested) to normalize the payload before applying it.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import { db } from "@/lib/db";

// Sanctioned literal set for MessageLog.deliveryStatus (docs/ai/design/wave-d-contracts.md
// §Sanctioned literals) — provider-domain values, plain strings, NOT a Studio picklist.
export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/**
 * True only when a live WhatsApp provider is fully configured. Drives the
 * mock-mode banner on /messages and the live-vs-mock branch in sendTemplate.
 */
export const whatsappConfigured: boolean = (() => {
  if (process.env.WHATSAPP_PROVIDER !== "exotel") return false;
  return Boolean(
    process.env.EXOTEL_API_KEY &&
      process.env.EXOTEL_API_TOKEN &&
      process.env.EXOTEL_SID &&
      process.env.EXOTEL_WHATSAPP_FROM,
  );
})();

export type SendTemplateParams = {
  tenantId: string;
  to: string;
  templateKey?: string | null;
  body: string;
  entity?: string | null;
  entityId?: string | null;
};

export type SendTemplateResult = {
  id: string; // MessageLog id ("" if even the log write failed)
  ok: boolean;
  mode: "live" | "mock";
  deliveryStatus: DeliveryStatus;
  providerMsgId: string | null;
  error?: string;
};

/**
 * Send a WhatsApp message. Always creates a MessageLog row first (deliveryStatus
 * "queued"), then attempts the provider send and updates the row accordingly.
 * NEVER throws — every failure mode (log-write failure, live-send failure) is
 * caught and reflected in the returned result / the row's deliveryStatus+error.
 */
export async function sendTemplate(params: SendTemplateParams): Promise<SendTemplateResult> {
  const { tenantId, to, templateKey, body, entity, entityId } = params;
  const mode: "live" | "mock" = whatsappConfigured ? "live" : "mock";

  let logId: string;
  try {
    const log = await db.messageLog.create({
      data: {
        tenantId,
        channel: "whatsapp",
        direction: "outbound",
        toNumber: to,
        templateKey: templateKey || null,
        body,
        deliveryStatus: "queued",
        entity: entity || null,
        entityId: entityId || null,
      },
    });
    logId = log.id;
  } catch (err) {
    console.error("[whatsapp] failed to create MessageLog row:", err);
    return { id: "", ok: false, mode, deliveryStatus: "failed", providerMsgId: null, error: "Failed to log message" };
  }

  if (whatsappConfigured) {
    try {
      const providerMsgId = await sendViaExotel(to, body);
      await db.messageLog.update({ where: { id: logId }, data: { deliveryStatus: "sent", providerMsgId } });
      return { id: logId, ok: true, mode: "live", deliveryStatus: "sent", providerMsgId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db.messageLog
        .update({ where: { id: logId }, data: { deliveryStatus: "failed", error: message } })
        .catch((e) => console.error("[whatsapp] failed to mark MessageLog failed:", e));
      console.error("[whatsapp] live send failed:", err);
      return { id: logId, ok: false, mode: "live", deliveryStatus: "failed", providerMsgId: null, error: message };
    }
  }

  // Mock mode — flips straight to "sent" so demos always work.
  const providerMsgId = `mock-${mockId()}`;
  try {
    await db.messageLog.update({ where: { id: logId }, data: { deliveryStatus: "sent", providerMsgId } });
  } catch (err) {
    console.error("[whatsapp] failed to flip mock MessageLog to sent:", err);
    return { id: logId, ok: false, mode: "mock", deliveryStatus: "queued", providerMsgId: null, error: "Failed to update log" };
  }
  return { id: logId, ok: true, mode: "mock", deliveryStatus: "sent", providerMsgId };
}

/**
 * Live send via Exotel's WhatsApp Messaging API.
 *
 * Endpoint + auth (developer.exotel.com/docs/whatsapp-api):
 *   POST https://<subdomain>/v2/accounts/<account_sid>/messages
 *   Authorization: Basic base64(<api_key>:<api_token>)
 *   Content-Type: application/json
 *
 * Body (trimmed to the free-text case — v1 here is plain text, not a
 * pre-approved WhatsApp template; `templateKey` is stored on the MessageLog
 * for reporting but Wave D doesn't build the template-submission flow):
 *   {
 *     "messages": [{
 *       "from": "<EXOTEL_WHATSAPP_FROM>",
 *       "to": "<E.164 recipient>",
 *       "content": { "recipient_type": "individual", "type": "text", "text": { "body": "..." } }
 *     }]
 *   }
 *
 * Response (202-accepted shape):
 *   {
 *     "http_code": 202,
 *     "metadata": { "total": 1, "success": 1, "failed": 0 },
 *     "response": { "whatsapp": { "messages": [{ "code": 202, "status": "success", "data": { "sid": "..." } }] } }
 *   }
 * The per-message `status: "success"` + `data.sid` is what we key off; any
 * other shape (HTTP error, `status !== "success"`, missing sid) throws so the
 * caller marks the row "failed".
 */
async function sendViaExotel(to: string, body: string): Promise<string> {
  const apiKey = process.env.EXOTEL_API_KEY as string;
  const apiToken = process.env.EXOTEL_API_TOKEN as string;
  const sid = process.env.EXOTEL_SID as string;
  const from = process.env.EXOTEL_WHATSAPP_FROM as string;
  // Exotel is multi-region — Mumbai cluster is api.in.exotel.com, Singapore is
  // api.exotel.com. Defaults to the global host; override per-tenant region.
  const subdomain = process.env.EXOTEL_SUBDOMAIN || "api.exotel.com";

  const url = `https://${subdomain}/v2/accounts/${sid}/messages`;
  const auth = Buffer.from(`${apiKey}:${apiToken}`).toString("base64");

  const payload = {
    messages: [
      {
        from,
        to: normalizeE164(to),
        content: {
          recipient_type: "individual",
          type: "text",
          text: { body },
        },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
    // Fail fast rather than hang the send action.
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Exotel HTTP ${res.status}`);

  const json = (await res.json()) as {
    response?: { whatsapp?: { messages?: Array<{ status?: string; data?: { sid?: string } }> } };
  };

  const first = json.response?.whatsapp?.messages?.[0];
  if (!first || first.status !== "success" || !first.data?.sid) {
    throw new Error("Exotel response missing success status / sid");
  }
  return first.data.sid;
}

/** Best-effort E.164-ish normalization — defaults bare 10-digit numbers to India (+91). */
function normalizeE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function mockId(): string {
  return `${Date.now().toString(36)}${crypto.randomBytes(6).toString("hex")}`;
}

// ── Delivery webhook parsing (pure — see lib/whatsapp.test.ts) ──

export type ParsedDeliveryWebhook = { providerMsgId: string; status: DeliveryStatus };

// Monotonic rank used by isStatusUpgrade — higher rank always wins.
// "failed" is terminal/highest so a late failure notification is always
// applied, but a failed row is never bumped back to an earlier live state.
const STATUS_RANK: Record<DeliveryStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/**
 * True when `to` should overwrite `from` per the sanctioned monotonic order
 * queued < sent < delivered < read, with "failed" terminal/highest. Unknown
 * status strings on either side never count as an upgrade (fail-closed —
 * an unrecognized `from` or `to` should never silently mutate state).
 */
export function isStatusUpgrade(from: string, to: string): boolean {
  const fromRank = STATUS_RANK[from as DeliveryStatus];
  const toRank = STATUS_RANK[to as DeliveryStatus];
  if (fromRank === undefined || toRank === undefined) return false;
  return toRank > fromRank;
}

// Exotel status-callback text values → sanctioned MessageLog.deliveryStatus.
const TEXT_STATUS_MAP: Record<string, DeliveryStatus> = {
  queued: "queued",
  accepted: "sent",
  submitted: "sent",
  sent: "sent",
  delivered: "delivered",
  seen: "read",
  read: "read",
  failed: "failed",
  error: "failed",
  undelivered: "failed",
  rejected: "failed",
  expired: "failed",
};

// Exotel WhatsApp status codes (developer.exotel.com/docs/whatsapp-api/api-reference/status-codes):
// 30001 sent, 30002 delivered, 30003 seen/read, 30004–30041 various failures.
function statusFromCode(code: number): DeliveryStatus | null {
  if (code === 30001) return "sent";
  if (code === 30002) return "delivered";
  if (code === 30003) return "read";
  if (code >= 30004 && code <= 30041) return "failed";
  return null;
}

/**
 * Defensively parse an Exotel WhatsApp status-callback payload into
 * `{providerMsgId, status}`. Accepts the documented `sid`/`status` shape plus
 * a couple of reasonable key-name variants (`message_sid`/`id`,
 * `exo_status_code`/`code` as a numeric fallback when `status` text is
 * absent/unrecognized). Returns null for anything that doesn't resolve to a
 * known message id + sanctioned status — including non-object bodies,
 * missing ids, and unrecognized status text/codes.
 */
export function parseDeliveryWebhook(body: unknown): ParsedDeliveryWebhook | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;

  const idField = raw.sid ?? raw.message_sid ?? raw.id;
  const providerMsgId = typeof idField === "string" ? idField.trim() : "";
  if (!providerMsgId) return null;

  let status: DeliveryStatus | null = null;
  if (typeof raw.status === "string") {
    status = TEXT_STATUS_MAP[raw.status.trim().toLowerCase()] ?? null;
  }
  if (!status) {
    const codeRaw = raw.exo_status_code ?? raw.code;
    const code = typeof codeRaw === "number" ? codeRaw : typeof codeRaw === "string" ? Number(codeRaw) : NaN;
    if (Number.isFinite(code)) status = statusFromCode(code);
  }
  if (!status) return null;

  return { providerMsgId, status };
}

/**
 * Timing-safe comparison of the webhook's `?token=` query param against
 * `WHATSAPP_WEBHOOK_TOKEN`. Mirrors lib/razorpay-webhook.ts's signature
 * comparison — equal-length check first since crypto.timingSafeEqual throws
 * on mismatched buffer lengths rather than just returning false.
 */
export function verifyWebhookToken(given: string, expected: string | undefined | null): boolean {
  if (!expected) return false;
  const a = Buffer.from(given || "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─────────────────────────────────────────────────────────────
// Setup documentation — surfaced in the UI hint and for operators.
// ─────────────────────────────────────────────────────────────
export const WHATSAPP_SETUP_DOC = `Orbit WhatsApp messaging — go live with Exotel

With no credentials set, Orbit sends WhatsApp messages in mock mode: every
send is logged to /messages and immediately marked "sent" with a fake
provider id, so demos and the send form always work.

To go live, set these in your .env (see .env.whatsapp.example):

  WHATSAPP_PROVIDER      "exotel"
  EXOTEL_API_KEY         Exotel API key (Basic auth username)
  EXOTEL_API_TOKEN       Exotel API token (Basic auth password)
  EXOTEL_SID             Exotel account SID
  EXOTEL_WHATSAPP_FROM   Your approved WhatsApp sender number (E.164, e.g. +91XXXXXXXXXX)
  EXOTEL_SUBDOMAIN       (optional) api.exotel.com (default) or api.in.exotel.com (Mumbai cluster)
  WHATSAPP_WEBHOOK_TOKEN Shared secret Exotel appends as ?token=<value> on the
                         status-callback URL you configure in the Exotel
                         dashboard: https://<your-domain>/api/webhooks/whatsapp?token=<value>
                         Without it the webhook route returns 503 and delivery
                         statuses never advance past "sent".

Where to get credentials: Exotel Dashboard → API Settings (api_key + api_token
+ account SID) and WhatsApp Business API console for the approved sender
number. See lib/whatsapp.ts for the exact request/response shapes.`;
