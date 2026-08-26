'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Punkt, PunktPruefung } from './revierkarte-map'
import Papierkorb from './papierkorb'
import StorageImg from '@/components/photo/StorageImg'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { KontoName } from '@/lib/konto-namen'
import { istWartbar, zustandsSatz, type PruefStatus } from '@/lib/revier/wartung'
import { schreibe } from './schreiben'
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
  revierId,
  punkte,
  auswahlId,
  aufAuswahl,
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
  aufLoeschen,
}: {
  /** Nur für den Papierkorb am Fuß der Liste — er lädt sich selbst. */
  revierId: string
  punkte: Punkt[]
  auswahlId: string | null
  aufAuswahl: (id: string | null) => void
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
  /** Löscht und wirft bei Misserfolg — die Rückfrage bleibt dann stehen. */
  aufLoeschen: (id: string) => Promise<void>
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
          aufLoeschen={aufLoeschen}
        />
      ) : (
        <Liste revierId={revierId} punkte={punkte} aufAuswahl={aufAuswahl} suche={suche} />
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
  revierId,
  punkte,
  aufAuswahl,
  suche,
}: {
  revierId: string
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

      {/* Unter der Liste, nicht darin: der Papierkorb ist genau die Antwort auf
          „hier fehlt etwas", und die Frage stellt sich am Ende der Liste. Er
          steht außerhalb des scrollenden Körpers, damit er bei Söders 196
          Objekten nicht erst am Ende eines langen Scrollwegs auftaucht. */}
      <Papierkorb revierId={revierId} />
    </>
  )
}

/**
 * Welche Objekte gerade eine Prüfung schreiben — **modulweit, nicht je
 * Komponenteninstanz.**
 *
 * **Ein Fix aus der Fremdprüfung** (25.08.2026, `[hoch]`): der Riegel lag
 * zuerst als `useRef` in der Komponente. `Details` trägt aber `key={id}` und
 * wird beim Objektwechsel neu aufgebaut — wer während eines langsamen Writes
 * von Stand A zu B und zurück zu A klickt, bekommt eine frische Instanz mit
 * frischem Ref und kann ein zweites Mal auslösen. `map_object_checks` hat
 * keine DELETE-Policy; das Duplikat bliebe für immer stehen.
 *
 * Ein `Set` auf Modulebene überlebt den Neuaufbau, weil es nicht zur
 * Komponente gehört. Es lebt so lange wie die Seite — nach einem Reload ist es
 * leer, und das ist richtig: ein Write, der einen Reload überdauert hat, ist
 * ohnehin abgeschlossen oder verloren.
 *
 * **Was das NICHT löst, und es lässt sich hier nicht lösen:** geht die Antwort
 * auf einen bereits durchgelaufenen Insert verloren (Timeout, Verbindung weg),
 * legt ein erneuter Versuch eine zweite Zeile an. Dagegen hülfe nur eine
 * Idempotenz-Kennung in der Tabelle, und die gibt es nicht — das wäre eine
 * Migration. Der Schaden wäre zwei identische Prüfzeilen mit fast gleichem
 * Zeitstempel: die Anzeige stimmt weiterhin, die Historie hat eine Zeile zu
 * viel. Benannt statt behauptet.
 */
const schreibtGerade = new Set<string>()

/**
 * Zählt die SPEICHERVORGÄNGE dieser Seitensitzung — nicht die Renders.
 *
 * Modulweit, damit der Zähler den Neuaufbau der Komponente beim Objektwechsel
 * überlebt; einer, der bei jedem Klick wieder bei null anfinge, wäre keiner.
 *
 * **Was er leistet:** zwei Nachträge desselben Menschen für denselben Tag
 * bekommen verschiedene Zeitstempel, und der spätere ist der jüngere. Das ist
 * der Fall, um den es geht — eine Korrektur muss den Eintrag überholen, den sie
 * korrigiert.
 *
 * **Was er nicht leistet:** zwei Menschen, die im selben Moment für denselben
 * Stand denselben Tag nachtragen, und mehr als 60 Nachträge je Sitzung. Dagegen
 * hilft nur eine Ordnung in der Datenbank. Dafür steht die Warnung
 * `wirdUeberholt` — **der Riegel ist die Warnung, der Zähler die
 * Wahrscheinlichkeitssenkung.**
 */
let nachtragZaehler = 0

/** Der nächste Versatz, in Millisekunden. Nur aus dem Speicherpfad rufen. */
function naechsterVersatz(): number {
  return (nachtragZaehler++ % 60) * 1000
}

/**
 * Der früheste eintragbare Prüftag.
 *
 * **Gegen den Zahlendreher im Jahr** (Schlusslesung 25.08.2026, F3): `0202`
 * statt `2026` besteht jede andere Prüfung — es ist kein Zukunftsdatum und
 * formatgültig — und wäre eine für immer unlöschbare Unsinnszeile in einem Log
 * ohne DELETE-Policy.
 *
 * 2000 statt eines echten Reviergründungsdatums, weil es ein solches nicht gibt
 * und eine erfundene Zahl schlechter wäre als eine offensichtlich großzügige.
 * Die Grenze soll Tippfehler fangen, nicht Geschichte abschneiden.
 */
const FRUEHESTER_PRUEFTAG = '2000-01-01'

/** Die drei Zustände zur Wahl, in der Reihenfolge der Feld-App. */
const ZUSTAND_WAHL: readonly { wert: PruefStatus; label: string }[] = [
  { wert: 'ok', label: 'Geprüft, alles heil' },
  { wert: 'mangel', label: 'Mangel' },
  { wert: 'gesperrt', label: 'Gesperrt — nicht besetzen' },
]

/**
 * Heute als `YYYY-MM-DD` **in Berliner Zeit**, für das Datumsfeld.
 *
 * Nicht `new Date().toISOString().slice(0,10)` — das ist der UTC-Tag, und um
 * 00:30 Berliner Zeit ist das der Vortag. Die Falle ist in diesem Repo schon
 * zweimal bezahlt worden (`kontakte.inaktiv_seit`, `heuteUtc` in `scheine.ts`).
 * `en-CA` liefert `YYYY-MM-DD`, das Format, das `<input type="date">` erwartet.
 */
function heuteBerlin(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/**
 * Aus dem gewählten Tag den Zeitpunkt, der in die Datenbank geht.
 *
 * **Heute → jetzt, ein früherer Tag → 12:00 Berliner Zeit.** Beides hat einen
 * Grund:
 *
 * - **Heute die echte Uhrzeit**, weil zwei Prüfungen am selben Tag sonst
 *   denselben Zeitstempel trügen. Die View aus 117 entscheidet dann per `id`,
 *   welche gewinnt — das ist eine totale Ordnung, aber keine, die dem
 *   entspricht, was der Mensch getan hat.
 * - **Rückdatiert Mittag**, nicht Mitternacht. Um 00:00 kippt der Kalendertag
 *   je nach Zeitzone des Betrachters; 12:00 ist von jeder europäischen
 *   Zeitzone aus derselbe Tag. Die Uhrzeit ist ohnehin erfunden — niemand
 *   weiß mehr, ob es halb neun oder halb elf war —, also wird sie so gewählt,
 *   dass sie das Datum nicht verfälscht.
 *
 * Der Offset kommt aus `Intl`, nicht aus einer eigenen Rechnung: Sommerzeit
 * wäre sonst von Hand nachzuhalten, und der Umstellungstag hat 25 Stunden.
 */
function zeitpunktAus(tag: string, versatzMs: number): Date | null {
  if (tag === heuteBerlin()) return new Date()
  return rueckdatierterZeitpunkt(tag, versatzMs)
}

/**
 * Mittag Berlin eines VERGANGENEN Tages, plus Versatz.
 *
 * **Herausgelöst am 26.08.2026** (Fremdprüfung E2/E6, `[mittel]`), damit der
 * Speicherpfad die Heute-Frage **genau einmal** stellen kann. `zeitpunktAus()`
 * beantwortet sie intern noch einmal; solange beide Antworten in denselben Wert
 * mündeten, war das harmlos. Seit CN-85 entscheidet sie aber, ob `checked_at`
 * überhaupt mitgeht — und **zwei getrennte Uhrablesungen können über Mitternacht
 * auseinanderfallen**: `istHeute` noch wahr, `zeitpunktAus()` schon im
 * Rückdatierungszweig. Dann verwirft der Spread einen korrekt berechneten
 * Zeitpunkt, und die Datenbank schreibt den NEUEN Tag in ein Log, aus dem
 * niemand ihn wieder herausbekommt.
 *
 * **Der alte Code hatte diesen Fall richtig**, ohne es zu wissen: er schrieb
 * einfach, was `zeitpunktAus()` lieferte. Die Verschlechterung kam mit CN-85 —
 * ein Fix, der einen Randfall aufreißt, den er nicht angefasst hat.
 */
function rueckdatierterZeitpunkt(tag: string, versatzMs: number): Date | null {

  // **`null` statt eines Ersatzzeitpunkts, und das ist ein Fix aus der
  // Fremdprüfung** (25.08.2026, `[hoch]`). Die erste Fassung gab bei einem
  // leeren oder unlesbaren Feld `new Date()` zurück — „lieber jetzt als ein
  // Invalid Date". Das war falsch: das Datumsfeld lässt sich leeren, und dann
  // hätte ein Klick den AKTUELLEN Zeitpunkt in ein Log ohne DELETE-Policy
  // geschrieben, obwohl niemand einen Prüftag gewählt hat. **Eine Funktion,
  // die einen fehlenden Wert durch einen plausiblen ersetzt, macht aus einer
  // Lücke eine Behauptung.**
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) return null
  const mittagUtc = new Date(`${tag}T12:00:00Z`)
  if (Number.isNaN(mittagUtc.getTime())) return null

  // Wie viel Uhr ist es in Berlin, wenn es 12:00 UTC ist? Die Differenz IST
  // der Offset dieses Tages — im Sommer 2, im Winter 1.
  const stundeInBerlin = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      hour12: false,
    }).format(mittagUtc)
  )
  const offset = stundeInBerlin - 12
  const mittagBerlin = mittagUtc.getTime() - offset * 3600_000

  /**
   * **Plus `versatzMs`, das der AUFRUFER bestimmt** — und genau darin lag der
   * dritte Anlauf.
   *
   * Das Problem, gegen das der Versatz gebaut ist: zwei Nachträge für denselben
   * Tag bekämen sonst exakt denselben Zeitstempel. Die View aus 117 löst den
   * Gleichstand über `id` auf, und das ist eine UUID — eine totale, aber
   * **zufällige** Ordnung. Wer eine Sperre nachträgt, nachdem für denselben Tag
   * schon „ok" steht, hätte einen Münzwurf um die Sichtbarkeit der Sperre.
   *
   * **Zwei Fassungen davor waren falsch, beide von einer Gegenprobe widerlegt:**
   *
   * 1. *Sekunden und Millisekunden der Uhr.* Zwei Aufrufe in derselben
   *    Millisekunde ergaben denselben Wert — der Versatz senkte die
   *    Wahrscheinlichkeit und garantierte nichts, während der Kommentar
   *    „eindeutig" behauptete.
   * 2. *Ein Zähler, der IN dieser Funktion hochlief.* Die Funktion wird auch
   *    beim Rendern aufgerufen (für `wirdUeberholt`) — der Zähler wurde also
   *    von Tastendrücken verbraucht, nicht von Nachträgen. Mit `% 60` wickelt
   *    er dann um, und die Folge war schlimmer als das Ausgangsproblem: eine
   *    Korrektur konnte einen **älteren** Zeitstempel bekommen als der Eintrag,
   *    den sie korrigiert — nicht fifty-fifty, sondern verlässlich falsch
   *    (Schlusslesung 25.08.2026, F1).
   *
   * **Deshalb ist die Funktion jetzt nebenwirkungsfrei.** Sie rechnet nur; wer
   * zählt, ist der Speicherpfad (`naechsterVersatz()`). Der Render übergibt 0
   * und bekommt einen stabilen Vergleichswert.
   *
   * Der Versatz bleibt unter 60 Sekunden und damit weit innerhalb des
   * Kalendertags — auch an den Umstellungstagen. **Sichtbar ändert sich
   * nichts:** die Anzeige formatiert auf Minuten, es steht weiter „12:00".
   */
  return new Date(mittagBerlin + versatzMs)
}

/** Eine Zeile der Prüfhistorie — die rohe Tabelle, nicht die View aus 117. */
type HistorieZeile = {
  id: string
  status: string
  checked_at: string
  note: string | null
  checked_by: string
}

/**
 * Wie viele Prüfungen der Aufklapper zeigt.
 *
 * Ein Deckel, weil PostgREST bei 1000 Zeilen ohnehin einen setzt — und ein
 * stiller ist schlimmer als ein genannter. 50 ist reichlich für ein Bauwerk,
 * das ein- bis zweimal je Saison angesehen wird; wer mehr braucht, braucht eine
 * Auswertung und keine Liste.
 *
 * ponytail: nach Augenmaß gesetzt. Bestand am 25.08.2026 sind 4 Prüfzeilen im
 * ganzen Projekt — jede Zahl hier ist geraten, aber der Hinweis darunter macht
 * das Raten sichtbar statt still.
 */
const HISTORIE_MAX = 50

/**
 * „3. Nov. 2025, 14:12" — Datum plus Uhrzeit, weil an einem Tag zweimal geprüft
 * werden kann und die Reihenfolge dann sonst unbelegt bliebe.
 *
 * **Fest auf Berlin, wie `datumZeit` in `page.tsx` und `alsBerlinDatum` in
 * `scheine.ts`** (Schlusslesung 25.08.2026, Finding 3 — hier hatte es zuerst
 * gefehlt). `checked_at` ist ein UTC-`timestamptz`; ohne die Zeitzone liefe die
 * Anzeige in der des Betrachters, und dieselbe Prüfung stünde in der Agenda auf
 * einem anderen Tag als im Inspektor. Ein Revier liegt in einer Zeitzone, und
 * die Frage „war das vor der Drückjagd?" wird in Ortszeit gestellt.
 */
const zeitpunkt = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})

/**
 * Ein Wort je Status für die Historie.
 *
 * Kürzer als die Zustandszeile darüber, weil in einer Liste die Spalte den
 * Zusammenhang trägt — „Gesperrt — nicht besetzen" wäre dort neun Mal
 * untereinander dieselbe Ermahnung. Unbekannte Werte kommen roh durch, wie bei
 * `typLabel`: käme ein vierter Status aus einer Migration, soll die Zeile ihn
 * anzeigen und nicht verschweigen.
 */
const STATUS_WORT: Record<string, string> = {
  ok: 'Geprüft',
  mangel: 'Mangel',
  gesperrt: 'Gesperrt',
}

/**
 * „3. Nov. 2025, 14:12 von Moritz" — der Zeitteil der Zustandszeile.
 *
 * **Der Name fällt weg, statt „von Unbekannt" zu schreiben.** Ein Prüfer,
 * dessen Konto es nicht mehr gibt, steht nicht in `konto_namen()`; die Prüfung
 * hat trotzdem stattgefunden, und der Zeitpunkt ist die Auskunft, auf die es
 * ankommt.
 */
function wannUndWer(p: PunktPruefung): string {
  const wann = zeitpunkt.format(new Date(p.checkedAt))
  return p.prueferName === null ? wann : `${wann} von ${p.prueferName}`
}

/**
 * Einen Prüfstand eintragen — **am PC, nachträglich.**
 *
 * **Warum das Portal das überhaupt kann, obwohl das Konzept ihm nur
 * „überblicken und nachlesen" gibt** (§4.2): Moritz am 25.08.2026 — *„wenn
 * jetzt jemand im Wald die Hochsitze prüft aber das am PC danach eintragen
 * will?"* Der Fall stand in keinem Abschnitt. §4.1 erfasst in der Feld-App,
 * §4.4 später mobil in der PWA; der Mensch mit dem Zettel, der abends am
 * Schreibtisch sitzt, kam nicht vor.
 *
 * **Keine Migration nötig:** `map_object_checks_insert` verlangt
 * `checked_by = auth.uid()` und ein sichtbares Kartenobjekt — beides ist hier
 * gegeben. Der Weg war die ganze Zeit offen, es hat ihn nur niemand gebaut.
 *
 * **Das Datum ist der Unterschied zur Feld-App und der Grund, warum es diese
 * Komponente gibt.** Dort ist „jetzt" richtig: man steht davor. Hier ist es
 * falsch — wer Dienstag oben war und Donnerstag tippt, schriebe sonst
 * Donnerstag in ein Protokoll, das die Frage „wer war vor der Drückjagd oben"
 * beantworten soll. **Der PC ist der Ort, an dem man nachträglich sauber
 * macht; ohne Datumsfeld wäre er der Ort, an dem man das Protokoll verdirbt.**
 */
function Pruefen({ objekt }: { objekt: Punkt }) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [status, setStatus] = useState<PruefStatus>('ok')
  const [notiz, setNotiz] = useState('')
  const [tag, setTag] = useState(() => heuteBerlin())
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  const notizPflicht = status !== 'ok'
  const notizFehlt = notizPflicht && notiz.trim() === ''

  /**
   * Der gewählte Tag als Zeitpunkt, **nur zum Vergleichen** — `null`, wenn das
   * Feld leer oder kaputt ist. Versatz 0, weil der Render nichts verbrauchen
   * darf; der Wert, der wirklich geschrieben wird, entsteht im Klick.
   */
  /**
   * Der Vergleichswert für die „wird überholt"-Vorschau.
   *
   * ⚠ **Im Heute-Fall ist das die PC-Uhr, gespeichert wird seit CN-85 aber die
   * Serveruhr** (Fremdprüfung 26.08.2026, E4 `[niedrig]`). Bei genau der
   * Uhrabweichung, gegen die CN-85 gebaut ist, kann die Vorschau daher
   * danebenliegen — die Warnung erscheint, obwohl der Eintrag durchkommt, oder
   * sie bleibt aus, obwohl er von einer zukunftsdatierten Zeile überholt wird.
   *
   * **Bewusst nicht behoben.** Die einzige ehrliche Abhilfe wäre, die
   * Serverzeit zu holen — ein Rundgang zur Datenbank bei jedem Tastendruck im
   * Datumsfeld, für eine Vorschau. Die Warnung ist eine Wahrscheinlichkeits-
   * aussage und war nie mehr; ihre Richtung stimmt auch bei einer um Sekunden
   * abweichenden Uhr. **Der harte Riegel sitzt ohnehin woanders:** die
   * Zukunftsgrenze im Handler, und dauerhaft dann in Migration 119.
   */
  const zeitpunkt = zeitpunktAus(tag, 0)
  /** Ein Tag in der Zukunft. `max` am Feld hält das nicht dicht (s. `speichern`). */
  const inDerZukunft = tag > heuteBerlin()

  /**
   * Ist diese Eintragung älter als die, die gerade angezeigt wird?
   *
   * **Dann passiert beim Speichern scheinbar nichts**, und das muss vorher
   * dastehen: die Ansicht zeigt die JÜNGSTE Prüfung je Objekt (View aus 117).
   * Eine rückdatierte Zeile landet in der Historie, gewinnt dort aber nicht —
   * der Zustand oben bleibt, wie er war. Ohne diesen Hinweis sähe ein
   * korrekter Schreibvorgang wie ein Fehlschlag aus, und der nächste Klick
   * legte eine zweite Zeile an.
   */
  const wirdUeberholt =
    objekt.pruefung !== null &&
    zeitpunkt !== null &&
    zeitpunkt <= new Date(objekt.pruefung.checkedAt)

  async function speichern() {
    // **Alle Prüfungen VOR dem Riegel** — sie sind nur Rechenarbeit, und ein
    // abgewiesener Klick soll das Formular nicht kurz sperren.
    if (schreibtGerade.has(objekt.id)) return

    if (notizFehlt) {
      // Abbrechen heißt abbrechen — es wird NICHT ersatzweise ohne Notiz
      // gemeldet. Wörtlich die Regel der Feld-App: „ein Mangel ohne
      // Beschreibung ist genau die Zeile, die später niemand deuten kann
      // („irgendwas war an Stand 14")."
      setFehler('Ohne Beschreibung nicht speichern — sonst weiß später niemand, was war.')
      return
    }
    /**
     * **Der Zeitpunkt entsteht HIER, nicht im Render** (Schlusslesung
     * 25.08.2026, F1 und F2). Zwei Gründe, und beide sind Befunde:
     *
     * - Der Versatz muss Speichervorgänge zählen, nicht Tastendrücke.
     * - Im Heute-Fall wäre `zeitpunkt` aus dem Render die Uhrzeit des letzten
     *   Renders. Wer das Formular ausfüllt und eine halbe Stunde wartet,
     *   schriebe eine halbe Stunde alte Zeit — die Feld-App schreibt die
     *   Klick-Zeit.
     */
    /**
     * **Ob der Prüftag heute ist, entscheidet, WER die Uhr stellt** (CN-85).
     * Heute: die Datenbank (`default now()`). Rückdatiert: dieser Client, und
     * dann bewusst — s. den Insert unten.
     *
     * ⚠ **Die Frage wird GENAU EINMAL gestellt** (Fremdprüfung 26.08.2026,
     * E2/E6). Zwei getrennte Ablesungen — hier und noch einmal in
     * `zeitpunktAus()` — können über Mitternacht auseinanderfallen: die eine
     * sagt „heute", die andere rechnet schon den Vortag. Dann verwirft der
     * Spread unten einen korrekt berechneten Zeitpunkt, und die Datenbank
     * schreibt den NEUEN Tag. In einem Log ohne DELETE-Policy ist das eine
     * dauerhaft falsch datierte Zeile.
     *
     * Deshalb ruft der Speicherpfad `rueckdatierterZeitpunkt()` direkt und
     * nicht `zeitpunktAus()`. Der Render darf weiter letztere nehmen — dort
     * hängt nichts davon ab.
     *
     * ⚠ **Ein Restfall bleibt, und er gehört benannt** (Schlusslesung
     * 26.08.2026, T2 `[niedrig]`): geschlossen ist das Rennen zwischen den
     * beiden CLIENT-Ablesungen, nicht das zwischen Klick und Server. Wer um
     * 23:59:59 auf „Eintragen" drückt und dessen `auth.getUser()` zwei
     * Sekunden braucht, bekommt vom `default now()` den **neuen** Tag — er
     * hatte den alten im Feld. **Der alte Code hatte genau diesen Fall
     * richtig**, weil er die PC-Uhr im Klick festhielt.
     *
     * **Trotzdem keine Abhilfe, und zwar bewusst:** die einzige wäre, die
     * Serverzeit vorab zu holen — derselbe Rundgang, der schon bei der
     * Vorschau (E4) gegen sich entschieden hat. Der Schaden ist ein um
     * Sekunden verschobener Kalendertag, kein Sicherheitsproblem: der Wert
     * liegt nie in der Zukunft, 119 kann ihn nie treffen, und keine Sperre
     * wird dadurch versteckt — die Zeile ist tatsächlich die jüngste.
     */
    const istHeute = tag === heuteBerlin()
    /**
     * Der Versatz wird nur im Rückdatierungsfall gebraucht — er trennt zwei
     * Nachträge für denselben Tag. **Im Heute-Fall bleibt der Zähler
     * unangetastet**, statt verbraucht zu werden (Fremdprüfung E5: er
     * wickelt bei 60 um, und jeder unnötige Verbrauch zieht das vor).
     */
    const wann = istHeute ? null : rueckdatierterZeitpunkt(tag, naechsterVersatz())
    if (!istHeute && wann === null) {
      setFehler('Kein Prüftag gewählt. Bitte ein Datum eintragen.')
      return
    }
    /**
     * **Die Zukunftsgrenze im Handler, nicht nur am Feld** (Fremdprüfung
     * 25.08.2026, `[hoch]`). `max` ist eine Browser-Hilfe und hält gegen
     * Tastatureingabe, DevTools und ältere Browser nicht dicht.
     *
     * Der Schaden wäre doppelt und dauerhaft: die View aus 117 wählt die
     * Zeile als jüngste (sie ist es ja), während `inDieserSaison` in
     * `wartung.ts` sie als „nicht geprüft" liest — Karte und Bilanz sagten
     * dann Verschiedenes über denselben Stand, und **jede spätere echte
     * Prüfung bliebe bis zu diesem Zukunftstag unsichtbar.** Löschen geht
     * nicht, die Tabelle hat keine DELETE-Policy.
     *
     * Der dauerhafte Riegel gehört in die Datenbank (CN-80), damit er für alle
     * drei Clients gilt. Bis dahin ist dies die einzige Stelle, an der er
     * überhaupt existiert.
     */
    if (inDerZukunft) {
      setFehler('Eine Prüfung kann nicht in der Zukunft liegen.')
      return
    }
    // Dieselbe Browser-Hilfe wie `max`, und derselbe Grund, sie zu wiederholen:
    // das Feld hält gegen Tastatureingabe nicht dicht.
    if (tag < FRUEHESTER_PRUEFTAG) {
      setFehler('Das Datum liegt zu weit zurück — bitte den Prüftag prüfen.')
      return
    }

    schreibtGerade.add(objekt.id)
    setLaeuft(true)
    setFehler(null)

    try {
      // **Der Auth-Aufruf steht INNERHALB des try** (Fremdprüfung, `[medium]`).
      // Vorher lag er davor: lehnte das Promise wegen eines Netzfehlers ab,
      // wurde weder eine Meldung gesetzt noch der Riegel gelöst — das Formular
      // blieb dauerhaft gesperrt, ohne zu sagen warum.
      const { data: sitzung, error: authFehler } = await createClient().auth.getUser()
      if (authFehler || !sitzung.user) {
        setFehler('Die Anmeldung konnte nicht geprüft werden. Bitte die Seite neu laden.')
        return
      }

      await schreibe('Die Prüfung', () =>
        createClient()
          .from('map_object_checks')
          .insert({
            map_object_id: objekt.id,
            checked_by: sitzung.user.id,
            /**
             * **Für „heute" wird `checked_at` GAR NICHT geschickt** — dann
             * setzt die Tabelle ihren `default now()`, und das ist die
             * Serveruhr (CN-85, 26.08.2026).
             *
             * Bis hierher schickte das Portal auch im heutigen Fall die
             * **PC-Uhr** mit. Das war schon für sich schlechter — eine falsch
             * gestellte Arbeitsplatzuhr schrieb ihren Irrtum dauerhaft in ein
             * Log ohne DELETE-Policy —, **und es ist die Vorbedingung für
             * Migration 119**: die lehnt jedes `checked_at > now()` ohne
             * Toleranz ab. Eine um Sekunden vorgehende PC-Uhr hätte danach
             * jede legitime Meldung von hier mit `23514` scheitern lassen.
             *
             * **Toleranz null ist dort richtig und nicht verhandelbar** (die
             * Begründung steht im Kopf der Migration): eine Viertelstunde
             * genügt, um jede `gesperrt`-Zeile zu verstecken, die in diesem
             * Fenster mit Serverzeit geschrieben wird — und das heilt nicht
             * nach Ablauf der Viertelstunde, weil gespeicherte Zeitstempel
             * sich nicht ändern.
             *
             * **Die Rückdatierung bleibt unverändert.** Dort ist der Wert
             * Mittag Berlin eines vergangenen Tages und liegt per Konstruktion
             * in der Vergangenheit; 119 kann ihn nie treffen. Genau dafür ist
             * das Datumsfeld gebaut — der PC ist der Ort, an dem man
             * nachträglich sauber macht.
             */
            ...(wann === null ? {} : { checked_at: wann.toISOString() }),
            status,
            note: notizPflicht ? notiz.trim() : null,
          })
          // `.select()` ist Pflicht, sonst meldet ein RLS-Fehlschlag Erfolg
          // mit null Zeilen (S1, s. `schreiben.ts`).
          .select('id')
      )
      setOffen(false)
      setNotiz('')
      setStatus('ok')
      setTag(heuteBerlin())
      // Der Zustand ist ein Server-Prop — ohne Refresh stünde oben weiter die
      // alte Zeile, obwohl die neue geschrieben ist.
      router.refresh()
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Die Prüfung konnte nicht gespeichert werden.')
    } finally {
      schreibtGerade.delete(objekt.id)
      setLaeuft(false)
    }
  }

  if (!offen) {
    return (
      <div className="zentrale-inspektor-pruefen">
        <button type="button" className="oeffnen" onClick={() => setOffen(true)}>
          Prüfung eintragen
        </button>
      </div>
    )
  }

  return (
    <div className="zentrale-inspektor-pruefen offen">
      {/* Ein `fieldset` mit `legend`, kein `div` mit Überschrift: drei sich
          ausschließende Zustände sind genau das, wofür Radios da sind — samt
          Pfeiltasten-Bedienung und Gruppen-Ansage im Screenreader. */}
      <fieldset>
        <legend>Zustand</legend>
        {ZUSTAND_WAHL.map((w) => (
          <label key={w.wert}>
            <input
              type="radio"
              name={`pruefstatus-${objekt.id}`}
              value={w.wert}
              checked={status === w.wert}
              disabled={laeuft}
              onChange={() => {
                setStatus(w.wert)
                setFehler(null)
              }}
            />
            <span>{w.label}</span>
          </label>
        ))}
      </fieldset>

      {notizPflicht && (
        <label className="feld">
          <span>{status === 'gesperrt' ? 'Was ist kaputt?' : 'Was ist aufgefallen?'}</span>
          <textarea
            rows={2}
            value={notiz}
            disabled={laeuft}
            onChange={(e) => {
              setNotiz(e.target.value)
              setFehler(null)
            }}
          />
          {status === 'gesperrt' && (
            <span className="hinweis">
              Der Stand wird als „nicht besetzen&ldquo; geführt, bis jemand ihn wieder
              freigibt.
            </span>
          )}
        </label>
      )}

      <label className="feld">
        <span>Geprüft am</span>
        {/* `max` auf heute: eine Prüfung, die noch nicht stattgefunden hat,
            gibt es nicht. Der Browser hält das Feld allein nicht dicht — der
            Riegel dagegen gehört in die Datenbank (CN-80), und bis dahin liest
            das Portal ein Zukunftsdatum ohnehin als „nicht geprüft"
            (s. `inDieserSaison`). */}
        <input
          type="date"
          value={tag}
          min={FRUEHESTER_PRUEFTAG}
          max={heuteBerlin()}
          disabled={laeuft}
          onChange={(e) => {
            setTag(e.target.value)
            setFehler(null)
          }}
        />
        <span className="hinweis">
          Vorbelegt auf heute. Wer vorgestern oben war, stellt es zurück.
        </span>
      </label>

      {wirdUeberholt && (
        <p className="hinweis warnung">
          Diese Eintragung ist nicht jünger als die zuletzt gespeicherte Prüfung.
          Sie erscheint in der Historie, ändert den Zustand oben aber
          möglicherweise nicht.
        </p>
      )}

      {fehler && (
        <p className="fehler" role="alert">
          {fehler}
        </p>
      )}

      <div className="knoepfe">
        <button type="button" onClick={() => void speichern()} disabled={laeuft}>
          {laeuft ? 'Wird gespeichert …' : 'Eintragen'}
        </button>
        <button
          type="button"
          className="ab"
          disabled={laeuft}
          onClick={() => {
            setOffen(false)
            setFehler(null)
            setNotiz('')
            setStatus('ok')
            setTag(heuteBerlin())
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}

/**
 * Wann und in welchem Zustand ein Bauwerk zuletzt gesehen wurde — samt der
 * Historie dahinter.
 *
 * **Das ist der Teil, den nur das Portal kann** (Konzept Standzustand §4.2):
 * der große Bildschirm trägt eine Liste, das Handy nicht. Die Frage *„wer hat
 * den Sauberg vor der letzten Drückjagd abgegangen?"* ist die Frage, für die
 * Migration 066 ausdrücklich ein LOG statt eines Statusfelds gebaut hat — und
 * sie war bis heute in keinem Client beantwortbar.
 *
 * **Die letzte Prüfung lädt nicht, die Historie schon.** Der Zustand kommt mit
 * dem Punkt vom Server (eine Abfrage für das ganze Revier, die View aus 117);
 * nur das Aufklappen holt die Vorgeschichte genau dieses Objekts nach. So
 * steht die Auskunft, auf die es ankommt, sofort da, und die 172 anderen
 * Historien werden nie geladen.
 */
function Standzustand({ objekt }: { objekt: Punkt }) {
  /** `null` = noch nie geladen. Unterscheidet „leer" von „weiß ich noch nicht". */
  const [zeilen, setZeilen] = useState<HistorieZeile[] | null>(null)
  const [namen, setNamen] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  /**
   * Generationszähler gegen überholende Antworten — dieselbe Falle wie im
   * Papierkorb: auf-zu-auf startet zwei Läufe, und ohne ihn könnte der ältere
   * den jüngeren überschreiben.
   */
  const lauf = useRef(0)

  const laden = useCallback(async () => {
    const meiner = ++lauf.current
    setLaedt(true)
    setFehler(null)

    const supabase = createClient()
    // Beide gleichzeitig: die Namen hängen nicht an den Zeilen, sie werden nur
    // zusammen gebraucht.
    const [historie, konten] = await Promise.all([
      supabase
        .from('map_object_checks')
        .select('id, status, checked_at, note, checked_by')
        .eq('map_object_id', objekt.id)
        .order('checked_at', { ascending: false })
        // **`id` als zweites Kriterium ist Pflicht** — wörtlich die „aktive
        // Falle" aus Migration 117, und dieser Lesepfad hatte sie seit heute
        // früh (Schlusslesung 25.08.2026, F4). `checked_at` allein ist bei zwei
        // gleichen Zeitstempeln keine totale Ordnung, und dann kippt die
        // Reihenfolge der Liste zwischen zwei Öffnungen, ohne dass sich etwas
        // geändert hätte. Vorher war das theoretisch; der Nachtragsweg aus
        // diesem Diff erzeugt systematisch nahe beieinanderliegende Zeitstempel
        // und macht es real.
        .order('id', { ascending: false })
        // **Einer mehr als angezeigt wird**, damit „es gibt noch weitere"
        // beweisbar ist statt geraten. Eine still abgeschnittene Historie sieht
        // aus wie eine vollständige — dieselbe Bauform, gegen die `vollstaendig()`
        // in `laden.ts` gebaut ist.
        .limit(HISTORIE_MAX + 1),
      // konto_namen() statt profiles — s. `src/lib/konto-namen.ts`. Hier im
      // Client und nicht als Prop vom Server: der Aufklapper wird selten
      // geöffnet, und ein Prop müsste durch drei Ebenen (Seite → Arbeitsbereich
      // → Karte → Inspektor) für einen Fall, den die meisten nie auslösen.
      supabase.rpc('konto_namen'),
    ])

    // Ein jüngerer Lauf hat übernommen — dieses Ergebnis ist überholt.
    if (meiner !== lauf.current) return
    setLaedt(false)

    if (historie.error) {
      // **Kein Zurücksetzen der Zeilen.** Eine leere Liste neben „nicht
      // abrufbar" läse sich wie „nie geprüft" — genau die stille
      // Falschauskunft, gegen die Migration 066 gebaut wurde.
      setFehler('Die Prüfhistorie ist nicht abrufbar.')
      return
    }

    // Die rohen Zeilen, samt der einen zu viel: ob gekappt wurde, ist damit
    // beim Rendern ablesbar und muss nicht als zweiter Zustand mitgeführt
    // werden, der mit dem ersten aus dem Tritt geraten kann.
    setZeilen((historie.data ?? []) as HistorieZeile[])

    // Fehlen die Namen, bleibt die Historie trotzdem stehen — sie ist ohne
    // Namen weniger wert, aber nicht falsch. Ein „von Unbekannt" schreibt sie
    // deshalb nicht (s. `wannUndWer`).
    if (!konten.error) {
      setNamen(new Map(((konten.data ?? []) as KontoName[]).map((k) => [k.id, k.display_name])))
    }
  }, [objekt.id])

  return (
    <div className="zentrale-inspektor-zustand">
      <p className={`zeile${objekt.pruefung ? '' : ' leer'}`}>
        {zustandsSatz(objekt.pruefung, objekt.pruefung ? wannUndWer(objekt.pruefung) : '')}
      </p>

      {/* Der Altbestand-Fall: eine Prüfung an einem Typ, der heute nicht mehr
          gewartet wird. Sie steht da, sie zählt nur in keiner Bilanz mehr —
          und das gehört gesagt, sonst sucht jemand die Zahl, in der sie
          fehlt. */}
      {!istWartbar(objekt.typ) ? (
        <p className="notiz">
          Dieser Objekttyp wird nicht mehr geprüft. Der Eintrag bleibt als
          Auskunft stehen, zählt aber in keiner Übersicht mit.
        </p>
      ) : null}

      {/* Die Notiz der letzten Prüfung steht mit, nicht erst in der Historie:
          bei „Mangel" und „Gesperrt" ist sie die eigentliche Auskunft — was
          genau kaputt ist. Migration 066 fragt sie ausschließlich in diesen
          beiden Fällen ab. */}
      {objekt.pruefung?.note ? <p className="notiz">„{objekt.pruefung.note}&ldquo;</p> : null}

      {/* **Eintragen nur bei Objektarten, die geprüft werden** (Fremdprüfung
          25.08.2026, Fokuspunkt 9). Die Zeile darüber sagt bei einem
          Altbestand-Objekt „Dieser Objekttyp wird nicht mehr geprüft" — und
          direkt darunter stand ein Knopf, der genau das anbot. Ein Widerspruch
          in zwei aufeinanderfolgenden Zeilen, und die falsche Hälfte hätte
          gewonnen: eine neue Zeile in einem Log ohne DELETE-Policy.

          Lesen bleibt, Schreiben nicht. Wer einen Parkplatz künftig doch
          prüfen will, ändert `WARTBAR` — an einer Stelle, für alle drei
          Ansichten. */}
      {istWartbar(objekt.typ) ? <Pruefen objekt={objekt} /> : null}

      {/* `<details>` statt eines eigenen Zustands: das Aufklappen kann der
          Browser samt Tastatur und Screenreader. Dieselbe Bauart wie der
          Papierkorb und die Kartenlegende.

          **Nur, wenn es überhaupt eine Prüfung gibt.** Ein Aufklapper, der
          garantiert leer ist, ist eine Einladung, die ins Leere führt. */}
      {objekt.pruefung ? (
        <details
          className="zentrale-inspektor-historie"
          // Bei jedem Öffnen neu laden, nicht nur beim ersten: die Feld-App
          // schreibt währenddessen weiter, und ein zweites Öffnen soll den
          // neueren Stand zeigen. Genau die Begründung des Papierkorbs.
          // `onToggle` feuert auch beim Zuklappen, daher die Abfrage.
          onToggle={(e) => {
            if (e.currentTarget.open) void laden()
          }}
        >
          <summary>Alle Prüfungen</summary>

          {laedt ? <p className="hinweis">Wird geladen …</p> : null}
          {fehler ? (
            <p className="fehler" role="alert">
              {fehler}
            </p>
          ) : null}

          {zeilen && zeilen.length > 0 ? (
            <ul>
              {zeilen.slice(0, HISTORIE_MAX).map((z) => (
                <li key={z.id}>
                  <span className="wann">{zeitpunkt.format(new Date(z.checked_at))}</span>
                  <span className={`stat ${z.status}`}>{STATUS_WORT[z.status] ?? z.status}</span>
                  <span className="wer">{namen.get(z.checked_by) ?? '—'}</span>
                  {z.note ? <span className="note">„{z.note}&ldquo;</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {zeilen && zeilen.length > HISTORIE_MAX ? (
            <p className="hinweis">
              Nur die {HISTORIE_MAX} jüngsten Prüfungen. Ältere gibt es, sie stehen hier nicht.
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  )
}

function Details({
  objekt,
  aufZurueck,
  aufSpeichern,
  aufModus,
  positioniert,
  aufPositionStarten,
  aufPositionSpeichern,
  aufSetzAbbrechen,
  aufLoeschen,
}: {
  objekt: Punkt
  aufZurueck: () => void
  aufSpeichern: (id: string, entwurf: ObjektEntwurf) => Promise<void>
  aufModus: (bearbeitet: boolean) => void
  /** Gesetzt, solange DIESES Objekt verschoben wird. */
  positioniert: { kandidat: { lat: number; lng: number } | null } | null
  aufPositionStarten: (id: string) => void
  aufPositionSpeichern: () => Promise<void>
  aufSetzAbbrechen: () => void
  aufLoeschen: (id: string) => Promise<void>
}) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [loeschFrage, setLoeschFrage] = useState(false)
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

  /**
   * Nach oben melden, solange bearbeitet wird — und beim Aushängen zurücknehmen,
   * sonst bliebe die Karte gesperrt.
   *
   * `laeuft` und `loeschFrage` zählen mit, und beide decken je einen Fall ab,
   * den `bearbeiten` allein offen ließ:
   *
   * - **`laeuft`** — der laufende Löschvorgang. Bei den anderen Schreibwegen ist
   *   ohnehin gesperrt (`bearbeiten` beim Speichern, `setzen` beim Verschieben);
   *   allein beim Löschen stünde die Karte offen, und ein Klick auf einen
   *   anderen Marker hängte mitten im Write diese Komponente aus. Die
   *   Fehlermeldung landete dann in etwas, das niemand mehr sieht — ein
   *   gescheitertes Löschen sähe aus wie ein gelungenes.
   * - **`loeschFrage`** — die offene Rückfrage. Ohne sie blieb „Grenze löschen"
   *   in der Knopfleiste bedienbar, und **zwei gleichnamige „Wirklich
   *   löschen"-Knöpfe standen gleichzeitig auf dem Bildschirm**; der obere
   *   sperrte den unteren nicht, weil dessen `laeuft` in dieser Komponente
   *   liegt. Das ist wörtlich der Fehler, den Moritz am 28.07.2026 an den
   *   Grenzen-Knöpfen gefunden hat — ein Riegel, der einen Knopf vergisst.
   *   Von Codex gefunden, 29.07.2026.
   *
   * Der Preis ist, dass die Karte während der Rückfrage nicht auswählbar ist.
   * Das ist kein Sackgassen-Risiko: „Behalten" steht daneben und ist einen
   * Klick entfernt — anders als bei einem Entwurf geht dabei nichts verloren.
   */
  useEffect(() => {
    aufModus(bearbeiten || laeuft || loeschFrage)
    return () => aufModus(false)
  }, [bearbeiten, laeuft, loeschFrage, aufModus])

  /**
   * Fokus mitführen. Ohne das hängt der Browser das gerade fokussierte Element
   * aus und der nächste Tabulator fängt wieder am Seitenanfang an — wer per
   * Tastatur arbeitet, verliert bei jedem Wechsel die Stelle.
   */
  const kopfRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!bearbeiten) kopfRef.current?.focus()
  }, [bearbeiten, objekt.id])

  /**
   * Fokus auf die Rückfrage, sobald sie aufgeht — und zwar auf **„Behalten"**,
   * nicht auf „Wirklich löschen".
   *
   * Der Knopf, den man gerade gedrückt hat, verschwindet ja; ohne das fiele der
   * Fokus auf den Seitenanfang und die Rückfrage wäre für die Tastatur gar nicht
   * da. Dass der **harmlose** Knopf ihn bekommt, ist der Punkt: läge er auf
   * „Wirklich löschen", machte ein zweites, reflexhaftes Enter aus der
   * Rückfrage eine Formalie — die Tastatur hätte dann einen Schritt weniger als
   * die Maus, obwohl sie denselben Schutz braucht. So muss man einmal tabben,
   * um zu löschen, und Enter ist der Rückweg.
   */
  const behaltenRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (loeschFrage) behaltenRef.current?.focus()
  }, [loeschFrage])

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
   * Löschen (Schritt 3c). Der Write liegt oben; hier bleibt der Rückweg.
   *
   * Bei Misserfolg bleibt die **Rückfrage stehen** statt zuzuklappen — sonst
   * stünde die Fehlermeldung über einem Knopf, der nicht mehr der ist, den man
   * gedrückt hat, und der zweite Versuch begänne wieder von vorn (Backlog E-R2,
   * dieselbe Regel wie beim Entwurf und beim Positionsentwurf).
   *
   * Kein `setLoeschFrage(false)` im Erfolgsfall: das Objekt ist weg, die Auswahl
   * fällt oben, und diese Komponente hängt sich mit ihr aus.
   */
  const loeschen = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await aufLoeschen(objekt.id)
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Löschen.')
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
              <StorageImg
                className="zentrale-inspektor-foto"
                src={objekt.fotoUrl}
                alt={`Foto von ${objekt.name}`}
                loading="lazy"
              />
            )}

            {/* Der Standzustand steht ÜBER den Koordinaten und unter dem Foto:
                er ist eine Aussage über das Bauwerk, wie Notiz und Bild — die
                Koordinaten sind Verwaltung. Bei einem Objekt ohne
                Wartungszustand (Parkplatz, Notfall-Treffpunkt, Sonstiges)
                entfällt er, statt „Noch nie geprüft" zu behaupten: ein
                Steinbruch wird nicht geprüft, und eine Zeile darüber wäre eine
                Aufgabe, die niemand hat.

                **Es sei denn, es GIBT eine Prüfung — und das ist ein Fix aus
                der Fremdprüfung** (25.08.2026, `[medium]`). Die Feld-App konnte
                früher jeden Typ prüfen; der Schnitt auf sieben Arten ist vom
                22.08.2026. Ein Parkplatz mit einer alten Sperre bekäme auf der
                Karte weiter seinen roten Ring (die Ebene filtert nicht nach
                `istWartbar`), und ausgerechnet im Inspektor stünde nichts, was
                ihn erklärt. Wer die Sperre sieht, muss lesen können, woher sie
                kommt. */}
            {istWartbar(objekt.typ) || objekt.pruefung ? <Standzustand objekt={objekt} /> : null}

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

      {/* Die Folgen stehen VOR dem zweiten Knopf, nicht nach ihm.
          Bewusst ein feststehender Satz statt gezählter Referenzen: neun
          Fremdschlüssel zeigen auf `map_objects`, und der neunte
          (`map_object_checks`) kam am 29.07.2026 aus dem nativen Track dazu —
          eine Aufzählung im Portal wäre schon am Tag ihrer Entstehung
          unvollständig gewesen. Zählen ginge zudem nur mit einer Abfrage je
          Tabelle, und deren Ergebnis kann RLS auf 0 filtern: eine Warnung, die
          „hängt an nichts" sagt, weil sie nichts sehen darf, ist schlechter als
          gar keine. Der Satz nennt deshalb die zwei Wirkungen, nicht die
          Tabellen — CASCADE nimmt mit, SET NULL lässt stehen und kappt den
          Bezug. (Codex-Vorschlag, 29.07.2026, gegen meinen ersten Entwurf.)
          Kein role="alert": die Zeile erscheint auf Knopfdruck und wird über
          `aria-describedby` mit dem Knopf vorgelesen, der sie meint. */}
      {loeschFrage && (
        <p id="objekt-loesch-folgen" className="zentrale-inspektor-warnung">
          Löschen nimmt Fotos, Prüfungen und Standzuweisungen mit. Erlegungen und
          Nachsuchen bleiben erhalten, verlieren aber den Bezug zu diesem Objekt.
          Das lässt sich nicht rückgängig machen.
        </p>
      )}

      {/* Nur zeigen, was jetzt geht: vier Zustände, weil es vier Aufgaben sind —
          und nie zwei davon gleichzeitig, dafür sorgt der Setzzustand in
          `revierkarte.tsx`. */}
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
          ) : loeschFrage ? (
            <>
              <button
                type="button"
                className="haupt"
                onClick={loeschen}
                disabled={laeuft}
                aria-describedby="objekt-loesch-folgen"
              >
                {laeuft ? 'Löscht …' : 'Wirklich löschen'}
              </button>
              {/* „Behalten" wie bei der Grenze, nicht „Abbrechen": der Knopf
                  daneben löscht, und zwei Wörter mit demselben Anfangsbuchstaben
                  sind an dieser Stelle eine Falle.
                  Räumt die Fehlermeldung mit: nach einem gescheiterten Löschen
                  stünde sie sonst über einem Fuß, der gar nicht mehr löscht.
                  Trägt `aria-describedby` ebenfalls — er bekommt den Fokus, und
                  die Folgen sollen vorgelesen werden, egal auf welchem der
                  beiden Knöpfe man steht. */}
              <button
                ref={behaltenRef}
                type="button"
                onClick={() => {
                  setFehler(null)
                  setLoeschFrage(false)
                }}
                disabled={laeuft}
                aria-describedby="objekt-loesch-folgen"
              >
                Behalten
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
              {/* Eine alte Fehlermeldung mitzunehmen hieße, sie über der
                  Rückfrage stehen zu lassen, wo sie nach einer Warnung zum
                  Löschen aussieht. */}
              <button
                type="button"
                onClick={() => {
                  setFehler(null)
                  setLoeschFrage(true)
                }}
              >
                Löschen
              </button>
            </>
          )}
      </div>
    </>
  )
}
