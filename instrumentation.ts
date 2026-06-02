import * as Sentry from '@sentry/nextjs'

// Server- + Edge-Init (Next.js 16 instrumentation hook).
// Init je nach Laufzeit — kein separater sentry.server.config.ts Entrypoint.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false, // DSGVO — keine personenbezogenen Daten an Sentry
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    })
  }
}

// Faengt Fehler in Server Components und Route Handlers automatisch ab.
export const onRequestError = Sentry.captureRequestError
