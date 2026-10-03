/** Cross-page / cross-tab attendance live refresh (no polling storms). */

const EVENT = 'eitf-attendance-changed';
const STORAGE_KEY = 'eitf-attendance-changed-at';

export type AttendanceChangeDetail = {
  employeeId?: string;
  date?: string;
  source?: string;
};

export function notifyAttendanceChanged(detail: AttendanceChangeDetail = {}) {
  if (typeof window === 'undefined') return;
  const payload = { ...detail, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
  try {
    const ch = new BroadcastChannel(EVENT);
    ch.postMessage(payload);
    ch.close();
  } catch {
    /* unsupported */
  }
}

export function onAttendanceChanged(handler: (detail: AttendanceChangeDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onCustom = (e: Event) => {
    handler((e as CustomEvent<AttendanceChangeDetail>).detail ?? {});
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      handler(JSON.parse(e.newValue) as AttendanceChangeDetail);
    } catch {
      handler({});
    }
  };

  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(EVENT);
    ch.onmessage = (ev) => handler((ev.data as AttendanceChangeDetail) ?? {});
  } catch {
    ch = null;
  }

  window.addEventListener(EVENT, onCustom);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
    try {
      ch?.close();
    } catch {
      /* ignore */
    }
  };
}
