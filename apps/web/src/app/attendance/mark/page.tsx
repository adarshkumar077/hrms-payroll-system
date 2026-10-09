'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isAdmin } from '@/lib/roles';
import { notifyAttendanceChanged } from '@/lib/attendance-sync';

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
    checkInLatitude?: number | null;
    checkInLongitude?: number | null;
    checkInAddress?: string | null;
    checkInMapsUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
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

type DayPhase = 'need_in' | 'need_out' | 'done';
type CaptureMode = null | 'IN' | 'OUT';
type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

function todayKeyLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sheetUrlForToday() {
  const d = new Date();
  return `/attendance/sheet?year=${d.getFullYear()}&month=${d.getMonth() + 1}`;
}

function fallbackAddress(lat: number, lng: number) {
  return `GPS ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Detect permission state only. This does NOT request permission.
 */
async function queryLocationPermission(): Promise<LocationPermissionState> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const result = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });
    if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') {
      return result.state;
    }
  } catch {
    /* Safari / some browsers */
  }
  return 'unknown';
}

/**
 * THE actual GPS permission + position request.
 * MUST be invoked synchronously from a user gesture (click) — do not await
 * anything before calling this, or browsers may suppress the native prompt.
 */
function startGetCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reject(
        Object.assign(
          new Error(
            'Camera and Location only work on a secure page (HTTPS). Open this app with https://localhost:3000, https://192.168.1.69:3000 (accept the certificate once), or the public Cloudflare HTTPS link — then tap Check In again.',
          ),
          { code: -1, insecureContext: true },
        ),
      );
      return;
    }
    if (!navigator.geolocation) {
      reject(Object.assign(new Error('Geolocation is not supported in this browser.'), { code: -2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      // Mobile GPS can be slow; keep maximumAge 0 so we never reuse a cached fix
      timeout: 30000,
      maximumAge: 0,
    });
  });
}

function isGeoPermissionDenied(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'code' in err && Number((err as GeolocationPositionError).code) === 1);
}

function isInsecureContextError(err: unknown): boolean {
  return !!(err && typeof err === 'object' && 'insecureContext' in err && (err as { insecureContext?: boolean }).insecureContext);
}

function geoFailureMessage(err: unknown): string {
  if (isInsecureContextError(err)) {
    return err instanceof Error ? err.message : 'Geolocation requires HTTPS.';
  }
  if (err && typeof err === 'object' && 'code' in err) {
    const code = Number((err as GeolocationPositionError).code);
    if (code === 1) {
      return 'Location is blocked for this site. JavaScript cannot show the browser popup again until you set Location to Allow in site settings.';
    }
    if (code === 2) return 'Location unavailable. Turn on GPS/Wi‑Fi and tap Request Location Again.';
    if (code === 3) return 'Location timed out. Move outdoors and tap Request Location Again.';
  }
  return err instanceof Error ? err.message : 'Could not get GPS location.';
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'EITF-HRMS-Attendance/1.0 (attendance-mark)',
        },
      },
    );
    if (!res.ok) return '';
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? '';
  } catch {
    return '';
  }
}

async function positionToGeo(pos: GeolocationPosition): Promise<GeoState> {
  const latitude = pos.coords.latitude;
  const longitude = pos.coords.longitude;
  const accuracyM = pos.coords.accuracy;
  const address =
    (await reverseGeocode(latitude, longitude)).trim() || fallbackAddress(latitude, longitude);
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  return { latitude, longitude, accuracyM, address, mapsUrl };
}

export default function MarkAttendancePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingPunchRef = useRef<'IN' | 'OUT' | null>(null);
  /** In-flight getCurrentPosition started from the latest user click */
  const gpsRequestRef = useRef<Promise<GeolocationPosition> | null>(null);
  /** Camera stream started from the same user click (must not await GPS first) */
  const cameraRequestRef = useRef<Promise<MediaStream> | null>(null);

  const [error, setError] = useState('');
  const [locationHint, setLocationHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [useFileCapture, setUseFileCapture] = useState(false);
  const [selfiePreview, setSelfiePreview] = useState('');
  const [geo, setGeo] = useState<GeoState | null>(null);
  const [lastMark, setLastMark] = useState<MarkResult['record'] | null>(null);
  const [phase, setPhase] = useState<DayPhase>('need_in');
  const [captureMode, setCaptureMode] = useState<CaptureMode>(null);
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const [locationBlockedPopup, setLocationBlockedPopup] = useState(false);
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('unknown');
  const [publicHttpsUrl, setPublicHttpsUrl] = useState<string | null>(null);
  const [cameraHint, setCameraHint] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cameraRequestRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    setCameraReady(false);
  }, []);

  /** Progressive getUserMedia — facingMode:user alone fails on many laptops/phones. */
  function startGetUserMediaFromGesture(): Promise<MediaStream> {
    return (async () => {
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        throw Object.assign(new Error('Camera needs HTTPS.'), {
          name: 'SecurityError',
          insecureContext: true,
        });
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('getUserMedia not supported'), { name: 'NotSupportedError' });
      }
      const attempts: MediaStreamConstraints[] = [
        { audio: false, video: { facingMode: { ideal: 'user' } } },
        { audio: false, video: { facingMode: 'user' } },
        { audio: false, video: true },
      ];
      let lastErr: unknown;
      for (const constraints of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error('Camera unavailable');
    })();
  }

  async function attachStreamToVideo(stream: MediaStream): Promise<void> {
    streamRef.current = stream;
    // Video mounts only after captureMode is set — wait briefly for the ref.
    for (let i = 0; i < 40; i++) {
      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Autoplay can fail briefly; track is still live — UI can still capture.
        }
        setCameraReady(true);
        setUseFileCapture(false);
        setCameraHint('');
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    // Stream obtained but video node missing — keep stream, show retry for attach
    setCameraReady(false);
    setCameraHint('Camera started. Tap Enable Camera Again to show the preview.');
  }

  function cameraFailureMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'insecureContext' in err) {
      return 'Camera needs HTTPS. Open https://192.168.1.69:3000 (or the public link), then try again.';
    }
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera is blocked for this site. Tap the lock/info icon in the address bar → set Camera to Allow → tap Enable Camera Again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was found on this device. Use Take Photo, or connect a webcam and retry.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Camera is in use by another app. Close other camera apps, then tap Enable Camera Again.';
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return 'Camera settings were not supported. Tap Enable Camera Again to retry with basic settings.';
    }
    return err instanceof Error && err.message
      ? err.message
      : 'Could not open the live camera. Tap Enable Camera Again, or use Take Photo.';
  }

  const applyTodayFromSummary = useCallback((s: Summary) => {
    const today = todayKeyLocal();
    const todayRec = s.records.find((r) => {
      const key = String(r.date).slice(0, 10);
      return key === today || key === new Date(r.date).toLocaleDateString('en-CA');
    });
    if (!todayRec) {
      setLastMark(null);
      setPhase('need_in');
      return;
    }
    setLastMark({
      status: todayRec.status,
      isLate: todayRec.isLate,
      lateMinutes: 0,
      checkInAt: todayRec.checkInAt,
      checkOutAt: todayRec.checkOutAt,
      checkOutSource: todayRec.checkOutSource,
      checkOutLabel: todayRec.checkOutLabel,
    });
    if (todayRec.checkInAt && todayRec.checkOutAt) setPhase('done');
    else if (todayRec.checkInAt) setPhase('need_out');
    else setPhase('need_in');
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const s = await api<Summary>('/me/attendance/summary');
      applyTodayFromSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load attendance status');
    }
  }, [applyTodayFromSummary]);

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
    void loadSummary();
    void queryLocationPermission().then(setPermissionState);
    // Live public HTTPS URL helps phones that hit http://LAN by mistake
    fetch('/api/public-url')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { url?: string } | null) => {
        if (d?.url?.startsWith('https://')) setPublicHttpsUrl(d.url);
      })
      .catch(() => undefined);
    return () => stopCamera();
  }, [router, loadSummary, stopCamera]);

  async function startCamera() {
    setError('');
    setCameraHint('');
    setUseFileCapture(false);
    try {
      let stream = streamRef.current;
      if (!stream || stream.getTracks().every((t) => t.readyState === 'ended')) {
        const pending = cameraRequestRef.current;
        if (pending) {
          stream = await pending;
        } else {
          const req = startGetUserMediaFromGesture();
          cameraRequestRef.current = req;
          stream = await req;
        }
      }
      await attachStreamToVideo(stream);
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      setCameraReady(false);
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setUseFileCapture(false);
        setCameraHint(cameraFailureMessage(err));
        return;
      }
      setUseFileCapture(true);
      setCameraHint(cameraFailureMessage(err));
    } finally {
      cameraRequestRef.current = null;
    }
  }

  function captureSelfieFromVideo(): string {
    const video = videoRef.current;
    if (!video) throw new Error('Camera is not ready');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to capture selfie');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setSelfiePreview(dataUrl);
    return dataUrl;
  }

  function onFileSelfie(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) setSelfiePreview(result);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Handle GPS + camera promises started synchronously from a click.
   */
  async function finishGpsAndOpenCamera(
    punchType: 'IN' | 'OUT',
    positionPromise: Promise<GeolocationPosition>,
    cameraPromise: Promise<MediaStream>,
  ) {
    setLoading(true);
    setError('');
    setLocationHint('');
    setCameraHint('');
    setLocationBlockedPopup(false);
    setUseFileCapture(false);
    try {
      const pos = await positionPromise;
      const next = await positionToGeo(pos);
      setGeo(next);
      setPermissionState('granted');
      setCaptureMode(punchType);

      try {
        const stream = await cameraPromise;
        await attachStreamToVideo(stream);
      } catch (camErr) {
        setCameraHint(cameraFailureMessage(camErr));
        const name =
          camErr && typeof camErr === 'object' && 'name' in camErr
            ? String((camErr as { name: string }).name)
            : '';
        if (name !== 'NotAllowedError' && name !== 'PermissionDeniedError') {
          setUseFileCapture(true);
        }
      }
    } catch (err) {
      const state = await queryLocationPermission();
      setPermissionState(state);

      if (isInsecureContextError(err)) {
        setLocationBlockedPopup(true);
        setLocationHint(geoFailureMessage(err));
        setCaptureMode(null);
        stopCamera();
        return;
      }

      if (isGeoPermissionDenied(err) || state === 'denied') {
        setLocationBlockedPopup(true);
        setLocationHint(geoFailureMessage(err));
        setCaptureMode(null);
        stopCamera();
        return;
      }

      setLocationHint(geoFailureMessage(err));
      setCaptureMode(null);
      stopCamera();
    } finally {
      gpsRequestRef.current = null;
      cameraRequestRef.current = null;
      setLoading(false);
    }
  }

  /** Check In / Check Out — start GPS + camera BEFORE any await (user gesture) */
  function onPunchClick(punchType: 'IN' | 'OUT') {
    setError('');
    setLocationHint('');
    setCameraHint('');
    setSelfiePreview('');
    pendingPunchRef.current = punchType;

    if (punchType === 'IN' && phase !== 'need_in') {
      setError('Already checked in today. Use Check Out.');
      return;
    }
    if (punchType === 'OUT' && phase !== 'need_out') {
      setError(phase === 'done' ? 'Already checked out today.' : 'Check In first.');
      return;
    }

    // Release any previous tracks, then start GPS + camera from THIS click.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);

    const positionPromise = startGetCurrentPosition();
    const cameraPromise = startGetUserMediaFromGesture();
    gpsRequestRef.current = positionPromise;
    cameraRequestRef.current = cameraPromise;
    void finishGpsAndOpenCamera(punchType, positionPromise, cameraPromise);
  }

  /** Try Again — restart GPS + camera from this click */
  function onRequestLocationAgain() {
    setLocationBlockedPopup(false);
    setLocationHint('');
    setError('');
    const punch = pendingPunchRef.current ?? (phase === 'need_out' ? 'OUT' : 'IN');
    pendingPunchRef.current = punch;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);

    const positionPromise = startGetCurrentPosition();
    const cameraPromise = startGetUserMediaFromGesture();
    gpsRequestRef.current = positionPromise;
    cameraRequestRef.current = cameraPromise;
    void finishGpsAndOpenCamera(punch, positionPromise, cameraPromise);
  }

  async function confirmAndSubmit() {
    if (!captureMode) return;
    if (!selfiePreview && !cameraReady) {
      setError('Capture a selfie before submitting');
      return;
    }

    // Fresh GPS at confirm time — must start synchronously from this click
    const positionPromise = startGetCurrentPosition();
    gpsRequestRef.current = positionPromise;

    setLoading(true);
    setError('');
    setLocationHint('');
    try {
      // Resolve GPS first — never save attendance without a live fix
      const pos = await positionPromise;
      const loc = await positionToGeo(pos);
      setGeo(loc);

      let selfieUrl = selfiePreview;
      if (!selfieUrl && cameraReady) selfieUrl = captureSelfieFromVideo();
      if (!selfieUrl) throw new Error('Capture a selfie before submitting');
      stopCamera();

      const punchType = captureMode;
      const res = await api<MarkResult>('/me/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({
          method: 'SELFIE',
          punchType,
          selfieUrl,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracyM: loc.accuracyM,
          address: loc.address,
          mapsUrl: loc.mapsUrl,
          deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }),
      });

      setLastMark(res.record);
      setSelfiePreview('');
      setCaptureMode(null);
      pendingPunchRef.current = null;
      notifyAttendanceChanged({
        employeeId: getStoredUser()?.employeeId ?? undefined,
        date: todayKeyLocal(),
        source: punchType === 'IN' ? 'mark-in' : 'mark-out',
      });
      if (punchType === 'IN') {
        setPhase('need_out');
        setSuccessPopup('Check In Successful');
      } else {
        setPhase('done');
        setSuccessPopup('Check Out Successful');
      }
      await loadSummary();
    } catch (e) {
      if (isGeoPermissionDenied(e) || isInsecureContextError(e)) {
        setLocationBlockedPopup(true);
        setLocationHint(geoFailureMessage(e));
      } else {
        setError(e instanceof Error ? e.message : 'Mark failed');
      }
    } finally {
      gpsRequestRef.current = null;
      setLoading(false);
    }
  }

  function cancelCapture() {
    setCaptureMode(null);
    setSelfiePreview('');
    setUseFileCapture(false);
    pendingPunchRef.current = null;
    stopCamera();
  }

  function onSuccessOk() {
    setSuccessPopup(null);
    router.push(sheetUrlForToday());
  }

  const httpsLanHint =
    typeof window !== 'undefined' && !window.isSecureContext
      ? true
      : false;

  const secureMarkUrl =
    publicHttpsUrl ||
    (typeof window !== 'undefined'
      ? `https://${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'localhost' : '192.168.1.69'}:3000/attendance/mark`
      : 'https://192.168.1.69:3000/attendance/mark');

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Mark Attendance</h1>
      <p className="text-sm text-ink/60 mb-6">
        Tap Check In or Check Out. Your browser will ask for Location (native popup), then Camera for
        a selfie.
      </p>

      {httpsLanHint && (
        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-sm space-y-2">
          <p className="font-medium">Camera &amp; Location need HTTPS</p>
          <p>
            This page is open over HTTP, so the browser blocks GPS and camera. Open the secure link,
            allow Location and Camera when prompted, then Check In / Check Out.
          </p>
          <a className="inline-block underline font-medium break-all" href={secureMarkUrl}>
            {secureMarkUrl}
          </a>
        </div>
      )}

      {locationHint && !locationBlockedPopup && (
        <div className="mb-4 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-sm space-y-2">
          <p className="font-medium">{locationHint}</p>
          <button type="button" className="underline text-sm" onClick={onRequestLocationAgain}>
            Request Location Again
          </button>
        </div>
      )}

      {lastMark && (
        <div className="mb-4 p-4 rounded-lg border border-brand-100 bg-white/80 text-sm">
          <p className="font-medium text-brand-700">Today&apos;s status</p>
          <p className="mt-1">
            Status: <span className="font-medium">{lastMark.status}</span>
            {lastMark.isLate ? ' · Late' : ''}
          </p>
          <p className="text-ink/60 text-xs mt-1">
            In: {lastMark.checkInAt ? new Date(lastMark.checkInAt).toLocaleTimeString() : '—'} · Out:{' '}
            {lastMark.checkOutAt ? new Date(lastMark.checkOutAt).toLocaleTimeString() : '—'}
            {lastMark.checkOutLabel ? ` · ${lastMark.checkOutLabel}` : ''}
          </p>
        </div>
      )}

      {geo && !locationHint && !locationBlockedPopup && (
        <div className="mb-4 p-3 rounded-lg border border-emerald-100 bg-emerald-50/80 text-sm text-emerald-900 space-y-1">
          <p className="font-medium">Current GPS captured</p>
          <p className="text-xs break-all">{geo.address}</p>
          <p className="text-xs font-mono">
            {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)} (±{Math.round(geo.accuracyM)}m)
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      {!captureMode && (
        <div className="flex gap-3">
          {phase === 'need_in' && (
            <button
              type="button"
              disabled={loading}
              onClick={() => onPunchClick('IN')}
              className="flex-1 bg-brand-600 text-white py-3 rounded-xl font-medium disabled:opacity-60"
            >
              {loading ? 'Requesting location…' : 'Check In'}
            </button>
          )}
          {phase === 'need_out' && (
            <button
              type="button"
              disabled={loading}
              onClick={() => onPunchClick('OUT')}
              className="flex-1 bg-brand-900 text-white py-3 rounded-xl font-medium disabled:opacity-60"
            >
              {loading ? 'Requesting location…' : 'Check Out'}
            </button>
          )}
          {phase === 'done' && (
            <div className="flex-1 p-4 rounded-xl border border-brand-100 bg-white/80 text-sm text-center">
              <p className="font-medium text-brand-700">Attendance complete for today</p>
              <Link href={sheetUrlForToday()} className="inline-block mt-2 text-brand-600 underline">
                View today&apos;s sheet
              </Link>
            </div>
          )}
        </div>
      )}

      {captureMode && (
        <div className="space-y-3 rounded-xl border border-brand-100 bg-white/90 p-4">
          <p className="text-sm font-medium text-brand-700">
            {captureMode === 'IN' ? 'Check In' : 'Check Out'} — capture selfie
          </p>
          {cameraHint && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-950 text-sm space-y-2">
              <p>{cameraHint}</p>
              <button type="button" className="underline" onClick={() => void startCamera()}>
                Enable Camera Again
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => onFileSelfie(e.target.files?.[0] ?? null)}
          />
          {!useFileCapture && (
            <video
              ref={videoRef}
              className="w-full rounded-lg bg-ink-900 aspect-video object-cover"
              playsInline
              muted
              autoPlay
            />
          )}
          {selfiePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selfiePreview} alt="Selfie preview" className="w-full rounded-lg max-h-64 object-cover" />
          )}
          {!selfiePreview && useFileCapture && (
            <button
              type="button"
              className="btn-primary w-full py-3"
              onClick={() => fileRef.current?.click()}
            >
              Open Camera / Take Selfie
            </button>
          )}
          {!selfiePreview && !useFileCapture && !cameraReady && (
            <button type="button" className="btn-secondary w-full" onClick={() => void startCamera()}>
              Enable Camera Again
            </button>
          )}
          {!selfiePreview && !useFileCapture && cameraReady && (
            <button
              type="button"
              className="btn-primary w-full py-3"
              onClick={() => {
                try {
                  captureSelfieFromVideo();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Capture failed');
                }
              }}
            >
              Capture Selfie
            </button>
          )}
          {selfiePreview && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setSelfiePreview('');
                if (useFileCapture) fileRef.current?.click();
                else void startCamera();
              }}
            >
              Retake selfie
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={cancelCapture} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary flex-1 py-3"
              disabled={loading || !selfiePreview}
              onClick={() => void confirmAndSubmit()}
            >
              {loading ? 'Saving…' : `Confirm ${captureMode === 'IN' ? 'Check In' : 'Check Out'}`}
            </button>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-ink/50">
        <Link href="/attendance/sheet" className="text-brand-600 underline">
          View Attendance Sheet
        </Link>
      </p>

      {successPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
            <p className="font-display text-xl text-brand-700 font-semibold">{successPopup}</p>
            <p className="text-sm text-ink/60 mt-2">Your attendance has been saved.</p>
            {geo && (
              <p className="text-xs text-ink/50 mt-2 break-all">
                Location: {geo.address}
                <br />
                <span className="font-mono">
                  {geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}
                </span>
              </p>
            )}
            <button type="button" className="btn-primary w-full mt-5 py-3" onClick={onSuccessOk}>
              OK
            </button>
          </div>
        </div>
      )}

      {locationBlockedPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center space-y-3">
            <p className="font-display text-xl text-brand-700 font-semibold">
              Location access is required for GPS attendance.
            </p>
            <p className="text-sm text-ink/60">
              {permissionState === 'denied'
                ? 'Location is permanently blocked for this site. Set Location to Allow in the browser site settings, then tap Request Location Again (this runs navigator.geolocation.getCurrentPosition again).'
                : locationHint ||
                  'Tap Request Location Again to open the browser’s native location permission popup.'}
            </p>
            {httpsLanHint && (
              <p className="text-xs text-ink/50 break-all">
                Use HTTPS:{' '}
                <a className="underline text-brand-600" href={secureMarkUrl}>
                  {secureMarkUrl}
                </a>
              </p>
            )}
            <button
              type="button"
              className="btn-primary w-full py-3"
              disabled={loading}
              onClick={onRequestLocationAgain}
            >
              {loading ? 'Requesting GPS…' : 'Request Location Again'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
