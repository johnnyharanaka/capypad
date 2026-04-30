import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStoredUser, storeUser, clearStoredUser, type UserInfo } from "./api";

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
});

describe("api session helpers", () => {
  it("returns null when no user is stored", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("round-trips a stored user", () => {
    const info: UserInfo = { username: "alice", role: "USER", isAdmin: false };
    storeUser(info);
    expect(getStoredUser()).toEqual(info);
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem("capypad_user", "{not json");
    expect(getStoredUser()).toBeNull();
  });

  it("clearStoredUser also removes legacy keys", () => {
    storeUser({ username: "bob", role: "ADMIN", isAdmin: true });
    localStorage.setItem("capypad_token", "old");
    localStorage.setItem("capypad_username", "old");

    clearStoredUser();

    expect(getStoredUser()).toBeNull();
    expect(localStorage.getItem("capypad_token")).toBeNull();
    expect(localStorage.getItem("capypad_username")).toBeNull();
  });
});
