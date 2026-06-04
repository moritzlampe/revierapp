import * as Sentry from '@sentry/nextjs'

// Browser-Init (Next.js 16 instrumentation hook).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false, // DSGVO — keine personenbezogenen Daten an Sentry
  // Session Replay komplett AUS (DSGVO + Free-Tier-Quota). Nur Errors.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Benignes auth-js/Web-Locks-Rauschen filtern: wenn mehrere parallele
  // Requests den auth-token-Lock greifen, "stiehlt" der spaetere ihn und
  // der wartende wirft. Harmlos (der stehlende Request fuehrt den Refresh
  // aus). NUR diese Steal-Meldung raus — acquireTimeout/hang/AbortError
  // (echte Deadlocks) bleiben sichtbar.
  beforeSend(event) {
    const msg = event.exception?.values?.[0]?.value ?? event.message ?? ''
    if (msg.includes('was released because another request stole it')) {
      return null
    }
    return event
  },
})

// Erfasst Navigations-Transitions fuer Performance-Tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
