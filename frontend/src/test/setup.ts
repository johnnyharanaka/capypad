import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock ResizeObserver for react-three-fiber
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any

// Mock WebGL canvas
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  canvas: { width: 0, height: 0 },
}) as any
