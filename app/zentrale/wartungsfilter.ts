/**
 * Die Zustandsachse der Wartungssicht — welche Stufen es gibt und welche
 * Ampel in welche fällt (Konzept Standzustand §4.2, Portal).
 *
 * **Warum es diese Datei überhaupt gibt.** `wartung.ts` liefert die Ampel mit
 * sechs Werten, weil sie ZWEI Achsen trägt: die Farbe sagt den Zustand, die
 * Füllung den Saisonstand (§4.1.1). Zum Filtern taugt das nicht direkt —
 * `ok-voll` und `ok-hohl` sind derselbe Zustand, und wer „heil" abwählt, meint
 * beide. Diese Datei faltet die Saisonachse weg und lässt vier disjunkte
 * Stufen übrig.
 *
 * **Die Saisonachse ist bewusst NICHT filterbar, und das ist eine Entscheidung,
 * kein Vergessen.** Sie steht auf der Karte in der Füllung des Rings und in der
 * Kachel „Geprüft — 140 von 172 · Jagdjahr 26/27". Eine dritte Stelle, an der
 * dieselbe Frage anders beantwortet wird, war in diesem Repo schon zweimal der
 * Fehler. Zeigt sich im Gebrauch, dass „was muss ich diese Saison noch abgehen"
 * ohne eigene Stufe nicht zu beantworten ist, kommt sie dazu — dann aber als
 * zweite Achse neben diesen vier, nicht als fünfte Stufe darin.
 *
 * ⚠ **Die Wörter hier dürfen NICHT „Geprüft" und „Offen" heißen**, so sehr sie
 * sich anbieten. Beide sind auf demselben Bildschirm schon vergeben, mit einer
 * ANDEREN Zählung: die Kachel `Geprüft` zählt `sitze - offen`, also alles, was
 * diese Saison angesehen wurde — ein Stand mit frisch gemeldetem Mangel zählt
 * dort als geprüft, hier als `mangel`. Und `offen` meint dort „diese Saison
 * nicht angesehen", hier „noch nie eine Prüfzeile". Zwei Zahlen unter einem
 * Wort auf einem Bildschirm sind eine dritte Wahrheit; deshalb „Heil" und
 * „Nie geprüft".
 *
 * Bewusst **ohne Wert-Import** — dadurch mit
 * `node --experimental-strip-types app/zentrale/wartungsfilter.selftest.ts`
 * prüfbar, ohne Pfad-Alias, Bundler oder Netz. Dasselbe Muster wie
 * `objekte.ts`, `handlungsbedarf.ts` und `namen.ts`. Der `import type` ist zur
 * Laufzeit nicht da: Node entfernt ihn beim Strippen mitsamt der Zeile.
 */
import type { Ampel } from '@/lib/revier/wartung'

/**
 * Die vier Stufen, nach denen sich filtern lässt.
 *
 * `nie` steht bewusst am Ende, obwohl es der Startzustand jedes Objekts ist:
 * die Reihenfolge ist die der Dringlichkeit, nicht die der Entstehung — und
 * dieselbe wie in `ZUSTAND_WAHL` des Inspektors, damit niemand zwei
 * Reihenfolgen für dieselben Zustände lernen muss.
 */
export type ZustandStufe = 'heil' | 'mangel' | 'gesperrt' | 'nie'

/**
 * Welche Ampel in welche Stufe fällt.
 *
 * **Als `Record<Ampel, …>` und nicht als Funktion mit `switch`:** kommt je ein
 * siebter Ampelwert aus `wartung.ts` dazu, nennt der Compiler diese Stelle,
 * statt ihn still in einen `default`-Zweig fallen zu lassen. Dieselbe
 * Begründung wie bei `ISTWARTBAR` dort.
 *
 * **Die Zuordnung ist an keiner Stelle mehrdeutig, und das ist der Grund für
 * die Faltung:** jede Ampel hat genau eine Stufe, jede Stufe mindestens eine
 * Ampel. Damit ist die Menge der sichtbaren Objekte eine Partition — anders als
 * bei `bilanz()`, wo ein Stand gleichzeitig `offen` UND `gesperrt` sein kann
 * (letztes Jahr gesperrt, dieses Jahr nicht angesehen) und die Zahlen sich
 * deshalb nicht zu `sitze` addieren. Ein Filter mit überlappenden Stufen wäre
 * beim Abwählen nicht vorhersagbar.
 */
const STUFE_JE_AMPEL: Record<Ampel, ZustandStufe> = {
  'ok-voll': 'heil',
  'ok-hohl': 'heil',
  'mangel-voll': 'mangel',
  'mangel-hohl': 'mangel',
  gesperrt: 'gesperrt',
  offen: 'nie',
}

export function stufeVon(ampel: Ampel): ZustandStufe {
  return STUFE_JE_AMPEL[ampel]
}

/**
 * Die Stufen in Anzeigereihenfolge, mit ihrem Wort.
 *
 * `titel` erklärt, was die Stufe umfasst — nötig, weil „Heil" beide
 * Saisonvarianten trägt und „Nie geprüft" etwas anderes meint als die Kachel
 * daneben. Ohne den Zusatz müsste man raten, warum ein Stand mit grünem
 * Hohlring unter „Heil" steht und nicht unter „Nie geprüft".
 */
export const STUFEN: readonly { wert: ZustandStufe; label: string; titel: string }[] = [
  {
    wert: 'heil',
    label: 'Heil',
    titel: 'Zuletzt in Ordnung befunden — auch wenn die Prüfung aus einer früheren Saison stammt',
  },
  { wert: 'mangel', label: 'Mangel', titel: 'Beanstandet, aber benutzbar' },
  { wert: 'gesperrt', label: 'Gesperrt', titel: 'Nicht besetzen' },
  {
    wert: 'nie',
    label: 'Nie geprüft',
    titel: 'Zu diesem Objekt gibt es überhaupt keine Prüfzeile — nicht zu verwechseln mit „diese Saison offen"',
  },
]

/**
 * Bleibt ein Objekt mit dieser Ampel sichtbar?
 *
 * **Als Menge des Abgewählten, nicht des Gewählten** — dieselbe Bauart wie
 * `versteckt` in der Typ-Legende daneben, und aus demselben Grund: leer heißt
 * „alles", und das ist der Startzustand, ohne ihn aufzählen zu müssen.
 *
 * **`pruefung === null` ist hier NICHT der Sonderfall, den man erwartet.** Ein
 * Objekt ohne Prüfzeile trägt die Ampel `offen` und fällt damit in `nie` — es
 * geht durch dieselbe Tür wie alles andere. Der Aufrufer muss also nicht
 * vorher aussortieren; er muss nur die Ampel kennen.
 */
export function stufeSichtbar(ampel: Ampel, abgewaehlt: ReadonlySet<ZustandStufe>): boolean {
  return !abgewaehlt.has(stufeVon(ampel))
}
