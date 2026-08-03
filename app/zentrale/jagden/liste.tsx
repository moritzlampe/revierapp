'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  beendet,
  filtere,
  jagdart,
  jagdstatus,
  laeuft,
  sortiere,
  termin,
  terminText,
  vorbereitbar,
  FILTER,
  KEINE_ZUSAGEN,
  type Filter,
  type Jagd,
  type Zusagen,
} from './jagden'

/**
 * Die Jagdliste — Stand 03.08.2026: **lesend**.
 *
 * Der Inspektor mit Termin, Einladungen und Rollen kommt als nächster Schritt
 * (Portal-Phase 4a). Diese Fassung steht allein, weil sie schon die Frage
 * beantwortet, für die man die Seite öffnet: was ist als Nächstes dran, und
 * wer hat zugesagt.
 *
 * **Alles im Speicher**, wie in der Gästeliste: 18 Jagden kommen als ein Rutsch
 * vom Server, Filtern passiert hier. Keine Blätterung — bei dieser Menge wäre
 * sie Aufwand ohne Wirkung.
 */
export default function Liste({
  jagden,
  zusagen,
  filter,
  revierId,
}: {
  jagden: Jagd[]
  /** Aus einer Map serialisiert — Server-Komponenten reichen keine Map durch. */
  zusagen: Record<string, Zusagen>
  filter: Filter
  revierId: string
}) {
  const router = useRouter()

  const sichtbare = useMemo(() => sortiere(filtere(jagden, filter)), [jagden, filter])

  const zaehler = useMemo(
    () => ({
      alle: jagden.length,
      offen: jagden.filter((j) => !beendet(j.status)).length,
      geplant: jagden.filter((j) => j.status === 'scheduled' || j.status === 'draft').length,
      beendet: jagden.filter((j) => beendet(j.status)).length,
    }),
    [jagden]
  )

  // Der Filterzustand gehört in die URL (Konzept §2.4) — ein geteilter Link
  // zeigt dieselbe Ansicht. `scroll: false`, damit die Liste stehen bleibt.
  const setzeFilter = (f: Filter) => {
    const ziel = f === 'alle' ? `?revier=${revierId}` : `?revier=${revierId}&filter=${f}`
    router.replace(`/zentrale/jagden${ziel}`, { scroll: false })
  }

  if (jagden.length === 0) {
    return (
      <div className="zentrale-note">
        <p style={{ margin: 0 }}>
          Für dieses Revier ist keine Jagd angelegt. Jagden entstehen in der
          Feld-App — dort auch die Wahl zwischen &bdquo;Sofort starten&ldquo;
          und &bdquo;Planen&ldquo;.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="jagden-filter" role="group" aria-label="Jagden filtern">
        {FILTER.map((f) => (
          <button
            key={f}
            type="button"
            className={`jagden-chip${f === filter ? ' ist-aktiv' : ''}`}
            aria-pressed={f === filter}
            onClick={() => setzeFilter(f)}
          >
            {f === 'alle' ? 'Alle' : f === 'offen' ? 'Offen' : f === 'geplant' ? 'Geplant' : 'Beendet'}
            <span className="jagden-chip-zahl">{zaehler[f]}</span>
          </button>
        ))}
      </div>

      {/* `zentrale-tabelle` trägt Rahmen, Kopfzeile und Zeilenhöhe für das
          ganze Portal — hier kommt nur dazu, was die Jagdliste eigenes hat. */}
      <div className="jagden-tabellenkasten">
        <table className="zentrale-tabelle jagden-tabelle">
          <thead>
            <tr>
              <th scope="col">Jagd</th>
              <th scope="col">Art</th>
              <th scope="col">Termin</th>
              <th scope="col">Status</th>
              <th scope="col">Zusagen</th>
            </tr>
          </thead>
          <tbody>
            {sichtbare.map((j) => {
              const z = zusagen[j.id] ?? KEINE_ZUSAGEN
              return (
                <tr key={j.id}>
                  <td>{j.name || 'Ohne Namen'}</td>
                  <td>{jagdart(j.type)}</td>
                  {/* Mono + tabular-nums: Datumsspalten sollen untereinander
                      fluchten (Konzept §2.2). */}
                  <td className="jagden-zahl">{terminText(termin(j))}</td>
                  <td>
                    <span
                      className={`jagden-pille${laeuft(j.status) ? ' ist-live' : ''}${
                        vorbereitbar(j.status) ? ' ist-offen' : ''
                      }`}
                    >
                      {jagdstatus(j.status)}
                    </span>
                    {/* Der read-only-Riegel aus Konzept §3, als Text statt als
                        fehlender Knopf: eine laufende Jagd gehört der Feld-App. */}
                    {laeuft(j.status) ? (
                      <span className="jagden-hinweis"> nur in der App</span>
                    ) : null}
                  </td>
                  <td className="jagden-zahl">
                    {z.zugesagt}
                    {z.offen > 0 ? <span className="jagden-offen"> +{z.offen} offen</span> : null}
                    {z.abgesagt > 0 ? (
                      <span className="jagden-abgesagt"> −{z.abgesagt} abgesagt</span>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {sichtbare.length === 0 ? (
        <p className="zentrale-sub" style={{ marginTop: '1rem' }}>
          Kein Treffer für diesen Filter.
        </p>
      ) : null}
    </>
  )
}
