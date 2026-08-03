import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { geladen } from '../laden'
import Liste from './liste'
import {
  alsFilter,
  alsJahr,
  antworten,
  ersterWert,
  zusagen,
  type Jagd,
  type Teilnahme,
} from './jagden'
import './jagden.css'

/**
 * Jagden — Portal-Phase 4a (`QuickHunt_Konzept_Revierzentrale_V1.md` §5).
 *
 * Der Bereich bereitet Jagden VOR. Der Jagdtag läuft nativ; aktive Jagden sind
 * hier read-only (§3: "ein offener Browser darf keine laufende Feldsituation
 * umschreiben").
 *
 * **Was nativ fehlt und diese Seite deshalb füllt** (Recon 03.08.2026):
 * nachträglich einladen, Termin ändern, Name/Jagdart ändern, Rollen setzen —
 * alle vier gibt es in der App nicht. Rollen sind sogar ausdrücklich hierher
 * verwiesen (Backlog E5: "KEINE native Rollenverwaltung, übergangsweise
 * PWA/SQL").
 */

type Suchparameter = { [k: string]: string | string[] | undefined }

interface Revier {
  id: string
  name: string
}

export default async function JagdenPage({
  searchParams,
}: {
  searchParams: Promise<Suchparameter>
}) {
  const { revier: revierParam, filter, jahr: jahrParam } = await searchParams
  const gewuenscht = ersterWert(revierParam)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login: der Proxy ist der Wächter für /zentrale. Bounct
  // die Seite zusätzlich, kann bei einer Abweichung eine Schleife entstehen.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagden</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Seite braucht eine Anmeldung.{' '}
            <a href="/login?next=/zentrale/jagden">Zum Login</a>.
          </p>
        </div>
      </div>
    )
  }

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
      <div className="zentrale-wrap">
        <h1>Jagden</h1>
        <p className="zentrale-sub">Kein eigenes Revier</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Jagden vorbereiten kann nur, wem das Revier gehört. Reviere anlegen
            und einblenden geht im Du-Tab der Feld-App.
          </p>
        </div>
      </div>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2) — dieselbe kanonische Adresse wie
  // auf der Übersicht, damit der Wechsler der Seitenleiste weiterträgt.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/jagden?revier=${reviere[0].id}`)

  // **`district_id` ist der Filter, und er blendet die Einzeljagden aus.**
  // Von 39 Jagden im Bestand tragen 18 gar kein Revier (gemessen 03.08.2026):
  // `createSoloHunt` der App schreibt `districtId: null`. Diese Seite zeigt sie
  // nie, und das ist gewollt — die Revierzentrale bereitet Reviergeschehen vor,
  // eine Einzeljagd ist ein Ansitz von einer Person, den niemand organisiert.
  // Es steht hier, weil fast die halbe Zahl fehlt und ein leeres Revier sonst
  // wie „keine Jagden" aussieht statt wie „keine Revierjagden".
  // (Schlusslesung 03.08.2026, offener Punkt.)
  //
  // Sichtbar ist außerdem nur, was RLS durchlässt: Ersteller und Teilnehmer der
  // Jagd. Der Revierbesitzer als solcher hat KEINE eigene hunts-Policy — eine
  // fremd angelegte Jagd im eigenen Revier fehlt hier also ganz.
  //
  // Heute folgenlos: alle 39 Jagden im Bestand hat Moritz selbst angelegt
  // (gemessen 03.08.2026, 0 fremde). Der Fall entsteht erst mit mehreren
  // Revier-Admins — Moritz hat sie am 03.08. als eigenen Block nach hinten
  // gestellt ("noch nicht so dringend"). Wenn er kommt, ist DIESE Query die
  // Stelle, die davon als Erstes etwas merkt: aus "keine Jagden" wird dann
  // stillschweigend "nicht meine Jagden".
  // **Das Limit steht ausdrücklich da, damit es auffällt, wenn es greift.**
  // PostgREST schneidet sonst still bei 1000 Zeilen ab, und die Liste rechnet
  // Filter und Zähler aus dem, was sie bekommen hat — aus einer abgeschnittenen
  // Menge würden also zu niedrige Zahlen, die wie gültige aussehen
  // (Fremdprüfung 03.08.2026, S4). Heute stehen 39 Jagden im Bestand; die
  // Grenze ist weit weg, aber ihr Erreichen wäre lautlos.
  const GRENZE = 1000

  const jagden = geladen<Jagd[]>(
    await supabase
      .from('hunts')
      .select('id, name, type, status, scheduled_for, started_at, ended_at, created_at')
      .eq('district_id', revier.id)
      .limit(GRENZE),
    'Jagden'
  )

  // Zusagen in einer zweiten Query statt als eingebetteter Count: PostgREST
  // kann nicht zwei gefilterte Counts nebeneinander liefern (zugesagt UND
  // offen), und bei 39 Jagden × ~4 Teilnehmern sind es 88 schmale Zeilen.
  //
  // Ohne Jagden gar nicht erst fragen: `.in('hunt_id', [])` serialisiert die
  // Bibliothek zu `in.()`, was PostgREST nicht annimmt (gleiche Falle wie in
  // ../page.tsx).
  const teilnahmen =
    jagden.length === 0
      ? []
      : geladen<Teilnahme[]>(
          await supabase
            .from('hunt_participants')
            // `user_id`, `guest_name` und die zwei Zeitpunkte kommen für den
            // Aufklapper hinter der Zusagen-Zahl mit: er zeigt, WER zugesagt
            // hat und wann, nicht nur wie viele.
            .select('hunt_id, status, user_id, guest_name, joined_at, left_at')
            .in(
              'hunt_id',
              jagden.map((j) => j.id)
            )
            .limit(GRENZE),
          'Teilnehmer'
        )

  // **Nur die Konten, die hier auch vorkommen** — nicht alle.
  //
  // Die erste Fassung lud `profiles` ungefiltert mit `limit(GRENZE)`. Heute
  // sind das 9 Zeilen, aber sobald der Bestand die Grenze überschreitet, fehlt
  // eine beliebige Teilmenge der Namen, und die betroffenen Teilnehmer stehen
  // still als „Konto <uuid>" da — eine degradierte Auskunft, die wie eine
  // gültige aussieht (Fremdprüfung 03.08.2026). Mit `.in()` kann die Abfrage
  // gar nicht erst unvollständig werden: sie fragt genau so viele, wie es
  // Teilnehmer gibt.
  const kontoIds = [...new Set(teilnahmen.map((t) => t.user_id).filter((id): id is string => !!id))]

  const profile =
    kontoIds.length === 0
      ? []
      : geladen<{ id: string; display_name: string | null }[]>(
          await supabase.from('profiles').select('id, display_name').in('id', kontoIds),
          'Profile'
        )

  // **Ein Jahr aus der Adresse, das es nicht gibt, wird zu „Alle".**
  // Ohne diese Zeile filterte `?jahr=quatsch` (oder ein Jahr, aus dem inzwischen
  // die letzte Jagd verschwunden ist) alles heraus: leere Liste, Zähler auf
  // null — und das Auswahlfeld zeigte „Alle", weil kein `<option>` passt. Der
  // Nutzer sähe einen leeren Bestand ohne erkennbaren Filter
  // (Fremdprüfung 03.08.2026). `filter` läuft längst durch `alsFilter()`;
  // `jahr` hatte keine solche Schranke.
  const jahr = alsJahr(ersterWert(jahrParam), jagden)

  // Die Teilnehmerabfrage erreicht die Grenze deutlich früher als die Jagden —
  // 39 Jagden tragen heute 88 Zeilen. Lieber ein sichtbarer Hinweis als eine
  // stille Falschzahl; die Haltung ist dieselbe wie in `geladen()`.
  const unvollstaendig = jagden.length >= GRENZE || teilnahmen.length >= GRENZE

  return (
    <div className="zentrale-wrap">
      {/* Das Revier steht über dem Titel, nicht darunter: jede Zahl auf dieser
          Seite gilt nur für dieses eine. Kleines Label, großer Name. */}
      <div className="zentrale-revier">
        <span className="zentrale-revier-label">Revier</span>
        <span className="zentrale-revier-name">{revier.name}</span>
      </div>
      {unvollstaendig ? (
        <div className="zentrale-note" role="alert">
          <p style={{ margin: 0 }}>
            Diese Ansicht zeigt die ersten {GRENZE} Datensätze. Zusagen und
            Zähler sind damit unvollständig — die Seite braucht Blätterung.
          </p>
        </div>
      ) : null}
      <Liste
        jagden={jagden}
        zusagen={Object.fromEntries(zusagen(teilnahmen))}
        antworten={Object.fromEntries(
          antworten(teilnahmen, Object.fromEntries(profile.map((p) => [p.id, p.display_name ?? ''])))
        )}
        filter={alsFilter(ersterWert(filter))}
        jahr={jahr}
        revierId={revier.id}
        eigeneId={user.id}
      />
    </div>
  )
}
