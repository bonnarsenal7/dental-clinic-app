import { afterEach, describe, expect, it, vi } from 'vitest'
import { intakeCodeFromHash, intakeOrigin, intakeUrl, isIntakeHost } from './intakeHost'

describe('intake host', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // The whole design rests on this: a fragment is never sent to the server,
  // so the code stays out of request logs, and no rewrite is needed.
  it('puts the code in the fragment, never the path or query', () => {
    vi.stubEnv('VITE_INTAKE_ORIGIN', 'https://toothco-intake.vercel.app/')
    const url = new URL(intakeUrl('Ab-_9x'))
    expect(url.origin).toBe('https://toothco-intake.vercel.app')
    expect(url.pathname).toBe('/')
    expect(url.search).toBe('')
    expect(url.hash).toBe('#Ab-_9x')
  })

  it('reads the code back from the fragment', () => {
    expect(intakeCodeFromHash('#Ab-_9x')).toBe('Ab-_9x')
    expect(intakeCodeFromHash('')).toBe('')
  })

  // The staff app must never render on the intake address, and the intake
  // screen must never render on the staff one.
  it('recognises only the configured intake address', () => {
    vi.stubEnv('VITE_INTAKE_ORIGIN', 'https://toothco-intake.vercel.app')
    expect(intakeOrigin()).toBe('https://toothco-intake.vercel.app')
    expect(isIntakeHost('https://toothco-intake.vercel.app')).toBe(true)
    expect(isIntakeHost('https://dental-clinic-app-lilac.vercel.app')).toBe(false)
  })
})
