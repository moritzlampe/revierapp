/**
 * Die Regeln hinter der Gästeliste — ohne React, ohne Netz.
 *
 * Bewusst **ohne jeden Import**, damit die Datei mit
 * `node --experimental-strip-types` prüfbar ist (siehe `kontakte.selftest.ts`).
 * Dasselbe Muster wie `scheine.ts`, `schreiben.ts` und `objekte.ts`.
 *
 * Konzept: `quickhunt-native/docs/konzepte/QuickHunt_Konzept_Kontaktliste_V1.md`
 * (GELOCKT 01.08.2026), Tabelle aus Migration 085.
 */

/** Die Spalten aus 085, so wie die Liste sie liest. */
export type Kontakt = {
  id: string
  vorname: string | null
  nachname: string | null
  begleitung: string | null
  email: string | null
  telefon: string | null
  handy: string | null
  adresse: string | null
  geburtstag: string | null
  notiz: string | null
  /** Übersteuerung aus Migration 086. `null` heißt „ableiten", nicht „keins". */
  kuerzel: string | null
  /** Migration 094. NOT NULL mit Vorgabe `{}` — leer, nie `null`. */
  kategorien: Kategorie[]
  standard_tags: Tag[]
  /**
   * Migration 100. `null` heißt aktiv, sonst der Zeitpunkt der Stilllegung.
   *
   * **Gehört ausdrücklich NICHT in `Entwurf`** und damit nicht in den
   * Formular-Patch: das Formular schreibt mehrere Felder auf einmal, und zwei
   * Personen führen dieselbe Liste (085). Läge die Spalte im Patch, überschriebe
   * ein Öffnen-Bearbeiten-Speichern des einen lautlos die Stilllegung des
   * anderen — es gibt kein Compare-and-Swap (Schlusslesung 04.08.2026, offener
   * Befund 7). Stilllegen ist deshalb ein eigener, einspaltiger Write.
   *
   * **Der Wert ist keine belegte Historie**, sondern eine Behauptung des
   * Bearbeiters: er kommt vom Client, die DB prüft ihn nicht.
   */
  inaktiv_seit: string | null
}

/**
 * Die Werte aus 094, mit ihrer Beschriftung — **eine** Liste für Formular,
 * Inspektor und (später) den Einlade-Dialog.
 *
 * Die Reihenfolge ist die des Enums `kontakt_kategorie` und zugleich die
 * Anzeige- und Speicherordnung (`normiert()`). Sie doppelt zu führen
 * hieße, dass Bildschirm und Spalte irgendwann Verschiedenes sagen.
 */
export const KATEGORIEN = [
  { wert: 'schuetze', label: 'Schütze' },
  { wert: 'jaegerei', label: 'Jägerei' },
  { wert: 'treiber', label: 'Treiber' },
  { wert: 'schweisshundfuehrer', label: 'Schweißhundführer' },
] as const satisfies readonly { wert: string; label: string }[]

export type Kategorie = (typeof KATEGORIEN)[number]['wert']

/**
 * Vorgewählte Funktionen. **Dasselbe Enum wie `hunt_participants.tags`**
 * (094: „ein zweites Enum mit denselben Werten wäre eine Übersetzung") — beim
 * Einladen wandern die Werte unverändert hinüber.
 *
 * **Das ist der Grund, warum sie nicht blind übernommen werden dürfen:**
 * `gruppenleiter` steuert an einer Jagd die Positionssichtbarkeit (059), und
 * `standard_tags` darf auch ein Mitführender setzen. Wer beim Einladen kopiert,
 * ohne zu prüfen, lässt einen Mitführenden ein Recht an fremder Jagd vergeben.
 * Hier wird nur gepflegt; die Prüfung gehört an den Übernahmepfad.
 */
export const TAGS = [
  { wert: 'gruppenleiter', label: 'Gruppenleiter' },
  { wert: 'hundefuehrer', label: 'Hundeführer' },
] as const satisfies readonly { wert: string; label: string }[]

export type Tag = (typeof TAGS)[number]['wert']

/**
 * Mehrfachfelder in Anzeige- und Speicherordnung, ohne Dubletten und ohne
 * Unbekanntes.
 *
 * **Die Sortierung ist kein Schönheitsdienst, sondern die Voraussetzung dafür,
 * dass `aenderungen()` funktioniert.** Dort wird der gespeicherte Wert genauso
 * normalisiert wie der Entwurf und beides verglichen — käme `['treiber',
 * 'schuetze']` aus der Spalte und `['schuetze','treiber']` aus dem Formular,
 * meldete jedes Öffnen-und-Speichern eine Änderung, die niemand vorgenommen
 * hat. Dieselbe Überlegung wie das Trimmen bei den Textfeldern.
 *
 * Unbekannte Werte fallen raus: die Spalte ist ein Enum, ein fremder Wert kann
 * nur aus einem veralteten Client stammen und würde beim Schreiben ohnehin mit
 * `22P02` abgewiesen.
 */
export function normiert<T extends string>(
  werte: readonly string[] | null | undefined,
  erlaubt: readonly { wert: T }[],
): T[] {
  return erlaubt.map((e) => e.wert).filter((w) => werte?.includes(w))
}

/** Beschriftungen einer Auswahl, in Anzeigeordnung — oder `null`, wenn leer. */
export function mehrfachText(
  werte: readonly string[],
  erlaubt: readonly { wert: string; label: string }[],
): string | null {
  const text = erlaubt
    .filter((e) => werte.includes(e.wert))
    .map((e) => e.label)
    .join(', ')
  return text || null
}

/**
 * „Alvensleben v., Ferdinand" — Adressbuch-Schreibweise, und wenn eines fehlt,
 * das andere allein.
 *
 * **Der Zusatz wandert hinter den Kern des Namens** (Moritz, 01.08.2026). Bis
 * dahin stand „v. Alvensleben, Ferdinand" unter A, und die Zeile sagte nicht,
 * warum: der Buchstabe, unter dem sie einsortiert ist, stand nicht vorn. Jetzt
 * zeigt die Schreibweise die Ordnung, statt ihr zu widersprechen — dieselbe
 * Konvention, nach der `sortSchluessel()` seit Block 1 sortiert (DIN 5007-2),
 * nur sichtbar. Beide lesen deshalb aus **einer** Zerlegung; wer sie trennt,
 * bekommt eine Liste, deren Schreibweise und Reihenfolge auseinanderlaufen.
 *
 * Der Check-Constraint `kontakt_braucht_namen` garantiert, dass mindestens
 * eines gesetzt ist; der leere Rückfall steht trotzdem da, weil eine Ansicht
 * nicht davon abhängen darf, dass eine Datenbankbedingung nie verletzt wird.
 *
 * **Nicht am Leerzeichen zerlegen oder wieder zusammensetzen:** 55 von 151
 * Nachnamen tragen einen Adels- oder Titelzusatz („Baron v. Buchholtz",
 * „Frhr. v. Vincke"). Die Quelle führt beide Teile getrennt, und genau deshalb
 * speichert 085 sie getrennt (Konzept §3.1).
 */
export function anzeigeName(k: Pick<Kontakt, 'vorname' | 'nachname'>): string {
  const nach = nachnameSortiert(k.nachname)
  const vor = (k.vorname ?? '').trim()
  if (nach && vor) return `${nach}, ${vor}`
  return nach || vor || '(ohne Namen)'
}

/**
 * Der Nachname so, wie er im Adressbuch steht: Kern zuerst, Zusatz dahinter.
 *
 *   „v. Alvensleben"      → „Alvensleben v."
 *   „Graf v. Hardenberg"  → „Hardenberg Graf v."
 *   „Meyer zu Erpen"      → „Meyer zu Erpen"   (Partikel in der Mitte bleibt)
 *
 * **Der Zusatz wird nicht ausgeschrieben.** Steht `v.` in der Zeile, steht
 * `v.` in der Anzeige — aus `v.` ein `von` zu machen hieße, die Daten zu
 * korrigieren, ohne dass jemand es sieht, und es wäre bei „Frfr." schon
 * Raterei. Was der Besitzer eintippt, bleibt stehen.
 *
 * **Ein fehlendes Leerzeichen wird dagegen ergänzt** („Frhr.v.Elverfeldt" →
 * „Elverfeldt Frhr. v."). Das ist keine Ausnahme von der Regel darüber,
 * sondern ihre Voraussetzung: ohne die Ergänzung wäre der Zusatz gar nicht als
 * solcher erkennbar und der Name stünde unter dem falschen Buchstaben
 * (Begründung bei `worte()`). Die Folge, und sie ist gewollt: **das
 * Bearbeiten-Formular zeigt weiterhin den rohen Wert.** Die Liste stellt dar,
 * das Formular bearbeitet — wer die Schreibweise wirklich ändern will, tut es
 * dort und sieht es sofort in der Liste.
 */
export function nachnameSortiert(nachname: string | null): string {
  const { kern, fuehrend } = zerlegeNachname(nachname)
  return fuehrend ? `${kern} ${fuehrend}` : kern
}

/**
 * Namensbestandteile, die weder sortiert noch abgekürzt werden.
 *
 * Titel und akademische Grade. Sie gehören zur Anrede, nicht zum Namen — und in
 * den echten Daten stehen sie **vor** dem Familiennamen („Graf v. Hardenberg"),
 * würden also ohne diese Liste die Sortierung anführen.
 */
const TITEL = new Set([
  'dr.', 'prof.', 'dipl.', 'ing.',
  'graf', 'gräfin', 'baron', 'baronin', 'fürst', 'fürstin',
  'frhr.', 'freiherr', 'frfr.', 'freifrau', 'freiin',
  'ritter', 'edler', 'edle', 'und',
])

/**
 * Namenspartikel. Anders als Titel **bleiben sie im Kürzel** — klein
 * geschrieben, so wie Moritz es vorgegeben hat: „Joachim v. Zitzewitz" → `JvZ`.
 * Für die Sortierung werden sie dagegen übersprungen (DIN 5007-2).
 */
// `d.` und `der` stehen hier, weil „Frhr.v. d. Bussche" sonst unter **D** landet
// (gemessen am echten Bestand, 01.08.2026). `d.` ist die Abkürzung von `der` in
// „von der Bussche" — beide gehören zusammen aufgenommen, sonst hängt die
// Einordnung daran, ob die Quelle abgekürzt hat.
const PARTIKEL = new Set([
  'v.', 'von', 'vom', 'van', 'zu', 'zur', 'zum', 'de', 'del', 'della', 'da', 'd.', 'der',
])

/**
 * Ein Name in Wörter — und dabei die Leerzeichen nachgetragen, die die Quelle
 * verschluckt hat.
 *
 * **Gemessen an den echten 154 Namen, nicht ausgedacht.** Fünf Zeilen schreiben
 * den Zusatz ohne Leerzeichen: „Frhr.v. Cramm", „Frhr.v. d. Bussche",
 * „Frhr.v. Elverfeldt", „Frhr.v.Elverfeldt" und „v.Alten-Weddelmann". Ohne
 * diese Zeile ist `Frhr.v.` **ein** Wort, das weder in TITEL noch in PARTIKEL
 * steht — die fünf standen deshalb unter F und V statt unter C, B, E und A,
 * mitten in einer Liste, die genau das nicht mehr tun sollte.
 *
 * **In Block 1 ist das nicht aufgefallen**, weil die Liste den Zusatz noch vorn
 * zeigte: „Frhr.v. Cramm" unter F sah richtig aus. Erst die neue Schreibweise
 * stellt die Frage, und erst der Lauf über den echten Bestand beantwortet sie.
 *
 * Ein Punkt vor einem Buchstaben ist in einem Namen eine Abkürzung, kein
 * Satzzeichen: das Leerzeichen dahinter fehlt, es fehlt nicht mit Absicht.
 */
function worte(name: string | null): string[] {
  return (name ?? '')
    .replace(/\.(?=\S)/g, '. ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Bindestrichnamen zählen doppelt: „Hans-Gerd" trägt H und G. */
function teile(name: string): string[] {
  return worte(name).flatMap((w) => w.split('-')).filter(Boolean)
}

/**
 * Der Schlüssel, unter dem ein Nachname im Adressbuch steht.
 *
 * **Titel und führende Partikel fallen weg** — „Graf v. Hardenberg" gehört
 * unter **H**, nicht unter G. Das ist die Konvention für Personenverzeichnisse
 * (DIN 5007-2), und ohne sie standen in den echten Daten fünf „Graf Grote" und
 * fünf „Graf v. Hardenberg" gemeinsam unter G — zwei fremde Familien, sortiert
 * nach ihrem Titel.
 *
 * Entfernt wird nur, was **vorn** steht: „Meyer zu Erpen" bleibt unter M,
 * „Schenck zu Schweinsberg" unter S. Ein Partikel in der Mitte trennt zwei
 * Namensteile, es führt sie nicht ein.
 */
export function sortSchluessel(nachname: string | null): string {
  return zerlegeNachname(nachname).kern.toLowerCase()
}

/**
 * Die eine Zerlegung, aus der Sortierung UND Schreibweise lesen.
 *
 * Entfernt wird nur, was **vorn** steht, und nie alles: die Schleife hält bei
 * `length - 1` an, damit ein Name, der nur aus Titeln besteht („Graf"), einen
 * Kern behält und nicht ans Listenende fällt.
 */
function zerlegeNachname(nachname: string | null): { kern: string; fuehrend: string } {
  const w = worte(nachname)
  let i = 0
  while (i < w.length - 1 && (TITEL.has(w[i].toLowerCase()) || PARTIKEL.has(w[i].toLowerCase()))) i++
  return { kern: w.slice(i).join(' '), fuehrend: w.slice(0, i).join(' ') }
}

/**
 * Das Kürzel, aus dem Namen abgeleitet (Moritz, 01.08.2026).
 *
 *   „Joachim v. Zitzewitz"            → `JvZ`
 *   „Hans-Gerd von Alten-Weddelmann"  → `HGvAW`
 *
 * Titel fallen weg, Partikel bleiben klein, alles andere wird zum Großbuchstaben;
 * Bindestrichnamen zählen mit beiden Teilen.
 *
 * **Die Ableitung wird nicht gespeichert.** `kontakte.kuerzel` (086) trägt nur
 * die Übersteuerung: leer = ableiten, gesetzt = Vorgabe des Besitzers. Eine
 * gespeicherte Ableitung wäre eine zweite Wahrheit, die von der ersten abweicht,
 * sobald jemand den Namen korrigiert — und niemand sähe es.
 *
 * **Kollisionen werden NICHT aufgelöst.** Zwei Menschen können dasselbe Kürzel
 * bekommen; das ist auf einer Karte hinnehmbar und in einer Liste sichtbar. Eine
 * automatische Auflösung würde raten, wo der Besitzer entscheiden sollte.
 */
export function initialen(k: Pick<Kontakt, 'vorname' | 'nachname'>): string {
  const zeichen = (name: string | null) =>
    teile(name ?? '')
      .filter((w) => !TITEL.has(w.toLowerCase()))
      .map((w) => (PARTIKEL.has(w.toLowerCase()) ? w[0].toLowerCase() : w[0].toUpperCase()))
      .join('')
  return zeichen(k.vorname) + zeichen(k.nachname)
}

/**
 * Das Kürzel, das angezeigt wird: die Vorgabe des Besitzers, sonst die
 * Ableitung.
 *
 * **Die eine Stelle, an der beide zusammenkommen.** `initialen()` allein
 * aufzurufen wäre der Fehler — dann stünde in der Liste etwas anderes als im
 * Formular. `NULL` in der Spalte heißt „rechne aus" (Migration 086), nicht
 * „kein Kürzel"; leer getrimmt zählt als nicht gesetzt, weil ein Formular
 * sonst über ein versehentliches Leerzeichen eine dritte Bedeutung erfände.
 */
export function kuerzelVon(k: Pick<Kontakt, 'vorname' | 'nachname' | 'kuerzel'>): string {
  return (k.kuerzel ?? '').trim() || initialen(k)
}

/**
 * Vergleichstext für die Suche: Kleinschreibung und Akzente weg.
 *
 * Die Zerlegung nach NFD trennt den Umlautpunkt vom Buchstaben, der
 * anschließende Filter wirft ihn weg — „Kürzel" wird zu „kurzel", und wer
 * `kurzel` tippt, findet es. Die andere deutsche Schreibweise (`ue` für `ü`)
 * deckt das **nicht** ab; das wäre eine zweite Abbildung und ist bisher von
 * niemandem gebraucht worden.
 *
 * ponytail: reines Falten, kein Index. Bei 154 Zeilen läuft die Suche über
 * jedes Feld jeder Zeile — fällig wird etwas Klügeres im vierstelligen Bereich.
 */
export function suchtext(wert: string): string {
  return wert
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Greift die Suche auf diesen Kontakt?
 *
 * **Die Notiz ist ausdrücklich mit dabei.** Das ist der Weg zu den 32 Zeilen,
 * die den Vermerk „streichen" tragen: sie bekommen keinen eigenen Zustand, weil
 * die Entscheidung dem Besitzer gehört und er sie seit 21 Jahren nicht getroffen
 * hat (Konzept §10.4). Was sie stattdessen bekommen, ist Auffindbarkeit — eine
 * Suche nach „streichen" liefert sie als Arbeitsliste.
 *
 * Mehrere Wörter werden UND-verknüpft und dürfen in verschiedenen Feldern
 * stehen: „alston alison" findet den Kontakt über Nachname und Begleitung.
 *
 * **Kategorien und Funktionen sind mit dabei** (Fremdprüfung 03.08.2026, offener
 * Punkt): sonst tippt man „Treiber" und findet niemanden, obwohl 24 Kontakte so
 * markiert sind. Das ist keine Zugabe, sondern die einzige Kontrolle über die
 * Pflege — wer 154 Zeilen einordnet, muss nachsehen können, was er eingeordnet
 * hat. Gesucht wird über die **Beschriftung**, nicht über den Enum-Wert:
 * „Schütze" ist das Wort, das auf dem Bildschirm steht, `schuetze` sieht
 * niemand. `suchtext()` wirft die Umlaute auf beiden Seiten weg, „schutze"
 * findet also genauso.
 */
export function passtZuSuche(k: Kontakt, suche: string): boolean {
  const woerter = suchtext(suche).split(/\s+/).filter(Boolean)
  if (woerter.length === 0) return true
  // Adresse und beide Nummern sind heute bei allen 154 Zeilen leer und stehen
  // trotzdem hier: das Formular füllt sie ab jetzt, und ein Suchfeld, das ein
  // eingebbares Feld stillschweigend auslässt, ist später schwer zu bemerken.
  const heuhaufen = suchtext(
    [
      k.vorname, k.nachname, k.begleitung, k.email, k.telefon, k.handy, k.adresse, k.notiz,
      mehrfachText(k.kategorien ?? [], KATEGORIEN),
      mehrfachText(k.standard_tags ?? [], TAGS),
    ]
      .filter(Boolean)
      .join(' '),
  )
  return woerter.every((w) => heuhaufen.includes(w))
}

/** Ein Feld ist gesetzt, wenn etwas darin steht, das kein Leerraum ist —
 *  dieselbe Bedingung wie `kontakt_braucht_namen` in 085. */
function gesetzt(wert: string | null | undefined): boolean {
  return (wert ?? '').trim().length > 0
}

/**
 * Auf welchem Weg erreicht diesen Kontakt ein Begehungsschein?
 *
 * Das ist die eine Angabe, die aus dem Datensatz eine Handlungsmöglichkeit
 * macht. Sie beantwortet **nicht** „was fehlt hier", sondern „was kann ich
 * jetzt tun" — die 26 ohne E-Mail sind keine unvollständigen Datensätze,
 * sondern Gäste, die man anders erreicht (Konzept §4).
 *
 * **Nur `email` läuft von allein.** Steht eine bestätigte Adresse am Konto,
 * zeigt `meine_einladungen()` (080) die Einladung in der App, ohne dass jemand
 * etwas weitergibt. Alle anderen Wege sind derselbe Vorgang — den Code aus der
 * Scheinliste kopieren und von Hand zustellen —, und sie unterscheiden sich
 * nur darin, **worüber**. Deshalb eine Rangfolge und keine Aufzählung: was
 * oben steht, kostet weniger.
 *
 * **`telefon` zählt bewusst NICHT als Weg.** Der Einladungscode ist base64url
 * aus `gen_random_bytes(9)` und damit Groß-/Kleinschreibung-empfindlich
 * (siehe `../jagderlaubnisse/formular.tsx`, wo dafür die Autokorrektur
 * abgeschaltet wird). Etwas, das man am Telefon diktiert, ist kein Weg, auf
 * den man jemanden hinweisen sollte — es ist der sicherste Weg zu einem Code,
 * den es nicht gibt. Festnetz steht deshalb im Inspektor, aber nicht in dieser
 * Rangfolge.
 */
export type Einladungsweg = 'email' | 'handy' | 'post' | 'persoenlich'

export function einladungsweg(k: Pick<Kontakt, 'email' | 'handy' | 'adresse'>): Einladungsweg {
  if (gesetzt(k.email)) return 'email'
  if (gesetzt(k.handy)) return 'handy'
  if (gesetzt(k.adresse)) return 'post'
  return 'persoenlich'
}

/**
 * Die Beschriftung der Pille. Vier Wege, vier neutrale Wörter — keiner davon
 * ist eine Warnung.
 *
 * „per Adresse" ist am 01.08.2026 rausgeflogen (Moritz): das Wort heißt im
 * Deutschen Anschrift, gemeint war die Anmelde-Adresse. Ausgerechnet in der
 * Spalte, in der jetzt auch die Anschrift steht, wäre das die eine Beschriftung
 * gewesen, die man garantiert falsch liest.
 */
export const EINLADUNGSWEG_LABEL: Record<Einladungsweg, string> = {
  email: 'E-Mail',
  handy: 'Handy',
  post: 'Post',
  persoenlich: 'nur persönlich',
}

/**
 * Der ausgeschriebene Satz für den Inspektor — oder `null`, wenn nichts fehlt.
 *
 * Der Bildschirm zeigt, **wofür** ein Kontakt unvollständig ist; er verweigert
 * nichts (Konzept §4). Formulierungsvorbild ist die schon gebaute Stelle in
 * `../jagderlaubnisse/formular.tsx` — „keine — nur per Code erreichbar" —,
 * damit Gäste und Jagderlaubnisse dieselbe Sprache sprechen.
 *
 * Alle drei Sätze sagen denselben ersten Halbsatz. Das ist Absicht: der
 * Unterschied zwischen den Wegen ist nicht, ob die Einladung von allein kommt
 * (das tut sie nur bei E-Mail), sondern nur, worüber man den Code schickt.
 */
const EINLADUNGS_HINWEIS: Record<Einladungsweg, string | null> = {
  email: null,
  handy:
    'Ohne E-Mail erscheint die Einladung nicht von allein in der App. ' +
    'Den Code per Nachricht ans Handy weitergeben.',
  post:
    'Ohne E-Mail erscheint die Einladung nicht von allein in der App. ' +
    'Den Code mit der Post schicken.',
  persoenlich:
    'Weder E-Mail noch Handy noch Anschrift hinterlegt — der Code lässt sich ' +
    'nur persönlich weitergeben.',
}

export function einladungsHinweis(
  k: Pick<Kontakt, 'email' | 'handy' | 'adresse'>,
): string | null {
  return EINLADUNGS_HINWEIS[einladungsweg(k)]
}

/**
 * `YYYY-MM-DD` als `DD.MM.YYYY`.
 *
 * **Reine Zeichenarbeit, kein `Date`.** PostgREST liefert `date` immer in
 * diesem Format, und ein `new Date('1958-07-26')` würde als UTC-Mitternacht
 * gelesen und in einer westlichen Zeitzone als der 25. angezeigt. Ein
 * Geburtstag hat keine Uhrzeit und darf keine bekommen — dieselbe Überlegung
 * wie bei `heuteUtc()` in `../jagderlaubnisse/scheine.ts`, nur andersherum.
 */
export function alsDatum(iso: string | null): string {
  if (!iso || iso.length < 10) return '—'
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

/**
 * Ein Zeitpunkt als Berliner Kalenderdate.
 *
 * **Warum nicht `alsDatum()`** (Fremdprüfung 04.08.2026, Punkt 3): das schneidet
 * den ISO-String und liefert damit die **UTC**-Date. Für `geburtstag` ist das
 * richtig, weil die Spalte ein `date` ist und keine Zeitzone kennt. Für
 * `inaktiv_seit` — ein `timestamptz` — wäre es einen Tag zu früh: wer um 00:30
 * Berliner Zeit stilllegt, steht in UTC noch auf dem Vortag. Dieselbe Wurzel wie
 * der Gültigkeitsvergleich in Migration 087, nur auf der Anzeigeseite.
 *
 * `Intl` statt eigener Rechnung, weil Sommerzeit sonst von Hand käme.
 */
export function alsBerlinDatum(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '—'
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(t)
}

/**
 * Ein Suchparameter aus der URL als einzelner Wert.
 *
 * Next liefert **`string[]`**, sobald ein Parameter mehrfach vorkommt
 * (`?q=a&q=b`) — eine Adresse, die sich von Hand tippen lässt. Ungeprüft
 * liefe das Array bis in `suchtext()` und stürbe dort an `.toLowerCase()`,
 * also mit einem Serverfehler auf einer Seite, die nur lesen wollte.
 * Bei Mehrfachangabe gilt der erste Wert.
 */
export function ersterWert(wert: string | string[] | undefined | null): string {
  return (Array.isArray(wert) ? wert[0] : wert) ?? ''
}

/**
 * Die Listenfilter. Der Zustand gehört in die URL (Zentrale-Konzept §2.4).
 *
 * **Eine Achse, vier Werte** — nicht zwei Achsen, die sich kreuzen.
 *
 * `aktiv` ist die Voreinstellung: der Zweck des Stilllegens ist, jemanden aus
 * dem Weg zu haben (Moritz, 04.08.2026). Die Kopfzeile nennt trotzdem beide
 * Zahlen, damit die 154 nie stillschweigend kleiner wird.
 *
 * **`ohne_mail` meint die AKTIVEN ohne Adresse** — nachtragen tut man für Leute,
 * die man noch einlädt.
 *
 * **`streichen` ist entfallen** — die 32 „Markierung streichen"-Kontakte sind
 * seit dem 04.08.2026 stillgelegt, der Filter zeigte damit dieselbe Menge wie
 * `inaktiv`, nur aus einem Freitext geraten. Die Notiz bleibt an den Zeilen,
 * sie ist kein Filterkriterium mehr. `alsFilter()` bildet die alte Adresse ab.
 */
export type Filter = 'aktiv' | 'inaktiv' | 'alle' | 'ohne_mail'

/**
 * Alles Unbekannte wird `aktiv` — ein getippter Parameter soll nicht leeren.
 *
 * **`streichen` wird ausdrücklich auf `inaktiv` abgebildet**, nicht auf die
 * Voreinstellung: die Adresse `?filter=streichen` ist teilbar und steht
 * womöglich in einem Lesezeichen. Sie zeigt jetzt dieselbe Menge wie vorher —
 * nur über den Zustand statt über den Freitext.
 */
export function alsFilter(wert: string | null | undefined): Filter {
  if (wert === 'streichen') return 'inaktiv'
  // **`code` war der alte Schlüssel dieser Arbeitsliste und wird abgebildet**
  // (Fremdprüfung 04.08.2026, Paket B, Punkt 1). Ein erster Entwurf ließ ihn auf
  // die Voreinstellung fallen, weil die Menge sich geändert hat — `ohne_mail`
  // zeigt nur noch Aktive. Das war das schwächere Argument: der Rückfall auf
  // `aktiv` zeigt zusätzlich alle Kontakte MIT Adresse und verfehlt damit den
  // Zweck der Liste vollständig, während die Beschränkung auf Aktive ihn nur
  // verengt. Dieselbe Überlegung wie bei `streichen` eine Zeile höher.
  if (wert === 'code') return 'ohne_mail'
  return wert === 'inaktiv' || wert === 'alle' || wert === 'ohne_mail' ? wert : 'aktiv'
}

/** Ist der Kontakt stillgelegt? */
export function istInaktiv(k: Pick<Kontakt, 'inaktiv_seit'>): boolean {
  return k.inaktiv_seit !== null
}

/**
 * Nach Adressbuch-Konvention sortiert: Nachname ohne Titel und führende
 * Partikel, Leere ans Ende, bei Gleichstand der Vorname.
 *
 * Läuft im Client, nicht in der Abfrage — PostgREST kann nicht nach einem
 * Ausdruck ordnen, und eine Datenbank-Sicht nur für die Reihenfolge wäre für
 * 154 Zeilen unverhältnismäßig. Die Abfrage sortiert trotzdem vor; das hier
 * ist die maßgebliche Ordnung.
 */
export function sortiert(alle: readonly Kontakt[]): Kontakt[] {
  return alle.slice().sort((a, b) => {
    const ka = sortSchluessel(a.nachname)
    const kb = sortSchluessel(b.nachname)
    if (!ka !== !kb) return ka ? -1 : 1
    return (
      ka.localeCompare(kb, 'de') ||
      (a.vorname ?? '').localeCompare(b.vorname ?? '', 'de')
    )
  })
}

/** Die sichtbaren Zeilen. Filtern erhält die Reihenfolge aus `sortiert()`. */
export function sichtbare(alle: readonly Kontakt[], suche: string, filter: Filter): Kontakt[] {
  return alle.filter((k) => {
    if (filter === 'aktiv' && istInaktiv(k)) return false
    if (filter === 'inaktiv' && !istInaktiv(k)) return false
    // Arbeitsliste zum Nachtragen: nur Aktive, s. die Begründung am Typ.
    if (filter === 'ohne_mail' && (istInaktiv(k) || einladungsweg(k) === 'email')) return false
    return passtZuSuche(k, suche)
  })
}

// ===========================================================================
// Bearbeiten, Anlegen, Löschen (Block 2)
// ===========================================================================

/**
 * Die zehn Felder, die das Formular schreibt — alle als Text, weil ein
 * Eingabefeld kein NULL kennt. Der Rückweg steht in `alsSpalten()`.
 *
 * **`besitzer_id` und `profil_id` fehlen mit Absicht.** Beide hält der Trigger
 * `kontakt_feste_spalten()` aus 085 gegen jeden Client-Schreibzugriff fest; ein
 * Formularfeld dafür wäre eines, das beim Speichern `42501` wirft. `besitzer_id`
 * setzt allein der INSERT (auf `auth.uid()`), `profil_id` setzt niemand aus dem
 * Client — sie soll belegen, dass eine Person ihre Kennung bewiesen hat, und
 * wäre als frei setzbare Behauptung wertlos.
 */
export type Entwurf = {
  vorname: string
  nachname: string
  kuerzel: string
  begleitung: string
  email: string
  handy: string
  telefon: string
  adresse: string
  geburtstag: string
  notiz: string
  kategorien: Kategorie[]
  standard_tags: Tag[]
}

export const LEERER_ENTWURF: Entwurf = {
  vorname: '',
  nachname: '',
  kuerzel: '',
  begleitung: '',
  email: '',
  handy: '',
  telefon: '',
  adresse: '',
  geburtstag: '',
  notiz: '',
  kategorien: [],
  standard_tags: [],
}

/**
 * Die Mehrfachfelder — sie stehen **nicht** in `FELDER`.
 *
 * `FELDER` beschreibt Textfelder: eine Beschriftung, ein Eingabefeld, ein
 * Wert. Ein Mehrfachfeld ist eine Gruppe von Kästchen und im Inspektor eine
 * Aufzählung. Ein `art: 'mehrfach'` hätte beide Renderstellen und die
 * `Feld`-Komponente um einen Sonderfall erweitert, der mit dem Rest nichts
 * teilt — zwei kurze Blöcke sind weniger Code als ein Feldtyp, der überall
 * ausweichen muss.
 */
type MehrfachFeld<K extends 'kategorien' | 'standard_tags'> = {
  key: K
  label: string
  /**
   * **Die Optionen sind an den Schlüssel gebunden, nicht bloß `string`.**
   * Ohne die Bindung bestünde `{ key: 'kategorien', optionen: TAGS }` den
   * Typcheck (Fremdprüfung 03.08.2026, offener Punkt) — und richtete stillen
   * Schaden an: `normiert()` vergliche die gesetzten Kategorien gegen die
   * Tag-Werte, fände nie eine Übereinstimmung und schriebe bei jedem Speichern
   * ein leeres Array. Die Kategorien eines Kontakts wären weg, ohne Fehler.
   */
  optionen: readonly { wert: Entwurf[K][number]; label: string }[]
}

export const MEHRFACH = [
  { key: 'kategorien', label: 'Kategorien', optionen: KATEGORIEN },
  { key: 'standard_tags', label: 'Funktionen', optionen: TAGS },
] as const satisfies readonly [MehrfachFeld<'kategorien'>, MehrfachFeld<'standard_tags'>]

/**
 * Die Reihenfolge der Felder — **eine** Liste für Formular und Inspektor.
 *
 * Sie stehen sonst zweimal da und laufen bei der nächsten Änderung auseinander;
 * dieses Repo hat aus genau diesem Grund fünf Kopien der Objekt-Typliste
 * (siehe `../objekt-inspektor.tsx`).
 *
 * Vor- und Nachname tragen `imKopf`, weil sie im Inspektor die Überschrift sind
 * und nicht noch einmal als Zeile darunter stehen sollen.
 */
/**
 * Die Felder des Entwurfs, die Text tragen — also alles außer den
 * Mehrfachfeldern.
 *
 * **Das ist der Riegel, der `FELDER` und `MEHRFACH` auseinanderhält.** Wer ein
 * Array-Feld versehentlich in `FELDER` einträgt, bekommt hier einen Typfehler
 * statt eines `<input value={['schuetze']}>`, das zur Laufzeit „schuetze"
 * anzeigt und beim Speichern eine Zeichenkette in eine Enum-Spalte schriebe.
 */
export type TextFeld = {
  [K in keyof Entwurf]: Entwurf[K] extends string ? K : never
}[keyof Entwurf]

export const FELDER: readonly {
  key: TextFeld
  label: string
  art?: 'email' | 'tel' | 'date' | 'mehrzeilig'
  imKopf?: true
}[] = [
  { key: 'vorname', label: 'Vorname', imKopf: true },
  { key: 'nachname', label: 'Nachname', imKopf: true },
  { key: 'kuerzel', label: 'Kürzel' },
  { key: 'begleitung', label: 'Begleitung' },
  { key: 'email', label: 'E-Mail', art: 'email' },
  { key: 'handy', label: 'Handy', art: 'tel' },
  { key: 'telefon', label: 'Telefon', art: 'tel' },
  { key: 'adresse', label: 'Adresse', art: 'mehrzeilig' },
  { key: 'geburtstag', label: 'Geburtstag', art: 'date' },
  { key: 'notiz', label: 'Notiz', art: 'mehrzeilig' },
]

/** Ein bestehender Kontakt als Formularzustand. */
export function entwurfVon(k: Kontakt): Entwurf {
  return {
    vorname: k.vorname ?? '',
    nachname: k.nachname ?? '',
    // Der ROHE Wert, nicht `kuerzelVon()`. Stünde hier die Ableitung, machte
    // das erste Speichern aus „rechne aus" eine feste Vorgabe — und die wiche
    // ab, sobald jemand den Namen korrigiert. Das Feld bleibt leer, und der
    // Platzhalter zeigt, was ohne Eingabe herauskommt.
    kuerzel: k.kuerzel ?? '',
    begleitung: k.begleitung ?? '',
    email: k.email ?? '',
    handy: k.handy ?? '',
    telefon: k.telefon ?? '',
    adresse: k.adresse ?? '',
    geburtstag: k.geburtstag ?? '',
    notiz: k.notiz ?? '',
    // `?? []` obwohl beide Spalten NOT NULL sind: eine ältere `.select()`-Liste
    // liefert sie schlicht nicht mit, und `undefined.includes` wäre ein Absturz
    // im Formular statt einer fehlenden Angabe.
    kategorien: normiert(k.kategorien, KATEGORIEN),
    standard_tags: normiert(k.standard_tags, TAGS),
  }
}

/**
 * Der Entwurf als Spaltenwerte: getrimmt, und **leer wird NULL**.
 *
 * Keine Kosmetik, sondern drei Dinge auf einmal:
 *
 * - `geburtstag` ist `date`. Ein leerer String wäre `22007 invalid input
 *   syntax for type date` — ein Serverfehler beim Löschen eines Geburtstags.
 * - `kuerzel` unterscheidet NULL („rechne aus", 086) von einer Vorgabe. Ein
 *   gespeichertes `''` wäre eine dritte Bedeutung: `kuerzelVon()` trimmt sie
 *   zwar weg, aber sie stünde in der Spalte und müsste von jedem nächsten
 *   Leser wieder gedeutet werden.
 * - `kontakt_braucht_namen` prüft `coalesce(vorname,'') ~ '[^[:space:]]'` —
 *   für den Constraint sind NULL, `''` und `'   '` dasselbe. Die Spalte soll
 *   das auch sein, sonst steht in der Liste ein Name aus drei Leerzeichen.
 *
 * **Die Mehrfachfelder gehen NICHT durch `wert()`.** Sie sind NOT NULL mit
 * Vorgabe `{}`: leer heißt dort ein leeres Array, nicht `null`. Ein `null`
 * würde mit `23502` abgewiesen — „keine Kategorie" ist ein gültiger Zustand,
 * kein fehlender.
 */
export function alsSpalten(e: Entwurf): {
  [K in keyof Entwurf]: Entwurf[K] extends string ? string | null : Entwurf[K]
} {
  const wert = (s: string) => s.trim() || null
  return {
    vorname: wert(e.vorname),
    nachname: wert(e.nachname),
    kuerzel: wert(e.kuerzel),
    begleitung: wert(e.begleitung),
    email: wert(e.email),
    handy: wert(e.handy),
    telefon: wert(e.telefon),
    adresse: wert(e.adresse),
    geburtstag: wert(e.geburtstag),
    notiz: wert(e.notiz),
    kategorien: normiert(e.kategorien, KATEGORIEN),
    standard_tags: normiert(e.standard_tags, TAGS),
  }
}

/**
 * Was am Entwurf nicht stimmt — oder `null`.
 *
 * Beide Prüfungen fangen einen Datenbankfehler ab, den der Nutzer sonst als
 * rohen Postgres-Text zu lesen bekäme (`23514` und `22007`). Mehr wird nicht
 * geprüft: das Adressbuch nimmt halbbekannte Personen ausdrücklich auf
 * (Konzept §4), und die E-Mail-Form prüft der Browser über `type="email"`.
 */
export function pruefeEntwurf(e: Entwurf): string | null {
  if (!e.vorname.trim() && !e.nachname.trim()) {
    return 'Ein Kontakt braucht einen Namen — Vorname oder Nachname genügt.'
  }
  const tag = e.geburtstag.trim()
  if (tag && !/^\d{4}-\d{2}-\d{2}$/.test(tag)) {
    return 'Der Geburtstag muss ein vollständiges Datum sein (Tag, Monat, Jahr).'
  }
  return null
}

/**
 * Nur die Spalten, die sich wirklich geändert haben — oder `null`, wenn keine.
 *
 * **Das ist zugleich der ganze Schutz gegen gegenseitiges Überschreiben.** Die
 * Liste wird ausdrücklich gemeinsam geführt (`kontakt_mitfuehrende`, 085 —
 * „mein Vater und ich führen dieselbe Liste"). Ein UPDATE über alle zehn
 * Spalten machte aus jedem Speichern ein Zurückschreiben des Standes, den man
 * geladen hat: wer nur das Kürzel ändert, überschriebe die Nummer, die der
 * andere inzwischen eingetragen hat — still, mit Erfolgsmeldung. Ein Patch aus
 * den geänderten Feldern trifft nur, was gemeint war.
 *
 * **Kein Versionsabgleich über `updated_at`.** Der wäre der nächste Schritt und
 * greift erst, wenn zwei Leute dasselbe FELD gleichzeitig ändern. Heute führt
 * genau ein Konto die Liste (`kontakt_mitfuehrende` ist leer, gemessen
 * 01.08.2026); der Fall wäre also ein Konflikt zwischen zwei Tabs desselben
 * Menschen. Die Spalte liegt bereit, wenn das erste Adressbuch geteilt wird.
 * ponytail: feldweiser Patch statt Versionsprüfung — nachziehen, sobald
 * `kontakt_mitfuehrende` Zeilen hat.
 *
 * Nichts geändert heißt: **nicht schreiben**. Der billigste Schutz gegen einen
 * überflüssigen Write ist der, den es nicht gibt (dieselbe Überlegung wie
 * `unveraendert()` in `../objekte.ts`).
 */
export function aenderungen(
  e: Entwurf,
  k: Kontakt,
): Record<string, string | string[] | null> | null {
  const neu = alsSpalten(e)
  const patch: Record<string, string | string[] | null> = {}

  // Die Mehrfachfelder zuerst, getrennt vom String-Vergleich darunter: für sie
  // ist `!==` immer wahr (zwei Arrays sind nie identisch), ein
  // Öffnen-und-Speichern schriebe sie also bei JEDEM Mal mit. Verglichen wird
  // der Inhalt, und beide Seiten laufen durch dieselbe Normalisierung — die
  // Reihenfolge in der Spalte ist damit ohne Belang.
  for (const { key, optionen } of MEHRFACH) {
    // **`undefined` heißt „nicht geladen" und darf NICHT als „leer" gelten**
    // (Fremdprüfung 03.08.2026, A9). Beide Spalten sind NOT NULL mit Vorgabe
    // `{}` — aus der Datenbank kommt nie `undefined`, wohl aber aus einem
    // `.select()`, das sie nicht mitnimmt. Dann zeigte der Inspektor eine leere
    // Aufzählung, und der erste Klick schriebe genau diese Leere zurück:
    // stiller Verlust der echten Werte, mit Erfolgsmeldung. Dieselbe Klasse wie
    // die Normalisierung des Alt-Werts unten, nur teurer.
    //
    // Heute lädt die einzige Aufruferin beide Spalten (`page.tsx`); der Riegel
    // steht hier statt dort, weil er dann für JEDE künftige Aufruferin gilt.
    if (k[key] === undefined) continue
    const alt = normiert(k[key], optionen)
    if (neu[key].join(',') !== alt.join(',')) patch[key] = neu[key]
  }

  for (const feld of Object.keys(neu) as (keyof Entwurf)[]) {
    const wert = neu[feld]
    // Weiter über `Object.keys` statt über `FELDER`: ein künftiges Textfeld
    // wird so auch dann verglichen, wenn jemand es nur dem Entwurf hinzufügt.
    // Die Alternative liefe still ins Leere — das Feld ließe sich eintippen und
    // würde beim Speichern verworfen.
    if (Array.isArray(wert)) continue // oben behandelt
    // **Der gespeicherte Wert wird GENAUSO normalisiert wie der Entwurf**, sonst
    // meldet der Vergleich eine Änderung, die niemand vorgenommen hat: liegt in
    // der Spalte `'  intern  '`, ist der Entwurf daraus `'intern'` — und ein
    // bloßes Öffnen-und-Speichern schriebe die Spalte mit. Genau das, wogegen
    // diese Funktion gebaut ist, nur andersherum.
    // Heute (01.08.2026) trägt keine der 154 Zeilen Leerraum an den Rändern und
    // keine einen Leerstring — der Fall kommt mit dem vCard-Import.
    // (Codex, 01.08.2026, „mittel"; die Zählung ist danach nachgeholt worden.)
    const gespeichert = k[feld]
    const alt = (typeof gespeichert === 'string' ? gespeichert : '').trim() || null
    if (wert !== alt) patch[feld] = wert
  }
  return Object.keys(patch).length > 0 ? patch : null
}

// ===========================================================================
// Mehrere auf einmal zuordnen
// ===========================================================================
//
// **Moritz am 03.08.2026, beim ersten Ansehen der fertigen Seite:** „sollte man
// nicht bei gästen auf ‚schützen' klicken können und dann alle anwählen die als
// schütze eingeladen werden sollen?"
//
// Der Anlass ist gemessen: **154 Kontakte, alle ohne Kategorie**, und einzeln
// durch den Inspektor sind das 154 Mal Zeile öffnen, Formular, Haken,
// Speichern, zurück. Der Kategorie-Filter im Einlade-Dialog nützt nichts,
// solange niemand die Kategorien pflegt — und das tut niemand, wenn es so lange
// dauert. Die Massenzuordnung ist damit keine Bequemlichkeit, sondern die
// Bedingung dafür, dass der ganze Block benutzt wird.

/** Was eine Massenzuordnung mit der Kategorie tut. */
export const ZUORDNUNG = ['hinzufuegen', 'entfernen'] as const
export type Zuordnung = (typeof ZUORDNUNG)[number]

/**
 * Der neue Kategorien-Wert für einen Kontakt — oder `null`, wenn sich nichts
 * ändert.
 *
 * **`null` heißt „nicht schreiben", und das ist bei 154 Zeilen der Unterschied
 * zwischen 154 Requests und drei.** Wer schon Schütze ist, braucht kein Update;
 * ein Patch, der denselben Wert zurückschreibt, kostet einen Roundtrip und
 * überschreibt nebenbei, was ein Mitführender in derselben Sekunde gesetzt hat.
 * Dieselbe Überlegung wie bei `aenderungen()`.
 *
 * **Hinzufügen ist additiv, nicht ersetzend** — die Kategorien sind
 * ausdrücklich mehrfach (094: „Schweißhundführer können auch Schützen sein").
 * Wer den Treibern eine Schützen-Marke gibt, nimmt ihnen nicht die Treiber-Marke.
 *
 * **Entfernen gibt es, weil es Hinzufügen gibt.** Ein Sammelklick auf 40 Zeilen
 * ist genau die Handlung, bei der man sich vergreift; ohne den Rückweg wäre der
 * einzige Ausweg, 40 Kontakte einzeln zu öffnen (S5 — irreversibel und
 * ungefragt).
 */
export function zuordnungsPatch(
  k: Pick<Kontakt, 'kategorien'>,
  kategorie: Kategorie,
  aktion: Zuordnung,
): Kategorie[] | null {
  const jetzt = normiert(k.kategorien, KATEGORIEN)
  const hat = jetzt.includes(kategorie)
  if (aktion === 'hinzufuegen' && hat) return null
  if (aktion === 'entfernen' && !hat) return null
  const neu = aktion === 'hinzufuegen' ? [...jetzt, kategorie] : jetzt.filter((x) => x !== kategorie)
  return normiert(neu, KATEGORIEN)
}

/** Die Beschriftung einer Kategorie — für Meldungen, die sie benennen. */
export function kategorieLabel(kategorie: Kategorie): string {
  return KATEGORIEN.find((k) => k.wert === kategorie)?.label ?? kategorie
}

/**
 * Die Beschriftung des Zuordnen-Knopfes — **der ganze Satz, nicht ein Verb.**
 *
 * Der Knopf trägt Kategorie, Anzahl und Richtung, damit daneben kein Hilfetext
 * stehen muss — „Kategorie hinzufügen" ließ offen, WELCHE und an WIE VIELE.
 * Bei `anzahl === 0` nennt er die fehlende Vorbedingung statt der Handlung.
 * Die Fälle stehen ausführbar im Selbsttest.
 */
export function zuordnungLabel(
  kategorie: Kategorie,
  anzahl: number,
  aktion: Zuordnung,
): string {
  if (anzahl === 0) return 'Erst Gäste markieren'
  const wen = anzahl === 1 ? '1 Gast' : `${anzahl} Gästen`
  const was = `„${kategorieLabel(kategorie)}"`
  return aktion === 'hinzufuegen'
    ? `${was} zu ${wen} hinzufügen`
    : `${was} von ${wen} entfernen`
}

// ===========================================================================
// Chronik Söder (A-C3) — Migration 110, `historische_strecken`
// ===========================================================================
/**
 * **Die Regel, ohne die jede Auswertung hier falsch wird** (Konzept
 * `QuickHunt_Konzept_Historische_Strecken_V1.md` §3, Tabellenkommentar von
 * 110): die vier Werte von `quelle` sind vier **Projektionen desselben
 * Bestands**, keine addierbaren Töpfe. `jagden_soeder` (3221) steckt in
 * `rangliste_soeder` (4646); `journal_msl` enthält dessen Söder-Anteil;
 * `familie_jahr` zählt **alle Reviere** (JHL 1368) gegen denselben Mann in
 * Söder (312). An der Produktion gemessen: quer summiert ergäbe die Tabelle
 * **11136** statt 4646.
 *
 * Deshalb liest diese Datei die Chronik **nie über die Tabelle**, sondern über
 * die vier Views von 110, und deshalb bleiben die beiden Projektionen unten
 * bis in die Anzeige getrennt. `soeder` und `jahre` dürfen an keiner Stelle
 * addiert werden — auch nicht „nur zur Anzeige".
 */
export type Chronikzeile = {
  kontakt_id: string | null
  art_text: string | null
  jagdjahr: number | null
  anzahl: number
}

/** Eine Art mit ihrer Summe — die Einheit beider Projektionen. */
export type ChronikArt = { art: string; anzahl: number }

export type ChronikEintrag = {
  /** `rangliste_soeder`: Lebenssumme in Söder seit 1946. **Ohne Jahresachse.** */
  soeder: ChronikArt[]
  soederGesamt: number
  /** `familie_jahr`: Person × Jagdjahr × Art über **alle Reviere**. Nur für
   *  die vier Familienblätter (JHL/MSL/DL/NNL) belegt, sonst leer. */
  jahre: { jahr: number; arten: ChronikArt[]; summe: number }[]
  jahreGesamt: number
}

/** Sortiert Arten nach Menge, bei Gleichstand alphabetisch — damit die
 *  Reihenfolge bei gleichen Zahlen nicht zwischen zwei Ladevorgängen springt. */
function nachMenge(a: ChronikArt, b: ChronikArt): number {
  return b.anzahl - a.anzahl || a.art.localeCompare(b.art, 'de')
}

function summiereArten(zeilen: readonly Chronikzeile[]): ChronikArt[] {
  const je = new Map<string, number>()
  for (const z of zeilen) {
    // `art_text` ist bei `jagden_soeder` NULL, dort aber lesen wir gar nicht.
    // Eine NULL-Art hier wäre eine Zeile, die nicht in diese View gehört.
    if (!z.art_text) continue
    je.set(z.art_text, (je.get(z.art_text) ?? 0) + z.anzahl)
  }
  return [...je].map(([art, anzahl]) => ({ art, anzahl })).sort(nachMenge)
}

/**
 * Gruppiert beide Projektionen **je Kontakt**. Läuft auf dem Server, damit der
 * Client nur noch nachschlägt.
 *
 * Zeilen ohne `kontakt_id` fallen heraus — das sind die neun Kollektivzeilen
 * des Papiers (Hunde 54, Fallwild 3, Treiber 1, Hundeführer 5, „verschiedene
 * Schützen (vor 1968)" 14, „sonstige Engländer (1945-48)" 4). Sie gehören in
 * die Söder-Gesamtsumme, aber zu keinem Menschen; im Kontakt-Inspektor hätten
 * sie keinen Ort. Folge, die man kennen muss: **die Summe über alle Einträge
 * dieser Abbildung ist kleiner als die Söder-Gesamtsumme** und darf nicht als
 * solche ausgegeben werden.
 */
export function chronikNachKontakt(
  rangliste: readonly Chronikzeile[],
  familie: readonly Chronikzeile[],
): Record<string, ChronikEintrag> {
  const raus: Record<string, ChronikEintrag> = {}
  const hol = (id: string): ChronikEintrag =>
    (raus[id] ??= { soeder: [], soederGesamt: 0, jahre: [], jahreGesamt: 0 })

  const jeKontakt = new Map<string, Chronikzeile[]>()
  for (const z of rangliste) {
    if (!z.kontakt_id) continue
    jeKontakt.set(z.kontakt_id, [...(jeKontakt.get(z.kontakt_id) ?? []), z])
  }
  for (const [id, zeilen] of jeKontakt) {
    const e = hol(id)
    e.soeder = summiereArten(zeilen)
    e.soederGesamt = e.soeder.reduce((s, a) => s + a.anzahl, 0)
  }

  const jeKontaktJahr = new Map<string, Map<number, Chronikzeile[]>>()
  for (const z of familie) {
    // `jagdjahr` ist in `familie_jahr` per CHECK NOT NULL. Die Bedingung ist
    // der Typ-Riegel, nicht eine vermutete Lücke.
    if (!z.kontakt_id || z.jagdjahr == null) continue
    const jahre = jeKontaktJahr.get(z.kontakt_id) ?? new Map<number, Chronikzeile[]>()
    jahre.set(z.jagdjahr, [...(jahre.get(z.jagdjahr) ?? []), z])
    jeKontaktJahr.set(z.kontakt_id, jahre)
  }
  for (const [id, jahre] of jeKontaktJahr) {
    const e = hol(id)
    e.jahre = [...jahre]
      .map(([jahr, zeilen]) => {
        const arten = summiereArten(zeilen)
        return { jahr, arten, summe: arten.reduce((s, a) => s + a.anzahl, 0) }
      })
      // Neueste Saison zuerst: die Chronik reicht 52 Jahre zurück, und die
      // Frage „was war zuletzt" ist die häufigere.
      .sort((a, b) => b.jahr - a.jahr)
    e.jahreGesamt = e.jahre.reduce((s, j) => s + j.summe, 0)
  }
  return raus
}

/** `1993` → `1993/94`. Die Saison heißt im Papier nach ihrem Anfangsjahr. */
export function alsSaison(jahr: number): string {
  return `${jahr}/${String((jahr + 1) % 100).padStart(2, '0')}`
}
