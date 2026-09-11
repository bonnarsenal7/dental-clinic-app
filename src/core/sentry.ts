import * as Sentry from '@sentry/react'

/** Crash reporting, enabled only when a DSN is configured.
 *
 *  No DSN means no init at all — so local development and CI stay silent
 *  rather than erroring or shipping noise, and a fork of this repo without
 *  the clinic's DSN behaves sensibly.
 *
 *  `sendDefaultPii` is left off deliberately. This is a health records
 *  system: the last thing it should do is ship patient data to a
 *  third-party error tracker. Breadcrumbs can carry request URLs, which is
 *  why `beforeBreadcrumb` drops fetch bodies below.
 */
export function initErrorReporting() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Errors only. Performance tracing would sample request URLs containing
    // patient ids, for no benefit this clinic needs.
    tracesSampleRate: 0,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        // Keep the fact a request failed; drop what it carried.
        delete breadcrumb.data?.body
      }
      return breadcrumb
    },
    beforeSend(event) {
      // A dropped connection is a fact about the clinic Wi-Fi, not a bug.
      // Reporting it would bury real crashes under flaky-network noise.
      const type = event.exception?.values?.[0]?.value?.toLowerCase() ?? ''
      if (type.includes('failed to fetch') || type.includes('networkerror')) return null
      return event
    },
  })
}
