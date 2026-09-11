import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import OfflineBanner from './OfflineBanner'
import { reportOffline, reportOnline } from '../useOnlineStatus'

describe('OfflineBanner', () => {
  it('stays out of the way while the connection is fine', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appears when a request is observed to fail', () => {
    render(<OfflineBanner />)
    act(() => reportOffline())
    expect(screen.getByRole('status')).toHaveTextContent(/you're offline/i)
  })

  // The wording carries the promise the app actually makes: your input is
  // safe on screen, but nothing was written. Staff act on this distinction.
  it('says that work on screen is unsaved, not lost', () => {
    render(<OfflineBanner />)
    act(() => reportOffline())
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/still here/i)
    expect(banner).toHaveTextContent(/nothing will save/i)
  })

  it('clears once a request succeeds again', () => {
    render(<OfflineBanner />)
    act(() => reportOffline())
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => reportOnline())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // The case navigator.onLine gets wrong: the tablet is still associated
  // with the clinic access point, so the browser reports online, but the
  // uplink is dead. An observed failure has to win over the flag.
  it('trusts an observed failure over navigator.onLine', () => {
    expect(window.navigator.onLine).toBe(true)
    render(<OfflineBanner />)
    act(() => reportOffline())
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('reacts to the browser going offline on its own', () => {
    render(<OfflineBanner />)
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
