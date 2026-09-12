'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import {
  ModuleAlert,
  ModuleButton,
  ModuleInput,
  ModuleList,
  ModuleListItem,
  ModulePage,
  ModuleSection,
  StatusPill,
} from '@/components/layout/ModulePage';

type Deal = {
  id: string;
  title: string;
  stage: string;
  amount: number;
  owner?: { firstName: string; lastName: string };
  customer?: { name: string };
};

export default function CrmDealsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Deal[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<Deal[]>('/crm/deals').then(setItems).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  async function create() {
    if (!title.trim()) return;
    try {
      await api('/crm/deals', {
        method: 'POST',
        body: JSON.stringify({ title, amount: Number(amount) || 0 }),
      });
      setTitle('');
      setAmount('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <ModulePage title="Deals" subtitle="Opportunities and revenue pipeline">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <ModuleSection>
        <div className="grid gap-2 md:grid-cols-2">
          <ModuleInput placeholder="Deal title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <ModuleInput placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <ModuleButton type="button" onClick={create}>
          Create deal
        </ModuleButton>
      </ModuleSection>

      <ModuleList>
        {items.map((d) => (
          <ModuleListItem key={d.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-ink/50 mt-0.5">
                  ₹{d.amount.toLocaleString('en-IN')}
                  {d.customer?.name ? ` · ${d.customer.name}` : ''}
                  {d.owner ? ` · ${d.owner.firstName} ${d.owner.lastName}` : ''}
                </p>
              </div>
              <StatusPill>{d.stage}</StatusPill>
            </div>
          </ModuleListItem>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No deals yet</li>
        )}
      </ModuleList>
    </ModulePage>
  );
}
