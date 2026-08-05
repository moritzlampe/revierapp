/**
 * Die Regeln hinter dem Begehungsschein-Formular — ohne React, ohne Netz.
 *
 * Bewusst **ohne jeden Import**, damit die Datei mit
 * `node --experimental-strip-types` prüfbar ist (siehe `scheine.selftest.ts`).
 * Dasselbe Muster wie `schreiben.ts` und `objekte.ts`.
 *
 * **Warum die Statuslogik hier nachgebaut ist und nicht importiert.** Das
 * Gegenstück steht in quickhunt-native (`src/lib/data/licenses.ts`,
 * `effectiveStatus`) — ein anderes Repo, kein gemeinsames Paket. Beide leiten
 * dieselbe Regel aus Migration 077 ab (`current_date between valid_from and
 * valid_until`, beide Enden einschließend). Die Migration ist die Quelle, nicht
 * eine der beiden Kopien; wer sie ändert, muss beide nachziehen.
 */

/** `jes_status` aus Migration 068, plus zwei Werte, die kein Enum kennt. */
export type JesStatus =
  | 'aktiv'
  | 'pausiert'
  | 'entzogen'
  | 'abgelaufen'
  | 'nochnicht'
  | 'unbekannt'

/**
 * Alles Unbekannte wird `unbekannt`, nie `aktiv`.
 *
 * Erweitert eine spätere Migration das Enum, soll diese Ansicht den neuen Wert
 * als „kenne ich nicht" zeigen und nicht als gültigen Schein — sonst stünde ein
 * grünes Abzeichen über einem Revier, das RLS längst zugemacht hat.
 */
export function alsStatus(wert: string | null | undefined): JesStatus {
  switch (wert) {
    case 'aktiv':
    case 'pausiert':
    case 'entzogen':
    case 'abgelaufen':
      return wert
    default:
      return 'unbekannt'
  }
}

/**
 * Der Status, den der Schein HEUTE hat.
 *
 * `status` kippt nicht von selbst — es gibt keinen Job, der abgelaufene Scheine
 * umschreibt, und bewusst keinen: seit Migration 077 ist das Datum selbst die
 * Zugriffsgrenze in den Policies. Die Spalte sagt, was der Aussteller verfügt
 * hat; das Datum sagt, ob es gerade gilt.
 *
 * Eine Sperre schlägt das Datum: wer entzogen wurde, soll das lesen und nicht
 * „abgelaufen". Der Zugriff ist in beiden Fällen zu, aber nur einer der beiden
 * Texte nennt den richtigen Grund.
 *
 * ISO-Datumsstrings vergleichen sich als Text richtig, solange alle gleich lang
 * sind — `date` aus PostgREST ist immer `YYYY-MM-DD`.
 */
export function effektiverStatus(
  roh: JesStatus,
  gueltigVon: string,
  gueltigBis: string,
  heute: string,
): JesStatus {
  if (roh !== 'aktiv') return roh
  if (heute > gueltigBis) return 'abgelaufen'
  if (heute < gueltigVon) return 'nochnicht'
  return 'aktiv'
}

/**
 * Ob zu diesem Zustand ein Blatt ausgegeben wird.
 *
 * **Zwei Zustaende, nicht einer** — und die zweite Haelfte ist der Fehler, den
 * der erste Entwurf gemacht hat (Schlusslesung 05.08.2026, Befund 1). Er
 * pruefte `=== 'aktiv'` und sperrte damit `nochnicht` mit: einen heute fuer die
 * kommende Saison ausgestellten Schein, also den haeufigsten Fall ueberhaupt.
 * Die Mitfuehrpflicht aus § 19 NJagdG beginnt am ersten Ansitz, nicht am Tag
 * des Ausdrucks, und das Blatt nennt seinen Gueltigkeitszeitraum selbst.
 *
 * Was NICHT gedruckt wird: `pausiert` und `entzogen` (jemand hat die Erlaubnis
 * zurueckgenommen), `abgelaufen` (der Zeitraum ist vorbei) und `unbekannt` (ein
 * Wert, den diese Fassung nicht kennt — im Zweifel kein Dokument).
 */
export function darfGedrucktWerden(status: JesStatus): boolean {
  return status === 'aktiv' || status === 'nochnicht'
}

export const STATUS_LABEL: Record<JesStatus, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  entzogen: 'Entzogen',
  abgelaufen: 'Abgelaufen',
  nochnicht: 'Ab später',
  unbekannt: 'Unbekannt',
}

/**
 * Heute als `YYYY-MM-DD` in **UTC**.
 *
 * Nicht die lokale Zeitzone: die DB läuft auf UTC, und 077 zieht die Grenze mit
 * `current_date`. Im Berliner Sommer (UTC+2) läge das lokale Datum zwischen
 * Mitternacht und 02:00 einen Tag vor dem der DB — die Liste meldete
 * „Abgelaufen" über einem Schein, der noch zwei Stunden gilt.
 */
export function heuteUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Das Ende des laufenden Jagdjahres (31. März) als Vorbelegung.
 *
 * Ein Begehungsschein läuft üblicherweise auf das Jagdjahr, und das geht vom
 * 1. April bis zum 31. März. Nur eine Vorbelegung — das Feld bleibt frei
 * änderbar, denn Scheine über mehrere Jahre gibt es auch.
 */
export function jagdjahrEnde(heute: string): string {
  const jahr = Number(heute.slice(0, 4))
  const monat = Number(heute.slice(5, 7))
  return `${monat >= 4 ? jahr + 1 : jahr}-03-31`
}

/**
 * Welche der drei Arten ein Schein zuteilt (Begehungsschein-Konzept §5).
 *
 * Zonen schlagen Stände, wenn beides gesetzt ist — zeichengleich mit
 * `areaKindOf` in der nativen App. Das Konzept kennt die Mischung nicht, die
 * Spalten schließen sie aber nicht aus, und eine Ansicht darf nicht davon
 * abhängen, dass niemand etwas Unvorgesehenes einträgt.
 */
export function zuteilungsArt(
  zoneIds: readonly string[] | null,
  standIds: readonly string[] | null,
): 'revier' | 'zonen' | 'staende' {
  if ((zoneIds?.length ?? 0) > 0) return 'zonen'
  if ((standIds?.length ?? 0) > 0) return 'staende'
  return 'revier'
}

export type Entwurf = {
  name: string
  email: string
  von: string
  bis: string
  art: 'revier' | 'staende'
  standIds: readonly string[]
  auflagen: string
  /**
   * Migration 103. `null` heißt „nicht angegeben" und wird von `pruefeEntwurf`
   * abgewiesen: in der DB trägt es die vier Scheine aus der Zeit vor der Frage,
   * am Formular gibt es diese Zeit nicht.
   */
  entgeltlich: boolean | null
}

/**
 * Prüft den Entwurf und gibt den ERSTEN Fehlertext zurück, oder `null`.
 *
 * Die Adressprüfung ist absichtlich lose. Sie kann nicht entscheiden, was hier
 * allein zählt — ob die Adresse die **Anmelde**-Adresse des Nehmers ist. Das
 * weiß nur `meine_einladungen()` (Migration 080), und erst zum Zeitpunkt der
 * Annahme. Eine strenge Regex fängt einen Tippfehler in der Domain nicht und
 * würde nur vortäuschen, hier werde etwas garantiert. Der abgetippte Code
 * bleibt der Rückfallweg für genau diesen Fall.
 */
export function pruefeEntwurf(e: Entwurf): string | null {
  if (!e.name.trim()) return 'Der Name des Inhabers fehlt.'
  const email = e.email.trim()
  if (!email) return 'Die Anmelde-Adresse fehlt — ohne sie sieht der Nehmer die Einladung nicht.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Die Adresse sieht nicht wie eine E-Mail-Adresse aus.'
  if (!e.von || !e.bis) return 'Gültig von und bis müssen beide gesetzt sein.'
  // Beide Enden sind einschließend (077), ein Tagesschein ist also gültig.
  if (e.bis < e.von) return 'Das Ende liegt vor dem Beginn.'
  if (e.art === 'staende' && e.standIds.length === 0) return 'Kein Stand ausgewählt.'
  if (e.entgeltlich === null) return 'Entgeltlich oder unentgeltlich — bitte eins von beidem wählen.'
  return null
}

/**
 * Ein `date` aus PostgREST als `DD.MM.YYYY`.
 *
 * **Reine Zeichenarbeit, kein `Date`** — dann gibt es die Zeitzonenfalle gar
 * nicht, statt sie mit `timeZone: 'UTC'` zu entschärfen. `valid_from` und
 * `valid_until` sind `date` und kennen keine Uhrzeit.
 *
 * Zeichengleich mit `alsDatum()` in `../gaeste/kontakte.ts`. **Kopiert statt
 * importiert, und das ist Absicht:** beide Dateien müssen importfrei bleiben,
 * damit `node --experimental-strip-types` sie prüfen kann — ein Import bräuchte
 * die `.ts`-Endung für Node und würde damit `tsc` brechen. `kontakte.ts` löst es
 * seit dem 04.08.2026 genauso und verweist seinerseits hierher.
 */
export function alsDatum(iso: string | null): string {
  if (!iso || iso.length < 10) return '—'
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

/**
 * Ein `timestamptz` als Berliner Kalendertag.
 *
 * **Nicht `alsDatum()`, und das ist der Unterschied, an dem sich dieses Repo
 * schon einmal vertan hat** (Fremdprüfung 04.08.2026, Punkt 3, an
 * `kontakte.inaktiv_seit`): der Schnitt am ISO-String liefert die **UTC**-Date.
 * Für ein `date` ist das richtig, für einen Zeitpunkt einen Tag zu früh — wer um
 * 00:30 Berliner Zeit einen Schein ausstellt, steht in UTC noch auf dem Vortag.
 * `hunting_licenses.created_at` ist ein `timestamptz`, das Blatt braucht also
 * diese Fassung.
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
 * Eine Flächenangabe in Hektar, deutsch gesetzt.
 *
 * Immer zwei Nachkommastellen, damit die Zahl in tabellarischen Ziffern nicht
 * springt. Fehlt sie, kommt `null` zurück — das Blatt lässt sie dann weg,
 * statt „0 ha" zu behaupten.
 */
export function alsHektar(ha: number | null | undefined): string | null {
  if (ha == null || !Number.isFinite(ha)) return null
  return `${ha.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`
}

/**
 * Wie die Entgeltlichkeit auf dem Ausdruck steht — drei Zustände, nicht zwei.
 *
 * `null` heißt „nicht angegeben". Dann bleiben BEIDE Wörter stehen und ein
 * Mensch streicht das Falsche durch, wie auf jedem Behördenvordruck. Das ist
 * die Form, in der ein Papier „weiß ich nicht" sagen kann, ohne zu lügen.
 */
export function entgeltAufDemBlatt(entgeltlich: boolean | null | undefined): string {
  if (entgeltlich === true) return 'Entgeltlich'
  if (entgeltlich === false) return 'Unentgeltlich'
  return 'Entgeltlich – Unentgeltlich'
}

/**
 * Was ein Bundesland auf dem Blatt zu stehen hat.
 *
 * **Eine Tabelle, kein Ast je Land** (Moritz, 05.08.2026: „erstmal
 * niedersachsen. später werden wir die anderen bundesländer ergänzen"). Ein
 * weiteres Land ist damit ein Eintrag und keine Codeänderung — und genau das
 * war das Versprechen; zwei Funktionen mit je einem `if` hätten es nicht
 * gehalten.
 *
 * Nötig ist die Verzweigung, weil die Erteilung von Jagderlaubnisscheinen
 * Landesrecht ist (§ 11 Abs. 1 Satz 3 BJagdG) und die Länder weit
 * auseinandergehen: Niedersachsen kennt keine Anzeigepflicht des Ausstellers,
 * NRW verlangt eine binnen eines Monats, Brandenburg eine dreiwöchige
 * Wartefrist (**beides Sekundärquelle, Gesetzeswortlaut ungeprüft** — s. den
 * Ehrlichkeitsvermerk in §5 der Recherche; wer NRW einträgt, fängt beim
 * Gesetzestext an, nicht bei diesem Kommentar). Ein Blatt ohne Landesbezug
 * erweckte den Eindruck, überall gelte dasselbe.
 *
 * **Die Gesetzestexte stehen im vollen Wortlaut.** Das Blatt wird nach § 19
 * NJagdG einem Beamten hingehalten; ein mit „…" gekürzter Paragraph ist genau
 * dort die schwächere Fassung.
 */
type Landesrecht = {
  /** Kleingedrucktes, immer. `text` ist WORTLAUT, `zusatz` ist unsere Anmerkung. */
  readonly hinweise: readonly {
    readonly bezug: string
    readonly text: string
    readonly zusatz?: string
  }[]
  /**
   * Steht auf jedem Blatt AUSSER dem ausdrücklich unentgeltlichen — also auch
   * auf dem Altbestand, der beide Wörter stehen lässt (s. `landesrecht()`).
   * **Der Text muss seine Entgeltlich-Bedingung deshalb selbst nennen**, sonst
   * behauptet er auf einem gestrichenen „Entgeltlich" eine Pflicht, die
   * § 20 Nr. 5 für unentgeltliche Erlaubnisse gar nicht kennt. (Delta-Durchgang
   * 05.08.2026, D1/D2)
   */
  readonly behoerdeWennEntgeltlich: string
}

const LANDESRECHT: { readonly [bundesland: string]: Landesrecht | undefined } = {
  Niedersachsen: {
    hinweise: [
      {
        bezug: '§ 19 NJagdG',
        text:
          'Jeder Jagdgast muss bei Ausübung der Jagd 1. einen Jagderlaubnisschein mit sich '
          + 'führen oder 2. von einer jagdausübungsberechtigten Person oder einer angestellten '
          + 'Jägerin oder einem angestellten Jäger begleitet sein. Für die Begleitung nach '
          + 'Satz 1 Nr. 2 reicht es aus, wenn die Begleitperson im Jagdbezirk ohne '
          + 'Schwierigkeiten zu erreichen ist.',
      },
      {
        bezug: '§ 18 Abs. 2 NJagdG',
        text:
          'Die angestellten Jägerinnen und Jäger sowie die Jagdgäste dürfen sich, soweit '
          + 'nichts anderes vereinbart ist, abweichend von § 1 Abs. 1 und 5 des '
          + 'Bundesjagdgesetzes die Trophäen des von ihnen erlegten Wildes aneignen.',
        zusatz: 'Eine abweichende Vereinbarung steht, falls getroffen, oben unter „Auflagen".',
      },
    ],
    behoerdeWennEntgeltlich:
      'Niedersachsen: Diese Erlaubnis ist von der ausstellenden Person nicht bei der '
      + 'Jagdbehörde anzuzeigen. Wer als Inhaber einen Jagdpachtvertrag anzeigt, hat sie '
      + 'dabei nach § 20 Nr. 5 NJagdG anzugeben, sofern sie entgeltlich erteilt wurde und '
      + 'mindestens die Jagd auf eine Wildart für deren volle Jagdzeit gestattet.',
  },
}

/**
 * Der landesrechtliche Teil des Blattes.
 *
 * **Ein unbekanntes Land bekommt nichts** — lieber kein Paragraph als ein
 * fremder. NJagdG-Text auf einem bayerischen Blatt wäre schlicht falsch, und
 * das Blatt lässt den Abschnitt dann ganz weg.
 *
 * Der Behörden-Hinweis richtet sich an den EMPFÄNGER, nicht an den Aussteller:
 * in Niedersachsen hat der Aussteller keine Pflicht gegenüber der Behörde.
 *
 * **Er erscheint auch beim Altbestand (`null`), und das ist eine Entscheidung**
 * (Schlusslesung 05.08.2026, Befund 9): ein `null`-Blatt lässt beide Wörter
 * stehen und fordert zum Streichen auf. Streicht der Mensch „Unentgeltlich",
 * hält der Empfänger ein entgeltliches Papier in der Hand — ohne den Hinweis
 * wäre es das einzige, das ihn nicht auf seine Pflicht stößt. Nur `false`
 * unterdrückt ihn, weil dort jemand ausdrücklich „unentgeltlich" entschieden
 * hat.
 */
export function landesrecht(
  bundesland: string | null | undefined,
  entgeltlich: boolean | null | undefined,
): {
  hinweise: readonly { bezug: string; text: string; zusatz?: string }[]
  behoerde: string | null
} {
  // `Object.hasOwn`, nicht bloß der Zugriff: `LANDESRECHT['constructor']` oder
  // `['toString']` träfe sonst die Prototyp-Kette, und `landesrecht()` gäbe
  // entgegen seinem Rückgabetyp `hinweise: undefined` zurück — das Blatt
  // stürbe an `.map()`. Der Wert kommt aus `districts.bundesland`, einer frei
  // beschreibbaren Textspalte. (Codex, 05.08.2026, W10)
  const schluessel = bundesland ?? ''
  const land = Object.hasOwn(LANDESRECHT, schluessel) ? LANDESRECHT[schluessel] : undefined
  if (!land) return { hinweise: [], behoerde: null }
  return {
    hinweise: land.hinweise,
    behoerde: entgeltlich === false ? null : land.behoerdeWennEntgeltlich,
  }
}

/**
 * Der Entwurf als INSERT-Zeile.
 *
 * Nicht gesetzt und mit Absicht: `holder_id` (setzt erst `schein_einloesen()`),
 * `invite_code` (erzeugt die Spalten-Vorgabe), `status` (Vorgabe `aktiv`).
 *
 * **Die Adresse wird nur außen getrimmt, nicht kleingeschrieben.** Der
 * Vergleich in `meine_einladungen()` macht `lower(trim(...))` auf beiden Seiten;
 * hier zu normalisieren brächte nichts und nähme dem Revierinhaber die
 * Schreibweise, an der er die Person wiedererkennt.
 */
export function alsSpalten(e: Entwurf, revierId: string, ausstellerId: string) {
  return {
    district_id: revierId,
    issuer_id: ausstellerId,
    holder_name: e.name.trim(),
    holder_email: e.email.trim(),
    valid_from: e.von,
    valid_until: e.bis,
    zone_ids: [] as string[],
    stand_ids: e.art === 'staende' ? [...e.standIds] : [],
    auflagen: e.auflagen.trim() || null,
    entgeltlich: e.entgeltlich,
  }
}

/** Die Ergebnisse von `schein_einloesen()` (Migration 068), plus Auffangfall. */
export type EinloeseErgebnis =
  | 'ok'
  | 'bereits_deiner'
  | 'schon_eingeloest'
  | 'gesperrt'
  | 'abgelaufen'
  | 'unbekannt'
  | 'nicht_angemeldet'
  | 'fehler'

/**
 * **Alles Unbekannte wird `fehler`, nie `ok`** — dieselbe Richtung wie
 * `alsStatus` und wie `toRedeemOutcome` in der nativen App. Ein falsches „hat
 * geklappt" schickt den Nutzer in ein Revier, das die DB ihm gleich darauf
 * verweigert.
 */
export function alsEinloeseErgebnis(wert: string | null | undefined): EinloeseErgebnis {
  switch (wert) {
    case 'ok':
    case 'bereits_deiner':
    case 'schon_eingeloest':
    case 'gesperrt':
    case 'abgelaufen':
    case 'unbekannt':
    case 'nicht_angemeldet':
      return wert
    default:
      return 'fehler'
  }
}

export function einloeseText(ergebnis: EinloeseErgebnis, revierName: string | null): string {
  const revier = revierName ?? 'das Revier'
  switch (ergebnis) {
    case 'ok':
      return `Angenommen — ${revier} ist jetzt freigeschaltet.`
    case 'bereits_deiner':
      return `Dieser Schein gehört dir bereits (${revier}).`
    case 'schon_eingeloest':
      return 'Dieser Code wurde bereits von jemand anderem eingelöst.'
    case 'gesperrt':
      return 'Dieser Schein ist pausiert oder entzogen. Frag den Revierinhaber.'
    case 'abgelaufen':
      return 'Dieser Schein ist abgelaufen.'
    case 'unbekannt':
      return 'Diesen Code gibt es nicht. Groß- und Kleinschreibung zählt.'
    case 'nicht_angemeldet':
      return 'Dafür musst du angemeldet sein.'
    case 'fehler':
      return 'Das hat nicht geklappt. Prüf die Verbindung und versuch es erneut.'
  }
}
