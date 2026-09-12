// ─────────────────────────────────────────────────────────────
// Pluggable email delivery adapter.
//
// Orbit's signup / password-reset / invite flows generate tokens and, with
// no email provider configured, simply show the resulting link on-screen so
// the app never breaks in dev/demos. This adapter is the pluggable delivery
// layer on top of that:
//   • If SMTP credentials are configured via env, `sendEmail` sends the
//     message through nodemailer.  { sent: true }.
//   • Otherwise it logs the message and no-ops.  { sent: false, reason: "not configured" }.
//
// Same graceful-degradation law as lib/irp.ts / lib/ai.ts / lib/notify.ts:
// `sendEmail` NEVER throws — a delivery failure must never break
// signup/reset/invite. Callers should keep showing the on-screen link/token
// as a fallback whenever `emailConfigured` is false (or a send fails).
//
// Slotting in real SMTP creds: fill `.env.email.example` values into your
// `.env` — nothing else needs to change. See `EMAIL_SETUP_DOC` below.
// ─────────────────────────────────────────────────────────────

// nodemailer is imported LAZILY inside getTransporter() (not at module top): it pulls
// Node built-ins (fs/net/dns/tls), and lib/email is reachable from client components via
// the events→notify chain, so a static import would break the client bundle build.

/**
 * True only when every SMTP credential is present. Callers check this to
 * decide whether to attempt a real send or just show the on-screen link.
 */
export const emailConfigured: boolean = Boolean(
  process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.EMAIL_FROM,
);

let cachedTransporter: any = null;

/** Lazily import nodemailer + build (and cache) the SMTP transporter from env. */
async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const nodemailer = (await import("nodemailer")).default;
  const port = Number(process.env.SMTP_PORT);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587/25 use STARTTLS (default)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransporter;
}

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult = { sent: true } | { sent: false; reason: string };

/**
 * Best-effort email send. NEVER throws — signup/reset/invite/notify must
 * keep working even when SMTP is unset or the provider rejects the send.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  if (!emailConfigured) {
    console.log(`[email] not configured — would send "${params.subject}" to ${params.to}`);
    return { sent: false, reason: "not configured" };
  }
  try {
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text ?? params.html.replace(/<[^>]+>/g, " ").trim(),
    });
    return { sent: true };
  } catch (err) {
    // Never break the caller's flow: log + report failure, don't throw.
    console.warn("[email] send failed (non-fatal):", (err as Error).message);
    return { sent: false, reason: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────
// Setup documentation — surfaced for operators (mirrors lib/irp.ts's pattern).
// ─────────────────────────────────────────────────────────────
export const EMAIL_SETUP_DOC = `Orbit email delivery — go live with SMTP

Orbit's password-reset and team-invite flows generate a link and always show
it on-screen so the app never breaks in dev/demos. With no SMTP configured,
that's the only delivery: the link is shown, nothing is sent. Set the vars
below to also email the link.

To go live, set these in your .env (see .env.email.example):

  SMTP_HOST    SMTP server hostname (e.g. smtp.sendgrid.net, smtp.gmail.com)
  SMTP_PORT    SMTP port — 587 (STARTTLS, recommended) or 465 (implicit TLS)
  SMTP_USER    SMTP auth username
  SMTP_PASS    SMTP auth password / API key
  EMAIL_FROM   "From" address, e.g. "Orbit <no-reply@yourdomain.com>"

All five must be set for emailConfigured to be true; any missing → Orbit
falls back to on-screen-link-only (dev/demo safe).

Where to get SMTP credentials:
  • Any transactional email provider works: SendGrid, Postmark, Mailgun,
    Amazon SES, Resend (SMTP mode), or even Gmail (with an App Password) for
    quick testing.
  • Sign up, verify a sending domain, and copy the SMTP host/port/user/pass
    they issue.

Production note: sendEmail() never throws — a bad SMTP config or a transient
provider outage degrades to a logged no-op, never a broken signup/reset/invite.`;
