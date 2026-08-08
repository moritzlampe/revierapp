/**
 * Was auf der Übersicht eine Frist hat — die Regeln dahinter, ohne React und
 * ohne Netz.
 *
 * **Der Trennsatz, aus dem diese Datei folgt** (Konzept Revierzentrale §1.3a,
 * von Moritz entschieden am 08.08.2026): *Übersicht ist eine Agenda, Revier ist
 * ein Bestand.* Der Test dazu lautet — ändert sich die Zahl, weil **ich etwas
 * getan habe**, oder weil **Zeit vergangen ist**? Nur das Zweite gehört hierher.
 *
 * Bewusst **ohne jeden Import**, damit die Datei mit
 * `node --experimental-strip-types` prüfbar ist (siehe
 * `handlungsbedarf.selftest.ts`). Dasselbe Muster wie `scheine.ts`,
 * `schreiben.ts` und `objekte.ts`.
 *
 * **Deshalb nimmt `laeuftBaldAb` den Status als Parameter, statt ihn
 * auszurechnen:** die Regel dafür steht bereits in
 * `jagderlaubnisse/scheine.ts` (`effektiverStatus`, abgeleitet aus Migration
 * 077). Eine zweite Fassung hier wäre genau die Zweitimplementierung, die im
 * Projekt schon einmal auseinandergelaufen ist — und ein Import würde die
 * Prüfbarkeit ohne Bundler kosten. Der Aufrufer ruft erst `effektiverStatus`,
 * dann diese Funktion.
 */

/**
 * Wie weit die Agenda nach vorn schaut.
 *
 * 60 Tage, weil ein Begehungsschein üblicherweise auf das Jagdjahr läuft
 * (1. April bis 31. März, s. `jagdjahrEnde`): zwei Monate reichen, um die
 * Verlängerung mit dem Inhaber zu besprechen, und sind kurz genug, dass die
 * Zeile nicht das halbe Jahr über steht und dadurch aufhört, gelesen zu werden.
 */
export const FRIST_TAGE = 60

/**
 * `heute` plus `tage`, als `YYYY-MM-DD`.
 *
 * **In UTC gerechnet, wie `heuteUtc()` in `scheine.ts`** — die DB läuft auf UTC,
 * und Migration 077 zieht die Zugriffsgrenze mit `current_date`.
 *
 * **Die Richtung, in die es schiefgeht, und sie stand hier zuerst verkehrt**
 * (Fremdprüfung 08.08.2026, P2): am 09.08. um 00:30 Berliner Sommerzeit ist es
 * in UTC erst 22:30 am **08.08.** Das lokale Kalenderdatum liegt damit einen
 * Tag **nach** dem der DB, nicht davor. Wer auf Ortszeit umstiege, hielte einen
 * Schein mit `valid_until = 08.08.` für abgelaufen, während die DB ihn noch
 * zwei Stunden lang durchlässt.
 * **Dieselbe Verdrehung steht in `scheine.ts` bei `heuteUtc()`** — dort mit der
 * richtigen Folge und der falschen Begründung; sie ist im selben Zug korrigiert
 * worden. Der Kommentar war kopiert, und mit ihm der Fehler.
 *
 * `Date` rechnet Monats- und Jahresübergänge selbst; eine eigene Kalenderrechnung
 * wäre die Stelle, an der der 31. Dezember schiefgeht.
 */
export function inTagen(heute: string, tage: number): string {
  const d = new Date(`${heute}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

/**
 * Ob dieser Schein binnen `tage` abläuft — und deshalb auf die Agenda gehört.
 *
 * **Nur ein HEUTE gültiger Schein kann bald ablaufen.** Ein bereits abgelaufener
 * ist keine Aufgabe mehr, sondern ein Zustand; ein pausierter oder entzogener
 * wurde absichtlich zugemacht, und ein `nochnicht` beginnt erst. Deshalb der
 * Status als erste Bedingung: ohne sie stünde jeder alte Schein dauerhaft in der
 * Liste, und eine Sektion, die immer dasselbe zeigt, erzieht dazu, sie zu
 * überspringen.
 *
 * Beide Enden einschließend, zeichengleich zu 077: ein Schein, dessen letzter
 * Tag genau `heute` ist, gilt noch — und ist damit die dringendste Zeile
 * überhaupt, nicht die erste, die herausfällt.
 *
 * ISO-Datumsstrings vergleichen sich als Text richtig, solange alle gleich lang
 * sind (`date` aus PostgREST ist immer `YYYY-MM-DD`) — dieselbe Begründung wie
 * in `effektiverStatus`.
 */
export function laeuftBaldAb(
  effektiverStatus: string,
  gueltigBis: string,
  heute: string,
): boolean {
  if (effektiverStatus !== 'aktiv') return false
  return gueltigBis >= heute && gueltigBis <= inTagen(heute, FRIST_TAGE)
}

/*
 * **Hier stand `brauchtAntwort(status, terminIso, jetztIso)`, und die
 * Ponytail-Lesung hat es gestrichen** (08.08.2026). Der Grund gehört in die
 * Akte, weil die Funktion sinnvoll aussah:
 *
 * Sie prüfte `status === 'invited'` und „Termin liegt in der Zukunft" — beides
 * garantiert die Abfrage in `page.tsx` bereits (`.eq('status','invited')` und
 * `.in('hunt_id', kuenftige)`, wobei `kuenftige` auf künftige Termine
 * gefiltert ist). Sie konnte an ihrer einzigen Aufrufstelle **nie `false`
 * liefern**. Die 11 Karteileichen, gegen die sie gebaut war, wirft die
 * **Abfrage** weg, nicht das Prädikat.
 *
 * **Beim Streichen fiel ein echter Fehler mit weg, und das ist der Grund, es
 * hier festzuhalten:** sie verglich `scheduled_for` als **Zeichenkette** gegen
 * `new Date().toISOString()`. PostgREST liefert `…+00:00`, `toISOString()`
 * liefert `…Z` — ein lexikalischer Vergleich zweier verschiedener
 * Schreibweisen desselben Zeitpunkts. Heute folgenlos (die Abfrage filtert
 * ohnehin), als eigenständige Funktion eine Falle für den nächsten Aufrufer.
 *
 * Wer die Regel wiederhaben will, schreibt sie in die ABFRAGE, nicht in ein
 * Prädikat daneben.
 */
