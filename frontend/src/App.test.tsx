import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import App from './App'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} },
  }
})()

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
  localStorageMock.clear()
})

describe('Home', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/', href: '' },
      writable: true,
    })
  })

  it('renders the home page with input', () => {
    render(<App />)
    expect(screen.getByText(/Capy/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /pad name/i })).toBeInTheDocument()
  })

  it('navigates to pad on Enter', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByRole('textbox', { name: /pad name/i })
    await user.type(input, 'my-pad{Enter}')
    expect(window.location.href).toBe('/my-pad')
  })
})

describe('PadEditor', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/demo', href: '/demo' },
      writable: true,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ path: 'demo', content: '# Hello' }),
    }))
  })

  it('renders the pad header with path', async () => {
    render(<App />)
    expect(screen.getByText(/demo/)).toBeInTheDocument()
  })

  it('renders the dark mode toggle', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /toggle dark mode/i })).toBeInTheDocument()
  })
})
