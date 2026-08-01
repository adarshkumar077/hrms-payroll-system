export type ThemeMode = 'light' | 'dark';

const THEME_KEY_PREFIX = 'eitf_theme_';

export function getThemeStorageKey(userId?: string | null) {
  return `${THEME_KEY_PREFIX}${userId || 'guest'}`;
}

export function readStoredTheme(userId?: string | null): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const raw = localStorage.getItem(getThemeStorageKey(userId));
  return raw === 'dark' ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.dataset.theme = mode;
}

export function saveTheme(mode: ThemeMode, userId?: string | null) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getThemeStorageKey(userId), mode);
  applyTheme(mode);
}

export function toggleTheme(userId?: string | null): ThemeMode {
  const next: ThemeMode = readStoredTheme(userId) === 'dark' ? 'light' : 'dark';
  saveTheme(next, userId);
  return next;
}
