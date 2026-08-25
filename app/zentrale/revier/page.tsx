import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parsePolygonHex } from '@/lib/geo-utils'
import { punktAus } from '../karte-geo'
import type { Punkt } from '../revierkarte-map'
import { geladen, vollstaendig } from '../laden'
import { alsPruefungen, ampel, bilanz, type PruefZeile } from '@/lib/revier/wartung'
import { getJagdjahr } from '@/lib/diary/season'
import { kontoNamenVollstaendig, type KontoName } from '@/lib/konto-namen'
import { istStand } from '../objekte'
import { Kennzahl } from '../kennzahl'
import RevierName from '../revier-name'
import RevierArbeitsbereich from './arbeitsbereich'
import { ausZeilen, type StandgruppeZeile } from './standgruppen'
import './revier.css'

const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/**
 * Revier — zweiter Bereich der Zentrale (Konzept §1.1), und der letzte der
 * sechs, der bis zum 08.08.2026 keine eigene Adresse hatte.
 *
 * **Der Karteneditor ist nicht neu — er stand auf der ÜBERSICHT.** Bis heute
 * lag `<Revierkarte>` in `../page.tsx`, weil der Bereich nie eine Route bekam;
 * die Seitenleiste führte ihn deshalb als `fertig: false` und verlinkte ihn
 * gar nicht. Was hier passiert, ist ein Umzug, kein Neubau: dieselbe
 * Komponente, dieselben Daten, dieselben Schreibpfade
 * (`districts.boundary` und `map_objects`, beide in `revierkarte.tsx`).
 *
 * **Warum der Umzug jetzt und nicht später:** die Karte bekommt mit der
 * Jagdplanung (Treiben und Stände, Konzept Phase 4b) einen ZWEITEN Verbraucher.
 * Sie vorher aus einer Seite herauszuoperieren, an der gleichzeitig ein neuer
 * Nutzer andockt, ist der teurere Weg.
 *
 * **Die Kennzahlen bleiben drüben.** „Jagden · Strecke · Fläche · Sitze"
 * beantworten „wie steht mein Revier da" und gehören damit zur Übersicht
 * (§1.3). Nur der Editor gehört hierher — die Zerlegung der Kennzahlenreihe
 * hat niemand bestellt, und zwei halbe Reihen wären schlechter als eine ganze.
 *
 * **Der Absatz darüber galt einen Tag und ist am 08.08.2026 abgelöst worden**
 * (Konzept §1.3a, von Moritz entschieden): *Fläche* und *Sitze* stehen jetzt
 * hier. Er war als **Umzugsentscheidung** richtig — die Reihe zu zerlegen war
 * beim Herausoperieren der Karte nicht bestellt —, hat die eigentliche Frage
 * aber nur vertagt. Der Test, der sie beantwortet: ändert sich die Zahl, weil
 * **ich etwas getan habe**, oder weil **Zeit vergangen ist**? Fläche und Sitze
 * ändern sich ausschließlich durch die Pflegearbeit auf genau dieser Seite;
 * Jagden und Strecke wachsen von selbst und bleiben deshalb drüben.
 *
 * Er steht als Beleg dafür, dass die Reihe nicht versehentlich zerfallen ist.
 */

type Revier = { id: string; name: string; boundary: unknown; area_ha: number | null }
type Objekt = {
  id: string
  name: string
  type: string
  position: unknown
  description: string | null
  photo_url: string | null
}

export default async function RevierPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>
}) {
  const { revier: gewuenschtRoh } = await searchParams
  const gewuenscht = Array.isArray(gewuenschtRoh) ? gewuenschtRoh[0] : gewuenschtRoh
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kein Redirect auf /login: der Proxy ist der Wächter für /zentrale.
  if (!user) {
    return (
      <div className="zentrale-wrap">
        <h1>Revier</h1>
        <p className="zentrale-sub">Nicht angemeldet</p>
      </div>
    )
  }

  const reviere = geladen<Revier[]>(
    await supabase
      .from('districts')
      .select('id, name, boundary, area_ha')
      .eq('owner_id', user.id)
      .eq('hidden', false)
      .order('name'),
    'Reviere'
  )

  if (reviere.length === 0) {
    return (
      <div className="zentrale-wrap">
        <h1>Revier</h1>
        <p className="zentrale-sub">Kein sichtbares Revier</p>
        <p className="zentrale-leer">
          Diesem Konto ist kein Revier zugeordnet, oder alle sind im Du-Tab der
          Feld-App ausgeblendet. Reviere anlegen und einblenden geht dort.
        </p>
      </div>
    )
  }

  // Die Revier-ID gehört in die URL (§1.2) — kanonische Adresse wie überall
  // sonst, damit der Wechsler der Seitenleiste weiterträgt.
  const revier = reviere.find((r) => r.id === gewuenscht)
  if (!revier) redirect(`/zentrale/revier?revier=${reviere[0].id}`)

  /**
   * **Eine Welle statt vier seriellen Rundreisen.**
   *
   * Alle vier hängen nur an `revier.id`, das oben bereits feststeht — es gibt
   * nichts, worauf sie warten müssten. Vorher liefen Objekte und Standgruppen
   * nacheinander; der Standzustand wäre die dritte Stufe geworden und die
   * Namensauflösung die vierte. Dasselbe Muster und derselbe Grund wie bei
   * CP-69 (`jagden/[id]/page.tsx`, 22.08.2026): bei ~250–330 ms Rundreise von
   * hier aus kostet jede Stufe spürbar, und die Seite lädt bei jedem
   * `router.refresh()` neu.
   *
   * Die Query-Rümpfe sind gegenüber der seriellen Fassung zeichengleich;
   * geändert hat sich nur, wann jede startet.
   */
  const [objekteErgebnis, gruppenErgebnis, pruefErgebnis, namenErgebnis] = await Promise.all([
    // `photo_url` statt der Tabelle `map_object_photos`: nachgemessen am
    // 27.07.2026 trägt jedes Objekt mit Foto auch ein `photo_url` (181 von 181,
    // keine Lücke). Die 185 Fotozeilen verteilen sich auf dieselben 181 Objekte —
    // vier haben ein zweites Bild. Eine Galerie einzubetten kostete bei Söder 185
    // zusätzliche Zeilen pro Seitenaufruf und brächte vier Objekten ein zweites
    // Foto.
    // ponytail: Deckenbild statt Galerie. Nachziehen, wenn jemand mehrere Fotos
    // am Desktop sehen will — Fotos aufnehmen bleibt ohnehin mobil.
    //
    // **`count: 'exact'` und `vollstaendig()`, anders als in der Fassung auf der
    // Übersicht.** Die Abfrage ist ungepaged, und von allen Lesepfaden der
    // Zentrale ist ausgerechnet diese die mit dem kleinsten Abstand zur
    // PostgREST-Grenze — wenige Hundert Objekte je Revier (Söder 196, gemessen
    // 08.08.2026). Eine Abschneidung wäre hier besonders tückisch, weil eine
    // Karte mit fehlenden Ständen nicht wie ein Fehler aussieht, sondern wie ein
    // Revier ohne Stände. Der Riegel gehört damit zu C-25, kostet beim Umzug
    // aber nichts, weil die Abfrage ohnehin neu geschrieben wird.
    supabase
      .from('map_objects')
      .select('id, name, type, position, description, photo_url', { count: 'exact' })
      .eq('district_id', revier.id),
    /**
     * Standgruppen samt Mitgliedern (Migration 112).
     *
     * Ein Literal als Select-Zeichenkette, kein zusammengesetzter String:
     * PostgREST typt den Embed darüber. Dieselbe Auflage wie bei den Treiben.
     *
     * `vollstaendig()` aus demselben Grund wie oben — eine Gruppe, die still
     * fehlt, sieht aus wie eine, die es nie gab.
     *
     * **Der Zähler deckt nur die ÄUSSERE Menge, und die erste Fassung dieses
     * Absatzes behauptete, die eingebetteten Mitglieder träfe der
     * PostgREST-Default gar nicht** (Fremdprüfung Codex 17.08.2026, Nr. 4,
     * `[low]`). Das stimmt nicht: die Grenze gilt auf allen Ebenen. Eine Gruppe
     * mit mehr Mitgliedern als dem Limit lieferte ein gekürztes Array, und
     * `vollstaendig()` bliebe stumm, weil der äußere Zähler passt.
     *
     * **Was die Sache heute hält, ist strukturell und nicht Bestandszufall:** der
     * Primärschlüssel ist `(gruppe_id, map_object_id)`, eine Gruppe kann also
     * nicht mehr Mitglieder haben, als das Revier Kartenobjekte hat — Söder 196.
     * Fällig wird die Paginierung mit dem ersten Revier jenseits von 1000
     * Objekten, nicht mit der ersten großen Gruppe.
     *
     * `.order('name')`: die Tabelle hat kein `sequence` und die Gruppe ist eine
     * Menge — es gibt keine fachliche Reihenfolge, also die vorhersagbare.
     */
    supabase
      .from('standgruppen')
      .select('id, name, standgruppen_staende ( map_object_id )', { count: 'exact' })
      .eq('district_id', revier.id)
      .order('name'),
    /**
     * Der Standzustand — die jüngste Prüfzeile je Kartenobjekt (Migration 117).
     *
     * **Die View wird gefragt, nicht die Tabelle.** Sie trägt
     * `distinct on (map_object_id)` und ist damit für alle drei Clients
     * dieselbe Wahrheit; das Client-Dedup, das sie ersetzt, wird ab 2000
     * Historienzeilen still falsch — ein Stand mit alter Sperre erschiene dort
     * als nie geprüft.
     *
     * `district_id` steht in der View, die Objekt-IDs müssen also nicht
     * hineingereicht werden — eine Abfrage, keine Liste von 196 Kennungen.
     *
     * **`geladen` statt `vollstaendig`, anders als bei den Objekten daneben:**
     * die View gibt höchstens so viele Zeilen wie es Kartenobjekte gibt, und
     * die tragen mit `vollstaendig` bereits den Riegel gegen eine Abschneidung.
     * Ein zweiter Zähler auf derselben Obergrenze wäre eine zweite Wahrheit
     * über dieselbe Menge.
     */
    supabase
      .from('map_object_letzte_pruefung')
      .select('map_object_id, status, checked_at, note, checked_by')
      .eq('district_id', revier.id),
    // konto_namen() statt profiles — s. `src/lib/konto-namen.ts`. Für „von wem
    // geprüft" im Inspektor. Der Prüfer kann ein Schein-Inhaber sein und der
    // Leser der Revierbesitzer, ohne dass beide je eine Jagd geteilt haben —
    // über `profiles` wäre der Name nach Migration 116 still verschwunden
    // (Fremdprüfung 22.08.2026, F3).
    supabase.rpc('konto_namen'),
  ])

  const objekte = vollstaendig<Objekt>(objekteErgebnis, 'Kartenobjekte')

  const gruppen = ausZeilen(vollstaendig<StandgruppeZeile>(gruppenErgebnis, 'Standgruppen'))

  const pruefungen = alsPruefungen(geladen<PruefZeile[]>(pruefErgebnis, 'Standprüfungen'))

  /**
   * Die Namen der Prüfer.
   *
   * **`geladen()` erkennt keine Abschneidung, und das ist ein Befund der
   * Fremdprüfung** (25.08.2026, `[medium]`): `konto_namen()` ist ungepagt und
   * nimmt bewusst KEINEN Parameter — eine übergebene Kennung wäre ein Orakel
   * zum Durchprobieren (dieselbe Entscheidung wie bei `meine_einladungen()`,
   * Migration 080). Es gibt also keinen gefilterten Weg; PostgREST kappt die
   * Antwort bei `db-max-rows` still, und danach stünde bei einer vorhandenen
   * Prüfung „ohne Namen", obwohl der Name abrufbar wäre.
   *
   * **Deshalb hier der Deckel-Test statt eines gefilterten Abrufs.** Er wirft,
   * wie `vollstaendig()` es täte — die Haltung dieses Verzeichnisses ist, dass
   * eine Seite lieber schweigt, als halb Auskunft zu geben (`laden.ts`).
   * Bestand am 25.08.2026: **9 Konten.** Der Fall ist damit weit außer
   * Reichweite; er kostet drei Zeilen und schließt eine Lücke, die sonst erst
   * auffiele, wenn niemand mehr hersieht.
   *
   * **Dieselbe Lücke haben die drei anderen `konto_namen()`-Leser im Repo**
   * (`jagden/[id]/page.tsx`, `app/app/chat/*`, `app/app/hunt/*`) — sie steht
   * als CP-71 im Backlog, nicht hier, weil sie nicht zu diesem Diff gehört.
   */
  const kontoZeilen = geladen<KontoName[]>(namenErgebnis, 'Kontonamen')
  if (!kontoNamenVollstaendig(kontoZeilen)) {
    throw new Error(
      `Kontonamen: ${kontoZeilen.length} Zeilen — das ist die PostgREST-Grenze. ` +
        'Die Antwort ist womöglich abgeschnitten, und Prüfernamen fehlten dann ' +
        'lautlos. konto_namen() braucht Paginierung (Backlog CP-71).'
    )
  }
  const prueferNamen = new Map(kontoZeilen.map((k) => [k.id, k.display_name]))

  /**
   * Das laufende Jagdjahr, EINMAL für die ganze Seite abgelesen.
   *
   * Zweimal abzulesen wäre die Falle, die die Übersicht schon einmal hatte
   * (Fremdprüfung 08.08.2026, P8): ein Aufruf über die Grenze am 1. April
   * bewertete Kachel und Karte gegen verschiedene Saisons.
   *
   * **`jetzt` geht zusätzlich in die Auswertung**, weil eine Prüfung nicht in
   * der Zukunft liegen darf (Fremdprüfung 25.08.2026, `[hoch]` — s.
   * `inDieserSaison`). Dieselbe Ablesung für beides, aus demselben Grund.
   */
  const jetzt = new Date()
  const jagdjahr = getJagdjahr(jetzt)

  const stand = bilanz(
    objekte.map((o) => ({ id: o.id, typ: o.type })),
    pruefungen,
    jagdjahr,
    jetzt
  )

  /**
   * Die letzte Prüfung eines Objekts in die Form, die Karte und Inspektor
   * brauchen — Ampel plus die drei Felder der Zeile „Name · Zustand · wann ·
   * von wem" (Konzept Standzustand §3).
   *
   * **Der Name wird HIER aufgelöst und nicht im Client.** Er ist eine
   * Server-Auskunft: `konto_namen()` liegt in derselben Welle, und der
   * Inspektor ist eine Client-Komponente, die sonst eine zweite Runde drehen
   * müsste, um einen Namen zu einer Kennung zu bekommen.
   *
   * **`null` heißt „unbekannt", nicht „niemand".** Ein Prüfer, dessen Konto
   * gelöscht wurde, steht nicht in `konto_namen()`; die Zeile bleibt dann ohne
   * Namen stehen, statt zu verschwinden — die Prüfung hat stattgefunden.
   */
  const pruefungFuer = (objektId: string) => {
    const p = pruefungen.get(objektId)
    if (!p) return null
    return {
      ...p,
      ampel: ampel(p, jagdjahr, jetzt),
      prueferName: p.checkedBy === null ? null : (prueferNamen.get(p.checkedBy) ?? null),
    }
  }

  const grenze = parsePolygonHex(revier.boundary)
  const punkte = objekte.reduce<Punkt[]>((acc, o) => {
    const p = punktAus(o.position)
    if (p)
      acc.push({
        id: o.id,
        name: o.name,
        typ: o.type,
        lat: p.lat,
        lng: p.lng,
        beschreibung: o.description,
        fotoUrl: o.photo_url,
        pruefung: pruefungFuer(o.id),
      })
    return acc
  }, [])

  return (
    <div className="zentrale-wrap">
      {/* Die Kopfzeile gehört seit dem 08.08.2026 der Client-Komponente: sie
          zeigt im Ruhezustand genau das, was hier vorher stand, plus einen
          Stift. Der `key` ist tragend wie an der Karte — beim Revierwechsel
          ändert sich nur `?revier=`, Next behält dieselbe Client-Instanz, und
          ohne ihn stünde ein halb getippter Name über dem nächsten Revier. */}
      <RevierName key={revier.id} revierId={revier.id} name={revier.name} />
      <h1>Revier</h1>
      <p className="zentrale-sub">Grenze, Stände und Kartenobjekte</p>

      {/* **Gezählt statt gefragt.** Die Objekte liegen für die Karte ohnehin
          schon hier — ein `head`-Count daneben wäre eine zweite Wahrheit, die
          von der gezeichneten abweichen kann. `istStand()` statt einer eigenen
          Aufzählung, aus demselben Grund. */}
      <div className="zentrale-kennzahlen">
        <Kennzahl
          label="Fläche"
          wert={revier.area_ha === null ? '—' : zahl.format(revier.area_ha)}
          einheit={revier.area_ha === null ? undefined : 'ha'}
          fuss={revier.area_ha === null ? 'keine Grenze gezeichnet' : 'aus der Reviergrenze'}
        />
        <Kennzahl
          label="Sitze"
          wert={String(objekte.filter((o) => istStand(o.type)).length)}
          fuss={`von ${objekte.length} ${objekte.length === 1 ? 'Kartenobjekt' : 'Kartenobjekten'}`}
        />
        {/**
         * **Der Standzustand als Bestandsfrage** (Konzept Standzustand §4.2).
         *
         * **Hier steht „geprüft", obwohl §3 es für die Zusammenfassung
         * ausdrücklich ausschließt** — und das ist kein Widerspruch, sondern
         * der dort benannte Unterschied: die Zusammenfassung beantwortet die
         * ARBEITSfrage („woran muss ich noch?", deshalb „32 offen"), die Kachel
         * die BESTANDSfrage („wie weit bin ich?"). Eine Kachel trägt genau eine
         * Zahl, und für einen Bestand ist das die erledigte, nicht die offene.
         *
         * **Die Fußnote nennt die Grundmenge, weil sie eine andere ist als
         * eine Zeile darüber.** „Sitze" zählt drei Typen (worauf ein Schütze
         * sitzt), der Zustand sieben (was gepflegt wird — Kirrung, Salzlecke,
         * Wildacker und Wildkamera zählen mit, s. `wartung.ts`). Ohne die
         * Fußnote stünden hier zwei Zahlen nebeneinander, die verschieden
         * zählen, ohne dass es jemand sehen könnte.
         *
         * **Und sie nennt das Jagdjahr**, weil die Zahl zum 1. April springt:
         * ein „ok" vom letzten Herbst zählt danach wieder als offen. Ohne den
         * Zusatz sähe der Sprung wie ein Datenverlust aus.
         */}
        <Kennzahl
          label="Geprüft"
          wert={stand.sitze === 0 ? '—' : String(stand.sitze - stand.offen)}
          fuss={
            stand.sitze === 0
              ? 'keine Jagdeinrichtungen im Revier'
              : `von ${stand.sitze} ${stand.sitze === 1 ? 'Jagdeinrichtung' : 'Jagdeinrichtungen'} · ${jagdjahr.label}`
          }
        />
      </div>

      {/**
       * **Zwei Mengen, und sie dürfen nicht dieselbe sein** (Fremdprüfung Codex
       * 17.08.2026, Nr. 5, `[medium]`):
       *
       * - `punkte` ist, was der Nutzer WÄHLEN kann: nur Standtypen.
       *   `standgruppen_staende.map_object_id` nimmt jeden `map_objects`-Typ —
       *   ein Parkplatz oder eine Wildkamera ließe sich sonst als Stand
       *   speichern und später in ein Treiben kopieren. Dieselbe Lehre wie bei
       *   den Treiben (Fremdprüfung 10.08.2026, A9/B9, dort `[high]`).
       * - `sichtbareIds` ist, was der Nutzer SEHEN kann: alle Kartenobjekte des
       *   Reviers, jeden Typs. Daraus rechnet `gruppenDiff()` seinen Schutz für
       *   weich gelöschte Mitglieder.
       *
       * **Wären beide dieselbe Menge, wäre ein umgetypter Stand GEFANGEN:** wer
       * im Objekt-Inspektor der Karte darüber einen Hochsitz zum Parkplatz
       * macht, nähme sein Gruppenmitglied aus `sichtbar` — und der
       * Papierkorb-Schutz hielte eine Zeile fest, die niemand mehr abwählen
       * kann. Der Weg dorthin liegt auf DIESER Seite, keine zwei Klicks weit.
       *
       * **Der Filter läuft auf den geladenen Punkten statt in einer zweiten
       * Abfrage**, und die Lehre „der Filter sitzt in der ABFRAGE, nicht im
       * Client" hält trotzdem: `page.tsx` ist eine SERVER-Komponente, im
       * Browser kommt die ungefilterte Liste nie an. Eine zweite Abfrage wäre
       * eine zweite Ladung derselben Zeilen und eine zweite Wahrheit über „was
       * ist ein Stand"; die Revierkarte darüber braucht ohnehin alle 196.
       * `istStand()` statt einer eigenen Aufzählung, wie an der Kennzahl oben.
       *
       * **Weich gelöschte Objekte sind in BEIDEN Mengen schon draußen**, ohne
       * dass die Abfrage sie ausschließt: alle SELECT-Policies auf
       * `map_objects` tragen `deleted_at IS NULL` (an der Produktion als
       * Besitzer gemessen, 17.08.2026 — 0 von 1 sichtbar).
       */}
      {/**
       * **Karte und Gruppen liegen in EINER Client-Klammer**, seit der
       * Standgruppen-Editor seine eigene zweite Karte verloren hat (18.08.2026).
       * Die Begründung steht in `arbeitsbereich.tsx`; hier zählt nur die Folge
       * für diese Datei: `page.tsx` rendert nicht mehr zwei Geschwister, sondern
       * einen Koordinator, und der `key` wandert mit nach innen an die Karte.
       *
       * **`page.tsx` bleibt SERVER-Komponente**, und das ist der Punkt, an dem
       * so ein Umbau kippt: die Klammer ist ein dünner Client-Rahmen, der die
       * hier geladenen Daten nur durchreicht. Sie noch einmal im Client zu laden
       * wäre eine zweite Wahrheit über denselben Bestand.
       */}
      <div className="zentrale-block">
        {/**
         * **`key={revier.id}` gehört an DIESE Komponente, nicht nur an die
         * Karte darin** (Fremdprüfung Codex 18.08.2026, Nr. 10, `[hoch]` — ein
         * Regress dieses Umbaus). Vorher trug `StandgruppenBereich` den key
         * selbst; beim Verschieben in die Klammer blieb er an der Karte hängen.
         *
         * Ohne ihn überlebt der Client-Zustand einen Revierwechsel — es ändert
         * sich ja nur `?revier=`, Next behält dieselbe Instanz. Wer in Revier A
         * einen Gruppennamen tippt, zu Revier B wechselt und dort „Anlegen"
         * drückt, **schreibt ihn nach B**: das Feld überlebt, `revierId` ist
         * inzwischen ein anderes. Aktive Gruppe und Entwurf ebenso.
         */}
        <RevierArbeitsbereich
          key={revier.id}
          revierId={revier.id}
          grenze={grenze}
          punkte={punkte}
          waehlbareIds={punkte.filter((p) => istStand(p.typ)).map((p) => p.id)}
          sichtbareIds={punkte.map((p) => p.id)}
          gruppen={gruppen}
        />
      </div>
    </div>
  )
}
