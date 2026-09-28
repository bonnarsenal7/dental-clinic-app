import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { clearIntakeLock, setIntakeLock, useIntakeLocked } from './intakeLock'

describe('intake lock', () => {
  afterEach(() => {
    clearIntakeLock()
  })

  // Stored, not held in component state: a reload or a URL typed into the
  // staff tab must still meet the lock.
  it('survives in storage, not only in memory', () => {
    setIntakeLock()
    expect(window.localStorage.getItem('toothco.intakeLock')).not.toBeNull()
    clearIntakeLock()
    expect(window.localStorage.getItem('toothco.intakeLock')).toBeNull()
  })

  it('locks and unlocks a mounted screen', () => {
    const { result } = renderHook(() => useIntakeLocked())
    expect(result.current).toBe(false)
    act(() => setIntakeLock())
    expect(result.current).toBe(true)
    act(() => clearIntakeLock())
    expect(result.current).toBe(false)
  })

  // Another staff tab on the same tablet locks too, or the patient just
  // switches to that one.
  it('follows a lock set in another tab', () => {
    const { result } = renderHook(() => useIntakeLocked())
    act(() => {
      window.localStorage.setItem('toothco.intakeLock', 'x')
      window.dispatchEvent(new StorageEvent('storage', { key: 'toothco.intakeLock', newValue: 'x' }))
    })
    expect(result.current).toBe(true)
  })
})
