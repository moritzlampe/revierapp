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

/**
 * Die fünf Legendenkategorien — **abgeschrieben, nicht erfunden**.
 *
 * Quelle ist der native Track, `src/lib/map/object-categories.ts` (K5, Legende
 * mit Typfilter in zwei Ebenen, quickhunt-native `6bbe42c`). Schlüssel,
 * Beschriftungen und Reihenfolge sind dort gelockt; das Portal übernimmt sie
 * wörtlich, damit Karte und Objektspalte dieselben Wörter benutzen. Wer eine
 * Kategorie ändern will, ändert sie dort zuerst.
 *
 * `adhoc` fehlt hier mit Absicht: den Typ kennt nur die Feld-App (ein während
 * der Jagd gesetzter Stand), im Enum `map_object_type` steht er nicht.
 *
 * **Der Import über die Repo-Grenze ginge nicht** — zwei Repos, und R1 lässt das
 * Portal ohnehin nur unter `app/zentrale/**` schreiben. Also eine Kopie, dafür
 * eine, die der Selbsttest gegen die Typliste festnagelt: fällt ein Enum-Wert
 * aus allen Kategorien, schlägt er an, statt ihn stillschweigend aus dem Filter
 * zu werfen.
 */
export const OBJEKT_KATEGORIEN = [
  { key: 'staende', label: 'Stände', typen: ['hochsitz', 'kanzel', 'drueckjagdstand'] },
  { key: 'futter', label: 'Kirrungen / Wildäcker', typen: ['kirrung', 'salzlecke', 'wildacker'] },
  { key: 'kamera', label: 'Wildkameras', typen: ['wildkamera'] },
  { key: 'notfall', label: 'Notfall-Treffpunkte', typen: ['notfall_treffpunkt'] },
  { key: 'sonstiges', label: 'Sonstiges', typen: ['parkplatz', 'sonstiges'] },
] as const

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

/**
 * Der Filterzustand ist die Menge der **abgewählten** Typen, nicht die der
 * gewählten. Leer heißt „alles zu sehen" — und das ist der Startzustand, ohne
 * dass ihn jemand aufzählen müsste. Dieselbe Bauart wie die Legende der
 * Feld-App (`object-categories.ts`, `hidden`).
 *
 * Eine Kategorie schaltet als Ganzes: ist irgendetwas darin aus, geht alles an,
 * sonst alles aus. „An" gewinnt, weil der halbe Zustand sonst zwei Klicks zum
 * Wiedersehen bräuchte. Wörtlich die Regel des nativen `toggleCategory`.
 */
export function toggleKategorie(
  versteckt: ReadonlySet<string>,
  typen: readonly string[],
): Set<string> {
  const next = new Set(versteckt)
  const etwasAus = typen.some((t) => versteckt.has(t))
  for (const t of typen) {
    if (etwasAus) next.delete(t)
    else next.add(t)
  }
  return next
}

export function toggleTyp(versteckt: ReadonlySet<string>, typ: string): Set<string> {
  const next = new Set(versteckt)
  if (!next.delete(typ)) next.add(typ)
  return next
}

function istBekannteKategorie(typ: string): boolean {
  return OBJEKT_KATEGORIEN.some((k) => (k.typen as readonly string[]).includes(typ))
}

/**
 * Die Auswahlliste für das Dropdown: nur was im Revier wirklich vorkommt, mit
 * Anzahl. Ein Revier mit 196 Objekten hat selten alle zehn Typen, und leere
 * Einträge sind zehn Zeilen Menü, hinter denen nichts steht.
 *
 * Ein Typ, den keine Kategorie kennt — etwa ein elfter Enum-Wert aus einer
 * künftigen Migration —, landet unter „Sonstiges" statt aus dem Filter zu
 * fallen. Ein Objekt, das die Karte zeigt und der Filter verschweigt, wäre die
 * schlechtere Hälfte von beidem.
 */
export function filterBaum(typen: string[]): {
  key: string
  label: string
  anzahl: number
  eintraege: { wert: string; label: string; anzahl: number }[]
}[] {
  const zaehler = new Map<string, number>()
  for (const t of typen) zaehler.set(t, (zaehler.get(t) ?? 0) + 1)

  const fremde = [...zaehler.keys()].filter((t) => !istBekannteKategorie(t)).sort()

  return OBJEKT_KATEGORIEN.map((k) => {
    const werte = [...k.typen, ...(k.key === 'sonstiges' ? fremde : [])]
    const eintraege = werte
      .map((w) => ({ wert: w, label: typLabel(w), anzahl: zaehler.get(w) ?? 0 }))
      .filter((e) => e.anzahl > 0)
    return {
      key: k.key,
      label: k.label,
      anzahl: eintraege.reduce((s, e) => s + e.anzahl, 0),
      eintraege,
    }
  }).filter((k) => k.anzahl > 0)
}

/**
 * Trifft ein Objekt den Suchbegriff?
 *
 * Nimmt Name und Typ einzeln statt eines Objekts, damit diese Datei importfrei
 * bleibt und mit `node --experimental-strip-types` prüfbar ist.
 *
 * Gesucht wird auch über den **ausgeschriebenen** Typ: wer „Drückjagdbock"
 * tippt, meint den Enum-Wert `drueckjagdstand` und soll ihn finden. Der rohe
 * Wert zählt zusätzlich, damit auch `notfall_treffpunkt` auffindbar bleibt.
 *
 * `q` wird als bereits getrimmt und kleingeschrieben erwartet — die Aufrufer
 * tun das einmal, statt es je Objekt zu wiederholen.
 */
export function passtZurSuche(name: string, typ: string, q: string): boolean {
  return (
    name.toLowerCase().includes(q) ||
    typLabel(typ).toLowerCase().includes(q) ||
    typ.includes(q)
  )
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
  // Der leere Typ ist ein eigener Fall, keine Unterart von „unbekannt": beim
  // Anlegen startet die Auswahl bewusst auf „Bitte wählen" (Schritt 3b), und
  // `Unbekannter Objekttyp „"` wäre dort eine Meldung über ein Anführungspaar.
  if (!entwurf.typ) {
    return 'Bitte einen Objekttyp wählen.'
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

/* ── Position (Schritt 3b) ──────────────────────────────────────────────── */

/** Ein Ort auf der Karte, in der Reihenfolge, in der Leaflet ihn liefert. */
export type Ort = { lat: number; lng: number }

/**
 * Der Setzmodus: **ein** Zustand für Verschieben UND Anlegen.
 *
 * Bewusst kein zweites und drittes Boolean neben den drei, die es in
 * `revierkarte.tsx` schon gibt (`laeuft`, `objektBearbeitung`,
 * `zeichner.editMode`). Beide Modi verbrauchen den Kartenklick, beide schließen
 * alles andere aus — und zwei Booleans könnten gleichzeitig wahr sein, ein
 * Zustand kann das nicht. Genau diese Sorte Fehler hat hier zweimal
 * zugeschlagen; siehe `beschaeftigt` in `revierkarte.tsx`.
 *
 * `kandidat` ist `null`, solange noch nicht in die Karte geklickt wurde. Beim
 * Anlegen heißt das: es gibt noch keinen Datensatz, nur einen Modus.
 * `map_objects.position` ist NOT NULL — ein Objekt ohne Ort kann es nicht
 * geben, also entsteht es erst mit dem Klick.
 *
 * Der Typ liegt hier und nicht in einer der beiden Komponenten, weil beide ihn
 * brauchen: `revierkarte.tsx` hält den Zustand, `objekt-inspektor.tsx` stellt
 * ihn dar. Ein Export aus der einen in die andere wäre ein Ringschluss.
 */
export type Setzen =
  | { art: 'position'; id: string; kandidat: Ort | null }
  | { art: 'neu'; kandidat: Ort | null }

/**
 * Längengrad in den Bereich −180…180 zurückholen.
 *
 * **Kein Schönheitsfix, sondern eine echte Falle.** Leaflet lässt die Karte über
 * den 180. Längengrad hinaus schieben und liefert danach ungewickelte Werte —
 * wer zweimal nach Osten scrollt und dann klickt, bekommt `lng: 370`. PostGIS
 * nimmt das an (`geometry` prüft keinen Wertebereich), speichert es, und das
 * Objekt liegt anschließend nirgends: `fitBounds` zieht die Karte auf eine
 * Weltbreite, und auf dem Revier ist der Punkt nicht zu sehen.
 *
 * Zurückholen statt ablehnen, weil der Klick nicht falsch war — der Nutzer hat
 * auf eine sichtbare Stelle geklickt, nur hat die Karte eine zweite Umrundung
 * hinter sich. Eine Fehlermeldung wäre an dieser Stelle nicht erklärbar.
 *
 * Der Bereichsprüfung vorweg ist kein Feilschen um einen Rechenschritt: die
 * Modulo-Kette ist nicht wertetreu. `10.2` käme als `10.200000000000045`
 * zurück — physikalisch nichts (5 Nanometer), aber jeder Positions-Write
 * speicherte damit einen anderen Wert als den geklickten, und der Normalfall
 * ist nun einmal „liegt längst im Bereich". Vom Selbsttest gefunden.
 */
export function wickleLaengengrad(lng: number): number {
  if (lng >= -180 && lng <= 180) return lng
  return (((lng + 180) % 360) + 360) % 360 - 180
}

/**
 * Prüft einen angeklickten Ort und gibt ihn gewickelt zurück — oder eine
 * Meldung für den Bildschirm.
 *
 * `position` ist in der DB `geometry(POINT, 4326)` und NOT NULL. Einen Punkt
 * ohne Ort kann es also nicht geben, und einen mit `NaN` nimmt PostGIS zwar an,
 * aber niemand findet ihn wieder. Deshalb hier abfangen, nicht dort.
 *
 * Der Breitengrad wird bewusst NICHT gewickelt: Leaflet begrenzt ihn von sich
 * aus auf ±90, ein Wert darüber wäre also kein Scrollartefakt, sondern ein
 * echter Fehler — und den soll man sehen.
 */
export function pruefeOrt(ort: Ort | null): { ort: Ort } | { fehler: string } {
  if (!ort) {
    return { fehler: 'Es ist noch keine Position gesetzt. In die Karte klicken.' }
  }
  if (!Number.isFinite(ort.lat) || !Number.isFinite(ort.lng)) {
    return { fehler: 'Die angeklickte Position ist keine gültige Koordinate.' }
  }
  if (ort.lat < -90 || ort.lat > 90) {
    return { fehler: `Breitengrad ${ort.lat} liegt außerhalb von −90 bis 90.` }
  }
  return { ort: { lat: ort.lat, lng: wickleLaengengrad(ort.lng) } }
}

/**
 * EWKT für einen Punkt — **`lng lat`, nicht `lat lng`.**
 *
 * Die Reihenfolge ist die eine Stelle, an der dieser Aufruf lautlos falsch sein
 * kann: PostGIS liest X Y, also Länge vor Breite, und in Deutschland sind beide
 * Werte plausibel (52, 10 vs. 10, 52 — beides landet auf der Karte, nur eines
 * in Niedersachsen). Ein vertauschtes Paar wirft keinen Fehler, es legt das
 * Objekt bloß irgendwo in den Indischen Ozean. Der Selbsttest nagelt sie fest.
 *
 * Dieselbe Schreibweise wie der mobile Pfad (`MapObjectSheet:104`) und wie
 * `ewktAus` für Polygone in `grenze.ts`.
 */
export function ewktPunkt(ort: Ort): string {
  return `SRID=4326;POINT(${ort.lng} ${ort.lat})`
}

/**
 * Ist die neue Position praktisch dieselbe wie die alte?
 *
 * Gleicher Zweck wie `unveraendert()` für die Textfelder: Objekt-Writes sind
 * last-write-wins (Backlog E-R7), `map_objects` hat keine `updated_at`-Spalte,
 * und jeder überflüssige Write ist ein Fenster, in dem eine parallele Änderung
 * aus der Feld-App verloren geht. Der billigste Schutz ist der Write, den es
 * nicht gibt.
 *
 * Mit Toleranz statt exakt: „Position ändern" und dann auf das Objekt selbst
 * klicken trifft nie dieselbe Fließkommazahl, wäre aber offensichtlich keine
 * Verschiebung. 1e-7 Grad sind rund 1 cm — klein genug, dass keine echte
 * Verschiebung durchfällt, groß genug für den Klick auf denselben Punkt.
 */
const ORT_TOLERANZ = 1e-7

export function ortUnveraendert(a: Ort, b: Ort): boolean {
  return (
    Math.abs(a.lat - b.lat) < ORT_TOLERANZ && Math.abs(a.lng - b.lng) < ORT_TOLERANZ
  )
}
