'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Profile = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  personalEmail?: string | null;
  department?: string | null;
  designation?: string | null;
  status: string;
  personal?: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  } | null;
  emergencyContacts?: { name: string; phone: string; relation?: string | null }[];
};

export default function MyProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    // Super Admin/HR without employee record should use Company Profile
    if (u.roles.some((r) => r === 'CEO' || r === 'HR') && !u.employeeId) {
      router.replace('/settings/company');
      return;
    }
    api<Profile>('/me/profile')
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : 'No employee profile linked'));
  }, [router]);

  if (error && !profile) {
    return (
      <main className="max-w-xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
        <p className="mt-4 text-ink/70">{error}</p>
        <p className="text-sm text-ink/50 mt-2">
          Profile editing is managed by HR / Super Admin. Contact HR for changes.
        </p>
      </main>
    );
  }

  if (!profile) return <main className="p-10 text-ink/50">Loading…</main>;

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">My Profile</h1>
      <p className="text-sm text-ink/60 mb-6">
        View only. Contact HR or Super Admin to update your profile details.
      </p>

      <div className="bg-white/70 border border-brand-100 rounded-lg p-4 mb-4 text-sm space-y-2">
        <p><span className="text-ink/50">Code</span> {profile.employeeCode}</p>
        <p><span className="text-ink/50">Name</span> {profile.firstName} {profile.lastName}</p>
        <p><span className="text-ink/50">Work email / mobile</span> {profile.email ?? '—'} / {profile.mobile ?? '—'}</p>
        <p><span className="text-ink/50">Personal email</span> {profile.personalEmail ?? '—'}</p>
        <p><span className="text-ink/50">Dept / Designation</span> {profile.department ?? '—'} / {profile.designation ?? '—'}</p>
        <p><span className="text-ink/50">Status</span> {profile.status}</p>
        <p><span className="text-ink/50">Address</span> {[profile.personal?.addressLine1, profile.personal?.addressLine2, profile.personal?.city, profile.personal?.state, profile.personal?.pincode].filter(Boolean).join(', ') || '—'}</p>
        <div>
          <p className="text-ink/50 mb-1">Emergency contacts</p>
          {(profile.emergencyContacts ?? []).length === 0 && <p>—</p>}
          {(profile.emergencyContacts ?? []).map((c, i) => (
            <p key={i}>{c.name} · {c.phone}{c.relation ? ` · ${c.relation}` : ''}</p>
          ))}
        </div>
      </div>

      <Link href="/me/documents" className="inline-block mt-2 text-sm text-brand-600 hover:underline">
        My Documents →
      </Link>
    </main>
  );
}
