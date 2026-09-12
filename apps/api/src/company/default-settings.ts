export type SettingDef = {
  key: string;
  label: string;
  group: string;
  value: unknown;
};

/** All business rules live here — never hardcode thresholds in services/UI. */
export const DEFAULT_COMPANY_SETTINGS: SettingDef[] = [
  // Office timing
  { key: 'office.work_start', label: 'Work start time', group: 'attendance', value: '10:15' },
  { key: 'office.work_end', label: 'Work end time', group: 'attendance', value: '18:30' },
  { key: 'office.grace_minutes', label: 'Grace period (minutes)', group: 'attendance', value: 0 },
  { key: 'office.half_day_hours', label: 'Half-day threshold (hours)', group: 'attendance', value: 4 },
  { key: 'office.full_day_hours', label: 'Full-day threshold (hours)', group: 'attendance', value: 8 },

  // Late mark & ULOB
  { key: 'attendance.late_mark_enabled', label: 'Late mark enabled', group: 'attendance', value: true },
  { key: 'attendance.late_marks_to_half_day', label: 'Late marks to half day', group: 'attendance', value: 3 },
  { key: 'attendance.late_warning_1', label: 'Late 1 action', group: 'attendance', value: 'warning' },
  { key: 'attendance.late_warning_2', label: 'Late 2 action', group: 'attendance', value: 'warning' },
  { key: 'attendance.ulob_threshold', label: 'ULOB threshold (late marks)', group: 'attendance', value: 4 },
  { key: 'attendance.ulob_absent_days', label: 'Absent days on ULOB threshold', group: 'attendance', value: 2 },
  { key: 'attendance.ulob_window_months', label: 'ULOB rolling window (months)', group: 'attendance', value: 6 },
  { key: 'attendance.ulob_reset_months', label: 'ULOB counter reset (months)', group: 'attendance', value: 6 },

  // Incentive
  { key: 'incentive.enabled', label: 'Attendance incentive enabled', group: 'incentive', value: true },
  { key: 'incentive.amount', label: 'Monthly incentive amount', group: 'incentive', value: 500 },
  { key: 'incentive.max_late_marks', label: 'Max late marks for incentive', group: 'incentive', value: 0 },
  { key: 'incentive.require_no_half_day', label: 'No half day for incentive', group: 'incentive', value: true },
  { key: 'incentive.require_no_absent', label: 'No absent for incentive', group: 'incentive', value: true },
  { key: 'incentive.require_no_ulob', label: 'No ULOB for incentive', group: 'incentive', value: true },

  // ESD
  { key: 'esd.enabled', label: 'Employee Security Deposit enabled', group: 'esd', value: true },
  { key: 'esd.monthly_amount', label: 'ESD monthly amount', group: 'esd', value: 500 },
  { key: 'esd.interest_rate_annual', label: 'ESD annual interest rate %', group: 'esd', value: 0 },

  // Leave accrual
  { key: 'leave.probation_months', label: 'Leave probation (months)', group: 'leave', value: 6 },
  { key: 'leave.credit_at_probation_end', label: 'Leave days at probation end', group: 'leave', value: 6 },
  { key: 'leave.monthly_credit_after', label: 'Monthly leave credit after probation', group: 'leave', value: 1 },
  { key: 'leave.carry_forward_enabled', label: 'Leave carry-forward enabled', group: 'leave', value: true },
  { key: 'leave.carry_forward_max', label: 'Max carry-forward days', group: 'leave', value: 999 },
  { key: 'leave.expire_enabled', label: 'Leave expiry enabled', group: 'leave', value: false },

  // Security
  { key: 'security.max_failed_logins', label: 'Max failed login attempts', group: 'security', value: 5 },
  { key: 'security.lockout_minutes', label: 'Account lockout (minutes)', group: 'security', value: 30 },
  { key: 'security.session_timeout_minutes', label: 'Session timeout (minutes)', group: 'security', value: 480 },
  { key: 'security.password_min_length', label: 'Password min length', group: 'security', value: 5 },
  { key: 'security.password_require_upper', label: 'Password requires uppercase', group: 'security', value: false },
  { key: 'security.password_require_number', label: 'Password requires number', group: 'security', value: false },
  { key: 'security.password_require_special', label: 'Password requires special char', group: 'security', value: false },
  { key: 'security.require_2fa_for_admins', label: 'Require 2FA for Super Admin/HR', group: 'security', value: false },
  { key: 'security.ip_allowlist', label: 'IP allow-list (empty = all)', group: 'security', value: [] },
  { key: 'security.backup_enabled', label: 'Daily backup enabled', group: 'security', value: true },
  { key: 'security.backup_hour_utc', label: 'Daily backup hour (UTC 0-23)', group: 'security', value: 2 },

  // Weekly off
  { key: 'weekly_off.days', label: 'Weekly off days (0=Sun)', group: 'holidays', value: [0] },
  { key: 'weekly_off.paid_saturday', label: 'Paid Saturday rule enabled', group: 'holidays', value: true },
  { key: 'weekly_off.extra_day_pay_on_work', label: 'Extra day salary when WO worked', group: 'holidays', value: true },

  // Company profile extras (stored as settings)
  { key: 'company.cin', label: 'CIN Number', group: 'company_profile', value: '' },
  { key: 'company.industry', label: 'Industry', group: 'company_profile', value: '' },
  { key: 'company.company_type', label: 'Company Type', group: 'company_profile', value: '' },
  { key: 'company.founded_date', label: 'Founded Date', group: 'company_profile', value: '' },
  { key: 'company.description', label: 'Company Description', group: 'company_profile', value: '' },
  { key: 'company.branches', label: 'Branches (JSON array)', group: 'company_profile', value: [] },
  { key: 'company.contact_numbers', label: 'Contact Numbers (JSON array)', group: 'company_profile', value: [] },
  { key: 'company.social_links', label: 'Social Links (JSON object)', group: 'company_profile', value: {} },
  { key: 'company.bank_details', label: 'Bank Details (JSON object)', group: 'company_profile', value: {} },
  { key: 'company.upi', label: 'UPI ID', group: 'company_profile', value: '' },
  { key: 'company.field_visibility', label: 'Field visibility to employees', group: 'company_profile', value: {} },

  // Geo / methods
  { key: 'attendance.methods_enabled', label: 'Enabled attendance methods', group: 'attendance', value: ['MANUAL', 'SELFIE', 'WEB', 'GPS'] },
  { key: 'attendance.ot_multiplier', label: 'Overtime pay multiplier', group: 'attendance', value: 1.5 },
  { key: 'attendance.geofence_lat', label: 'Office geofence latitude', group: 'attendance', value: 0 },
  { key: 'attendance.geofence_lng', label: 'Office geofence longitude', group: 'attendance', value: 0 },
  { key: 'attendance.geofence_radius_m', label: 'Geofence radius (meters)', group: 'attendance', value: 200 },
  { key: 'attendance.qr_secret', label: 'QR attendance secret', group: 'attendance', value: 'change-me-qr-secret' },
  { key: 'integrations.biometric_webhook_secret', label: 'Biometric webhook secret', group: 'integrations', value: 'change-me-biometric-secret' },
];

export const DEFAULT_POLICIES = [
  {
    code: 'attendance',
    title: 'Attendance Policy',
    description: 'Rules for marking attendance, late marks, and ULOB',
    content: 'Configure via Company Settings. Late marks and ULOB thresholds are applied automatically.',
    isEnabled: true,
  },
  {
    code: 'leave',
    title: 'Leave Policy',
    description: 'Accrual, carry-forward, and approval rules',
    content: 'Leave accrues per company settings. First probation period credits 0 until configured threshold.',
    isEnabled: true,
  },
  {
    code: 'payroll',
    title: 'Payroll Policy',
    description: 'Salary processing and statutory deductions',
    content: 'Payroll runs are draft until approved; approved payslips are immutable.',
    isEnabled: true,
  },
];
