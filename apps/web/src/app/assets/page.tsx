'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Asset = {
  id: string;
  assetTag: string;
  type: string;
  name: string;
  serialNumber?: string;
  purchaseDate?: string;
  status: string;
  allocations: {
    employee: { employeeCode: string; firstName: string };
    status?: string;
    allocatedAt?: string;
    returnedAt?: string;
  }[];
};

type MyAsset = {
  id: string;
  assetTag: string;
  type: string;
  name: string;
  status: string;
  allocatedAt?: string;
};

const ASSET_TYPES = ['LAPTOP', 'DESKTOP', 'MOBILE', 'MONITOR', 'KEYBOARD', 'MOUSE', 'ID_CARD', 'SIM', 'ACCESSORIES', 'OTHER'];

export default function AssetsPage() {
  const router = useRouter();
  const [isHr, setIsHr] = useState(false);
  const [activeTab, setActiveTab] = useState<'master' | 'allocation' | 'my'>('master');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [myAssets, setMyAssets] = useState<MyAsset[]>([]);
  const [employees, setEmployees] = useState<{ id: string; employeeCode: string; firstName: string }[]>([]);
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('LAPTOP');
  const [serialNumber, setSerialNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [allocEmployeeId, setAllocEmployeeId] = useState('');
  const [allocAssetId, setAllocAssetId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Asset[]>('/assets')
      .then(setAssets)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }

    const hrAccess = u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r));
    setIsHr(hrAccess);

    if (hrAccess) {
      setActiveTab('master');
      load();
      api<{ items: { id: string; employeeCode: string; firstName: string }[] }>('/employees?pageSize=100')
        .then((r) => {
          setEmployees(r.items ?? []);
          if (r.items?.[0]) setAllocEmployeeId(r.items[0].id);
        })
        .catch(() => undefined);
    } else {
      setActiveTab('my');
      api<MyAsset[]>('/me/assets')
        .then(setMyAssets)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    }
  }, [router]);

  async function create() {
    try {
      await api('/assets', {
        method: 'POST',
        body: JSON.stringify({
          assetTag: tag,
          type,
          name,
          serialNumber: serialNumber || undefined,
          purchaseDate: purchaseDate || undefined,
        }),
      });
      setMessage('Asset created');
      setTag('');
      setName('');
      setSerialNumber('');
      setPurchaseDate('');
      load();
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function allocate(assetId?: string) {
    const targetAsset = assetId || allocAssetId;
    const targetEmployee = allocEmployeeId;
    if (!targetAsset || !targetEmployee) {
      setError('Please select both asset and employee');
      return;
    }
    try {
      await api(`/assets/${targetAsset}/allocate`, {
        method: 'POST',
        body: JSON.stringify({ employeeId: targetEmployee }),
      });
      setMessage('Asset allocated successfully');
      load();
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function returnAsset(assetId: string) {
    try {
      await api(`/assets/${assetId}/return`, {
        method: 'POST',
        body: JSON.stringify({ returnCondition: 'good' }),
      });
      setMessage('Asset returned');
      load();
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function damage(assetId: string) {
    const amount = Number(window.prompt('Damage amount') ?? '0');
    if (!amount) return;
    try {
      await api(`/assets/${assetId}/damage-charge`, {
        method: 'POST',
        body: JSON.stringify({ amount, description: 'Damage charge' }),
      });
      setMessage('Damage charge queued for payroll/F&F');
      load();
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  // Employee view - My Assets only
  if (!isHr) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="font-display text-3xl text-brand-700 mt-2">My Assets</h1>
        <p className="text-sm text-ink/60 mb-4">Assets assigned to you</p>
        {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

        {myAssets.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {myAssets.map((a) => (
              <li key={a.id} className="bg-white/80 border border-brand-100 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{a.assetTag} · {a.name}</p>
                    <p className="text-ink/50">{a.type} · {a.status}</p>
                    {a.allocatedAt && (
                      <p className="text-xs text-ink/40 mt-1">
                        Assigned: {new Date(a.allocatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    a.status === 'ALLOCATED' ? 'bg-green-100 text-green-700' :
                    a.status === 'RETURNED' ? 'bg-gray-100 text-gray-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {a.status === 'ALLOCATED' ? 'Issued' : a.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-white/80 border border-brand-100 rounded-lg p-6 text-ink/50 text-sm">
            No assets assigned to you.
          </div>
        )}
      </main>
    );
  }

  // HR view with tabs
  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Assets</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {/* Tabs */}
      <div className="flex gap-1 mt-4 mb-6 border-b border-brand-100">
        <button
          type="button"
          onClick={() => setActiveTab('master')}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            activeTab === 'master'
              ? 'bg-white/80 border border-b-0 border-brand-100 text-brand-700'
              : 'text-ink/50 hover:text-brand-600'
          }`}
        >
          Asset Master
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('allocation')}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            activeTab === 'allocation'
              ? 'bg-white/80 border border-b-0 border-brand-100 text-brand-700'
              : 'text-ink/50 hover:text-brand-600'
          }`}
        >
          Asset Allocation
        </button>
      </div>

      {/* Tab 1: Asset Master */}
      {activeTab === 'master' && (
        <>
          <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
            <h2 className="font-display text-lg text-brand-700">Add Asset</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="border border-mist rounded px-2 py-2 w-full"
                placeholder="Asset tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
              <input
                className="border border-mist rounded px-2 py-2 w-full"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select
                className="border border-mist rounded px-2 py-2 w-full"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
              <input
                className="border border-mist rounded px-2 py-2 w-full"
                placeholder="Serial Number"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
              <input
                className="border border-mist rounded px-2 py-2 w-full"
                type="date"
                placeholder="Purchase Date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <button type="button" onClick={create} className="bg-brand-600 text-white px-4 py-2 rounded">
              Create Asset
            </button>
          </section>

          <h2 className="font-display text-lg text-brand-700 mb-2">All Assets</h2>
          <ul className="space-y-2 text-sm">
            {assets.map((a) => (
              <li key={a.id} className="bg-white/80 border border-brand-100 rounded-lg p-4">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {a.assetTag} · {a.name} ({a.type.replace('_', ' ')})
                    </p>
                    <p className="text-ink/50">
                      Status: {a.status}
                      {a.serialNumber && ` · SN: ${a.serialNumber}`}
                      {a.purchaseDate && ` · Purchased: ${new Date(a.purchaseDate).toLocaleDateString()}`}
                    </p>
                    {a.allocations[0] && (
                      <p className="text-ink/50 text-xs mt-1">
                        Assigned to: {a.allocations[0].employee.employeeCode} {a.allocations[0].employee.firstName}
                      </p>
                    )}
                  </div>
                  <span className={`self-start inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    a.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                    a.status === 'ALLOCATED' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {a.status}
                  </span>
                </div>
              </li>
            ))}
            {assets.length === 0 && (
              <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">
                No assets registered
              </li>
            )}
          </ul>
        </>
      )}

      {/* Tab 2: Asset Allocation */}
      {activeTab === 'allocation' && (
        <>
          <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
            <h2 className="font-display text-lg text-brand-700">Assign Asset</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                className="border border-mist rounded px-2 py-2 w-full"
                value={allocAssetId}
                onChange={(e) => setAllocAssetId(e.target.value)}
              >
                <option value="">Select asset...</option>
                {assets
                  .filter((a) => a.status === 'AVAILABLE')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.assetTag} · {a.name} ({a.type})
                    </option>
                  ))}
              </select>
              <select
                className="border border-mist rounded px-2 py-2 w-full"
                value={allocEmployeeId}
                onChange={(e) => setAllocEmployeeId(e.target.value)}
              >
                <option value="">Select employee...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} {e.firstName}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => allocate()}
              className="bg-brand-600 text-white px-4 py-2 rounded"
            >
              Assign
            </button>
          </section>

          <h2 className="font-display text-lg text-brand-700 mb-2">Allocation History</h2>
          <ul className="space-y-2 text-sm">
            {assets
              .filter((a) => a.allocations.length > 0)
              .map((a) => (
                <li key={a.id} className="bg-white/80 border border-brand-100 rounded-lg p-4">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {a.assetTag} · {a.name} ({a.type.replace('_', ' ')})
                      </p>
                      <p className="text-ink/50">
                        Assigned to: {a.allocations[0].employee.employeeCode} {a.allocations[0].employee.firstName}
                      </p>
                      <p className="text-xs text-ink/40 mt-1">
                        Status: {a.allocations[0].status ?? a.status}
                        {a.allocations[0].allocatedAt && ` · Since: ${new Date(a.allocations[0].allocatedAt).toLocaleDateString()}`}
                        {a.allocations[0].returnedAt && ` · Returned: ${new Date(a.allocations[0].returnedAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {a.status === 'AVAILABLE' && (
                        <button
                          type="button"
                          className="text-xs bg-brand-600 text-white px-2 py-1 rounded"
                          onClick={() => allocate(a.id)}
                        >
                          Re-assign
                        </button>
                      )}
                      {a.status === 'ALLOCATED' && (
                        <>
                          <button
                            type="button"
                            className="text-xs border px-2 py-1 rounded"
                            onClick={() => returnAsset(a.id)}
                          >
                            Return
                          </button>
                          <button
                            type="button"
                            className="text-xs border border-red-300 text-red-700 px-2 py-1 rounded"
                            onClick={() => damage(a.id)}
                          >
                            Damage
                          </button>
                        </>
                      )}
                      <span className={`text-center inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        a.status === 'ALLOCATED' ? 'bg-blue-100 text-blue-700' :
                        a.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {a.status === 'ALLOCATED' ? 'Issued' : a.status === 'AVAILABLE' ? 'Returned' : a.status}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            {assets.filter((a) => a.allocations.length > 0).length === 0 && (
              <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">
                No allocation history
              </li>
            )}
          </ul>
        </>
      )}
    </main>
  );
}
