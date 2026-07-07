import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import webpush from 'web-push'
import { Expo, type ExpoPushMessage } from 'expo-server-sdk'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!
const VAPID_CONTACT = process.env.VAPID_CONTACT_EMAIL || 'mailto:moritz@quickhunt.de'

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

// Service-Role-Client: kann alle Subscriptions lesen (kein RLS).
function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}
type ServiceClient = ReturnType<typeof serviceClient>

// Zugesagte Teilnehmer (status='joined') einer Jagd mit user_id. Gemeinsames
// Muster für Jagd-Chat- und Treiben-Zweig (T0.C1 D4) — bewusst extrahiert
// statt dupliziert, Verhalten identisch zum bisherigen huntId-Zweig.
async function resolveJoinedParticipantIds(
  supabase: ServiceClient,
  huntId: string,
): Promise<string[]> {
  const { data: participants } = await supabase
    .from('hunt_participants')
    .select('user_id')
    .eq('hunt_id', huntId)
    .eq('status', 'joined')
    .not('user_id', 'is', null)
  return (participants || []).map((p) => p.user_id as string)
}

export async function POST(request: Request) {
  try {
    const { huntId, groupId, messageText, isDirect, chatName, url, recipientUserId, kind, type, event, driveName } = await request.json()

    // drive-Push (T0.C1) baut den Payload serverseitig fix und braucht daher
    // kein messageText. Für alle bestehenden Zweige bleibt die Pflichtprüfung
    // exakt an dieser Stelle (Cookie-Pfad regressionsfrei).
    if (type !== 'drive' && !messageText) {
      return NextResponse.json({ error: 'messageText ist Pflicht' }, { status: 400 })
    }

    // Authentifizierung serverseitig — der Sender wird NIE aus dem Body
    // übernommen (sonst beliebiges Push-Spoofing/-Spam). senderId = eingeloggter User.
    //
    // Auflösung in Reihenfolge (T0.C1 D1):
    //   (1) Authorization: Bearer <jwt> für native Clients (expo) — validiert
    //       gegen einen ANON-Key-Client (KEIN Service-Role für die User-Auflösung).
    //   (2) sonst der bestehende Cookie-Pfad (PWA), byte-identisch unverändert.
    const authHeader = request.headers.get('authorization')
    let user
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length)
      const bearerClient = createClient(SUPABASE_URL, ANON_KEY)
      const { data } = await bearerClient.auth.getUser(token)
      user = data.user
    } else {
      const authClient = await createAuthClient()
      const { data: { user: cookieUser } } = await authClient.auth.getUser()
      user = cookieUser
    }
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }
    const senderId = user.id

    // Service-Role-Client: kann alle Subscriptions lesen (kein RLS)
    const supabase = serviceClient()

    // Empfänger ermitteln (jeweils mit Autorisierung)
    let recipientUserIds: string[] = []

    if (type === 'drive') {
      // Treiben-Push (T0.C1 D4): gleiche Empfänger wie der Jagd-Chat — zugesagte
      // Teilnehmer der Jagd, Sender rausgefiltert. Der Sender muss selbst
      // zugesagter Teilnehmer sein (Spoofing-Schutz, wie im Jagd-Chat-Zweig).
      if (!huntId || (event !== 'started' && event !== 'ended') || typeof driveName !== 'string' || !driveName.trim()) {
        return NextResponse.json({ error: 'Ungültige Treiben-Anfrage' }, { status: 400 })
      }
      recipientUserIds = await resolveJoinedParticipantIds(supabase, huntId)
      if (!recipientUserIds.includes(senderId)) {
        return NextResponse.json({ sent: 0 })
      }
    } else if (recipientUserId) {
      // RSVP-Push (Sprint C): NUR an den Jagdleiter der referenzierten Jagd und
      // NUR wenn notify_on_rsvp='each'. Inhalt server-seitig auf zwei feste Verben
      // begrenzt (kein Freitext spoofbar; der Name kommt aus senderId via profiles).
      // Bewusst KEIN Teilnehmer-Check: decline löscht die invited-Zeile vor dem
      // Push (Race) — die Begrenzung auf creator_id + festes Verb + aufgelösten
      // Namen neutralisiert das Spoofing bereits.
      if (kind !== 'rsvp' || !huntId || (messageText !== 'hat zugesagt' && messageText !== 'hat abgesagt')) {
        return NextResponse.json({ error: 'Ungültige RSVP-Anfrage' }, { status: 400 })
      }
      const { data: hunt } = await supabase
        .from('hunts')
        .select('creator_id, notify_on_rsvp')
        .eq('id', huntId)
        .single()
      if (!hunt || hunt.creator_id !== recipientUserId || hunt.notify_on_rsvp !== 'each') {
        return NextResponse.json({ sent: 0 })
      }
      recipientUserIds = [recipientUserId]
    } else if (groupId) {
      // Gruppenchat: alle Mitglieder — der Sender muss selbst Mitglied sein.
      const { data: members } = await supabase
        .from('chat_group_members')
        .select('user_id')
        .eq('group_id', groupId)

      recipientUserIds = (members || []).map(m => m.user_id)
      if (!recipientUserIds.includes(senderId)) {
        return NextResponse.json({ sent: 0 })
      }
    } else if (huntId) {
      // Jagd-Chat: nur ZUGESAGTE Teilnehmer (status='joined') mit user_id.
      // invited-User sind nicht im Hunt-Chat und dürfen keine Push-Vorschau
      // der Chat-Nachricht bekommen (Sprint B Privacy-Fix). Der Sender muss
      // selbst zugesagter Teilnehmer sein.
      recipientUserIds = await resolveJoinedParticipantIds(supabase, huntId)
      if (!recipientUserIds.includes(senderId)) {
        return NextResponse.json({ sent: 0 })
      }
    } else {
      return NextResponse.json({ error: 'huntId, groupId oder recipientUserId nötig' }, { status: 400 })
    }

    // Sender rausfiltern (keine Benachrichtigung an sich selbst)
    recipientUserIds = recipientUserIds.filter(id => id !== senderId)

    if (recipientUserIds.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Push-Subscriptions aller Empfänger laden (inkl. kind für die web/expo-Partition)
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, subscription, kind')
      .in('user_id', recipientUserIds)

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Absendername autoritativ aus profiles auflösen (race-frei, Service-Role)
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', senderId)
      .single()
    const displayName = senderProfile?.display_name || ''

    // title/body serverseitig bauen (Graceful Degradation: ohne Name → wie bisher)
    let title: string
    let body: string
    if (type === 'drive') {
      // Treiben: feste Texte (kein Freitext, keine Emojis). driveName ist oben
      // als nicht-leerer String validiert.
      if (event === 'started') {
        title = 'Treiben gestartet'
        body = `${driveName} läuft — Hahn in Ruh beachten`
      } else {
        title = 'Hahn in Ruh'
        body = `${driveName} ist beendet`
      }
    } else if (kind === 'rsvp') {
      // RSVP-Benachrichtigung: "Hans hat zugesagt" (messageText = "hat zugesagt").
      title = chatName || 'QuickHunt'
      body = displayName ? `${displayName} ${messageText}` : messageText
    } else if (isDirect) {
      title = displayName || chatName || 'QuickHunt'
      body = messageText
    } else {
      title = chatName || 'QuickHunt'
      body = displayName ? `${displayName}: ${messageText}` : messageText
    }

    // url auf same-origin-relativen Pfad beschränken (kein Open-Redirect/
    // Phishing über die Push-Notification: muss mit '/' beginnen, nicht '//').
    const safeUrl = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'

    // Subscriptions nach kind partitionieren (T0.C1 D2). Bestands-Rows ohne
    // kind gelten als 'web' (Default), damit die Partition auch vor der
    // Migration nie leer bleibt.
    const webSubs = subscriptions.filter(s => (s.kind ?? 'web') === 'web')
    const expoSubs = subscriptions.filter(s => s.kind === 'expo')

    const expiredIds: string[] = []
    let sent = 0

    // --- Web-Push-Zweig (unverändert; nur der kind-Filter kommt davor) ---
    // data-Feld nur für drive (späteres Deep-Linking, T0.C2). Für alle
    // bestehenden Zweige bleibt der Payload byte-identisch.
    const payload = JSON.stringify({
      title,
      body,
      url: safeUrl,
      tag: type === 'drive' ? `drive-${huntId}` : (groupId || huntId || recipientUserId || 'chat'),
      ...(type === 'drive' ? { data: { huntId, event } } : {}),
    })

    await Promise.allSettled(
      webSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
          sent++
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode
          if (statusCode === 410 || statusCode === 404) {
            // Subscription abgelaufen → aus DB löschen
            expiredIds.push(sub.id as string)
          }
        }
      })
    )

    // --- Expo-Push-Zweig (T0.C1 D6) ---
    // MVP-Schnitt: Wir verarbeiten NUR die Sende-Tickets, KEIN Receipt-Polling.
    // Expo empfiehlt für Zustellgarantie einen zweiten Roundtrip (getPushNotifi-
    // cationReceiptsAsync) samt Persistenz der Ticket-IDs — das ist für den MVP
    // bewusst ausgelassen. DeviceNotRegistered kommt bereits im Ticket zurück
    // und reicht fürs Row-Cleanup (analog zum 410-Muster oben).
    if (expoSubs.length > 0) {
      const expo = new Expo()
      // Token je Subscription-Row auflösen und via isExpoPushToken absichern.
      // Positionsstabiles Mapping Ticket→Row für das gezielte Löschen.
      const targets = expoSubs
        .map((sub) => ({ sub, token: (sub.subscription as { expoPushToken?: string })?.expoPushToken }))
        .filter((t): t is { sub: typeof t.sub; token: string } =>
          typeof t.token === 'string' && Expo.isExpoPushToken(t.token))

      const messages: ExpoPushMessage[] = targets.map(({ token }) => ({
        to: token,
        sound: 'default',
        title,
        body,
        data: type === 'drive' ? { huntId, event } : { url: safeUrl },
      }))

      const chunks = expo.chunkPushNotifications(messages)
      // chunkPushNotifications erhält die Reihenfolge → globaler Offset genügt,
      // um Ticket i zurück auf targets[offset + i] abzubilden.
      let offset = 0
      const chunkMeta = chunks.map((chunk) => {
        const meta = { chunk, offset }
        offset += chunk.length
        return meta
      })

      await Promise.allSettled(
        chunkMeta.map(async ({ chunk, offset }) => {
          try {
            const tickets = await expo.sendPushNotificationsAsync(chunk)
            tickets.forEach((ticket, i) => {
              if (ticket.status === 'ok') {
                sent++
              } else if (ticket.details?.error === 'DeviceNotRegistered') {
                // Gerät abgemeldet → Row löschen (gleiches Muster wie 410 oben).
                expiredIds.push(targets[offset + i].sub.id as string)
              } else {
                // Andere Fehler: loggen, schlucken (Promise.allSettled-Muster).
                console.error('Expo-Ticket-Fehler:', ticket.message, ticket.details)
              }
            })
          } catch (err) {
            // Netzwerk-/Chunk-Fehler: loggen, schlucken.
            console.error('Expo-Chunk-Fehler:', err)
          }
        })
      )
    }

    // Abgelaufene/abgemeldete Subscriptions aufräumen (web 410/404 + expo
    // DeviceNotRegistered).
    if (expiredIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredIds)
    }

    return NextResponse.json({ sent, expired: expiredIds.length })
  } catch (err) {
    console.error('Push-Route Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
