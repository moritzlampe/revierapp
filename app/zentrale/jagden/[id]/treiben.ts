/**
 * Treiben und ihre Standmengen — die Rechenregeln, Portal-Phase 4b.
 *
 * Bewusst **ohne jeden Import**, wie `schreiben.ts` und `scheine.ts`: dadurch
 * ist die Datei mit `node --experimental-strip-types` prüfbar, ohne Bundler,
 * Pfad-Alias oder Netz (`treiben.selftest.ts`).
 *
 * Was hier NICHT steht: wer auf welchem Stand sitzt. Die Schützenverteilung ist
 * Schnitt 2 und bringt ihre eigene Frage mit — die Präzedenz zwischen dem
 * Jagd-weiten Sitzplan (`hunt_seat_assignments`) und dem Treiben-Plan, die nativ
 * in `src/lib/hunt/assignment.ts` steht und die dieses Repo nicht importieren
 * kann. Sie wird entschieden, wenn sie fällig ist, nicht auf Vorrat.
 */

/** Eine Standzeile eines Treibens (`hunt_drive_stands`). */
export interface TreibenStand {
  /** hunt_drive_stands.id — das Ziel eines DELETE. */
  id: string
  /**
   * map_objects.id ODER hunt_seat_assignments.id. Die beiden Spalten schließen
   * sich aus (CHECK `num_nonnulls(map_object_id, seat_assignment_id) = 1`), sie
   * fallen deshalb in einen Schlüsselraum zusammen — dieselbe Auflösung wie
   * nativ in `src/lib/data/drives.ts`.
   */
  standId: string
  /** Aus welcher Spalte `standId` kam. Der Zusammenfall oben ist verlustbehaftet. */
  fest: boolean
}

/** Ein Treiben (`hunt_drives`), auf das reduziert, was das Portal braucht. */
export interface Treiben {
  id: string
  name: string
  sequence: number
  status: string
  stands: TreibenStand[]
}

/**
 * Die Standmenge darf nur an einem Treiben geändert werden, das noch nicht
 * gelaufen ist — dieselbe Grenze wie nativ (`setDriveStands`, „pending drives
 * only"). Ein `completed` Treiben ist ein Protokoll des Jagdtags; wer daran die
 * Stände verschöbe, schriebe die Vergangenheit um.
 *
 * Ein UI-Gate, keine Berechtigung: RLS kennt diese Grenze nicht, und das ist
 * richtig so — der Jagdtag gehört der App, die ein laufendes Treiben sehr wohl
 * anfassen können muss.
 */
export function bearbeitbar(status: string): boolean {
  return status === 'pending'
}

/**
 * Die nächste Anstell-Nummer. `sequence` hat DEFAULT 1 und **keinen Unique** —
 * die Reihenfolge ist eine Absicht, kein Zwang. Doppelte Nummern sind deshalb
 * möglich und werden hier nicht repariert, nur nicht neu erzeugt.
 */
export function naechsteSequenz(treiben: readonly Treiben[]): number {
  return treiben.reduce((max, t) => Math.max(max, t.sequence), 0) + 1
}

/**
 * Der eingegebene Name, auf das reduziert, was man sieht.
 *
 * `trim()` allein genügt nicht: es entfernt die Unicode-Kategorie `Zs` (darunter
 * NBSP U+00A0, an dem Migration 111 hängen blieb), **nicht** aber `Cf` — ein
 * eingefügtes ZERO WIDTH SPACE (U+200B) ergäbe `length === 1` und damit ein
 * sichtbar leeres Treiben.
 *
 * **\p{Cf} statt einer Zeichenliste, und die Liste war nachweislich zu kurz**
 * (Fremdprüfung 10.08.2026, A6): sie deckte U+200B–U+200D und U+FEFF, ließ aber
 * U+2060 WORD JOINER und U+200E LEFT-TO-RIGHT MARK durch — beide unsichtbar,
 * beide ergäben einen optisch leeren Namen. Die Kategorie deckt alle
 * Formatzeichen auf einmal, auch das SOFT HYPHEN U+00AD, und ist dabei KÜRZER
 * als die Aufzählung.
 *
 * Das ist zugleich die Antwort auf den Punkt, den Migration 111 offenließ: dort
 * steht der Preis als „eine wachsende Zeichenliste im CHECK". In JavaScript
 * kostet die vollständige Fassung nichts; SQL kennt kein \p{Cf}, der dortige
 * Verzicht bleibt also richtig.
 *
 * ponytail: zweite Fassung dieser Regel im Verzeichnis, die erste steht inline
 * in `../../revier-name.tsx:142` und deckt nur die kurze Liste. Zusammenlegen,
 * sobald eine dritte dazukommt — dieselbe Schwelle, an der `laden.ts` entstand.
 */
export function sichtbarerName(entwurf: string): string {
  return entwurf.replace(/\p{Cf}/gu, '').trim()
}

/** Eine Zeile aus `hunt_drives` samt eingebetteten Ständen, wie PostgREST sie liefert. */
export interface TreibenZeile {
  id: string
  name: string
  sequence: number
  status: string
  hunt_drive_stands: {
    id: string
    map_object_id: string | null
    seat_assignment_id: string | null
  }[]
}

/**
 * DB-Zeilen → `Treiben`. Die einzige Stelle, an der die beiden Fremdschlüssel in
 * einen Schlüsselraum zusammenfallen.
 *
 * Eine Zeile ohne beide Spalten kann es nicht geben (CHECK
 * `num_nonnulls(...) = 1`); sie fiele hier trotzdem heraus, statt ein `null` als
 * Stand-Id weiterzureichen. Dieselbe Behandlung wie nativ (`toDriveStand`).
 */
export function ausZeilen(zeilen: readonly TreibenZeile[]): Treiben[] {
  return zeilen.map((z) => ({
    id: z.id,
    name: z.name,
    sequence: z.sequence,
    status: z.status,
    stands: z.hunt_drive_stands.flatMap<TreibenStand>((s) =>
      s.map_object_id
        ? [{ id: s.id, standId: s.map_object_id, fest: true }]
        : s.seat_assignment_id
          ? [{ id: s.id, standId: s.seat_assignment_id, fest: false }]
          : [],
    ),
  }))
}

/** Die Stände, die ein Treiben heute hat, als Markierung für die Karte. */
export function markierungAus(treiben: Treiben): Set<string> {
  return new Set(treiben.stands.filter((s) => s.fest).map((s) => s.standId))
}

/** Was an `hunt_drive_stands` geschrieben werden muss, um `markiert` zu erreichen. */
export interface StandAenderung {
  /** hunt_drive_stands.id je zu löschender Zeile. */
  loeschen: string[]
  /** map_objects.id je neu anzulegender Zeile. */
  legen: string[]
}

/**
 * Ein DIFF, kein delete-all-insert — und der Grund ist gemessen, nicht befürchtet.
 *
 * Seit Migration 061 trägt eine Standzeile ihren Schützen (`participant_id`).
 * Alle Zeilen neu anzulegen löschte den kompletten Sitzplan in dem Moment, in dem
 * der Jagdleiter EINEN Stand hinzufügt — still, ohne Fehler, am Abend vor der
 * Jagd. Unberührte Stände behalten hier ihre Zeile und damit ihren Schützen.
 * Dieselbe Begründung wie nativ in `src/lib/data/drives.ts`.
 *
 * **`sichtbar` ist der zweite Riegel, und er ist der weniger offensichtliche.**
 * Gelöscht wird nur, was der Nutzer auch abwählen KONNTE. Zwei Arten von
 * Standzeilen stehen nicht auf der Karte und dürfen deshalb nie aus einem
 * Kartenklick verschwinden:
 *
 * 1. **Ad-hoc-Sitze** (`seat_assignment_id`) — sie stehen in
 *    `hunt_seat_assignments`, nicht in `map_objects`, und werden vom Portal gar
 *    nicht geladen. Im Bestand 0 (08.08.2026), in der App jederzeit anlegbar.
 * 2. **Stände auf gelöschten Kartenobjekten** — an der Produktion gemessen:
 *    **eine** solche Zeile existiert. Die Karte lädt nur `deleted_at is null`;
 *    ohne diesen Riegel räumte der erste Speichervorgang sie weg, ohne dass sie
 *    je jemand gesehen hätte.
 *
 * Ein Diff gegen „alles, was nicht markiert ist" hätte beide gelöscht. Die Menge
 * der markierbaren Stände ist damit Teil der Rechnung, nicht nur ihr Ergebnis.
 *
 * Beide fängt schon `sichtbar`: es kommt aus `map_objects`, und weder eine
 * `hunt_seat_assignments.id` noch ein gelöschtes Objekt steht darin. Ein
 * zusätzlicher `fest`-Filter im Lösch-Zweig wäre totes Prädikat (per
 * Mutationsprobe belegt) und stand hier bis zur Ponytail-Lesung.
 *
 * **Was der Diff NICHT kann, und das ist eine Entscheidung, kein Versehen**
 * (Fremdprüfung 10.08.2026, A8, `[high]`): er trägt keine Revision und keine
 * erwartete Ausgangsmenge. Zwei Browser-Tabs auf demselben Treiben führen
 * deshalb zu einem MERGE, nicht zu einem Konflikt — beide starten bei {A}, einer
 * fügt B hinzu, der andere C, beide schreiben je eine Zeile erfolgreich, und am
 * Ende steht {A,B,C}, das so niemand gewählt hat.
 *
 * **Der Merge geht in BEIDE Richtungen, und die erste Fassung behauptete hier
 * das Gegenteil** (Schlusslesung 10.08.2026, 10b): sie schrieb „der Ausgang ist
 * ein Stand zu viel, nie einer zu wenig". Das gilt nur fürs Hinzufügen. Wählen
 * zwei Tabs je einen ANDEREN Stand ab (Tab 1 entfernt B, Tab 2 entfernt C),
 * steht am Ende {A} — jedem fehlt ein Stand, den er behalten wollte, samt dessen
 * `participant_id`. Kein Riegel meldet das, beide Writes sind je für sich
 * korrekt.
 *
 * Getragen wird es trotzdem, aus zwei Gründen:
 * (1) Es ist normale Nebenläufigkeit, kein Rechenfehler: jeder Tab schreibt
 *     genau das, was sein Benutzer wollte. Dieselbe Abwägung wie bei
 *     `wildart_favoriten` (Migration 101, Last-Write-Wins bewusst entschieden) —
 *     dort ist der Preis eine fehlende Kachel, hier ein fehlender Stand.
 * (2) Ein echter Compare-and-Swap braucht eine Revisionsspalte auf `hunt_drives`
 *     oder eine transaktionale RPC — beides eine MIGRATION, also Anker 2 und
 *     Moritz' ausdrückliche Freigabe. Das gehört nicht in einen Schnitt, der
 *     ohne DDL auskommt.
 *
 * Fällig, sobald zwei Menschen dieselbe Jagd planen — heute plant der
 * Jagdleiter allein, aber genau das ist eine Annahme über Menschen und keine
 * über Code.
 */
export function standDiff(
  stands: readonly TreibenStand[],
  markiert: ReadonlySet<string>,
  sichtbar: ReadonlySet<string>,
): StandAenderung {
  const loeschen = stands
    .filter((s) => sichtbar.has(s.standId) && !markiert.has(s.standId))
    .map((s) => s.id)

  // Gegen ALLE festen Zeilen geprüft, auch die unsichtbaren: sonst liefe ein
  // erneutes Markieren eines Stands, dessen Objekt gelöscht wurde, in den
  // UNIQUE (drive_id, map_object_id) — 23505 statt einer stillen Doppelzeile.
  const vorhanden = new Set(stands.filter((s) => s.fest).map((s) => s.standId))

  /**
   * **Angelegt wird nur, was auf der Karte STEHT — die erste Fassung prüfte
   * `sichtbar` nur im Lösch-Zweig** (Fremdprüfung 10.08.2026, A2).
   *
   * Derselbe Fall wie dort, nur andersherum: die Auswahl steht im Browser,
   * jemand löscht das Kartenobjekt, ein Refresh nimmt es aus `sichtbar` — aber
   * `markiert` trägt es weiter. Der Fremdschlüssel greift nicht, denn die
   * `map_objects`-Zeile EXISTIERT noch, sie trägt nur `deleted_at`. Das Treiben
   * bekäme lautlos einen Stand, den keine Karte je wieder zeigt und den niemand
   * mehr abwählen kann.
   *
   * Beide Riegel prüfen Verschiedenes und bleiben deshalb beide: `vorhanden`
   * gegen ALLE Zeilen verhindert die Doppelzeile (23505), `sichtbar` den toten
   * Stand.
   */
  const legen = [...markiert].filter((id) => !vorhanden.has(id) && sichtbar.has(id))

  return { loeschen, legen }
}
