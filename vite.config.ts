/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Component tests reach into module-level state (the connectivity
    // observer in useOnlineStatus), so files must not share a worker.
    isolate: true,
    // Must stay comfortably above testing-library's asyncUtilTimeout (5s,
    // set in src/test/setup.ts). If they are equal, a failing findBy* is cut
    // off by the test timeout and reports "Test timed out" instead of
    // "Unable to find an element" with the rendered DOM — which turns every
    // failure into a guess.
    testTimeout: 20_000,
  },
})
