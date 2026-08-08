'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from './schreiben'

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
 * **Warum hier und nicht im Kopf der Seite:** die Kontextzeile oben nennt das
 * Revier, sie ist Orientierung. Ein Eingabefeld an dieser Stelle machte aus
 * jeder Orientierung eine Bearbeitung. Stammdaten gehören nach Konzept §1.1
 * unter *Revier* — dort, wo man ohnehin pflegt, aber unterhalb der
 * Arbeitsfläche.
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
  // ponytail: Client-Riegel wie beim Anlegen. Ein DB-CHECK deckte auch den
  // Anlegepfad und `curl` — er ist eine Migration und liegt als eigener
  // Vorgang im Backlog.
  const sichtbar = sauber.replace(/[\u200B-\u200D\uFEFF]/gu, '').trim()
  const geaendert = sichtbar.length > 0 && sauber !== name

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

  return (
    <section className="zentrale-block">
      <h2>Stammdaten</h2>
      <div className="zentrale-stammdaten">
        <label htmlFor="revier-name">Name des Reviers</label>
        <div className="zeile">
          <input
            id="revier-name"
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
              // Escape stellt den gespeicherten Stand wieder her — dieselbe
              // Erwartung wie überall sonst, und billiger als ein Abbrechen-Knopf.
              if (e.key === 'Escape') setEntwurf(name)
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
    </section>
  )
}
