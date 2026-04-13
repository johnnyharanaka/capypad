/** Base URL for API calls. Empty string in dev (uses Vite proxy), full URL in production. */
export const API = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'capypad_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface TokenPayload {
  upn?: string;
  preferred_username?: string;
  groups?: string[];
  realm_access?: {
    roles: string[];
  };
  exp: number;
}

export function parseToken(token: string): TokenPayload | null {
  try {
    return JSON.parse(atob(token.split('.')[1])) as TokenPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseToken(token);
  if (!payload) return true;
  return payload.exp * 1000 < Date.now();
}
