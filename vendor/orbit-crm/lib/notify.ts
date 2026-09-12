import { db } from "./db";
import { sendEmail, emailConfigured } from "./email";

// Notification dispatch. Always creates an in-app Notification row.
// Email/SMS/WhatsApp are PLUGGABLE: if the provider env is set we send/POST to
// it, else we no-op (logged). Same graceful-degradation law as lib/ai + lib/irp.
// Email prefers SMTP via lib/email.ts (sendEmail); EMAIL_WEBHOOK_URL remains a
// fallback for anyone wiring a generic webhook instead of SMTP.

export type Channel = "inapp" | "email" | "sms" | "whatsapp";

export async function notify(params: {
  tenantId: string;
  userId?: string | null; // null = whole tenant
  type?: string;
  title: string;
  body?: string;
  link?: string;
  channels?: Channel[]; // defaults to ["inapp"]
  to?: string; // email/phone for external channels
}) {
  const n = await db.notification.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId ?? null,
      type: params.type ?? "info",
      title: params.title,
      body: params.body ?? "",
      link: params.link,
    },
  });
  const channels = params.channels ?? ["inapp"];
  for (const c of channels) {
    if (c === "inapp") continue;
    try {
      await dispatchExternal(c, params);
    } catch (e) {
      console.warn(`[notify] ${c} dispatch failed (non-fatal):`, (e as Error).message);
    }
  }
  return n;
}

async function dispatchExternal(channel: Channel, p: { title: string; body?: string; to?: string }) {
  if (channel === "email") {
    if (!p.to) return;
    if (emailConfigured) {
      // Preferred path: SMTP via lib/email.ts. sendEmail() never throws.
      await sendEmail({
        to: p.to,
        subject: p.title,
        html: `<p>${p.body ?? ""}</p>`,
        text: p.body ?? "",
      });
      return;
    }
    // Fallback: a generic webhook, if configured (no SMTP set).
    const url = process.env.EMAIL_WEBHOOK_URL;
    if (!url) return; // no provider → no-op
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.to, subject: p.title, text: p.body }) });
  } else if (channel === "sms" || channel === "whatsapp") {
    const url = channel === "sms" ? process.env.SMS_WEBHOOK_URL : process.env.WHATSAPP_WEBHOOK_URL;
    if (!url || !p.to) return;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.to, message: `${p.title}\n${p.body ?? ""}` }) });
  }
}

export async function unreadCount(tenantId: string, userId: string) {
  return db.notification.count({ where: { tenantId, read: false, OR: [{ userId }, { userId: null }] } });
}

export async function listNotifications(tenantId: string, userId: string, take = 30) {
  return db.notification.findMany({ where: { tenantId, OR: [{ userId }, { userId: null }] }, orderBy: { createdAt: "desc" }, take });
}

export async function markAllRead(tenantId: string, userId: string) {
  return db.notification.updateMany({ where: { tenantId, read: false, OR: [{ userId }, { userId: null }] }, data: { read: true } });
}
