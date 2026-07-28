'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Punkt } from './revierkarte-map'
import {
  OBJEKT_TYPEN,
  filterBaum,
  passtZurSuche,
  pruefeObjekt,
  toggleKategorie,
  toggleTyp,
  typLabel,
  unveraendert,
  type ObjektEntwurf,
  type Setzen,
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
  suche,
  aufSuchfeldFokus,
  ausgeklappt,
  setzen,
  aufPositionStarten,
  aufPositionSpeichern,
  aufAnlegen,
  aufSetzAbbrechen,
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
  /** Der Suchbegriff aus der Knopfleiste über der Karte — dort steht das Feld. */
  suche: string
  /**
   * Fokus zurück ins Suchfeld. Nur für den Weg aus den Details heraus: ohne das
   * hängt der Browser das gerade fokussierte Element aus und der nächste
   * Tabulator fängt wieder am Seitenanfang an.
   */
  aufSuchfeldFokus: () => void
  /**
   * Ausgeklappt. Der Schalter dafür sitzt in der Knopfleiste über der Karte,
   * nicht hier — dort bleibt er stehen, wenn die Spalte weg ist. Eingeklappt
   * wird sie nur verborgen, nicht ausgehängt, damit Auswahl und Legende das
   * Zuklappen überleben.
   */
  ausgeklappt: boolean
  /** Der Setzmodus (Schritt 3b) — der Zustand liegt in `revierkarte.tsx`. */
  setzen: Setzen | null
  aufPositionStarten: (id: string) => void
  /** Schreibt die Position und wirft bei Misserfolg — der Entwurf bleibt dann. */
  aufPositionSpeichern: () => Promise<void>
  /** Legt das Objekt an und wirft bei Misserfolg — der Entwurf bleibt dann. */
  aufAnlegen: (entwurf: ObjektEntwurf) => Promise<void>
  aufSetzAbbrechen: () => void
}) {
  const gewaehlt = punkte.find((p) => p.id === auswahlId) ?? null

  return (
    <aside
      id="zentrale-inspektor"
      className={`zentrale-inspektor${ausgeklappt ? '' : ' zu'}`}
      aria-label="Kartenobjekte"
    >
      {/* Anlegen gewinnt vor der Auswahl: der Modus setzt sie ohnehin zurück,
          und wäre beides zugleich möglich, stünden zwei Entwürfe offen. */}
      {setzen?.art === 'neu' ? (
        <NeuFormular
          kandidat={setzen.kandidat}
          aufAnlegen={aufAnlegen}
          aufAbbrechen={aufSetzAbbrechen}
        />
      ) : gewaehlt ? (
        <Details
          // Objektwechsel baut das Formular neu auf. Ohne den key trüge ein
          // angefangener Entwurf auf das nächste Objekt über — dieselbe Falle,
          // die beim Revierwechsel schon einmal zugeschlagen hat.
          key={gewaehlt.id}
          objekt={gewaehlt}
          offen={offen}
          aufZurueck={() => {
            aufSuchfeldFokus()
            aufAuswahl(null)
          }}
          aufSpeichern={aufSpeichern}
          aufModus={aufModus}
          // Nur der eigene Positionsmodus zählt: gehörte er zu einem anderen
          // Objekt, zeigte dieses hier sonst ein Feld, das nicht zu ihm gehört.
          positioniert={
            setzen?.art === 'position' && setzen.id === gewaehlt.id ? setzen : null
          }
          aufPositionStarten={aufPositionStarten}
          aufPositionSpeichern={aufPositionSpeichern}
          aufSetzAbbrechen={aufSetzAbbrechen}
        />
      ) : (
        <Liste punkte={punkte} aufAuswahl={aufAuswahl} suche={suche} />
      )}
    </aside>
  )
}

/**
 * Die drei Felder, die ein Objekt ausmachen — einmal für Bearbeiten UND Anlegen.
 *
 * Vorher standen sie nur im Bearbeiten-Zweig. Sie für das Anlegen zu kopieren
 * hieße, die nächste Änderung an zwei Stellen machen zu müssen — und genau davon
 * hat dieses Repo schon fünf Kopien der Typliste.
 *
 * Die Typauswahl kennt zwei Sonderzeilen, und beide leiten sich aus dem Wert ab
 * statt aus einem Schalter:
 * - **leer** → „Bitte wählen": nur beim Anlegen erreichbar. Ein stiller Start
 *   auf „Hochsitz" würde falsch eingeordnete Objekte erzeugen, die niemand mehr
 *   findet, weil sie in der Legende unter der falschen Kategorie stehen.
 * - **unbekannt** → roh anzeigen: trägt der Bestand einen Typ, den das Enum hier
 *   nicht kennt, wäre er ohne die Zeile beim Öffnen still auf den ersten Eintrag
 *   gesprungen — und ein bloßes Speichern hätte ihn umgeschrieben.
 */
function Felder({
  entwurf,
  setEntwurf,
  gesperrt,
  fokus,
}: {
  entwurf: ObjektEntwurf
  setEntwurf: (fort: (v: ObjektEntwurf) => ObjektEntwurf) => void
  gesperrt: boolean
  fokus: boolean
}) {
  return (
    <div className="zentrale-inspektor-feld">
      <label htmlFor="objekt-name">Name</label>
      <input
        id="objekt-name"
        type="text"
        value={entwurf.name}
        onChange={(e) => setEntwurf((v) => ({ ...v, name: e.target.value }))}
        disabled={gesperrt}
        autoFocus={fokus}
      />

      <label htmlFor="objekt-typ">Typ</label>
      <select
        id="objekt-typ"
        value={entwurf.typ}
        onChange={(e) => setEntwurf((v) => ({ ...v, typ: e.target.value }))}
        disabled={gesperrt}
      >
        {!entwurf.typ && <option value="">Bitte wählen …</option>}
        {!!entwurf.typ && !OBJEKT_TYPEN.some((t) => t.wert === entwurf.typ) && (
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
        disabled={gesperrt}
        placeholder="z. B. Am Waldrand, 4 m"
      />
    </div>
  )
}

/**
 * Ein neues Objekt anlegen.
 *
 * **Kein Assistent in zwei Schritten**, obwohl `position` NOT NULL ist: Formular
 * und Positionsstand stehen von Anfang an beide da, und „Objekt anlegen" bleibt
 * gesperrt, bis in die Karte geklickt wurde. Das erzwingt dieselbe Bedingung wie
 * eine Schrittfolge, lässt aber offen, ob man zuerst tippt oder zuerst klickt —
 * und es kostet keinen zweiten Bildschirm für einen Zustand, in dem nichts
 * anderes zu tun ist als zu klicken.
 *
 * Die Position steht bewusst OBEN: sie ist das Einzige, was hier fehlen kann.
 */
function NeuFormular({
  kandidat,
  aufAnlegen,
  aufAbbrechen,
}: {
  kandidat: { lat: number; lng: number } | null
  aufAnlegen: (entwurf: ObjektEntwurf) => Promise<void>
  aufAbbrechen: () => void
}) {
  const [entwurf, setEntwurf] = useState<ObjektEntwurf>({
    name: '',
    typ: '',
    beschreibung: '',
  })
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const anlegen = async () => {
    const problem = pruefeObjekt(entwurf)
    if (problem) {
      setFehler(problem)
      return
    }
    if (!kandidat) {
      setFehler('Es ist noch keine Position gesetzt. In die Karte klicken.')
      return
    }

    setLaeuft(true)
    setFehler(null)
    try {
      await aufAnlegen(entwurf)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Anlegen.')
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <>
      <div className="zentrale-inspektor-kopf">
        <h3>Neues Objekt</h3>
      </div>

      <div className="zentrale-inspektor-koerper">
        <p className={`zentrale-inspektor-koord${kandidat ? '' : ' leer'}`}>
          {kandidat
            ? `${kandidat.lat.toFixed(5)}, ${kandidat.lng.toFixed(5)}`
            : 'Position: in die Karte klicken'}
        </p>

        <Felder
          entwurf={entwurf}
          setEntwurf={setEntwurf}
          gesperrt={laeuft}
          // Kein Autofokus: der erste Schritt ist der Kartenklick, und ein Feld,
          // das den Fokus greift, sähe aus als wäre das Tippen gemeint.
          fokus={false}
        />
      </div>

      {fehler && (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      )}

      <div className="zentrale-inspektor-fuss">
        <button
          type="button"
          className="haupt"
          onClick={anlegen}
          disabled={laeuft || !kandidat}
        >
          {laeuft ? 'Legt an …' : 'Objekt anlegen'}
        </button>
        <button type="button" onClick={aufAbbrechen} disabled={laeuft}>
          Abbrechen
        </button>
      </div>
    </>
  )
}

/**
 * Objektindex mit Suche und Legende.
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
  suche,
}: {
  punkte: Punkt[]
  aufAuswahl: (id: string) => void
  /** Kommt von oben: das Feld steht außerhalb der Spalte. */
  suche: string
}) {
  /**
   * Die abgewählten Typen — dieselbe Bauart wie die Legende der Feld-App.
   *
   * Als Menge des Versteckten, nicht des Gezeigten: leer heißt „alles", und das
   * ist der Startzustand, ohne ihn aufzählen zu müssen. Nebenbei fällt damit ein
   * ganzer Fehlerfall weg — ein abgewählter Typ, den es nach einer Änderung gar
   * nicht mehr gibt, ist einfach folgenlos.
   *
   * Die Suche allein reichte nicht: sie filtert zwar schon über den
   * ausgeschriebenen Typ, aber man muss wissen, wie er heißt. Die Legende zeigt,
   * **was es überhaupt gibt** — bei Söders 196 Objekten ist das der eigentliche
   * Gewinn, nicht das Filtern. Und anders als eine Einfachauswahl kann sie
   * „Stände und Wildkameras, sonst nichts".
   */
  const [versteckt, setVersteckt] = useState<ReadonlySet<string>>(() => new Set())

  const baum = useMemo(() => filterBaum(punkte.map((p) => p.typ)), [punkte])
  const typenGesamt = baum.reduce((s, k) => s + k.eintraege.length, 0)

  /** Was die Legende übrig lässt — ohne die Suche, die eine eigene Frage ist. */
  const nachLegende = useMemo(
    () => punkte.filter((p) => !versteckt.has(p.typ)),
    [punkte, versteckt],
  )

  const suchbegriff = suche.trim().toLowerCase()

  const gefiltert = useMemo(() => {
    const sortiert = [...nachLegende].sort((a, b) => a.name.localeCompare(b.name, 'de'))
    return suchbegriff ? sortiert.filter((p) => passtZurSuche(p.name, p.typ, suchbegriff)) : sortiert
  }, [nachLegende, suchbegriff])

  /**
   * Trifft die Suche etwas, das die Legende gerade wegblendet? Nur dafür wird
   * am Legendenfilter vorbei gezählt: sonst stünde „Nichts gefunden zu
   * ‚Kanzel'" da, während zwölf Kanzeln bloß abgehakt sind — eine Meldung, die
   * den Nutzer in der Suche suchen lässt, obwohl die Ursache oben steht.
   */
  const versteckteTreffer = suchbegriff
    ? punkte.filter((p) => versteckt.has(p.typ) && passtZurSuche(p.name, p.typ, suchbegriff)).length
    : 0

  return (
    <>
      <div className="zentrale-inspektor-kopf">
        <h3>
          {/* Die Zahl der Zeilen, die wirklich dastehen. Der Gesamtbestand steht
              im Dropdown darunter, sobald „Alle Objekte" gewählt ist. */}
          Objekte <span className="zahl">{gefiltert.length}</span>
        </h3>
        {/* Die Legende, zweistufig wie in der Feld-App: die Kategoriezeile
            schaltet alles darunter, die Typzeilen einzeln.

            Echte `<input type="checkbox">` in `<label>`, kein nachgebautes
            Kästchen: Tastatur, Vorlesen und der gemischte Zustand kommen vom
            Browser. `indeterminate` ist nur als DOM-Eigenschaft zu haben, nicht
            als Attribut — daher die Callback-Ref. Der Browser meldet daraufhin
            von selbst `aria-checked="mixed"`. */}
        {/* Wann es die Legende gibt.
            `baum.length > 1` war zweimal falsch (Codex, 28.07.2026): ein Revier
            mit Hochsitzen UND Kanzeln hat nur eine Kategorie und bekam trotzdem
            keinen Filter. Schlimmer: schrumpft der Bestand auf eine Kategorie,
            während etwas abgewählt ist, verschwand die Legende samt dem einzigen
            Weg, es wieder einzuschalten. Deshalb zählt sie Typen, nicht
            Kategorien — und sie bleibt in jedem Fall stehen, solange etwas
            versteckt ist. */}
        {(typenGesamt > 1 || versteckt.size > 0) && (
          <details className="zentrale-inspektor-legende">
            {/* Zugeklappt der Normalfall: die Legende ist ein Werkzeug, das man
                holt, einstellt und weglegt — nicht etwas, das dauerhaft die
                halbe Spalte belegt. Die Zusammenfassung sagt deshalb im
                zugeklappten Zustand, ob gerade gefiltert wird; sonst müsste man
                aufklappen, nur um zu sehen, dass alles an ist. */}
            {/* Gemessen an dem, was die Legende WIRKLICH wegblendet, nicht an
                `versteckt.size`: ein abgewählter Typ, den es im Bestand nicht
                mehr gibt, hätte sonst dauerhaft „Auswahl 196 / 196" erzeugt.
                Und ohne die Suche, die eine eigene Frage stellt. */}
            <summary>
              {nachLegende.length === punkte.length ? (
                <>
                  Alle Objekte <span className="zahl">{punkte.length}</span>
                </>
              ) : (
                <>
                  Auswahl{' '}
                  <span className="zahl">
                    {nachLegende.length} / {punkte.length}
                  </span>
                </>
              )}
            </summary>

            {baum.map((k) => {
              const werte = k.eintraege.map((e) => e.wert)
              const aus = werte.filter((w) => versteckt.has(w)).length
              const halb = aus > 0 && aus < werte.length
              return (
                <div key={k.key} className="gruppe">
                  <label className="kat">
                    <input
                      type="checkbox"
                      checked={aus < werte.length}
                      ref={(el) => {
                        if (el) el.indeterminate = halb
                      }}
                      onChange={() => setVersteckt((v) => toggleKategorie(v, werte))}
                    />
                    <span className="nam">{k.label}</span>
                    <span className="zahl">{k.anzahl}</span>
                  </label>

                  {/* Eine Kategorie mit nur einem vorkommenden Typ bekommt keine
                      zweite, wortgleiche Zeile — die Kopfzeile ist dort schon
                      der Typ. */}
                  {k.eintraege.length > 1 &&
                    k.eintraege.map((e) => (
                      <label key={e.wert} className="typ">
                        <input
                          type="checkbox"
                          checked={!versteckt.has(e.wert)}
                          onChange={() => setVersteckt((v) => toggleTyp(v, e.wert))}
                        />
                        <span className="nam">{e.label}</span>
                        <span className="zahl">{e.anzahl}</span>
                      </label>
                    ))}
                </div>
              )
            })}
          </details>
        )}
      </div>

      <div className="zentrale-inspektor-koerper">
        {punkte.length === 0 ? (
          <p className="zentrale-inspektor-leer">
            In diesem Revier ist kein Kartenobjekt hinterlegt.
          </p>
        ) : gefiltert.length === 0 ? (
          // Drei Fälle, weil es drei Ursachen gibt. Der mittlere ist der, den
          // Codex gefunden hat: die Suche trifft etwas, die Legende blendet es
          // weg — „nichts gefunden" wäre dann eine Lüge, die den Nutzer in der
          // Suche suchen lässt, während die Ursache oben steht.
          <p className="zentrale-inspektor-leer">
            {!suchbegriff
              ? 'Alle Kategorien sind abgewählt.'
              : versteckteTreffer > 0
                ? `Zu „${suche.trim()}“ ist ${versteckteTreffer === 1 ? 'ein Treffer' : `sind ${versteckteTreffer} Treffer`} über die Legende ausgeblendet.`
                : `Nichts gefunden zu „${suche.trim()}“.`}
          </p>
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
  positioniert,
  aufPositionStarten,
  aufPositionSpeichern,
  aufSetzAbbrechen,
}: {
  objekt: Punkt
  offen: boolean
  aufZurueck: () => void
  aufSpeichern: (id: string, entwurf: ObjektEntwurf) => Promise<void>
  aufModus: (bearbeitet: boolean) => void
  /** Gesetzt, solange DIESES Objekt verschoben wird. */
  positioniert: { kandidat: { lat: number; lng: number } | null } | null
  aufPositionStarten: (id: string) => void
  aufPositionSpeichern: () => Promise<void>
  aufSetzAbbrechen: () => void
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
   * Die Position schreiben. Der Write selbst liegt oben — hier bleibt nur, den
   * Fehler dorthin zu bringen, wo der Nutzer ihn sieht, und den Modus dabei
   * stehen zu lassen (Backlog E-R2: ein gescheiterter Write darf den Entwurf
   * nicht mitnehmen).
   */
  const positionSichern = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await aufPositionSpeichern()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      setLaeuft(false)
    }
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
            ausdrückliche Ausgang, und der steht direkt darunter. Beim
            Verschieben aus demselben Grund — dort ist der Entwurf die
            ungespeicherte Position. */}
        <button
          type="button"
          className="zurueck"
          onClick={aufZurueck}
          disabled={laeuft || bearbeiten || !!positioniert}
        >
          ← Alle Objekte
        </button>
      </div>

      <div className="zentrale-inspektor-koerper">
        {bearbeiten ? (
          <Felder entwurf={entwurf} setEntwurf={setEntwurf} gesperrt={laeuft} fokus />
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

            {/* Beim Verschieben stehen beide Orte da, alt durchgestrichen.
                Nur den neuen zu zeigen hieße, dass „Abbrechen" ins Dunkle
                führt — man wüsste nicht mehr, wohin es zurückgeht. */}
            <p className="zentrale-inspektor-koord">
              {positioniert?.kandidat ? (
                <>
                  <s>
                    {objekt.lat.toFixed(5)}, {objekt.lng.toFixed(5)}
                  </s>{' '}
                  → {positioniert.kandidat.lat.toFixed(5)},{' '}
                  {positioniert.kandidat.lng.toFixed(5)}
                </>
              ) : (
                <>
                  {objekt.lat.toFixed(5)}, {objekt.lng.toFixed(5)}
                </>
              )}
            </p>

            {positioniert && !positioniert.kandidat && (
              <p className="zentrale-inspektor-notiz leer">
                In die Karte klicken setzt die neue Position.
              </p>
            )}
          </>
        )}
      </div>

      {fehler && (
        <p className="zentrale-inspektor-fehler" role="alert">
          {fehler}
        </p>
      )}

      {/* Nur zeigen, was jetzt geht: kein ausgegrauter Platzhalter für
          Löschen (3c). Drei Zustände, weil es drei Aufgaben sind — und nie zwei
          davon gleichzeitig, dafür sorgt der Setzzustand in `revierkarte.tsx`. */}
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
          ) : positioniert ? (
            <>
              <button
                type="button"
                className="haupt"
                onClick={positionSichern}
                // Ohne Kandidat gibt es nichts zu speichern. `position` ist
                // NOT NULL — ein leerer Write wäre kein „unverändert", sondern
                // ein Constraint-Fehler.
                disabled={laeuft || !positioniert.kandidat}
              >
                {laeuft ? 'Speichert …' : 'Position speichern'}
              </button>
              <button type="button" onClick={aufSetzAbbrechen} disabled={laeuft}>
                Abbrechen
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={starten}>
                Bearbeiten
              </button>
              <button type="button" onClick={() => aufPositionStarten(objekt.id)}>
                Position ändern
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
