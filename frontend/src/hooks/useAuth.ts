import { useCallback, useEffect, useRef, useState } from "react";
import {
  API,
  getStoredUser,
  storeUser,
  clearStoredUser,
  refreshSession,
  type UserInfo,
} from "../api";

/** Renew at 80% of the remaining lifetime, but never busier than once a minute. */
function refreshDelayMs(secondsUntilExpiry: number): number {
  return Math.max(secondsUntilExpiry * 0.8, 60) * 1000;
}

export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetches /me and syncs state; returns seconds until the access token
  // expires, or null when not authenticated.
  const loadMe = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      const info: UserInfo = {
        username: data.username,
        role: data.role,
        isAdmin: data.role === "ADMIN",
      };
      storeUser(info);
      setUser(info);
      // Seconds until the token expires; fall back to a default when the server
      // couldn't report it (e.g. expiresAt absent or 0).
      const secondsLeft =
        typeof data.expiresAt === "number"
          ? data.expiresAt - Math.floor(Date.now() / 1000)
          : 0;
      return secondsLeft > 30 ? secondsLeft : 300;
    } catch {
      return null;
    }
  }, []);

  // Arms a single proactive refresh ahead of token expiry. Reschedules itself
  // on success. On failure it re-checks /me: a still-valid token means a
  // transient hiccup (retry), otherwise the session is gone (log out).
  const scheduleRefresh = useCallback((secondsUntilExpiry: number) => {
    function arm(seconds: number) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(async () => {
        const next = await refreshSession();
        if (next != null) {
          arm(next);
          return;
        }
        const secondsLeft = await loadMe();
        if (secondsLeft != null) {
          arm(secondsLeft);
        } else {
          clearStoredUser();
          setUser(null);
        }
      }, refreshDelayMs(seconds));
    }
    arm(secondsUntilExpiry);
  }, [loadMe]);

  useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;

    (async () => {
      // Happy path: the access-token cookie is still valid — no token rotation
      // needed, just schedule the proactive refresh from its real expiry.
      let secondsLeft = await loadMe();

      // Returning after the access token already expired: try a silent refresh
      // from the refresh cookie, then re-read /me.
      if (secondsLeft == null) {
        const expiresIn = await refreshSession();
        if (expiresIn != null) secondsLeft = await loadMe();
      }

      if (signal.aborted) return;
      if (secondsLeft != null) {
        scheduleRefresh(secondsLeft);
      } else {
        clearStoredUser();
        setUser(null);
      }
      setLoading(false);
    })();

    return () => {
      abort.abort();
      clearTimeout(refreshTimer.current);
    };
  }, [loadMe, scheduleRefresh]);

  const login = useCallback(() => {
    const redirect = encodeURIComponent(window.location.href);
    fetch(`${API}/api/auth/login?redirect=${redirect}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          window.location.href = `${API}/api/auth/login?redirect=${redirect}`;
        }
      })
      .catch(() => {
        window.location.href = `${API}/api/auth/login?redirect=${redirect}`;
      });
  }, []);

  const logout = useCallback(() => {
    clearTimeout(refreshTimer.current);
    const redirect = encodeURIComponent(window.location.href);
    fetch(`${API}/api/auth/logout?redirect=${redirect}`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        clearStoredUser();
        setUser(null);
        if (data?.url) {
          window.location.href = data.url;
        }
      })
      .catch(() => {
        clearStoredUser();
        setUser(null);
      });
  }, []);

  return {
    isAuthenticated: user !== null,
    isAdmin: user?.isAdmin ?? false,
    username: user?.username ?? null,
    login,
    logout,
    loading,
  };
}
