import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Short label for logs/stats only (e.g. 'otp', 'alert', 'test'). */
  category: string;
  attachments?: { filename: string; content: string | Buffer; contentType?: string }[];
};

export type MailResult = { ok: boolean; messageId?: string; error?: string; attempts: number };

type ConfigLike = { get<T = string>(key: string): T | undefined };

/** Mask an address for logs: a***@example.com. Never log full recipients or message bodies. */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Pragmatic address check used before sending (DTOs do the strict validation on input). */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/.test(email);
}

/** SMTP errors that will not succeed on retry (bad credentials, rejected recipient, bad envelope). */
function isPermanent(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number };
  if (e?.code && ['EAUTH', 'EENVELOPE', 'EMESSAGE', 'ECONFIG'].includes(e.code)) return true;
  return typeof e?.responseCode === 'number' && e.responseCode >= 500;
}

function shortError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; command?: string };
  const parts = [e?.code ?? 'ERROR'];
  if (e?.responseCode) parts.push(String(e.responseCode));
  if (e?.command) parts.push(e.command);
  return parts.join(':').slice(0, 80);
}

/**
 * Outgoing email over SMTP (any provider: company mail server, Google Workspace / Microsoft 365
 * SMTP relay, or a transactional service with SMTP). All settings come from environment
 * variables; nothing is hard-coded. TLS 1.2+ is required. Failures are retried a limited number
 * of times, counted, and exposed to monitoring so administrators are alerted.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null;
  private sentTimestamps: number[] = [];
  private failureTimestamps: number[] = [];
  private lastFailure: { at: Date; error: string; category: string } | null = null;
  private lastSuccessAt: Date | null = null;
  private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  constructor(private readonly config: ConfigService) {
    this.transporter = this.isConfigured() ? this.buildTransport() : null;
    if (!this.transporter) {
      this.logger.warn('Email (SMTP) is not configured: set SMTP_HOST and SMTP_FROM_EMAIL (see docs/EMAIL_OTP_SETUP.md). Email OTP login is disabled.');
    }
  }

  /** Test seam: inject a transport (e.g. nodemailer jsonTransport or a stub). */
  static withTransport(config: ConfigLike, transport: Pick<Transporter, 'sendMail' | 'verify'> | null): MailService {
    const svc = Object.create(MailService.prototype) as MailService;
    Object.assign(svc, {
      config,
      logger: new Logger(MailService.name),
      transporter: transport,
      sentTimestamps: [],
      failureTimestamps: [],
      lastFailure: null,
      lastSuccessAt: null,
      sleep: async () => undefined,
    });
    return svc;
  }

  private str(key: string): string {
    return (this.config.get<string>(key) ?? '').toString().trim();
  }

  isConfigured(): boolean {
    return this.str('SMTP_HOST').length > 0 && isDeliverableEmail(this.str('SMTP_FROM_EMAIL'));
  }

  private buildTransport(): Transporter {
    const port = Number(this.str('SMTP_PORT') || 587);
    const secure = this.str('SMTP_SECURE') ? this.str('SMTP_SECURE') === 'true' : port === 465;
    const user = this.str('SMTP_USER');
    return nodemailer.createTransport({
      host: this.str('SMTP_HOST'),
      port,
      secure,
      // On 587/25, refuse to send unless the server upgrades to TLS (STARTTLS).
      requireTLS: !secure && this.str('SMTP_REQUIRE_TLS') !== 'false',
      auth: user ? { user, pass: this.str('SMTP_PASSWORD') } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' },
    });
  }

  fromHeader(): { name: string; address: string } {
    return { name: this.str('SMTP_FROM_NAME') || 'EITF HRMS', address: this.str('SMTP_FROM_EMAIL') };
  }

  /** Checks the SMTP connection and login without sending anything. */
  async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) return { ok: false, error: 'smtp_not_configured' };
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: shortError(err) };
    }
  }

  private maxPerMinute(): number {
    const n = Number(this.str('MAIL_MAX_PER_MINUTE') || 60);
    return Number.isFinite(n) && n > 0 ? n : 60;
  }

  async send(msg: MailMessage): Promise<MailResult> {
    if (!this.transporter) return { ok: false, error: 'smtp_not_configured', attempts: 0 };
    if (!isDeliverableEmail(msg.to)) return { ok: false, error: 'invalid_recipient', attempts: 0 };

    const now = Date.now();
    this.sentTimestamps = this.sentTimestamps.filter((t) => now - t < 60_000);
    if (this.sentTimestamps.length >= this.maxPerMinute()) {
      this.recordFailure('rate_limited', msg.category);
      return { ok: false, error: 'rate_limited', attempts: 0 };
    }
    this.sentTimestamps.push(now);

    const delays = [0, 2_000, 5_000];
    let lastError = 'unknown';
    for (let attempt = 1; attempt <= delays.length; attempt++) {
      if (delays[attempt - 1]) await this.sleep(delays[attempt - 1]);
      try {
        const info = await this.transporter.sendMail({
          from: this.fromHeader(),
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
          attachments: msg.attachments,
        });
        this.lastSuccessAt = new Date();
        return { ok: true, messageId: typeof info?.messageId === 'string' ? info.messageId : undefined, attempts: attempt };
      } catch (err) {
        lastError = shortError(err);
        if (isPermanent(err)) {
          this.recordFailure(lastError, msg.category);
          this.logger.error(`Email (${msg.category}) to ${maskEmail(msg.to)} failed permanently: ${lastError}`);
          return { ok: false, error: lastError, attempts: attempt };
        }
      }
    }
    this.recordFailure(lastError, msg.category);
    this.logger.error(`Email (${msg.category}) to ${maskEmail(msg.to)} failed after ${delays.length} attempts: ${lastError}`);
    return { ok: false, error: lastError, attempts: delays.length };
  }

  private recordFailure(error: string, category: string) {
    const now = Date.now();
    this.failureTimestamps = this.failureTimestamps.filter((t) => now - t < 60 * 60_000);
    this.failureTimestamps.push(now);
    this.lastFailure = { at: new Date(now), error, category };
  }

  /** Delivery health for monitoring/alerts (no addresses or content). */
  stats() {
    const now = Date.now();
    return {
      configured: Boolean(this.transporter),
      failuresLast15m: this.failureTimestamps.filter((t) => now - t < 15 * 60_000).length,
      failuresLastHour: this.failureTimestamps.filter((t) => now - t < 60 * 60_000).length,
      lastFailure: this.lastFailure,
      lastSuccessAt: this.lastSuccessAt,
    };
  }
}
