'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getToken, getStoredUser } from '@/lib/api';

function normalizeOrbitNext(raw: string | null): string {
  let next = raw || '/orbit/dashboard';
  if (!next.startsWith('/')) next = `/${next}`;
  if (next.startsWith('/orbit/')) return next;
  if (next === '/orbit') return '/orbit/dashboard';
  // Short CRM paths → /orbit/*
  return `/orbit${next}`;
}

function OrbitSsoInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    if (!token || !user) {
      router.replace('/');
      return;
    }

    const next = normalizeOrbitNext(params.get('next'));
    const ssoUrl = `${window.location.origin}/orbit/api/auth/hrms-sso`;

    fetch(ssoUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ next }),
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || `SSO failed (${res.status})`);
        window.location.href = next;
      })
      .catch((e: Error) => setError(e.message || 'SSO failed'));
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="max-w-md w-full text-center">
        <h1 className="font-display text-xl font-semibold text-ink mb-2">Opening Orbit CRM…</h1>
        <p className="text-sm text-ink/60 mb-4">Using your HRMS session — no second login.</p>
        {error ? (
          <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        ) : (
          <div className="h-1.5 w-40 mx-auto rounded-full bg-brand-100 overflow-hidden">
            <div className="h-full w-1/2 bg-brand-600 animate-pulse rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrbitSsoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-ink/60">Preparing SSO…</div>}>
      <OrbitSsoInner />
    </Suspense>
  );
}
