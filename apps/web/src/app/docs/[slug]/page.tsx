'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { isHr, isSuperAdmin } from '@/lib/roles';

export default function DocSlugPage() {
  const router = useRouter();
  const params = useParams();
  const slug = String(params.slug ?? '');
  const [body, setBody] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!isSuperAdmin(u) && !isHr(u)) {
      router.replace('/dashboard');
      return;
    }
    api<{ title: string; body: string }>(`/help-docs/${slug}`)
      .then((doc) => {
        setTitle(doc.title);
        setBody(doc.body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load document'));
  }, [slug, router]);

  if (error) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-red-700">{error}</p>
        <Link href="/help" className="text-sm text-brand-600 hover:underline">← Help</Link>
      </main>
    );
  }

  if (!body) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-ink/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/help" className="text-sm text-brand-600 hover:underline">
        ← Help
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2 capitalize">{title}</h1>
      <pre className="mt-4 whitespace-pre-wrap text-sm font-sans text-ink bg-white/80 border border-brand-100 rounded-lg p-4 overflow-x-auto">
        {body}
      </pre>
    </main>
  );
}
