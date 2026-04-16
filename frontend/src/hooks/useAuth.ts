import { useCallback, useEffect, useState } from "react";
import {
  API,
  getStoredUser,
  storeUser,
  clearStoredUser,
  type UserInfo,
} from "../api";

export function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: "include" })
      .then((res) => {
        if (res.status === 403) return null;
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data) {
          const info: UserInfo = {
            username: data.username,
            role: data.role,
            isAdmin: data.role === "ADMIN",
          };
          storeUser(info);
          setUser(info);
        } else {
          clearStoredUser();
          setUser(null);
        }
      })
      .catch(() => {
        clearStoredUser();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

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
