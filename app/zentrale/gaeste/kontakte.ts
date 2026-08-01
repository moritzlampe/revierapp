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
 * „Nachname, Vorname" — und wenn eines fehlt, das andere allein.
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
  const nach = (k.nachname ?? '').trim()
  const vor = (k.vorname ?? '').trim()
  if (nach && vor) return `${nach}, ${vor}`
  return nach || vor || '(ohne Namen)'
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
const PARTIKEL = new Set(['v.', 'von', 'vom', 'van', 'zu', 'zur', 'zum', 'de', 'del', 'della', 'da'])

/** Bindestrichnamen zählen doppelt: „Hans-Gerd" trägt H und G. */
function teile(name: string): string[] {
  return name.split(/[\s]+/).flatMap((w) => w.split('-')).filter(Boolean)
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
  const w = (nachname ?? '').trim().split(/\s+/).filter(Boolean)
  let i = 0
  while (i < w.length - 1 && (TITEL.has(w[i].toLowerCase()) || PARTIKEL.has(w[i].toLowerCase()))) i++
  return w.slice(i).join(' ').toLowerCase()
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
 * **Bewusst nicht gespeichert.** Solange es keine Möglichkeit gibt, ein einzelnes
 * Kürzel zu überschreiben, wäre eine Spalte eine zweite Wahrheit, die sofort von
 * der ersten abweichen kann. Eine nullable Spalte (leer = ableiten, gesetzt =
 * Vorgabe des Besitzers) kommt mit dem Bearbeiten-Formular — dann trägt sie auch
 * etwas.
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
  // `adresse` ist heute bei allen 154 Zeilen leer und steht trotzdem hier: der
  // vCard-Import füllt sie, und ein Suchfeld, das ein angezeigtes Feld
  // stillschweigend auslässt, ist später schwer zu bemerken.
  const heuhaufen = suchtext(
    [k.vorname, k.nachname, k.begleitung, k.email, k.adresse, k.notiz].filter(Boolean).join(' '),
  )
  return woerter.every((w) => heuhaufen.includes(w))
}

/**
 * Auf welchem Weg erreicht diesen Kontakt ein Begehungsschein?
 *
 * Das ist die eine Angabe, die aus dem Datensatz eine Handlungsmöglichkeit
 * macht — und sie hat **zwei** Werte, nicht einen Normalfall und eine Warnung.
 * Beide Zustände tragen dieselbe neutrale Pille: 26 von 154 haben keine
 * Adresse, und das ist eine Eigenschaft des Kontakts, kein Fehler des Nutzers
 * (Konzept §4).
 */
export function einladungsweg(k: Pick<Kontakt, 'email'>): 'adresse' | 'code' {
  return (k.email ?? '').trim() ? 'adresse' : 'code'
}

export const EINLADUNGSWEG_LABEL: Record<'adresse' | 'code', string> = {
  adresse: 'per Adresse',
  code: 'nur per Code',
}

/**
 * Der ausgeschriebene Satz für den Inspektor — oder `null`, wenn nichts fehlt.
 *
 * Der Bildschirm zeigt, **wofür** ein Kontakt unvollständig ist; er verweigert
 * nichts (Konzept §4). Formulierungsvorbild ist die schon gebaute Stelle in
 * `../jagderlaubnisse/formular.tsx` — „keine — nur per Code erreichbar" —,
 * damit Gäste und Jagderlaubnisse dieselbe Sprache sprechen.
 *
 * Bewusst **nur** die E-Mail. Telefon, Handy und Adresse sind bei allen 154
 * Zeilen leer und haben heute keinen Leser: ein Hinweis darauf wäre 154-mal
 * derselbe Satz und damit ein Lineal, keine Auskunft.
 */
export function einladungsHinweis(k: Pick<Kontakt, 'email'>): string | null {
  if (einladungsweg(k) === 'adresse') return null
  return 'Ohne E-Mail ist ein Begehungsschein nur per weitergegebenem Code erreichbar.'
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
    if (filter === 'code' && einladungsweg(k) !== 'code') return false
    if (filter === 'streichen' && !istGestrichen(k)) return false
    return passtZuSuche(k, suche)
  })
}
