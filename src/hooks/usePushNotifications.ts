'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

// Base64-URL zu Uint8Array konvertieren (für applicationServerKey)
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

type PushState = 'unsupported' | 'prompt' | 'granted' | 'denied' | 'subscribed'

export function usePushNotifications(supabase: SupabaseClient, userId: string | null) {
  const [state, setState] = useState<PushState>('unsupported')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!userId) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }

    // Prüfe aktuellen Berechtigungsstatus
    const permission = Notification.permission
    if (permission === 'denied') {
      setState('denied')
      return
    }

    // Prüfe ob schon eine Subscription existiert
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        setState('subscribed')
      } else if (permission === 'granted') {
        setState('granted')
      } else {
        setState('prompt')
      }
    })
  }, [userId])

  const subscribe = useCallback(async () => {
    if (!userId || !VAPID_PUBLIC_KEY) return

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      // Subscription in Supabase speichern
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          subscription: subscription.toJSON(),
        },
        { onConflict: 'user_id,subscription' }
      )

      if (error) {
        console.error('Push-Subscription speichern fehlgeschlagen:', error)
      }

      setState('subscribed')
    } catch (err) {
      console.error('Push-Subscription fehlgeschlagen:', err)
    }
  }, [userId, supabase])

  const dismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // Banner soll nur bei 'prompt' oder 'granted' (noch nicht subscribed) angezeigt werden
  const showBanner = !dismissed && (state === 'prompt' || state === 'granted')

  return { state, showBanner, subscribe, dismiss }
}
