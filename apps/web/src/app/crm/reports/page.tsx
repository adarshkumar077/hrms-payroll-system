'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { ModuleAlert, ModulePage, ModuleSection } from '@/components/layout/ModulePage';

type SalesReport = {
  leadsByStatus: { status: string; _count: { _all: number } }[];
  dealsByStage: { stage: string; _count: { _all: number }; _sum: { amount: number | null } }[];
  topDeals: { id: string; title: string; amount: number; stage: string }[];
};

export default function CrmReportsPage() {
  const router = useRouter();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    api<SalesReport>('/crm/reports/sales')
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [router]);

  return (
    <ModulePage title="Sales Reports" subtitle="Lead funnel and deal performance">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      {report && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ModuleSection className="mb-0">
            <p className="font-medium text-ink/80 mb-2">Leads by status</p>
            <ul className="space-y-2">
              {report.leadsByStatus.map((r) => (
                <li key={r.status} className="flex justify-between">
                  <span>{r.status}</span>
                  <span className="font-medium">{r._count._all}</span>
                </li>
              ))}
            </ul>
          </ModuleSection>

          <ModuleSection className="mb-0">
            <p className="font-medium text-ink/80 mb-2">Deals by stage</p>
            <ul className="space-y-2">
              {report.dealsByStage.map((r) => (
                <li key={r.stage} className="flex justify-between gap-2">
                  <span>{r.stage}</span>
                  <span className="font-medium text-right">
                    {r._count._all} · ₹{(r._sum.amount ?? 0).toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
            </ul>
          </ModuleSection>

          <ModuleSection className="mb-0 lg:col-span-2">
            <p className="font-medium text-ink/80 mb-2">Top deals</p>
            <ul className="space-y-2">
              {report.topDeals.map((d) => (
                <li key={d.id} className="flex justify-between gap-2 border-b border-mist/50 pb-2 last:border-0">
                  <span>{d.title}</span>
                  <span className="text-ink/60">
                    {d.stage} · ₹{d.amount.toLocaleString('en-IN')}
                  </span>
                </li>
              ))}
              {report.topDeals.length === 0 && <li className="text-ink/50">No deals recorded</li>}
            </ul>
          </ModuleSection>
        </div>
      )}
    </ModulePage>
  );
}
