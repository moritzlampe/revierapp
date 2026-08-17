'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from './schreiben'
import { sichtbarerName } from './namen'

/**
 * Den Reviernamen korrigieren — die erste Stammdatenpflege der Zentrale.
 *
 * **Der Anlass ist eine Lücke, kein Wunsch** (Moritz, 08.08.2026: „Reviername
 * sollte korrigierbar sein"). `districts` hat fünf pflegbare Spalten, und bis
 * heute waren nach dem Anlegen **genau zwei** änderbar: `boundary` (vier
 * Editoren) und `hidden` (nur im Du-Tab der Feld-App). `name` und `bundesland`
 * wurden beim Anlegen gesetzt und danach von keinem Client je wieder
 * angefasst — ein Tippfehler im Reviernamen war unkorrigierbar.
 *
 * **Das Bundesland bleibt bewusst draußen** (Moritz, selber Tag): beide Clients
 * bieten dafür eine Auswahlliste, kein Freitext — vertippen kann man sich
 * nicht, nur falsch klicken, und das ist bei zwei Revieren ein SQL-Einzeiler.
 * Beim Namen ist der Tippfehler dagegen der Normalfall.
 * Hintergrund zur Länderfrage: `QuickHunt_Recherche_Begehungsschein_Recht_V1.md`.
 *
 * **Ein Stift in der Kopfzeile, kein Block darunter — und die erste Fassung
 * machte es andersherum** (Moritz, 08.08.2026: *„unter Revier oben neben dem
 * Namen Söder ein Stift zum Anklicken hätte es auch getan. Bin ja ein Freund
 * vom Übersichtlichen und nicht zu Vollgeladenen."*).
 *
 * Sie stand als eigener Abschnitt „Stammdaten" unter der Karte, mit Überschrift,
 * Beschriftung, Dauer-Eingabefeld und Knopf — **vier sichtbare Elemente für
 * etwas, das man einmal im Leben eines Reviers tut.** Der Kopfkommentar
 * begründete das sogar ausdrücklich („ein Eingabefeld an dieser Stelle machte
 * aus jeder Orientierung eine Bearbeitung"). Das Argument stimmt für ein
 * *dauerhaft offenes* Feld und fällt beim Stift weg: im Ruhezustand steht dort
 * genau das, was vorher dort stand, plus ein Symbol.
 *
 * **Kleiner auf dem Bildschirm, teurer in der Datei — und der zweite Teil
 * gehört dazu** (Ponytail-Lesung 08.08.2026): der Block brauchte eine eigene
 * Sektion samt Überschrift, der Stift nutzt die Kopfzeile, die es ohnehin gibt.
 * Die Oberfläche schrumpft damit von vier Dauer-Elementen auf ein Symbol —
 * die Datei wächst um gut die Hälfte, weil ein Zustand dazukommt, den ein
 * Dauerfeld nicht braucht. Das ist der Tausch, und er ist bewusst zugunsten
 * der Oberfläche entschieden. Eine erste Fassung dieses Absatzes behauptete
 * schlicht „die kleinere Lösung"; das stimmt nur für den Bildschirm.
 *
 * **Die Änderung wirkt RÜCKWIRKEND auf bereits ausgestellte Begehungsscheine,
 * und das ist eine Entscheidung** (Fremdprüfung 08.08.2026, R9): die Druckseite
 * lädt bei jedem Aufruf den aktuellen `districts.name`
 * (`jagderlaubnisse/[id]/druck/page.tsx:348`), es gibt keinen Snapshot. Ein
 * Nachdruck kann damit einen anderen Reviernamen tragen als der Erstdruck.
 *
 * **Für den bestellten Fall ist genau das richtig.** Moritz' Auftrag lautet
 * „korrigierbar" — bei einer Korrektur war der alte Ausdruck falsch, und ein
 * Nachdruck soll den richtigen Namen tragen, nicht den Tippfehler konservieren.
 * Ein Snapshot je Schein löste den anderen Fall (das Revier heißt wirklich
 * anders als früher) und wäre für den bestellten Fall der Fehler. Eine
 * Namenshistorie ist Struktur für eine Frage, die niemand gestellt hat.
 * **Fällig, wenn ein Revier je aus einem anderen Grund als einem Tippfehler
 * umbenannt wird** — dann zusammen mit der Entscheidung, was ein alter Ausdruck
 * dann bedeuten soll.
 *
 * **Heute ist die Frage ohnehin gegenstandslos** (Moritz, 08.08.2026): die vier
 * bestehenden Begehungsscheine sind Testdaten. Es gibt keinen ausgehändigten
 * Ausdruck, den eine Umbenennung überholen könnte — gemessen tragen alle vier
 * `holder_name = 'Moritz Lampe'` und keiner einen Inhaber (`holder_id is null`).
 */
export default function RevierName({ revierId, name }: { revierId: string; name: string }) {
  const router = useRouter()
  const [bearbeiten, setBearbeiten] = useState(false)
  const [entwurf, setEntwurf] = useState(name)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  // **`useTransition` schließt ein Fenster, das der Compare-and-Swap erst
  // aufgemacht hat** (Schlusslesung 08.08.2026, B1). Nach einem geglückten Save
  // ist `laeuft` sofort wieder false, das `router.refresh()` aber noch
  // unterwegs — die Prop `name` trägt für ein paar hundert Millisekunden den
  // ALTEN Wert, `geaendert` wird dadurch wieder wahr und der Knopf lebt auf.
  // Ein zweiter Klick in diesem Fenster liefe mit `.eq('name', <alt>)` ins
  // Leere und meldete „an anderer Stelle geändert" — über den eigenen Save.
  // `pending` bleibt wahr, bis der Refresh durch ist, und deckt genau diese
  // Lücke. Plattformmittel statt eines zweiten Zustands daneben.
  const [pending, startTransition] = useTransition()
  const busy = laeuft || pending

  // **Der Fokus muss zurück auf den Stift** (Fremdprüfung, S5). Beim Schließen
  // verschwindet das fokussierte Element — Eingabefeld oder Abbrechen-Knopf —
  // aus dem Baum, und der Browser fällt auf den Dokumentkörper zurück: der
  // nächste Tabulator beginnt wieder am Seitenanfang. Für Tastaturbedienung ist
  // das der Unterschied zwischen „Dialog geschlossen" und „Position verloren".
  //
  // Ein Ref statt eines `autoFocus`, weil der Stift im Ruhezustand IMMER da ist
  // — ein `autoFocus` an ihm zöge den Fokus beim ersten Laden der Seite an sich.
  // `nachBearbeiten` unterscheidet den Erstaufbau vom echten Schließen.
  //
  // Die Abhängigkeit auf `busy` ist tragend, nicht Vollständigkeit: nach einem
  // geglückten Save läuft der Refresh noch, der Stift ist so lange `disabled` —
  // und ein `focus()` auf ein deaktiviertes Element tut nichts. Also erst
  // fokussieren, wenn er wieder bedienbar ist.
  const stiftRef = useRef<HTMLButtonElement>(null)
  const nachBearbeiten = useRef(false)
  useEffect(() => {
    if (bearbeiten) {
      nachBearbeiten.current = true
      return
    }
    if (nachBearbeiten.current && !busy) {
      nachBearbeiten.current = false
      // **Nur, wenn der Fokus wirklich verlorengegangen ist** (Delta-Durchgang
      // 08.08.2026): klickt der Nutzer während eines langsamen Refreshs in ein
      // anderes Feld, risse der Effect ihn beim Kippen von `pending` sonst
      // hierher zurück. Der Browser parkt einen verwaisten Fokus auf `body` —
      // genau dieser Fall, und nur er, soll geheilt werden.
      if (document.activeElement === document.body) stiftRef.current?.focus()
    }
  }, [bearbeiten, busy])

  const sauber = entwurf.trim()

  // **Der Riegel gegen den leeren Namen, und er braucht zwei Schritte.** `name`
  // ist `NOT NULL`, trägt aber **keinen CHECK** — an der Produktion
  // nachgesehen. `NOT NULL` verbietet `NULL`, nicht den leeren String.
  //
  // `trim()` allein genügt nicht: es entfernt die Unicode-Kategorie `Zs`, also
  // auch NBSP (U+00A0) — **aber nicht U+200B ZERO WIDTH SPACE**, das als `Cf`
  // geführt wird (Fremdprüfung 08.08.2026, R3). Ein eingefügtes ZWSP ergäbe
  // `length === 1` und damit einen sichtbar leeren Reviernamen.
  // Genau die Zeichenklasse, an der auch Migration 111 hängen blieb — dort mit
  // NBSP und in Kauf genommen, weil der Schaden ein leerer Absatz war.
  //
  // **Hier ist der Schaden größer, und die erste Fassung hat das falsch
  // behauptet:** sie nannte es „Selbstschaden am eigenen Revier". Das stimmt
  // nicht — `districts.name` liest seit Migration 075 auch der Inhaber eines
  // Begehungsscheins, und der Name steht auf dem gedruckten Blatt, das nach
  // § 19 NJagdG Polizeibeamten vorgezeigt wird.
  //
  // Geprüft wird auf `sichtbar`, GESPEICHERT wird `sauber`: ein ZWJ (U+200D)
  // mitten in einer Emoji-Sequenz darf bleiben, es ist dort kein Leerraum.
  //
  // **Diese Begründung trägt ZWJ, aber nicht die übrigen Formatzeichen**
  // (Fremdprüfung 17.08.2026, P3): ein Name, der sich NUR um ein angehängtes
  // ZWSP unterscheidet, gilt hier als Änderung und wird gespeichert, obwohl er
  // unverändert aussieht. Für `districts.name` folgenlos — die Spalte hat
  // keinen UNIQUE, und der Nutzer sieht, was er getippt hat. **Bewusst nicht
  // in diesem Paket geheilt**, weil das Speicherverhalten vorbesteht und ein
  // Umbau von `sauber` eine zweite Baustelle wäre; die Entscheidung fällt am
  // ersten Feld MIT UNIQUE, den Standgruppen (Migration 112).
  // ponytail: Client-Riegel wie beim Anlegen. Ein DB-CHECK deckte auch den
  // Anlegepfad und `curl` — er ist eine Migration und liegt als eigener
  // Vorgang im Backlog.
  //
  // **Seit dem 10.08.2026 die gemeinsame Regel aus `namen.ts`** — dort
  // geschrieben, mit Paket A am 17.08.2026 gepusht. **Hier ist sie eine
  // VERSCHÄRFUNG:** die Zeichenliste, die vorher an dieser Stelle
  // stand (`[\u200B-\u200D\uFEFF]`), ließ U+2060 WORD JOINER, U+200E
  // LEFT-TO-RIGHT MARK und U+00AD SOFT HYPHEN durch — drei unsichtbare
  // Zeichen, mit denen ein optisch leerer Reviername durchgekommen wäre.
  // Am GESPEICHERTEN Wert ändert sich nichts: `sauber` geht in die DB,
  // `sichtbar` entscheidet nur, ob der Name als leer gilt.
  const sichtbar = sichtbarerName(sauber)
  const geaendert = sichtbar.length > 0 && sauber !== name

  // Öffnen und Abbrechen tun dasselbe, nur mit anderem Ziel: der Entwurf geht
  // auf den gespeicherten Namen, ein stehender Fehler verschwindet mit ihm.
  // Sonst begrüßte der nächste Klick auf den Stift den Nutzer mit der
  // Fehlermeldung von vorhin.
  //
  // **`if (busy) return` — und die Geschichte dieser Zeile gehört in die Akte,
  // weil zwei Prüfer sie an einem Nachmittag gegensätzlich beurteilt haben.**
  //
  // Die Ponytail-Lesung strich sie als unerreichbar: die beiden Aufrufer im
  // Bearbeiten-Zweig sind gesperrt (Abbrechen-Knopf per `disabled={busy}`,
  // Escape über das ebenfalls `disabled` Eingabefeld, das kein `keydown`
  // feuert). Das stimmte — **für die beiden, die sie gezählt hat.**
  //
  // **Es gibt einen dritten, und er ist der gefährlichste** (Fremdprüfung,
  // S1/S2): der **Stift** im Ruhezustand. Nach einem geglückten Save schließt
  // `setBearbeiten(false)` sofort, während `router.refresh()` noch läuft — der
  // Stift ist dann schon da und `name` trägt noch den ALTEN Wert. Ein Klick
  // setzte `entwurf` auf den alten Namen; kommt danach die neue Prop, wird
  // `geaendert` wieder wahr, und der nächste Save **rollt die Umbenennung
  // zurück**. Aus einem toten Riegel war ein Datenverlust-Pfad geworden.
  //
  // Der Riegel steht deshalb wieder hier, in der Funktion statt in drei
  // Aufrufern, und der Stift trägt zusätzlich `disabled={busy}` — das eine ist
  // die Sicherung, das andere macht sie sichtbar.
  function umschalten(an: boolean) {
    if (busy) return
    setEntwurf(name)
    setFehler(null)
    setBearbeiten(an)
  }

  async function speichern() {
    // **`busy`, nicht `laeuft`** — und der Kommentar, der hier stand, war nach
    // dem CAS überholt (Schlusslesung, B1). Er behauptete, ein zweites
    // Speichern schriebe harmlos denselben Namen noch einmal; seit
    // `.eq('name', name)` liefe es stattdessen in einen Schein-Konflikt.
    // Ein Ref-Riegel nach S5 braucht es trotzdem nicht: `pending` deckt das
    // Fenster, und Umbenennen ist keine irreversible Handlung.
    if (!geaendert || busy) return
    setLaeuft(true)
    setFehler(null)
    try {
      // `.select('id')` ist Pflicht, sonst ist `data` immer null und
      // `schreibe()` wirft — s. den Kopf von `schreiben.ts`. Genau daran sind
      // in der PWA vier Schreibpfade jahrelang still vorbeigelaufen (E-R1).
      //
      // **Nur `name`, keine zweite Spalte.** Der Karteneditor derselben Seite
      // schreibt `boundary` auf dieselbe Zeile; ein UPDATE, das beide Felder
      // mitschickte, überschriebe eine gerade gezeichnete Grenze mit einem
      // veralteten Wert.
      //
      // **`.eq('name', name)` ist der Compare-and-Swap** (Fremdprüfung, R4).
      // Ohne ihn traf das UPDATE nur auf `id` — zwei Tabs mit demselben alten
      // Namen hätten beide „genau eine Zeile" geschrieben und beide als Erfolg
      // gegolten, der spätere überschriebe den früheren still.
      //
      // **Auf `name` und NICHT auf `updated_at`, und das ist der Punkt:** die
      // Grenze auf derselben Zeile hebt `updated_at` bei jedem Zeichnen. Ein
      // Zeitstempel-CAS meldete dann einen Konflikt, wo gar keiner ist — der
      // Karteneditor macht es für die Grenze richtig, weil dort die Grenze
      // selbst das umkämpfte Feld ist. Hier ist es der Name.
      await schreibe('Reviername', () =>
        createClient()
          .from('districts')
          .update({ name: sauber })
          .eq('id', revierId)
          .eq('name', name)
          .select('id'),
      )
      startTransition(() => router.refresh())
      // Zurück in den Ruhezustand — aber NUR im Erfolgsfall. Nach einem
      // Fehlschlag bleibt das Feld offen, mit dem getippten Namen darin: den
      // Nutzer zuzuklappen und ihn seine Eingabe neu tippen zu lassen, wäre die
      // Bestrafung für einen Fehler, den er nicht gemacht hat.
      setBearbeiten(false)
    } catch (e) {
      // Der Fehler wird ANGEZEIGT, nicht verschluckt: eine Eingabe, die
      // scheinbar geglückt ist und beim nächsten Laden wieder alt dasteht, ist
      // schlimmer als eine sichtbare Fehlermeldung.
      //
      // Die Meldung von `schreibe()` nennt bei 0 Zeilen RLS und fehlendes
      // `.select()` — seit dem CAS ist der häufigere Grund ein dritter: jemand
      // war schneller. Deshalb der Zusatz, statt den Nutzer eine Berechtigung
      // suchen zu lassen, die nie gefehlt hat.
      const roh = e instanceof Error ? e.message : 'Unbekannter Fehler'
      setFehler(
        roh.includes('kein Datensatz betroffen')
          ? 'Der Name wurde inzwischen an anderer Stelle geändert. Seite neu laden und erneut versuchen.'
          : roh,
      )
    } finally {
      // **Läuft auch nach dem Aushängen** (Fremdprüfung, R5) — React 19
      // verwirft solche Updates still. Ein Nutzer, der sofort das Revier
      // wechselt, sieht einen späten Fehlschlag also nicht.
      // In Kauf genommen, und der Grund ist der Unterschied zwischen fehlender
      // Meldung und Falschanzeige: der Name bleibt in diesem Fall schlicht der
      // alte, und genau das steht beim nächsten Laden auch da. Es entsteht
      // keine Behauptung, die nicht stimmt — nur eine Meldung, die ausbleibt.
      // Ein layoutweiter Toast wäre der saubere Weg und ist ein eigener Vorgang.
      setLaeuft(false)
    }
  }

  // Ruhezustand: der Name wie vorher, dahinter der Stift. Die Kopfzeile sieht
  // damit aus wie bis gestern, plus ein Symbol.
  //
  // **`<div>` und nicht `<p>`, und das war ein echter Fehler** (Ponytail-Lesung
  // 08.08.2026): ein `<p>` darf nur Phrasing-Content enthalten, weshalb die
  // erste Fassung Fehler- und Hinweiszeile im anderen Zweig von `<p>` auf
  // `<span>` umbaute — und `margin` wirkt an einem inline `<span>` vertikal
  // **nicht**. Der Abstand über der Fehlerzeile war damit weg. `.zentrale-revier`
  // hängt an einer Klasse, nicht am Element, der Tausch kostet also nichts.
  if (!bearbeiten) {
    return (
      <div className="zentrale-revier">
        <span className="zentrale-revier-label">Revier</span>
        <span className="zentrale-revier-name">
          {name}
          {/* Der Name gehört IN das aria-label, nicht nur „Ändern": in einer
              Liste vorgelesener Bedienelemente ist „Ändern" ohne Bezug
              wertlos. */}
          <button
            type="button"
            className="zentrale-stift"
            ref={stiftRef}
            onClick={() => umschalten(true)}
            // Solange der Refresh läuft, trägt `name` noch den alten Wert —
            // ein Klick hier hätte den gerade gespeicherten Namen verworfen
            // (Fremdprüfung, S1). `umschalten` riegelt zusätzlich ab; dieses
            // `disabled` macht den Zustand sichtbar, statt Klicks ins Leere
            // laufen zu lassen.
            disabled={busy}
            aria-label={`Reviernamen „${name}" ändern`}
          >
            {/* Inline-SVG wie in `dokumentation/page.tsx` — das Portal hat
                bewusst keine Icon-Bibliothek. Ein `✎` wäre eine Zeile statt
                neun, hinge aber an der Fontkaskade: die Kopfzeile läuft auf
                `var(--font-display)` (Fraunces), das Zeichen fiele auf eine
                Fallback-Font mit eigener Grundlinie und eigenem Strichgewicht.
                `aria-hidden`, weil der Knopf sein Label schon trägt. */}
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="zentrale-revier">
      <label className="zentrale-revier-label" htmlFor="revier-name">
        Revier umbenennen
      </label>
      <div className="zentrale-umbenennen">
        <div className="zeile">
          <input
            id="revier-name"
            autoFocus
            value={entwurf}
            onChange={(e) => {
              setEntwurf(e.target.value)
              // Ein Fehler beschreibt den letzten Speicherversuch. Sobald der
              // Nutzer weitertippt, beschreibt er nichts mehr — und bliebe
              // sonst samt `aria-invalid` stehen, bis das nächste Speichern
              // ihn räumt (Schlusslesung, B1).
              if (fehler) setFehler(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') speichern()
              // Escape schließt jetzt zurück in den Ruhezustand, statt nur den
              // Entwurf zurückzusetzen — mit dem Stift ist „abbrechen" ein
              // eigener Zustandswechsel und nicht mehr bloß ein Textreset.
              if (e.key === 'Escape') umschalten(false)
            }}
            disabled={busy}
            autoComplete="off"
            // Beides aus der Fremdprüfung (R8): ohne die Verbindung liest ein
            // Screenreader das Feld vor und die Fehlermeldung darunter nie —
            // sie erscheint dynamisch, während der Fokus im Feld steht.
            aria-invalid={fehler !== null || sichtbar.length === 0}
            aria-describedby={
              [fehler ? 'revier-name-fehler' : null, sichtbar.length === 0 ? 'revier-name-hinweis' : null]
                .filter(Boolean)
                .join(' ') || undefined
            }
          />
          {/* `.zentrale-knopf` statt eigener Stile — die Klasse gibt es seit
              Phase 1. Kein `maxLength`: die erste Fassung hatte 200, und das
              war eine erfundene Zahl (Ponytail-Lesung). `districts.name` ist
              `text` ohne Grenze, wie jede Textspalte des Projekts (zuletzt
              ausdrücklich in Migration 111 begründet). Wenn je eine Grenze
              nötig wird, gehört sie in die DB, wo sie für BEIDE Clients gilt —
              nicht in ein Formular, an dem der zweite Client vorbeischreibt. */}
          <button
            type="button"
            className="zentrale-knopf"
            onClick={speichern}
            disabled={!geaendert || busy}
          >
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
          {/* Der Abbrechen-Knopf ist mit dem Stift dazugekommen: Escape allein
              genügte, solange das Feld dauerhaft dastand und „abbrechen" nur
              „zurücktippen" hieß. Jetzt gibt es einen Zustand, aus dem man
              wieder herausmuss — und eine Geste, die man nicht sieht, ist dafür
              kein Ausweg. */}
          <button
            type="button"
            className="zentrale-abbrechen"
            onClick={() => umschalten(false)}
            disabled={busy}
          >
            Abbrechen
          </button>
        </div>
        {/* `role="alert"` nur am Fehler: er ist ein Ergebnis und soll
            unterbrechen. Der Hinweis darunter beschreibt einen Zustand, den der
            Nutzer gerade selbst herstellt — ihn bei jedem gelöschten Zeichen
            anzusagen, wäre Lärm. Er hängt stattdessen per `aria-describedby`
            am Feld und wird beim Fokussieren mitgelesen. */}
        {fehler && (
          <p className="zentrale-fehler" id="revier-name-fehler" role="alert">
            {fehler}
          </p>
        )}
        {/* Der Hinweis erscheint nur, wenn das Feld tatsächlich leer geräumt
            ist — sonst stünde eine Ermahnung über einem gültigen Namen.
            **`sichtbar`, nicht `sauber`**: ein eingefügtes ZWSP ergäbe sonst
            ein optisch leeres Feld ohne jede Erklärung, während der
            Speichern-Knopf tot bleibt. */}
        {sichtbar.length === 0 && (
          <p className="zentrale-hinweis" id="revier-name-hinweis">
            Ein Revier braucht einen Namen.
          </p>
        )}
      </div>
    </div>
  )
}
