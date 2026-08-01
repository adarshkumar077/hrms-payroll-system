import { SessionUser } from './api';
import { isAdmin, isCeo, hasAnyRole } from './roles';

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
  | 'training';

export type NavItem = {
  id: string;
  label: string;
  href?: string;
  icon: NavIcon;
  /** Roles that can see this item in admin view. Empty = all admin roles */
  adminRoles?: string[];
  /** CEO-only items */
  ceoOnly?: boolean;
  /** Hidden from HR in admin view */
  hrRestricted?: boolean;
  /** Show in employee view (pure employees only) */
  employee?: boolean;
  children?: NavItem[];
};

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'dashboard', employee: true, adminRoles: ['CEO', 'HR', 'FINANCE', 'MANAGER', 'ADMIN'] },
      { id: 'analytics', label: 'Analytics', href: '/analytics', icon: 'analytics', adminRoles: ['CEO', 'HR', 'FINANCE', 'MANAGER'] },
    ],
  },
  {
    label: 'People',
    items: [
      {
        id: 'employees',
        label: 'Employee Management',
        icon: 'users',
        adminRoles: ['CEO', 'HR', 'MANAGER', 'FINANCE', 'ADMIN'],
        children: [
          { id: 'emp-directory', label: 'Directory', href: '/employees', icon: 'users', adminRoles: ['CEO', 'HR', 'MANAGER', 'FINANCE', 'ADMIN'] },
        ],
      },
      { id: 'ess', label: 'Self-Service (ESS)', href: '/ess', icon: 'dashboard', employee: true },
      { id: 'company-profile', label: 'Company Profile', href: '/settings/company', icon: 'settings', adminRoles: ['CEO', 'HR'] },
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
          { id: 'att-console', label: 'Console', href: '/attendance', icon: 'attendance', adminRoles: ['CEO', 'HR', 'ADMIN'] },
          { id: 'att-mark', label: 'Mark Attendance', href: '/attendance/mark', icon: 'attendance', employee: true },
        ],
      },
      {
        id: 'leave',
        label: 'Leave Management',
        icon: 'leave',
        children: [
          { id: 'leave-apply', label: 'Apply Leave', href: '/leave/apply', icon: 'leave', employee: true },
          { id: 'leave-approvals', label: 'Approvals', href: '/leave/approvals', icon: 'approvals', adminRoles: ['CEO', 'HR', 'MANAGER'] },
          { id: 'leave-calendar', label: 'Calendar', href: '/leave/calendar', icon: 'leave', employee: true, adminRoles: ['CEO', 'HR', 'MANAGER'] },
          { id: 'leave-balance-sheet', label: 'Balance Sheet', href: '/leave/balance-sheet', icon: 'leave', adminRoles: ['CEO', 'HR'] },
        ],
      },
      { id: 'shifts', label: 'Shifts', href: '/shifts', icon: 'shifts', adminRoles: ['CEO', 'HR'] },
      { id: 'holidays', label: 'Holidays', href: '/holidays', icon: 'holidays', employee: true, adminRoles: ['CEO', 'HR'] },
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
          { id: 'payroll-runs', label: 'Payment Management', href: '/payroll', icon: 'payroll', adminRoles: ['CEO'], ceoOnly: true },
          { id: 'payroll-ctc', label: 'CTC Assignment', href: '/payroll/ctc', icon: 'payroll', adminRoles: ['CEO'], ceoOnly: true },
          { id: 'payslips', label: 'My Payslips', href: '/payroll/payslips', icon: 'payroll', employee: true },
        ],
      },
      { id: 'esd', label: 'ESD Balance', href: '/esd', icon: 'esd', employee: true, adminRoles: ['CEO', 'HR', 'FINANCE'] },
      {
        id: 'loans',
        label: 'Loans & Advances',
        icon: 'loans',
        children: [
          { id: 'loans-mine', label: 'My Loans', href: '/loans', icon: 'loans', employee: true },
          { id: 'loans-queue', label: 'Review Queue', href: '/loans/queue', icon: 'loans', adminRoles: ['CEO', 'HR', 'FINANCE'] },
        ],
      },
      {
        id: 'reimbursements',
        label: 'Reimbursements',
        icon: 'reimbursements',
        children: [
          { id: 'reimb-submit', label: 'Submit Claim', href: '/reimbursements', icon: 'reimbursements', employee: true },
          { id: 'reimb-queue', label: 'Claims Queue', href: '/reimbursements/queue', icon: 'reimbursements', adminRoles: ['CEO', 'HR'] },
        ],
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'onboarding', label: 'Onboarding', href: '/onboarding', icon: 'onboarding', adminRoles: ['CEO', 'HR'] },
      { id: 'exit', label: 'Exit Management', href: '/exit', icon: 'exit', adminRoles: ['CEO', 'HR'] },
      { id: 'performance', label: 'Performance', href: '/performance', icon: 'performance', employee: true, adminRoles: ['CEO', 'HR', 'MANAGER'] },
      { id: 'assets', label: 'Assets', href: '/assets', icon: 'assets', employee: true, adminRoles: ['CEO', 'HR', 'FINANCE'] },
      { id: 'tickets', label: 'Helpdesk', href: '/tickets', icon: 'tickets', employee: true, adminRoles: ['CEO', 'HR', 'MANAGER'] },
      { id: 'notifications', label: 'Notifications', href: '/notifications', icon: 'notifications', employee: true, adminRoles: ['CEO', 'HR'] },
      { id: 'approvals', label: 'Approval Inbox', href: '/approvals', icon: 'approvals', employee: true, adminRoles: ['CEO', 'HR', 'MANAGER', 'FINANCE'] },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', href: '/reports', icon: 'reports', adminRoles: ['CEO', 'HR', 'FINANCE', 'MANAGER'] },
      { id: 'compliance', label: 'Compliance', href: '/compliance', icon: 'compliance', adminRoles: ['CEO', 'HR', 'FINANCE'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'workflows', label: 'Workflows', href: '/workflows', icon: 'workflows', adminRoles: ['CEO', 'HR'] },
      { id: 'integrations', label: 'Integrations', href: '/integrations', icon: 'integrations', adminRoles: ['CEO'], ceoOnly: true },
      { id: 'trainings', label: 'Training', href: '/trainings', icon: 'training', adminRoles: ['CEO', 'HR'] },
      { id: 'security', label: 'Security', href: '/security', icon: 'security', adminRoles: ['CEO', 'HR'] },
      { id: 'audit', label: 'Audit Logs', href: '/security/audit', icon: 'audit', adminRoles: ['CEO'], ceoOnly: true },
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
  if (item.ceoOnly && !isCeo(user)) return false;
  if (item.hrRestricted && !isCeo(user) && user.roles.includes('HR')) {
    if (item.id === 'audit' || item.id === 'integrations') return false;
  }
  if (!item.adminRoles || item.adminRoles.length === 0) {
    return isAdmin(user) || hasAnyRole(user, ['FINANCE', 'MANAGER', 'ADMIN']);
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

  // Admin mode: never show pure employee-only items (mark attendance, apply leave, etc.)
  if (item.employee && !item.adminRoles && !item.ceoOnly) {
    return null;
  }

  return canSeeAdminItem(user, item) ? item : null;
}

export function getNavigation(user: SessionUser, viewMode: 'admin' | 'employee') {
  const resolved: 'admin' | 'employee' = isAdmin(user) ? viewMode : 'employee';

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .map((item) => filterNavItem(user, item, resolved))
      .filter((item): item is NavItem => item !== null),
  })).filter((g) => g.items.length > 0);
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
  if (pathname === '/dashboard' || pathname === '/help') return true;
  if (pathname === '/account/password') return true;
  if (pathname.startsWith('/docs/')) return true;
  if (pathname.startsWith('/ess')) return true;
  if (pathname.startsWith('/me/')) return true;
  if (pathname.startsWith('/exit/')) return isAdmin(user) || hasAnyRole(user, ['HR']);

  const mode: 'admin' | 'employee' = isAdmin(user) ? 'admin' : 'employee';
  const routes = getAllSearchableRoutes(user, mode);
  return routes.some((r) => {
    if (!r.href) return false;
    if (pathname === r.href) return true;
    // Dynamic segments: /employees/:id, /payroll/:id, /payroll/payslips/:id
    if (pathname.startsWith(r.href + '/')) return true;
    return false;
  });
}

