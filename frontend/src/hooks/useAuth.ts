import { useCallback, useEffect, useRef, useState } from "react";
import {
  API,
  getStoredUser,
  storeUser,
  clearStoredUser,
  refreshSession,
  type UserInfo,
} from "../api";

/** Renew at 80% of the token lifetime, but never busier than once a minute. */
function refreshDelayMs(expiresIn: number): number {
  return Math.max(expiresIn * 0.8, 60) * 1000;
}

export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetches /me and syncs state; returns true when authenticated & approved.
  const loadMe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
      if (!res.ok) return false;
      const data = await res.json();
      const info: UserInfo = {
        username: data.username,
        role: data.role,
        isAdmin: data.role === "ADMIN",
      };
      storeUser(info);
      setUser(info);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Schedules the next proactive refresh ahead of token expiry. Reschedules
  // itself on success; logs out if the session can no longer be refreshed.
  const scheduleRefresh = useCallback((expiresIn: number) => {
    function arm(seconds: number) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(async () => {
        const next = await refreshSession();
        if (next != null) {
          arm(next);
        } else {
          clearStoredUser();
          setUser(null);
        }
      }, refreshDelayMs(seconds));
    }
    arm(expiresIn);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;

    (async () => {
      // Happy path: the access-token cookie is still valid.
      let authed = await loadMe();

      // Otherwise try to silently mint a new one from the refresh cookie
      // (e.g. returning after the access token already expired).
      if (!authed) {
        const expiresIn = await refreshSession();
        if (expiresIn != null) {
          authed = await loadMe();
          if (authed && !signal.aborted) scheduleRefresh(expiresIn);
        }
      } else {
        // Already authenticated: bootstrap the proactive refresh loop so the
        // session stays alive while the tab is open.
        const expiresIn = await refreshSession();
        if (expiresIn != null && !signal.aborted) scheduleRefresh(expiresIn);
      }

      if (signal.aborted) return;
      if (!authed) {
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
