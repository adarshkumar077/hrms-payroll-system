import {
  BANK_WRITABLE,
  EMPLOYMENT_WRITABLE,
  GOVERNMENT_WRITABLE,
  PERSONAL_WRITABLE,
  pickWritableFields,
} from './form-utils';

type EmployeePayloadSource = {
  employeeCode?: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  workEmail?: string | null;
  personalEmail?: string | null;
  department?: string | null;
  designation?: string | null;
  gender?: string | null;
  personal?: Record<string, unknown> | null;
  employment?: Record<string, unknown> | null;
  bank?: Record<string, unknown> | null;
  government?: Record<string, unknown> | null;
  emergencyContacts?: { name: string; phone: string; relation?: string | null }[];
  familyMembers?: { name: string; relation: string }[];
};

export function buildEmployeeUpdatePayload(emp: EmployeePayloadSource) {
  return {
    ...(emp.employeeCode ? { employeeCode: emp.employeeCode.trim() } : {}),
    firstName: emp.firstName,
    middleName: emp.middleName ?? undefined,
    lastName: emp.lastName ?? undefined,
    email: emp.email ?? undefined,
    mobile: emp.mobile ?? undefined,
    workEmail: emp.workEmail ?? undefined,
    personalEmail: emp.personalEmail ?? undefined,
    department: emp.department ?? undefined,
    designation: emp.designation ?? undefined,
    gender: emp.gender ?? undefined,
    personal: pickWritableFields(emp.personal, PERSONAL_WRITABLE),
    employment: pickWritableFields(emp.employment, EMPLOYMENT_WRITABLE),
    bank: pickWritableFields(emp.bank, BANK_WRITABLE),
    government: pickWritableFields(emp.government, GOVERNMENT_WRITABLE),
    emergencyContacts: emp.emergencyContacts?.map((c) => ({
      name: c.name,
      phone: c.phone,
      relation: c.relation ?? undefined,
    })),
    familyMembers: emp.familyMembers?.map((m) => ({
      name: m.name,
      relation: m.relation,
    })),
  };
}
