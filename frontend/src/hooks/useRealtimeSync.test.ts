import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRealtimeSync } from "./useRealtimeSync";

class TrackingEventSource {
  static instances: TrackingEventSource[] = [];
  url: string;
  withCredentials: boolean;
  closed = false;
  listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  constructor(url: string | URL, opts?: EventSourceInit) {
    this.url = url.toString();
    this.withCredentials = opts?.withCredentials ?? false;
    TrackingEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    (this.listeners[name] ||= []).push(fn);
  }
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  dispatchEvent() {
    return true;
  }

  emit(name: string, data: unknown) {
    for (const fn of this.listeners[name] || []) {
      fn({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

beforeEach(() => {
  TrackingEventSource.instances = [];
  vi.stubGlobal("EventSource", TrackingEventSource as unknown as typeof EventSource);
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useRealtimeSync", () => {
  it("returns a non-empty client id", () => {
    const { result } = renderHook(() => useRealtimeSync("foo", () => {}));
    expect(typeof result.current).toBe("string");
    expect(result.current.length).toBeGreaterThan(0);
  });

  it("opens an EventSource for the given pad path with the client id", () => {
    const { result } = renderHook(() => useRealtimeSync("my-pad", () => {}));
    expect(TrackingEventSource.instances.length).toBe(1);
    const es = TrackingEventSource.instances[0];
    expect(es.url).toContain("/api/pad/my-pad/events");
    expect(es.url).toContain(`clientId=${encodeURIComponent(result.current)}`);
    expect(es.withCredentials).toBe(true);
  });

  it("invokes onUpdate when a parsable update event is emitted", () => {
    const handler = vi.fn();
    renderHook(() => useRealtimeSync("p", handler));
    const es = TrackingEventSource.instances[0];
    es.emit("update", { path: "p", content: "hi" });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ path: "p", content: "hi" }),
    );
  });

  it("closes the EventSource when the component unmounts", () => {
    const { unmount } = renderHook(() => useRealtimeSync("x", () => {}));
    const es = TrackingEventSource.instances[0];
    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it("does not open an EventSource for empty pad paths", () => {
    renderHook(() => useRealtimeSync("", () => {}));
    expect(TrackingEventSource.instances.length).toBe(0);
  });
});
