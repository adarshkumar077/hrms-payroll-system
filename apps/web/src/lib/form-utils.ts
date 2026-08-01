/** Fields that must never be sent from the client on create/update. */
const DB_MANAGED_KEYS = new Set([
  'id',
  'employeeId',
  'companyId',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

export function pickWritableFields<T extends Record<string, unknown>>(
  source: T | null | undefined,
  allowed: readonly string[],
): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = source[key];
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function stripDbManagedFields<T extends Record<string, unknown>>(
  source: T | null | undefined,
): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!DB_MANAGED_KEYS.has(key)) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export const GENDER_OPTIONS = ['Male', 'Female', 'Transgender'] as const;

export const EMPLOYMENT_TYPE_OPTIONS = ['Full Time', 'Part Time'] as const;

export const PERSONAL_WRITABLE = [
  'nationality',
  'religion',
  'fatherName',
  'motherName',
  'spouseName',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'country',
  'pincode',
  'permanentLine1',
  'permanentLine2',
  'permanentCity',
  'permanentState',
  'permanentCountry',
  'permanentPincode',
] as const;

export const EMPLOYMENT_WRITABLE = [
  'employmentType',
  'workLocation',
  'grade',
  'band',
  'costCenter',
  'shiftCode',
  'noticePeriodDays',
  'offerDate',
  'contractEndAt',
  'notes',
] as const;

export const BANK_WRITABLE = [
  'accountHolder',
  'bankName',
  'accountNumber',
  'ifsc',
  'branch',
  'accountType',
] as const;

export const GOVERNMENT_WRITABLE = [
  'aadhaarNumber',
  'panNumber',
  'passportNumber',
  'uan',
  'pfNumber',
  'esicNumber',
] as const;

export function sanitizeMobileInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

export function isValidMobile(mobile: string | null | undefined) {
  return typeof mobile === 'string' && /^[0-9]{10}$/.test(mobile);
}

export const MOBILE_VALIDATION_MESSAGE = 'Please enter a valid 10-digit mobile number.';

export const EMPLOYEE_CODE_EXISTS_MSG =
  'Employee Code already exists. Please enter a unique Employee Code.';

export function validateEmployeeForm(data: {
  firstName?: string | null;
  gender?: string | null;
  mobile?: string | null;
  employeeCode?: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.firstName?.trim()) errors.firstName = 'First name is required.';
  if (!data.employeeCode?.trim()) errors.employeeCode = 'Employee Code is required.';
  if (!data.gender || !GENDER_OPTIONS.includes(data.gender as (typeof GENDER_OPTIONS)[number])) {
    errors.gender = 'Gender is required.';
  }
  if (!isValidMobile(data.mobile)) {
    errors.mobile = MOBILE_VALIDATION_MESSAGE;
  }
  return errors;
}
