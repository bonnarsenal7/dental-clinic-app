import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Stops a render-time crash from blanking the screen mid-appointment.
 *
 *  A white page is the worst outcome for the clinic: staff can't tell
 *  whether the last thing they typed saved, and there's nothing to report.
 *  This keeps the nav shell's surroundings, says plainly what is and isn't
 *  saved, and offers a reload — while sending the stack to Sentry so the
 *  crash is visible after launch instead of only in a phone call.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-lg w-full flex flex-col gap-4">
          <h1 className="text-lg font-semibold text-slate-800">Something went wrong</h1>
          <p className="text-sm text-slate-600">
            This screen stopped unexpectedly. Anything you had already saved is safe — but anything
            you were part-way through typing has been lost and will need re-entering.
          </p>
          <p className="text-xs text-slate-400 font-mono break-words bg-slate-50 border border-slate-200 rounded p-2">
            {this.state.error.message}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 min-h-[44px]"
            >
              Reload the app
            </button>
            <a
              href="/"
              className="rounded-md border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 min-h-[44px] flex items-center"
            >
              Back to dashboard
            </a>
          </div>
          <p className="text-xs text-slate-400">
            The error has been reported automatically. If it keeps happening, note what you were
            doing and tell whoever maintains the system.
          </p>
        </div>
      </div>
    )
  }
}
