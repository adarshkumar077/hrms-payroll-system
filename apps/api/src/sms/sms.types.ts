export type SmsSendResult = {
  ok: boolean;
  /** Provider request / message id, when the provider returns one. */
  providerMessageId?: string;
  /** Short, non-sensitive reason for logs (never contains the OTP or credentials). */
  error?: string;
};

export interface OtpSmsProvider {
  readonly name: string;
  /** True only when every credential the provider needs is configured. */
  isConfigured(): boolean;
  /** Deliver a login OTP to a 10-digit Indian mobile number. */
  sendOtp(nationalMobile: string, code: string): Promise<SmsSendResult>;
}
