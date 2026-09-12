'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { canAccessCrm } from '@/lib/roles';
import { ModuleAlert, ModulePage, ModuleSection } from '@/components/layout/ModulePage';

type CrmDash = {
  totalLeads: number;
  newLeads: number;
  followUpsToday: number;
  dealsWon: number;
  revenue: number;
};

const LINKS: { href: string; label: string; description: string }[] = [
  { href: '/crm/leads', label: 'Leads', description: 'Track and manage sales leads' },
  { href: '/crm/deals', label: 'Deals', description: 'Open and closed opportunities' },
  { href: '/crm/customers', label: 'Customers', description: 'Customer accounts (Orbit Accounts)' },
  { href: '/crm/pipeline', label: 'Pipeline', description: 'Lead stages to close' },
  { href: '/crm/follow-ups', label: 'Follow-ups', description: 'Scheduled follow-up actions' },
  { href: '/crm/tasks', label: 'Tasks', description: 'CRM task list' },
  { href: '/crm/notes', label: 'Notes', description: 'Shared CRM notes' },
  { href: '/crm/reports', label: 'Sales Reports', description: 'Funnel and deal performance' },
];
export default function CrmDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<CrmDash | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!canAccessCrm(u)) {
      router.replace('/dashboard');
      return;
    }

    api<CrmDash>('/crm/dashboard')
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <ModulePage
      title="CRM Dashboard"
      subtitle="Orbit CRM merged into HRMS — single login, single sidebar (source: vendor/orbit-crm)"
    >
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-6">
        {(
          [
            { label: 'Total Leads', value: stats?.totalLeads },
            { label: 'New Leads', value: stats?.newLeads },
            { label: 'Follow-ups Today', value: stats?.followUpsToday },
            { label: 'Deals Won', value: stats?.dealsWon },
            {
              label: 'Revenue',
              value:
                stats != null
                  ? `₹${stats.revenue.toLocaleString('en-IN')}`
                  : undefined,
            },
          ] as const
        ).map((card) => (
          <ModuleSection key={card.label} className="mb-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">{card.label}</p>
            <p className="font-display text-2xl font-bold text-brand-700 mt-2">
              {loading ? '…' : (card.value ?? '—')}
            </p>
          </ModuleSection>
        ))}
      </div>

      <ModuleSection>
        <p className="font-medium text-ink/80 mb-3">CRM modules</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-lg border border-brand-100 bg-white/60 p-3 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
            >
              <p className="font-medium text-brand-700">{link.label}</p>
              <p className="text-xs text-ink/50 mt-1">{link.description}</p>
            </Link>
          ))}
        </div>
      </ModuleSection>
    </ModulePage>
  );
}
