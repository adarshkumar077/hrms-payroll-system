// ─────────────────────────────────────────────────────────────
// Pluggable telephony adapter (click-to-call + inbound/outbound call
// webhooks) — mock-or-live, same shape as lib/irp.ts.
//
// Provider: Exotel (India cloud telephony — voice + SMS + WhatsApp from one
// account, per docs/ai/design/wave-d-contracts.md's research basis). Exotel's
// "Connect two numbers" API is a plain REST call over HTTP Basic auth; their
// inbound/outbound call events are delivered via a Passthru applet configured
// in the Exotel dashboard, which hits an Orbit URL with call fields as query
// params (GET) — there is no request signature, so auth here is a token
// query param compared with crypto.timingSafeEqual (see the webhook route).
//
// With no EXOTEL_* creds set, clickToCall() returns a deterministic mock sid
// so click-to-call always "works" in dev/demos, and parseCallWebhook() is
// pure so a demo can synthesize webhook hits without a real Exotel account.
// ─────────────────────────────────────────────────────────────

/**
 * True only when every Exotel credential needed to place a call is present.
 * UI (CallButton) and clickToCallAction gate on this to decide between the
 * live Exotel Connect API call and the mock fallback.
 */
export const telephonyConfigured: boolean = Boolean(
  process.env.EXOTEL_SID && process.env.EXOTEL_TOKEN && process.env.EXOTEL_PHONE,
);

export type ClickToCallResult = { sid: string; mode: "live" | "mock" } | { error: string };

/**
 * Connect two numbers via Exotel's Call Connect API. Exotel dials `userPhone`
 * (the agent) first; once they pick up, it bridges the call to `to` (the
 * lead/contact/account's number), caller-ID'd as EXOTEL_PHONE. Orbit doesn't
 * collect a per-user phone number today, so `userPhone` is optional and falls
 * back to EXOTEL_PHONE itself (i.e. the agent answers on the Exotel virtual
 * number) when omitted — a real deployment would pass the logged-in agent's
 * desk/mobile number here once that field exists on User.
 *
 * NEVER throws: any failure (missing creds path aside — that's the mock
 * fallback, not a failure) returns `{ error }` so callers (a server action
 * behind a button click) can render it inline instead of crashing.
 */
export async function clickToCall(params: { to: string; userPhone?: string }): Promise<ClickToCallResult> {
  const to = (params.to || "").trim();
  if (!to) return { error: "Missing destination phone number." };

  if (!telephonyConfigured) {
    return { sid: `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, mode: "mock" };
  }

  try {
    const sid = process.env.EXOTEL_SID as string;
    const token = process.env.EXOTEL_TOKEN as string;
    const callerId = process.env.EXOTEL_PHONE as string;
    const from = (params.userPhone || callerId).trim();

    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ From: from, To: to, CallerId: callerId });

    const res = await fetch(`https://api.exotel.com/v1/Accounts/${sid}/Calls/connect.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { error: `Exotel HTTP ${res.status}` };

    const json = (await res.json()) as { Call?: { Sid?: string } };
    const callSid = json?.Call?.Sid;
    if (!callSid) return { error: "Exotel response missing Call.Sid." };

    return { sid: String(callSid), mode: "live" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Click-to-call failed." };
  }
}

// ── Webhook parsing (pure) ──────────────────────────────────────────────

export type CallDirection = "inbound" | "outbound";
export type CallStatus = "initiated" | "answered" | "completed" | "missed" | "failed";

export type NormalizedCallEvent = {
  providerCallId: string;
  direction: CallDirection;
  from: string;
  to: string;
  status: CallStatus;
  durationSec?: number;
  startedAt: Date;
  endedAt?: Date;
};

/** Call.status values that mean "this call is over" — matches the D0 model comment. */
const TERMINAL_STATUSES: ReadonlySet<CallStatus> = new Set(["completed", "missed", "failed"]);

export function isTerminalCallStatus(status: string): status is CallStatus {
  return TERMINAL_STATUSES.has(status as CallStatus);
}

// Exotel Passthru applet → Orbit Call.status normalization.
//
//   Exotel `Status`          Orbit `Call.status`
//   ------------------------ --------------------
//   queued                   initiated
//   ringing                  initiated
//   in-progress               answered
//   completed                completed
//   busy                     missed
//   no-answer / noanswer     missed
//   canceled / cancelled     missed   (hung up before it connected)
//   failed                   failed
//   <anything else/missing>  failed   (never silently drop a webhook event)
const STATUS_MAP: Record<string, CallStatus> = {
  queued: "initiated",
  ringing: "initiated",
  "in-progress": "answered",
  "in progress": "answered",
  completed: "completed",
  busy: "missed",
  "no-answer": "missed",
  noanswer: "missed",
  canceled: "missed",
  cancelled: "missed",
  failed: "failed",
};

function normalizeStatus(raw: string | undefined): CallStatus {
  const key = (raw || "").trim().toLowerCase();
  return STATUS_MAP[key] ?? "failed";
}

// Exotel sends `Direction` as "inbound", or "outbound-api"/"outbound-dial" for
// calls Orbit initiated (click-to-call goes out as an "outbound-api" call) —
// anything not starting with "inbound" collapses to Orbit's "outbound".
function normalizeDirection(raw: string | undefined): CallDirection {
  return (raw || "").trim().toLowerCase().startsWith("inbound") ? "inbound" : "outbound";
}

// Exotel timestamps arrive as "YYYY-MM-DD HH:MM:SS" (space-separated, no
// timezone suffix — IST, same as every other Orbit demo timestamp). `Date`
// parses that fine once the space is swapped for a "T".
function parseExotelDate(raw: string | undefined): Date | undefined {
  if (!raw || !raw.trim()) return undefined;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Normalize an Exotel Passthru applet hit (query params on GET, form/JSON
 * body on POST — the route handler flattens either into this same
 * Record<string,string> shape) into Orbit's Call fields.
 *
 * Param mapping: CallSid→providerCallId, From/To→from/to (raw, unnormalized —
 * phone matching happens separately via lib/studio/dedupe.ts's normalizer),
 * Direction→direction, Status→status, DialCallDuration→durationSec,
 * StartTime/EndTime→startedAt/endedAt.
 *
 * Pure + deterministic: `now` defaults to `new Date()` but every call site
 * that cares about determinism (tests, the webhook route wanting one
 * consistent timestamp for a single request) can pass it explicitly. Used as
 * the startedAt fallback when Exotel hasn't sent StartTime yet (e.g. a
 * "queued"/"ringing" progress event), and as the endedAt fallback when the
 * call has reached a terminal status but Exotel didn't include EndTime.
 */
export function parseCallWebhook(params: Record<string, string>, now: Date = new Date()): NormalizedCallEvent {
  const providerCallId = (params.CallSid || "").trim();
  const from = (params.From || "").trim();
  const to = (params.To || "").trim();
  const direction = normalizeDirection(params.Direction);
  const status = normalizeStatus(params.Status);

  const durationRaw = params.DialCallDuration;
  const durationNum = durationRaw !== undefined && durationRaw.trim() !== "" ? Number(durationRaw) : NaN;
  const durationSec = Number.isFinite(durationNum) ? Math.max(0, Math.trunc(durationNum)) : undefined;

  const startedAt = parseExotelDate(params.StartTime) ?? now;
  const parsedEndedAt = parseExotelDate(params.EndTime);
  const endedAt = parsedEndedAt ?? (TERMINAL_STATUSES.has(status) ? now : undefined);

  return { providerCallId, direction, from, to, status, durationSec, startedAt, endedAt };
}

// ─────────────────────────────────────────────────────────────
// Setup documentation — surfaced in the /integrations hint (future) and for operators.
// ─────────────────────────────────────────────────────────────
export const TELEPHONY_SETUP_DOC = `Orbit telephony — go live with Exotel

Orbit places click-to-call requests and ingests call events through Exotel's
cloud telephony API. With no credentials set, click-to-call returns a
deterministic mock call sid so the Calls module always works in dev/demos.

To go live, set these in your .env:

  EXOTEL_SID              Exotel Account SID (also the API Key / Basic-auth user)
  EXOTEL_TOKEN             Exotel API Token (Basic-auth password)
  EXOTEL_PHONE             Your Exotel virtual number (CallerId + default "From")
  TELEPHONY_WEBHOOK_TOKEN  Shared secret for the inbound webhook (see below)

Webhook: point Exotel's Passthru applet (on your call flow) at
  https://<your-orbit-host>/api/webhooks/telephony?token=<TELEPHONY_WEBHOOK_TOKEN>
Exotel calls this with plain query params (CallSid, From, To, Direction,
Status, DialCallDuration, StartTime, EndTime) on every call leg event — no
request signature, so the token query param IS the auth. Rotate it by
changing TELEPHONY_WEBHOOK_TOKEN and updating the Passthru applet URL.`;
