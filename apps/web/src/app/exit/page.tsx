'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';



type Clearance = { id: string; code: string; title: string; status: string };
type Fnf = {
  netPayable: number;
  grossCredits: number;
  grossDebits: number;
  status: string;
  linesJson: { code: string; name: string; side: string; amount: number }[];
};
type Row = {
  id: string;
  status: string;
  lastWorkingDay: string;
  reason?: string | null;
  employee: {
    id?: string;
    employeeCode: string;
    firstName: string;
    lastName?: string | null;
    department?: string | null;
    designation?: string | null;
    dateOfJoining?: string | null;
    joinedAt?: string | null;
    email?: string | null;
    documents?: {
      id: string;
      title?: string | null;
      fileName: string;
      createdAt?: string;
      notes?: string | null;
    }[];
  };
  clearance: Clearance[];
  fnf?: Fnf | null;
  salaryHistory?: { year: number; month: number; netPay: number; grossPay: number }[];
  depositHistory?: { type: string; amount: number; date: string; status: string }[];
  pfAmount?: number;
  tdsAmount?: number;
  pendingPayments?: number;
  paidPayments?: number;
  documents?: { id: string; name: string; url: string; type: string }[];
};

export default function ExitPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [isHr, setIsHr] = useState(false);
  const [hasEmployee, setHasEmployee] = useState(false);
  const [lwd, setLwd] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function load() {
    api<Row[]>('/exit')
      .then((items) =>
        setRows(
          (items ?? []).map((row) => ({
            ...row,
            employee: {
              ...row.employee,
              dateOfJoining: row.employee.dateOfJoining ?? row.employee.joinedAt ?? undefined,
            },
            documents:
              row.documents ??
              row.employee.documents?.map((doc) => ({
                id: doc.id,
                name: doc.title || doc.fileName,
                url: `/api/documents/${doc.id}/view`,
                type:
                  doc.notes?.includes('leaving_letter')
                    ? 'Leaving Letter'
                    : doc.notes?.includes('exit_document')
                      ? 'Exit Document'
                      : 'Document',
              })) ??
              [],
          })),
        ),
      )
      .catch(() => setRows([]));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setIsHr(u.roles.some((r) => ['CEO', 'HR', 'FINANCE'].includes(r)));
    setHasEmployee(!!u.employeeId);
    if (u.roles.some((r) => ['CEO', 'HR', 'FINANCE'].includes(r))) load();
  }, [router]);

  async function resign() {
    try {
      await api('/exit/resign', {
        method: 'POST',
        body: JSON.stringify({ lastWorkingDay: lwd, noticeDays: 30, reason }),
      });
      setMessage('Resignation submitted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await api(`/exit/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setMessage(`Resignation ${status}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function clearStep(id: string, step: string) {
    try {
      await api(`/exit/${id}/clearance/${step}`, {
        method: 'POST',
        body: JSON.stringify({ status: 'DONE' }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function generateFnf(id: string) {
    try {
      await api(`/exit/${id}/fnf/generate`, { method: 'POST', body: '{}' });
      setMessage('F&F generated');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function finalizeFnf(id: string) {
    if (!window.confirm('Finalize F&F and mark employee resigned?')) return;
    try {
      await api(`/exit/${id}/fnf/finalize`, { method: 'POST', body: '{}' });
      setMessage('F&F finalized');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function uploadDocument(exitId: string, file: File, docType: string) {
    setUploading(true);
    setError('');
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', docType);
      await fetch(`${getApiBaseUrl()}/exit/${exitId}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      setMessage('Document uploaded');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleFileUpload(exitId: string, docType: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.png,.jpg';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) uploadDocument(exitId, file, docType);
    };
    input.click();
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Exit & F&F</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {hasEmployee && (
        <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
          <h2 className="font-display text-lg text-brand-700">Submit resignation</h2>
          <input
            type="date"
            className="border border-mist rounded px-2 py-2 w-full"
            value={lwd}
            onChange={(e) => setLwd(e.target.value)}
          />
          <input
            className="border border-mist rounded px-2 py-2 w-full"
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button type="button" onClick={resign} className="bg-brand-600 text-white px-4 py-2 rounded">
            Resign
          </button>
        </section>
      )}

      {isHr && (
        <ul className="space-y-4 text-sm">
          {rows.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <li key={r.id} className="bg-white/80 border border-brand-100 rounded-lg p-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-base">
                      {r.employee.employeeCode} {r.employee.firstName}
                      {r.employee.lastName ? ` ${r.employee.lastName}` : ''}
                    </p>
                    <p className="text-ink/50">
                      {r.employee.department && `${r.employee.department} · `}
                      {r.employee.designation && `${r.employee.designation} · `}
                      LWD {new Date(r.lastWorkingDay).toLocaleDateString()}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </p>
                    {r.employee.dateOfJoining && (
                      <p className="text-xs text-ink/40">
                        Joined: {new Date(r.employee.dateOfJoining).toLocaleDateString()}
                        {r.employee.email ? ` · ${r.employee.email}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      r.status === 'FINALIZED' ? 'bg-emerald-100 text-emerald-800' :
                      r.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                      r.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {r.status}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-brand-600 underline"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    >
                      {isExpanded ? 'Collapse' : 'Details'}
                    </button>
                  </div>
                </div>

                {/* Approval buttons */}
                {r.status === 'PENDING' && (
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="bg-brand-600 text-white px-3 py-1 rounded text-xs" onClick={() => review(r.id, 'APPROVED')}>
                      Approve
                    </button>
                    <button type="button" className="border border-red-300 text-red-700 px-3 py-1 rounded text-xs" onClick={() => review(r.id, 'REJECTED')}>
                      Reject
                    </button>
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-mist pt-4">
                    {/* Financial Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {r.pfAmount != null && (
                        <div className="bg-brand-50 rounded p-2 text-center">
                          <p className="text-xs text-ink/50">PF</p>
                          <p className="font-semibold">₹{r.pfAmount.toLocaleString()}</p>
                        </div>
                      )}
                      {r.tdsAmount != null && (
                        <div className="bg-brand-50 rounded p-2 text-center">
                          <p className="text-xs text-ink/50">TDS</p>
                          <p className="font-semibold">₹{r.tdsAmount.toLocaleString()}</p>
                        </div>
                      )}
                      {r.pendingPayments != null && (
                        <div className="bg-amber-50 rounded p-2 text-center">
                          <p className="text-xs text-ink/50">Pending</p>
                          <p className="font-semibold text-amber-800">₹{r.pendingPayments.toLocaleString()}</p>
                        </div>
                      )}
                      {r.paidPayments != null && (
                        <div className="bg-emerald-50 rounded p-2 text-center">
                          <p className="text-xs text-ink/50">Paid</p>
                          <p className="font-semibold text-emerald-800">₹{r.paidPayments.toLocaleString()}</p>
                        </div>
                      )}
                    </div>

                    {/* Salary History */}
                    {r.salaryHistory && r.salaryHistory.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-ink/60 mb-1">Salary History</p>
                        <div className="overflow-x-auto border border-mist rounded">
                          <table className="min-w-full text-xs">
                            <thead className="bg-mist/30">
                              <tr>
                                <th className="px-2 py-1 text-left">Period</th>
                                <th className="px-2 py-1 text-right">Gross</th>
                                <th className="px-2 py-1 text-right">Net</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.salaryHistory.map((s, i) => (
                                <tr key={i} className="border-t border-mist">
                                  <td className="px-2 py-1">{s.year}-{String(s.month).padStart(2, '0')}</td>
                                  <td className="px-2 py-1 text-right">₹{s.grossPay.toLocaleString()}</td>
                                  <td className="px-2 py-1 text-right">₹{s.netPay.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Deposit History */}
                    {r.depositHistory && r.depositHistory.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-ink/60 mb-1">Deposit History</p>
                        <div className="overflow-x-auto border border-mist rounded">
                          <table className="min-w-full text-xs">
                            <thead className="bg-mist/30">
                              <tr>
                                <th className="px-2 py-1 text-left">Type</th>
                                <th className="px-2 py-1 text-right">Amount</th>
                                <th className="px-2 py-1 text-left">Date</th>
                                <th className="px-2 py-1 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.depositHistory.map((d, i) => (
                                <tr key={i} className="border-t border-mist">
                                  <td className="px-2 py-1">{d.type}</td>
                                  <td className="px-2 py-1 text-right">₹{d.amount.toLocaleString()}</td>
                                  <td className="px-2 py-1">{new Date(d.date).toLocaleDateString()}</td>
                                  <td className="px-2 py-1">{d.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Documents */}
                    <div>
                      <p className="text-xs font-medium text-ink/60 mb-1">Documents</p>
                      {r.documents && r.documents.length > 0 ? (
                        <ul className="space-y-1">
                          {r.documents.map((doc) => (
                            <li key={doc.id} className="flex justify-between items-center bg-mist/20 rounded px-2 py-1">
                              <span className="text-xs">{doc.name} ({doc.type})</span>
                              <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 underline">
                                View
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-ink/40">No documents uploaded</p>
                      )}
                      {isHr && (
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            className="text-xs border border-brand-300 px-2 py-1 rounded hover:bg-brand-50 transition"
                            onClick={() => handleFileUpload(r.id, 'leaving_letter')}
                            disabled={uploading}
                          >
                            Upload Leaving Letter
                          </button>
                          <button
                            type="button"
                            className="text-xs border border-brand-300 px-2 py-1 rounded hover:bg-brand-50 transition"
                            onClick={() => handleFileUpload(r.id, 'exit_document')}
                            disabled={uploading}
                          >
                            Upload Exit Document
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Clearance */}
                {r.clearance?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {r.clearance.map((c) => (
                      <li key={c.id} className="flex justify-between">
                        <span>
                          {c.title} ({c.status})
                        </span>
                        {c.status === 'PENDING' && (
                          <button type="button" className="text-xs underline text-brand-600" onClick={() => clearStep(r.id, c.code)}>
                            Mark done
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* F&F Actions */}
                {r.status === 'APPROVED' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button type="button" className="bg-brand-600 text-white px-3 py-1 rounded text-xs" onClick={() => generateFnf(r.id)}>
                      Generate F&F
                    </button>
                    {r.fnf && r.fnf.status === 'DRAFT' && (
                      <button type="button" className="border px-3 py-1 rounded text-xs" onClick={() => finalizeFnf(r.id)}>
                        Finalize (net ₹{r.fnf.netPayable.toLocaleString()})
                      </button>
                    )}
                    {r.fnf && (
                      <>
                        <Link href={`/exit/${r.id}/letters`} className="text-xs underline text-brand-600 self-center">
                          Letters
                        </Link>
                        <span className="text-xs text-ink/50 self-center">
                          Credits ₹{r.fnf.grossCredits.toLocaleString()} · Debits ₹{r.fnf.grossDebits.toLocaleString()} · Net ₹{r.fnf.netPayable.toLocaleString()} ({r.fnf.status})
                        </span>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {rows.length === 0 && (
            <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No resignations</li>
          )}
        </ul>
      )}
    </main>
  );
}
