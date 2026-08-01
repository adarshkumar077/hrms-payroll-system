'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isAdmin } from '@/lib/roles';

type Summary = {
  counts: Record<string, number>;
  incentive: { eligible: boolean; amount: number; currentLateMarks: number; maxLateMarks: number };
  counter?: { lateMarkCount: number; ulobCount: number } | null;
  records: { date: string; status: string; isLate: boolean }[];
};

const ATTENDANCE_STATUSES = ['P', 'A', 'L', 'HD', 'PL', 'ULOB', 'WO', 'H', 'WFH', 'OD'];

export default function MarkAttendancePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [method, setMethod] = useState<'MANUAL' | 'SELFIE'>('MANUAL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState('');
  const streamRef = useRef<MediaStream | null>(null);

  function loadSummary() {
    api<Summary>('/me/attendance/summary')
      .then(setSummary)
      .catch((e) => setError(e instanceof Error ? e.message : 'No employee profile'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    // Only employees mark attendance (CEO/HR without employee record blocked)
    if (isAdmin(u) && !u.employeeId) {
      router.replace('/attendance');
      return;
    }
    loadSummary();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setError('Unable to open camera. Allow camera permission and try again.');
    }
  }

  function captureSelfie() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setSelfiePreview(dataUrl);
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return '';
      const data = (await res.json()) as { display_name?: string };
      return data.display_name ?? '';
    } catch {
      return '';
    }
  }

  async function mark(punchType: 'IN' | 'OUT') {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        method,
        punchType,
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      };

      if (method === 'SELFIE') {
        if (!selfiePreview) {
          throw new Error('Capture a selfie before check-in');
        }
        body.selfieUrl = selfiePreview;
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true }),
        );
        body.latitude = pos.coords.latitude;
        body.longitude = pos.coords.longitude;
        body.accuracyM = pos.coords.accuracy;
        const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (address) body.address = address;
      } else {
        // Manual check-in still captures GPS when available
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 }),
          );
          body.latitude = pos.coords.latitude;
          body.longitude = pos.coords.longitude;
          body.accuracyM = pos.coords.accuracy;
        } catch {
          // optional for manual
        }
      }

      const res = await api<{ record: { status: string; isLate: boolean; lateMinutes: number }; incentive: Summary['incentive'] }>(
        '/me/attendance/mark',
        { method: 'POST', body: JSON.stringify(body) },
      );
      setMessage(
        `Marked ${punchType}: ${res.record.status}${res.record.isLate ? ` (late ${res.record.lateMinutes}m)` : ''}. Incentive: ${res.incentive.eligible ? 'eligible' : 'not eligible'}`,
      );
      loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Mark Attendance</h1>
      <p className="text-sm text-ink/60 mb-6">
        Manual check-in or selfie attendance. Status codes: {ATTENDANCE_STATUSES.join(' · ')}
      </p>

      {summary && (
        <div className="mb-6 p-4 rounded-lg bg-white/80 border border-brand-100 text-sm">
          <p className="font-medium text-brand-700">This month</p>
          <p className="text-ink/70 mt-1">
            {Object.entries(summary.counts)
              .map(([k, v]) => `${k}:${v}`)
              .join(' · ') || 'No records'}
          </p>
          <p className="mt-2">
            Late marks: {summary.counter?.lateMarkCount ?? 0} · ULOB: {summary.counter?.ulobCount ?? 0}
          </p>
          <p className={summary.incentive.eligible ? 'text-brand-700' : 'text-amber-700'}>
            Incentive {summary.incentive.eligible ? 'eligible' : 'not eligible'} (₹{summary.incentive.amount})
          </p>
        </div>
      )}

      <label className="block text-sm mb-3">
        Method
        <select
          className="mt-1 w-full rounded border border-mist px-3 py-2"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as 'MANUAL' | 'SELFIE');
            setSelfiePreview('');
            setCameraReady(false);
            streamRef.current?.getTracks().forEach((t) => t.stop());
          }}
        >
          <option value="MANUAL">Manual Check-In</option>
          <option value="SELFIE">Selfie Attendance</option>
        </select>
      </label>

      {method === 'SELFIE' && (
        <div className="mb-4 space-y-3 rounded-xl border border-brand-100 bg-white/80 p-4">
          <video ref={videoRef} className="w-full rounded-lg bg-ink-900 aspect-video object-cover" playsInline muted />
          {!cameraReady ? (
            <button type="button" className="btn-secondary w-full" onClick={startCamera}>
              Open Camera
            </button>
          ) : (
            <button type="button" className="btn-secondary w-full" onClick={captureSelfie}>
              Capture Image
            </button>
          )}
          {selfiePreview && (
            <div>
              <p className="text-xs text-ink-400 mb-1">Captured selfie</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfiePreview} alt="Selfie preview" className="w-full rounded-lg border border-ink-100" />
            </div>
          )}
        </div>
      )}

      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => mark('IN')}
          className="flex-1 bg-brand-600 text-white py-3 rounded disabled:opacity-60"
        >
          Check in
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => mark('OUT')}
          className="flex-1 bg-brand-900 text-white py-3 rounded disabled:opacity-60"
        >
          Check out
        </button>
      </div>
    </main>
  );
}
