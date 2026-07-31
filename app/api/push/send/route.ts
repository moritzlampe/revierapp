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
    const { huntId, groupId, messageText, isDirect, chatName, url, recipientUserId, kind, type, event, driveName, licenseId } = await request.json()

    // drive-Push (T0.C1) baut den Payload serverseitig fix und braucht daher
    // kein messageText. Für alle bestehenden Zweige bleibt die Pflichtprüfung
    // exakt an dieser Stelle (Cookie-Pfad regressionsfrei).
    // schein-Push (31.07.2026) aus demselben Grund: sein Text entsteht aus
    // Aussteller und Reviername, beide serverseitig aufgelöst — der Absender
    // kann kein Wort davon bestimmen.
    if (type !== 'drive' && type !== 'schein' && !messageText) {
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
    // Nur für den schein-Zweig belegt: der Reviername für den Text.
    let scheinRevier = ''

    if (type === 'schein') {
      // Einladung zu einem Begehungsschein (31.07.2026).
      //
      // Autorisierung spiegelt Migration 079: ausstellen darf nur, wem das
      // Revier gehört. Beides wird hier nachgeprüft und NICHT aus dem Body
      // übernommen — sonst könnte jeder Angemeldete mit einer geratenen
      // Schein-ID eine Benachrichtigung an einen Fremden auslösen.
      if (typeof licenseId !== 'string' || !licenseId) {
        return NextResponse.json({ error: 'licenseId ist Pflicht' }, { status: 400 })
      }
      const { data: schein, error: scheinFehler } = await supabase
        .from('hunting_licenses')
        .select('id, issuer_id, districts!inner ( name, owner_id )')
        .eq('id', licenseId)
        .maybeSingle()
      // Einen DB-Fehler nicht als „nichts gefunden" durchgehen lassen. Ein
      // Tippfehler im Spaltennamen fiele sonst nirgends auf — der Client ist
      // untypisiert —, und der ganze Zweig wäre still tot. (Codex, 31.07.2026)
      if (scheinFehler) {
        console.error('Push-Route schein: Schein nicht lesbar:', scheinFehler)
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
      }
      const revier = schein?.districts as unknown as { name: string; owner_id: string } | undefined
      if (!schein || schein.issuer_id !== senderId || revier?.owner_id !== senderId) {
        return NextResponse.json({ ok: true })
      }
      scheinRevier = revier?.name ?? ''

      // Wer die Einladung sehen darf, entscheidet die DB — zeichengleich mit
      // meine_einladungen() (080), damit der Push nichts ankündigt, was die App
      // dann nicht zeigt. NULL heisst: keine offene Einladung, kein bestaetigtes
      // Konto zu der Adresse, oder zwei Konten, die sich nur in der
      // Schreibweise unterscheiden.
      const { data: empfaenger, error: rpcFehler } = await supabase.rpc('schein_empfaenger', {
        p_license_id: licenseId,
      })
      // Fehlendes EXECUTE oder eine umbenannte Funktion sähen sonst exakt aus
      // wie „diese Adresse hat kein Konto" — der Zweig wäre stumm kaputt, und
      // zwar auf die eine Art, die niemandem auffällt. (Codex, 31.07.2026)
      if (rpcFehler) {
        console.error('Push-Route schein: Empfänger nicht auflösbar:', rpcFehler)
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
      }
      if (!empfaenger) {
        // Dieselbe Antwort wie bei Erfolg: der Aussteller soll aus dem Ergebnis
        // nicht ablesen können, ob zu einer eingetippten Adresse ein Konto
        // existiert. Er hat die Adresse selbst gewählt; das Formular zeigt ihm
        // den Code als Rückfallweg ohnehin an.
        return NextResponse.json({ ok: true })
      }
      recipientUserIds = [empfaenger as string]
    } else if (type === 'drive') {
      // Treiben-Push (T0.C1 D4): gleiche Empfänger wie der Jagd-Chat — zugesagte
      // Teilnehmer der Jagd, Sender rausgefiltert. Der Sender muss selbst
      // zugesagter Teilnehmer sein (Spoofing-Schutz, wie im Jagd-Chat-Zweig).
      if (!huntId || (event !== 'started' && event !== 'ended' && event !== 'reopened') || typeof driveName !== 'string' || !driveName.trim()) {
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

    // Sender rausfiltern (keine Benachrichtigung an sich selbst).
    //
    // Ausnahme schein: dort ist der Empfänger nicht aus einer Mitgliedermenge
    // abgeleitet, sondern eine Adresse, die der Aussteller bewusst eingetippt
    // hat. Schreibt er seine eigene hin, hat er genau das gemeint — und liest
    // sie auf einem anderen Gerät als dem, an dem er sie eingetragen hat. Der
    // Grund für die Regel (man schaut ohnehin schon auf den Bildschirm, auf dem
    // es passiert) trifft hier nicht zu.
    if (type !== 'schein') {
      recipientUserIds = recipientUserIds.filter(id => id !== senderId)
    }

    if (recipientUserIds.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    // Push-Subscriptions aller Empfänger laden (inkl. kind für die web/expo-Partition)
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, subscription, kind')
      .in('user_id', recipientUserIds)

    if (!subscriptions || subscriptions.length === 0) {
      // Diese Stelle erreicht ein schein-Request, sobald der Eingeladene zwar
      // ein Konto hat, aber kein Gerät — und genau die beiden Fälle „Konto ohne
      // Gerät" und „kein Konto" dürfen sich nicht unterscheiden lassen.
      // Dieselbe Antwort wie am Ende der Funktion.
      return NextResponse.json(type === 'schein' ? { ok: true } : { sent: 0 })
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
      // Treiben: feste Texte je Event (kein Freitext, keine Emojis, bewusst
      // kurz und ohne Treiben-Name). event ist oben validiert.
      if (event === 'started') {
        title = 'Angeblasen'
        body = 'Treiben startet – Weidmannsheil!'
      } else if (event === 'ended') {
        title = 'Treiben beendet'
        body = 'Hahn in Ruh'
      } else if (event === 'reopened') {
        title = "Weiter geht's"
        body = 'Zurück auf die Stände.'
      } else {
        // Defensiver Fallback: sollte durch die Event-Validierung oben nie greifen.
        title = 'Treiben'
        body = 'Statusänderung im Treiben.'
      }
    } else if (type === 'schein') {
      // Fester Text, gebaut aus zwei serverseitig aufgelösten Angaben. Der
      // Reviername gehört hinein: ohne ihn steht auf dem Sperrbildschirm eine
      // Einladung, von der man nicht weiss, wohin. Ihn zu nennen gibt nichts
      // preis — der Aussteller hat diesen Menschen gerade dorthin eingeladen.
      title = 'Begehungsschein'
      const wer = displayName || 'Jemand'
      body = scheinRevier
        ? `${wer} hat dir einen Begehungsschein für ${scheinRevier} ausgestellt.`
        : `${wer} hat dir einen Begehungsschein ausgestellt.`
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
    // Für schein gar nicht erst aus dem Body: das Ziel steht fest, und was
    // feststeht, soll der Aufrufer nicht bestimmen können.
    const safeUrl =
      type === 'schein'
        ? '/app/du'
        : typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')
          ? url
          : '/'

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
      // Eigener tag je Schein: zwei Einladungen sollen nebeneinander stehen und
      // sich nicht gegenseitig ersetzen — ohne ihn fielen beide auf 'chat'.
      tag: type === 'drive'
        ? `drive-${huntId}`
        : type === 'schein'
          ? `schein-${licenseId}`
          : (groupId || huntId || recipientUserId || 'chat'),
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

    // Für schein NIE die Zahlen: `sent` und `expired` verraten sonst, ob zu
    // einer eingetippten Adresse ein bestätigtes Konto mit Gerät gehört — der
    // Aussteller könnte Adressen durchprobieren und es an der Antwort ablesen.
    // (Codex, 31.07.2026: der Zweig war trotz der Absicht im Kommentar noch
    // ein Orakel, weil ganz am Ende doch die Zahlen zurückgingen.)
    //
    // Was das NICHT schließt: den Zeitkanal. Mit Empfänger läuft eine
    // Subscription-Abfrage und womöglich ein Aufruf nach draußen, ohne
    // Empfänger nicht. Dagegen hülfe nur eine Outbox — bewusst nicht gebaut:
    // wer so misst, braucht ein eigenes Revier UND hinterlässt je Versuch eine
    // Schein-Zeile. Der Aufwand steht in keinem Verhältnis zur Auskunft
    // „diese Adresse hat ein Konto".
    if (type === 'schein') {
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ sent, expired: expiredIds.length })
  } catch (err) {
    console.error('Push-Route Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
