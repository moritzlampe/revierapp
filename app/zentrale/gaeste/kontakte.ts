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
 */
export function passtZuSuche(k: Kontakt, suche: string): boolean {
  const woerter = suchtext(suche).split(/\s+/).filter(Boolean)
  if (woerter.length === 0) return true
  // Adresse und beide Nummern sind heute bei allen 154 Zeilen leer und stehen
  // trotzdem hier: das Formular füllt sie ab jetzt, und ein Suchfeld, das ein
  // eingebbares Feld stillschweigend auslässt, ist später schwer zu bemerken.
  const heuhaufen = suchtext(
    [k.vorname, k.nachname, k.begleitung, k.email, k.telefon, k.handy, k.adresse, k.notiz]
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
 * Die drei Listenfilter. Der Zustand gehört in die URL (Zentrale-Konzept §2.4).
 *
 * `code` heißt „kann nur per weitergegebenem Code eingeladen werden" und deckt
 * damit alle drei Wege außer E-Mail. Der **Schlüssel bleibt `code`**, obwohl
 * der Knopf inzwischen „Ohne E-Mail" heißt: er steht in geteilten Links
 * (`?filter=code`), und die Bedeutung hat sich nicht geändert — nur die
 * Beschriftung sagt jetzt, wonach gefiltert wird, statt was daraus folgt.
 *
 * `streichen` ist ausdrücklich **kein Datenfeld**, sondern ein Suchausdruck mit
 * eigenem Knopf: der Vermerk steht als Freitext in der Notiz, wo der Import ihn
 * abgelegt hat. Sind alle 32 entschieden, läuft der Filter leer und es bleibt
 * keine Spalte zurück, die die übrigen 122 nie gebraucht haben.
 */
export type Filter = 'alle' | 'code' | 'streichen'

/** Alles Unbekannte wird `alle` — ein getippter Parameter soll nicht leeren. */
export function alsFilter(wert: string | null | undefined): Filter {
  return wert === 'code' || wert === 'streichen' ? wert : 'alle'
}

/** Trägt die Notiz den unentschiedenen Vermerk? */
export function istGestrichen(k: Pick<Kontakt, 'notiz'>): boolean {
  return suchtext(k.notiz ?? '').includes('streichen')
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
    if (filter === 'code' && einladungsweg(k) === 'email') return false
    if (filter === 'streichen' && !istGestrichen(k)) return false
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
}

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
export const FELDER: readonly {
  key: keyof Entwurf
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
 */
export function alsSpalten(e: Entwurf): Record<keyof Entwurf, string | null> {
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
): Record<string, string | null> | null {
  const neu = alsSpalten(e)
  const patch: Record<string, string | null> = {}
  for (const feld of Object.keys(neu) as (keyof Entwurf)[]) {
    // **Der gespeicherte Wert wird GENAUSO normalisiert wie der Entwurf**, sonst
    // meldet der Vergleich eine Änderung, die niemand vorgenommen hat: liegt in
    // der Spalte `'  intern  '`, ist der Entwurf daraus `'intern'` — und ein
    // bloßes Öffnen-und-Speichern schriebe die Spalte mit. Genau das, wogegen
    // diese Funktion gebaut ist, nur andersherum.
    // Heute (01.08.2026) trägt keine der 154 Zeilen Leerraum an den Rändern und
    // keine einen Leerstring — der Fall kommt mit dem vCard-Import.
    // (Codex, 01.08.2026, „mittel"; die Zählung ist danach nachgeholt worden.)
    const alt = (k[feld] ?? '').trim() || null
    if (neu[feld] !== alt) patch[feld] = neu[feld]
  }
  return Object.keys(patch).length > 0 ? patch : null
}
