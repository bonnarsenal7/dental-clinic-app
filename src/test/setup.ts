import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// testing-library defaults findBy*/waitFor to a 1s window. The first test in
// a file also pays the cold module-load cost, which on CI's slower hardware
// pushed a correct assertion past that deadline while the same assertion
// passed locally. Widening it removes the flake without weakening anything:
// a genuinely broken expectation still fails, just a few seconds later.
configure({ asyncUtilTimeout: 5000 })

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
