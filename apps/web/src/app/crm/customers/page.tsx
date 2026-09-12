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
} from '@/components/layout/ModulePage';

type Customer = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  owner?: { firstName: string; lastName: string };
};

export default function CrmCustomersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Customer[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<Customer[]>('/crm/customers').then(setItems).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  async function create() {
    if (!name.trim()) return;
    try {
      await api('/crm/customers', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone }),
      });
      setName('');
      setEmail('');
      setPhone('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <ModulePage title="Customers" subtitle="Accounts and contact records">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <ModuleSection>
        <div className="grid gap-2 md:grid-cols-3">
          <ModuleInput placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <ModuleInput placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <ModuleInput placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <ModuleButton type="button" onClick={create}>
          Add customer
        </ModuleButton>
      </ModuleSection>

      <ModuleList>
        {items.map((c) => (
          <ModuleListItem key={c.id}>
            <p className="font-medium">{c.name}</p>
            <p className="text-ink/50 mt-0.5">
              {c.email || '—'} · {c.phone || '—'}
              {c.owner ? ` · ${c.owner.firstName} ${c.owner.lastName}` : ''}
            </p>
          </ModuleListItem>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No customers yet</li>
        )}
      </ModuleList>
    </ModulePage>
  );
}
