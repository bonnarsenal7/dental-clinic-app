import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const captureException = vi.fn()
vi.mock('@sentry/react', () => ({ captureException }))

const ErrorBoundary = (await import('./ErrorBoundary')).default

function Boom(): React.ReactNode {
  throw new Error('render exploded')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    captureException.mockClear()
    // React logs the caught error itself; silence it so a passing run is
    // readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>the app</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('the app')).toBeInTheDocument()
  })

  // A white page is the worst outcome for the clinic: staff cannot tell
  // whether the last thing they typed saved, and there is nothing to report.
  it('shows something rather than blanking the screen', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  // The one question a clinician will actually have.
  it('says plainly what is and is not saved', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/anything you had already saved is safe/i)).toBeInTheDocument()
    expect(screen.getByText(/part-way through typing has been lost/i)).toBeInTheDocument()
  })

  it('offers a way out', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: /reload the app/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument()
  })

  // So the crash is visible after launch instead of only in a phone call.
  it('reports the crash to Sentry with the component stack', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render exploded' }),
      expect.objectContaining({ extra: expect.objectContaining({ componentStack: expect.anything() }) }),
    )
  })

  it('shows the error text, so a staff member can quote it', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('render exploded')).toBeInTheDocument()
  })
})
