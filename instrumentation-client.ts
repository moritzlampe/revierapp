import * as Sentry from '@sentry/nextjs'

// Browser-Init (Next.js 16 instrumentation hook).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false, // DSGVO — keine personenbezogenen Daten an Sentry
  // Session Replay komplett AUS (DSGVO + Free-Tier-Quota). Nur Errors.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
})

// Erfasst Navigations-Transitions fuer Performance-Tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
