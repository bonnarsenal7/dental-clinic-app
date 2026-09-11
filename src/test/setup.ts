import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// Supabase's client reads these at import time and throws without them.
// Tests never reach the network — the api modules are mocked — so any
// syntactically valid values will do.
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

beforeEach(() => {
  // happy-dom defaults navigator.onLine to true, but make it explicit:
  // a test that asserts the offline banner must control this, not inherit it.
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
