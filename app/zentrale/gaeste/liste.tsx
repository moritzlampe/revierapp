'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import {
  aenderungen,
  alsBerlinDatum,
  alsDatum,
  alsSpalten,
  anzeigeName,
  einladungsHinweis,
  einladungsweg,
  entwurfVon,
  initialen,
  kuerzelVon,
  istInaktiv,
  mehrfachText,
  normiert,
  kategorieLabel,
  zuordnungLabel,
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
 * **Die fünf Schreibwege liegen hier oben**, nicht in den Formularen darunter —
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
  /**
   * Die Rückfrage vor dem Entfernen (Entwurf B, 04.08.2026).
   *
   * **Sie friert die Markierung ein, und das ist keine Zugabe:** die Frage nennt
   * eine Zahl („bei 12 Kontakten"), und der Knopf daneben nennt sie auch. Blieben
   * die Kästchen bedienbar, träfe der Klick eine andere Menge als die, die
   * dasteht — eine Rückfrage, die über etwas anderes verhandelt als das, was
   * passiert, ist schlimmer als keine.
   */
  const [entfernenFrage, setEntfernenFrage] = useState(false)
  const zuordnungInArbeit = useRef(false)
  const behaltenRef = useRef<HTMLButtonElement>(null)
  const weitereRef = useRef<HTMLDetailsElement>(null)
  /** Ob die Rückfrage offen WAR — für die Fokus-Rückgabe, s. den Effekt unten. */
  const warGefragt = useRef(false)
  const gesperrt = neu || imEingriff
  /** Die Tabelle nimmt keine Markierung an, während geschrieben oder gefragt wird. */
  const markierenGesperrt = zuordnungLaeuft || entfernenFrage

  /**
   * Fokus auf **„Behalten"**, sobald die Rückfrage aufgeht — wörtlich dieselbe
   * Überlegung wie beim Kontakt-Löschen weiter unten: der gedrückte Knopf
   * verschwindet, und ohne das fiele der Fokus auf den Seitenanfang. Vor allem
   * aber macht ein zweites, reflexhaftes Enter aus der Rückfrage sonst eine
   * Bestätigung.
   */
  useEffect(() => {
    if (entfernenFrage) {
      warGefragt.current = true
      behaltenRef.current?.focus()
      return
    }
    // **Und zurück, wenn sie geschlossen wird** (Fremdprüfung 04.08.2026,
    // Paket A, Punkt 5). „Behalten" trägt den Fokus und verschwindet beim
    // Klick — ohne Rückgabe fiele er an den Seitenanfang, und wer per Tastatur
    // arbeitet, müsste sich zurücktabben. Dieselbe Bauform wie `warImFormular`
    // im Inspektor weiter unten: ein Ref merkt, dass es etwas zurückzugeben
    // gibt, damit der Effekt nicht beim ersten Rendern greift.
    if (!warGefragt.current) return
    warGefragt.current = false
    weitereRef.current?.querySelector<HTMLElement>('summary')?.focus()
  }, [entfernenFrage])

  /**
   * Die Zahlen an den Schaltern — **aus `sichtbare()` selbst, nicht aus einer
   * zweiten Formulierung derselben Bedingung** (Ponytail-Lesung 04.08.2026).
   *
   * Vorher stand hier `!istInaktiv(k) && einladungsweg(k) !== 'email'`, also das
   * Prädikat von `sichtbare()` ein zweites Mal — und im Selbsttest eine
   * Zusicherung, die die Übereinstimmung *bewies* statt sie *herzustellen*. Eine
   * Zahl, die etwas anderes zählt als der Klick zeigt, kann jetzt nicht mehr
   * entstehen: es gibt nur noch ein Prädikat.
   *
   * Leere Suche heißt „alles" — `passtZuSuche(k, '')` ist für jeden Kontakt wahr.
   */
  const zahl = useCallback(
    (f: Filter) => sichtbare(kontakte, '', f).length,
    [kontakte],
  )
  const aktive = useMemo(() => zahl('aktiv'), [zahl])
  const inaktive = useMemo(() => zahl('inaktiv'), [zahl])
  const ohneMail = useMemo(() => zahl('ohne_mail'), [zahl])

  /**
   * Stilllegen und Wiederaufnehmen — **ein eigener Write über EINE Spalte**,
   * niemals über den Formular-Patch daneben. Warum: s. `Kontakt.inaktiv_seit`
   * in `./kontakte`.
   */
  const zustandSetzen = useCallback(
    async (id: string, stilllegen: boolean) => {
      await schreibe('Der Kontakt', () =>
        createClient()
          .from('kontakte')
          .update({ inaktiv_seit: stilllegen ? new Date().toISOString() : null })
          .eq('id', id)
          .select('id'),
      )
      router.refresh()
    },
    [router],
  )
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
    // **`aktiv` ist die Voreinstellung und fällt aus der Adresse heraus**, nicht
    // mehr `alle`. Sonst trüge die nackte Adresse `/zentrale/gaeste` einen
    // anderen Zustand als dieselbe Adresse nach einem Klick auf „Aktive".
    if (neuerFilter === 'aktiv') p.delete('filter')
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
        // **Die Rückfrage geht mit der Markierung, auf die sie sich bezog.**
        // Bliebe sie stehen, verhandelte sie über „0 markiert" — und der Knopf
        // daneben hieße „Erst Gäste markieren", während darüber eine Warnung
        // über 12 Kontakte steht.
        setEntfernenFrage(false)
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

        {/* **Der Zustand steht zuerst, „Aktive" ist die Voreinstellung.** Der
            Zweck des Stilllegens ist, jemanden aus dem Weg zu haben — wer ihn
            weiter sieht, hat nichts gewonnen (Moritz, 04.08.2026).

            „Ohne E-Mail" ist die Arbeitsliste zum Nachtragen und der einzige Weg
            dorthin, denn eine fehlende Adresse ist als Abwesenheit nicht
            suchbar. Sie zeigt nur Aktive, s. `Filter` in `./kontakte`.

            **Der Schalter „streichen" ist entfallen**, weil er dieselbe Menge
            zeigte wie „Inaktive" — nur aus einem Freitext geraten statt am
            Zustand gelesen. Die Notiz bleibt an den Zeilen. */}
        <div className="gaeste-filter" role="group" aria-label="Liste filtern">
          <button
            type="button"
            className="gaeste-chip"
            aria-pressed={filter === 'aktiv'}
            onClick={() => filterGeaendert('aktiv')}
          >
            Aktive {aktive}
          </button>
          {/* Nur da, wenn es welche gibt — sonst ein Schalter, der auf eine
              leere Liste zeigt und fragen lässt, ob etwas kaputt ist.

              **`|| filter === 'inaktiv'` ist der Riegel dagegen, dass er unter
              den Füßen verschwindet** (Fremdprüfung 04.08.2026, Paket A, Punkt
              9): wer den letzten Stillgelegten wieder aufnimmt, stand sonst vor
              einer leeren Liste, deren aktiver Filter aus dem Markup gefallen
              war — kein Schalter gedrückt, nichts zu sehen, kein Weg zurück
              außer Raten. Er bleibt jetzt stehen und zeigt „Inaktive 0". */}
          {(inaktive > 0 || filter === 'inaktiv') && (
            <button
              type="button"
              className="gaeste-chip"
              aria-pressed={filter === 'inaktiv'}
              onClick={() => filterGeaendert('inaktiv')}
            >
              Inaktive {inaktive}
            </button>
          )}
          <button
            type="button"
            className="gaeste-chip"
            aria-pressed={filter === 'ohne_mail'}
            onClick={() => filterGeaendert('ohne_mail')}
          >
            Ohne E-Mail {ohneMail}
          </button>
          <button
            type="button"
            className="gaeste-chip"
            aria-pressed={filter === 'alle'}
            onClick={() => filterGeaendert('alle')}
          >
            Alle {kontakte.length}
          </button>
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
            setEntfernenFrage(false)
            setMarkiert(new Set())
            setZuordnen(zuordnen ? null : KATEGORIEN[0].wert)
          }}
          disabled={imEingriff || zuordnungLaeuft}
          aria-pressed={zuordnen !== null}
        >
          {/* „Kategorien zuordnen" statt „Mehrere zuordnen": „mehrere" benannte
              die Menge, nicht den Zweck — man erfuhr erst nach dem Klick, worum
              es geht. „Modus beenden" statt „Fertig", weil nichts abgeschlossen
              wird: jeder Klick war schon geschrieben. */}
          {zuordnen ? 'Modus beenden' : 'Kategorien zuordnen'}
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

      {/* **Die Auftragsleiste** (Entwurf B, 04.08.2026, von Moritz gewählt).
          Beide Schritte numeriert untereinander in DERSELBEN Spur, die
          erzeugende Handlung neben ihrem Zähler. Die Vorgängerin riss
          `space-between` über 1200 px auseinander — s. `.gaeste-auftrag` in
          `./gaeste.css`.

          **Die Kategorie steht VOR der Auswahl**, Moritz' Vorgabe vom 03.08.:
          „erst auf Schützen klicken, dann alle anwählen die als Schütze
          eingeladen werden sollen." */}
      {zuordnen ? (
        <div className="gaeste-auftrag">
          <div className="gaeste-auftrag-schritt">
            <span className="gaeste-auftrag-nr" aria-hidden="true">
              1
            </span>
            <span className="gaeste-auftrag-was">Kategorie</span>
            <div className="gaeste-auftrag-wahl" role="group" aria-label="Kategorie zum Zuordnen">
              {KATEGORIEN.map((kat) => (
                <button
                  key={kat.wert}
                  type="button"
                  // **`gaeste-chip`, nicht `jagden-chip`** (04.08.2026, von
                  // Moritz beim ersten Durchklicken gefunden): `jagden.css` wird
                  // nur von `../jagden/page.tsx` importiert. Auf DIESER Seite
                  // war `jagden-chip` eine Klasse ohne jede Regel — der aktive
                  // Zustand war unsichtbar, der Schalter sah aus wie ein Knopf,
                  // der nichts tut. Und zwar nur beim direkten Laden: kam man
                  // per Klick von der Jagdliste, hing deren Stylesheet noch im
                  // Dokument und es sah richtig aus.
                  className="gaeste-chip"
                  aria-pressed={zuordnen === kat.wert}
                  disabled={markierenGesperrt}
                  onClick={() => setZuordnen(kat.wert)}
                >
                  {/* „· ausgewählt" trägt den Zustand als WORT mit, nicht nur
                      als Fläche — dieselbe Haltung wie „Status immer als
                      Text-Pill, nie nur über Farbe" (Zentrale-Konzept §2.4). */}
                  {kat.label}
                  {zuordnen === kat.wert ? ' · ausgewählt' : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="gaeste-auftrag-schritt">
            <span className="gaeste-auftrag-nr" aria-hidden="true">
              2
            </span>
            <span className="gaeste-auftrag-was">Gäste</span>
            <span className="gaeste-auftrag-stand" aria-live="polite">
              {markiert.size === 0 ? 'Niemand markiert' : `${markiert.size} markiert`}
            </span>

            {entfernenFrage ? (
              /* **Rückfrage nach dem Muster des Kontakt-Löschens** (s. `Details`
                 weiter unten): Warnzeile plus getauschte Knöpfe, Fokus auf der
                 harmlosen Seite. Kein Dialog — die Seite hat keinen, und einer
                 nur hierfür wäre ein zweites Muster für dieselbe Frage.

                 **Nur „Entfernen" fragt zurück, „Hinzufügen" nicht.** Additiv
                 zuordnen ist mit demselben Weg zurückgenommen; entfernen kann
                 eine Marke treffen, die jemand vor Wochen einzeln gesetzt hat. */
              <>
                <button
                  type="button"
                  className="haupt"
                  disabled={zuordnungLaeuft}
                  aria-describedby="gaeste-entfernen-folgen"
                  onClick={() => void massenZuordnung('entfernen')}
                >
                  {zuordnungLaeuft
                    ? 'Wird gespeichert …'
                    : zuordnungLabel(zuordnen, markiert.size, 'entfernen')}
                </button>
                <button
                  ref={behaltenRef}
                  type="button"
                  disabled={zuordnungLaeuft}
                  aria-describedby="gaeste-entfernen-folgen"
                  onClick={() => setEntfernenFrage(false)}
                >
                  Behalten
                </button>
              </>
            ) : (
              <>
                {/* **Der Knopf trägt den ganzen Satz** — Kategorie, Anzahl,
                    Richtung. Ohne Auswahl nennt er stattdessen die fehlende
                    Vorbedingung, statt als gesperrter Knopf eine Handlung an
                    0 Gästen zu versprechen. */}
                <button
                  type="button"
                  className="haupt"
                  disabled={zuordnungLaeuft || markiert.size === 0}
                  onClick={() => void massenZuordnung('hinzufuegen')}
                >
                  {zuordnungLaeuft
                    ? 'Wird gespeichert …'
                    : zuordnungLabel(zuordnen, markiert.size, 'hinzufuegen')}
                </button>

                {/* **`<details>` statt eines gebauten Menüs.** Aufklappen,
                    Fokusfolge und Klick-nach-außen macht der Browser —
                    Escape NICHT, s. unten. Es steht nur da, wenn etwas markiert
                    ist: ein Rückweg für niemanden ist keiner.
                    Beim Öffnen der Rückfrage wird es AUSGEBAUT und kommt
                    geschlossen zurück; ein `open`-State wäre ein zweiter Ort für
                    dieselbe Wahrheit.

                    **Escape schließt es von Hand** (Fremdprüfung 04.08.2026,
                    Paket A, Punkt 5): `<details>` bringt das nicht mit, und der
                    Kommentar behauptete vorher, der Browser erledige es. Ohne
                    das bleibt ein Tastaturnutzer im offenen Fach stehen. */}
                {markiert.size > 0 ? (
                  <details
                    className="gaeste-weitere"
                    ref={weitereRef}
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return
                      const d = e.currentTarget
                      if (!d.open) return
                      d.open = false
                      d.querySelector('summary')?.focus()
                    }}
                  >
                    <summary>Weitere</summary>
                    <button
                      type="button"
                      disabled={zuordnungLaeuft}
                      onClick={() => {
                        setZuordnungFehler(null)
                        setEntfernenFrage(true)
                      }}
                    >
                      {zuordnungLabel(zuordnen, markiert.size, 'entfernen')} …
                    </button>
                  </details>
                ) : null}
              </>
            )}
          </div>

          {entfernenFrage ? (
            <p id="gaeste-entfernen-folgen" className="zentrale-inspektor-warnung gaeste-meldung">
              Die Kategorie „{kategorieLabel(zuordnen)}&ldquo; wird bei {markiert.size}{' '}
              {markiert.size === 1 ? 'Kontakt' : 'Kontakten'} entfernt. Andere
              Kategorien dieser Kontakte bleiben erhalten.
            </p>
          ) : null}

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
                    <th scope="col" className="gaeste-haken gaeste-haken-kopf">
                      {/* Ein Kästchen im Kopf, das alles Sichtbare erfasst —
                          bei 154 Zeilen der eigentliche Zeitgewinn. Es wirkt
                          NUR auf das, was Suche und Filter gerade zeigen; die
                          Auswahl ist die sichtbare Liste, der Haken führt sie
                          nur aus.

                          **Die Zahl steht als Wort daneben** (Entwurf B): „alle
                          markieren" ließe offen, wie viele das gerade sind —
                          nach einem Filter sind es 26 und nicht 154, und genau
                          diese Verwechslung ist der Sammelklick, der zu weit
                          greift. Der Tabellenkopf ist ohnehin `sticky`, die
                          Angabe bleibt beim Blättern stehen. */}
                      <label className="gaeste-alle">
                        <input
                          type="checkbox"
                          checked={zeilen.length > 0 && zeilen.every((z) => markiert.has(z.id))}
                          // Teilzustand: sichtbar gemacht, nicht nur behauptet —
                          // sonst sieht „ein paar markiert" wie „keiner" aus.
                          //
                          // **Über die SICHTBAREN, nicht über `markiert.size`**
                          // (Fremdprüfung 04.08.2026, Paket A, Punkt 8): die
                          // Auswahl überlebt den Filterwechsel. Sind nur
                          // unsichtbare Kontakte markiert, meldete das Kästchen
                          // „Alle N sichtbaren" sonst `mixed`, obwohl von diesen
                          // N keiner markiert ist — eine Aussage über eine
                          // andere Menge als die, an der sie steht.
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                zeilen.some((z) => markiert.has(z.id)) &&
                                !zeilen.every((z) => markiert.has(z.id))
                          }}
                          disabled={markierenGesperrt || zeilen.length === 0}
                          onChange={(e) =>
                            setMarkiert(
                              e.target.checked ? new Set(zeilen.map((z) => z.id)) : new Set(),
                            )
                          }
                        />
                        Alle {zeilen.length} sichtbaren
                      </label>
                    </th>
                  ) : null}
                  <th scope="col">Name</th>
                  <th scope="col">Begleitung</th>
                  <th scope="col">Notiz</th>
                  {/* **Der Geburtstag fällt im Modus weg** (Entwurf B): beim
                      Einordnen von 154 Zeilen entscheidet man am Namen, an der
                      Begleitung und an der Notiz — das Datum trägt dabei nichts
                      und kostet die Breite, die der Markier-Kopf braucht. Im
                      Inspektor steht es weiter. */}
                  {zuordnen ? null : <th scope="col">Geburtstag</th>}
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
                      if (markierenGesperrt) return
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
                          disabled={markierenGesperrt}
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
                      {/* **Als Wort, nicht nur zurückgenommen dargestellt.**
                          Unter „Alle" stehen Aktive und Stillgelegte
                          nebeneinander; ein blasserer Ton allein wäre eine
                          Zustandsangabe über Farbe (Zentrale-Konzept §2.4
                          verbietet das ausdrücklich). */}
                      {istInaktiv(z) ? (
                        <span className="gaeste-inaktiv-marke"> inaktiv</span>
                      ) : null}
                    </td>
                    <td>{z.begleitung || '—'}</td>
                    <td className="gaeste-notiz">{z.notiz || '—'}</td>
                    {zuordnen ? null : <td className="num">{alsDatum(z.geburtstag)}</td>}
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
              aufZustand={zustandSetzen}
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
  aufZustand,
}: {
  kontakt: Kontakt
  /** Meldet nach oben, dass die Liste gesperrt gehört. */
  aufModus: (imEingriff: boolean) => void
  /** Schreibt und wirft bei Misserfolg — die Fehlermeldung landet im Formular. */
  aufSpeichern: (id: string, patch: Record<string, string | string[] | null>) => Promise<void>
  /** Löscht und wirft bei Misserfolg — die Rückfrage bleibt dann stehen. */
  aufLoeschen: (id: string) => Promise<void>
  /** Stilllegen oder wieder aufnehmen. **Eigener Weg, nicht `aufSpeichern`.** */
  aufZustand: (id: string, stilllegen: boolean) => Promise<void>
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

  /**
   * Stilllegen/Wiederaufnehmen. Keine Rückfrage, weil derselbe Knopf der
   * Rückweg ist; ein Fehlschlag bleibt aber sichtbar stehen.
   */
  const zustandWechseln = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      await aufZustand(kontakt.id, !istInaktiv(kontakt))
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler beim Ändern des Zustands.')
    } finally {
      setLaeuft(false)
    }
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

      {/* **Der Zustand steht als eigene Zeile, nicht als Feld in der Liste
          darüber.** Er ist kein Stammdatum des Menschen, sondern eine
          Entscheidung über ihn — und er wird nicht wie die Felder über „+
          hinzufügen" und das Formular gepflegt, sondern über einen eigenen
          Write (s. `zustandSetzen` oben). Stünde er zwischen Geburtstag und
          Kategorien, wäre genau das nicht zu sehen. */}
      {istInaktiv(kontakt) && (
        <p className="gaeste-zustand">
          Stillgelegt seit {alsBerlinDatum(kontakt.inaktiv_seit)} — wird nicht
          mehr zum Einladen angeboten.
        </p>
      )}

      {/* Der Bildschirm sagt, WOFÜR der Kontakt unvollständig ist — er
          verweigert nichts (Konzept §4). Neutraler Ton, kein Alarmrot: eine
          fehlende Adresse ist kein Feldalarm (Zentrale-Konzept §2.6).

          **Bei einem stillgelegten Kontakt entfällt er:** „Für eine Einladung
          fehlt die E-Mail" ist eine Aufforderung, und niemand soll aufgefordert
          werden, einen Kontakt zu vervollständigen, den er gerade aus dem Weg
          geräumt hat. */}
      {hinweis && !istInaktiv(kontakt) && <p className="gaeste-hinweis">{hinweis}</p>}

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
            {/* **Gesperrt, solange ein Write läuft** (Fremdprüfung 04.08.2026,
                Paket A, Punkt 1). Sonst öffnet ein Klick das Formular, der
                frühe Return darunter verdeckt die Fehlermeldung — und ein
                gescheitertes Stilllegen sähe aus wie ein gelungenes. Genau der
                Riegel, den die Felder darüber mit `gesperrt` schon haben; dieser
                Knopf hatte ihn als einziger nicht. */}
            <button
              type="button"
              disabled={laeuft}
              onClick={() => {
                setFehler(null)
                setBearbeiten({})
              }}
            >
              Bearbeiten
            </button>
            {/* **Der Zustandswechsel steht neben „Bearbeiten", nicht neben
                „Löschen".** Er ist umkehrbar und braucht deshalb keine
                Rückfrage — der Knopf selbst ist der Rückweg, und er benennt
                beide Richtungen. Löschen daneben bleibt das Unumkehrbare mit
                seiner Rückfrage. */}
            <button
              type="button"
              disabled={laeuft}
              onClick={() => void zustandWechseln()}
            >
              {laeuft
                ? 'Speichert …'
                : istInaktiv(kontakt)
                  ? 'Wieder aufnehmen'
                  : 'Stilllegen'}
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
