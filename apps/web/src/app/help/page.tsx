'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl, getStoredUser } from '@/lib/api';

const DOCS = [
  { href: '/docs/user-manuals', title: 'User manuals', blurb: 'Employee · Manager · HR · Finance · Super Admin' },
  { href: '/docs/training', title: 'Training guide', blurb: 'Agendas and lab checklists' },
  { href: '/docs/deployment', title: 'Deployment', blurb: 'API, web, mobile release' },
  { href: '/docs/backup', title: 'Backup & recovery', blurb: 'Postgres + in-app snapshots' },
  { href: '/docs/security', title: 'Audit & security', blurb: 'Controls and review cadence' },
  { href: '/docs/database', title: 'Database', blurb: 'Schema domains & migrations' },
  { href: '/docs/exports', title: 'Export engine', blurb: 'CSV · XLSX · print PDF' },
];

export default function HelpPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getStoredUser()) router.replace('/');
  }, [router]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Help & documentation</h1>
      <p className="text-sm text-ink/60 mb-6">
        Phase 13 packaging — manuals, training, deployment, and ops runbooks (also under{' '}
        <code className="text-xs">docs/</code> in the repo).
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {DOCS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="block p-4 rounded-lg border border-brand-200 bg-white/70 hover:bg-white"
          >
            <span className="font-display text-lg text-brand-700">{d.title}</span>
            <p className="text-sm text-ink/60 mt-1">{d.blurb}</p>
          </Link>
        ))}
      </div>
      <p className="text-xs text-ink/50 mt-8">
        API reference:{' '}
        <a className="text-brand-600 underline" href={getApiBaseUrl().replace(/\/v1$/, '') + '/docs'} target="_blank" rel="noreferrer">
          Swagger
        </a>
      </p>
    </main>
  );
}
