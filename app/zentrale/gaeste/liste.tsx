'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import {
  aenderungen,
  alsDatum,
  alsSpalten,
  anzeigeName,
  einladungsHinweis,
  einladungsweg,
  entwurfVon,
  initialen,
  kuerzelVon,
  istGestrichen,
  mehrfachText,
  normiert,
  zuordnungsPatch,
  pruefeEntwurf,
  sichtbare,
  sortiert,
  EINLADUNGSWEG_LABEL,
  KATEGORIEN,
  FELDER,
  LEERER_ENTWURF,
  MEHRFACH,
  type Entwurf,
  type Kategorie,
  type Zuordnung,
  type Filter,
  type Kontakt,
} from './kontakte'

/**
 * Die Gästeliste: Suche, Filter, Tabelle, Inspektor — lesend und schreibend.
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
 * **Die drei Schreibwege liegen hier oben**, nicht in den Formularen darunter —
 * dieselbe Aufteilung wie `revierkarte.tsx` und `objekt-inspektor.tsx`. Die
 * Formulare kennen nur ein Versprechen: *schreibt und wirft bei Misserfolg*.
 * Dadurch steht die Fehlerbehandlung dort, wo der Nutzer sie sieht, und der
 * Entwurf überlebt einen gescheiterten Write (Backlog E-R2).
 */
export default function Liste({
  kontakte,
  besitzerId,
  startSuche,
  startFilter,
}: {
  kontakte: Kontakt[]
  /** Für den INSERT. `besitzer_id` ist NOT NULL und danach fest (Trigger, 085). */
  besitzerId: string
  startSuche: string
  startFilter: Filter
}) {
  const router = useRouter()
  const [suche, setSuche] = useState(startSuche)
  const [filter, setFilter] = useState<Filter>(startFilter)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [neu, setNeu] = useState(false)
  /**
   * Meldet der Inspektor, dass ein Entwurf oder eine Rückfrage offen steht.
   *
   * Solange das gilt, nimmt die Tabelle keine Auswahl an. Sonst hängt ein Klick
   * auf eine andere Zeile den Inspektor aus und der halb getippte Kontakt ist
   * kommentarlos weg — im schlimmsten Fall mitten in einem laufenden Write,
   * dessen Fehlermeldung dann in einer Komponente landet, die niemand mehr
   * sieht. Wörtlich dieselbe Falle wie in `../objekt-inspektor.tsx`, dort für
   * die Karte gelöst.
   */
  const [imEingriff, setImEingriff] = useState(false)

  /**
   * Der Zuordnen-Modus — Moritz' Wunsch vom 03.08.2026.
   *
   * **Ein Modus, kein Dauerzustand**, und das ist die einzige Stelle, an der
   * hier überhaupt etwas umschaltet: die Zeile trägt schon einen Klick (sie
   * öffnet den Inspektor). Kästchen daneben, die immer dastehen, machten aus
   * jedem Klick eine Frage, welchen der beiden man gerade meint.
   *
   * `null` heißt: Modus aus. Sonst steht darin die Kategorie, die zugewiesen
   * wird — Moritz' Ablauf ist „erst auf Schützen klicken, dann alle anwählen",
   * die Kategorie kommt also VOR der Auswahl.
   */
  const [zuordnen, setZuordnen] = useState<Kategorie | null>(null)
  const [markiert, setMarkiert] = useState<Set<string>>(new Set())
  const [zuordnungLaeuft, setZuordnungLaeuft] = useState(false)
  const [zuordnungFehler, setZuordnungFehler] = useState<string | null>(null)
  const zuordnungInArbeit = useRef(false)
  const gesperrt = neu || imEingriff

  const ohneMail = useMemo(
    () => kontakte.filter((k) => einladungsweg(k) !== 'email').length,
    [kontakte],
  )
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

  /**
   * Speichern: ein UPDATE über genau die geänderten Spalten (`aenderungen()`).
   *
   * `router.refresh()` lädt die Server-Komponente neu — das ist der einzige Weg
   * zurück zum Serverstand, denn die 154 Zeilen liegen als Prop hier und nicht
   * in einem Client-Cache, den man von Hand nachziehen könnte.
   */
  const speichern = useCallback(
    async (id: string, patch: Record<string, string | string[] | null>) => {
      await schreibe('Der Kontakt', () =>
        createClient().from('kontakte').update(patch).eq('id', id).select('id'),
      )
      router.refresh()
    },
    [router],
  )

  /**
   * Massenzuordnung: eine Kategorie auf alle markierten Kontakte.
   *
   * **Ein UPDATE je Kontakt, aber nur für die, bei denen sich etwas ändert.**
   * `zuordnungsPatch()` gibt `null` für alle, die die Marke schon tragen (oder
   * schon nicht tragen) — bei 154 Zeilen ist das der Unterschied zwischen 154
   * Requests und drei. Ein Sammel-UPDATE über `.in('id', …)` ginge nicht: jeder
   * Kontakt bekommt einen anderen Array-Wert, weil seine übrigen Kategorien
   * erhalten bleiben.
   *
   * **Die Teilerfolgszahl steht in der Meldung** — dieselbe Lehre wie beim
   * Einladen (Fremdprüfung 03.08.2026): scheitert der 7. von 40, sind 6
   * geschrieben, und ohne die Zahl liest sich der Fehler, als sei nichts
   * passiert.
   *
   * **Die Markierung überlebt einen Fehlschlag NICHT** — nach dem Refresh steht
   * der frische Stand da, und wer weitermachen will, markiert aus dem, was
   * wirklich noch offen ist. Auch das ist von dort übernommen.
   */
  const massenZuordnung = useCallback(
    async (aktion: Zuordnung) => {
      if (zuordnungInArbeit.current || !zuordnen || markiert.size === 0) return
      zuordnungInArbeit.current = true
      setZuordnungLaeuft(true)
      setZuordnungFehler(null)
      const betroffen = kontakte.filter((k) => markiert.has(k.id))
      let geschrieben = 0
      try {
        for (const k of betroffen) {
          const neu = zuordnungsPatch(k, zuordnen, aktion)
          if (!neu) continue
          await schreibe('Die Zuordnung', () =>
            createClient().from('kontakte').update({ kategorien: neu }).eq('id', k.id).select('id'),
          )
          geschrieben++
        }
      } catch (err) {
        const rumpf = err instanceof Error ? err.message : 'Unbekannter Fehler beim Zuordnen.'
        setZuordnungFehler(
          geschrieben > 0
            ? `${geschrieben} Kontakte sind geändert, dann brach es ab: ${rumpf}`
            : rumpf,
        )
      } finally {
        setMarkiert(new Set())
        zuordnungInArbeit.current = false
        setZuordnungLaeuft(false)
        router.refresh()
      }
    },
    [kontakte, markiert, zuordnen, router],
  )

  /**
   * Anlegen. `besitzer_id` kommt vom Server (`auth.getUser()` in page.tsx),
   * nicht aus dem Formular — die Spalte ist nach dem INSERT fest, und ein Feld
   * dafür wäre eines, das der Trigger aus 085 mit `42501` abweist.
   *
   * Die neue Zeile wird gleich ausgewählt. Bis `router.refresh()` durch ist,
   * steht sie noch nicht im Prop; der Inspektor zeigt so lange seinen leeren
   * Zustand und füllt sich dann — besser als ein Formular, das offen bleibt und
   * beim nächsten Klick einen zweiten Kontakt anlegt.
   */
  const anlegen = useCallback(
    async (entwurf: Entwurf) => {
      const zeile = await schreibe<{ id: string }>('Der neue Kontakt', () =>
        createClient()
          .from('kontakte')
          .insert({ ...alsSpalten(entwurf), besitzer_id: besitzerId })
          .select('id'),
      )
      setNeu(false)
      setGewaehlt(zeile.id)
      router.refresh()
    },
    [besitzerId, router],
  )

  const loeschen = useCallback(
    async (id: string) => {
      await schreibe('Der Kontakt', () =>
        createClient().from('kontakte').delete().eq('id', id).select('id'),
      )
      setGewaehlt(null)
      router.refresh()
    },
    [router],
  )

  return (
    <>
      <div className="gaeste-leiste">
        <input
          type="search"
          className="gaeste-suche"
          placeholder="Name, E-Mail, Nummer, Begleitung oder Notiz suchen …"
          value={suche}
          onChange={(e) => sucheGeaendert(e.target.value)}
          aria-label="Gäste durchsuchen"
        />

        {/* Zwei Filter, beide beschriftet mit ihrer Zahl. „Ohne E-Mail" ist die
            Arbeitsliste zum Nachtragen — und der einzige Weg dorthin, denn eine
            fehlende Adresse ist als Abwesenheit nicht suchbar. */}
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
            Ohne E-Mail {ohneMail}
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

        {/* Gesperrt, solange ein Entwurf offen steht: der Knopf würde ihn sonst
            durch ein leeres Formular ersetzen. */}
        <button
          type="button"
          onClick={() => {
            // Der Modus schliesst den Inspektor: beide zeigen auf dieselben
            // Zeilen, und ein offener Entwurf neben einer laufenden
            // Massenaenderung waere zweimal derselbe Kontakt.
            setGewaehlt(null)
            setNeu(false)
            setZuordnungFehler(null)
            setMarkiert(new Set())
            setZuordnen(zuordnen ? null : KATEGORIEN[0].wert)
          }}
          disabled={imEingriff}
          aria-pressed={zuordnen !== null}
        >
          {zuordnen ? 'Fertig' : 'Mehrere zuordnen'}
        </button>

        <button
          type="button"
          className="gaeste-neu"
          onClick={() => {
            setGewaehlt(null)
            setNeu(true)
          }}
          disabled={gesperrt || zuordnen !== null}
        >
          Neuer Kontakt
        </button>
      </div>

      {/* **Die Kategorie steht VOR der Auswahl**, wie Moritz es beschrieben hat:
          „erst auf Schützen klicken, dann alle anwählen die als Schütze
          eingeladen werden sollen." Umgekehrt — erst markieren, dann zuordnen —
          waere derselbe Klickaufwand, aber man wuesste bis zuletzt nicht, wofuer
          man gerade sammelt. */}
      {zuordnen ? (
        <div className="gaeste-zuordnen">
          <div className="gaeste-zuordnen-wahl" role="group" aria-label="Kategorie zum Zuordnen">
            {KATEGORIEN.map((kat) => (
              <button
                key={kat.wert}
                type="button"
                className="jagden-chip"
                aria-pressed={zuordnen === kat.wert}
                disabled={zuordnungLaeuft}
                onClick={() => setZuordnen(kat.wert)}
              >
                {kat.label}
              </button>
            ))}
          </div>

          <div className="gaeste-zuordnen-tat">
            <span aria-live="polite">
              {markiert.size === 0
                ? 'Niemand markiert'
                : `${markiert.size} markiert`}
            </span>
            <button
              type="button"
              className="haupt"
              disabled={zuordnungLaeuft || markiert.size === 0}
              onClick={() => void massenZuordnung('hinzufuegen')}
            >
              {zuordnungLaeuft ? 'Wird gespeichert …' : 'Kategorie hinzufügen'}
            </button>
            {/* **Der Rückweg gehört dazu, nicht in eine spätere Runde.** Ein
                Sammelklick auf 40 Zeilen ist genau die Handlung, bei der man
                sich vergreift; ohne „Entfernen" waere der einzige Ausweg, 40
                Kontakte einzeln zu oeffnen. */}
            <button
              type="button"
              disabled={zuordnungLaeuft || markiert.size === 0}
              onClick={() => void massenZuordnung('entfernen')}
            >
              Entfernen
            </button>
          </div>

          {zuordnungFehler ? (
            <p className="zentrale-inspektor-fehler" role="alert">
              {zuordnungFehler}
            </p>
          ) : null}
        </div>
      ) : null}

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
                  {zuordnen ? (
                    <th scope="col" className="gaeste-haken">
                      {/* Ein Kästchen im Kopf, das alles Sichtbare erfasst —
                          bei 154 Zeilen der eigentliche Zeitgewinn. Es wirkt
                          NUR auf das, was Suche und Filter gerade zeigen; die
                          Auswahl ist die sichtbare Liste, der Haken führt sie
                          nur aus. */}
                      <input
                        type="checkbox"
                        checked={zeilen.length > 0 && zeilen.every((z) => markiert.has(z.id))}
                        disabled={zuordnungLaeuft}
                        aria-label="Alle sichtbaren markieren"
                        onChange={(e) =>
                          setMarkiert(
                            e.target.checked ? new Set(zeilen.map((z) => z.id)) : new Set(),
                          )
                        }
                      />
                    </th>
                  ) : null}
                  <th scope="col">Name</th>
                  <th scope="col">Begleitung</th>
                  <th scope="col">Notiz</th>
                  <th scope="col">Geburtstag</th>
                  {/* Im Zuordnen-Modus zeigt die letzte Spalte die Kategorien
                      statt des Einladungswegs: dort schaut man hin, um zu
                      sehen, was der Klick bewirkt hat. */}
                  <th scope="col">{zuordnen ? 'Kategorien' : 'Einladung'}</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr
                    key={z.id}
                    className={z.id === gewaehlt ? 'gaeste-zeile-aktiv' : undefined}
                    onClick={() => {
                      // Im Zuordnen-Modus markiert der Zeilenklick, statt den
                      // Inspektor zu oeffnen — sonst zeigten zwei Klickziele auf
                      // dieselbe Zeile.
                      if (zuordnungLaeuft) return
                      if (zuordnen) {
                        setMarkiert((v) => {
                          const neu = new Set(v)
                          if (neu.has(z.id)) neu.delete(z.id)
                          else neu.add(z.id)
                          return neu
                        })
                        return
                      }
                      if (!gesperrt) setGewaehlt(z.id)
                    }}
                  >
                    {zuordnen ? (
                      <td className="gaeste-haken">
                        <input
                          type="checkbox"
                          checked={markiert.has(z.id)}
                          disabled={zuordnungLaeuft}
                          aria-label={`${anzeigeName(z)} markieren`}
                          onChange={() => {
                            /* Der Zeilenklick oben erledigt das Umschalten.
                               Ohne diesen leeren Handler waere das Kästchen
                               fuer React unkontrolliert. */
                          }}
                        />
                      </td>
                    ) : null}
                    <td>
                      {/* Der Knopf trägt den zugänglichen Namen und den Fokus;
                          der Klick auf die Zeile ist die bequeme Zugabe, nicht
                          der einzige Weg. */}
                      <button
                        type="button"
                        className="gaeste-zeilenknopf"
                        aria-current={z.id === gewaehlt ? 'true' : undefined}
                        disabled={gesperrt || zuordnen !== null}
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
                      {zuordnen ? (
                        <span className="gaeste-kategorien">
                          {mehrfachText(z.kategorien ?? [], KATEGORIEN) ?? '—'}
                        </span>
                      ) : (
                        <span className="zentrale-pill">
                          {EINLADUNGSWEG_LABEL[einladungsweg(z)]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className="gaeste-inspektor" aria-label="Kontaktdetails">
          {/* Anlegen gewinnt vor der Auswahl — der Knopf setzt sie ohnehin
              zurück. Wären beide zugleich möglich, stünden zwei Entwürfe offen. */}
          {neu ? (
            <Formular
              titel="Neuer Kontakt"
              start={LEERER_ENTWURF}
              knopf="Kontakt anlegen"
              laufText="Legt an …"
              fokus="vorname"
              aufSichern={anlegen}
              aufAbbrechen={() => setNeu(false)}
            />
          ) : kontakt ? (
            <Details
              // Kontaktwechsel baut den Inspektor neu auf. Ohne den key trüge
              // ein angefangener Entwurf auf den nächsten Kontakt über —
              // dieselbe Falle wie beim Objekt-Inspektor.
              key={kontakt.id}
              kontakt={kontakt}
              aufModus={setImEingriff}
              aufSpeichern={speichern}
              aufLoeschen={loeschen}
            />
          ) : (
            <p className="zentrale-leer">Einen Kontakt wählen, um Details zu sehen.</p>
          )}
        </aside>
      </div>
    </>
  )
}

/**
 * Der Inspektor eines Kontakts: ansehen, bearbeiten, löschen.
 *
 * Zeigt **auch die leeren Felder**. In der Tabelle wären sie 154 leere Zellen
 * und damit ein Lineal; am einzelnen Kontakt sind sie die Auskunft „hier fehlt
 * etwas" — und seit Block 2 zugleich der Weg dorthin: ein leeres Feld ist ein
 * Knopf, der das Formular an genau dieser Stelle öffnet.
 */
function Details({
  kontakt,
  aufModus,
  aufSpeichern,
  aufLoeschen,
}: {
  kontakt: Kontakt
  /** Meldet nach oben, dass die Liste gesperrt gehört. */
  aufModus: (imEingriff: boolean) => void
  /** Schreibt und wirft bei Misserfolg — die Fehlermeldung landet im Formular. */
  aufSpeichern: (id: string, patch: Record<string, string | string[] | null>) => Promise<void>
  /** Löscht und wirft bei Misserfolg — die Rückfrage bleibt dann stehen. */
  aufLoeschen: (id: string) => Promise<void>
}) {
  const [bearbeiten, setBearbeiten] = useState<{ fokus?: keyof Entwurf } | null>(null)
  const [loeschFrage, setLoeschFrage] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  // `laeuft` zählt mit, weil beim Löschen sonst nichts sperrt: ein Klick auf
  // eine andere Zeile hängte mitten im Write diese Komponente aus, und ein
  // gescheitertes Löschen sähe aus wie ein gelungenes. `loeschFrage` zählt mit,
  // damit nicht zwei Rückfragen gleichzeitig offen stehen können.
  useEffect(() => {
    aufModus(!!bearbeiten || laeuft || loeschFrage)
    return () => aufModus(false)
  }, [bearbeiten, laeuft, loeschFrage, aufModus])

  /**
   * Fokus auf **„Behalten"**, sobald die Rückfrage aufgeht — nicht auf
   * „Wirklich löschen". Der gedrückte Knopf verschwindet ja; ohne das fiele der
   * Fokus an den Seitenanfang. Dass der harmlose Knopf ihn bekommt, ist der
   * Punkt: sonst machte ein zweites, reflexhaftes Enter aus der Rückfrage eine
   * Formalie. Gleiche Begründung wie im Objekt-Inspektor.
   */
  const behaltenRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (loeschFrage) behaltenRef.current?.focus()
  }, [loeschFrage])

  /**
   * Zurück aus dem Formular: der Fokus geht auf die Überschrift.
   *
   * „Speichern" und „Abbrechen" hängen sich selbst aus. Ohne das fiele der
   * Fokus an den Seitenanfang und der nächste Tabulator finge oben wieder an —
   * wer per Tastatur arbeitet, verlöre bei jedem Speichern die Stelle.
   * (Codex, 01.08.2026.)
   *
   * **Nur beim Verlassen, nicht beim Öffnen** — und das ist der Unterschied zum
   * Objekt-Inspektor, der einfach `if (!bearbeiten) fokussiere()` schreibt. Hier
   * stehen Tabelle und Inspektor nebeneinander: die Überschrift beim ersten
   * Anzeigen zu fokussieren risse den Fokus aus der Zeile, die man gerade
   * angeklickt hat. Deshalb das Merk-Ref statt der einfacheren Bedingung.
   */
  const kopfRef = useRef<HTMLHeadingElement>(null)
  const warImFormular = useRef(false)
  useEffect(() => {
    if (bearbeiten) {
      warImFormular.current = true
      return
    }
    if (!warImFormular.current) return
    warImFormular.current = false
    kopfRef.current?.focus()
  }, [bearbeiten])

  const sichern = async (entwurf: Entwurf) => {
    const patch = aenderungen(entwurf, kontakt)
    // Nichts geändert heißt nichts schreiben — der Weg zurück ist derselbe.
    if (patch) await aufSpeichern(kontakt.id, patch)
    setBearbeiten(null)
  }

  const loeschen = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await aufLoeschen(kontakt.id)
      // Kein setLoeschFrage(false): die Auswahl fällt oben, diese Komponente
      // hängt sich mit ihr aus.
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Löschen.')
    } finally {
      setLaeuft(false)
    }
  }

  if (bearbeiten) {
    return (
      <Formular
        titel={anzeigeName(kontakt)}
        start={entwurfVon(kontakt)}
        knopf="Änderungen speichern"
        laufText="Speichert …"
        fokus={bearbeiten.fokus}
        aufSichern={sichern}
        aufAbbrechen={() => setBearbeiten(null)}
      />
    )
  }

  const hinweis = einladungsHinweis(kontakt)

  return (
    <div className="gaeste-detail">
      {/* tabIndex -1: nicht in der Tabulatorfolge, aber programmatisch
          fokussierbar — der Landeplatz für den Rückweg aus dem Formular. */}
      <h2 className="gaeste-detail-name" ref={kopfRef} tabIndex={-1}>
        {anzeigeName(kontakt)}
      </h2>

      <dl className="gaeste-felder">
        {FELDER.filter((f) => !f.imKopf).map((f) => (
          <Feld
            key={f.key}
            label={f.label}
            // **Gesperrt, solange die Löschrückfrage steht oder ein DELETE
            // läuft.** Ohne das öffnet ein Klick auf „+ hinzufügen" das
            // Formular, und der frühe Return darunter verdeckt Rückfrage UND
            // Fehlermeldung — ein gescheitertes Löschen sähe aus wie ein
            // gelungenes. Genau der Riegel, den `imEingriff` für die Tabelle
            // zieht, nur hatte der Inspektor ihn gegen sich selbst nicht.
            // (Codex, 01.08.2026, „hoch".)
            gesperrt={loeschFrage || laeuft}
            // Das Kürzel zeigt den WIRKSAMEN Wert, nicht die Spalte: sonst
            // stünde bei 142 von 154 Kontakten ein Strich, obwohl die Liste
            // daneben ein Kürzel führt.
            wert={
              f.key === 'kuerzel'
                ? kuerzelVon(kontakt)
                : f.key === 'geburtstag'
                  ? (kontakt.geburtstag ? alsDatum(kontakt.geburtstag) : null)
                  : kontakt[f.key]
            }
            aufNachtragen={() => {
              setFehler(null)
              setBearbeiten({ fokus: f.key })
            }}
          />
        ))}

        {/* Die Mehrfachfelder lesen sich wie jede andere Zeile — eine
            Aufzählung, oder „+ hinzufügen". Der Inspektor soll nicht zeigen,
            WIE etwas gepflegt wird, sondern WAS gepflegt ist. */}
        {MEHRFACH.map((m) => (
          <Feld
            key={m.key}
            label={m.label}
            gesperrt={loeschFrage || laeuft}
            wert={mehrfachText(kontakt[m.key] ?? [], m.optionen)}
            aufNachtragen={() => {
              setFehler(null)
              setBearbeiten({ fokus: m.key })
            }}
          />
        ))}
      </dl>

      {/* Der Bildschirm sagt, WOFÜR der Kontakt unvollständig ist — er
          verweigert nichts (Konzept §4). Neutraler Ton, kein Alarmrot: eine
          fehlende Adresse ist kein Feldalarm (Zentrale-Konzept §2.6). */}
      {hinweis && <p className="gaeste-hinweis">{hinweis}</p>}

      {fehler && (
        <p className="zentrale-inspektor-fehler gaeste-meldung" role="alert">
          {fehler}
        </p>
      )}

      {/* Die Folge steht VOR dem Knopf, nicht nach ihm. Sie ist kurz, weil auf
          `kontakte` kein einziger Fremdschlüssel zeigt (gemessen 01.08.2026) —
          es hängt nichts daran, was mitginge. Was ausdrücklich dasteht, ist die
          Sorge, die man an dieser Stelle hat: ein ausgestellter Begehungsschein
          führt seinen Inhaber in eigenen Spalten und bleibt unberührt. */}
      {loeschFrage && (
        <p id="kontakt-loesch-folgen" className="zentrale-inspektor-warnung gaeste-meldung">
          Der Kontakt wird aus dem Adressbuch entfernt. Ausgestellte
          Begehungsscheine bleiben davon unberührt — sie führen ihren Inhaber
          selbst. Rückgängig machen lässt es sich nicht.
        </p>
      )}

      <div className="zentrale-inspektor-fuss gaeste-fuss">
        {loeschFrage ? (
          <>
            <button
              type="button"
              className="haupt"
              onClick={() => void loeschen()}
              disabled={laeuft}
              aria-describedby="kontakt-loesch-folgen"
            >
              {laeuft ? 'Löscht …' : 'Wirklich löschen'}
            </button>
            {/* „Behalten" wie beim Objekt, nicht „Abbrechen": der Knopf daneben
                löscht, und zwei Wörter mit demselben Anfangsbuchstaben sind an
                dieser Stelle eine Falle. */}
            <button
              ref={behaltenRef}
              type="button"
              onClick={() => {
                setFehler(null)
                setLoeschFrage(false)
              }}
              disabled={laeuft}
              aria-describedby="kontakt-loesch-folgen"
            >
              Behalten
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setFehler(null)
                setBearbeiten({})
              }}
            >
              Bearbeiten
            </button>
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
    </div>
  )
}

/**
 * Die zehn Felder — **einmal** für Bearbeiten UND Anlegen.
 *
 * Sie zweimal zu schreiben hieße, die nächste Änderung an zwei Stellen machen
 * zu müssen; welche Felder es gibt und in welcher Reihenfolge, steht deshalb
 * als Liste in `kontakte.ts` und nicht als Markup.
 *
 * **Ein echtes `<form>` mit `type="submit"`**, obwohl der Rest des Portals mit
 * Knöpfen arbeitet. Das ist der Grund: `type="email"` prüft die Form der
 * Adresse dann vom Browser aus, mitsamt Meldung in der Sprache des Nutzers und
 * Fokus auf dem falschen Feld. Selbst geprüft wäre es eine eigene
 * Zeichenkettenregel, die auf jeder zweiten echten Adresse falsch liegt.
 */
function Formular({
  titel,
  start,
  knopf,
  laufText,
  fokus,
  aufSichern,
  aufAbbrechen,
}: {
  titel: string
  start: Entwurf
  knopf: string
  laufText: string
  /**
   * Welches Feld den Fokus bekommt — gesetzt vom „+ hinzufügen"-Knopf, damit
   * der Weg vom leeren Feld ins Eingabefeld ein Klick bleibt. Ohne Angabe der
   * Vorname, also der Anfang.
   */
  fokus?: keyof Entwurf
  /** Schreibt und wirft bei Misserfolg. Der Entwurf bleibt dann stehen. */
  aufSichern: (entwurf: Entwurf) => Promise<void>
  aufAbbrechen: () => void
}) {
  const [entwurf, setEntwurf] = useState<Entwurf>(start)

  /**
   * Was ohne Eingabe herauskäme. Das Kürzel-Feld bleibt leer, wenn die Spalte
   * NULL ist (086: „rechne aus") — der Platzhalter zeigt trotzdem die
   * Ableitung, sonst wüsste niemand, was er gerade überschreibt.
   *
   * **Aus dem laufenden ENTWURF, nicht aus dem geladenen Kontakt.** Wer den
   * Nachnamen korrigiert, sieht die Ableitung mitwandern; sonst stünde beim
   * Tippen die alte da und nach dem Speichern in der Liste eine andere.
   * (Codex, 01.08.2026 — und es ist ein Prop weniger.)
   */
  const kuerzelPlatzhalter = initialen({
    vorname: entwurf.vorname,
    nachname: entwurf.nachname,
  })
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  /**
   * Der Riegel gegen doppeltes Absenden ist ein Ref, kein State: zwischen
   * `setLaeuft(true)` und dem sperrenden Render sehen Return-Taste und
   * Knopfdruck beide noch `false`. Beim Anlegen stünden danach zwei Kontakte in
   * der Liste — schlimmer als ein Fehler, weil es wie Erfolg aussieht.
   * (Gleiche Stelle wie im Schein-Formular.)
   */
  const inArbeit = useRef(false)

  const absenden = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inArbeit.current) return

    const problem = pruefeEntwurf(entwurf)
    if (problem) {
      setFehler(problem)
      return
    }

    inArbeit.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await aufSichern(entwurf)
    } catch (err) {
      // Der Entwurf bleibt vollständig stehen (Backlog E-R2): ein
      // gescheiterter Write darf die Eingabe nicht mitnehmen.
      setFehler(err instanceof Error ? err.message : 'Unbekannter Fehler beim Speichern.')
    } finally {
      inArbeit.current = false
      setLaeuft(false)
    }
  }

  return (
    <form className="gaeste-detail" onSubmit={absenden}>
      <h2 className="gaeste-detail-name">{titel}</h2>

      <div className="zentrale-inspektor-feld">
        {FELDER.map((f) => {
          const id = `kontakt-${f.key}`
          const gemeinsam = {
            id,
            value: entwurf[f.key],
            disabled: laeuft,
            autoFocus: (fokus ?? 'vorname') === f.key,
            onChange: (
              e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => setEntwurf((v) => ({ ...v, [f.key]: e.target.value })),
          }
          return (
            <div key={f.key}>
              <label htmlFor={id}>{f.label}</label>
              {f.art === 'mehrzeilig' ? (
                <textarea {...gemeinsam} rows={f.key === 'notiz' ? 3 : 2} />
              ) : (
                <input
                  {...gemeinsam}
                  type={f.art === 'email' ? 'email' : f.art === 'tel' ? 'tel' : f.art === 'date' ? 'date' : 'text'}
                  placeholder={f.key === 'kuerzel' ? kuerzelPlatzhalter : undefined}
                  // Ein Kürzel ist eine Kennung, keine Prosa: was der Besitzer
                  // tippt, soll genau so stehenbleiben.
                  autoCapitalize={f.key === 'kuerzel' ? 'none' : undefined}
                  autoCorrect={f.key === 'kuerzel' ? 'off' : undefined}
                  spellCheck={f.key === 'kuerzel' ? false : undefined}
                />
              )}
            </div>
          )
        })}

        {/* Kästchen statt Mehrfach-Auswahlliste: ein `<select multiple>`
            verlangt Strg-Klicken, und was gerade gewählt ist, sieht man erst
            beim Scrollen. Vier bzw. zwei Werte passen nebeneinander — alles
            sichtbar, ein Klick je Wert.

            `<fieldset>`/`<legend>` statt `<label>`: eine Beschriftung gehört zu
            EINEM Bedienelement. Wer sich die Seite vorlesen lässt, hört sonst
            „Schütze, Kontrollkästchen" ohne zu wissen, wozu die Gruppe gehört. */}
        {MEHRFACH.map((m, i) => (
          <fieldset key={m.key} className="gaeste-mehrfach" disabled={laeuft}>
            <legend>{m.label}</legend>
            {m.optionen.map((o, j) => (
              <label key={o.wert} className="gaeste-mehrfach-wahl">
                <input
                  type="checkbox"
                  checked={(entwurf[m.key] as readonly string[]).includes(o.wert)}
                  autoFocus={fokus === m.key && j === 0}
                  onChange={(e) =>
                    setEntwurf((v) => ({
                      ...v,
                      // Aus dem Entwurf entfernen und beim Setzen neu normieren:
                      // damit steht die Auswahl immer in Anzeigeordnung, egal in
                      // welcher Reihenfolge geklickt wurde. `aenderungen()`
                      // normiert ohnehin — hier geht es allein darum, dass die
                      // Kästchen und der Inspektor dieselbe Ordnung zeigen.
                      [m.key]: normiert(
                        e.target.checked
                          ? [...v[m.key], o.wert]
                          : v[m.key].filter((w: string) => w !== o.wert),
                        m.optionen,
                      ),
                    }))
                  }
                />
                {o.label}
              </label>
            ))}
            {i === MEHRFACH.length - 1 && (
              // Steht nur einmal, unter beiden Gruppen: der Satz gilt für beide
              // und wäre zweimal ein Hinweis, den niemand mehr liest.
              <p className="gaeste-mehrfach-hinweis">
                Mehrfach möglich — wer Schweißhundführer ist, kann zugleich Schütze sein.
              </p>
            )}
          </fieldset>
        ))}
      </div>

      {fehler && (
        <p className="zentrale-inspektor-fehler gaeste-meldung" role="alert">
          {fehler}
        </p>
      )}

      <div className="zentrale-inspektor-fuss gaeste-fuss">
        <button type="submit" className="haupt" disabled={laeuft}>
          {laeuft ? laufText : knopf}
        </button>
        <button type="button" onClick={aufAbbrechen} disabled={laeuft}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}

/**
 * Eine Zeile im Inspektor. Leer heißt **„+ hinzufügen"**, nicht „—".
 *
 * Das ist der einzige Beitrag des Design-Entwurfs, der in Block 1 offenblieb
 * (Übergabe 01.08.2026 §3): drei Striche sagen „hier ist nichts", ein Knopf
 * sagt „hier kann etwas hin" — und er ist zugleich der kürzeste Weg dorthin,
 * weil er das Formular an genau diesem Feld öffnet.
 */
function Feld({
  label,
  wert,
  gesperrt,
  aufNachtragen,
}: {
  label: string
  wert: string | null
  gesperrt: boolean
  aufNachtragen: () => void
}) {
  const text = (wert ?? '').trim()
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {text || (
          <button
            type="button"
            className="gaeste-nachtragen"
            onClick={aufNachtragen}
            disabled={gesperrt}
            // Acht Knöpfe mit demselben Text „+ hinzufügen". Wer die Liste
            // sieht, liest die Beschriftung links daneben mit; wer sie sich
            // vorlesen lässt, hört achtmal dasselbe und weiß nicht, welches
            // Feld er öffnet — das `<dt>` benennt den Knopf nicht.
            // (Codex, 01.08.2026.)
            aria-label={`${label} hinzufügen`}
          >
            + hinzufügen
          </button>
        )}
      </dd>
    </>
  )
}
