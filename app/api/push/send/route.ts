import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!
const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || 'mailto:moritz@quickhunt.de'

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export async function POST(request: Request) {
  try {
    const { huntId, groupId, title, body, senderUserId, url } = await request.json()

    if (!title || !body || !senderUserId) {
      return NextResponse.json({ error: 'title, body, senderUserId sind Pflicht' }, { status: 400 })
    }

    // Service-Role-Client: kann alle Subscriptions lesen (kein RLS)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Empfänger ermitteln
    let recipientUserIds: string[] = []

    if (groupId) {
      // Gruppenchat: alle Mitglieder
      const { data: members } = await supabase
        .from('chat_group_members')
        .select('user_id')
        .eq('group_id', groupId)

      recipientUserIds = (members || []).map(m => m.user_id)
    } else if (huntId) {
      // Jagd-Chat: alle Teilnehmer mit user_id
      const { data: participants } = await supabase
        .from('hunt_participants')
        .select('user_id')
        .eq('hunt_id', huntId)
        .not('user_id', 'is', null)

      recipientUserIds = (participants || []).map(p => p.user_id)
    }

    // Sender rausfiltern (keine Benachrichtigung an sich selbst)
    recipientUserIds = recipientUserIds.filter(id => id !== senderUserId)

    if (recipientUserIds.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Push-Subscriptions aller Empfänger laden
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, subscription')
      .in('user_id', recipientUserIds)

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Push an jede Subscription senden
    const payload = JSON.stringify({ title, body, url: url || '/', tag: groupId || huntId || 'chat' })
    const expiredIds: string[] = []
    let sent = 0

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
          sent++
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 410 || statusCode === 404) {
            // Subscription abgelaufen → aus DB löschen
            expiredIds.push(sub.id)
          }
        }
      })
    )

    // Abgelaufene Subscriptions aufräumen
    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds)
    }

    return NextResponse.json({ sent, expired: expiredIds.length })
  } catch (err) {
    console.error('Push-Route Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
