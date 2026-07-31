'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { typLabel } from './objekte'

/**
 * Der Papierkorb eines Reviers (Migrationen 072–074).
 *
 * **Warum er nicht aus derselben Quelle kommt wie die Liste darüber.** Seit 073
 * blenden die RLS-Lesepfade jede Zeile mit gesetztem `deleted_at` aus — auch
 * vor der Ansicht, die sie zeigen soll. Ein `select … where deleted_at is not
 * null` liefert deshalb zuverlässig nichts. Der Weg führt über
 * `papierkorb_kartenobjekte()`, eine `security definer`-Funktion.
 *
 * **Warum er sich bei jedem Aufklappen neu lädt.** Die Liste der lebenden
 * Objekte kommt vom Server-Render, der Papierkorb vom Client — sie könnten
 * auseinanderlaufen, sobald jemand löscht. Statt beide Stände zu synchronisieren
 * (und die Fehlerfälle zu pflegen, die dabei entstehen), wird beim Öffnen
 * geladen. Ein Papierkorb ist nichts, was man dauernd offen hat; einmal laden
 * pro Blick ist genau richtig und kann per Konstruktion nicht veralten.
 *
 * **Zur Fehlerbehandlung beim Zurückholen, damit sie niemand als toten Code
 * wegräumt.** Die Datenbank erlaubt absichtlich, dass jemand mehr SIEHT als er
 * zurückholen darf: ein aktiver Scheininhaber sieht ohnehin jedes lebende
 * Objekt des Reviers, darf aber nur seine eigenen verwalten. In der Zentrale
 * ist dieser Fall NICHT erreichbar — `/zentrale` listet ausschließlich Reviere
 * mit `owner_id = angemeldeter Nutzer` (siehe `page.tsx`), und der Besitzer darf
 * alles. Er wird erreichbar, sobald der Papierkorb in die PWA oder die native
 * App wandert. Der Fehlerzweig ist trotzdem schon hier nötig, weil ein
 * Zurückholen auch scheitert, wenn jemand anders das Objekt inzwischen
 * zurückgeholt hat.
 *
 * Bewusst NICHT gebaut: kein „endgültig löschen"-Knopf. Ein hartes DELETE nimmt
 * per CASCADE die Kontrollhistorie und die Fotos des Objekts mit — das gehört
 * nicht hinter einen Knopf, den man beim Aufräumen nebenbei trifft. Wer es
 * wirklich braucht, kann es über SQL. Und kein 30-Tage-Filter: er würde ein
 * Objekt nach Ablauf unsichtbar UND unwiederherstellbar machen, ohne dass es je
 * gelöscht wurde.
 */

type Geworfen = {
  id: string
  name: string
  type: string
  description: string | null
  deleted_at: string
  created_by: string | null
}

export default function Papierkorb({ revierId }: { revierId: string }) {
  const router = useRouter()
  /** `null` = noch nie geladen. Unterscheidet „leer" von „weiß ich noch nicht". */
  const [zeilen, setZeilen] = useState<Geworfen[] | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  /**
   * Welche Zeilen gerade zurückgeholt werden. Eine MENGE, kein einzelner Wert:
   * mit einem einzelnen `string` löschte der zweite Klick den Beschäftigt-Zustand
   * der ersten Zeile, deren Anfrage noch lief — ihr Knopf wurde wieder klickbar,
   * obwohl sie noch unterwegs war. (Codex, 31.07.2026)
   */
  const [laeuft, setLaeuft] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * Generationszähler gegen überholende Antworten. Auf-zu-auf startet zwei
   * Ladeläufe; ohne ihn könnte der ältere den jüngeren überschreiben und einen
   * Stand zeigen, den es nicht mehr gibt. (Codex, 31.07.2026)
   */
  const lauf = useRef(0)

  const laden = useCallback(async () => {
    const meiner = ++lauf.current
    setLaedt(true)
    setFehler(null)
    const { data, error } = await createClient().rpc('papierkorb_kartenobjekte', {
      p_district_id: revierId,
    })
    // Ein jüngerer Lauf hat übernommen — dieses Ergebnis ist überholt.
    if (meiner !== lauf.current) return
    setLaedt(false)
    if (error) {
      setFehler('Der Papierkorb konnte nicht geladen werden.')
      return
    }
    setZeilen((data ?? []) as Geworfen[])
  }, [revierId])

  const zurueckholen = async (id: string) => {
    setLaeuft((s) => new Set(s).add(id))
    const { error } = await createClient().rpc('kartenobjekt_wiederherstellen', {
      p_id: id,
      p_district_id: revierId,
    })
    setLaeuft((s) => {
      const naechste = new Set(s)
      naechste.delete(id)
      return naechste
    })

    // Neu laden und die Karte auffrischen in BEIDEN Fällen, nicht nur bei
    // Erfolg. Derselbe Grund wie beim Löschen in `revierkarte.tsx`: der
    // wahrscheinlichste Grund für einen Fehlschlag ist, dass jemand anders das
    // Objekt schon zurückgeholt hat — dann ist es auf der Karte wieder da und
    // gehört aus dieser Liste raus.
    await laden()
    router.refresh()

    // Die Meldung NACH dem Nachladen, denn `laden()` räumt `fehler` weg. Vorher
    // stand sie davor und wurde vom eigenen Nachlader gelöscht: der Nutzer sah
    // gar nichts — genau der stille Fehlschlag, den der Papierkorb abschaffen
    // sollte. (Codex, 31.07.2026)
    if (error) {
      setFehler('Zurückholen fehlgeschlagen. Die Liste ist neu geladen.')
    }
  }

  return (
    <details
      className="zentrale-papierkorb"
      // Bei jedem Öffnen neu laden, nicht nur beim ersten: siehe Kopf.
      // `onToggle` feuert auch beim Zuklappen, daher die Abfrage.
      onToggle={(e) => {
        if (e.currentTarget.open) void laden()
      }}
    >
      <summary>
        Papierkorb
        {zeilen ? <span className="zahl">{zeilen.length}</span> : null}
      </summary>

      {/* Die Zeilen bleiben beim Nachladen stehen, der Hinweis kommt daneben.
          Sie wegzublenden hieße, nach jedem Zurückholen kurz eine leere Liste
          zu zeigen. */}
      {laedt ? <p className="hinweis">Wird geladen …</p> : null}
      {fehler ? <p className="fehler">{fehler}</p> : null}

      {!laedt && zeilen && zeilen.length === 0 ? (
        <p className="hinweis">Nichts gelöscht.</p>
      ) : null}

      {zeilen && zeilen.length > 0 ? (
        <ul>
          {zeilen.map((z) => (
            <li key={z.id}>
              <span className="nam">{z.name}</span>
              <span className="typ">{typLabel(z.type)}</span>
              <span className="wann">
                {new Date(z.deleted_at).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
              <button
                type="button"
                onClick={() => void zurueckholen(z.id)}
                disabled={laeuft.has(z.id)}
              >
                {laeuft.has(z.id) ? 'Holt …' : 'Zurückholen'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  )
}
