import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import App from "./App";

vi.mock("./editor/PadEditor", () => ({
  default: () => null,
}));

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
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  localStorageMock.clear();
});

describe("Home", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/", href: "" },
      writable: true,
    });
  });

  it("renders the home page with input", () => {
    render(<App />);
    expect(screen.getByText(/Capy/)).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /pad name/i }),
    ).toBeInTheDocument();
  });

  it("navigates to pad on Enter", async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByRole("textbox", { name: /pad name/i });
    await user.type(input, "my-pad{Enter}");
    expect(window.location.href).toBe("/my-pad");
  });
});

describe("PadEditor", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/demo", href: "/demo", search: "" },
      writable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/auth/me")) {
          return Promise.resolve({ status: 403, ok: false, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ path: "demo", content: "# Hello" }),
        });
      }),
    );
  });

  it("renders the pad header with path", async () => {
    render(<App />);
    expect(screen.getByText(/demo/)).toBeInTheDocument();
  });

  it("renders the dark mode toggle", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: /toggle dark mode/i }),
    ).toBeInTheDocument();
  });

  it("shows upload warning when pad is blocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/auth/me")) {
          return Promise.resolve({ status: 403, ok: false, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              path: "demo",
              content: "# Hello",
              imageCount: 20,
              imageCountLimit: 20,
              totalImageBytes: 1024,
              totalImageBytesLimit: 52428800,
              uploadBlocked: true,
              uploadBlockReason: "Image limit reached for this pad",
            }),
        });
      }),
    );

    render(<App />);
    expect(
      await screen.findByText(/Image limit reached for this pad/i),
    ).toBeInTheDocument();
  });

  it("shows guest-mode banner when anonymous and pad is unclaimed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/auth/me")) {
          return Promise.resolve({ status: 403, ok: false, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              path: "demo",
              content: "hello",
              claimed: false,
            }),
        });
      }),
    );

    render(<App />);
    expect(
      await screen.findByText(/Guest mode/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Read-only mode/i),
    ).not.toBeInTheDocument();
  });

  it("shows read-only banner when anonymous and pad is claimed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/auth/me")) {
          return Promise.resolve({ status: 403, ok: false, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              path: "demo",
              content: "hello",
              claimed: true,
            }),
        });
      }),
    );

    render(<App />);
    expect(
      await screen.findByText(/Read-only mode/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Guest mode/i)).not.toBeInTheDocument();
  });

  it("hides both banners when authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/api/auth/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ username: "alice", role: "USER" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              path: "demo",
              content: "hello",
              claimed: false,
            }),
        });
      }),
    );

    render(<App />);
    // Wait for auth resolution by waiting for a known header element,
    // then assert neither banner appears.
    await screen.findByText(/demo/);
    expect(screen.queryByText(/Guest mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Read-only mode/i)).not.toBeInTheDocument();
  });
});
