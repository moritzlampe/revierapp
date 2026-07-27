'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Punkt } from './revierkarte-map'
import {
  OBJEKT_TYPEN,
  pruefeObjekt,
  typLabel,
  unveraendert,
  type ObjektEntwurf,
} from './objekte'

/**
 * Die rechte Spalte im Kartenkasten: Objekte finden, ansehen, bearbeiten.
 *
 * Sie sitzt **innerhalb** von `.zentrale-karte-kasten` und damit innerhalb des
 * Vollbild-Ziels. Dadurch gilt sie in allen drei Kartengrößen — eingebettet,
 * Kinomodus, Vollbild — ohne Sonderfall. Ein Overlay hätte Objekte verdeckt, ein
 * Leaflet-Popup wäre für Formular und Foto zu klein, und eine Zeile unter der
 * Karte fehlte im Vollbild ganz.
 *
 * Keine Register: ob Liste oder Details zu sehen sind, sagt die Auswahl selbst.
 * Das ist ein Zustand weniger als ein Reiterpaar, das dasselbe noch einmal
 * ausdrückt.
 *
 * Bearbeiten ist ein ausdrücklicher Modus, kein Speichern beim Verlassen des
 * Feldes: drei Felder in einem Write, ein gemeinsames Abbrechen, eine
 * Fehlermeldung. Beim mobilen Muster (`handleDetailUpdate`) ist jedes Feld ein
 * eigener Write ohne gemeinsamen Rückweg.
 */
export default function ObjektInspektor({
  punkte,
  auswahlId,
  aufAuswahl,
  offen,
  aufSpeichern,
  aufModus,
}: {
  punkte: Punkt[]
  auswahlId: string | null
  aufAuswahl: (id: string | null) => void
  /** Darf in dieses Revier geschrieben werden (R3)? Sonst fehlt „Bearbeiten". */
  offen: boolean
  /** Schreibt und wirft bei Misserfolg — die Fehlermeldung landet im Formular. */
  aufSpeichern: (id: string, entwurf: ObjektEntwurf) => Promise<void>
  /**
   * Meldet nach oben, dass gerade ein Objekt bearbeitet wird. Die Karte sperrt
   * daraufhin Auswahl und Grenzen-Knopf — sonst hängt ein Klick daneben den
   * Inspektor aus und der Entwurf ist weg. Im schlimmsten Fall passiert das
   * während eines laufenden Writes: der Fehler landet dann in einer nicht mehr
   * sichtbaren Komponente, und es sieht aus wie ein Erfolg.
   */
  aufModus: (bearbeitet: boolean) => void
}) {
  const gewaehlt = punkte.find((p) => p.id === auswahlId) ?? null

  // Beim Zurückgehen soll der Fokus im Suchfeld landen, beim ersten Aufbau der
  // Seite aber NICHT — ein Suchfeld, das sich den Fokus beim Laden greift,
  // scrollt die Seite und schluckt Tastendrücke, die woanders hingehörten.
  // Gesetzt im Klick, nicht in einem Effekt: „ich komme aus den Details zurück"
  // ist eine Folge der Bedienung, kein abgeleiteter Zustand. Damit bleibt der
  // erste Seitenaufbau fokusfrei.
  const [zurueckGekommen, setZurueckGekommen] = useState(false)

  return (
    <aside className="zentrale-inspektor" aria-label="Kartenobjekte">
      {gewaehlt ? (
        <Details
          // Objektwechsel baut das Formular neu auf. Ohne den key trüge ein
          // angefangener Entwurf auf das nächste Objekt über — dieselbe Falle,
          // die beim Revierwechsel schon einmal zugeschlagen hat.
          key={gewaehlt.id}
          objekt={gewaehlt}
          offen={offen}
          aufZurueck={() => {
            setZurueckGekommen(true)
            aufAuswahl(null)
          }}
          aufSpeichern={aufSpeichern}
          aufModus={aufModus}
        />
      ) : (
        <Liste punkte={punkte} aufAuswahl={aufAuswahl} fokussieren={zurueckGekommen} />
      )}
    </aside>
  )
}

/**
 * Objektindex mit Suche.
 *
 * Braucht es, weil die Karte allein nicht reicht: Namen stehen erst ab Zoom 16
 * dauerhaft an den Punkten (sonst wären Söders 196 Beschriftungen ein
 * Schrifthaufen), und dicht beieinander liegende Objekte überdecken sich.
 *
 * ponytail: clientseitig gefiltert, ohne Virtualisierung. 203 Zeilen im
 * gesamten Bestand — eine Fensterung wäre mehr Code als Nutzen. Nachziehen,
 * wenn ein Revier vierstellig wird.
 */
function Liste({
  punkte,
  aufAuswahl,
  fokussieren,
}: {
  punkte: Punkt[]
  aufAuswahl: (id: string) => void
  /** Nur beim Zurückkommen aus den Details, nicht beim ersten Seitenaufbau. */
  fokussieren: boolean
}) {
  const [suche, setSuche] = useState('')
  const sucheRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (fokussieren) sucheRef.current?.focus()
  }, [fokussieren])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()
    const sortiert = [...punkte].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    if (!q) return sortiert
    // Auch über den ausgeschriebenen Typ suchen: wer „Drückjagdbock" tippt,
    // meint den Enum-Wert `drueckjagdstand` und soll ihn finden.
    return sortiert.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        typLabel(p.typ).toLowerCase().includes(q) ||
        p.typ.includes(q),
    )
  }, [punkte, suche])

  return (
    <>
      <div className="zentrale-inspektor-kopf">
        <h3>
          Objekte <span className="zahl">{punkte.length}</span>
        </h3>
        <input
          ref={sucheRef}
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suchen …"
          aria-label="Objekte durchsuchen"
        />
      </div>

      <div className="zentrale-inspektor-koerper">
        {punkte.length === 0 ? (
          <p className="zentrale-inspektor-leer">
            In diesem Revier ist kein Kartenobjekt hinterlegt.
          </p>
        ) : gefiltert.length === 0 ? (
          <p className="zentrale-inspektor-leer">Nichts gefunden zu „{suche.trim()}“.</p>
        ) : (
          <ul className="zentrale-inspektor-liste">
            {gefiltert.map((p) => (
              <li key={p.id}>
                {/* Ein echter Button, kein div mit onClick: damit sind die Zeilen
                    ohne eigenes Zutun mit Tab erreichbar und mit Enter bedienbar. */}
                <button type="button" onClick={() => aufAuswahl(p.id)}>
                  <span className="nam">{p.name}</span>
                  <span className="typ">{typLabel(p.typ)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function Details({
  objekt,
  offen,
  aufZurueck,
  aufSpeichern,
  aufModus,
}: {
  objekt: Punkt
  offen: boolean
  aufZurueck: () => void
  aufSpeichern: (id: string, entwurf: ObjektEntwurf) => Promise<void>
  aufModus: (bearbeitet: boolean) => void
}) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [entwurf, setEntwurf] = useState<ObjektEntwurf>({
    name: objekt.name,
    typ: objekt.typ,
    beschreibung: objekt.beschreibung ?? '',
  })
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const original = {
    name: objekt.name,
    type: objekt.typ,
    description: objekt.beschreibung,
  }

  // Nach oben melden, solange bearbeitet wird — und beim Aushängen zurücknehmen,
  // sonst bliebe die Karte gesperrt.
  useEffect(() => {
    aufModus(bearbeiten)
    return () => aufModus(false)
  }, [bearbeiten, aufModus])

  /**
   * Fokus mitführen. Ohne das hängt der Browser das gerade fokussierte Element
   * aus und der nächste Tabulator fängt wieder am Seitenanfang an — wer per
   * Tastatur arbeitet, verliert bei jedem Wechsel die Stelle.
   */
  const kopfRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!bearbeiten) kopfRef.current?.focus()
  }, [bearbeiten, objekt.id])

  const starten = () => {
    setEntwurf({
      name: objekt.name,
      typ: objekt.typ,
      beschreibung: objekt.beschreibung ?? '',
    })
    setFehler(null)
    setBearbeiten(true)
  }

  /** Abbrechen verwirft nur den Entwurf — das Objekt bleibt ausgewählt. */
  const abbrechen = () => {
    setFehler(null)
    setBearbeiten(false)
  }

  /**
   * Speichern. Dieselben drei Lehren wie beim Grenzen-Slice:
   * vorher prüfen statt der DB einen ungültigen Wert geben · bei Fehler bleibt
   * der **vollständige** Entwurf im Editiermodus stehen · während des Schreibens
   * sind die Felder gesperrt, damit eine Änderung nach dem Klick nicht
   * kommentarlos verschwindet.
   */
  const speichern = async () => {
    const problem = pruefeObjekt(entwurf)
    if (problem) {
      setFehler(problem)
      return
    }
    // Nichts geändert heißt nichts schreiben: Objekt-Writes sind
    // last-write-wins (E-R7), und `map_objects` hat keine `updated_at`-Spalte,
    // an der sich das absichern ließe. Der billigste Schutz ist der Write, den
    // es nicht gibt.
    if (unveraendert(entwurf, original)) {
      setBearbeiten(false)
      return
    }

    setLaeuft(true)
    setFehler(null)
    try {
      await aufSpeichern(objekt.id, entwurf)
      setBearbeiten(false)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <>
      <div className="zentrale-inspektor-kopf">
        {/* Beim Bearbeiten gesperrt: der Weg zurück führt sonst am Entwurf
            vorbei und verwirft ihn stillschweigend. „Abbrechen" ist der
            ausdrückliche Ausgang, und der steht direkt darunter. */}
        <button
          type="button"
          className="zurueck"
          onClick={aufZurueck}
          disabled={laeuft || bearbeiten}
        >
          ← Alle Objekte
        </button>
      </div>

      <div className="zentrale-inspektor-koerper">
        {bearbeiten ? (
          <div className="zentrale-inspektor-feld">
            <label htmlFor="objekt-name">Name</label>
            <input
              id="objekt-name"
              type="text"
              value={entwurf.name}
              onChange={(e) => setEntwurf((v) => ({ ...v, name: e.target.value }))}
              disabled={laeuft}
              autoFocus
            />

            <label htmlFor="objekt-typ">Typ</label>
            <select
              id="objekt-typ"
              value={entwurf.typ}
              onChange={(e) => setEntwurf((v) => ({ ...v, typ: e.target.value }))}
              disabled={laeuft}
            >
              {/* Trägt der Bestand einen Typ, den das Enum hier nicht kennt, wäre
                  er ohne diese Zeile beim Öffnen still auf den ersten Eintrag
                  gesprungen — und ein bloßes Speichern hätte ihn umgeschrieben. */}
              {!OBJEKT_TYPEN.some((t) => t.wert === entwurf.typ) && (
                <option value={entwurf.typ}>{entwurf.typ} (unbekannt)</option>
              )}
              {OBJEKT_TYPEN.map((t) => (
                <option key={t.wert} value={t.wert}>
                  {t.label}
                </option>
              ))}
            </select>

            <label htmlFor="objekt-notiz">Notiz</label>
            <textarea
              id="objekt-notiz"
              rows={4}
              value={entwurf.beschreibung}
              onChange={(e) => setEntwurf((v) => ({ ...v, beschreibung: e.target.value }))}
              disabled={laeuft}
              placeholder="z. B. Am Waldrand, 4 m"
            />
          </div>
        ) : (
          <>
            {/* tabIndex -1: nicht in der Tabulatorfolge, aber programmatisch
                fokussierbar, damit der Fokus nach dem Öffnen hier landet. */}
            <h3 className="zentrale-inspektor-name" ref={kopfRef} tabIndex={-1}>
              {objekt.name}
            </h3>
            <p className="zentrale-inspektor-typ">{typLabel(objekt.typ)}</p>

            {objekt.beschreibung ? (
              <p className="zentrale-inspektor-notiz">{objekt.beschreibung}</p>
            ) : (
              <p className="zentrale-inspektor-notiz leer">Keine Notiz.</p>
            )}

            {objekt.fotoUrl && (
              // Nur ansehen. Aufnehmen, Hochladen und Löschen von Fotos bleibt in
              // der Feld-App — das Portal hat weder Kamera noch den Grund dazu.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="zentrale-inspektor-foto"
                src={objekt.fotoUrl}
                alt={`Foto von ${objekt.name}`}
                loading="lazy"
              />
            )}

            <p className="zentrale-inspektor-koord">
              {objekt.lat.toFixed(5)}, {objekt.lng.toFixed(5)}
            </p>
          </>
        )}
      </div>

      {fehler && (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      )}

      {/* Nur zeigen, was jetzt geht: kein ausgegrauter Platzhalter für
          Positionieren (3b) oder Löschen (3c). */}
      {offen && (
        <div className="zentrale-inspektor-fuss">
          {bearbeiten ? (
            <>
              <button type="button" className="haupt" onClick={speichern} disabled={laeuft}>
                {laeuft ? 'Speichert …' : 'Änderungen speichern'}
              </button>
              <button type="button" onClick={abbrechen} disabled={laeuft}>
                Abbrechen
              </button>
            </>
          ) : (
            <button type="button" onClick={starten}>
              Bearbeiten
            </button>
          )}
        </div>
      )}
    </>
  )
}
