/** Base URL for API calls. Empty string in dev (uses Vite proxy), full URL in production. */
export const API = import.meta.env.VITE_API_URL || '';

/* ── Session info (non-sensitive, stored in localStorage) ─────────── */

const USER_KEY = 'capypad_user';

export interface UserInfo {
  username: string;
  role: string;
  isAdmin: boolean;
}

export function getStoredUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeUser(info: UserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(info));
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_KEY);
  // Also clear legacy keys from before cookie migration
  localStorage.removeItem('capypad_token');
  localStorage.removeItem('capypad_username');
}
