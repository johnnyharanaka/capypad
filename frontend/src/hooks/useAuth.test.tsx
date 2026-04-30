import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAuth } from "./useAuth";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
  Object.defineProperty(window, "location", {
    value: { href: "https://app/p1", pathname: "/p1" },
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAuth", () => {
  it("populates user from successful /me response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ username: "alice", role: "ADMIN" }),
      }),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.username).toBe("alice");
  });

  it("clears user when /me responds 403", async () => {
    localStorageMock.setItem(
      "capypad_user",
      JSON.stringify({ username: "stale", role: "USER", isAdmin: false }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve(null),
      }),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem("capypad_user")).toBeNull();
  });

  it("logout clears state and redirects to keycloak url when provided", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/api/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ username: "bob", role: "USER" }),
        });
      }
      // logout
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: "https://kc/logout" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.logout();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect((window.location as unknown as { href: string }).href).toBe(
        "https://kc/logout",
      ),
    );
  });
});
