import { OtpSmsProvider, SmsSendResult } from './sms.types';

type ConfigLike = { get<T = string>(key: string): T | undefined };
type FetchLike = typeof fetch;

/**
 * MSG91 "Flow" API (https://docs.msg91.com) using a DLT-approved OTP template.
 *
 * Required env:
 *   MSG91_AUTH_KEY          account auth key (secret)
 *   MSG91_OTP_TEMPLATE_ID   flow/template id of the DLT-approved OTP template
 * Optional env:
 *   MSG91_OTP_VAR           template variable name holding the code (default "otp")
 *   MSG91_BASE_URL          API base (default https://control.msg91.com) — tests point this at a local mock
 *
 * The OTP and the auth key are sent only in the HTTPS request; neither is ever logged or returned.
 */
export class Msg91OtpProvider implements OtpSmsProvider {
  readonly name = 'msg91';

  constructor(
    private readonly config: ConfigLike,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private get authKey() {
    return (this.config.get<string>('MSG91_AUTH_KEY') ?? '').trim();
  }

  private get templateId() {
    return (this.config.get<string>('MSG91_OTP_TEMPLATE_ID') ?? '').trim();
  }

  isConfigured(): boolean {
    return this.authKey.length > 0 && this.templateId.length > 0;
  }

  async sendOtp(nationalMobile: string, code: string): Promise<SmsSendResult> {
    if (!this.isConfigured()) return { ok: false, error: 'msg91_not_configured' };

    const base = (this.config.get<string>('MSG91_BASE_URL') || 'https://control.msg91.com').replace(/\/+$/, '');
    const variable = (this.config.get<string>('MSG91_OTP_VAR') || 'otp').trim();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await this.fetchImpl(`${base}/api/v5/flow`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authkey: this.authKey,
        },
        body: JSON.stringify({
          template_id: this.templateId,
          short_url: '0',
          recipients: [{ mobiles: `91${nationalMobile}`, [variable]: code }],
        }),
        signal: controller.signal,
      });
      let body: { type?: string; message?: string } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* non-JSON error page */
      }
      if (res.ok && body.type === 'success') {
        return { ok: true, providerMessageId: typeof body.message === 'string' ? body.message : undefined };
      }
      return { ok: false, error: `msg91_http_${res.status}_${body.type ?? 'unknown'}` };
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      return { ok: false, error: aborted ? 'msg91_timeout' : 'msg91_network_error' };
    } finally {
      clearTimeout(timer);
    }
  }
}
