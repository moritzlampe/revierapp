import { NextResponse } from 'next/server'
import { darfPushEmpfangen } from '@/lib/push/stummschaltung'
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
//
// ⚠ `error` MUSS geprüft werden, und das ist hier kein Formalismus
// (Schlusslesung 07.09.2026, F1). Ohne die Prüfung wird jeder DB-Fehler zur
// leeren Liste; beide Aufrufer schliessen daraus „der Absender gehört nicht
// dazu" und antworten `200 { sent: 0 }`. Ein PostgREST-Aussetzer oder eine
// umbenannte Spalte legte damit Treiben- UND Jagd-Chat-Push still — und zwar
// **stumm**: der Client sendet fire-and-forget und loggt selbst im `__DEV__`
// nur bei `!antwort.ok` (`src/lib/push/send.ts:47`), und 200 ist ok.
// Der Wurf landet im äusseren `catch` der Route (→ 500 samt Log). Damit gilt
// für den ganzen Zweig, was der Kommentar an der Berechtigungsprüfung unten
// verspricht: laut scheitern, nicht stumm sperren (S1/S4).
async function resolveJoinedParticipantIds(
  supabase: ServiceClient,
  huntId: string,
): Promise<string[]> {
  const { data: participants, error } = await supabase
    .from('hunt_participants')
    .select('user_id')
    .eq('hunt_id', huntId)
    .eq('status', 'joined')
    .not('user_id', 'is', null)
  if (error) {
    throw new Error(`Teilnehmer der Jagd ${huntId} nicht lesbar: ${error.message}`)
  }
  return (participants || []).map((p) => p.user_id as string)
}

/**
 * Entfernt die Empfänger, die DIESEN Chat für sich stummgeschaltet haben
 * (CN-201, Migration 127).
 *
 * **Warum der Filter hier steht und nicht im Client:** der Push wird
 * fire-and-forget vom Gerät ausgelöst, die Empfängerliste baut aber diese
 * Route. Ein Riegel im Client wäre einer, den jeder alte Build und die PWA
 * umgehen.
 *
 * **Warum er eine EIGENE Lesung ist und nicht ein Feld in der
 * Mitgliederabfrage oben:** jene Abfrage (`chat_group_members`) prüft ihren
 * `error` nicht — ein Fehler wird dort zur leeren Liste und damit zu
 * `200 { sent: 0 }`. Wer `stumm` dort mit hineinzöge, machte aus einem
 * Spaltenfehler einen still toten Gruppen-Push. Genau umgekehrt zur Absicht.
 * (Bauplan-Schlusslesung 19.09.2026, B4.)
 *
 * **Im Zweifel wird GESENDET.** Das ist kein Widerspruch zum drive-Zweig
 * weiter unten, der bei einem Lesefehler laut scheitert, sondern dasselbe
 * Prinzip mit anderer sicherer Voreinstellung: dort schützt der Fehlschlag
 * vor einem unbefugten „Hahn in Ruh", hier kostet er eine verpasste Meldung
 * am Jagdtag. Ein Lesefehler darf sich nie als gültige Auskunft „ist stumm"
 * lesen (S4).
 * ⛔ Wer das je „vereinheitlicht", dreht eine Entscheidung um, nicht einen
 *    Schönheitsfehler.
 */
async function filterStummgeschaltete(
  supabase: ServiceClient,
  gruppeId: string,
  senderId: string,
  empfaenger: string[],
): Promise<string[]> {
  if (empfaenger.length === 0) return empfaenger

  const { data: stumme, error: stummFehler } = await supabase
    .from('chat_stummschaltungen')
    .select('besitzer_id')
    .eq('group_id', gruppeId)
    .in('besitzer_id', empfaenger)

  if (stummFehler) {
    console.error('[CN-201] Stummschaltungen nicht lesbar, sende an alle:', stummFehler)
    return empfaenger
  }

  // ⛔ NUR die EXISTENZ der Zeile zählt, nie der Wert von `stumm_seit` —
  //    der käme vom Gerät, wenn ein Client ihn mitschickt (126, Falle 5).
  const stummIds = new Set((stumme || []).map((z) => z.besitzer_id as string))
  if (stummIds.size === 0) return empfaenger

  // Die Jagd DIESER Gruppe — aus der bereits autorisierten `gruppeId`,
  // NIEMALS aus dem `huntId` des Request-Bodys.
  //
  // ⛔ Der Body trägt bei der PWA immer beide Felder und nativ zusätzlich eine
  //    Sprung-Jagd. Wer den Leiter-Check mit dem Body-Wert baut, lässt den
  //    ABSENDER die Jagd wählen, an der er Jagdleiter ist — und hebelt den
  //    Riegel unten durch die Vordertür aus.
  const { data: gruppe, error: gruppeFehler } = await supabase
    .from('chat_groups')
    .select('hunt_id')
    .eq('id', gruppeId)
    .maybeSingle()

  if (gruppeFehler) {
    console.error('[CN-201] Chatgruppe nicht lesbar, sende an alle:', gruppeFehler)
    return empfaenger
  }

  const jagdDerGruppe = gruppe?.hunt_id as string | null | undefined
  if (!jagdDerGruppe) {
    // Freie Gruppe oder Direktchat: es gibt keinen Jagdleiter, der etwas
    // durchbrechen könnte. Der Schalter wirkt voll.
    return empfaenger.filter((id) => !stummIds.has(id))
  }

  const [
    { data: jagd, error: jagdFehler },
    { data: teilnehmer, error: teilnehmerFehler },
  ] = await Promise.all([
    supabase
      .from('hunts')
      .select('creator_id, district_id')
      .eq('id', jagdDerGruppe)
      .maybeSingle(),
    supabase
      .from('hunt_participants')
      .select('user_id, role, status')
      .eq('hunt_id', jagdDerGruppe)
      .not('user_id', 'is', null),
  ])

  if (jagdFehler || teilnehmerFehler) {
    console.error('[CN-201] Jagdrollen nicht lesbar, sende an alle:', jagdFehler ?? teilnehmerFehler)
    return empfaenger
  }

  // ⛔ EINE JAGD OHNE REVIER GEWÄHRT KEINE AUSNAHMEN.
  //
  // `hunts.district_id` ist nullable, und `hunt_revier_muss_erlaubt_sein`
  // (092) gibt bei NULL sofort `return new` zurück — eine Jagd ohne Revier
  // darf also JEDER anlegen, ohne Besitz und ohne Begehungsschein. Wer den
  // Durchstich daran hinge, hinge ihn an einen Titel, den man sich in drei
  // Sekunden selbst ausstellt (Fremdprüfung 19.09.2026, F1 `[high]`).
  //
  // Mit Revier greift 092: die Jagd verlangt Revierbesitz oder einen gültigen
  // Schein. Das ERHÖHT die Kosten — es schliesst den Weg nicht.
  //
  // ⚠ Hier stand „die erste Bedingung, die der Absender NICHT selbst
  //   herstellen kann". **Falsch, gefunden von der Schlusslesung am
  //   19.09.2026:** `districts_owner_all` lässt jeden ein Revier anlegen
  //   (`owner_id = auth.uid()`, kein Trigger). Wer eines anlegt, legt darauf
  //   eine Jagd an, schreibt sein Opfer per REST als `joined` hinein
  //   (`participants_creator_all` hat kein `with_check`) und hängt einen Chat
  //   daran — Riegel 3 erlaubt das, es ist ja seine eigene Jagd.
  //
  // **Die Wurzel ist nicht das Revier, sondern `joined`:** solange ein
  // Jagdersteller fremde Teilnehmerzeilen auf `joined` setzen darf, ist
  // „beigetreten" keine Zustimmung, sondern eine Behauptung — und jeder
  // Riegel, der darauf baut, ist nur so stark wie dessen Wohlverhalten.
  // Das ist vorbestehend und liegt als **CN-203** im Backlog.
  //
  // Was diese Bedingung trotzdem leistet: sie macht aus einem Klick einen
  // Ablauf aus vier Schritten mit REST-Zugriff und Vorsatz, und sie hält die
  // erfundene leere Jagd draussen. Der Schaden bleibt Belästigung in einer
  // Gruppe, der man freiwillig angehört — keine Datenoffenlegung.
  //
  // **Der Preis ist gemessen und liegt bei null:** von 7 reviersosen Jagden im
  // Bestand sind 6 Einzeljagden (`kind='solo'`) mit genau einem Teilnehmer und
  // ohne Chat; die siebte ebenso einteilig. Ein Mehrpersonen-Jagdchat ohne
  // Revier existiert nicht — und in einer Einzeljagd gibt es niemanden, den
  // ein Jagdleiter durchstechen müsste.
  if (!jagd?.district_id) {
    return empfaenger.filter((id) => !stummIds.has(id))
  }

  // „Jagdleiter" ist Rolle ODER Ersteller — beides zusammen, wie im
  // drive-Zweig weiter unten und aus demselben Grund: ein reiner Rollencheck
  // nähme dem Jagdersteller den eigenen legitimen Push.
  const leiter = new Set<string>()
  const beigetreten = new Set<string>()
  for (const t of teilnehmer || []) {
    if (t.status !== 'joined') continue
    const uid = t.user_id as string
    beigetreten.add(uid)
    if (t.role === 'jagdleiter') leiter.add(uid)
  }
  if (jagd?.creator_id) leiter.add(jagd.creator_id as string)

  const absenderIstLeiter = leiter.has(senderId)

  return empfaenger.filter((id) =>
    darfPushEmpfangen({
      istStumm: stummIds.has(id),
      empfaengerIstLeiter: leiter.has(id),
      absenderIstLeiter,
      empfaengerIstJagdteilnehmer: beigetreten.has(id),
    }),
  )
}

export async function POST(request: Request) {
  try {
    const { huntId, groupId, messageText, isDirect, chatName, url, recipientUserId, kind, type, event, driveName, licenseId, sprungHuntId, sprungAnblickId } = await request.json()

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
    // Nur für den Gruppen-/Direktchat belegt, und ZWINGEND erst NACH der
    // Mitgliedschaftsprüfung (Codex, 18.08.2026, [medium]). Der erste Entwurf
    // las im Expo-Payload unten stattdessen die rohe Body-Eigenschaft
    // `groupId` — die steht dem Aufrufer aber frei, auch wenn ihn ein ganz
    // anderer Zweig autorisiert hat. Ein RSVP-Aufruf mit zusätzlich
    // mitgeschicktem `groupId` hätte damit eine Meldung „Hans hat zugesagt"
    // erzeugt, die den Empfänger beim Antippen in eine fremde Gruppe schickt —
    // dieselbe Wurzel wie 076/079/083 in AGENTS.md: **eine Entscheidung aus
    // einem Feld ableiten, das der Aufrufer schreibt, statt aus dem Zweig, der
    // die Berechtigung geprüft hat.**
    let chatGruppeId: string | null = null
    // Die Chatgruppe, gegen die CN-201 filtert.
    //
    // ⚠ BEWUSST NICHT `chatGruppeId` wiederverwendet: die steuert weiter unten
    //    den Expo-Deep-Link (`{ type: 'chat', groupId }`). Sie auch im
    //    huntId-Zweig zu setzen änderte das Antipp-Verhalten und die
    //    Vordergrund-Unterdrückung der PWA-Jagdchat-Pushes — eine
    //    Nebenwirkung, die niemand bestellt hat.
    let stummGruppeId: string | null = null

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
      // Teilnehmer der Jagd, Sender rausgefiltert.
      //
      // `driveName` wird geprüft, aber NICHT in den Payload übernommen: die
      // Texte unten stehen fest je Event (s. dort, „kein Freitext"). Die
      // Prüfung bleibt trotzdem stehen, weil sie Teil des Aufrufvertrags mit
      // den Clients ist — der Absender kann kein Wort der Meldung bestimmen.
      if (!huntId || (event !== 'started' && event !== 'ended' && event !== 'reopened') || typeof driveName !== 'string' || !driveName.trim()) {
        return NextResponse.json({ error: 'Ungültige Treiben-Anfrage' }, { status: 400 })
      }
      recipientUserIds = await resolveJoinedParticipantIds(supabase, huntId)
      if (!recipientUserIds.includes(senderId)) {
        return NextResponse.json({ sent: 0 })
      }

      // **Zugesagter Teilnehmer zu sein genügt NICHT** (Security-Review
      // 07.09.2026, SR-02). Bis hierher stand genau diese Prüfung, übernommen
      // aus dem Jagd-Chat-Zweig — dort ist sie richtig: eine Chatnachricht
      // trägt den Namen ihres Absenders, und wer im Chat sein darf, darf
      // reden. „Treiben beendet / Hahn in Ruh" trägt dagegen die **Autorität
      // des Jagdleiters**: Waffe entladen, Stand verlassen. Ein gewöhnlicher
      // Schütze konnte sie an alle übrigen Teilnehmer auslösen.
      //
      // Dieselbe Wurzel wie 076/079/083 in AGENTS.md, eine Ebene höher: eine
      // Prüfung, die für EINE Nachrichtenklasse ausreicht, wurde auf eine
      // andere kopiert, für die sie zu schwach ist.
      //
      // Der berechtigte Kreis wird nicht neu erfunden, sondern von den
      // Policies abgeschrieben, die den Zustandswechsel tatsächlich erlauben —
      // das Push-Gate spiegelt das Schreib-Gate (S2):
      //   `hunt_drives_leader_all`     → Rolle 'jagdleiter' UND Status 'joined' (089)
      //   `hunt_drives_creator_update` → hunts.creator_id
      // **Ein reiner Rollencheck wäre ZU ENG** und nähme dem Jagdersteller den
      // eigenen legitimen Push. Der Review empfiehlt „Jagdleiter-/Erstellerberechtigung",
      // beides zusammen, und das deckt sich mit den Policies.
      //
      // Der Client hier ist Service-Role — RLS trägt an dieser Stelle NICHTS,
      // jede Bedingung muss ausgeschrieben stehen.
      const [
        { data: leiterZeile, error: leiterFehler },
        { data: jagdZeile, error: jagdFehler },
      ] = await Promise.all([
        supabase
          .from('hunt_participants')
          .select('id')
          .eq('hunt_id', huntId)
          .eq('user_id', senderId)
          .eq('status', 'joined')
          .eq('role', 'jagdleiter')
          .maybeSingle(),
        supabase.from('hunts').select('creator_id').eq('id', huntId).maybeSingle(),
      ])
      // Ein Ladefehler darf sich NIE als „nicht berechtigt" lesen (S4, und
      // dasselbe Muster wie im schein-Zweig oben): ein Tippfehler im
      // Spaltennamen sähe sonst exakt aus wie ein abgewiesener Angreifer, und
      // der ganze Treiben-Push wäre still tot — auf die eine Art, die
      // niemandem auffällt. Laut scheitern, nicht stumm sperren.
      if (leiterFehler || jagdFehler) {
        console.error('Push-Route drive: Berechtigung nicht lesbar:', leiterFehler ?? jagdFehler)
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
      }
      if (!leiterZeile && jagdZeile?.creator_id !== senderId) {
        // Stumme Erfolgsantwort wie in den anderen Zweigen: der Aufrufer soll
        // aus dem Ergebnis nichts über fremde Jagden ablesen können.
        return NextResponse.json({ sent: 0 })
      }

      // Zweitens: das gemeldete Ereignis muss überhaupt stattgefunden haben.
      // Der Client sendet den Push NACH der Mutation, der Zustand steht also
      // schon in der DB. `hunt_drives_one_active_per_hunt` (partieller
      // Unique-Index) lässt je Jagd höchstens EIN aktives Treiben zu — der
      // Abgleich ist damit eindeutig, ganz ohne Treiben-ID. Das ist der Grund,
      // warum dieser Fix **keinen neuen nativen Build braucht**: der Client
      // schickt nur `{ type, huntId, event, driveName }`, keine ID.
      //
      // ⚠ Ein passender Status allein belegt NICHT den gemeldeten Wechsel —
      // nur, dass *ein* Ereignis dieser Art vorliegt. Daraus folgt eine Race,
      // die die Fremdprüfung am 07.09.2026 als F1 [high] gefunden hat und die
      // **schon vor diesem Fix bestand** (vorher gab es gar keinen Abgleich):
      //
      //   Gerät A beendet Treiben A → sein Push-Request verzögert sich
      //   → Leiter startet Treiben B, dessen Start-Push kommt zuerst an
      //   → der verspätete `ended`-Request findet A weiterhin `completed`
      //   → „Hahn in Ruh" geht raus, WÄHREND B läuft.
      //
      // Das braucht keinen Angreifer, nur ein Funkloch. Und es ist genau der
      // Schaden, gegen den SR-02 schützt: Teilnehmer entladen und verlassen
      // den Stand, während geschossen wird. Der partielle Unique-Index hilft
      // nicht — er verbietet zwei AKTIVE Treiben, nicht `completed` A neben
      // `active` B.
      //
      // **Der Riegel ist die Bedeutung der Meldung selbst, keine Heuristik:**
      // „Hahn in Ruh" heisst „es läuft nichts mehr". Läuft ein Treiben, ist
      // die Ansage falsch — unabhängig davon, welches endete. Also: `ended`
      // sendet nur, wenn **zum Lesezeitpunkt dieser Zeile** kein Treiben
      // aktiv ist.
      //
      // ⚠ „Zum Lesezeitpunkt" ist wörtlich zu nehmen (Schlusslesung
      // 07.09.2026, F2). Zwischen diesem Read und dem tatsächlichen Versand
      // weiter unten bleibt ein Restfenster: `run()` gibt nach `await
      // endDrive` sofort frei, der Leiter kann in derselben Sekunde B
      // starten. Dann geht „Hahn in Ruh" hinaus, obwohl B beim Zustellen
      // schon läuft — und auf dem Web-Weg ersetzt `tag: drive-<huntId>` die
      // ältere Meldung, es gewinnt also die zuletzt ZUGESTELLTE, nicht die
      // zuletzt gesendete. Das Fenster schliesst auch die von der
      // Fremdprüfung empfohlene Outbox nicht: sie ordnete das Senden, nicht
      // die Zustellung.
      // Ein legitimer Fall geht dabei nicht verloren: das Sheet zeigt „Hahn in
      // Ruh" nur bei `status === 'active'` (`DrivesSheet.tsx:332-334`) und
      // sperrt den Start, solange eines läuft (`:300`) — nach einem regulären
      // Ende ist nie etwas aktiv, und der Push folgt erst auf das `await`.
      //
      // Bewusst NICHT gebaut: die von der Fremdprüfung empfohlene monotone
      // Ereignisversion je Jagd samt Outbox. Sie löst die allgemeine
      // Ordnung von Ereignissen; hier hat der Schaden genau eine Form, und
      // die deckt eine Bedingung ab. Nötig wird sie, sobald die Meldung das
      // Treiben BENENNT — dann trägt sie eine Aussage, die nur zu einem
      // bestimmten Wechsel wahr ist.
      // Ebenfalls bewusst kein Zeitfenster gegen Wiederholung: nach der
      // Berechtigungsprüfung sendet nur, wer die Ansage ohnehin machen darf.
      // Ein Fenster verlöre die legitime Meldung eines kurz offline
      // gewesenen Geräts — bei „Hahn in Ruh" der falsche Tausch.
      const { data: treiben, error: treibenFehler } = await supabase
        .from('hunt_drives')
        .select('status')
        .eq('hunt_id', huntId)
      if (treibenFehler) {
        console.error('Push-Route drive: Treiben nicht lesbar:', treibenFehler)
        return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
      }
      const treibenListe = treiben ?? []
      const laeuftEines = treibenListe.some((t) => t.status === 'active')
      const gemeldeterWechselPlausibel =
        event === 'ended'
          ? !laeuftEines && treibenListe.some((t) => t.status === 'completed')
          : laeuftEines
      if (!gemeldeterWechselPlausibel) {
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
      // Ab hier ist belegt, dass der Absender Mitglied dieser Gruppe ist.
      chatGruppeId = groupId
      stummGruppeId = groupId
    } else if (huntId) {
      // Jagd-Chat: nur ZUGESAGTE Teilnehmer (status='joined') mit user_id.
      // invited-User sind nicht im Hunt-Chat und dürfen keine Push-Vorschau
      // der Chat-Nachricht bekommen (Sprint B Privacy-Fix). Der Sender muss
      // selbst zugesagter Teilnehmer sein.
      recipientUserIds = await resolveJoinedParticipantIds(supabase, huntId)
      if (!recipientUserIds.includes(senderId)) {
        return NextResponse.json({ sent: 0 })
      }
      // CN-201: Auch dieser Weg muss durch den Stummschaltungs-Filter.
      //
      // ⛔ Er sieht tot aus und ist es nicht. Gemessen am 19.09.2026: 216 von
      //    216 Nachrichten tragen `group_id`, keine einzige `hunt_id` — der
      //    Zweig wird also nicht benutzt. Erreichbar ist er trotzdem: die
      //    PWA-Jagdseite rendert ihren Chat-Tab ohne `groupId`, und ein
      //    zugesagter Teilnehmer erreicht ihn auch per `curl`.
      //    Eine Nutzungszahl belegt keine Unerreichbarkeit; ein Riegel, den
      //    ein zweiter Weg umgeht, ist für den Nutzer keiner.
      //
      // Die Gruppe wird aus der Jagd aufgelöst, nicht umgekehrt.
      //
      // ⚠ **Die Eindeutigkeit kommt aus Migration 127**, nicht aus dieser
      //    Abfrage: `chat_groups_eine_gruppe_je_jagd` lässt genau eine Gruppe
      //    je Jagd zu. Ohne ihn konnte ein gewöhnlicher Teilnehmer eine
      //    ZWEITE Gruppe mit derselben `hunt_id` und einem früheren
      //    `created_at` anlegen — der Filter hätte dann die vorgeschobene
      //    Gruppe genommen, dort keine Stummschaltungen gefunden und an alle
      //    gesendet (Fremdprüfung 19.09.2026, F2).
      //    `limit(1)` bleibt als Gürtel neben dem Hosenträger stehen: vor dem
      //    Applizieren von 127 ist die Annahme nicht durchgesetzt.
      const { data: jagdGruppe, error: jagdGruppeFehler } = await supabase
        .from('chat_groups')
        .select('id')
        .eq('hunt_id', huntId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (jagdGruppeFehler) {
        console.error('[CN-201] Jagd-Chatgruppe nicht auflösbar, sende ungefiltert:', jagdGruppeFehler)
      } else {
        stummGruppeId = (jagdGruppe?.[0]?.id as string | undefined) ?? null
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

    // CN-201: stummgeschaltete Empfänger entfernen.
    //
    // Der Filter sitzt NACH dem Sender-Filter (ein Absender bekommt ohnehin
    // nichts) und VOR der Leerprüfung darunter — sonst liefe die Route mit
    // einer Liste weiter, die nach dem Filtern leer ist.
    // `stummGruppeId` ist nur in den beiden Chat-Zweigen gesetzt; `schein`,
    // `drive` und `rsvp` sind damit per Konstruktion unberührt.
    if (stummGruppeId) {
      recipientUserIds = await filterStummgeschaltete(
        supabase,
        stummGruppeId,
        senderId,
        recipientUserIds,
      )
    }

    // **Ab hier darf die Antwort nicht mehr verraten, WIE VIELE erreicht
    // wurden** — sonst wird die private Stummschaltung aus der Versandzahl
    // ableitbar (Fremdprüfung 19.09.2026, F3).
    //
    // Der Fall ist im Direktchat scharf: dort bleibt nach dem Senderfilter
    // genau EIN Empfänger. Hat der stummgeschaltet, endet die Route mit
    // `{ sent: 0 }`; sonst mit einer Zahl. Wer die Gegenseite kennt und weiss,
    // dass ihr Gerät angemeldet ist, liest daraus genau die Einstellung, die
    // Migration 127 gerade in eine eigene Tabelle gelegt hat, damit niemand
    // sie sieht. **Ein Riegel, der die Antwort ungeschützt lässt, verlegt das
    // Leck nur.**
    //
    // Das Muster ist nicht neu: `type === 'schein'` antwortet aus demselben
    // Grund seit je neutral (s. unten). Hier kommt der Chat dazu.
    const verbirgtVersand = type === 'schein' || stummGruppeId !== null

    if (recipientUserIds.length === 0) {
      return NextResponse.json(verbirgtVersand ? { ok: true } : { sent: 0 })
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
      return NextResponse.json(verbirgtVersand ? { ok: true } : { sent: 0 })
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
      // ⛔ **Hier stand am 16.09.2026 für eine Stunde ein Flag
      // `systemMeldung`, das den Absendernamen weglässt (CN-163) — es ist
      // wieder ausgebaut, und der Grund gehört hierher, weil der nächste
      // Anlauf sonst denselben Weg nimmt.**
      //
      // Der Zweck war richtig: Anblick- und Erlegungsmeldungen sind im Chat
      // bewusst namenlose Systemzeilen (Entscheidung 14.09.2026), und der
      // Push stellte den Namen wieder her — „Johann: Anblick – 1x Keiler" um
      // 10:02 und „Johann: Neue Erlegung – 1x Keiler" um 10:05 ist genau die
      // Korrelation, gegen die die Namenlosigkeit gebaut wurde.
      //
      // **Der Preis war zu hoch, und eine Fremdprüfung hat ihn benannt
      // (`[high]`):** ohne den Namen fehlt die Zuordnung, und `chatName` wie
      // `messageText` sind Freitext vom Client. Ein gewöhnliches
      // Gruppenmitglied konnte damit `chatName: 'Treiben beendet'` und
      // `messageText: 'Hahn in Ruh'` senden und die sicherheitsrelevante
      // Ansage des geschützten `drive`-Zweigs nachahmen. **Das ist SR-02 aus
      // dem Security-Review vom 07.09.2026, auf einem zweiten Weg wieder
      // geöffnet** — neun Tage, nachdem er geschlossen wurde.
      //
      // **Der naheliegende Riegel trägt nicht:** den Text serverseitig aus
      // der `messages`-Zeile holen statt vom Client. Solange SR-01 offen ist
      // (`messages_insert_member` prüft den Absender nicht), kann ein
      // Mitglied sich die passende `kill_report`-Zeile selbst schreiben. Der
      // Angriff würde dadurch nur sichtbar, nicht unmöglich.
      //
      // **Was es bräuchte:** die Bindung an ein serverseitig geprüftes
      // Ereignis in `wild_events`/`kills` samt Gruppenzuordnung — ein
      // eigener Bau, keine Zeile in diesem Zweig. Bis dahin trägt der Push
      // den Namen.
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

      // Sprungziel für die native App: aus einer Anblick-/Erlegungsmeldung
      // soll der Tipp auf die Meldung führen, nicht nur in den Chat.
      //
      // **Die Felder heissen bewusst `sprungHuntId`/`sprungAnblickId` und
      // nicht `huntId`/`anblickId`, und das ist der Kern, nicht Kosmetik:**
      // der Rumpf trägt bereits ein `huntId`, und das steuert oben die
      // EMPFÄNGERERMITTLUNG (`else if (huntId)` →
      // `resolveJoinedParticipantIds`). Ein zweites, gleichnamiges Feld wäre
      // heute folgenlos, weil `else if (groupId)` davorsteht und zuerst
      // greift — aber das ist eine stille Abhängigkeit von der Reihenfolge
      // zweier `else if`. Wer sie einmal umsortiert, ändert unbemerkt den
      // Empfängerkreis eines Chat-Pushes. Ein eigener Feldname kann das
      // konstruktiv nicht — dieselbe Wurzel wie bei `chatGruppeId` oben.
      //
      // Deshalb werden die beiden Felder AUSSCHLIESSLICH hier durchgereicht:
      // nicht für Empfänger, nicht für Berechtigungen, nicht für `safeUrl`.
      // Und nur vollständig oder gar nicht — ein halbes Ziel wäre ein Sprung
      // ins Leere, und die App verlangt ohnehin beide (`src/lib/push/tap.ts`).
      // Ein alter Build, der nichts davon schickt, bekommt exakt das `data`
      // von heute.
      // ⚠ **Die Route prüft NICHT, ob der Anblick einen Ort hat oder zu
      // dieser Gruppe gehört** (Fremdprüfung 16.09.2026, F2/Q2) — das tut
      // der Client, der beides weiss (`KillCaptureSheet`, `ortLiegtVor`).
      // **Die Grenze ist benannt und hingenommen:** ein lügender Client
      // erzeugt damit einen Sprung, der auf der Karte kein Ziel findet. Das
      // ist ärgerlich und kein Leck — die App prüft beim Öffnen ohnehin
      // gegen RLS, ein fremder Anblick wird dort nicht sichtbar. Ein Query
      // gegen `wild_events` an dieser Stelle wäre der vollständige Riegel
      // und kostet einen Roundtrip auf jedem Anblick-Push.
      const sprungZiel =
        typeof sprungHuntId === 'string' && sprungHuntId !== '' &&
        typeof sprungAnblickId === 'string' && sprungAnblickId !== ''
          ? { huntId: sprungHuntId, anblickId: sprungAnblickId }
          : null

      const messages: ExpoPushMessage[] = targets.map(({ token }) => ({
        to: token,
        sound: 'default',
        title,
        body,
        // Für schein zusätzlich das WAS, nicht nur das WO: die native App
        // ordnet `type` selbst einem Bildschirm zu (`src/lib/push/tap.ts`).
        // `url` ist der PWA-Pfad und taugt dafür nicht — Route-Namen der
        // iOS-App gehören nicht in eine Next.js-Datei.
        //
        // Für den Gruppen-/Direktchat dasselbe (nativ Paket 3, 18.08.2026):
        // `type: 'chat'` plus die `groupId` als Parameter. Die native App
        // springt damit in genau den Chat, aus dem die Nachricht kam, statt
        // dort aufzugehen, wo sie zuletzt stand. Die `groupId` dient ihr
        // ausserdem dazu, die Meldung stumm zu halten, während dieser Chat
        // offen auf dem Bildschirm steht.
        //
        // **Der Web-Zweig oben bleibt unberührt** — dieses `data` gilt nur für
        // Expo-Empfänger; Web-Push navigiert weiterhin über `url`.
        data:
          type === 'drive'
            ? { huntId, event }
            : type === 'schein'
              ? { type: 'schein', url: safeUrl }
              : chatGruppeId
                ? { type: 'chat', groupId: chatGruppeId, url: safeUrl, ...(sprungZiel ?? {}) }
                : { url: safeUrl },
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
    if (verbirgtVersand) {
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ sent, expired: expiredIds.length })
  } catch (err) {
    console.error('Push-Route Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
