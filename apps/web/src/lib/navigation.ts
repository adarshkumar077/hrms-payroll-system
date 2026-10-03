import { SessionUser } from './api';
import { isAdmin, isSuperAdmin, isHr, hasAnyRole } from './roles';

export type NavIcon =
  | 'dashboard'
  | 'users'
  | 'hr'
  | 'attendance'
  | 'leave'
  | 'payroll'
  | 'recruitment'
  | 'performance'
  | 'departments'
  | 'assets'
  | 'documents'
  | 'projects'
  | 'reports'
  | 'settings'
  | 'roles'
  | 'audit'
  | 'notifications'
  | 'help'
  | 'security'
  | 'compliance'
  | 'exit'
  | 'esd'
  | 'reimbursements'
  | 'loans'
  | 'tickets'
  | 'onboarding'
  | 'holidays'
  | 'analytics'
  | 'approvals'
  | 'workflows'
  | 'integrations'
  | 'shifts'
  | 'training'
  | 'billing'
  | 'assistant'
  | 'studio'
  | 'import';

export type NavItem = {
  id: string;
  label: string;
  href?: string;
  icon: NavIcon;
  /** Roles that can see this item in admin view. Empty = all admin roles */
  adminRoles?: string[];
  /** Super Admin only items */
  superAdminOnly?: boolean;
  /** Hidden from HR in admin view */
  hrRestricted?: boolean;
  /** Show in employee view (pure employees only) */
  employee?: boolean;
  children?: NavItem[];
};

/** HR Attendance & Payroll focused navigation — CRM removed. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
      { id: 'analytics', label: 'Analytics', href: '/analytics', icon: 'analytics', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
    ],
  },
  {
    label: 'People',
    items: [
      {
        id: 'employees',
        label: 'Employee Management',
        icon: 'users',
        adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'],
        children: [
          { id: 'emp-directory', label: 'Directory', href: '/employees', icon: 'users', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
        ],
      },
      { id: 'ess', label: 'Self-Service (ESS)', href: '/ess', icon: 'dashboard', employee: true },
      { id: 'company-profile', label: 'Company Profile', href: '/settings/company', icon: 'settings', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'profile', label: 'My Profile', href: '/me/profile', icon: 'users', employee: true },
      { id: 'documents', label: 'Documents', href: '/me/documents', icon: 'documents', employee: true },
    ],
  },
  {
    label: 'Time & Attendance',
    items: [
      {
        id: 'attendance',
        label: 'Attendance',
        icon: 'attendance',
        children: [
          { id: 'att-console', label: 'Console', href: '/attendance', icon: 'attendance', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
          { id: 'att-mark', label: 'Mark Attendance', href: '/attendance/mark', icon: 'attendance', employee: true },
          { id: 'att-sheet', label: 'Attendance Sheet', href: '/attendance/sheet', icon: 'attendance', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'], employee: true },
          { id: 'att-calendar', label: 'My Calendar', href: '/me/attendance/calendar', icon: 'attendance', employee: true },
        ],
      },
      {
        id: 'leave',
        label: 'Leave Management',
        icon: 'leave',
        children: [
          { id: 'leave-apply', label: 'Apply Leave', href: '/leave/apply', icon: 'leave', employee: true },
          { id: 'leave-approvals', label: 'Approvals', href: '/leave/approvals', icon: 'approvals', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
          { id: 'leave-calendar', label: 'Calendar', href: '/leave/calendar', icon: 'leave', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
          { id: 'leave-balance-sheet', label: 'Balance Sheet', href: '/leave/balance-sheet', icon: 'leave', adminRoles: ['SUPER_ADMIN', 'HR'] },
        ],
      },
      { id: 'shifts', label: 'Shifts', href: '/shifts', icon: 'shifts', adminRoles: ['SUPER_ADMIN', 'HR'] },
          { id: 'holidays', label: 'Holidays', href: '/holidays', icon: 'holidays', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
    ],
  },
  {
    label: 'Compensation',
    items: [
      {
        id: 'payroll',
        label: 'Payroll',
        icon: 'payroll',
        children: [
          { id: 'payroll-runs', label: 'Payment Management', href: '/payroll', icon: 'payroll', adminRoles: ['SUPER_ADMIN', 'ADMIN', 'HR'] },
          { id: 'payroll-ctc', label: 'CTC Assignment', href: '/payroll/ctc', icon: 'payroll', adminRoles: ['SUPER_ADMIN', 'ADMIN', 'HR'] },
          { id: 'payslips', label: 'My Payslips', href: '/payroll/payslips', icon: 'payroll', employee: true },
        ],
      },
      { id: 'esd', label: 'ESD Balance', href: '/esd', icon: 'esd', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
      {
        id: 'loans',
        label: 'Loans & Advances',
        icon: 'loans',
        children: [
          { id: 'loans-mine', label: 'My Loans', href: '/loans', icon: 'loans', employee: true },
          { id: 'loans-queue', label: 'Review Queue', href: '/loans/queue', icon: 'loans', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
        ],
      },
      {
        id: 'reimbursements',
        label: 'Reimbursements',
        icon: 'reimbursements',
        children: [
          { id: 'reimb-submit', label: 'Submit Claim', href: '/reimbursements', icon: 'reimbursements', employee: true },
          { id: 'reimb-queue', label: 'Claims Queue', href: '/reimbursements/queue', icon: 'reimbursements', adminRoles: ['SUPER_ADMIN', 'HR'] },
        ],
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'assistant', label: 'EITF AI Assistant', href: '/assistant', icon: 'assistant', employee: true, adminRoles: ['SUPER_ADMIN', 'ADMIN', 'HR'] },
      { id: 'ai-console', label: 'AI Console', href: '/ai-console', icon: 'analytics', adminRoles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    label: 'Setup',
    items: [
      { id: 'studio', label: 'Studio', href: '/studio', icon: 'studio', adminRoles: ['SUPER_ADMIN', 'ADMIN'] },
      { id: 'setup-integrations', label: 'Integrations', href: '/integrations', icon: 'integrations', adminRoles: ['SUPER_ADMIN', 'ADMIN'] },
      { id: 'library-docs', label: 'Documents', href: '/documents', icon: 'documents', employee: true, adminRoles: ['SUPER_ADMIN', 'ADMIN', 'HR'] },
      { id: 'import-export', label: 'Import / Export', href: '/import-export', icon: 'import', adminRoles: ['SUPER_ADMIN', 'ADMIN', 'HR'], employee: true },
      { id: 'admin-users', label: 'Admin & Users', href: '/admin/users', icon: 'users', adminRoles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'onboarding', label: 'Onboarding', href: '/onboarding', icon: 'onboarding', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'exit', label: 'Exit Management', href: '/exit', icon: 'exit', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'performance', label: 'Performance', href: '/performance', icon: 'performance', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
      { id: 'assets', label: 'Assets', href: '/assets', icon: 'assets', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
      { id: 'tickets', label: 'Helpdesk', href: '/tickets', icon: 'tickets', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
      { id: 'notifications', label: 'Notifications', href: '/notifications', icon: 'notifications', employee: true, adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'approvals', label: 'Approval Inbox', href: '/approvals', icon: 'approvals', employee: true, adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', href: '/reports', icon: 'reports', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
      { id: 'compliance', label: 'Compliance', href: '/compliance', icon: 'compliance', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'workflows', label: 'Workflows', href: '/workflows', icon: 'workflows', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'trainings', label: 'Training', href: '/trainings', icon: 'training', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'security', label: 'Security', href: '/security', icon: 'security', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'audit', label: 'Audit Logs', href: '/security/audit', icon: 'audit', adminRoles: ['SUPER_ADMIN'], superAdminOnly: true },
      { id: 'login-activity', label: 'Login Activity', href: '/admin/login-activity', icon: 'audit', adminRoles: ['SUPER_ADMIN'], superAdminOnly: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'settings-company', label: 'Company', href: '/settings/company', icon: 'settings', adminRoles: ['SUPER_ADMIN', 'HR'] },
      { id: 'billing', label: 'Billing', href: '/billing', icon: 'billing', adminRoles: ['SUPER_ADMIN', 'HR', 'ADMIN'] },
    ],
  },
  {
    label: 'Support',
    items: [
      { id: 'help', label: 'Help & Support', href: '/help', icon: 'help', employee: true },
    ],
  },
];

function canSeeAdminItem(user: SessionUser, item: NavItem): boolean {
  if (item.superAdminOnly && !isSuperAdmin(user)) return false;
  if (item.hrRestricted && !isSuperAdmin(user) && user.roles.includes('HR')) {
    if (item.id === 'audit' || item.id === 'integrations') return false;
  }
  if (!item.adminRoles || item.adminRoles.length === 0) {
    return isAdmin(user);
  }
  return hasAnyRole(user, item.adminRoles);
}

function filterNavItem(user: SessionUser, item: NavItem, mode: 'admin' | 'employee'): NavItem | null {
  if (item.children?.length) {
    const children = item.children
      .map((c) => filterNavItem(user, c, mode))
      .filter((c): c is NavItem => c !== null);
    if (children.length === 0) return null;
    return { ...item, children };
  }

  if (mode === 'employee') {
    return item.employee ? item : null;
  }

  if (item.employee && !item.adminRoles && !item.superAdminOnly) {
    return null;
  }

  return canSeeAdminItem(user, item) ? item : null;
}

/** Locked sidebar order for Admin, Employee, Super Admin, HR, and mobile. */
const NAV_GROUP_ORDER = [
  'Overview',
  'People',
  'Time & Attendance',
  'Compensation',
  'Intelligence',
  'Setup',
  'Operations',
  'Insights',
  'Administration',
  'Settings',
  'Support',
] as const;

export function getNavigation(user: SessionUser, viewMode: 'admin' | 'employee') {
  const resolved: 'admin' | 'employee' = isAdmin(user) ? viewMode : 'employee';

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((item) => filterNavItem(user, item, resolved))
      .filter((item): item is NavItem => item !== null),
  }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => NAV_GROUP_ORDER.indexOf(a.label as (typeof NAV_GROUP_ORDER)[number]) - NAV_GROUP_ORDER.indexOf(b.label as (typeof NAV_GROUP_ORDER)[number]));
}

export function flattenNav(items: NavItem[]): NavItem[] {
  const result: NavItem[] = [];
  for (const item of items) {
    if (item.href) result.push(item);
    if (item.children) result.push(...flattenNav(item.children));
  }
  return result;
}

export function getAllSearchableRoutes(user: SessionUser, viewMode: 'admin' | 'employee') {
  return getNavigation(user, viewMode).flatMap((g) => flattenNav(g.items));
}

/** Returns true if the signed-in user may open this path (nav + common dynamic prefixes). */
export function canAccessPath(user: SessionUser, pathname: string): boolean {
  if (pathname === '/studio' || pathname.startsWith('/studio/')) {
    return isSuperAdmin(user) || hasAnyRole(user, ['ADMIN']);
  }
  if (pathname === '/ai-console' || pathname.startsWith('/ai-console/')) {
    return isSuperAdmin(user) || hasAnyRole(user, ['ADMIN']);
  }
  if (pathname === '/assistant') return true;
  if (pathname === '/documents' || pathname.startsWith('/documents/')) return true;
  if (pathname === '/import-export') {
    return isAdmin(user) || isSuperAdmin(user) || hasAnyRole(user, ['HR', 'EMPLOYEE']);
  }
  if (pathname === '/integrations' || pathname.startsWith('/integrations/')) {
    return isSuperAdmin(user) || hasAnyRole(user, ['ADMIN']);
  }
  if (pathname.startsWith('/admin/')) {
    return isSuperAdmin(user) || hasAnyRole(user, ['ADMIN']);
  }
  // CRM routes removed from product — deny access
  if (
    pathname === '/crm' ||
    pathname.startsWith('/crm/') ||
    pathname === '/orbit' ||
    pathname.startsWith('/orbit/') ||
    pathname.startsWith('/sso/orbit')
  ) {
    return false;
  }
  if (pathname === '/billing' || pathname.startsWith('/billing/')) {
    return isAdmin(user) || isSuperAdmin(user);
  }
  if (pathname === '/dashboard' || pathname === '/help') return true;
  if (pathname === '/account/password') return true;
  if (pathname.startsWith('/docs/')) {
    return isSuperAdmin(user) || isHr(user);
  }
  if (pathname.startsWith('/ess')) return true;
  if (pathname.startsWith('/me/')) return true;
  if (pathname.startsWith('/exit/')) return isAdmin(user) || hasAnyRole(user, ['HR']);

  const mode: 'admin' | 'employee' = isAdmin(user) ? 'admin' : 'employee';
  const routes = getAllSearchableRoutes(user, mode);
  return routes.some((r) => {
    if (!r.href) return false;
    if (pathname === r.href) return true;
    if (pathname.startsWith(r.href + '/')) return true;
    return false;
  });
}
