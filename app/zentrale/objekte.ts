/**
 * Die reine Logik hinter „Kartenobjekte verwalten" (Phase 3 Schritt 3).
 *
 * Bewusst **ohne jeden Import** — dadurch mit
 * `node --experimental-strip-types app/zentrale/objekte.selftest.ts` prüfbar, ohne
 * Pfad-Alias, Env oder Netz. Dasselbe Muster wie `grenze.ts` und `schreiben.ts`.
 *
 * Die Datei ist zugleich die einzige Stelle im Portal, die die acht Enum-Werte
 * von `map_objects.type` kennt. Im Repo gibt es davon bereits fünf voneinander
 * unabhängige Kopien (`ObjektEditSheet`, `ObjektDetailSheet`, `TypeSheet`,
 * `MapObjectSheet`, `toolbar`) — eine gemeinsame anzulegen ginge nur außerhalb
 * von `app/zentrale/**` und verstieße gegen R1. Also eine sechste, dafür
 * abgeschlossene: alles, was das Portal über Objekttypen weiß, steht hier.
 */

/**
 * Die zehn Werte des Postgres-Enums `map_object_type`, in Enum-Reihenfolge
 * (`pg_enum.enumsortorder`, gemessen am 27.07.2026). Reihenfolge und
 * Beschriftung sind bewusst dieselben wie im mobilen `ObjektEditSheet` —
 * dieselbe Anwendung soll dieselben Wörter benutzen. „Drückjagdbock" ist die
 * mobile Beschriftung des Enum-Werts `drueckjagdstand`; die Abweichung ist
 * gewollt und alt.
 *
 * **Achtung, Reihenfolge:** `wildacker` und `notfall_treffpunkt` kamen mit
 * Migration 063 aus dem nativen Track dazu und stehen deshalb im Enum HINTER
 * `sonstiges` — `ALTER TYPE … ADD VALUE` hängt an. Der mobile Typ-Alias in
 * `src/lib/types/revier.ts` listet sie dagegen vor `sonstiges`; das ist eine
 * reine Schreibweise ohne Wirkung. Maßgeblich ist hier `pg_enum`, weil der
 * Selbsttest genau dagegen prüft.
 */
export const OBJEKT_TYPEN = [
  { wert: 'hochsitz', label: 'Hochsitz' },
  { wert: 'kanzel', label: 'Kanzel' },
  { wert: 'drueckjagdstand', label: 'Drückjagdbock' },
  { wert: 'parkplatz', label: 'Parkplatz' },
  { wert: 'kirrung', label: 'Kirrung' },
  { wert: 'salzlecke', label: 'Salzlecke' },
  { wert: 'wildkamera', label: 'Wildkamera' },
  { wert: 'sonstiges', label: 'Sonstiges' },
  { wert: 'wildacker', label: 'Wildacker' },
  { wert: 'notfall_treffpunkt', label: 'Notfall-Treffpunkt' },
] as const

export type ObjektTyp = (typeof OBJEKT_TYPEN)[number]['wert']

/** Alles, worauf ein Schütze sitzt. Kirrung, Salzlecke, Wildkamera, Parkplatz
 *  und Sonstiges zählen bewusst nicht als Sitz. */
const STAND_TYPEN: readonly string[] = ['hochsitz', 'kanzel', 'drueckjagdstand']

export function istStand(typ: string): boolean {
  return STAND_TYPEN.includes(typ)
}

export function istObjektTyp(typ: string): typ is ObjektTyp {
  return OBJEKT_TYPEN.some((t) => t.wert === typ)
}

/**
 * Beschriftung für einen Typ. Unbekannte Werte kommen unverändert zurück statt
 * als leerer Kasten: käme je ein neunter Enum-Wert dazu, soll die Oberfläche ihn
 * roh anzeigen, nicht verschweigen.
 */
export function typLabel(typ: string): string {
  return OBJEKT_TYPEN.find((t) => t.wert === typ)?.label ?? typ
}

/** Was im Formular steht — alles Text, so wie ein Eingabefeld es liefert. */
export type ObjektEntwurf = {
  name: string
  typ: string
  beschreibung: string
}

/**
 * Prüft einen Objektentwurf. Gibt eine Meldung für den Bildschirm zurück, oder
 * `null`, wenn er gespeichert werden darf.
 *
 * `name` und `type` sind in der DB NOT NULL, `type` zusätzlich ohne Default.
 * Ein leerer Name käme als `''` durch — Postgres hält das für einen Wert. Das
 * Objekt hieße danach auf der Karte nichts und wäre nur noch über seine
 * Koordinate auffindbar. Deshalb hier abfangen, nicht in der DB.
 */
export function pruefeObjekt(entwurf: ObjektEntwurf): string | null {
  if (!entwurf.name.trim()) {
    return 'Ein Objekt braucht einen Namen.'
  }
  if (!istObjektTyp(entwurf.typ)) {
    return `Unbekannter Objekttyp „${entwurf.typ}".`
  }
  return null
}

/**
 * Der Entwurf in Spaltennamen der Tabelle — die einzige Stelle, die die
 * Zuordnung kennt.
 *
 * Zwei Dinge, die sonst jeder Aufrufer einzeln vergisst: der Name wird getrimmt
 * (sonst legt ein versehentliches Leerzeichen zwei scheinbar gleiche Objekte an),
 * und eine leere Notiz wird `null` statt `''`. Der mobile Pfad macht beides
 * ebenso (`ObjektEditSheet:63`), und der Bestand ist entsprechend sauber:
 * von 203 Objekten haben 7 gar keine Notiz, **kein einziges** einen Leerstring,
 * und kein Name trägt Rand-Leerzeichen (gemessen 27.07.2026). Das soll so
 * bleiben, damit `description IS NULL` weiter „keine Notiz" heißt.
 *
 * `position` steht bewusst nicht drin: die Position wird in Schritt 3b über einen
 * eigenen Weg geschrieben, nicht über das Formular.
 */
export function alsSpalten(entwurf: ObjektEntwurf): {
  name: string
  type: string
  description: string | null
} {
  return {
    name: entwurf.name.trim(),
    type: entwurf.typ,
    description: entwurf.beschreibung.trim() || null,
  }
}

/**
 * Hat sich gegenüber dem geladenen Stand etwas geändert?
 *
 * Nicht Kosmetik: ohne die Prüfung schreibt „Speichern" auch dann, wenn nichts
 * anders ist. Weil Grenzen- und Objekt-Writes last-write-wins sind (Backlog
 * E-R7) und `map_objects` keine `updated_at`-Spalte hat, an der man das
 * aufhängen könnte, ist jeder überflüssige Write ein unnötiges Fenster, in dem
 * eine parallele Änderung verloren gehen kann. Der billigste Schutz ist, ihn
 * nicht abzusetzen.
 */
export function unveraendert(
  entwurf: ObjektEntwurf,
  original: { name: string; type: string; description: string | null },
): boolean {
  const neu = alsSpalten(entwurf)
  return (
    neu.name === original.name &&
    neu.type === original.type &&
    neu.description === original.description
  )
}
