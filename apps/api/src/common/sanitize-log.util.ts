/** Keys and patterns redacted from logs and audit metadata */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
  'totpCode',
  'otp',
  'code',
  'salary',
  'ctc',
  'bankAccount',
  'aadhaar',
  'pan',
  'authorization',
]);

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BCRYPT_PATTERN = /\$2[aby]?\$\d+\$[./A-Za-z0-9]{53}/g;

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (JWT_PATTERN.test(value) || BCRYPT_PATTERN.test(value)) return '[REDACTED]';
    if (value.length > 500) return `${value.slice(0, 120)}…[truncated]`;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeForLog(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k) || /password|token|secret|salary|aadhaar|pan/i.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitizeForLog(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

export function sanitizeLogMessage(message: string): string {
  return message.replace(JWT_PATTERN, '[REDACTED_JWT]').replace(BCRYPT_PATTERN, '[REDACTED_HASH]');
}
