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
