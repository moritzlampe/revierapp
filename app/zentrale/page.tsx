import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geladen, vollstaendig } from './laden'
import { Kennzahl } from './kennzahl'
import { FRIST_TAGE, laeuftBaldAb } from './handlungsbedarf'
import { alsPruefungen, inDieserSaison, istWartbar, type PruefZeile } from './wartung'
import { getJagdjahr } from '@/lib/diary/season'
import { typLabel } from './objekte'
// `alsDatum` und nicht `terminText`: `valid_until` ist ein `date`, kein
// `timestamptz`. Der Unterschied ist im Repo schon einmal danebengegangen
// (Fremdprüfung 04.08.2026 an `kontakte.inaktiv_seit`) und in `scheine.ts` bei
// `alsBerlinDatum` ausführlich begründet.
import { alsBerlinDatum, alsDatum, alsStatus, effektiverStatus } from './jagderlaubnisse/scheine'
// Statt eines zweiten Intl-Formatters daneben: `terminText(…, false)` ist
// bereits das Datum ohne Uhrzeit in Berliner Zeit. Der Endtermin einer
// mehrtägigen Jagd ist ein Tag, keine Feierabendzeit (Migration 095).
import { mehrtaegig, terminText } from './jagden/jagden'

// Die Jagdart steckt in hunts.type, NICHT in hunts.kind (das kennt nur
// group/solo). Alle vier Werte werden getragen, auch die heute ungenutzten
// (Konzept §4.3).
const JAGDART: Record<string, string> = {
  ansitz: 'Ansitz',
  pirsch: 'Pirsch',
  drueckjagd: 'Drückjagd',
  erntejagd: 'Erntejagd',
}

const JAGDSTATUS: Record<string, string> = {
  draft: 'Entwurf',
  scheduled: 'Geplant',
  active: 'Läuft',
  paused: 'Pausiert',
  completed: 'Beendet',
  auto_completed: 'Beendet',
}

// Fest auf Berlin: der Container läuft in UTC, sonst stünde eine 07:15-Jagd
// im Sommer als 05:15 in der Liste.
const datumZeit = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})
type Revier = { id: string; name: string }
type Jagd = {
  id: string
  name: string
  type: string | null
  status: string | null
  scheduled_for: string | null
  scheduled_until: string | null
}
type Teilnehmer = {
  id: string
  hunt_id: string
  user_id: string | null
  guest_name: string | null
  status: string | null
}
type Profil = { id: string; display_name: string | null }
type Kartenobjekt = { id: string; name: string; type: string }
type Schein = {
  id: string
  holder_name: string | null
  holder_id: string | null
  status: string | null
  valid_from: string
  valid_until: string
}

/**
 * Wie viele Einzelfälle eine Agenda-Zeile aufklappt.
 *
 * ponytail: nach Augenmaß. Zwölf sind eine Bildschirmhöhe und zugleich das,
 * was man an einem Nachmittag abgeht.
 */
const POSTEN_MAX = 12

/**
 * Die ersten `POSTEN_MAX` Einträge, plus eine Zeile, die den Rest benennt.
 *
 * Der Rest steht als Posten und nicht im Kopf, weil der Kopf die
 * VOLLZÄHLIGE Zahl trägt („173 sind nicht geprüft") — die Liste darunter zeigt
 * weniger, und genau diese Differenz muss dort stehen, wo man sie bemerkt.
 */
function postenMitRest<T extends { id: string }>(
  alle: readonly T[],
  zeile: (t: T) => { schluessel: string; text: string; zusatz: string }
): { schluessel: string; text: string; zusatz: string }[] {
  const gezeigt = alle.slice(0, POSTEN_MAX).map(zeile)
  const rest = alle.length - gezeigt.length
  if (rest > 0) {
    gezeigt.push({
      schluessel: 'rest',
      text: `… und ${rest} weitere`,
      zusatz: 'auf der Revierkarte',
    })
  }
  return gezeigt
}

/** Eine Zeile der Agenda: Kopf mit Zahl, aufklappbar die Einzelfälle. */
type Bedarf = {
  schluessel: string
  kopf: string
  ziel: string
  posten: { schluessel: string; text: string; zusatz: string }[]
}

/**
 * Fehler nicht verschlucken. Auf einer Kennzahlenseite ist die stille Null die
 * schlimmste Ausgabe: ein RLS-Bruch oder Netzausfall sähe aus wie „keine Jagd,
 * keine Strecke" und wäre von einem echten leeren Revier nicht zu unterscheiden.
 * Lieber werfen und error.tsx sagen lassen, dass die Zahl gerade nicht bekannt ist.
 *
 * **Der Zähler ist bei `head: true` die EINZIGE Auskunft, und deshalb wirft ein
 * fehlender** (Fremdprüfung 08.08.2026, F3/F6). Die erste Fassung schrieb
 * `count ?? 0` — bei fehlendem `Content-Range` wurde daraus eine glaubwürdige
 * „0 Sitze", obwohl die Abfrage gar keine Zeilen überträgt, an denen man den
 * Irrtum bemerken könnte. Das ist zeichengleich der Fehler, der am selben
 * Vormittag in `laden.ts` geschlossen wurde: `(count ?? 0)` in
 * `jagderlaubnisse` konnte ohne Zähler nie feuern. Zweimal am selben Tag
 * dieselbe Klasse — `?? 0` auf einem Zähler ist in diesem Projekt ein
 * Codegeruch.
 *
 * **`Number.isFinite`, nicht `!= null`** — aus demselben Grund wie dort:
 * supabase-js rechnet `parseInt(contentRange[1])` ungeprüft, bei
 * `Content-Range: 0-999/*` ist das NaN. `NaN ?? 0` ist NaN, und die Kennzahl
 * stünde als „NaN" auf der Seite.
 */
async function zaehle(
  bauen: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  was: string
): Promise<number> {
  const { count, error } = await bauen()
  if (error) throw new Error(`${was} konnte nicht gezählt werden: ${error.message}`)
  // `== null` zuerst, damit TypeScript danach `number` weiß — `Number.isFinite`
  // ist kein Type Guard, und ein `as number` wäre genau die Behauptung, gegen
  // die diese Zeilen gebaut sind.
  if (count == null || !Number.isFinite(count)) {
    throw new Error(
      `${was}: PostgREST hat keinen brauchbaren Zähler geliefert (${count}). Die Abfrage ` +
        `überträgt keine Zeilen, aus denen sich die Zahl sonst ergäbe.`
    )
  }
  return count
}

export default async function ZentraleUebersicht({
  searchParams,
}: {
  searchParams: Promise<{ revier?: string }>
}) {
  const { revier: gewuenscht } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Bewusst kein Redirect auf /login: der Proxy ist der Wächter für /zentrale.
  // Bounct die Seite zusätzlich, kann bei einer Abweichung zwischen beiden eine
  // Endlosschleife entstehen (Proxy sieht Session, Server-Komponente nicht).
  if (!user) {
    return (
      <Hinweis titel="Nicht angemeldet" unterzeile="Sitzung fehlt oder ist abgelaufen">
        Diese Seite braucht eine Anmeldung. <a href="/login?next=/zentrale">Zum Login</a>.
      </Hinweis>
    )
  }

  // Weder `boundary` noch `area_ha`: die Grenze fiel mit dem Kartenumzug weg
  // (08.08.2026), die Fläche mit dem Trennsatz aus Konzept §1.3a am selben Tag.
  // Sie ändert sich nur, wenn jemand die Grenze zieht — das ist Bestand und
  // gehört damit zum Revier, nicht auf die Agenda.
  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name')
      .eq('owner_id', user.id)
      .eq('hidden', false)
      .order('name'),
    'Reviere'
  )

  if (reviere.length === 0) {
    return (
      <Hinweis titel="Revierzentrale" unterzeile="Kein sichtbares Revier">
        Diesem Konto ist kein Revier zugeordnet, oder alle sind im Du-Tab der
        Feld-App ausgeblendet. Reviere anlegen und einblenden geht dort.
      </Hinweis>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2). Fehlt oder passt sie nicht, wird auf
  // die kanonische Adresse umgeleitet — danach ist der Zustand der Seitenleiste
  // aus der URL ableitbar und muss nicht ein zweites Mal hergeleitet werden.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale?revier=${reviere[0].id}`)

  // Sichtbar ist, was RLS durchlässt: Ersteller und Teilnehmer der Jagd. Der
  // Revierbesitzer als solcher hat keine eigene hunts-Policy — fremd angelegte
  // Jagden im eigenen Revier fehlen der Zählung also. Für den Piloten deckungs-
  // gleich (Moritz hat alle 17 selbst angelegt), aber keine Ewigkeitsgarantie.
  //
  // **Das wiegt seit dem 08.08.2026 schwerer, weil die Agenda daran hängt**
  // (Fremdprüfung, P6): eine fremd angelegte Jagd fehlt jetzt nicht nur einer
  // Zahl, sondern nimmt ihre offenen Einladungen mit aus „Zu erledigen". Der
  // saubere Weg wäre ein owner-scoped Lesepfad — das ist eine Migration und
  // liegt als eigener Vorgang im Backlog. Bis dahin sagt die Fußnote der
  // Kennzahl, worauf sich die Zahl stützt, statt Vollständigkeit zu behaupten.
  //
  // **`vollstaendig` statt `geladen`** (Fremdprüfung, P3): ohne Zähler wäre eine
  // Abschneidung bei 1000 Jagden unsichtbar, und die Agenda zeigte glaubwürdig
  // „Nichts offen" — die schlimmste Ausgabe, die diese Sektion haben kann.
  const jagden = vollstaendig<Jagd>(
    await supabase
      .from('hunts')
      .select('id, name, type, status, scheduled_for, scheduled_until', { count: 'exact' })
      .eq('district_id', revier.id),
    'Jagden'
  )

  // Umweg über die Jagd-IDs, weil kills.district_id von keinem Client
  // geschrieben wird (Konzept §4.1). Genau deshalb steht unter der Kennzahl
  // eine Fußnote statt einer blanken Zahl.
  // Ohne Jagden gar nicht erst fragen: .in('hunt_id', []) serialisiert die
  // Bibliothek zu `in.()`, was PostgREST nicht annimmt.
  let strecke = 0
  if (jagden.length > 0) {
    strecke = await zaehle(
      () =>
        supabase
          .from('kills')
          .select('id', { count: 'exact', head: true })
          .in(
            'hunt_id',
            jagden.map((j) => j.id)
          ),
      'Strecke'
    )
  }

  const jetzt = new Date()
  const kuenftige = jagden
    .filter(
      (j) =>
        j.scheduled_for !== null &&
        new Date(j.scheduled_for) >= jetzt &&
        j.status !== 'completed' &&
        j.status !== 'auto_completed'
    )
    .sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!))

  // Die Tabelle zeigt fünf, die Agenda darunter rechnet über alle. Vorher war
  // das `.slice(0, 5)` Teil der Filterkette — wer die Einladungen daran hinge,
  // verlöre die der sechsten Jagd, ohne dass es auffiele.
  const naechste = kuenftige.slice(0, 5)

  // **Bewusst der ZEITPUNKT und nicht der Kalendertag** (Schlusslesung
  // 08.08.2026, offener Punkt): eine für heute 06:00 geplante Jagd fällt ab
  // 06:01 aus `kuenftige`, ihre offenen Einladungen verschwinden also am Morgen
  // des Jagdtags aus der Agenda — obwohl das die letzte Rückfrage-Gelegenheit
  // wäre. In Kauf genommen, weil der Vergleich derselbe ist, den die Tabelle
  // „Nächste Jagden" seit Phase 2 benutzt: zwei verschiedene Begriffe von
  // „künftig" auf einer Seite wären schlimmer als der frühe Wegfall. Wer das
  // ändert, ändert beides zusammen — und dann auf den BERLINER Kalendertag,
  // nicht auf den UTC-Tag.

  // Laufende Jagd: nur ein Hinweis, keine Live-Steuerung (§1.3, §3).
  const laufend = jagden.find((j) => j.status === 'active' || j.status === 'paused')

  // ---------------------------------------------------------------------------
  // Handlungsbedarf (Konzept §1.1 und §1.3a) — was eine Frist hat.
  //
  // §1.1 nennt ihn seit dem 25.07.2026, gebaut wurde er nie; an seiner Stelle
  // standen vier Kennzahlen. Zwei davon sind mit §1.3a zum Revier gezogen, die
  // zwei verbliebenen (Jagden, Strecke) wachsen von selbst und bleiben deshalb.
  //
  // **Die Auswahl ist an der Produktion gemessen (08.08.2026), nicht
  // ausgedacht:** 3 offene Einladungen an künftigen Jagden, 3 ausgestellte
  // Scheine ohne Inhaber, 1 bald ablaufender. Ebenso gemessen, was NICHT
  // aufgenommen wurde — 11 Einladungen an vergangenen Jagden (Karteileichen,
  // s. `brauchtAntwort`) und 22 Erlegungen ohne Revierzuordnung (revier-
  // unabhängig, der Fix liegt im nativen Track, Backlog A-S7b).
  // ---------------------------------------------------------------------------

  // Ohne künftige Jagd gar nicht erst fragen: `.in('hunt_id', [])` serialisiert
  // die Bibliothek zu `in.()`, was PostgREST nicht annimmt — dieselbe Falle wie
  // bei der Strecke oben.
  const einladungen =
    kuenftige.length > 0
      ? vollstaendig<Teilnehmer>(
          await supabase
            .from('hunt_participants')
            .select('id, hunt_id, user_id, guest_name, status', { count: 'exact' })
            .in(
              'hunt_id',
              kuenftige.map((j) => j.id)
            )
            .eq('status', 'invited'),
          'Offene Einladungen'
        )
      : []

  /**
   * **Drei Abfragen in einer Welle**, weil alle drei nur an `revier.id` hängen
   * und keine auf eine andere wartet. Der Standzustand ist die jüngste
   * Ergänzung; ihn seriell anzuhängen hätte die Seite um eine volle Rundreise
   * verlängert (~250–330 ms von hier aus, gemessen 22.08.2026) — dasselbe
   * Muster wie CP-69.
   */
  const [scheinErgebnis, objekteErgebnis, pruefErgebnis] = await Promise.all([
    // `holder_id is null` wird NICHT in der Abfrage gefiltert: dieselben Zeilen
    // tragen beide Agenda-Punkte (offen UND bald ablaufend), und bei vier Scheinen
    // je Revier ist eine Abfrage billiger als zwei.
    supabase
      .from('hunting_licenses')
      .select('id, holder_name, holder_id, status, valid_from, valid_until', { count: 'exact' })
      .eq('district_id', revier.id),
    /**
     * Die Kartenobjekte — nur die drei Spalten, die die Agenda braucht.
     *
     * **`vollstaendig()` wie auf der Revierseite:** eine Abschneidung wäre hier
     * besonders tückisch, weil zu wenige Objekte eine zu KLEINE Zahl offener
     * Stände ergäben — die Agenda sagte dann glaubwürdig „weniger zu tun als
     * wahr ist", und das ist die schlimmste Ausgabe, die diese Sektion haben
     * kann (Fremdprüfung 08.08.2026, P3, damals zu den Jagden).
     */
    supabase
      .from('map_objects')
      .select('id, name, type', { count: 'exact' })
      .eq('district_id', revier.id),
    // Die jüngste Prüfzeile je Objekt (View aus Migration 117) — dieselbe
    // Wahrheit, aus der Revierseite, Karte und Feld-App ihre Auskunft ziehen.
    supabase
      .from('map_object_letzte_pruefung')
      .select('map_object_id, status, checked_at, note, checked_by')
      .eq('district_id', revier.id),
  ])

  const scheine = vollstaendig<Schein>(scheinErgebnis, 'Jagderlaubnisse')
  const kartenobjekte = vollstaendig<Kartenobjekt>(objekteErgebnis, 'Kartenobjekte')
  const pruefungen = alsPruefungen(geladen<PruefZeile[]>(pruefErgebnis, 'Standprüfungen'))

  // Nur die gebrauchten Profile, nicht alle — ein ungefiltertes SELECT wäre ein
  // Lesepfad, der mit der Nutzerzahl wächst und irgendwann an der
  // PostgREST-Grenze abgeschnitten wird (C-25).
  //
  // **Der Read bleibt auf `profiles` und ist nach Migration 116 gedeckt**, aber
  // nicht mehr aus dem Grund, der hier stand: die Begründung nannte
  // `profiles_select_authenticated`, und genau die entfällt (A-P1). Tragend
  // sind danach `profiles_select_co_hunters` und die neue
  // `profiles_select_hunt_creator` — die Sichtbarkeit von `hunt_participants`
  // und die von `profiles` sind mit 116 deckungsgleich, und die Kennungen hier
  // stammen aus Teilnehmerzeilen.
  const profilIds = [...new Set(einladungen.map((t) => t.user_id).filter((id) => id !== null))]
  const profile =
    profilIds.length > 0
      ? vollstaendig<Profil>(
          await supabase
            .from('profiles')
            .select('id, display_name', { count: 'exact' })
            .in('id', profilIds),
          'Profile'
        )
      : []
  const namen = new Map(profile.map((p) => [p.id, p.display_name]))

  // **EIN Uhrablesen für die ganze Seite** (Fremdprüfung, P8). Vorher kam
  // `heute` aus `heuteUtc()`, also aus einer zweiten Ablesung nach mehreren
  // Abfragen — ein Request über UTC-Mitternacht hätte Einladungen gegen den
  // alten und Scheine gegen den neuen Kalendertag bewertet.
  const heute = jetzt.toISOString().slice(0, 10)
  const jagdName = new Map(jagden.map((j) => [j.id, j]))

  const bedarf: Bedarf[] = []

  // Kein Client-Filter mehr: die Abfrage oben garantiert `status = 'invited'`
  // UND eine künftige Jagd (über `kuenftige`). Ein Prädikat daneben, das nie
  // `false` liefern kann, ist die Bauform, die die Ponytail-Lesung am
  // 08.08.2026 gestrichen hat — s. den Kommentarblock in `handlungsbedarf.ts`.
  const offeneAntworten = einladungen
  if (offeneAntworten.length > 0) {
    bedarf.push({
      schluessel: 'einladungen',
      kopf: `${offeneAntworten.length} ${
        offeneAntworten.length === 1 ? 'Gast hat' : 'Gäste haben'
      } noch nicht geantwortet`,
      ziel: `/zentrale/jagden?revier=${revier.id}`,
      posten: offeneAntworten.map((t) => {
        const jagd = jagdName.get(t.hunt_id)
        return {
          schluessel: t.id,
          // Reihenfolge der Quellen wie im Jagd-Detail: Profilname, sonst der
          // beim Einladen getippte Gastname. Beides kann fehlen — dann steht
          // hier „Ohne Namen" statt einer leeren Zeile, die wie ein Ladefehler
          // aussähe.
          text: namen.get(t.user_id ?? '') || t.guest_name || 'Ohne Namen',
          zusatz: jagd ? `${jagd.name} · ${terminText(jagd.scheduled_for, false)}` : '—',
        }
      }),
    })
  }

  // Einmal je Schein, weil beide Zeilen darunter ihn brauchen. `status` kippt
  // nicht von selbst — ein abgelaufener Schein steht in der Spalte weiter auf
  // `aktiv` (s. `scheine.ts`).
  const mitStatus = scheine.map((s) => ({
    schein: s,
    status: effektiverStatus(alsStatus(s.status), s.valid_from, s.valid_until, heute),
  }))

  // **`holder_id === null` allein genügt NICHT** (Fremdprüfung, P9): ein
  // entzogener, pausierter oder abgelaufener Schein hat auch keinen Inhaber —
  // und kann keinen mehr bekommen. Ohne die Statusbedingung stünde er für immer
  // als „wartet auf Annahme" da. Das ist zeichengleich die Karteileichen-Falle,
  // die bei den Einladungen benannt ist — hier wäre sie mir selbst passiert.
  //
  // **`nochnicht` gehört aber DAZU, und der erste Fix hatte es ausgesperrt**
  // (Schlusslesung 08.08.2026, B1). Die Begründung, die hier stand —
  // `schein_einloesen()` nehme „nur `aktiv` und ein gültiges Datum" — ist an
  // der Produktion nachgeprüft **falsch**: weder `schein_einloesen()` (068)
  // noch `meine_einladungen()` (080) werten `valid_from` überhaupt aus, beide
  // prüfen `status = 'aktiv'` (die ROHE Spalte) und `valid_until >=
  // current_date`. Ein heute für die kommende Saison ausgestellter Schein wird
  // dem Empfänger also angezeigt, ist einlösbar und wartet wirklich — die
  // Agenda hätte „Nichts offen" gesagt.
  //
  // **Dritte Wiederholung derselben Falle, und die zweite steht in der Datei
  // nebenan:** `darfGedrucktWerden` in `scheine.ts` prüfte im ersten Entwurf
  // ebenfalls `=== 'aktiv'` und sperrte damit den Saison-Vorab-Schein aus —
  // dort ausdrücklich „der häufigste Fall überhaupt" (Schlusslesung
  // 05.08.2026, Befund 1). Wer in diesem Projekt auf `aktiv` filtert, prüft,
  // ob `nochnicht` dazugehört.
  //
  // In `laeuftBaldAb` bleibt es bei `aktiv` allein, und das ist kein
  // Widerspruch: ein Schein, der noch gar nicht begonnen hat, läuft nicht bald
  // ab.
  const nichtEingeloest = mitStatus
    .filter(
      (m) => m.schein.holder_id === null && (m.status === 'aktiv' || m.status === 'nochnicht')
    )
    .map((m) => m.schein)
  if (nichtEingeloest.length > 0) {
    bedarf.push({
      schluessel: 'scheine-offen',
      kopf: `${nichtEingeloest.length} ${
        nichtEingeloest.length === 1 ? 'Jagderlaubnis wartet' : 'Jagderlaubnisse warten'
      } auf Annahme`,
      ziel: `/zentrale/jagderlaubnisse?revier=${revier.id}`,
      posten: nichtEingeloest.map((s) => ({
        schluessel: s.id,
        text: s.holder_name || 'Ohne Namen',
        zusatz: `ausgestellt bis ${alsDatum(s.valid_until)}`,
      })),
    })
  }

  const laufenAb = mitStatus
    .filter((m) => laeuftBaldAb(m.status, m.schein.valid_until, heute))
    .map((m) => m.schein)
  if (laufenAb.length > 0) {
    bedarf.push({
      schluessel: 'scheine-ablauf',
      kopf: `${laufenAb.length} ${
        laufenAb.length === 1 ? 'Jagderlaubnis läuft' : 'Jagderlaubnisse laufen'
      } binnen ${FRIST_TAGE} Tagen ab`,
      ziel: `/zentrale/jagderlaubnisse?revier=${revier.id}`,
      posten: laufenAb.map((s) => ({
        schluessel: s.id,
        text: s.holder_name || 'Ohne Namen',
        zusatz: `bis ${alsDatum(s.valid_until)}`,
      })),
    })
  }

  // ---------------------------------------------------------------------------
  // Der Standzustand (Konzept Standzustand §4.2) — zwei Zeilen, zwei Achsen.
  //
  // **Warum das hierher gehört und nicht auf die Revierseite:** die offene
  // Prüfung ist der Musterfall des Trennsatzes. Die Zahl ändert sich, weil
  // ZEIT vergangen ist — am 1. April fällt jedes „ok" der letzten Saison zurück
  // auf offen, ohne dass jemand etwas getan hätte. Genau das ist eine Agenda.
  // Der Bestand („140 von 173 geprüft") steht drüben beim Revier.
  //
  // **Die Sperre ist der Grenzfall, und sie steht bewusst trotzdem hier.**
  // Streng gelesen ändert sie sich nur, wenn jemand etwas tut — also Bestand.
  // Aber eine Sperre ist eine Anweisung für JETZT („nicht besetzen"), und die
  // darf nicht darauf warten, dass jemand von sich aus die Revierseite öffnet.
  // Der Trennsatz sortiert Zahlen, nicht Gefahren.
  // ---------------------------------------------------------------------------

  const jagdjahr = getJagdjahr(jetzt)
  const wartbare = kartenobjekte.filter((o) => istWartbar(o.type))

  /**
   * Diese Saison noch nicht angesehen — die ARBEIT.
   *
   * Enthält absichtlich auch, was bekannt kaputt ist: ein Mangel vom letzten
   * Jahr ist gleichzeitig „diese Saison nicht bestätigt". Die beiden Zeilen
   * überschneiden sich also, und das ist keine Doppelzählung, sondern zwei
   * Fragen an dieselbe Zeile (Konzept §3).
   */
  const offen = wartbare
    .filter((o) => {
      const p = pruefungen.get(o.id)
      return !p || !inDieserSaison(p.checkedAt, jagdjahr, jetzt)
    })
    /**
     * **Älteste Prüfung zuerst, nie geprüfte ganz vorn.**
     *
     * Das ist die Reihenfolge, in der man durchs Revier geht (Konzept
     * Standzustand §4.3), und sie braucht keine Bedienung. Ohne sie stünde hier
     * die Reihenfolge, in der die Datenbank die Zeilen zurückgibt — also
     * keine.
     *
     * `''` als Schlüssel für „noch nie geprüft" sortiert vor jedes ISO-Datum.
     * Das ist gewollt: eine Unbekannte wiegt schwerer als ein Stand, der
     * letztes Jahr heil war.
     *
     * **Nackter Vergleich statt `localeCompare`, und das ist gemessen**
     * (Schlusslesung 25.08.2026, Finding 2): ICU sortiert
     * `'…:05+00:00'` HINTER `'…:05.5+00:00'`, obwohl der erste früher liegt —
     * der Sekundenbruchteil verschiebt die Reihenfolge. Byteweise stimmt sie
     * (`'+'` 0x2B < `'.'` 0x2E). PostgREST liefert `checked_at` mal mit, mal
     * ohne Bruchteil, je nachdem ob er null ist; beide Formen kommen also vor.
     * Sub-sekündlich und damit kosmetisch — aber eine Sortierung, die man
     * korrekt haben kann, sortiert man korrekt.
     */
    .sort((a, b) => {
      const av = pruefungen.get(a.id)?.checkedAt ?? ''
      const bv = pruefungen.get(b.id)?.checkedAt ?? ''
      return av < bv ? -1 : av > bv ? 1 : 0
    })

  if (offen.length > 0) {
    bedarf.push({
      schluessel: 'staende-offen',
      kopf: `${offen.length} ${
        offen.length === 1 ? 'Jagdeinrichtung ist' : 'Jagdeinrichtungen sind'
      } für ${jagdjahr.label} noch nicht geprüft`,
      ziel: `/zentrale/revier?revier=${revier.id}`,
      /**
       * **Nur die nächsten paar, nicht alle** — und der Fall ist keine
       * Vorsorge, er tritt sofort ein: Söder hat **173** wartbare Objekte und
       * null Prüfungen (gemessen 25.08.2026), die Zeile stünde also mit 173
       * Posten in der Agenda. Das ist keine Aufgabe mehr, sondern ein Bestand
       * — und Bestände gehören laut Trennsatz (§1.3a) ohnehin nicht hierher.
       *
       * Die Liste zeigt deshalb die ältesten, also die, mit denen man anfängt.
       * Der Rest steht als Zahl darunter, statt still zu fehlen: eine
       * abgeschnittene Liste, die so tut, als sei sie vollständig, ist im
       * Zweifel schlimmer als gar keine.
       */
      posten: postenMitRest(offen, (o) => {
        const p = pruefungen.get(o.id)
        return {
          schluessel: o.id,
          text: o.name,
          // Was zuletzt bekannt war — die Auskunft, die entscheidet, ob dieser
          // Gang eine Routine ist oder eine Unbekannte. „Letztes Jahr war der
          // heil" ist etwas anderes als „den hat noch nie jemand angesehen"
          // (Konzept §4.1.1).
          // **`alsBerlinDatum` und nicht `alsDatum`:** `checked_at` ist ein
          // `timestamptz`, und der Schnitt am ISO-String liefert das UTC-Datum
          // — wer um 00:30 Berliner Zeit prüft, stünde einen Tag zu früh. Die
          // Falle ist in diesem Repo schon einmal bezahlt worden
          // (Fremdprüfung 04.08.2026, an `kontakte.inaktiv_seit`).
          zusatz: p
            ? `${typLabel(o.type)} · ${
                p.status === 'gesperrt' ? 'gesperrt seit' : 'zuletzt'
              } ${alsBerlinDatum(p.checkedAt)}`
            : `${typLabel(o.type)} · noch nie geprüft`,
        }
      }),
    })
  }

  /**
   * Bekannt gesperrt — der ZUSTAND, unabhängig vom Alter der Prüfung.
   *
   * **Eine Sperre altert nicht.** Eine gebrochene Sprosse ist im April immer
   * noch gebrochen; deshalb steht hier kein Saisonfilter, anders als eine Zeile
   * darüber.
   */
  const gesperrt = wartbare.filter((o) => pruefungen.get(o.id)?.status === 'gesperrt')

  if (gesperrt.length > 0) {
    bedarf.push({
      schluessel: 'staende-gesperrt',
      kopf: `${gesperrt.length} ${
        gesperrt.length === 1 ? 'Jagdeinrichtung ist' : 'Jagdeinrichtungen sind'
      } gesperrt`,
      ziel: `/zentrale/revier?revier=${revier.id}`,
      // Derselbe Deckel wie oben. Bei Sperren wird er kaum je greifen — aber
      // eine Liste, die in einem Revier deckelt und im anderen nicht, wäre
      // schwerer zu lesen als eine, die es immer tut.
      posten: postenMitRest(gesperrt, (o) => {
        const p = pruefungen.get(o.id)
        return {
          schluessel: o.id,
          text: o.name,
          // Die Notiz ist hier die eigentliche Auskunft — was genau kaputt ist.
          // Migration 066 fragt sie bei einer Sperre ausdrücklich ab, und ohne
          // sie ist die Zeile nur ein Verbot ohne Grund.
          zusatz: p
            ? `seit ${alsBerlinDatum(p.checkedAt)}${p.note ? ` · „${p.note}"` : ''}`
            : typLabel(o.type),
        }
      }),
    })
  }

  return (
    <div className="zentrale-wrap">
      <h1>{revier.name}</h1>
      {/* Seit dem Wegfall der R3-Allowlist (29.07.2026) gilt für jedes Revier
          dasselbe, also sagt die Zeile nichts mehr über Rechte. Sie sagte das
          vorher, weil es zwei Fälle gab; einen Hinweis stehen zu lassen, der
          immer denselben Text zeigt, ist schlechter als keiner. */}
      <p className="zentrale-sub">Übersicht</p>

      {laufend && (
        <div className="zentrale-live">
          <span>
            <strong>{laufend.name}</strong> läuft gerade.
          </span>
          <a href={`/app/hunt/${laufend.id}`}>In der App öffnen ↗</a>
        </div>
      )}

      {/* Zwei statt vier: Fläche und Sitze sind mit Konzept §1.3a zum Revier
          gezogen. Was hier steht, wächst von selbst — eine Jagd wird angelegt,
          jemand meldet eine Erlegung. Genau das ist der Test des Trennsatzes. */}
      <div className="zentrale-kennzahlen">
        {/* „soweit dir sichtbar" statt „insgesamt": der Revierbesitzer hat
            keine eigene hunts-Policy, fremd angelegte Jagden fehlen der Zahl.
            Der Vorbehalt stand bisher nur als Kommentar im Code — seit die
            Agenda daran hängt, gehört er auf die Seite (Fremdprüfung, P6). */}
        <Kennzahl label="Jagden" wert={String(jagden.length)} fuss="in diesem Revier, soweit dir sichtbar" />
        <Kennzahl
          label="Strecke"
          wert={String(strecke)}
          fuss="nur über Jagden zuordenbar — kills.district_id wird noch nicht geschrieben"
        />
      </div>

      <section className="zentrale-block">
        <h2>Zu erledigen</h2>
        {bedarf.length === 0 ? (
          /* Der leere Zustand muss nach „nichts zu tun" aussehen und nicht nach
             „kaputt" — im Bestand gibt es heute genau eine künftige Jagd, die
             Agenda ist also oft leer (Konzept §1.3a, letzter Absatz). */
          <p className="zentrale-leer">Nichts offen.</p>
        ) : (
          /* `role="list"` ist hier NICHT redundant (Fremdprüfung Paket B, Q8):
             WebKit nimmt einer `<ul>` mit `list-style: none` bewusst die
             Listensemantik, VoiceOver sagt dann weder Gruppierung noch Anzahl
             an. Beide Listen tragen es, beide sind markerlos. */
          <ul className="zentrale-bedarf" role="list">
            {bedarf.map((z) => (
              <li key={z.schluessel}>
                {/* `<details>` statt eines Client-States: das Aufklappen kann
                    der Browser selbst, samt Tastaturbedienung und
                    Screenreader-Ansage. Diese Seite bleibt dadurch eine reine
                    Server-Komponente — ein `'use client'` nur fürs Auf- und
                    Zuklappen wäre der teuerste Weg zu einem Dreieck. */}
                <details>
                  <summary>{z.kopf}</summary>
                  <ul className="zentrale-bedarf-posten" role="list">
                    {z.posten.map((p) => (
                      <li key={p.schluessel}>
                        <span className="name">{p.text}</span>
                        <span className="zusatz">{p.zusatz}</span>
                      </li>
                    ))}
                  </ul>
                  <a className="zentrale-bedarf-ziel" href={z.ziel}>
                    Dort bearbeiten →
                  </a>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="zentrale-block">
        <h2>Nächste Jagden</h2>
        {naechste.length === 0 ? (
          <p className="zentrale-leer">Keine Jagd mit Termin in der Zukunft.</p>
        ) : (
          <table className="zentrale-tabelle">
            <thead>
              <tr>
                <th scope="col">Termin</th>
                <th scope="col">Jagd</th>
                <th scope="col">Art</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {naechste.map((j) => (
                <tr key={j.id}>
                  {/* Eine mehrtägige Jagd, die hier nur ihren Starttag zeigt,
                      sieht aus wie ein Abendansitz — der Unterschied ist genau
                      das, was „was ist als Nächstes vorzubereiten" beantwortet. */}
                  <td className="num">
                    {datumZeit.format(new Date(j.scheduled_for!))}
                    {mehrtaegig(j.scheduled_for, j.scheduled_until)
                      ? ` – ${terminText(j.scheduled_until, false)}`
                      : ''}
                  </td>
                  <td>{j.name}</td>
                  <td>{j.type ? (JAGDART[j.type] ?? j.type) : '—'}</td>
                  <td>
                    <span className="zentrale-pill">
                      {j.status ? (JAGDSTATUS[j.status] ?? j.status) : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Hinweis({
  titel,
  unterzeile,
  children,
}: {
  titel: string
  unterzeile: string
  children: React.ReactNode
}) {
  return (
    <div className="zentrale-wrap">
      <h1>{titel}</h1>
      <p className="zentrale-sub">{unterzeile}</p>
      <div className="zentrale-note">
        <p style={{ margin: 0 }}>{children}</p>
      </div>
    </div>
  )
}

