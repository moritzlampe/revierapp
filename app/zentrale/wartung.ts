/**
 * Der Standzustand — die reine Logik dahinter, für die Auskunft im Portal.
 *
 * Konzept: `docs/konzepte/QuickHunt_Konzept_Standzustand_V1.md` §4.2
 * (quickhunt-native). Datengrundlage ist die View `map_object_letzte_pruefung`
 * aus Migration 117: die jüngste Prüfzeile je Kartenobjekt, für alle drei
 * Clients dieselbe.
 *
 * **Abgeschrieben, nicht erfunden.** Quelle ist der native Track,
 * `src/lib/revier/wartung.ts` (entworfen von Moritz am 22.08.2026, dort mit
 * Jest-Tests abgesichert). Schlüssel, Schwellen und Zählregeln sind dort
 * gelockt; das Portal übernimmt sie wörtlich, damit Karte, Kachel und Agenda
 * dieselbe Aussage treffen wie die Feld-App. Wer die Regel ändern will, ändert
 * sie dort zuerst. Dasselbe Muster wie `OBJEKT_KATEGORIEN` in `objekte.ts` —
 * ein Import über die Repo-Grenze ginge nicht, und R1 lässt das Portal ohnehin
 * nur unter `app/zentrale/**` schreiben.
 *
 * **Die eine Einsicht, aus der alles folgt: es sind ZWEI Fragen.**
 *
 *     „Kann ich da hoch?"          — der letzte bekannte Zustand gilt,
 *                                    unabhängig vom Alter.
 *     „Muss ich diese Saison hin?" — hier verfällt „heil", denn eine Prüfung
 *                                    vom Januar sagt über den Herbst nichts.
 *
 * Moritz wörtlich: *„wenn ich jetzt am 15. April eine Jagd mache und im Januar
 * war der Stand grün -> verwendbar, war er rot -> auch am 15. April
 * gesperrt."*
 *
 * Deshalb trägt die Marke zwei Achsen: die **Farbe** sagt den Zustand, die
 * **Füllung** den Saisonstand.
 *
 * Bewusst **ohne jeden Import** — dadurch mit
 * `node --experimental-strip-types app/zentrale/wartung.selftest.ts` prüfbar,
 * ohne Pfad-Alias, Env oder Netz. Dasselbe Muster wie `handlungsbedarf.ts`,
 * `objekte.ts` und `namen.ts`.
 *
 * **Deshalb nehmen die Funktionen die Saison als Parameter, statt sie
 * auszurechnen:** die Jagdjahr-Regel steht bereits in `src/lib/diary/season.ts`
 * (`getJagdjahr`, 1. April bis 31. März, Europe/Berlin) und ist dort mit der
 * nativen Fassung zeichengleich. Eine zweite Fassung hier wäre genau die
 * Zweitimplementierung, die im Projekt schon einmal auseinandergelaufen ist —
 * und ein Import würde die Prüfbarkeit ohne Bundler kosten. Der Aufrufer ruft
 * erst `getJagdjahr()`, dann diese Funktionen. Zeichengleiche Begründung wie
 * bei `laeuftBaldAb` in `handlungsbedarf.ts`.
 */

/**
 * Was die Karte zeigt.
 *
 * `offen` trägt bewusst KEINE Marke — der Design-Lock vom 07.08.2026 sagt es:
 * *„ein Grundzustand darf nicht wie ein Mangel aussehen."* Am 1. April ist die
 * Zustandsebene fast leer, und genau das heißt „hier ist diese Saison noch
 * nichts passiert".
 */
export type Ampel =
  | 'offen'
  | 'ok-voll'
  | 'ok-hohl'
  | 'mangel-voll'
  | 'mangel-hohl'
  | 'gesperrt'

/**
 * Die zehn Werte des Portal-Enums `map_object_type` (s. `OBJEKT_TYPEN` in
 * `objekte.ts`) — hier als eigene Union, weil die Datei importfrei bleibt.
 *
 * **`adhoc` fehlt und das ist richtig:** den Typ kennt nur die Feld-App (ein
 * während der Jagd gesetzter Stand), im Enum steht er nicht. Die native
 * Fassung führt ihn deshalb mit `false`.
 */
type ObjektTypWartung =
  | 'hochsitz'
  | 'kanzel'
  | 'drueckjagdstand'
  | 'parkplatz'
  | 'kirrung'
  | 'salzlecke'
  | 'wildkamera'
  | 'sonstiges'
  | 'wildacker'
  | 'notfall_treffpunkt'

/**
 * Welche Objektarten einen Wartungszustand haben.
 *
 * **Der Schnitt ist an Söder gemessen, nicht geraten** (nativer Track,
 * 22.08.2026): die 21 `sonstiges`-Objekte dort heißen Wendeplatz,
 * Forsthausteich, Bushaltestelle, Eiskeller, Steinbruch, Passeiche,
 * Brunftplatz. Das sind Orientierungsmarken — ein Steinbruch hat keinen
 * Wartungszustand. Von 196 Objekten bleiben 173.
 *
 * **Weiter als `istStand()`, und das ist Absicht:** eine Kirrung, eine
 * Salzlecke, ein Wildacker und eine Wildkamera werden gepflegt, auch wenn
 * niemand darauf sitzt. Die beiden Mengen beantworten verschiedene Fragen —
 * „worauf sitzt ein Schütze" gegen „was muss ich abgehen" —, und wer sie
 * zusammenlegt, verliert eine davon.
 *
 * Als `Record` und nicht als Liste, aus demselben Grund wie dort: ein neuer
 * `map_object_type` aus einer Migration schlägt im Selbsttest an, statt still
 * aus der Zählung zu fallen.
 */
export const WARTBAR: Record<ObjektTypWartung, boolean> = {
  hochsitz: true,
  kanzel: true,
  drueckjagdstand: true,
  kirrung: true,
  salzlecke: true,
  wildacker: true,
  wildkamera: true,
  parkplatz: false,
  notfall_treffpunkt: false,
  sonstiges: false,
}

/**
 * Zählt der Wartungsstand diese Objektart mit?
 *
 * Unbekannte Typen sind `false`: käme je ein elfter Enum-Wert dazu, soll er
 * nicht ungefragt in die Bilanz wandern und die Zahlen einer Kachel ändern,
 * die niemand angefasst hat. Der Selbsttest schlägt dann an und benennt ihn.
 */
export function istWartbar(typ: string): boolean {
  return WARTBAR[typ as ObjektTypWartung] === true
}

/** Das laufende Jagdjahr als Intervall — aus `getJagdjahr()`, s. Dateikopf. */
export type Saison = { start: Date; end: Date }

/**
 * Die drei Werte, die `map_object_checks.status` annehmen kann (Migration 066,
 * per CHECK begrenzt).
 *
 * **Als Union und nicht als `string`, und das ist ein Fix aus der Fremdprüfung**
 * (25.08.2026, `[medium]`): vorher nahm `Pruefung.status` jeden String, und
 * `ampel()` behandelte alles außer `mangel` und `gesperrt` als `ok`. Ein
 * fehlerhafter oder neu hinzugekommener Wert wäre damit **grün** geworden —
 * fail-open bei einer Sicherheitsaussage. Meine Begründung dafür („ein vierter
 * Status soll als geprüft erscheinen") war schwach: „ich weiß es nicht" ist
 * nicht dasselbe wie „heil".
 *
 * Der Riegel sitzt jetzt am RAND (`alsPruefungen`), an genau einer Stelle —
 * danach ist `ampel()` erschöpfend und braucht keinen Zweig für Unbekanntes
 * mehr.
 */
export type PruefStatus = 'ok' | 'mangel' | 'gesperrt'

const PRUEF_STATUS: readonly string[] = ['ok', 'mangel', 'gesperrt']

function istPruefStatus(wert: string): wert is PruefStatus {
  return PRUEF_STATUS.includes(wert)
}

/**
 * Ist die Prüfung diese Saison BESTÄTIGT worden — also im laufenden Jagdjahr
 * (1. April bis 31. März) und nicht später als jetzt?
 *
 * **Kein eigenes Fristfeld, und das war die Entscheidung** (Moritz,
 * 22.08.2026): vor der Saison geht man das Revier ab, eine Prüfung vom letzten
 * Herbst sagt über diesen nichts. Das Jagdjahr ist im Repo bereits etabliert,
 * es kostet keine Migration und keinen Einstellungsbildschirm.
 *
 * **Ein unlesbares Datum gilt als NICHT dieser Saison**, nicht als frisch —
 * dieselbe Richtung wie überall sonst in diesem Verzeichnis: im Zweifel „muss
 * angesehen werden" statt „ist erledigt".
 *
 * **`jetzt` ist die dritte Grenze und der Grund, warum diese Funktion einen
 * Parameter mehr hat als die native Vorlage** (Fremdprüfung 25.08.2026,
 * `[hoch]`). `map_object_checks.checked_at` ist client-bestimmbar — weder
 * Trigger noch CHECK, seit Migration 066 (Backlog CN-80). Die Saisongrenzen
 * allein fangen nur die ferne Zukunft: ein `ok` mit `checked_at` im **März
 * 2027** liegt im laufenden Jagdjahr und hätte den Stand heute grün gemacht
 * **und aus `offen` entfernt** — eine Prüfung, die noch gar nicht
 * stattgefunden hat. Im Append-only-Log ist so ein Eintrag zudem nicht regulär
 * korrigierbar.
 *
 * **Damit ist das Portal an dieser Stelle strenger als die Feld-App**, deren
 * `isWithinJagdjahr` nur das Intervall prüft. Die Abweichung ist bewusst und
 * geht in die sichere Richtung: ein zukunftsdatierter Stand erscheint hier als
 * offen, dort als geprüft. Aufgehoben wird sie nicht im Client, sondern von
 * CN-80 — ein DB-Riegel gilt für alle drei Clients auf einmal.
 */
export function inDieserSaison(checkedAtIso: string, saison: Saison, jetzt: Date): boolean {
  const wann = new Date(checkedAtIso)
  if (Number.isNaN(wann.getTime())) return false
  return wann >= saison.start && wann < saison.end && wann <= jetzt
}

/** Eine gelesene Zeile der View `map_object_letzte_pruefung`. */
export type Pruefung = {
  status: PruefStatus
  checkedAt: string
  note: string | null
  checkedBy: string | null
}

/**
 * Der Kartenzustand eines Objekts.
 *
 * **`gesperrt` altert NICHT** — und das ist die sicherheitsrelevante Hälfte der
 * Regel. Eine gebrochene Sprosse ist im April immer noch gebrochen; eine Sperre
 * ist eine Aussage über das Bauwerk, kein Vermerk über einen Besuch.
 *
 * **`mangel` altert ebenfalls nicht in der Farbe, nur in der Füllung:** die
 * Beanstandung besteht fort, aber niemand hat sie diese Saison bestätigt. Gelb
 * ist ein eigener Zustand und wird von selbst weder grün noch rot (Moritz,
 * 25.08.2026 — die Frage, die dieses Stück Portal ausgelöst hat).
 *
 * Nur `ok` verfällt sichtbar — „ich war da und habe geschaut" ist eine Aussage
 * über eine HANDLUNG, und die veraltet.
 *
 * **Kein Zweig für Unbekanntes**, und das ist seit dem 25.08.2026 der Punkt:
 * `status` ist eine Union, der Filter sitzt in `alsPruefungen()`. Vorher fiel
 * jeder fremde Wert in den `ok`-Zweig — fail-open bei einer Sicherheitsaussage
 * (Fremdprüfung, `[medium]`).
 */
export function ampel(pruefung: Pruefung | undefined, saison: Saison, jetzt: Date): Ampel {
  if (!pruefung) return 'offen'
  if (pruefung.status === 'gesperrt') return 'gesperrt'

  const frisch = inDieserSaison(pruefung.checkedAt, saison, jetzt)
  if (pruefung.status === 'mangel') return frisch ? 'mangel-voll' : 'mangel-hohl'
  return frisch ? 'ok-voll' : 'ok-hohl'
}

/** Die Zahlen für Kachel und Agenda. */
export interface Bilanz {
  /** Alle wartbaren Objekte des Reviers. */
  sitze: number
  /** Diese Saison noch nicht angesehen — die ARBEIT. */
  offen: number
  /** Bekannt beanstandet, unabhängig vom Alter — der ZUSTAND. */
  mangel: number
  /** Bekannt gesperrt, unabhängig vom Alter — der ZUSTAND. */
  gesperrt: number
}

/**
 * Die Zusammenfassung: „173 Sitze · 32 offen · 3 Mangel · 2 gesperrt".
 *
 * **Die vier Zahlen addieren sich absichtlich NICHT.** Sie sind zwei Achsen:
 * `offen` ist die Arbeit, `mangel`/`gesperrt` der Zustand. Ein Mangel vom
 * letzten Jahr steht in beiden — er ist gleichzeitig „diese Saison nicht
 * bestätigt" und „bekannt kaputt". Wer eine Summe erwartet, findet keine, und
 * genau deshalb steht es hier und im Konzept (§3) ausgeschrieben.
 *
 * **`gesperrt` zählt als `offen` mit, wenn die Sperre aus einer früheren Saison
 * stammt.** Die Marke sagt „nicht hochsteigen", die Zahl sagt „hingehen und
 * nachsehen, ob es noch gilt" — zwei Fragen, zwei Antworten.
 */
export function bilanz(
  objekte: readonly { id: string; typ: string }[],
  pruefungen: ReadonlyMap<string, Pruefung>,
  saison: Saison,
  jetzt: Date,
): Bilanz {
  let sitze = 0
  let offen = 0
  let mangel = 0
  let gesperrt = 0

  for (const objekt of objekte) {
    if (!istWartbar(objekt.typ)) continue
    sitze += 1

    const pruefung = pruefungen.get(objekt.id)
    if (!pruefung || !inDieserSaison(pruefung.checkedAt, saison, jetzt)) offen += 1
    if (pruefung?.status === 'mangel') mangel += 1
    if (pruefung?.status === 'gesperrt') gesperrt += 1
  }

  return { sitze, offen, mangel, gesperrt }
}

/**
 * Eine rohe Zeile der View `map_object_letzte_pruefung`.
 *
 * **Alle Felder nullable, und das ist keine Schlamperei:** Postgres kennt für
 * eine View keine NOT-NULL-Zusage — `information_schema` meldet dort alle sechs
 * Spalten als `YES`, obwohl vier davon in `map_object_checks` NOT NULL sind
 * (nachgesehen 25.08.2026, zeichengleich zum Befund des nativen Tracks). Der
 * Typ bildet ab, was ankommt, nicht was gelten sollte.
 */
export type PruefZeile = {
  map_object_id: string | null
  status: string | null
  checked_at: string | null
  note: string | null
  checked_by: string | null
}

/**
 * Die gelesenen Zeilen als Nachschlagewerk je Kartenobjekt.
 *
 * **Zeilen ohne Kennung, Status oder Zeitpunkt fallen heraus statt aufgefüllt
 * zu werden.** Der Fall kann nicht eintreten — alle drei Spalten sind in der
 * Tabelle NOT NULL —, ausgeschrieben ist er trotzdem, weil die Alternative die
 * schlechtere ist: eine Zeile ohne Status per Default als „ok" zu lesen wäre
 * genau die stille Falschauskunft über einen sicherheitsrelevanten Zustand,
 * gegen die Migration 066 gebaut wurde. Ein fehlendes Objekt erscheint dann als
 * `offen` — „noch nie angesehen" —, und das ist die Richtung, in die es in
 * diesem Verzeichnis schiefgehen darf.
 *
 * **Ein UNBEKANNTER Status fällt aus demselben Grund heraus** (Fremdprüfung
 * 25.08.2026, `[medium]`). Er kann heute nicht vorkommen — der CHECK aus 066
 * begrenzt die Spalte —, aber bei Schema-Drift oder einer neuen Migration wäre
 * die Alternative fail-open: alles Fremde landete im `ok`-Zweig und würde
 * **grün**. Der Riegel sitzt hier, an genau einer Stelle, statt in jeder
 * Auswertung. Die rohe Historie im Inspektor zeigt den unbekannten Wert
 * weiterhin unverändert an — verschwiegen wird er also nicht, er zählt nur
 * nicht als Prüfung.
 *
 * **Kein Dedup nötig:** die View trägt `distinct on (map_object_id)` und gibt
 * je Objekt genau eine Zeile. Genau dafür gibt es sie — das Client-Dedup, das
 * sie ersetzt, wurde ab 2000 Historienzeilen still falsch (Migration 117).
 */
export function alsPruefungen(zeilen: readonly PruefZeile[]): Map<string, Pruefung> {
  const map = new Map<string, Pruefung>()
  for (const z of zeilen) {
    if (z.map_object_id === null || z.status === null || z.checked_at === null) continue
    if (!istPruefStatus(z.status)) continue
    map.set(z.map_object_id, {
      status: z.status,
      checkedAt: z.checked_at,
      note: z.note,
      checkedBy: z.checked_by,
    })
  }
  return map
}

/**
 * Die Zustandszeile eines Objekts — **wörtlich die der Feld-App**
 * (`quickhunt-native/src/components/revier/StandPruefungAction.tsx`,
 * `stateLine`).
 *
 * Die Begründung steht dort und gilt hier genauso: *„die Aussage ‚zuletzt
 * geprüft am … von …' muss überall gleich lauten. Zwei Kopien liefen
 * auseinander, und die eine, die dann etwas anderes behauptet, wäre die, auf
 * die sich jemand verlässt."* Dass es dennoch eine zweite Kopie gibt, liegt an
 * der Repo-Grenze — deshalb steht die Quelle im Kopf, damit man beim Ändern
 * weiß, wohin.
 *
 * **„Gesperrt" steht zuerst und ohne Umschweife:** wer das liest, soll
 * niemanden hier einteilen. Der Zeitpunkt kommt danach, er ist die Nebensache.
 *
 * **Der Saisonstand steht NICHT in der Zeile**, obwohl die Ampel ihn kennt. Das
 * Datum sagt ihn bereits, und ein Zusatz wie „(frühere Saison)" hinter einem
 * ausgeschriebenen Datum wäre dieselbe Auskunft zweimal. Die Füllung der Marke
 * trägt sie für den Blick, der kein Datum liest.
 *
 * `wann` kommt fertig formatiert herein, damit die Datei ohne Import prüfbar
 * bleibt und der Aufrufer über das Format entscheidet — dasselbe Muster wie
 * `laeuftBaldAb` in `handlungsbedarf.ts`.
 */
export function zustandsSatz(pruefung: Pruefung | null, wann: string): string {
  if (!pruefung) return 'Noch nie geprüft'

  switch (pruefung.status) {
    case 'gesperrt':
      return `Gesperrt — nicht besetzen. Eingetragen ${wann}`
    case 'mangel':
      return `Mangel gemeldet ${wann}`
    default:
      return `Geprüft ${wann}`
  }
}
