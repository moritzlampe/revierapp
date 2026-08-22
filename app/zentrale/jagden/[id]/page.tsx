import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parsePolygonHex } from '@/lib/geo-utils'
import { punktAus } from '../../karte-geo'
import { STAND_TYPEN } from '../../objekte'
import { geladen, vollstaendig } from '../../laden'
import type { Punkt } from '../../revierkarte-map'
import Detail from './detail'
import { ausZeilen, type TreibenZeile } from './treiben'
import {
  ersterWert,
  type EinladbarerKontakt,
  type Jagd,
  type Profil,
  type Teilnehmer,
  vorbereitbar,
} from '../jagden'
import '../jagden.css'

/**
 * Eine einzelne Jagd vorbereiten — Portal-Phase 4a.
 *
 * Was hier geht: Name, Termin und Jagdart ändern, Teilnehmer einladen und
 * entfernen, Rolle und Tag setzen. Was nicht geht: Treiben und Stände (4b),
 * die Jagd starten oder beenden (Konzept §3 — der Jagdtag gehört der App), das
 * Revier wechseln, und die Rolle `jagdleiter` vergeben.
 */

interface Revier {
  id: string
  name: string
  /** Für die Treiben-Karte (4b). PostGIS-Geometry, als EWKB-Hex oder GeoJSON. */
  boundary: unknown
}

/** `map_objects`-Zeile, so weit die Treiben-Karte sie braucht. */
interface Objekt {
  id: string
  name: string
  type: string
  position: unknown
}

export default async function JagdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  // Das Revier steht in der Adresse, damit der Wechsler der Seitenleiste es
  // weiterträgt (Konzept §1.2). `ersterWert`, weil Next jeden Parameter als
  // `string[]` liefert, sobald er mehrfach in der Adresse steht.
  const { revier: revierParam, chat } = await searchParams
  const inAdresse = ersterWert(revierParam)
  const chatFehlt = ersterWert(chat) === 'fehlt'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login — der Proxy ist der Wächter für /zentrale.
  // Gleiche Begründung wie in ../page.tsx.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagd</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Seite braucht eine Anmeldung.{' '}
            <a href={`/login?next=/zentrale/jagden/${id}`}>Zum Login</a>.
          </p>
        </div>
      </div>
    )
  }

  /**
   * **Fünf Abfragen in EINER Welle, nicht fünf nacheinander** (CP-69). Keine
   * von ihnen braucht ein Ergebnis einer anderen — alle hängen nur an `user.id`
   * bzw. der Jagd-`id` aus der Adresse.
   *
   * **Der Anlass ist gemessen** (22.08.2026): „Löschen dauert sehr lange". Der
   * Server war es nicht (`explain analyze`: 47,8 ms) — die Zeit steckte hier,
   * weil `fuehreAus()` nach JEDEM Write `router.refresh()` ruft und den Knopf
   * bis zum Ende der Kette gesperrt hält.
   *
   * **`geladen()` gehört NICHT ins Array:** es wirft, und ein Wurf im
   * `Promise.all` risse die anderen vier Ergebnisse mit — die Meldung nennte
   * dann nicht mehr, welche Abfrage gescheitert ist.
   *
   * **Der Preis, benannt — und die erste Fassung dieses Absatzes hat ihn
   * kleingeredet** (Fremdprüfung 22.08.2026, Punkt 8): dort stand „sie laufen
   * gleichzeitig, die Wartezeit bleibt gleich". Das stimmt nicht. Vorher wartete
   * der Nicht-gefunden-Pfad auf **eine** Abfrage — ein Treffer über den
   * Primärschlüssel, das Schnellste, was diese Seite tut. Jetzt wartet er auf
   * die **langsamste von fünf**, und `kontakte` trägt zwei Sortierungen.
   *
   * Der Tausch bleibt richtig, aber er ist einer: ein selten begangener Weg
   * wird etwas langsamer, damit der Weg, den jeder nimmt, vier Rundreisen
   * spart. Wer das umdrehen wollte, müsste `hunts` allein vorziehen — und
   * bezahlte dafür auf dem häufigen Weg genau die Rundreise, die dieser Umbau
   * einspart.
   *
   * `maybeSingle`, nicht `single`: eine Jagd, die RLS nicht durchlässt, ist
   * hier kein Serverfehler, sondern die Auskunft „gibt es für dich nicht".
   */
  const [jagdErgebnis, reviereErgebnis, teilnehmerErgebnis, profileErgebnis, kontakteErgebnis] =
    await Promise.all([
      supabase
        .from('hunts')
        .select(
          'id, name, type, status, scheduled_for, scheduled_until, started_at, ended_at, created_at, creator_id, district_id'
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('districts')
        .select('id, name, boundary')
        .eq('owner_id', user.id)
        .eq('hidden', false),
      supabase
        .from('hunt_participants')
        .select('id, user_id, guest_name, role, tags, status')
        .eq('hunt_id', id),
      supabase.from('profiles').select('id, display_name').order('display_name'),
      supabase
        .from('kontakte')
        .select('id, vorname, nachname, kategorien')
        .is('inaktiv_seit', null)
        .order('nachname', { ascending: true, nullsFirst: false })
        .order('vorname', { ascending: true, nullsFirst: false }),
    ])

  const { data: jagd, error: jagdFehler } = jagdErgebnis

  if (jagdFehler) throw new Error(`Die Jagd konnte nicht geladen werden: ${jagdFehler.message}`)

  if (!jagd) {
    return (
      <div className="zentrale-wrap">
        <h1>Jagd</h1>
        <p className="zentrale-sub">Nicht gefunden</p>
        <div className="zentrale-note">
          <p style={{ margin: 0 }}>
            Diese Jagd gibt es nicht, oder sie gehört zu keinem Revier, das du
            siehst. <Link href="/zentrale/jagden">Zurück zur Liste</Link>.
          </p>
        </div>
      </div>
    )
  }

  // Das Revier der Jagd — und zugleich die Prüfung, ob es ein eigenes ist.
  const reviere = geladen<Revier[]>(reviereErgebnis, 'Reviere')
  const revier = reviere.find((r) => r.id === jagd.district_id)

  // Der Chat-Hinweis überlebt den Redirect — sonst verschwände er genau dann,
  // wenn er gebraucht wird (direkt nach dem Anlegen).
  if (revier && inAdresse !== revier.id) {
    redirect(`/zentrale/jagden/${id}?revier=${revier.id}${chatFehlt ? '&chat=fehlt' : ''}`)
  }

  const teilnehmer = geladen<Teilnehmer[]>(teilnehmerErgebnis, 'Teilnehmer')

  // Alle Profile in einem Rutsch: `profiles_select_authenticated` lässt jeden
  // Angemeldeten alle Zeilen sehen, und im Bestand sind es 9 (03.08.2026). Eine
  // Suche wäre bei dieser Menge Zierat; wenn sie fällig wird, ist es dieselbe
  // Stelle wie nativ (`fetchInvitableProfiles`, ebenfalls ohne Suche).
  const profile = geladen<Profil[]>(profileErgebnis, 'Profile')

  // **Das Adressbuch — die Menschen ohne Konto** (Moritz, 03.08.2026: „wir
  // werden aber ja auch jagden anlegen mit leuten die noch keinen haben oder
  // nie haben werden"). RLS ist die Grenze, nicht eine `.eq()`-Bedingung:
  // `get_my_kontaktbuecher()` deckt das eigene Adressbuch plus die, für die man
  // als Mitführender eingetragen ist (Migration 085) — dieselbe Haltung wie in
  // `../../gaeste/page.tsx`.
  //
  // **`profil_id` wird NICHT geladen**, obwohl das Zusammenlegen von Konto und
  // Kontakt daran hinge: sie beantwortete „ist diese Person schon Nutzer?" und
  // ist deshalb aus der Oberfläche verbannt (Konzept Kontaktliste §5.3, das
  // Orakel-Verbot). Im Bestand ist sie ohnehin bei 0 von 154 gesetzt.
  // **Stillgelegte Kontakte kommen hier gar nicht an** (Migration 100,
  // Fremdprüfung 04.08.2026, Punkt 7). Der Filter sitzt in der ABFRAGE und nicht
  // in `kandidaten()`: dann kann kein Codeweg im Client versehentlich einen
  // inaktiven Kontakt anbieten, und der Zustand ist genau dort wirksam, wo er
  // seinen Zweck hat. Wer als Aktiver eingeladen wurde und danach stillgelegt
  // wird, bleibt Teilnehmer — die `hunt_participants`-Zeile ist unberührt, hier
  // geht es allein um die Auswahl der NOCH NICHT Eingeladenen.
  const kontakte = geladen<EinladbarerKontakt[]>(kontakteErgebnis, 'Kontakte')

  // **Die Rechtefrage, und sie ist der Grund, warum diese Seite sie serverseitig
  // stellt:** Ersteller ODER wer die Rolle trägt UND zugesagt hat. Zeichengleich
  // zu `istJagdleiter()` in `src/lib/hunt/leitung.ts` der App, additiv seit
  // Migration 089.
  //
  // Ohne diese Prüfung zeigte die Seite jedem Teilnehmer die Bearbeiten-Knöpfe,
  // und die DB wiese sie mit `42501` ab — der S2-Fall aus dem Standard-Focus:
  // ein Knopf für jemanden, dem RLS das Schreiben verweigert.
  const eigene = teilnehmer.find((t) => t.user_id === user.id)
  const istLeiter =
    jagd.creator_id === user.id || (eigene?.status === 'joined' && eigene?.role === 'jagdleiter')

  /**
   * **Treiben und Stände (Phase 4b) — nur mit Revier.** Ein Treiben ist eine
   * Auswahl auf der Revierkarte; eine Jagd ohne `district_id` (jede Solojagd,
   * 17 von 25 im Bestand) hat keine, und die Sektion entfällt dann ganz statt
   * eine leere Karte zu zeigen.
   *
   * **Der Ersteller liest die Treiben über seine eigene Teilnehmerzeile**, nicht
   * über `creator_id`: die einzige SELECT-Policy auf `hunt_drives` ist
   * `hunt_drives_participant_select` über `get_my_joined_hunt_ids()`, und die
   * verlangt eine Zeile mit `status = 'joined'`. Ein Ersteller ohne diese Zeile
   * dürfte schreiben (`hunt_drives_creator_insert`) und bekäme seine eigene
   * Zeile nicht zurück — `schreibe()` meldete dann einen Fehlschlag für einen
   * geglückten Write. **Heute unerreichbar und gemessen: 0 von 25 Jagden haben
   * einen Ersteller ohne beigetretene Jagdleiter-Zeile** (08.08.2026), und beide
   * Anlegepfade schreiben sie mit (Portal `../liste.tsx`, App
   * `hunt/create/page.tsx`). Wer das ändert, bricht diese Seite.
   */
  // Dieselbe Bedingung wie `schreibbar` in `detail.tsx`: das Portal BEREITET
  // VOR, der Jagdtag gehört der App (Konzept §3). Eine laufende oder beendete
  // Jagd lädt ihre Treiben hier gar nicht erst.
  //
  // **`jagd.type` wird bewusst NICHT geprüft** (Moritz, 10.08.2026, auf einen
  // `[medium]`-Befund der Fremdprüfung hin entschieden). Ein Treiben an einer
  // Ansitzjagd ist fachlich sinnlos — aber `type` ist auf DIESER Seite änderbar,
  // und ein Filter versteckte beim Umstellen der Jagdart lautlos die bereits
  // angelegten Treiben. Ein Zustand, der Daten unsichtbar macht, ohne dass
  // jemand etwas gelöscht hat, ist teurer als eine sinnlose Möglichkeit.
  // Fällig erst, wenn jemand versehentlich Treiben an einem Ansitz anlegt —
  // dann zusammen mit einem Hinweis für genau diesen Fall.
  const treibenSichtbar = !!revier && istLeiter && vorbereitbar(jagd.status)

  /**
   * **Welle 2, und zwar wieder gleichzeitig** (CP-69). Beide Abfragen brauchen
   * `treibenSichtbar` — also `revier` aus Welle 1 und `istLeiter`, das seinerseits
   * `hunt_participants` braucht. Deshalb sind sie nicht in Welle 1 gerutscht.
   * Untereinander sind sie unabhängig; vorher warteten sie trotzdem aufeinander.
   *
   * `null` statt einer Abfrage, wenn die Sektion nicht sichtbar ist: `Promise.all`
   * nimmt das anstandslos, und der Zweig bleibt derselbe wie vorher — eine Jagd
   * ohne Revier oder ohne Jagdleiterrecht stellt gar keine Abfrage.
   */
  const [treibenErgebnis, objekteErgebnis] = await Promise.all([
    treibenSichtbar
      ? supabase
          .from('hunt_drives')
          // Ein Literal, kein zusammengesetzter String: PostgREST typt den
          // Embed über die Select-Zeichenkette. Dieselbe Auflage wie nativ.
          .select(
            'id, name, sequence, status, hunt_drive_stands ( id, map_object_id, seat_assignment_id )',
            { count: 'exact' }
          )
          .eq('hunt_id', id)
          .order('sequence', { ascending: true })
          .order('created_at', { ascending: true })
      : null,
    /**
     * Die Kartenobjekte des Reviers. **Gelöschte kommen hier nicht an, und zwar
     * durch RLS, nicht durch eine `.is()`-Bedingung:** alle fünf SELECT-Policies
     * auf `map_objects` tragen `deleted_at IS NULL` (gemessen 08.08.2026). Das ist
     * der Grund, warum `standDiff()` seine `sichtbar`-Menge braucht — eine
     * Standzeile auf einem gelöschten Objekt erreicht den Client nie und darf
     * deshalb auch nie aus einem Kartenklick verschwinden. Im Bestand gibt es
     * genau eine solche Zeile.
     *
     * `vollstaendig()` mit demselben Argument wie auf der Revierseite: eine Karte
     * mit fehlenden Ständen sieht nicht wie ein Fehler aus, sondern wie ein Revier
     * ohne Stände. Söder hat 228 Objekte, der Abstand zur PostgREST-Grenze ist
     * hier am kleinsten.
     */
    treibenSichtbar && revier
      ? supabase
          .from('map_objects')
          .select('id, name, type, position', { count: 'exact' })
          .eq('district_id', revier.id)
          // **Nur Standtypen, und die erste Fassung filterte NICHT** — sie lud
          // alle Objekte, während der Kommentar in `treiben-bereich.tsx` „nur
          // Stände" behauptete (Fremdprüfung 10.08.2026, A9 und B9). Auf der
          // Karte war damit jeder Marker wählbar, und der Fremdschlüssel von
          // `hunt_drive_stands.map_object_id` nimmt jeden `map_objects`-Typ:
          // Parkplatz, Wildkamera oder Kirrung ließen sich als Stand
          // speichern und später mit einem Schützen belegen.
          //
          // Der Filter sitzt in der ABFRAGE, nicht im Client: dann kann kein
          // Codeweg im Browser versehentlich ein Nicht-Stand-Objekt anbieten —
          // dieselbe Haltung wie beim `inaktiv_seit`-Filter der Kontakte
          // weiter oben.
          //
          // `STAND_TYPEN` ist die vorhandene Hausregel aus `../../objekte`
          // (`istStand`), keine zweite Liste. Im Bestand zeigen alle 204
          // Standzeilen auf genau diese drei Typen (gemessen 10.08.2026) — der
          // Filter nimmt also keiner bestehenden Zeile ihre Sichtbarkeit.
          .in('type', STAND_TYPEN)
      : null,
  ])

  const treibenZeilen = treibenErgebnis
    ? vollstaendig<TreibenZeile>(treibenErgebnis, 'Treiben')
    : []

  const objekte = objekteErgebnis ? vollstaendig<Objekt>(objekteErgebnis, 'Kartenobjekte') : []

  // `beschreibung` und `fotoUrl` bleiben `null`, statt geladen zu werden: die
  // Treiben-Karte hat keinen Objekt-Inspektor, sie zeigt Namen und wählt aus.
  // Der Typ ist trotzdem `Punkt` — ein zweiter Punkttyp wäre eine Pflegestelle
  // für zwei ungenutzte Felder.
  const punkte = objekte.reduce<Punkt[]>((acc, o) => {
    const p = punktAus(o.position)
    if (p)
      acc.push({
        id: o.id,
        name: o.name,
        typ: o.type,
        lat: p.lat,
        lng: p.lng,
        beschreibung: null,
        fotoUrl: null,
      })
    return acc
  }, [])

  return (
    <div className="zentrale-wrap">
      {chatFehlt ? (
        <div className="zentrale-note" role="alert">
          <p style={{ margin: 0 }}>
            Die Jagd ist angelegt, <strong>der Gruppenchat konnte nicht erstellt
            werden</strong>. Einladungen und Termin funktionieren; wer zusagt,
            landet aber in keiner Chat-Gruppe. Nachträglich anlegen lässt sich
            der Chat derzeit weder hier noch in der App — wer ihn braucht, legt
            die Jagd in der Feld-App neu an und lässt diese liegen.
          </p>
        </div>
      ) : null}
      <Detail
        jagd={jagd as Jagd}
        revierName={revier?.name ?? null}
        revierId={revier?.id ?? null}
        teilnehmer={teilnehmer}
        profile={profile}
        kontakte={kontakte}
        eigeneId={user.id}
        erstellerId={jagd.creator_id}
        istLeiter={istLeiter}
        treiben={ausZeilen(treibenZeilen)}
        punkte={punkte}
        grenze={revier ? parsePolygonHex(revier.boundary) : null}
      />
    </div>
  )
}
