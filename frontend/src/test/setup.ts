import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  canvas: { width: 0, height: 0 },
}) as unknown as typeof HTMLCanvasElement.prototype.getContext

class MockEventSource {
  url: string
  withCredentials: boolean
  readyState = 0
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  constructor(url: string | URL, opts?: EventSourceInit) {
    this.url = url.toString()
    this.withCredentials = opts?.withCredentials ?? false
  }
  addEventListener() {}
  removeEventListener() {}
  close() {}
  dispatchEvent() { return true }
}
globalThis.EventSource = MockEventSource as unknown as typeof EventSource
