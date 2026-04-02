'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ServiceWorkerRegistration() {
  const router = useRouter()

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW-Registration fehlgeschlagen:', err)
      })
    }

    // Badge + Notifications löschen
    function clearBadgeAndNotifications() {
      if ('clearAppBadge' in navigator) {
        (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
      }
      // Service Worker bitten, alle Notifications zu schließen
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_NOTIFICATIONS' })
    }

    // Sofort beim Mount
    clearBadgeAndNotifications()

    // Wenn App wieder in den Vordergrund kommt
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        clearBadgeAndNotifications()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // SW-Nachrichten empfangen (z.B. Notification-Click → clientseitige Navigation)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        router.push(event.data.url)
      }
    }
    navigator.serviceWorker?.addEventListener('message', handler)
    return () => navigator.serviceWorker?.removeEventListener('message', handler)
  }, [router])

  return null
}
