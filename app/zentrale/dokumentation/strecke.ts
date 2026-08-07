/**
 * Strecke je Jagdjahr — die reine Rechnung hinter dem Screen (A-C4).
 *
 * **Importfrei wie alle Hilfsdateien der Zentrale**, damit
 * `node --experimental-strip-types` sie ohne Alias-Auflösung ausführen kann
 * (Begründung ausführlich in `../jagden/jagden.ts`).
 *
 * ## Die Quelle und ihre Grenze
 *
 * Gelesen wird **ausschliesslich** die View `historische_jagden_soeder`
 * (Migration 110), nie die Tabelle `historische_strecken`. Deren vier `quelle`-
 * Werte sind vier Projektionen DESSELBEN Bestands, keine addierbaren Töpfe —
 * quer summiert ergibt die Tabelle 11136 statt 4646. Der `quelle`-Filter steckt
 * in der View, damit ihn niemand vergessen kann.
 *
 * **Diese Quelle trägt weder Wildart noch Datum noch Erleger.** Das ist keine
 * Lücke im Import, sondern ein Constraint:
 *
 * ```
 * CHECK (quelle <> 'jagden_soeder' OR (jagdjahr IS NOT NULL AND termin IS NOT NULL
 *   AND district_id IS NOT NULL AND erleger_name IS NULL AND kontakt_id IS NULL
 *   AND art_text IS NULL AND erlegt_am IS NULL))
 * ```
 *
 * Wer hier eine Artenspalte plant, plant gegen die Datenbank. Das Papier
 * (Blatt „Kreaturen je Monat") kennt nur Jahr × Termin → Zahl.
 *
 * ## Warum eine fehlende Zelle nicht 0 ist
 *
 * `anzahl > 0` ist ebenfalls Constraint. Eine Kombination ohne Zeile heisst
 * damit **„zu diesem Termin wurde keine Jagd gemeldet"**, nicht „Jagd fand
 * statt, Strecke null". Der Unterschied ist gross: 1995/96 hat vier belegte
 * Termine, eine 0-Darstellung machte daraus drei erfolglose Jagden, die es nie
 * gab. Deshalb tragen die Zellen `number | null` und nicht `number`.
 */

/** Eine Zeile der View, so wie PostgREST sie liefert (beide Spalten nullable
 *  im generierten Typ, per CHECK aber nie leer — s. `streckenbuch()`). */
export type Jagdzeile = {
  jagdjahr: number | null
  termin: string | null
  anzahl: number
}

/**
 * Die sieben Termine in **Kalenderreihenfolge**, nicht nach Häufigkeit.
 *
 * Die Reihenfolge ist die Antwort auf Moritz' Frage („wo möglich je monat wo
 * strecke berichtet wurde in dem jahr") — eine Saison liest sich von links nach
 * rechts wie ihr Verlauf. Nach Menge sortiert stünde der Januar vor dem
 * Oktober, und die Zeile erzählte nichts mehr.
 *
 * Die Werte sind zeichengleich zum CHECK `historische_strecken_termin`.
 */
export const TERMINE = [
  { schluessel: 'okt', label: 'Okt.' },
  { schluessel: 'nov_frueh', label: 'Nov. früh' },
  { schluessel: 'nov_spaet', label: 'Nov. spät' },
  { schluessel: 'dez_frueh', label: 'Dez. früh' },
  { schluessel: 'dez_spaet', label: 'Dez. spät' },
  { schluessel: 'jan_frueh', label: 'Jan. früh' },
  { schluessel: 'jan_spaet', label: 'Jan. spät' },
] as const

export type Saison = {
  jahr: number
  /** Ein Eintrag je TERMINE-Spalte, `null` = kein Termin gemeldet. */
  zellen: (number | null)[]
  summe: number
}

export type Spalte = {
  schluessel: string
  label: string
  /** In wie vielen Saisons dieser Termin überhaupt vorkommt. Steht als zweite
   *  Kopfzeile in der Tabelle: „Nov. spät" mit `1×` ist sonst ein Rätsel. */
  belegt: number
  summe: number
}

export type Streckenbuch = {
  /** **Neueste Saison zuerst** — die häufigere Frage ist „was war zuletzt".
   *  Die Kurve dreht das um, s. `kurve()`. */
  saisons: Saison[]
  spalten: Spalte[]
  gesamt: number
  vonJahr: number
  bisJahr: number
  /** Zahl der gemeldeten **Jagden** = Zahl der Zeilen. Nicht die Zahl der
   *  Saisons und nicht die Summe der Stücke.
   *
   *  **Nicht die Zahl der belegten Termine**, und die erste Fassung dieses
   *  Kommentars setzte beides gleich (Schlusslesung 07.08.2026, F4): zwei
   *  Zeilen auf demselben (Jahr, Termin) sind zwei Jagden und ein Termin —
   *  genau der Fall, den `streckenbuch()` addiert statt überschreibt. Heute
   *  fallen beide Zahlen zusammen (124 Zeilen, 124 Kombinationen), erzwungen
   *  ist das nicht. */
  gemeldet: number
}

/**
 * Baut die Kreuztabelle Saison × Termin.
 *
 * Wirft bei einer Zeile, die nicht in diese View gehört. Das ist Absicht und
 * die billigere Hälfte des Handels: eine unbekannte Terminbezeichnung still zu
 * überspringen hiesse, dass die Spaltensummen nicht mehr zur Gesamtsumme
 * passen — und niemand sähe es. Wer den CHECK um einen achten Termin
 * erweitert, soll hier anstossen statt eine zu kleine Strecke zu lesen.
 */
export function streckenbuch(zeilen: readonly Jagdzeile[]): Streckenbuch | null {
  if (zeilen.length === 0) return null

  // Bewusst `Map<string, number>` und nicht der aus `TERMINE` abgeleitete
  // Literaltyp: der Schlüssel kommt aus der Datenbank und ist zur Übersetzungs-
  // zeit unbekannt. Ein enger Typ zwänge hier zu einer Zusicherung und
  // verlöre genau die Prüfung, für die der `undefined`-Zweig unten da ist.
  const spalte = new Map<string, number>(TERMINE.map((t, i) => [t.schluessel, i] as const))
  const jeJahr = new Map<number, (number | null)[]>()

  for (const z of zeilen) {
    if (z.jagdjahr == null || z.termin == null) {
      throw new Error(
        'Chronikzeile ohne Jagdjahr oder Termin — die View liefert etwas, das der CHECK ausschliesst.',
      )
    }
    const i = spalte.get(z.termin)
    if (i === undefined) {
      throw new Error(`Unbekannter Termin "${z.termin}" — TERMINE ist gegen den CHECK aus 110 zu ergänzen.`)
    }
    const zellen = jeJahr.get(z.jagdjahr) ?? TERMINE.map(() => null)
    // Addieren statt überschreiben: heute ist (Jahr, Termin) faktisch eindeutig
    // (124 Zeilen, 124 Kombinationen), erzwungen ist es aber nicht — UNIQUE
    // liegt auf `quell_zeile`. Zwei Meldungen zum selben Termin sind zwei
    // Jagden, und zwei Jagden sind keine.
    zellen[i] = (zellen[i] ?? 0) + z.anzahl
    jeJahr.set(z.jagdjahr, zellen)
  }

  const saisons: Saison[] = [...jeJahr]
    .map(([jahr, zellen]) => ({
      jahr,
      zellen,
      summe: zellen.reduce<number>((s, z) => s + (z ?? 0), 0),
    }))
    .sort((a, b) => b.jahr - a.jahr)

  const spalten: Spalte[] = TERMINE.map((t, i) => ({
    schluessel: t.schluessel,
    label: t.label,
    belegt: saisons.filter((s) => s.zellen[i] !== null).length,
    summe: saisons.reduce<number>((s, sa) => s + (sa.zellen[i] ?? 0), 0),
  }))

  const jahre = saisons.map((s) => s.jahr)
  return {
    saisons,
    spalten,
    gesamt: saisons.reduce((s, sa) => s + sa.summe, 0),
    vonJahr: Math.min(...jahre),
    bisJahr: Math.max(...jahre),
    gemeldet: zeilen.length,
  }
}

/** `1993` → `1993/94`. Die Saison heisst im Papier nach ihrem Anfangsjahr.
 *  Zeichengleich zu `alsSaison()` in `../gaeste/kontakte.ts` — bewusst kopiert
 *  statt importiert, damit diese Datei importfrei bleibt (s. Kopf). Vier
 *  Zeilen, gegen dieselben Fälle getestet. */
export function alsSaison(jahr: number): string {
  return `${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`
}

export type Kurve = {
  /** `points`-Attribut einer SVG-Polyline, chronologisch von links nach rechts. */
  punkte: string
  /** Die stärkste Saison — beschriftet die obere Achsenkante. */
  hoch: number
  hochJahr: number
  schwach: number
  schwachJahr: number
}

/**
 * Die Jahressummen als eine einzige Linie.
 *
 * **Chronologisch, also gegen die Reihenfolge der Tabelle.** Eine Zeitreihe,
 * die von rechts nach links läuft, liest sich als Abstieg, wo ein Anstieg
 * steht — die Tabelle darf „neuestes zuerst", ein Diagramm nicht.
 *
 * Skaliert von 0, nicht vom Minimum: eine Achse, die bei 20 beginnt, macht aus
 * dem Verhältnis 20:178 optisch 0:158. Der Preis ist eine flachere Kurve, und
 * das ist der richtige Preis.
 */
export function kurve(saisons: readonly Saison[], breite: number, hoehe: number): Kurve | null {
  // **Unter zwei Saisons gibt es keine Kurve, und das ist kein Randfall-Geiz.**
  // Eine `<polyline>` mit einem einzigen Punkt hat kein Segment und zeichnet
  // lautlos nichts — der Screen zeigte dann ein leeres Kästchen mit Achse
  // darunter und behauptete damit eine Reihe, die es nicht gibt. Die Tabelle
  // trägt den Fall vollständig (Fremdprüfung 07.08.2026, P5).
  if (saisons.length < 2) return null
  const chronologisch = [...saisons].sort((a, b) => a.jahr - b.jahr)
  const werte = chronologisch.map((s) => s.summe)
  const hoch = Math.max(...werte)
  const schwach = Math.min(...werte)
  const spanne = chronologisch.length - 1

  const punkte = chronologisch
    .map((s, i) => {
      const x = (i / spanne) * breite
      // `hoch` ist nie 0, solange die Daten aus der View kommen: `anzahl > 0`
      // ist Constraint in 110. **`streckenbuch()` prüft das NICHT selbst nach** —
      // es prüft Jahr und Termin, nicht den Wert (Fremdprüfung 07.08.2026, P8).
      // Die Zusicherung stammt von der Datenbank, nicht von dieser Datei.
      const y = hoehe - (s.summe / hoch) * hoehe
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return {
    punkte,
    hoch,
    hochJahr: chronologisch.find((s) => s.summe === hoch)!.jahr,
    schwach,
    schwachJahr: chronologisch.find((s) => s.summe === schwach)!.jahr,
  }
}
