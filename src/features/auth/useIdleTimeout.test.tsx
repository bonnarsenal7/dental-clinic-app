import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdleTimeout } from './useIdleTimeout'

/** A shared clinic tablet left at the front desk must not stay signed in.
 *  This is a security control and had no test — the timeout could have been
 *  disabled by a refactor with nothing to catch it. */

function Harness({ onIdle, enabled }: { onIdle: () => void; enabled: boolean }) {
  useIdleTimeout(onIdle, enabled)
  return null
}

const FIFTEEN_MINUTES = 15 * 60 * 1000

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('signs out after fifteen minutes of no interaction', () => {
    const onIdle = vi.fn()
    render(<Harness onIdle={onIdle} enabled />)
    vi.advanceTimersByTime(FIFTEEN_MINUTES - 1)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  // Long enough not to log out a dentist mid-charting just because they
  // paused to talk to a patient — so activity has to actually reset it.
  it.each(['mousedown', 'keydown', 'touchstart', 'scroll'])('restarts the clock on %s', (evt) => {
    const onIdle = vi.fn()
    render(<Harness onIdle={onIdle} enabled />)
    vi.advanceTimersByTime(FIFTEEN_MINUTES - 1000)
    window.dispatchEvent(new Event(evt))
    vi.advanceTimersByTime(FIFTEEN_MINUTES - 1000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('does nothing at all while nobody is signed in', () => {
    const onIdle = vi.fn()
    render(<Harness onIdle={onIdle} enabled={false} />)
    vi.advanceTimersByTime(FIFTEEN_MINUTES * 2)
    expect(onIdle).not.toHaveBeenCalled()
  })

  // A timer surviving unmount would sign out a user who has already signed
  // in again as someone else.
  it('stops the clock when it unmounts', () => {
    const onIdle = vi.fn()
    const { unmount } = render(<Harness onIdle={onIdle} enabled />)
    unmount()
    vi.advanceTimersByTime(FIFTEEN_MINUTES * 2)
    expect(onIdle).not.toHaveBeenCalled()
  })

  it('stops listening for activity when it unmounts', () => {
    const onIdle = vi.fn()
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Harness onIdle={onIdle} enabled />)
    unmount()
    for (const evt of ['mousedown', 'keydown', 'touchstart', 'scroll']) {
      expect(remove).toHaveBeenCalledWith(evt, expect.any(Function))
    }
  })
})
