/**
 * Indian mobile number helpers for OTP login.
 *
 * Employee records store a bare 10-digit number (employee.dto.ts enforces /^[0-9]{10}$/).
 * Users may type +91, 91, 0 prefixes, spaces or dashes; all normalise to the 10 digits.
 */

/** Returns the 10-digit national number, or null when the input is not a valid Indian mobile. */
export function normalizeIndianMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
}

/** For logs only: never log a full mobile number. */
export function maskMobile(national: string | null | undefined): string {
  if (!national) return '******';
  return `******${national.slice(-4)}`;
}
