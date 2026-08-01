'use client'

import { useMemo, useState } from 'react'
import {
  alsDatum,
  anzeigeName,
  einladungsHinweis,
  einladungsweg,
  EINLADUNGSWEG_LABEL,
  kuerzelVon,
  istGestrichen,
  sichtbare,
  sortiert,
  type Filter,
  type Kontakt,
} from './kontakte'

/**
 * Die Gästeliste: Suche, Filter, Tabelle, Inspektor.
 *
 * **Alles im Speicher.** 154 Zeilen kommen als ein Rutsch vom Server; Suchen
 * und Filtern passieren hier, ohne Netz. Keine Blätterung, keine
 * Server-Suche, keine Virtualisierung — die wären bei dieser Menge Aufwand
 * ohne Wirkung. Fällig, sobald ein Adressbuch vierstellig wird.
 *
 * **Warum Inspektor und nicht Formular über der Liste** (anders als
 * `../jagderlaubnisse/formular.tsx`): dort stellt man drei Scheine aus, hier
 * geht man 154 Zeilen durch und trägt nach. Ein Formular oben schöbe die Liste
 * bei jedem Kontakt weg und nähme die Scrollposition mit; der Inspektor lässt
 * die Zeile stehen, an der man gerade ist.
 *
 * Diese Fassung ist **lesend**. Bearbeiten, Anlegen und Löschen kommen als
 * eigener Schritt in denselben Inspektor.
 */
export default function Liste({
  kontakte,
  startSuche,
  startFilter,
}: {
  kontakte: Kontakt[]
  startSuche: string
  startFilter: Filter
}) {
  const [suche, setSuche] = useState(startSuche)
  const [filter, setFilter] = useState<Filter>(startFilter)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)

  const ohneMail = useMemo(() => kontakte.filter((k) => einladungsweg(k) === 'code').length, [kontakte])
  const gestrichen = useMemo(() => kontakte.filter(istGestrichen).length, [kontakte])
  // Einmal sortieren, nicht pro Tastenanschlag: die Ordnung hängt am Bestand,
  // nicht an der Suche.
  const geordnet = useMemo(() => sortiert(kontakte), [kontakte])
  const zeilen = useMemo(() => sichtbare(geordnet, suche, filter), [geordnet, suche, filter])
  // Aufgelöst über **alle** Kontakte, nicht über die sichtbaren: sonst leerte
  // sich der Inspektor beim Tippen, sobald die offene Zeile aus dem Filter
  // fällt — und tauchte beim Zurücksetzen ungefragt wieder auf. Der Inspektor
  // zeigt, was man geöffnet hat, unabhängig davon, was die Liste gerade filtert.
  const kontakt = useMemo(() => kontakte.find((k) => k.id === gewaehlt) ?? null, [kontakte, gewaehlt])

  /**
   * Filter- und Suchzustand in die URL (Zentrale-Konzept §2.4), damit
   * `?q=streichen` ein teilbarer Link ist.
   *
   * **`history.replaceState` statt `router.replace`**, und das ist der Punkt:
   * ein Router-Aufruf ließe Next die Server-Komponente neu laufen — also eine
   * Supabase-Abfrage über alle Kontakte pro Tastenanschlag, für ein Ergebnis,
   * das schon vollständig im Speicher liegt. Der direkte Weg schreibt nur die
   * Adresszeile um und rührt den Baum nicht an.
   *
   * Bestehende Parameter bleiben stehen — vor allem `?revier=`, das die
   * Seitenleiste anhängt und das der Wechsel zurück in einen revier-gebundenen
   * Bereich braucht.
   */
  function urlMerken(neueSuche: string, neuerFilter: Filter) {
    const p = new URLSearchParams(window.location.search)
    if (neueSuche.trim()) p.set('q', neueSuche)
    else p.delete('q')
    if (neuerFilter === 'alle') p.delete('filter')
    else p.set('filter', neuerFilter)
    const rest = p.toString()
    window.history.replaceState(null, '', rest ? `?${rest}` : window.location.pathname)
  }

  function sucheGeaendert(wert: string) {
    setSuche(wert)
    urlMerken(wert, filter)
  }

  function filterGeaendert(wert: Filter) {
    setFilter(wert)
    urlMerken(suche, wert)
  }

  return (
    <>
      <div className="gaeste-leiste">
        <input
          type="search"
          className="gaeste-suche"
          placeholder="Name, E-Mail, Begleitung oder Notiz suchen …"
          value={suche}
          onChange={(e) => sucheGeaendert(e.target.value)}
          aria-label="Gäste durchsuchen"
        />

        {/* Zwei Filter, beide beschriftet mit ihrer Zahl. „Nur per Code" ist die
            Arbeitsliste zum Nachtragen von Adressen — und der einzige Weg
            dorthin, denn eine fehlende Adresse ist als Abwesenheit nicht
            suchbar. */}
        <div className="gaeste-filter" role="group" aria-label="Liste filtern">
          <button
            type="button"
            className="gaeste-chip"
            aria-pressed={filter === 'alle'}
            onClick={() => filterGeaendert('alle')}
          >
            Alle {kontakte.length}
          </button>
          <button
            type="button"
            className="gaeste-chip"
            aria-pressed={filter === 'code'}
            onClick={() => filterGeaendert('code')}
          >
            Nur per Code {ohneMail}
          </button>
          {/* Nur da, solange es unentschiedene Vermerke gibt. Sind alle 32
              abgearbeitet, verschwindet der Knopf von selbst — und es bleibt
              kein Feld zurück, das die übrigen Kontakte nie gebraucht haben. */}
          {gestrichen > 0 && (
            <button
              type="button"
              className="gaeste-chip"
              aria-pressed={filter === 'streichen'}
              onClick={() => filterGeaendert('streichen')}
            >
              {`„streichen“ ${gestrichen}`}
            </button>
          )}
        </div>

        <span className="gaeste-treffer" aria-live="polite">
          {zeilen.length === kontakte.length
            ? `${kontakte.length} Kontakte`
            : `${zeilen.length} von ${kontakte.length}`}
        </span>
      </div>

      <div className="gaeste-raster">
        <div className="gaeste-tabellenkasten">
          {zeilen.length === 0 ? (
            <p className="zentrale-leer">
              {kontakte.length === 0
                ? 'Noch keine Gäste in der Liste.'
                : 'Kein Kontakt passt zu Suche und Filter.'}
            </p>
          ) : (
            <table className="zentrale-tabelle gaeste-tabelle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Begleitung</th>
                  <th scope="col">Notiz</th>
                  <th scope="col">Geburtstag</th>
                  <th scope="col">Einladung</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr
                    key={z.id}
                    className={z.id === gewaehlt ? 'gaeste-zeile-aktiv' : undefined}
                    onClick={() => setGewaehlt(z.id)}
                  >
                    <td>
                      {/* Der Knopf trägt den zugänglichen Namen und den Fokus;
                          der Klick auf die Zeile ist die bequeme Zugabe, nicht
                          der einzige Weg. */}
                      <button
                        type="button"
                        className="gaeste-zeilenknopf"
                        aria-current={z.id === gewaehlt ? 'true' : undefined}
                      >
                        {anzeigeName(z)}
                      </button>
                      {/* Das abgeleitete Kürzel steht neben dem Namen, nicht in
                          einer eigenen Spalte: es IST der Name, nur kurz. So
                          lässt sich die Ableitung über alle Zeilen auf einen
                          Blick prüfen, statt 154-mal den Inspektor zu öffnen. */}
                      <span className="gaeste-kuerzel">{kuerzelVon(z)}</span>
                    </td>
                    <td>{z.begleitung || '—'}</td>
                    <td className="gaeste-notiz">{z.notiz || '—'}</td>
                    <td className="num">{alsDatum(z.geburtstag)}</td>
                    <td>
                      <span className="zentrale-pill">
                        {EINLADUNGSWEG_LABEL[einladungsweg(z)]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="gaeste-inspektor" aria-label="Kontaktdetails">
          {kontakt ? (
            <Details kontakt={kontakt} />
          ) : (
            <p className="zentrale-leer">Einen Kontakt wählen, um Details zu sehen.</p>
          )}
        </aside>
      </div>
    </>
  )
}

/**
 * Der Inspektor.
 *
 * Zeigt **auch die leeren Felder** — Telefon, Handy und Adresse stehen bei
 * allen 154 Zeilen auf `—`. In der Tabelle wären sie 154 leere Zellen und
 * damit ein Lineal; am einzelnen Kontakt sind sie die Auskunft „hier fehlt
 * etwas, und man könnte es eintragen".
 */
function Details({ kontakt }: { kontakt: Kontakt }) {
  const hinweis = einladungsHinweis(kontakt)
  return (
    <div className="gaeste-detail">
      <h2 className="gaeste-detail-name">{anzeigeName(kontakt)}</h2>

      <dl className="gaeste-felder">
        <Feld label="Kürzel" wert={kuerzelVon(kontakt)} />
        <Feld label="Begleitung" wert={kontakt.begleitung} />
        <Feld label="E-Mail" wert={kontakt.email} />
        <Feld label="Geburtstag" wert={alsDatum(kontakt.geburtstag)} />
        <Feld label="Telefon" wert={kontakt.telefon} />
        <Feld label="Handy" wert={kontakt.handy} />
        <Feld label="Adresse" wert={kontakt.adresse} />
        <Feld label="Notiz" wert={kontakt.notiz} />
      </dl>

      {/* Der Bildschirm sagt, WOFÜR der Kontakt unvollständig ist — er
          verweigert nichts (Konzept §4). Neutraler Ton, kein Alarmrot: eine
          fehlende Adresse ist kein Feldalarm (Zentrale-Konzept §2.6). */}
      {hinweis && <p className="gaeste-hinweis">{hinweis}</p>}
    </div>
  )
}

function Feld({ label, wert }: { label: string; wert: string | null }) {
  const text = (wert ?? '').trim()
  return (
    <>
      <dt>{label}</dt>
      <dd className={text ? undefined : 'gaeste-leer-feld'}>{text || '—'}</dd>
    </>
  )
}
