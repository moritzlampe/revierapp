/**
 * Statistik — die reine Rechnung hinter dem zweiten Reiter der Dokumentation
 * (A-C10).
 *
 * **Importfrei wie alle Hilfsdateien der Zentrale**, damit
 * `node --experimental-strip-types` sie ohne Alias-Auflösung ausführen kann
 * (Begründung ausführlich in `../jagden/jagden.ts`).
 *
 * ## Die eine Regel, an der diese Datei scheitern kann
 *
 * `historische_strecken` trägt vier `quelle`-Werte, und sie sind **vier
 * Projektionen DESSELBEN Bestands, keine addierbaren Töpfe** — quer summiert
 * ergibt die Tabelle 11136 statt 4646. Der Filter steckt je Quelle in einer
 * eigenen View (110); diese Datei rechnet deshalb **je Quelle eine eigene
 * Funktion** und stellt nirgends eine Summe über zwei her.
 *
 * Das ist keine Vorsicht, sondern der Bauplan: `jagden_soeder` ⊂
 * `rangliste_soeder`, die Söder-Sauen aus `journal_msl` ⊇ die derselben
 * Person in der Rangliste, und `familie_jahr` zählt fremde Reviere mit. Wer
 * hier eine Funktion schreibt, die zwei Listen entgegennimmt und eine Zahl
 * zurückgibt, hat den Fehler schon gebaut.
 *
 * ## Rangliste: PAPIERNAME. Familienblätter: ADRESSBUCHNAME
 *
 * **Geändert am 04.09.2026** (Moritz: „der normale name: Moritz Lampe; Donata
 * Lampe"). Vorher stand hier immer der Papiername, und die Begründung dafür
 * war richtig — sie ist unten erhalten, weil sie die Hälfte der heutigen Regel
 * trägt.
 *
 * **Warum überhaupt geändert:** die vier Familienblätter tragen als Papiernamen
 * nackte Kürzel — `JHL` (1368 Stück), `MSL` (460), `NNL` (40), `DL` (7). Dort
 * ist das Adressbuch eindeutig besser.
 *
 * **Warum die RANGLISTE trotzdem beim Papier bleibt:** eine Umstellung änderte
 * dort **58 von 213** Beschriftungen und führte dabei Fehler ein —
 * `Dr. Ralf Paeschke` würde zu `Ralf Dr. Paeschke`, `Heinrich Clemens` zu
 * `Clemens Heinrich`, und `Carli sen. Graf v. Hardenberg` verlöre sein „sen.".
 * Genau EINE Person hat dort zwei Papiernamen (ein Paar-Kontakt); das
 * Kürzel-Problem gibt es in der Rangliste also gar nicht.
 *
 * ⚠ **Die erste Fassung stellte BEIDE Ansichten um**, weil die Messung über
 * alle vier Quellen aggregiert war und deshalb „fünf Personen mit zwei
 * Papiernamen" ergab. Je Ansicht gezählt sind es eine und keine. **Eine
 * Aggregation über die falsche Achse liest sich wie eine Messung.**
 *
 * **Warum nicht durchgehend:** ⚠ **NEUN Personen teilen sich VIER
 * Adressbuchnamen** — `Theo Ludewig` dreimal, `Albrecht v. Alvensleben`,
 * `Ludolf v. Veltheim` und `Philipp Graf v. Hardenberg` je zweimal, weil
 * dieselbe Familie über Generationen jagt. Aus `kontakte.vorname` und
 * `.nachname` gebaut stünden dort gleichnamige Zeilen untereinander, und
 * niemand könnte sagen, warum. Deshalb gilt die Eindeutigkeitsschranke auch
 * dort, wo das Adressbuch gewinnt.
 *
 * **Das Papier unterscheidet sie sehr wohl** — durch einen Ortszusatz („…,
 * Club" gegen „…, Lev."), eine Generationenangabe („Albrecht jun./Alfons …")
 * oder eine Amtszeit („Jagdherr seit 1993"). Über alle 214 Papiernamen zeigt
 * **keiner** auf zwei Kontakte. Der Papiername ist also der eindeutige, der
 * Adressbuchname der lesbarere. Die Regel nimmt von jedem, was er kann:
 * **Papier in der Rangliste; im Familienblatt Adressbuch, wo eindeutig, sonst
 * Papier.**
 *
 * Der Papiername bleibt zudem der gegen das Blatt prüfbare — dieselbe
 * Begründung, die 110 für `art_text` gibt („wortgetreu und absichtlich nicht
 * normalisiert"). In der Datenbank wird nichts umgeschrieben; das hier ist
 * eine Beschriftung, keine Korrektur.
 *
 * ⚠ Die frühere Fassung dieses Absatzes sprach von **fünf** mehrfach
 * vorkommenden Adressbuchnamen. Nachgemessen am 04.09.2026 sind es **vier**
 * (neun Personen). Die Aussage stimmte, die Zahl nicht.
 *
 * ## Warum der Gruppierungsschlüssel trotzdem der Kontakt ist
 *
 * Umgekehrter Fall, ebenfalls gemessen: **ein Kontakt trägt zwei
 * Papiernamen** (eine Person, die unter Mädchen- und Ehenamen im Blatt steht).
 * Nach dem Papiernamen gruppiert bekäme sie zwei Zeilen.
 *
 * Und die **sechs Kollektivzeilen** des Papiers (Hunde 54, „verschiedene
 * Schützen (vor 1968)" 14, Hundeführer 5, „sonstige Engländer (1945-48)" 4,
 * Fallwild 3, Treiber 1) haben gar keine `kontakt_id` — nach ihr gruppiert
 * fielen alle sechs in einen Topf.
 *
 * Der Schlüssel ist deshalb `kontakt_id`, **und ersatzweise der Papiername**.
 * Jede Hälfte allein erzeugt einen anderen stillen Fehler. Dieselbe Falle, die
 * AGENTS.md für den IMPORT beschreibt („ein Token-Vergleich hätte dem Vater
 * die Strecke des Großvaters zugeschrieben") — sie gilt für die ANZEIGE
 * genauso, und dort hat sie bisher niemand benannt.
 *
 * ## Warum eine Lücke keine Null ist
 *
 * `anzahl > 0` ist CHECK in 110. Ein Jahr ohne Zeile heisst damit **„keine
 * Strecke verzeichnet"**, nicht „null Stück erlegt" — es kann ebenso gut
 * heissen, dass die Person in dem Jahr nicht dabei war. Eine Kurve, die die
 * Lücke auf die Nulllinie zöge, behauptete ein erfolgloses Jahr; eine, die
 * geradewegs darüber hinwegzeichnet, behauptet Zwischenwerte. Deshalb zerfällt
 * die Reihe in **Segmente** (s. `segmente()`), und deshalb tragen die
 * Tabellenzellen `number | null` statt `number` — dieselbe Entscheidung wie in
 * `strecke.ts`.
 */

/**
 * Eine Zeile der Chronik, so wie PostgREST sie aus einer der vier Views
 * liefert. Nur die Spalten, die diese Datei rechnet.
 *
 * `erleger_name` steht hier zusätzlich zum Typ in `../gaeste/kontakte.ts`:
 * jener kennt ihn nicht, weil der Kontakt-Inspektor immer schon einen Kontakt
 * in der Hand hat. Die Rangliste hat ihn nicht — sie ist der Ort, an dem die
 * sechs kontaktlosen Kollektivzeilen auftauchen.
 */
export type Chronikzeile = {
  kontakt_id: string | null
  erleger_name: string | null
  art_text: string | null
  jagdjahr: number | null
  anzahl: number
  /**
   * Der Kontakt hinter `kontakt_id`, von PostgREST mitgeliefert
   * (`select=…,kontakte(vorname,nachname)`) — **die Beziehung ist an der VIEW
   * bekannt, nicht nur an der Tabelle**, nachgemessen am 04.09.2026: ein Embed
   * auf eine Tabelle ohne Fremdschlüssel antwortet `PGRST200`, dieser hier
   * kommt bis zur Rechteprüfung durch.
   *
   * `null`, wo keine `kontakt_id` steht (9 rohe Zeilen, 6 Gruppen — beide
   * Zahlen stimmen, sie zählen Verschiedenes) — und
   * `null` auch, wo der Kontakt hinter RLS liegt — DAS ist der erreichbare
   * Fall. Ein Kontakt mit leerem Namen ist es nicht: der CHECK
   * `kontakt_braucht_namen` (085) verbietet ihn. `adressbuchname()` fängt
   * trotzdem beides, weil ein Riegel, der auf einem CHECK anderswo beruht,
   * mit ihm fällt.
   */
  kontakte?:
    | { vorname: string | null; nachname: string | null }
    | { vorname: string | null; nachname: string | null }[]
    | null
}

/** Eine Art mit ihrer Summe. */
export type Art = { art: string; anzahl: number }

/**
 * Ein Registereintrag samt seiner **Gegenachse** — die Ortsangaben zu einer
 * Art, die Arten zu einer Ortsangabe.
 *
 * Erweitert `Art`, statt es zu ersetzen: die Register der Blätter und der
 * Rangliste haben keine Gegenachse und sollen keine bekommen. `Register`
 * nimmt deshalb weiterhin `Art[]` und klappt nur auf, wo `gegen` da ist.
 *
 * **`gegen` summiert immer auf `anzahl`.** Das ist die einzige Beziehung, die
 * zwischen Kopfzeile und Aufschlüsselung gilt, und der Selbsttest prüft sie
 * für beide Richtungen. Ein Prozentwert steht im Aufklapper deshalb NICHT:
 * sein Nenner wäre erklärungsbedürftig (Anteil am Journal oder an der Art?),
 * und zwei Bezugsgrössen nebeneinander sind genau der Fehler, gegen den diese
 * Seite gebaut ist.
 */
export type Aufschluss = Art & { gegen: Art[] }

/**
 * Addiert eine Menge auf die Art in der Liste — oder legt sie an.
 *
 * Stand viermal als „finden, sonst anhängen" in dieser Datei (Ponytail
 * 27.08.2026). `kontakte.ts` hat mit `summiereArten()` dieselbe Form schon
 * einmal, dort privat und über eine `Map` — hier bleibt es eine Liste, weil
 * die Reihenfolge am Ende ohnehin sortiert wird und die Listen kurz sind
 * (höchstens 25 Arten).
 */
function addiere(liste: Art[], art: string, anzahl: number): void {
  const vorher = liste.find((a) => a.art === art)
  if (vorher) vorher.anzahl += anzahl
  else liste.push({ art, anzahl })
}

/** `addiere()` eine Ebene tiefer: in die Liste zu einem Schlüssel, die es
 *  noch nicht geben muss. */
function addiereIn(
  map: Map<string, Art[]>,
  schluessel: string,
  art: string,
  anzahl: number,
): void {
  const liste = map.get(schluessel)
  if (liste) addiere(liste, art, anzahl)
  else map.set(schluessel, [{ art, anzahl }])
}

/** Wie eine Zeile ohne Artangabe in den Registern und Spalten heisst. */
export const OHNE_ART = 'Ohne Artangabe'

/** Wie eine Zeile ohne Ortsangabe im Ort-Register heisst. */
export const OHNE_ORT = 'Ohne Ortsangabe'

/**
 * Die Art einer Zeile — **immer eine, nie keine.**
 *
 * Der CHECK aus 110 verlangt für die Rangliste nur `art_text IS NOT NULL`; ein
 * leerer String erfüllt ihn. Eine solche Zeile zählte in `gesamt`, aber in
 * keine Spalte — **die Spaltensummen im Tabellenfuss ergäben dann still nicht
 * mehr die Gesamtsumme** (Schlusslesung 27.08.2026, offener Punkt). Das ist
 * dieselbe Leerstring-Lücke, die bei `erleger_name` gefunden und behoben
 * wurde, an der dritten Spalte, an der sie auch sitzt — und genau die Klasse
 * statt der Instanz.
 *
 * Gibt `null` nur bei `art_text = null`. Das ist die Quelle `jagden_soeder`,
 * die diese Datei gar nicht liest; dort ist die Spalte per CHECK leer, und
 * eine solche Zeile gehört in keine Artenrechnung.
 */
function artVon(art_text: string | null): string | null {
  if (art_text === null) return null
  return art_text.trim() || OHNE_ART
}


// --- Rangliste (`rangliste_soeder`) ----------------------------------------

export type Rangzeile = {
  /** `kontakt_id`, ersatzweise `name:<Papiername>` — s. Kopf. */
  schluessel: string
  /**
   * **In der Rangliste immer der Name des PAPIERS** — `rangliste()` ruft
   * `anzeigenamen(…, 'papier')`. Der Adressbuchname gilt nur in den
   * Familienblättern (`Blatt.anzeigename`); die Begründung steht bei
   * `anzeigenamen()`.
   *
   * Das Feld hiess bis zum 04.09.2026 `papiername`. Umbenannt, weil das
   * Schwesterfeld in `Blatt` dieselbe Rolle mit anderer Herkunft füllt — ein
   * Name, der die Herkunft behauptet, wäre an einer der beiden Stellen falsch.
   */
  anzeigename: string
  kontaktId: string | null
  arten: Art[]
  gesamt: number
}

/**
 * Wer eine Zeile ist — Gruppierungsschlüssel und angezeigter Name in einem.
 *
 * **Das stand zweimal da, in `rangliste()` und in `blaetter()`, und die beiden
 * Fassungen waren NICHT gleich stark** (Fremdprüfung 27.08.2026, A10): der
 * deterministische Namensvorzug war nur in die erste eingebaut worden, die
 * zweite übernahm weiter den zuerst gelieferten Namen. Damit hing dort die
 * sichtbare Identität eines Blattes an der Reihenfolge, in der PostgREST
 * liefert.
 *
 * **Es ist dieselbe Bauform, gegen die dieses Repo an mehreren Stellen
 * schreibt: wer einen Befund wörtlich behebt, schliesst die genannte Lücke,
 * nicht ihre Klasse.** Der Fix bestand ursprünglich aus vier Zeilen in einer
 * von zwei Funktionen. Jetzt gibt es die Regel einmal.
 */
type Identitaet = { schluessel: string; papiername: string; adressbuch: string }

/**
 * Der Name aus dem Adressbuch, oder `''` wenn keiner da ist.
 *
 * Beide Teile werden einzeln getrimmt, damit ein Eintrag mit leerem Vornamen
 * nicht mit einem führenden Leerzeichen anfängt.
 */
function adressbuchname(z: Chronikzeile): string {
  // **Objekt ODER Array**, und das ist kein Schnörkel: bei einer
  // Many-to-One-Beziehung liefert PostgREST ein Objekt, bei einer, die es
  // anders auflöst, ein einelementiges Array. Der Rückfallweg ist STILL — bei
  // falschem Shape sähe die Seite exakt aus wie vorher (Kürzel), und niemand
  // würde etwas merken (Schlusslesung 04.09.2026, „nicht entscheidbar" Nr. 1:
  // ohne JWT ist der Shape nicht messbar). Beide Formen zu nehmen kostet eine
  // Zeile und macht die Frage gegenstandslos.
  const k = Array.isArray(z.kontakte) ? z.kontakte[0] : z.kontakte
  if (!k) return ''
  // Die Reihenfolge `map(trim)` VOR `filter(Boolean)` ist Pflicht: umgekehrt
  // überlebt ein Feld aus lauter Leerraum den Filter und erzeugt ein
  // führendes Leerzeichen (Schlusslesung 04.09.2026, F7 — die Sabotage dazu
  // lief zunächst grün).
  return [k.vorname ?? '', k.nachname ?? ''].map((t) => t.trim()).filter(Boolean).join(' ')
}

/**
 * Je Schlüssel der Name, der auf dem Blatt steht.
 *
 * **Die beiden Ansichten wählen verschieden, und das ist gemessen entschieden**
 * (Moritz, 04.09.2026):
 *
 * - **`'adressbuch'` — die Familienblätter.** Dort stehen VIER Personen, und
 *   ihre Papiernamen sind nackte Kürzel: `JHL` (1368 Stück), `MSL` (460),
 *   `NNL` (40), `DL` (7). Der Adressbuchname ist dort eindeutig besser, und
 *   er ist es auch buchstäblich — keine zwei der vier teilen sich einen.
 * - **`'papier'` — die Rangliste.** Dort stehen 213 historische Personen, und
 *   das Papier ist die präzisere Quelle. Eine Umstellung änderte **58 von 213**
 *   Beschriftungen und führte dabei Fehler ein: `Dr. Ralf Paeschke` würde zu
 *   `Ralf Dr. Paeschke`, `Heinrich Clemens` zu `Clemens Heinrich`, und
 *   `Carli sen. Graf v. Hardenberg` verlöre sein „sen.". Genau EINE Person
 *   hat dort zwei Papiernamen (ein Paar-Kontakt), das Kürzel-Problem gibt es
 *   also nicht.
 *
 * ⚠ **Die erste Fassung dieser Änderung stellte BEIDE um**, weil die Messung
 * über alle vier Quellen aggregiert war und deshalb „fünf Personen mit zwei
 * Papiernamen" ergab. Je Ansicht gezählt sind es eine (Rangliste) und keine
 * (Familienblätter) — die Kürzel sitzen woanders, nämlich im Papiernamen
 * selbst. **Eine Aggregation über die falsche Achse liest sich wie eine
 * Messung.**
 *
 * **Die Eindeutigkeitsschranke gilt in beiden Fällen** (Fremdprüfung
 * 04.09.2026, Punkt 9): NEUN Personen teilen sich VIER Adressbuchnamen —
 * `Theo Ludewig` dreimal, `Albrecht v. Alvensleben`, `Ludolf v. Veltheim` und
 * `Philipp Graf v. Hardenberg` je zweimal. Nur das Papier trennt sie („sen." /
 * „jun." / „Link" / „Destedt" / „, Club" / „, Lev."). Über alle 214
 * Papiernamen zeigt **keiner** auf zwei Kontakte. Heute greift die Schranke in
 * den Familienblättern nicht — sie steht für den Tag, an dem sie wachsen.
 *
 * Die Rechnung ist von alldem unberührt: gruppiert wird über `schluessel`, nie
 * über einen Namen. Hier geht es allein um die Beschriftung.
 *
 * **Die Funktion muss die GANZE Menge sehen** — Eindeutigkeit ist keine
 * Eigenschaft einer Zeile. Deshalb steht sie hier und nicht in `identitaet()`,
 * und deshalb rufen `rangliste()` und `blaetter()` dieselbe: EINE Regel mit
 * einem Parameter, nicht zwei Fassungen (Fremdprüfung 27.08.2026, A10).
 */
export function anzeigenamen(
  zeilen: readonly Chronikzeile[],
  regel: 'papier' | 'adressbuch',
): Map<string, string> {
  const papier = new Map<string, string>()
  const adress = new Map<string, string>()

  for (const z of zeilen) {
    const { schluessel, papiername, adressbuch } = identitaet(z)
    papier.set(schluessel, besserName(papier.get(schluessel) ?? '', papiername))
    if (adressbuch) adress.set(schluessel, adressbuch)
  }

  // **Gezählt wird über die ETIKETTEN, die am Ende dastehen — nicht über die
  // Adressbuchnamen allein** (Schlusslesung 04.09.2026, F5). Der Unterschied
  // ist real: ein Adressbuchname kann mit dem PAPIERnamen einer anderen Person
  // zusammenfallen, etwa wenn eine Zeile ohne `kontakt_id` importiert wurde
  // oder ein Kontakt hinter RLS liegt. Über die Eingabe gezählt wäre er
  // „eindeutig" und stünde trotzdem zweimal auf dem Blatt. In 20 000
  // Zufallseingaben trat der Fall 2 681-mal auf; in der Produktion heute
  // null-mal — `familie_jahr` hat keine kontaktlose Zeile.
  const kandidat = new Map<string, string>()
  for (const [schluessel, papiername] of papier) {
    const a = regel === 'adressbuch' ? adress.get(schluessel) : undefined
    kandidat.set(schluessel, a || papiername)
  }

  const wieOft = new Map<string, number>()
  for (const etikett of kandidat.values()) wieOft.set(etikett, (wieOft.get(etikett) ?? 0) + 1)

  const aus = new Map<string, string>()
  for (const [schluessel, papiername] of papier) {
    const e = kandidat.get(schluessel)!
    aus.set(schluessel, wieOft.get(e) === 1 ? e : papiername)
  }
  return aus
}

function identitaet(z: Chronikzeile): Identitaet {
  const papiername = (z.erleger_name ?? '').trim()
  return {
    // **Kein Fallweg, der die Zeile verwirft.** Eine Zeile ohne Kontakt UND
    // ohne Namen fiel vorher heraus, und ihre Stücke fehlten damit in der
    // Gesamtstrecke (Fremdprüfung 27.08.2026, A1) — eine Rangliste, deren
    // Summe nicht die Revierstrecke ist, ist genau das, wogegen die
    // Kollektivzeilen mitgezählt werden. Sie bekommt einen eigenen Topf und
    // eine sichtbare Beschriftung.
    schluessel: z.kontakt_id ?? `name:${papiername}`,
    papiername,
    adressbuch: adressbuchname(z),
  }
}

/**
 * Der bessere von zwei Anzeigenamen desselben Schlüssels.
 *
 * **Sie ist NICHT nur ein Rückfallweg** (die frühere Fassung dieses Absatzes
 * behauptete das und beschrieb einen Zwischenstand — Schlusslesung 04.09.2026,
 * F3). Wo sie greift:
 * - **In der Rangliste ist sie DIE Regel** — 213 von 217 Zeilen der Seite.
 *   `anzeigenamen(…, 'papier')` sammelt die Papiernamen genau hierüber, und
 *   sie entscheidet den einen Kontakt mit zwei Papiernamen (das Möller-Paar).
 * - **In den Familienblättern**, wenn kein Adressbuchname da ist (Kontakt
 *   hinter RLS, `kontakte: null`) **oder wenn die Eindeutigkeitsschranke
 *   zuschlägt** — dann steht das Papier, und dieses hier wählt es aus.
 *
 * `identitaet()` liefert übrigens keinen fertigen Anzeigenamen mehr, sondern
 * `papiername` und `adressbuch` getrennt; zusammengeführt wird in
 * `anzeigenamen()`.
 *
 * Alphabetisch der erste — irgendeine Regel MUSS es geben, sonst hängt die
 * Anzeige an der Lieferreihenfolge. **Ein leerer Name verliert dabei immer**,
 * auch gegen einen alphabetisch späteren: `''` sortiert vor jedem
 * nichtleeren String, ein blosser `localeCompare` hätte den leeren
 * Initialwert also nie ersetzt (Fremdprüfung 27.08.2026, A2).
 */
function besserName(alt: string, neu: string): string {
  if (!neu) return alt
  if (!alt) return neu
  return neu.localeCompare(alt, 'de') < 0 ? neu : alt
}

/**
 * Wie eine Zeile ohne jede Namensangabe in der Liste heisst.
 *
 * Sie kann nach dem CHECK `historische_strecken_rangliste_vollstaendig` heute
 * nicht entstehen — dort ist `erleger_name IS NOT NULL` verlangt. Ein leerer
 * String erfüllt das aber, und der CHECK deckt ohnehin nur eine der vier
 * Quellen. Die Beschriftung steht hier, damit eine solche Zeile sichtbar
 * mitzählt statt lautlos zu verschwinden.
 */
export const OHNE_NAMEN = 'Ohne Namensangabe'

/**
 * Absteigend nach Gesamtstrecke, bei Gleichstand alphabetisch nach dem
 * Papiernamen. Stand zweimal wörtlich da (Ponytail 27.08.2026).
 *
 * **Das dritte Kriterium ist am 28.08.2026 nachgetragen worden, und der Grund
 * ist die Klasse, nicht die Stelle** (Schlusslesung): die Lücke wurde an
 * `nachMenge` gefunden, gilt hier aber wortgleich — `localeCompare(…, 'de')`
 * meldet zwei verschiedene Unicode-Schreibweisen desselben Namens als GLEICH,
 * und dann entschiede die Lieferreihenfolge von PostgREST, welche Zeile oben
 * steht. **Wer einen Befund wörtlich behebt, schliesst die genannte Lücke,
 * nicht ihre Klasse** — an dieser Seite ist genau das am 27.08.2026 siebenmal
 * passiert.
 */
function nachStrecke(
  a: { gesamt: number; anzeigename: string; schluessel: string },
  b: { gesamt: number; anzeigename: string; schluessel: string },
): number {
  return (
    b.gesamt - a.gesamt ||
    a.anzeigename.localeCompare(b.anzeigename, 'de') ||
    (a.anzeigename < b.anzeigename ? -1 : a.anzeigename > b.anzeigename ? 1 : 0) ||
    // **Vierter Schritt, seit 04.09.2026** (Fremdprüfung, Punkt 4): zwei
    // PERSONEN können jetzt denselben Anzeigenamen tragen — nämlich dann,
    // wenn auch ihre Papiernamen gleich wären. Ohne diesen Schritt wäre die
    // Ordnung bei gleicher Strecke nicht mehr total, und die Tabelle kippte
    // zwischen zwei Lesungen ohne Änderung. `schluessel` ist eindeutig, also
    // endet die Kette hier immer.
    (a.schluessel < b.schluessel ? -1 : a.schluessel > b.schluessel ? 1 : 0)
  )
}

export type Rangliste = {
  zeilen: Rangzeile[]
  /** Summe über alle Zeilen — die Söder-Gesamtstrecke seit 1946. */
  gesamt: number
  /** Wie viele Zeilen keinen Kontakt haben (die Kollektivzeilen des Papiers). */
  ohneKontakt: number
  /**
   * Alle vorkommenden Arten **mit ihrer Gesamtsumme**, in Spaltenreihenfolge.
   *
   * Die Summe steht hier, weil sie beim Gruppieren ohnehin anfällt — der
   * Tabellenfuss hat sie sonst über alle Zeilen nachgerechnet und damit
   * dieselbe Zahl zweimal aus verschiedenen Wegen gebildet (Ponytail
   * 27.08.2026). Zwei Rechenwege für eine Zahl sind zwei Stellen, an denen sie
   * auseinanderlaufen kann.
   */
  spalten: Art[]
}

/**
 * Die Rangliste, absteigend nach Gesamtstrecke.
 *
 * **Die Kollektivzeilen laufen ausdrücklich MIT.** Der Kontakt-Inspektor lässt
 * sie fallen, und das ist dort richtig — sie haben keinen Menschen, dem man
 * sie zeigen könnte. Hier ist es umgekehrt: liesse man sie weg, summierte die
 * Liste 4565 statt 4646, und eine Rangliste, deren Summe nicht die
 * Revierstrecke ist, ist keine. „Hunde" mit 54 Stück steht damit zwischen
 * Menschen — das ist die Auskunft des Papiers, nicht ein Anzeigefehler, und
 * die Tabelle weist es aus.
 */
export function rangliste(zeilen: readonly Chronikzeile[]): Rangliste {
  const je = new Map<string, Rangzeile>()
  const artenGesehen = new Map<string, number>()
  // Die Rangliste bleibt beim Papier — s. `anzeigenamen()`.
  const namen = anzeigenamen(zeilen, 'papier')

  for (const z of zeilen) {
    const { schluessel } = identitaet(z)
    const zeile = je.get(schluessel) ?? {
      schluessel,
      anzeigename: namen.get(schluessel) ?? '',
      kontaktId: z.kontakt_id,
      arten: [],
      gesamt: 0,
    }
    const art = artVon(z.art_text)
    if (art) {
      addiere(zeile.arten, art, z.anzahl)
      artenGesehen.set(art, (artenGesehen.get(art) ?? 0) + z.anzahl)
    }
    zeile.gesamt += z.anzahl
    je.set(schluessel, zeile)
  }

  // Spaltenreihenfolge nach Gesamtmenge, damit die stärkste Art links steht.
  // Bei Gleichstand alphabetisch, sonst kippt die Tabelle zwischen zwei
  // Lesungen ohne Änderung — dieselbe Auflage wie das zweite Sortierkriterium
  // der View aus 117.
  const spalten = [...artenGesehen]
    .map(([art, anzahl]) => ({ art, anzahl }))
    .sort(nachMenge)

  const sortiert = [...je.values()].sort(nachStrecke)

  return {
    zeilen: sortiert,
    gesamt: sortiert.reduce((s, z) => s + z.gesamt, 0),
    ohneKontakt: sortiert.filter((z) => !z.kontaktId).length,
    spalten,
  }
}

/**
 * Wie viele Personen welche Größenordnung tragen.
 *
 * Steht über der Rangliste, weil 213 Zeilen ihre eigene Form nicht zeigen: acht
 * Namen tragen mehr als ein Drittel der Strecke, 32 stehen mit genau einem
 * Stück da. Ohne diese Zeile liest man die Liste von oben und hält die ersten
 * zehn für „die Jäger dieses Reviers".
 */
export type Klasse = { label: string; personen: number; stueck: number }

export function verteilung(liste: Rangliste): Klasse[] {
  const stufen: { label: string; ab: number }[] = [
    { label: 'ab 100', ab: 100 },
    { label: '50–99', ab: 50 },
    { label: '20–49', ab: 20 },
    { label: '10–19', ab: 10 },
    { label: '2–9', ab: 2 },
    { label: 'genau 1', ab: 1 },
  ]
  return stufen.map((s, i) => {
    const obergrenze = i === 0 ? Infinity : stufen[i - 1].ab
    const treffer = liste.zeilen.filter((z) => z.gesamt >= s.ab && z.gesamt < obergrenze)
    return {
      label: s.label,
      personen: treffer.length,
      stueck: treffer.reduce((sum, z) => sum + z.gesamt, 0),
    }
  })
}

// --- Familie über die Jahre (`familie_jahr`) -------------------------------

export type Jahreswert = { jahr: number; summe: number; arten: Art[] }

export type Blatt = {
  schluessel: string
  anzeigename: string
  kontaktId: string | null
  /** Chronologisch aufsteigend, nur belegte Jahre. */
  jahre: Jahreswert[]
  gesamt: number
  vonJahr: number
  bisJahr: number
  /** Das stärkste Jahr. Bei Gleichstand das frühere. */
  starkJahr: number
  starkSumme: number
  /** Alle Arten dieser Person, absteigend. */
  arten: Art[]
}

/**
 * Ein Blatt je Person, absteigend nach Gesamtstrecke.
 *
 * **Getrennte Blätter statt vier Linien in einem Diagramm**, und das ist an
 * den Daten entschieden, nicht am Geschmack: die vier Reihen umfassen 52, 21,
 * 8 und 5 belegte Jahre und 1368, 460, 40 und 7 Stück. Auf einer gemeinsamen
 * Achse wären drei von vieren eine Linie am Boden. Dazu käme der Zwang zu
 * vier unterscheidbaren Farben — das Portal hat genau eine Akzentfarbe, und
 * `--z-mangel` wie `--z-gesperrt` tragen bereits Bedeutung (Wartungszustand,
 * Nachsuche). Vier getrennte Blätter brauchen keine.
 */
export function blaetter(zeilen: readonly Chronikzeile[]): Blatt[] {
  const je = new Map<string, { blatt: Blatt; jahre: Map<number, Jahreswert> }>()

  // Die Familienblätter zeigen den Adressbuchnamen — dieselbe Funktion wie
  // die Rangliste, anderer Parameter (s. `anzeigenamen()`).
  const namen = anzeigenamen(zeilen, 'adressbuch')

  for (const z of zeilen) {
    // `jagdjahr` ist in `familie_jahr` per CHECK NOT NULL. Die Bedingung ist
    // der Typ-Riegel, nicht eine vermutete Lücke.
    if (z.jagdjahr == null) continue
    const { schluessel } = identitaet(z)

    const eintrag =
      je.get(schluessel) ??
      {
        blatt: {
          schluessel,
          anzeigename: namen.get(schluessel) ?? '',
          kontaktId: z.kontakt_id,
          jahre: [],
          gesamt: 0,
          vonJahr: z.jagdjahr,
          bisJahr: z.jagdjahr,
          starkJahr: z.jagdjahr,
          starkSumme: 0,
          arten: [],
        },
        jahre: new Map<number, Jahreswert>(),
      }
    const jahr = eintrag.jahre.get(z.jagdjahr) ?? { jahr: z.jagdjahr, summe: 0, arten: [] }
    jahr.summe += z.anzahl
    const art = artVon(z.art_text)
    if (art) addiere(jahr.arten, art, z.anzahl)
    eintrag.jahre.set(z.jagdjahr, jahr)
    eintrag.blatt.gesamt += z.anzahl
    je.set(schluessel, eintrag)
  }

  const raus: Blatt[] = []
  for (const { blatt, jahre } of je.values()) {
    blatt.jahre = [...jahre.values()].sort((a, b) => a.jahr - b.jahr)
    blatt.vonJahr = blatt.jahre[0].jahr
    blatt.bisJahr = blatt.jahre[blatt.jahre.length - 1].jahr

    // Bei Gleichstand das FRÜHERE Jahr: `jahre` ist aufsteigend sortiert, ein
    // striktes `>` behält damit den ersten Treffer. „Stärkstes Jahr" ist eine
    // Auskunft über den Anfang einer starken Zeit, nicht über ihr Ende.
    for (const j of blatt.jahre) {
      if (j.summe > blatt.starkSumme) {
        blatt.starkSumme = j.summe
        blatt.starkJahr = j.jahr
      }
      for (const a of j.arten) addiere(blatt.arten, a.art, a.anzahl)
      j.arten.sort(nachMenge)
    }
    blatt.arten.sort(nachMenge)
    raus.push(blatt)
  }

  return raus.sort(nachStrecke)
}

/**
 * Die belegten Jahre in **zusammenhängende Läufe** zerlegt.
 *
 * Ein Lauf ist eine Folge lückenlos aufeinanderfolgender Jagdjahre. Zwei
 * Läufe bedeuten: dazwischen fehlen Jahre, und über die darf keine Linie
 * gezogen werden — sie behauptete sonst Zwischenwerte für Jahre, über die die
 * Chronik nichts sagt. Gemessen am Bestand trifft das genau eine der vier
 * Personen (5 belegte Jahre zwischen 2007 und 2020, also neun Lücken).
 *
 * ⚠ **Vorbedingung: die Jahre müssen aufsteigend und eindeutig sein.** Die
 * Funktion stellt das NICHT selbst her, und sie merkt es auch nicht:
 * `[2021, 2020]` ergäbe zwei Läufe, obwohl die Jahre aufeinanderfolgen, ein
 * doppeltes Jahr trennte ebenfalls (Fremdprüfung 27.08.2026, A4).
 * `blaetter()` und `journal()` liefern beides — sie bauen ihre Jahre über eine
 * `Map` und sortieren danach. **Defensives Sortieren steht hier bewusst
 * nicht:** es machte aus einer verletzten Vorbedingung ein stilles
 * Zurechtbiegen, und ein Aufrufer, der unsortiert liefert, hat ein Problem,
 * das er merken soll.
 */
export function segmente(jahre: readonly Jahreswert[]): Jahreswert[][] {
  const raus: Jahreswert[][] = []
  let lauf: Jahreswert[] = []
  for (const j of jahre) {
    const vorheriges = lauf[lauf.length - 1]
    if (vorheriges && j.jahr !== vorheriges.jahr + 1) {
      raus.push(lauf)
      lauf = []
    }
    lauf.push(j)
  }
  if (lauf.length > 0) raus.push(lauf)
  return raus
}

/**
 * Was `blattkurve()` braucht — eine Reihe von Jahreswerten mit ihren Grenzen.
 * Sowohl ein Personen-`Blatt` als auch das `Journal` erfüllen sie.
 */
export type Reihe = {
  jahre: readonly Jahreswert[]
  vonJahr: number
  bisJahr: number
  starkSumme: number
}

export type Kurve = {
  /** Ein `points`-Attribut je zusammenhängendem Lauf ab zwei Jahren. */
  zuege: string[]
  /**
   * Die Jahre, die **allein** zwischen Lücken stehen, als `x,y`.
   *
   * Sie bekommen einen Punkt statt eines Strichs — ein Lauf aus einem Jahr hat
   * kein Segment, und eine `<polyline>` daraus zeichnet lautlos nichts.
   *
   * „Allein" heisst **von jedem Nachbarjahr getrennt**, nicht zwingend
   * beidseitig umschlossen: der belegte echte Fall steht am ANFANG der Reihe
   * und hat nur nach rechts eine Lücke (Schlusslesung 27.08.2026).
   * **Ohne diese Liste verschwände so ein Jahr ganz**, während die Achse
   * darunter es weiterhin als Anfang der Reihe nennt: gefunden an den echten
   * Daten (das Journal beginnt 1997, danach folgen vier leere Jahre), nicht an
   * einer Fixture — die hatte den Fall, aber keine Zusicherung darauf.
   */
  einzelne: string[]
}

/**
 * Die Punkte für ein Personen-Blatt, **immer von null skaliert**.
 *
 * Anders als `kurve()` in `strecke.ts`, die auf `hoch` normiert: dort ist die
 * Frage „wie verlief es", hier steht die Kurve neben drei anderen. Eine Reihe,
 * die ihr eigenes Maximum an die Oberkante legt, sähe neben einer zehnmal
 * grösseren gleich stark aus. Die Y-Skala steht deshalb als Text am Blatt.
 *
 * **Gibt `null` in zwei Fällen**, und der zweite ist der wichtigere:
 *
 * 1. Kein Lauf erreicht zwei Jahre — dann gibt es kein Liniensegment, und eine
 *    `<polyline>` mit einem Punkt zeichnet lautlos nichts (derselbe Fall wie
 *    in `strecke.ts`, Fremdprüfung 07.08.2026 P5).
 * 2. **Höchstens die Hälfte der Kalenderjahre ist belegt.** Dann ist die Reihe
 *    keine Reihe, sondern eine Sammlung von Ereignissen — und eine Kurve
 *    behauptet einen Verlauf, über den die Chronik nichts weiss.
 *
 *    ⚠ **Der Gleichstand wird mitverworfen, und der Text sagte das vorher
 *    nicht** („es fehlen mehr Jahre, als belegt sind" — Fremdprüfung
 *    27.08.2026, A5). Der Code ist die strengere Fassung und bleibt: bei genau
 *    der Hälfte schweigt die Chronik über jedes zweite Jahr, und das ist keine
 *    Reihe mehr. Korrigiert wurde der Satz, nicht die Grenze — aber eine
 *    Begründung, die eine andere Grenze beschreibt als der Code, ist beim
 *    nächsten Leser keine Begründung.
 *
 * **Kriterium 2 ist nachgereicht, weil Kriterium 1 den Fall NICHT fing, für
 * den es gedacht war.** Die dünnste der vier Reihen (7 Stück in 14
 * Kalenderjahren) zerfällt in die Läufe 2007–2008, 2013–2014 und 2020 — zwei
 * davon haben zwei Punkte, `laeufe.length` ist also 2 und nicht 0. Die Kurve
 * wäre entstanden: zwei Striche von je zwei Punkten und ein Jahr, das
 * überhaupt nicht erscheint. Gefunden beim Schreiben der Fixtures, an den
 * echten Zahlen — die Annahme „so wenige Jahre ergeben ohnehin kein Segment"
 * war plausibel und falsch.
 *
 * Der Aufrufer zeigt in beiden Fällen das Register statt des Diagramms.
 *
 * Nimmt bewusst `Reihe` statt `Blatt`: das Journal ist keine Person, hat aber
 * dieselbe Achse und dieselben zwei Fallen. Eine zweite Fassung dieser Regel
 * wäre eine zweite Stelle, an der sie veraltet.
 */
export function blattkurve(
  blatt: Reihe,
  breite: number,
  hoehe: number,
): Kurve | null {
  const kalenderjahre = blatt.bisJahr - blatt.vonJahr + 1
  if (blatt.jahre.length * 2 <= kalenderjahre) return null

  const alle = segmente(blatt.jahre)
  const laeufe = alle.filter((l) => l.length >= 2)
  if (laeufe.length === 0) return null

  const spanne = blatt.bisJahr - blatt.vonJahr
  const hoch = blatt.starkSumme
  const x = (jahr: number) => (spanne === 0 ? 0 : ((jahr - blatt.vonJahr) / spanne) * breite)
  // `hoch` ist nie 0: `anzahl > 0` ist CHECK in 110, und ein Blatt ohne Jahre
  // entsteht gar nicht erst. Die Zusicherung stammt aus der Datenbank.
  const y = (summe: number) => hoehe - (summe / hoch) * hoehe
  const ort = (j: Jahreswert) => `${x(j.jahr).toFixed(2)},${y(j.summe).toFixed(2)}`

  // Kein `hoch` im Ergebnis: es wäre `starkSumme` unverändert durchgereicht,
  // und jeder Aufrufer hat die Reihe ohnehin in der Hand (Ponytail 27.08.2026).
  return {
    zuege: laeufe.map((lauf) => lauf.map(ort).join(' ')),
    einzelne: alle.filter((l) => l.length === 1).map((l) => ort(l[0])),
  }
}

// --- Das Journal (`journal_msl`) -------------------------------------------

/**
 * Eine Journalzeile. Anders als die drei anderen Projektionen trägt sie ein
 * **Datum statt eines Jagdjahrs** (`jagdjahr` ist dort per CHECK NULL) und
 * einen Ort, der meistens kein Revier dieser Datenbank ist — 52 der 53 Orte
 * liegen ausserhalb, `district_id` ist dann NULL und `ort_text` trägt die
 * Bezeichnung des Papiers.
 */
export type Journalzeile = {
  /** ISO-Datum, `date` in der Datenbank — also ohne Uhrzeit und ohne Zone. */
  erlegt_am: string | null
  ort_text: string | null
  art_text: string | null
  anzahl: number
}

export type Journal = {
  /** Ein Eintrag je belegtem Jagdjahr, chronologisch. */
  jahre: Jahreswert[]
  gesamt: number
  vonJahr: number
  bisJahr: number
  starkJahr: number
  starkSumme: number
  /** Arten absteigend nach Menge, je mit ihren Ortsangaben. */
  arten: Aufschluss[]
  /** Ortsangaben absteigend nach Menge, je mit ihren Arten —
   *  **einschliesslich** des Sammeltopfs für Zeilen ohne Ortsangabe. */
  orte: Aufschluss[]
  /**
   * Wie viele davon **benannte** Orte sind.
   *
   * `orte.length` ist es NICHT: der Sammeltopf `OHNE_ORT` steht dort mit
   * drin, und die Seite nennt die Zahl zweimal in Prosa („reicht über N
   * Orte"). Ein einziger Eintrag ohne Ortsangabe machte aus 53 Orten 54, und
   * „Ohne Ortsangabe" ist keiner (Delta-Durchgang 27.08.2026).
   *
   * **Der Fix, der den Topf einführte, hat genau diese Zahl übersehen** —
   * dritte Wiederholung derselben Klasse an diesem Diff: eine Änderung
   * behebt die Stelle, an der sie ansetzt, und lässt die Stelle daneben
   * offen, die von ihr abhängt.
   */
  orteBenannt: number
}

/**
 * Das Jagdjahr eines ISO-Datums: **1. April bis 31. März**, benannt nach dem
 * Anfangsjahr — dieselbe Konvention wie `src/lib/diary/season.ts` und wie das
 * `jagdjahr` der drei anderen Projektionen.
 *
 * **Gerechnet wird auf dem STRING, nicht auf einem `Date`.** Die Spalte ist
 * `date`, hat also weder Uhrzeit noch Zone; `new Date('2026-01-22')` machte
 * daraus UTC-Mitternacht und damit einen Wert, dessen Kalendertag von der
 * Zeitzone des Lesers abhängt. Hier hinge nur die Jahresgrenze daran — und
 * genau die ist die Frage.
 */
export function jagdjahrVon(iso: string): number | null {
  const treffer = /^(\d{4})-(\d{2})-/.exec(iso)
  if (!treffer) return null
  const jahr = Number(treffer[1])
  const monat = Number(treffer[2])
  return monat >= 4 ? jahr : jahr - 1
}

/**
 * Das Journal auf drei Achsen: Jahre, Arten, Orte.
 *
 * **Diese Zahlen sind mit KEINER anderen auf dieser Seite verrechenbar.** Die
 * Söder-Zeilen des Journals sind dieselben Stücke, die in der Rangliste unter
 * dem Namen desselben Menschen stehen; die übrigen 54 Orte gehören gar nicht
 * zu diesem Revier. Der Block trägt deshalb seine eigene Überschrift und seine
 * eigene Summe, und nirgends steht eine gemeinsame.
 */
export function journal(zeilen: readonly Journalzeile[]): Journal | null {
  const jeJahr = new Map<number, Jahreswert>()
  const jeArt = new Map<string, number>()
  const jeOrt = new Map<string, number>()
  // Die beiden Gegenachsen: zu jeder Art ihre Ortsangaben, zu jeder
  // Ortsangabe ihre Arten. Beide entstehen aus DENSELBEN Zeilen wie die
  // Register darüber — deshalb summiert jede Gegenachse auf ihre Kopfzahl,
  // und deshalb braucht es dafür keine zweite Abfrage.
  const orteJeArt = new Map<string, Art[]>()
  const artenJeOrt = new Map<string, Art[]>()
  let gesamt = 0

  for (const z of zeilen) {
    // `erlegt_am` ist in `journal_msl` per CHECK NOT NULL. Die Bedingung ist
    // der Typ-Riegel, nicht eine vermutete Lücke.
    if (!z.erlegt_am) continue
    const jahr = jagdjahrVon(z.erlegt_am)
    if (jahr === null) continue

    const eintrag = jeJahr.get(jahr) ?? { jahr, summe: 0, arten: [] }
    eintrag.summe += z.anzahl
    const art = artVon(z.art_text)
    if (art) {
      addiere(eintrag.arten, art, z.anzahl)
      jeArt.set(art, (jeArt.get(art) ?? 0) + z.anzahl)
    }
    jeJahr.set(jahr, eintrag)
    // Derselbe Leerstring-Fall wie bei der Art: ein Ort aus Leerraum ist
    // keiner, aber die Zeile zählt in `gesamt` und braucht deshalb einen Topf.
    const ort = (z.ort_text ?? '').trim() || OHNE_ORT
    jeOrt.set(ort, (jeOrt.get(ort) ?? 0) + z.anzahl)
    gesamt += z.anzahl

    // Die Gegenachsen. **`art` kann hier `null` sein, `ort` nie** — `artVon`
    // gibt `null` zurück, wenn `art_text` selbst `null` ist, und eine solche
    // Zeile gehört in keine Artenrechnung. In der Aufschlüsselung EINER
    // Ortsangabe muss sie trotzdem auftauchen, sonst summierte die Liste im
    // Aufklapper stiller als ihre eigene Kopfzeile — der Fall, gegen den die
    // ganze Seite gebaut ist. Sie bekommt deshalb denselben Sammeltopf, den
    // ein leerer Artentext ohnehin bekäme.
    if (art) addiereIn(orteJeArt, art, ort, z.anzahl)
    addiereIn(artenJeOrt, ort, art ?? OHNE_ART, z.anzahl)
  }

  if (jeJahr.size === 0) return null

  const jahre = [...jeJahr.values()].sort((a, b) => a.jahr - b.jahr)
  for (const j of jahre) j.arten.sort(nachMenge)

  let starkJahr = jahre[0].jahr
  let starkSumme = 0
  for (const j of jahre) {
    if (j.summe > starkSumme) {
      starkSumme = j.summe
      starkJahr = j.jahr
    }
  }

  return {
    jahre,
    gesamt,
    vonJahr: jahre[0].jahr,
    bisJahr: jahre[jahre.length - 1].jahr,
    starkJahr,
    starkSumme,
    arten: aufgeschluesselt(jeArt, orteJeArt),
    orte: aufgeschluesselt(jeOrt, artenJeOrt),
    orteBenannt: [...jeOrt.keys()].filter((o) => o !== OHNE_ORT).length,
  }
}

/**
 * Absteigend nach Menge, bei Gleichstand alphabetisch — sonst kippt eine
 * Liste zwischen zwei Lesungen ohne Änderung.
 *
 * **Das dritte Kriterium ist der eigentliche Riegel** (Fremdprüfung
 * 28.08.2026): `localeCompare(…, 'de')` gibt für VERSCHIEDENE, aber deutsch
 * kollationsgleiche Zeichenketten `0` zurück — zwei Unicode-Schreibweisen
 * desselben Umlauts etwa. Dann entschiede die Einfügereihenfolge, und die ist
 * die Reihenfolge, in der PostgREST die Zeilen liefert: nicht zugesichert.
 * Der binäre Vergleich am Ende macht die Ordnung total.
 *
 * Dieselbe Klasse wie das zweite Sortierkriterium in Migration 117 — dort
 * `id` neben `checked_at`, aus genau demselben Grund.
 */
function nachMenge(a: Art, b: Art): number {
  return (
    b.anzahl - a.anzahl ||
    a.art.localeCompare(b.art, 'de') ||
    (a.art < b.art ? -1 : a.art > b.art ? 1 : 0)
  )
}

/**
 * Kopfzahlen und Gegenachse zu einer Liste verbinden, beide Ebenen sortiert.
 *
 * **Die Gegenachse wird NICHT aus der Kopf-Map abgeleitet, sondern getrennt
 * gezählt** — beide entstehen in derselben Schleife aus derselben Zeile. Wer
 * sie hier nachrechnete, hätte eine zweite Wahrheit über dieselben Daten.
 */
function aufgeschluesselt(
  kopf: Map<string, number>,
  gegen: Map<string, Art[]>,
): Aufschluss[] {
  return [...kopf]
    .map(([art, anzahl]) => ({
      art,
      anzahl,
      gegen: (gegen.get(art) ?? []).sort(nachMenge),
    }))
    .sort(nachMenge)
}

/**
 * Der Anteil als ganze Prozentzahl — **aber nie als „0 %" neben einer
 * vorhandenen Menge.**
 *
 * Im Journal (1394 Stück auf 53 Orte) erreichen das die Orte mit sechs oder
 * weniger Stücken, also viele — und eine 0 neben einer sichtbaren Zahl liest
 * sich wie ein Rechenfehler (Schlusslesung 27.08.2026).
 *
 * **Steht hier und nicht in der Seite**, obwohl sie nur dort gebraucht wird:
 * in `page.tsx` wäre sie vom Selbsttest konstruktionsbedingt unerreichbar,
 * hier ist sie reine Rechnung und damit prüfbar (Delta-Durchgang 27.08.2026).
 */
export function anteil(teil: number, gesamt: number): string {
  if (gesamt === 0) return '—'
  const prozent = Math.round((teil / gesamt) * 100)
  return prozent === 0 ? '< 1 %' : `${prozent} %`
}

// --- Die Jahreswerte als Tabelle -------------------------------------------

export type Jahrestabelle = {
  /** Jedes Jahr der Spanne, auch die leeren — sonst fällt eine Lücke nicht auf. */
  zeilen: { jahr: number; zellen: (number | null)[] }[]
  /** Eine Summe je Spalte. */
  summen: number[]
}

/**
 * Mehrere Reihen nebeneinander, ein Jahr je Zeile.
 *
 * **Die Kurve ist die Anschauung, diese Tabelle die Auskunft** — dieselbe
 * Rollenteilung wie auf der Strecke-Seite nebenan („verbindlich ist die
 * Tabelle darunter"). Ohne sie stünde kein einziger Jahreswert als Zahl auf
 * der Seite: ablesbar wären nur Höchst- und Anfangswert aus der
 * Achsenbeschriftung, und für ein Vorlesegerät gar nichts.
 *
 * Sie leistet zugleich das, was getrennte Blätter NICHT können: den direkten
 * Vergleich zweier Personen in einem Jahr.
 *
 * **Leere Zellen tragen `null`, niemals 0.** `anzahl > 0` ist CHECK in 110 —
 * ein Jahr ohne Zeile heisst „keine Strecke verzeichnet", nicht „nichts
 * erlegt". Dieselbe Entscheidung wie bei den Terminen in `strecke.ts`, und
 * derselbe Grund: eine 0 machte aus einer Lücke ein erfolgloses Jahr.
 */
export function jahrestabelle(reihen: readonly Reihe[]): Jahrestabelle | null {
  if (reihen.length === 0) return null
  const von = Math.min(...reihen.map((r) => r.vonJahr))
  const bis = Math.max(...reihen.map((r) => r.bisJahr))

  const zeilen: Jahrestabelle['zeilen'] = []
  const summen = reihen.map(() => 0)

  for (let jahr = von; jahr <= bis; jahr++) {
    const zellen = reihen.map((r, i) => {
      const treffer = r.jahre.find((j) => j.jahr === jahr)
      if (!treffer) return null
      summen[i] += treffer.summe
      return treffer.summe
    })
    zeilen.push({ jahr, zellen })
  }

  return { zeilen, summen }
}
