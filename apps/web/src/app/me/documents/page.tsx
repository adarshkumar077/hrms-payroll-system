'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, getStoredUser, getApiBaseUrl } from '@/lib/api';



type Doc = {
  id: string;
  fileName: string;
  title?: string | null;
  documentType: { name: string; code: string };
  createdAt: string;
};

export default function MyDocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    api<Doc[]>('/me/documents')
      .then(setDocs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [router]);

  async function download(d: Doc) {
    try {
      const token = getToken();
      const res = await fetch(`${getApiBaseUrl()}/documents/${d.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        setError('Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    }
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <Link href="/me/profile" className="text-sm text-brand-600 hover:underline">
        ← My Profile
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">My Documents</h1>
      <p className="text-sm text-ink/60 mb-6">View and download only. Uploads are managed by HR.</p>

      {error && <p className="text-red-700 text-sm mb-4">{error}</p>}

      <ul className="bg-white/80 border border-brand-100 rounded-lg divide-y divide-mist">
        {docs.length === 0 ? (
          <li className="p-4 text-ink/50 text-sm">No documents available.</li>
        ) : (
          docs.map((d) => (
            <li key={d.id} className="p-4 flex justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{d.documentType.name}</p>
                <p className="text-ink/60">{d.fileName}</p>
              </div>
              <button type="button" onClick={() => download(d)} className="text-brand-600 underline shrink-0">
                Download
              </button>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
