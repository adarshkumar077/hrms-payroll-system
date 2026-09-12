'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import {
  ModuleAlert,
  ModuleListItem,
  ModulePage,
  ModuleSecondaryButton,
  StatusPill,
} from '@/components/layout/ModulePage';

type Lead = {
  id: string;
  title: string;
  status: string;
  contactName?: string;
  expectedValue?: number;
};

const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

export default function CrmPipelinePage() {
  const router = useRouter();
  const [items, setItems] = useState<Lead[]>([]);
  const [error, setError] = useState('');

  function load() {
    api<Lead[]>('/crm/leads')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage, []);
    for (const lead of items) {
      const bucket = map.get(lead.status) ?? map.get('NEW')!;
      bucket.push(lead);
    }
    return map;
  }, [items]);

  async function advanceStatus(id: string, current: string) {
    const idx = PIPELINE_STAGES.indexOf(current as (typeof PIPELINE_STAGES)[number]);
    const next = PIPELINE_STAGES[Math.min(idx + 1, PIPELINE_STAGES.length - 1)];
    if (next === current) return;
    try {
      await api(`/crm/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  }

  return (
    <ModulePage title="Pipeline" subtitle="Lead stages from new inquiry to close">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-7 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = byStage.get(stage) ?? [];
          return (
            <section
              key={stage}
              className="bg-white/80 border border-brand-100 rounded-lg p-3 min-w-[180px] flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-medium text-ink/70 uppercase tracking-wide">{stage.replace(/_/g, ' ')}</p>
                <StatusPill>{stageLeads.length}</StatusPill>
              </div>
              <ul className="space-y-2 flex-1">
                {stageLeads.map((l) => (
                  <ModuleListItem key={l.id}>
                    <p className="font-medium text-sm">{l.title}</p>
                    {l.contactName && <p className="text-xs text-ink/50">{l.contactName}</p>}
                    {l.expectedValue != null && l.expectedValue > 0 && (
                      <p className="text-xs text-ink/50">₹{l.expectedValue.toLocaleString('en-IN')}</p>
                    )}
                    {stage !== 'WON' && stage !== 'LOST' && (
                      <ModuleSecondaryButton
                        type="button"
                        className="mt-2 text-xs"
                        onClick={() => advanceStatus(l.id, l.status)}
                      >
                        Advance
                      </ModuleSecondaryButton>
                    )}
                  </ModuleListItem>
                ))}
                {stageLeads.length === 0 && (
                  <li className="text-xs text-ink/40 p-2 border border-dashed border-mist rounded">Empty</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </ModulePage>
  );
}
