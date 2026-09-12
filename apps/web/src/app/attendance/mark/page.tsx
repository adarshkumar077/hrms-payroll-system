'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isAdmin } from '@/lib/roles';

type GeoState = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  address: string;
  mapsUrl: string;
};

type MarkResult = {
  record: {
    status: string;
    isLate: boolean;
    lateMinutes: number;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    workMinutes?: number | null;
    overtimeMinutes?: number;
    todaysEarnings?: number | null;
    checkOutSource?: string | null;
    checkOutLabel?: string | null;
  };
  incentive: { eligible: boolean; amount: number };
};

type Summary = {
  counts: Record<string, number>;
  incentive: { eligible: boolean; amount: number; currentLateMarks: number; maxLateMarks: number };
  counter?: { lateMarkCount: number; ulobCount: number } | null;
  records: {
    date: string;
    status: string;
    isLate: boolean;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    checkOutSource?: string | null;
    checkOutLabel?: string | null;
  }[];
};

export default function MarkAttendancePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState('');
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [lastMark, setLastMark] = useState<MarkResult['record'] | null>(null);

  const loadSummary = useCallback(() => {
    api<Summary>('/me/attendance/summary')
      .then((s) => {
        setSummary(s);
        const today = new Date().toISOString().slice(0, 10);
        const todayRec = s.records.find((r) => String(r.date).slice(0, 10) === today);
        if (todayRec) {
          setLastMark({
            status: todayRec.status,
            isLate: todayRec.isLate,
            lateMinutes: 0,
            checkInAt: todayRec.checkInAt,
            checkOutAt: todayRec.checkOutAt,
            checkOutSource: todayRec.checkOutSource,
            checkOutLabel: todayRec.checkOutLabel,
          });
        }      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No employee profile'));
  }, []);

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

  const requestLocation = useCallback(async () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Location permission is required to mark attendance');
      return;
    }
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        }),
      );
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;
      const accuracyM = pos.coords.accuracy;
      const address = await reverseGeocode(latitude, longitude);
      if (!address.trim()) {
        setLocationError(
          'Location permission denied or address unavailable; attendance cannot be submitted',
        );
        setGeo(null);
        return;
      }
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      setGeo({ latitude, longitude, accuracyM, address, mapsUrl });
    } catch {
      setLocationError('Location permission is required to mark attendance');
      setGeo(null);
    }
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (isAdmin(u) && !u.employeeId) {
      router.replace('/attendance');
      return;
    }
    loadSummary();
    requestLocation();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [router, loadSummary, requestLocation]);

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
    setSelfiePreview(canvas.toDataURL('image/jpeg', 0.85));
  }

  async function mark(punchType: 'IN' | 'OUT') {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      if (locationError || !geo) {
        throw new Error('Location permission is required to mark attendance');
      }
      if (!selfiePreview) {
        throw new Error('Capture a selfie before marking attendance');
      }
      // Refresh GPS at mark time
      await requestLocation();
      if (!geo && !locationError) {
        // requestLocation updates state async — re-fetch once
      }
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
        }),
      );
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;
      const accuracyM = pos.coords.accuracy;
      const address = (await reverseGeocode(latitude, longitude)) || geo.address;
      if (!address.trim()) {
        throw new Error(
          'Location permission denied or address unavailable; attendance cannot be submitted',
        );
      }
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      setGeo({ latitude, longitude, accuracyM, address, mapsUrl });

      const res = await api<MarkResult>('/me/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({
          method: 'SELFIE',
          punchType,
          selfieUrl: selfiePreview,
          latitude,
          longitude,
          accuracyM,
          address,
          mapsUrl,
          deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }),
      });
      setLastMark(res.record);
      setSelfiePreview('');
      setMessage(
        `Marked ${punchType}: ${res.record.status}${
          res.record.isLate ? ` (late ${res.record.lateMinutes}m)` : ''
        }${res.record.checkOutLabel ? ` · ${res.record.checkOutLabel}` : ''}. Incentive: ${
          res.incentive.eligible ? 'eligible' : 'not eligible'
        }`,
      );
      loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark failed');
    } finally {
      setLoading(false);
    }
  }

  const blocked = Boolean(locationError) || !geo;

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Mark Attendance</h1>
      <p className="text-sm text-ink/60 mb-6">
        Selfie + live GPS are required to mark IN or OUT. Location and camera permissions must be
        allowed. After you submit, only your status and time are shown — not the photo or map.
      </p>

      {locationError && (
        <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
          <p className="font-medium">{locationError}</p>
          <button type="button" className="mt-2 underline text-sm" onClick={requestLocation}>
            Retry location
          </button>
        </div>
      )}

      {geo && !locationError && (
        <div className="mb-4 p-4 rounded-lg border border-brand-100 bg-white/80 text-sm">
          <p className="font-medium text-emerald-800">GPS location captured</p>
          <p className="text-ink/60 text-xs mt-1">
            Your coordinates are stored securely for HR. They are not shown here.
          </p>
        </div>
      )}

      {lastMark && (
        <div className="mb-4 p-4 rounded-lg border border-brand-100 bg-white/80 text-sm">
          <p className="font-medium text-brand-700">Today&apos;s status</p>
          <p className="mt-1">
            Status: <span className="font-medium">{lastMark.status}</span>
            {lastMark.isLate ? ` · Late ${lastMark.lateMinutes}m` : ''}
          </p>
          <p className="text-ink/60 text-xs mt-1">
            In:{' '}
            {lastMark.checkInAt ? new Date(lastMark.checkInAt).toLocaleTimeString() : '—'} · Out:{' '}
            {lastMark.checkOutAt ? new Date(lastMark.checkOutAt).toLocaleTimeString() : '—'}
            {lastMark.checkOutLabel ? ` · ${lastMark.checkOutLabel}` : ''}
          </p>
        </div>
      )}

      {summary && (
        <div className="mb-6 p-4 rounded-lg bg-white/80 border border-brand-100 text-sm">
          <p className="font-medium text-brand-700">This month</p>
          <p className="text-ink/70 mt-1">
            {Object.entries(summary.counts)
              .map(([k, v]) => `${k}:${v}`)
              .join(' · ') || 'No records'}
          </p>
          <p className="mt-2">
            Late marks: {summary.counter?.lateMarkCount ?? 0} · ULOB:{' '}
            {summary.counter?.ulobCount ?? 0}
          </p>
        </div>
      )}

      <div className="mb-4 space-y-3 rounded-xl border border-brand-100 bg-white/80 p-4">
        <p className="text-sm font-medium text-brand-700">Selfie (required)</p>
        <video
          ref={videoRef}
          className="w-full rounded-lg bg-ink-900 aspect-video object-cover"
          playsInline
          muted
        />
        {!cameraReady ? (
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={startCamera}
            disabled={blocked}
          >
            Open Camera
          </button>
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={captureSelfie}>
            Capture Image
          </button>
        )}
        {selfiePreview && (
          <p className="text-sm text-emerald-800 font-medium">Selfie captured — ready to submit</p>
        )}
      </div>

      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          disabled={loading || blocked || !selfiePreview}
          onClick={() => mark('IN')}
          className="flex-1 bg-brand-600 text-white py-3 rounded disabled:opacity-60"
        >
          Check In
        </button>
        <button
          type="button"
          disabled={loading || blocked || !selfiePreview}
          onClick={() => mark('OUT')}
          className="flex-1 bg-brand-900 text-white py-3 rounded disabled:opacity-60"
        >
          Check Out
        </button>
      </div>

      <p className="mt-4 text-xs text-ink/50">
        <Link href="/attendance/sheet" className="text-brand-600 underline">
          View Attendance Sheet
        </Link>
      </p>
    </main>
  );
}
