/**
 * Den Standzustand laden und eintragen — der Datenweg für die **Client**-Wege
 * der PWA.
 *
 * Konzept: `docs/konzepte/QuickHunt_Konzept_Standzustand_V1.md` (in
 * quickhunt-native), §4.4 mobiler Revier-Editor und §2.2 Jagdkarte.
 * Datengrundlage ist die View `map_object_letzte_pruefung` aus Migration 117.
 * Die REGEL dahinter — was ein Zustand bedeutet, was „diese Saison" heißt —
 * steht in `wartung.ts` und ist bewusst importfrei; **hier steht nur, wie die
 * Zeilen kommen und gehen.**
 *
 * **Warum es diese Datei gibt.** Am 25.08.2026 entstand der Schreibpfad im
 * mobilen Revier-Editor (`app/app/du/revier/[id]/revier-content.tsx`) und
 * kostete dort eine ganze Prüfkette: das Nachlesen der View nach dem Insert
 * (Fremdprüfung A6 `[hoch]`), der Riegel gegen eine Zeile ohne Zeitstempel
 * (A8), das `catch` um genau dieses Nachlesen (selbst gefunden, NACH dem
 * letzten Prüflauf). Der zweite Weg — die Jagdkarte — braucht denselben Pfad.
 * **Eine zweite Fassung wäre die Zweitimplementierung, die in diesem Projekt
 * schon einmal auseinandergelaufen ist**; die vier teuer erkauften Details
 * wären dort per Konstruktion nicht dabei, und niemand hätte einen Anlass
 * nachzusehen.
 *
 * **Der Riegel gegen die leere Notiz steht deshalb HIER und nicht im Sheet**
 * (S2): ein Gate, das allein in der Anzeige sitzt, ist keines. Beide Aufrufer
 * erben ihn, ohne ihn zu kennen.
 *
 * **Rein clientseitig.** `createClient()` ist der Browser-Client; der
 * Server-Weg des mobilen Editors (`page.tsx`, RSC) lädt weiter selbst und
 * bleibt unangetastet — er hat den Vorteil, dass die Zeilen schon im ersten
 * Bild stehen, und ihn dafür einzutauschen wäre ein Rückschritt.
 */

import { createClient } from '@/lib/supabase/client'
import { kontoNamenVollstaendig, type KontoName } from '@/lib/konto-namen'
import type { PruefStatus, PruefZeile } from '@/lib/revier/wartung'

/**
 * Die Spalten der View, an einer Stelle. Sie stehen in vier Abfragen dieses
 * Repos wörtlich gleich; eine ausgelassene Spalte fiele nicht als Fehler auf,
 * sondern als fehlende Notiz.
 */
const VIEW_SPALTEN = 'map_object_id, status, checked_at, note, checked_by'

/**
 * Wo PostgREST eine ungepagte Antwort abschneidet (`db-max-rows`).
 *
 * Dieselbe Zahl wie in `konto-namen.ts` und `app/zentrale/laden.ts`, und
 * bewusst nicht von dort importiert: die eine ist modulprivat, die andere
 * gehört dem Portal. Wer sie ändert, ändert sie am Server, nicht hier.
 */
const POSTGREST_DECKEL = 1000

/** Was über den Prüfstand eines ganzen Reviers bekannt ist. */
export type Pruefstand = {
  /** Die jüngste Prüfzeile je Kartenobjekt — roh, wie die View sie liefert. */
  zeilen: PruefZeile[]
  /**
   * **Ladefehler ODER abgeschnittene Antwort.** Für den Leser ist die Auskunft
   * dieselbe: wir wissen es nicht. Ein eigener Zustand „teilweise geladen"
   * wäre eine Unterscheidung ohne Handlungsfolge — dieselbe Entscheidung wie
   * im RSC-Pfad des mobilen Editors.
   *
   * Der Deckel zählt mit, weil eine gekappte Antwort sonst als „noch nie
   * geprüft" durchkäme — **eine Sperre also als Schweigen** (Fremdprüfung
   * 25.08.2026, A7).
   */
  fehler: boolean
  /**
   * Klarnamen der Prüfer, nach Kennung. **Leer, wenn `konto_namen()` gekappt
   * wurde** — dann fallen alle Namen weg statt einzelne still zu fehlen
   * (s. `kontoNamenVollstaendig`).
   */
  namen: Record<string, string>
}

/**
 * Der leere Stand — **kein Fehler, sondern „noch nichts geladen"**.
 * Existiert, damit ein Aufrufer den Anfangszustand nicht selbst erfindet und
 * dabei versehentlich `fehler: true` setzt: das hieße „nicht abrufbar", und
 * eine Karte, die beim Aufbau behauptet, sie könne den Prüfstand nicht
 * abrufen, hat gelogen, bevor sie es versucht hat.
 */
export const PRUEFSTAND_LEER: Pruefstand = { zeilen: [], fehler: false, namen: {} }

/**
 * Den Prüfstand eines Reviers holen — Zeilen und Prüfernamen in EINER Welle.
 *
 * Beide werden für dieselbe Zeile gebraucht („Zustand · wann · von wem"),
 * deshalb `Promise.all` und nicht nacheinander.
 *
 * **Wirft nicht.** Wer im Wald eine Jagdkarte öffnet, bekommt sie auch dann,
 * wenn der Prüfstand gerade nicht kommt; der Fehlerfall steht als Satz im
 * Sheet, nicht als leerer Bildschirm.
 *
 * @param eigeneId die eigene Kennung — sie kommt in den Namen IMMER vor, auch
 *   wenn sie in keiner geladenen Zeile steht. Ohne sie stünde nach der ersten
 *   eigenen Prüfung „Geprüft 〈Zeit〉" ohne „von 〈Name〉" (Schlusslesung
 *   25.08.2026, T1(f)). Den eigenen Namen kennt man.
 */
export async function ladePruefstand(
  districtId: string,
  eigeneId: string | null,
): Promise<Pruefstand> {
  const supabase = createClient()

  const [pruefErgebnis, namenErgebnis] = await Promise.all([
    supabase
      .from('map_object_letzte_pruefung')
      .select(VIEW_SPALTEN)
      .eq('district_id', districtId),
    // konto_namen() statt profiles — s. `src/lib/konto-namen.ts`. Der Prüfer
    // kann ein Schein-Inhaber sein und der Leser ein Mitjäger, ohne dass beide
    // je eine Jagd geteilt haben; über `profiles` wäre der Name nach Migration
    // 116 still verschwunden.
    supabase.rpc('konto_namen'),
  ])

  const zeilen = (pruefErgebnis.data ?? []) as PruefZeile[]
  const kontoZeilen = (namenErgebnis.data ?? []) as KontoName[]

  /**
   * **Ein Fehler der Namensabfrage darf nicht wortlos verschwinden**
   * (Schlusslesung 26.08.2026, F5). Er degradiert ehrlich — bei leerer Antwort
   * fehlen schlicht alle Namen, und „ohne Namen" heißt bereits dokumentiert
   * „Konto nicht auflösbar" —, aber im Log war der Fall bisher unsichtbar und
   * damit von einer Installation mit null Konten nicht zu unterscheiden.
   * **Kein `fehler`-Flag:** der Prüfstand selbst ist davon unberührt, und eine
   * fehlende Namenszeile ist keine falsche Auskunft über einen Stand.
   */
  if (namenErgebnis.error) {
    console.warn('konto_namen() nicht abrufbar — Prüfernamen fehlen:', namenErgebnis.error.message)
  }

  const namen: Record<string, string> = {}
  if (kontoNamenVollstaendig(kontoZeilen)) {
    /**
     * **Nur die Namen, die hier wirklich vorkommen** (Fremdprüfung 25.08.2026,
     * A9). Die volle Antwort wäre jedes Konto der Installation für ein Revier
     * mit vier Prüfern — kein Rechteloch, aber ein Datenbedarf, der nicht
     * besteht und mit der Nutzerzahl wächst statt mit dem Revier.
     */
    const gebraucht = new Set(
      zeilen.map((z) => z.checked_by).filter((id): id is string => id !== null),
    )
    if (eigeneId) gebraucht.add(eigeneId)
    for (const k of kontoZeilen) {
      if (gebraucht.has(k.id)) namen[k.id] = k.display_name
    }
  } else {
    console.warn(
      `konto_namen(): ${kontoZeilen.length} Zeilen — PostgREST-Deckel erreicht. ` +
        'Prüfernamen werden ausgelassen (Backlog CP-71).',
    )
  }

  return {
    zeilen,
    fehler: pruefErgebnis.error !== null || zeilen.length >= POSTGREST_DECKEL,
    namen,
  }
}

/**
 * Warum eine Prüfung nicht geschrieben wurde. **Nicht exportiert** — der Typ
 * ist über `Schreibergebnis` erreichbar, und ein exportiertes Symbol ohne
 * eigenen Leser ist Fläche ohne Nutzen.
 */
type Schreibfehler = 'notiz-fehlt' | 'schreibfehler'

export type Schreibergebnis =
  | {
      ok: true
      /** Was danach in der View steht — nachgelesen, nicht angenommen. */
      zeile: PruefZeile
      /**
       * Der Zeitstempel der EIGENEN Zeile.
       *
       * **Getrennt von `zeile`, und das ist der Zweck des Feldes:** gewinnt
       * beim Nachlesen ein fremder, noch jüngerer Eintrag, ist der eigene
       * trotzdem der Beleg dafür, dass die Uhr mindestens bis hierher gelaufen
       * ist. Der Aufrufer rückt seinen Bezugszeitpunkt daran vor, sonst liest
       * der Zukunfts-Riegel aus `wartung.ts` den eigenen Eintrag als noch nicht
       * geschehen.
       */
      geschriebenAm: string
      /**
       * **Das Nachlesen ist nicht durchgekommen — die Zeile liegt, aber ob sie
       * die JÜNGSTE ist, wissen wir nicht** (Fremdprüfung 26.08.2026, A1
       * `[hoch]`).
       *
       * Der Aufrufer muss daraus seinen Fehlerzustand machen, sonst kehrt
       * genau der Fall zurück, gegen den das Nachlesen gebaut ist: schreibt
       * jemand zwischendurch eine Sperre, setzt der eigene Bildschirm seine
       * ältere `ok`-Zeile darüber und zeigt „Geprüft", während die View die
       * Sperre führt.
       *
       * **Der Fehler war, `catch` für ausreichend zu halten:** `maybeSingle()`
       * gibt einen PostgREST-Fehler regulär als `{ data: null, error }` zurück
       * und lehnt das Promise nicht ab. Der `catch` deckt den Netzabbruch, das
       * Fehlerfeld deckte niemand.
       */
      standUnsicher: boolean
    }
  | { ok: false; grund: Schreibfehler }

/**
 * Eine Prüfung eintragen — und danach nachlesen, was in der View steht.
 *
 * **Die Notiz ist bei Mangel und Sperre Pflicht** (Moritz, 25.08.2026). Der
 * Riegel steht hier, nicht nur im Sheet: ein Gate, das allein in der Anzeige
 * sitzt, ist keines (S2). Damit folgt die PWA dem Portal; die Feld-App lässt
 * eine leere Eingabe bis heute als `null` durch und ist die Stelle, die
 * nachzieht.
 */
export async function schreibePruefung(
  objektId: string,
  userId: string,
  status: PruefStatus,
  note: string | null,
): Promise<Schreibergebnis> {
  const notiz = note?.trim() ? note.trim() : null
  if (status !== 'ok' && notiz === null) return { ok: false, grund: 'notiz-fehlt' }

  const supabase = createClient()
  const antwort = await supabase
    .from('map_object_checks')
    .insert({ map_object_id: objektId, checked_by: userId, status, note: notiz })
    // `.select()` ist Pflicht: ohne sie ist `data` immer `null`, und ein von
    // RLS auf 0 Zeilen zusammengestrichener Insert sähe aus wie ein Erfolg
    // (S1). Genau dieser stille Erfolg ist in diesem Repo mehrfach bezahlt
    // worden (Backlog E-R1).
    .select(VIEW_SPALTEN)

  if (antwort.error) {
    console.error('Prüfung fehlgeschlagen:', antwort.error.message)
    return { ok: false, grund: 'schreibfehler' }
  }
  const geschriebene = (antwort.data as PruefZeile[] | null)?.[0]
  if (!geschriebene) {
    console.error('Prüfung fehlgeschlagen: 0 Zeilen betroffen (RLS oder Objekt fehlt)')
    return { ok: false, grund: 'schreibfehler' }
  }

  /**
   * **Eine Zeile ohne `checked_at` ist ein Schreibfehler, kein Erfolg**
   * (Fremdprüfung 25.08.2026, A8). Der Fall kann nicht eintreten — die Spalte
   * ist NOT NULL mit Default `now()` —, aber der Typ lässt ihn zu (eine View
   * kennt keine NOT-NULL-Zusage). Ohne diesen Zweig wanderte die Zeile in den
   * Zustand, `alsPruefungen()` verwürfe sie dort still, und der Stand stünde
   * unmittelbar nach einer gelungenen Meldung wieder auf „Noch nie geprüft".
   */
  if (!geschriebene.checked_at) {
    console.error('Prüfung ohne Zeitstempel zurückgekommen:', geschriebene)
    return { ok: false, grund: 'schreibfehler' }
  }

  /**
   * Was jetzt in der View steht — **nachgelesen, nicht angenommen**
   * (Fremdprüfung 25.08.2026, A6 `[hoch]`).
   *
   * Die eigene Zeile einfach einzusetzen bildete die View nur nach, solange
   * niemand sonst schreibt. Schreibt A „ok", danach B „gesperrt", und trifft
   * erst dann As Antwort ein, ersetzt A seine Zeile durch die eigene ältere:
   * die View führt Bs Sperre, As Bildschirm zeigt „Geprüft". Ein
   * sicherheitsrelevanter Zustand, der falsch steht, bis jemand neu lädt.
   *
   * Eine Zeile, gefiltert auf dieses eine Objekt, hinter dem bereits gelungenen
   * Schreiben — die Wartezeit liegt also nach der Sicherheit, nicht davor.
   */
  let zeile = geschriebene
  let standUnsicher = false
  try {
    const nachgelesen = await supabase
      .from('map_object_letzte_pruefung')
      .select(VIEW_SPALTEN)
      .eq('map_object_id', objektId)
      .maybeSingle()
    if (nachgelesen.error) {
      // **Ein Fehler im Feld, keine Ausnahme** — s. `standUnsicher` oben.
      console.warn('Prüfstand nach dem Schreiben nicht lesbar:', nachgelesen.error.message)
      standUnsicher = true
    } else if (nachgelesen.data) {
      zeile = nachgelesen.data as PruefZeile
    }
  } catch (e) {
    // **Der `catch` ist lasttragend und kein Zierat.** Ohne ihn risse ein
    // Netzabbruch beim Nachlesen den ganzen Aufruf mit — und meldete einen
    // Fehlschlag für eine Prüfung, die längst in der Datenbank steht. Der
    // Melder tippt sie dann ein zweites Mal, und in einem Log ohne
    // DELETE-Policy stehen danach zwei Zeilen (CP-74). **Der Fehler wäre also
    // schlimmer als das Problem, gegen das das Nachlesen gebaut ist.**
    console.warn('Prüfstand konnte nach dem Schreiben nicht nachgelesen werden:', e)
    standUnsicher = true
  }

  return { ok: true, zeile, geschriebenAm: geschriebene.checked_at, standUnsicher }
}

/**
 * Den Zustand EINES Standes frisch lesen — für den Augenblick, in dem er
 * zählt.
 *
 * **Der Befund dahinter ist der schwerste dieser Prüfkette** (Fremdprüfung
 * 26.08.2026, B9 `[hoch]`, aus dem OFFENEN Fokuspunkt): `ladePruefstand()`
 * läuft einmal beim Aufbau der Karte, danach ändert nur der eigene Schreibweg
 * noch etwas. **Eine Sperre, die jemand anderes im Wald meldet, bleibt für
 * diese Sitzung unsichtbar** — und genau darauf stützt der Jagdleiter seine
 * Einteilung. Bei einer Drückjagd ist das der Schadensfall, gegen den das
 * ganze Prüflog gebaut wurde.
 *
 * Dieselbe Antwort gibt die Feld-App: sie lädt den Prüfstand beim ÖFFNEN des
 * Sheets (`fetchLastCheck(oid)`), nicht beim Aufbau der Karte.
 *
 * **Was das NICHT leistet, und das gehört benannt:** es ist eine Anzeige, kein
 * Riegel. Zwischen dem Lesen und dem `insert` in `hunt_seat_assignments` liegt
 * ein Fenster, in dem eine Sperre entstehen kann. Dagegen hülfe nur eine
 * serverseitige Prüfung im selben Schritt — eine Migration, und die ist hier
 * bewusst nicht im Umfang (Backlog CP-77).
 */
export async function ladePruefungFuer(
  objektId: string,
): Promise<{ zeile: PruefZeile | null; fehler: boolean }> {
  const supabase = createClient()
  try {
    const { data, error } = await supabase
      .from('map_object_letzte_pruefung')
      .select(VIEW_SPALTEN)
      .eq('map_object_id', objektId)
      .maybeSingle()
    if (error) {
      console.warn('Prüfstand des Standes nicht lesbar:', error.message)
      return { zeile: null, fehler: true }
    }
    return { zeile: (data as PruefZeile | null) ?? null, fehler: false }
  } catch (e) {
    console.warn('Prüfstand des Standes nicht abrufbar:', e)
    return { zeile: null, fehler: true }
  }
}
