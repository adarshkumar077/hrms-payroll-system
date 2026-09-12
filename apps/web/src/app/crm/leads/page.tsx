'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';
import { isAdmin } from '@/lib/roles';
import {
  ModuleAlert,
  ModuleButton,
  ModuleInput,
  ModuleList,
  ModuleListItem,
  ModulePage,
  ModuleSecondaryButton,
  ModuleSection,
  StatusPill,
} from '@/components/layout/ModulePage';

type Lead = {
  id: string;
  title: string;
  source?: string;
  status: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  whatsapp?: string;
  followUpAt?: string;
  nextAction?: string;
  owner?: { employeeCode: string; firstName: string; lastName: string };
};

export default function CrmLeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Lead[]>([]);
  const [title, setTitle] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [source, setSource] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [canExport, setCanExport] = useState(false);
  const [error, setError] = useState('');

  function load() {
    api<Lead[]>('/crm/leads')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setCanExport(isAdmin(u));
    load();
  }, [router]);

  async function create() {
    if (!title.trim()) return;
    try {
      await api('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          title,
          contactName,
          contactPhone,
          contactEmail,
          whatsapp,
          source,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
          nextAction,
        }),
      });
      setTitle('');
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setWhatsapp('');
      setSource('');
      setFollowUpAt('');
      setNextAction('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function exportLeads(fmt: 'csv' | 'xlsx' | 'pdf') {
    const token = getToken();
    const res = await fetch(`${getApiBaseUrl()}/crm/leads/export/${fmt}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads.${fmt === 'pdf' ? 'html' : fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ModulePage title="Leads" subtitle="Track and manage sales leads">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <ModuleSection>
        <p className="font-medium text-ink/80">Add lead</p>
        <div className="grid gap-2 md:grid-cols-3">
          <ModuleInput placeholder="Title / Name" value={title} onChange={(e) => setTitle(e.target.value)} />
          <ModuleInput placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <ModuleInput placeholder="Mobile" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <ModuleInput placeholder="Email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <ModuleInput placeholder="WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          <ModuleInput placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} />
          <ModuleInput type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
          <ModuleInput placeholder="Next action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
        </div>
        <ModuleButton type="button" onClick={create}>
          Create lead
        </ModuleButton>
      </ModuleSection>

      {canExport && (
        <div className="flex gap-2 mb-4">
          {(['csv', 'xlsx', 'pdf'] as const).map((fmt) => (
            <ModuleSecondaryButton key={fmt} type="button" onClick={() => exportLeads(fmt).catch((e) => setError(String(e)))}>
              Export {fmt.toUpperCase()}
            </ModuleSecondaryButton>
          ))}
        </div>
      )}

      <ModuleList>
        {items.map((l) => (
          <ModuleListItem key={l.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{l.title}</p>
                <p className="text-ink/50 mt-0.5">
                  {l.contactName || 'No contact'}
                  {l.contactPhone ? ` · ${l.contactPhone}` : ''}
                  {l.contactEmail ? ` · ${l.contactEmail}` : ''}
                  {l.source ? ` · ${l.source}` : ''}
                  {l.followUpAt ? ` · Follow-up ${new Date(l.followUpAt).toLocaleDateString()}` : ''}
                  {l.owner ? ` · ${l.owner.firstName} ${l.owner.lastName}` : ''}
                </p>
              </div>
              <StatusPill>{l.status}</StatusPill>
            </div>
          </ModuleListItem>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No leads yet</li>
        )}
      </ModuleList>
    </ModulePage>
  );
}
