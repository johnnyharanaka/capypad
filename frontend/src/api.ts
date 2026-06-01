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

/* ── Token refresh ─────────────────────────────────────────────────── */

/**
 * Asks the backend to swap the refresh-token cookie for a fresh access token.
 * Returns the new access token lifetime in seconds, or null if the session
 * could no longer be refreshed (refresh token expired/revoked or absent).
 */
export async function refreshSession(): Promise<number | null> {
  try {
    const res = await fetch(`${API}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.expiresIn === 'number' ? data.expiresIn : 300;
  } catch {
    return null;
  }
}
