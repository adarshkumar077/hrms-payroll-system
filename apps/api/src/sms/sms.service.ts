import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Msg91OtpProvider } from './msg91.provider';
import { OtpSmsProvider, SmsSendResult } from './sms.types';

/**
 * Selects the OTP SMS provider from SMS_PROVIDER. There is deliberately no "console" / fake
 * provider for OTPs: when no real provider is fully configured, OTP login reports itself as
 * unavailable instead of pretending to send.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: OtpSmsProvider | null;

  constructor(private readonly config: ConfigService) {
    const name = (this.config.get<string>('SMS_PROVIDER') ?? '').trim().toLowerCase();
    this.provider = name === 'msg91' ? new Msg91OtpProvider(this.config) : null;
    if (!this.isOtpDeliveryEnabled()) {
      this.logger.warn(
        'Mobile OTP login is disabled: set SMS_PROVIDER=msg91 with MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID to enable it.',
      );
    }
  }

  /** Test seam: replace the provider (used only by automated tests). */
  static withProvider(config: ConfigService, provider: OtpSmsProvider | null): SmsService {
    const svc = Object.create(SmsService.prototype) as SmsService;
    Object.assign(svc, { config, provider, logger: new Logger(SmsService.name) });
    return svc;
  }

  get providerName(): string {
    return this.provider?.name ?? 'none';
  }

  isOtpDeliveryEnabled(): boolean {
    return Boolean(this.provider?.isConfigured());
  }

  async sendOtp(nationalMobile: string, code: string): Promise<SmsSendResult> {
    if (!this.provider || !this.provider.isConfigured()) {
      return { ok: false, error: 'sms_not_configured' };
    }
    return this.provider.sendOtp(nationalMobile, code);
  }
}
