'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type LetterData = {
  text?: string;
  generatedAt?: string;
};

export default function ExitLettersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [experience, setExperience] = useState<LetterData | null>(null);
  const [relieving, setRelieving] = useState<LetterData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    Promise.all([
      api<LetterData>(`/exit/${id}/experience-letter`),
      api<LetterData>(`/exit/${id}/relieving-letter`),
    ])
      .then(([e, r]) => {
        setExperience(e);
        setRelieving(r);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
  }, [router, id]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/exit" className="text-sm text-brand-600 hover:underline">
        ← Exit
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Letters</h1>
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <section className="mt-4 whitespace-pre-wrap bg-white border border-brand-100 rounded-lg p-6 text-sm">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-display text-lg">Experience Letter</h2>
          {experience?.generatedAt && (
            <span className="text-xs text-ink/40">Generated: {new Date(experience.generatedAt).toLocaleDateString()}</span>
          )}
        </div>
        {experience?.text || '—'}
      </section>

      <section className="mt-4 whitespace-pre-wrap bg-white border border-brand-100 rounded-lg p-6 text-sm">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-display text-lg">Relieving Letter</h2>
          {relieving?.generatedAt && (
            <span className="text-xs text-ink/40">Generated: {new Date(relieving.generatedAt).toLocaleDateString()}</span>
          )}
        </div>
        {relieving?.text || '—'}
      </section>

      <div className="flex gap-3 mt-4 print:hidden">
        <button type="button" className="text-sm underline text-brand-600" onClick={() => window.print()}>
          Print
        </button>
        <Link href="/exit" className="text-sm underline text-brand-600">
          Back to Exit list
        </Link>
      </div>
    </main>
  );
}
