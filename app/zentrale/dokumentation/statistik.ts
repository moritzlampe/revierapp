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
 * ## Angezeigt wird der PAPIERNAME, nicht der Name des Kontakts
 *
 * Das ist gemessen entschieden, nicht aus Bequemlichkeit: **fünf
 * Kontakt-Anzeigenamen kommen mehrfach vor**, weil dieselbe Familie über
 * Generationen jagt — einer davon zweimal mit zusammen 177 Stück, ein weiterer
 * dreimal. Aus `kontakte.vorname` und `.nachname` gebaut stünden dort zwei
 * gleichnamige Zeilen untereinander, und niemand könnte sagen, warum.
 *
 * **Das Papier unterscheidet sie sehr wohl** — durch einen Ortszusatz („…,
 * Club" gegen „…, Lev."), eine Generationenangabe („Albrecht jun./Alfons …")
 * oder eine Amtszeit („Jagdherr seit 1993"). Über alle 214 Papiernamen zeigt
 * **keiner** auf zwei Kontakte. Der Papiername ist also der eindeutige, und er
 * ist zugleich der gegen das Blatt prüfbare — dieselbe Begründung, die 110 für
 * `art_text` gibt („wortgetreu und absichtlich nicht normalisiert"). Der Preis
 * ist ein gelegentlich sperriger Eintrag; er ist billiger als eine Zeile, die
 * die falsche Person meint.
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
}

/** Eine Art mit ihrer Summe. */
export type Art = { art: string; anzahl: number }

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
  /** Der Name des Papiers. Bleibt die Anzeige, wenn kein Kontakt dahinter steht. */
  papiername: string
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
type Identitaet = { schluessel: string; papiername: string }

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
  }
}

/**
 * Der bessere von zwei Papiernamen desselben Schlüssels.
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

/** Absteigend nach Gesamtstrecke, bei Gleichstand alphabetisch nach dem
 *  Papiernamen. Stand zweimal wörtlich da (Ponytail 27.08.2026). */
function nachStrecke(
  a: { gesamt: number; papiername: string },
  b: { gesamt: number; papiername: string },
): number {
  return b.gesamt - a.gesamt || a.papiername.localeCompare(b.papiername, 'de')
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

  for (const z of zeilen) {
    const { schluessel, papiername } = identitaet(z)
    const zeile = je.get(schluessel) ?? {
      schluessel,
      papiername,
      kontaktId: z.kontakt_id,
      arten: [],
      gesamt: 0,
    }
    zeile.papiername = besserName(zeile.papiername, papiername)
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
  papiername: string
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

  for (const z of zeilen) {
    // `jagdjahr` ist in `familie_jahr` per CHECK NOT NULL. Die Bedingung ist
    // der Typ-Riegel, nicht eine vermutete Lücke.
    if (z.jagdjahr == null) continue
    const { schluessel, papiername } = identitaet(z)

    const eintrag =
      je.get(schluessel) ??
      {
        blatt: {
          schluessel,
          papiername,
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
    // Dieselbe Regel wie in `rangliste()` — und zwar aus derselben Funktion,
    // nicht als zweite Fassung daneben (Fremdprüfung 27.08.2026, A10).
    eintrag.blatt.papiername = besserName(eintrag.blatt.papiername, papiername)

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
 * einen Ort, der meistens kein Revier dieser Datenbank ist — 54 der 56 Orte
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
  arten: Art[]
  /** Orte absteigend nach Menge — **einschliesslich** des Sammeltopfs für
   *  Zeilen ohne Ortsangabe. */
  orte: Art[]
  /**
   * Wie viele davon **benannte** Orte sind.
   *
   * `orte.length` ist es NICHT: der Sammeltopf `OHNE_ORT` steht dort mit
   * drin, und die Seite nennt die Zahl zweimal in Prosa („reicht über N
   * Orte"). Ein einziger Eintrag ohne Ortsangabe machte aus 56 Orten 57, und
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
    arten: [...jeArt].map(([art, anzahl]) => ({ art, anzahl })).sort(nachMenge),
    orte: [...jeOrt].map(([art, anzahl]) => ({ art, anzahl })).sort(nachMenge),
    orteBenannt: [...jeOrt.keys()].filter((o) => o !== OHNE_ORT).length,
  }
}

/** Absteigend nach Menge, bei Gleichstand alphabetisch — sonst kippt eine
 *  Liste zwischen zwei Lesungen ohne Änderung. */
function nachMenge(a: Art, b: Art): number {
  return b.anzahl - a.anzahl || a.art.localeCompare(b.art, 'de')
}

/**
 * Der Anteil als ganze Prozentzahl — **aber nie als „0 %" neben einer
 * vorhandenen Menge.**
 *
 * Im Journal (1394 Stück auf 56 Orte) erreichen das die Orte mit sechs oder
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
