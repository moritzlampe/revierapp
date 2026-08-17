'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Punkt } from '../revierkarte-map'
import { schreibe, schreibeViele } from '../schreiben'
import { sichtbarerName } from '../namen'
import { gruppenDiff, markierungAus, type Standgruppe } from './standgruppen'

/**
 * Standgruppen — Portal-Phase 4b, Schnitt 2 (Migration 112).
 *
 * Was hier geht: Gruppen anlegen, umbenennen, löschen und ihre **Standmenge**
 * auf der Karte festlegen. Was NICHT geht: eine Gruppe in ein Treiben kopieren
 * (das ist Paket C und wohnt im Treiben-Bereich, weil es dort geklickt wird),
 * und eine Anstell-Reihenfolge innerhalb der Gruppe (`Treiben_V1` §9, vertagt —
 * eine Gruppe ist eine MENGE, und die Tabelle hat kein `sequence`).
 *
 * **Modelliert auf `jagden/[id]/treiben-bereich.tsx`, nicht daraus abgeleitet.**
 * Die beiden teilen die Bedienung (Liste, Editor, Karte mit Mehrfachauswahl),
 * aber nicht die Daten: ein Treiben hat Status, Reihenfolge und Ad-hoc-Sitze,
 * eine Gruppe hat nichts davon. Eine gemeinsame Komponente müsste all das
 * optional führen und wäre an jeder Stelle eine Fallunterscheidung.
 *
 * ponytail: zweite Fassung derselben Bedienfläche. Zusammenlegen, sobald eine
 * dritte dazukommt — dieselbe Schwelle, an der `namen.ts` entstanden ist.
 */

// react-leaflet fasst beim Import `window` an — `ssr:false` ist Pflicht, und
// `next/dynamic` mit `ssr:false` geht nur aus einer Client-Komponente heraus.
const Karte = dynamic(() => import('../revierkarte-map'), {
  ssr: false,
  loading: () => <div className="revier-gruppen-karte-platzhalter">Karte wird geladen …</div>,
})

export default function StandgruppenBereich({
  revierId,
  gruppen,
  punkte,
  sichtbareIds,
  grenze,
}: {
  revierId: string
  gruppen: Standgruppe[]
  /** Was WÄHLBAR ist: nur Standtypen. Gefiltert in `page.tsx`. */
  punkte: Punkt[]
  /**
   * Was der Nutzer SEHEN kann: alle Kartenobjekte des Reviers, jeden Typs.
   *
   * **Zwei Mengen statt einer, und das ist ein Befund der Fremdprüfung**
   * (Codex 17.08.2026, Nr. 5, `[medium]`). Vorher war `sichtbar` aus `punkte`
   * abgeleitet, also aus der wählbaren Menge — dann ist ein Mitglied, dessen
   * Objekt jemand vom Hochsitz zum Parkplatz umtypt, plötzlich „unsichtbar"
   * und damit **gefangen**: es zählt in der Gruppe mit, steht nicht auf der
   * Karte, und `gruppenDiff` schützt es wie einen Papierkorb-Stand. Nur die
   * ganze Gruppe zu löschen hätte geholfen.
   *
   * **Der Umtyp-Weg liegt auf DERSELBEN Seite** — der Objekt-Inspektor der
   * Revierkarte darüber. Meine erste Fassung hielt das für folgenlos; das war
   * die schwächere von zwei Begründungen und sie trug nicht.
   *
   * Getrennt heißt: umgetypt → sichtbar, aber nicht wählbar → beim nächsten
   * Speichern abgewählt (der Zähler weist es als `−N` aus, bevor gespeichert
   * wird). Weich gelöscht → gar nicht sichtbar → bleibt geschützt.
   *
   * **Diese Trennung allein genügte NICHT, und das hat erst die Schlusslesung
   * gefunden** (17.08.2026, F1): `oeffnen()` seedete `markiert` weiterhin mit
   * ALLEN Mitgliedern, das umgetypte war damit angetippt und fiel aus
   * `entfernen` heraus — der Satz oben beschrieb ein Verhalten, das es nicht
   * gab. Zweite Hälfte des Fixes ist `markierungAus()`.
   */
  sichtbareIds: string[]
  grenze: [number, number][][] | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [offenId, setOffenId] = useState<string | null>(null)
  const [markiert, setMarkiert] = useState<ReadonlySet<string>>(() => new Set())
  const [name, setName] = useState('')
  const [neu, setNeu] = useState('')
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  /**
   * Der Doppelklick-Riegel ist ein **Ref**, kein State (S5). Zwei schnelle Tipps
   * kommen beide durch, bevor React neu gerendert hat — `laeuft` allein sperrt
   * nur die Anzeige, nicht den zweiten Aufruf.
   */
  const laeuftRef = useRef(false)

  /**
   * Kinomodus und Vollbild, dieselbe Bedienung wie an der Revierkarte darüber
   * und am Treiben-Bereich. Bei 196 Objekten in Söder ist die Karte in 420 px
   * die falsche Größe, um zwanzig Stände auseinanderzuhalten.
   *
   * Der `fullscreenchange`-Listener ist der Teil, den man vergisst: der Browser
   * verlässt das Vollbild auch per ESC oder Geste, ohne unseren Knopf zu fragen.
   * Die Wahrheit ist `document.fullscreenElement`, nicht unser State.
   */
  const kasten = useRef<HTMLDivElement>(null)
  const [voll, setVoll] = useState(false)
  const [kino, setKino] = useState(false)

  useEffect(() => {
    const wechsel = () =>
      // `kasten.current !== null` ist der Riegel: der Editor wird per `offenId`
      // bedingt gerendert, nach dem Speichern räumt `schliessen()` ihn weg. Dann
      // ist `kasten.current` null — und ohne aktives Vollbild ist
      // `document.fullscreenElement` es auch. `null === null` wäre wahr, `voll`
      // stünde auf `true` ohne Vollbild, und der Kino-Knopf verschwände.
      // (Fremdprüfung 10.08.2026, K2, am Treiben-Bereich gefunden.)
      setVoll(kasten.current !== null && document.fullscreenElement === kasten.current)
    document.addEventListener('fullscreenchange', wechsel)
    return () => document.removeEventListener('fullscreenchange', wechsel)
  }, [])

  // ESC verlässt den Kinomodus — seit er ein Fenster-Overlay ist, verdeckt er
  // die ganze Seite, und eine Fläche, die alles verdeckt, muss auf die Taste
  // hören, mit der man Überlagerungen schließt. Das Vollbild bekommt seine
  // ESC-Behandlung vom Browser.
  useEffect(() => {
    if (!kino) return
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKino(false)
    }
    document.addEventListener('keydown', taste)
    return () => document.removeEventListener('keydown', taste)
  }, [kino])

  const vollUmschalten = () => {
    if (voll) {
      document.exitFullscreen().catch(() => {})
    } else {
      // Kann vom Browser abgelehnt werden (Berechtigung, iframe) — dann bleibt
      // es beim eingebetteten Kasten, ohne unbehandelte Rejection.
      kasten.current?.requestFullscreen().catch(() => {})
    }
  }

  const offen = gruppen.find((g) => g.id === offenId) ?? null

  /**
   * Die Menge, deren Fehlen der Nutzer BEMERKEN würde. Geht so in `gruppenDiff`
   * und ist dort der Riegel, der die Mitgliedschaft eines weich gelöschten
   * Stands überleben lässt: die kann niemand sehen, also darf sie kein
   * Kartenklick entfernen.
   */
  const sichtbar = new Set(sichtbareIds)

  /** Was auf der Karte steht und damit angetippt werden kann. */
  const waehlbar = new Set(punkte.map((p) => p.id))

  const diff = offen
    ? gruppenDiff(offen.staende, markiert, sichtbar)
    : { entfernen: [], legen: [] }
  const nameNeu = sichtbarerName(name)
  const nameGeaendert = offen !== null && nameNeu.length > 0 && nameNeu !== offen.name

  /**
   * **Ein leeres Namensfeld sperrt das Speichern — und der erste Entwurf ließ
   * es durch** (Fremdprüfung Codex 17.08.2026, Nr. 6, `[medium]`).
   *
   * `nameGeaendert` wird bei leerem Namen absichtlich `false`, damit niemand
   * eine Gruppe namenlos macht. Das allein genügt aber nicht: hat der Nutzer
   * gleichzeitig einen Stand angetippt, ist `nichtsZuTun` trotzdem `false` —
   * `speichern()` lief, überging das Namens-UPDATE stillschweigend, schrieb die
   * Standmenge und schloss den Editor. Der Nutzer bekam **Erfolg gemeldet für
   * ein Formular, dessen geleertes Feld niemand übernommen hat.** Genau der
   * S4-Fall: ein Fehler, der sich als gültige Auskunft liest.
   *
   * Jetzt ist es ein sichtbarer Zustand mit eigener Meldung, kein
   * Übergehen. `nichtsZuTun` bleibt davon unberührt — „nichts zu tun" und
   * „ungültig" sind zwei verschiedene Gründe, den Knopf zu sperren.
   */
  const nameLeer = offen !== null && nameNeu.length === 0
  const nichtsZuTun = diff.entfernen.length === 0 && diff.legen.length === 0 && !nameGeaendert

  /**
   * **Der doppelte Name ist ein UI-Gate vor einem echten Riegel, keine zweite
   * Wahrheit.** `UNIQUE (district_id, name)` aus Migration 112 hält ihn; das
   * hier erspart dem Nutzer nur die Rohmeldung `23505`.
   *
   * Verglichen wird **zeichengenau, nicht case-insensitiv** — genau wie der
   * Constraint. Ein `toLowerCase()` sperrte „sauberg" neben „Sauberg", obwohl
   * die DB beide nebeneinander erlaubt: ein Gate, das mehr verbietet als die
   * Regel dahinter, ist ein Fehler, kein Extra.
   *
   * Verglichen wird gegen den GESPEICHERTEN Wert, weil hier auch der
   * gespeicherte Wert entsteht (Entscheidung Moritz 17.08.2026, s. `anlegen`).
   *
   * **Kein `kandidat.length > 0`-Frühausstieg**, obwohl er im ersten Entwurf
   * stand: `standgruppen_name_nicht_leer` verbietet den leeren Namen in der DB,
   * kein `g.name` kann also leer sein — die Bedingung hätte nie ein anderes
   * Ergebnis erzeugt. Ein Prädikat, das nichts entscheidet, sieht beim nächsten
   * Lesen wie eine Prüfung aus.
   */
  const vergeben = (kandidat: string, ausserId?: string) =>
    gruppen.some((g) => g.id !== ausserId && g.name === kandidat)

  const neuName = sichtbarerName(neu)
  const neuVergeben = vergeben(neuName)
  const umbenennenVergeben = vergeben(nameNeu, offen?.id)

  function oeffnen(g: Standgruppe) {
    setOffenId(g.id)
    // `markierungAus`, NICHT `new Set(g.staende)` — s. die Begründung dort
    // (Schlusslesung 17.08.2026, F1). Ein nicht wählbares Mitglied darf nicht
    // als angetippt starten, sonst kann es niemand mehr abwählen.
    setMarkiert(markierungAus(g.staende, waehlbar))
    setName(g.name)
    setFehler(null)
    // **Auch die Kartengröße zurücksetzen** (Schlusslesung F3). `schliessen()`
    // tut es, aber der Editor kann auch OHNE `schliessen()` verschwinden: wird
    // die offene Gruppe anderswo gelöscht, nimmt der nächste `router.refresh()`
    // sie aus `gruppen`, `offen` wird `null` und der Kasten fällt aus dem Baum.
    // `kino` bliebe dann stehen, und das nächste „Stände wählen" öffnete
    // ungefragt im Vollflächen-Overlay. Dasselbe Phantom, das der Kommentar in
    // `schliessen()` fürs Vollbild beschreibt — nur über den anderen Weg.
    setKino(false)
    setLoeschFrage(null)
  }

  function schliessen() {
    // Vollbild verlassen, BEVOR der Kasten aus dem Baum fällt: sonst räumt der
    // Browser es selbst ab, das `fullscreenchange`-Ereignis trifft auf einen
    // bereits entfernten Kasten, und beim nächsten Öffnen stünde die Karte im
    // Kinomodus, ohne dass jemand ihn gewählt hat.
    if (kasten.current && document.fullscreenElement === kasten.current) {
      document.exitFullscreen().catch(() => {})
    }
    setVoll(false)
    setKino(false)
    setOffenId(null)
    setMarkiert(new Set())
    setName('')
    setFehler(null)
  }

  function umschalten(standId: string) {
    // **Der Riegel sitzt HIER, nicht an der Prop** — das ist die Falle, die
    // Schnitt 1 Geld gekostet hat. `aufAuswahl={busy ? undefined : umschalten}`
    // sperrt zwar korrekt, kippt aber bei jedem Speichervorgang den
    // Marker-`key` von „waehlbar" auf „starr" und zurück (`revierkarte-map.tsx`
    // :284), und Leaflet wertet `interactive` nur beim Anlegen aus. Bei Söder
    // sind das ~190 CircleMarker samt Tooltips, zweimal je Speichern.
    if (laeuftRef.current) return
    setMarkiert((vorher) => {
      const nachher = new Set(vorher)
      if (!nachher.delete(standId)) nachher.add(standId)
      return nachher
    })
  }

  /**
   * Ein Schreibvorgang, ein Riegel, eine Fehlerzeile.
   *
   * `startTransition` um `router.refresh()`: ohne es ist `laeuft` sofort wieder
   * false, während der Refresh noch unterwegs ist — die Props tragen dann kurz
   * den ALTEN Stand und der Knopf lebt auf.
   */
  async function fuehreAus(was: string, arbeit: () => Promise<void>, danach?: () => void) {
    if (laeuftRef.current) return
    laeuftRef.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await arbeit()
      danach?.()
      startTransition(() => router.refresh())
    } catch (e) {
      // Der Fehler wird ausgewiesen, nicht verschluckt. Häufigste Ursache ist
      // ein veralteter Stand: ein parallel entferntes Mitglied (0 statt 1
      // betroffen) oder ein doppelter Name (23505 am UNIQUE).
      setFehler(`${was} fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`)

      // **Auch der Fehlschlag lädt neu.** `speichern()` macht bis zu drei
      // Writes; scheitert der zweite, ist der erste bereits geschrieben — ohne
      // diesen Refresh zeigte die Seite bis zum manuellen Neuladen einen Stand,
      // den es in der DB nicht mehr gibt.
      //
      // Der Editor bleibt bewusst OFFEN und `markiert` unangetastet: die Auswahl
      // ist die Absicht des Nutzers, und `diff` rechnet sie nach dem Refresh
      // gegen den frischen Stand neu.
      startTransition(() => router.refresh())
    } finally {
      laeuftRef.current = false
      setLaeuft(false)
    }
  }

  const busy = laeuft || pending

  /**
   * Die Sektion trägt **`zentrale-block`**, keine eigene Klasse (Selbstlesung
   * 17.08.2026): `.zentrale-block h2` ist die **einzige** h2-Regel des Portals
   * (uppercase, gesperrt, sekundär). Ohne sie fiele die Überschrift auf den
   * Browser-Default zurück und sähe anders aus als jede andere
   * Bereichsüberschrift der Zentrale. Das Vorbild `treiben-bereich.tsx` hat
   * diesen Fehler — nicht mitgeändert, fremder Schnitt.
   */

  function anlegen() {
    // **Gespeichert wird, was geprüft wurde** (Entscheidung Moritz, 17.08.2026,
    // PWA-Übergabe §4). `sichtbarerName()` liefert hier den SPEICHERWERT, nicht
    // nur einen Prüfwert — anders als bei `districts.name`, wo es keinen UNIQUE
    // gibt und deshalb auch keinen Fall, den das Strippen verhindern könnte.
    //
    // Der Grund ist der Weg, auf dem so ein Zeichen hereinkommt: kopiert aus
    // Mail, WhatsApp oder Excel, nie getippt. Zwei optisch identische
    // Gruppennamen fielen beim Anlegen niemandem auf, sondern erst am
    // Jagdmorgen beim Antippen der falschen; mit dem Strippen greift
    // `UNIQUE (district_id, name)` sofort und sichtbar.
    // Preis, angenommen: ein zusammengesetztes Emoji im Namen zerfällt.
    if (neuName.length === 0 || neuVergeben) return
    void fuehreAus(
      'Die Standgruppe anlegen',
      async () => {
        const client = createClient()
        await schreibe('Die Standgruppe', () =>
          client
            .from('standgruppen')
            .insert({ district_id: revierId, name: neuName })
            .select('id'),
        )
      },
      () => setNeu(''),
    )
  }

  function speichern() {
    if (!offen || nichtsZuTun || umbenennenVergeben || nameLeer) return
    void fuehreAus(
      'Das Speichern',
      async () => {
        const client = createClient()

        if (nameGeaendert) {
          await schreibe('Der Name der Standgruppe', () =>
            client.from('standgruppen').update({ name: nameNeu }).eq('id', offen.id).select('id'),
          )
        }

        /**
         * **Erst LEGEN, dann entfernen.** Die Writes sind getrennte
         * Transaktionen; PostgREST kennt keine Klammer darum. Bricht der zweite
         * ab, bleibt ein Zwischenzustand stehen — die Frage ist also nicht OB,
         * sondern WELCHER:
         *
         * - erst entfernen: Stände sind aus der Gruppe raus, die neuen fehlen.
         * - erst legen: die Gruppe trägt kurz zu VIELE Stände. Sichtbar auf der
         *   Karte, mit einem zweiten Speichern behoben.
         *
         * Die beiden Mengen sind disjunkt (`entfernen` sind Mitglieder ohne
         * Markierung, `legen` sind Markierungen ohne Mitgliedschaft) — die
         * Reihenfolge kann also nicht in den Primärschlüssel laufen.
         */
        if (diff.legen.length > 0) {
          await schreibeViele('Die neuen Stände', diff.legen.length, () =>
            client
              .from('standgruppen_staende')
              .insert(
                diff.legen.map((mapObjectId) => ({
                  gruppe_id: offen.id,
                  map_object_id: mapObjectId,
                })),
              )
              .select('map_object_id'),
          )
        }
        if (diff.entfernen.length > 0) {
          // `.eq('gruppe_id', …)` ist nicht redundant neben `.in(…)`: der
          // Primärschlüssel ist zusammengesetzt, `map_object_id` allein trifft
          // denselben Stand in JEDER Gruppe des Reviers.
          await schreibeViele('Die abgewählten Stände', diff.entfernen.length, () =>
            client
              .from('standgruppen_staende')
              .delete()
              .eq('gruppe_id', offen.id)
              .in('map_object_id', diff.entfernen)
              .select('map_object_id'),
          )
        }
      },
      schliessen,
    )
  }

  function loeschen(g: Standgruppe) {
    void fuehreAus(
      'Das Löschen',
      async () => {
        const client = createClient()
        await schreibe('Die Standgruppe', () =>
          client.from('standgruppen').delete().eq('id', g.id).select('id'),
        )
      },
      () => {
        setLoeschFrage(null)
        if (offenId === g.id) schliessen()
      },
    )
  }

  return (
    <section className="zentrale-block" aria-labelledby="revier-gruppen-titel">
      <h2 id="revier-gruppen-titel">Standgruppen</h2>
      <p className="zentrale-sub">
        Benannte Standmengen, die jedes Jahr wiederkehren — &bdquo;Sauberg&ldquo;,
        &bdquo;Betonstraße&ldquo;. Eine Gruppe ist eine Vorlage: ein Treiben kopiert daraus, es
        verweist nicht darauf.
      </p>

      {fehler && (
        <p className="zentrale-fehler" role="alert">
          {fehler}
        </p>
      )}

      {gruppen.length === 0 ? (
        <p className="zentrale-leer">
          Noch keine Standgruppe angelegt.
        </p>
      ) : (
        <ul className="revier-gruppen-liste" role="list">
          {gruppen.map((g) => {
            /**
             * **Mitglieder im Papierkorb gehören ausgewiesen.** Sie zählen in
             * der Pille mit, stehen aber nicht auf der Karte und lassen sich
             * hier nicht abwählen — ohne diesen Hinweis sucht der Revierinhaber
             * einen Stand, den er nie findet. Dieselbe Bauform wie
             * „(N aus der App)" bei den Treiben, und dieselbe Stelle: als
             * Variable vor dem `return`, nicht als IIFE im JSX.
             *
             * **Der Text darf „Papierkorb" sagen, seit `sichtbar` alle
             * Objekttypen kennt.** Vorher zählte er auch umgetypte Stände mit,
             * und für die war er falsch; jetzt ist ein Mitglied genau dann
             * unsichtbar, wenn seine `map_objects`-Zeile weich gelöscht ist —
             * hart gelöscht kann sie nicht sein, das nähme der Fremdschlüssel
             * per CASCADE mit.
             */
            const imPapierkorb = g.staende.filter((id) => !sichtbar.has(id)).length
            return (
            <li key={g.id} className="revier-gruppen-zeile">
              <div className="revier-gruppen-kopf">
                <span className="revier-gruppen-name">{g.name}</span>
                <span className="zentrale-pill">
                  {g.staende.length} {g.staende.length === 1 ? 'Stand' : 'Stände'}
                </span>
                {imPapierkorb > 0 && (
                  <span className="zentrale-pill">{imPapierkorb} im Papierkorb</span>
                )}
              </div>

              <div className="revier-gruppen-knoepfe">
                <button
                  type="button"
                  className="zentrale-knopf"
                  onClick={() => (offenId === g.id ? schliessen() : oeffnen(g))}
                  disabled={busy}
                >
                  {offenId === g.id ? 'Schließen' : 'Stände wählen'}
                </button>

                {loeschFrage === g.id ? (
                  <>
                    <span className="revier-gruppen-frage">
                      Löschen? Die {g.staende.length} zugeordneten Stände verlieren nur ihre
                      Zugehörigkeit — die Stände selbst bleiben auf der Karte.
                    </span>
                    <button
                      type="button"
                      className="zentrale-knopf"
                      onClick={() => loeschen(g)}
                      disabled={busy}
                    >
                      Ja, löschen
                    </button>
                    <button
                      type="button"
                      className="zentrale-abbrechen"
                      onClick={() => setLoeschFrage(null)}
                      disabled={busy}
                    >
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="zentrale-knopf"
                    onClick={() => setLoeschFrage(g.id)}
                    disabled={busy}
                  >
                    Löschen
                  </button>
                )}
              </div>

              {offenId === g.id && (
                <div className="revier-gruppen-editor">
                  <label className="revier-gruppen-feld">
                    <span>Name</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                      maxLength={120}
                    />
                  </label>
                  {nameLeer && (
                    <p className="zentrale-sub" role="status">
                      Eine Standgruppe braucht einen Namen.
                    </p>
                  )}
                  {umbenennenVergeben && (
                    <p className="zentrale-sub" role="status">
                      In diesem Revier gibt es schon eine Gruppe mit diesem Namen.
                    </p>
                  )}

                  <p className="zentrale-sub">Stände auf der Karte antippen.</p>

                  {/* `zentrale-karte-kasten` ist die vorhandene Klasse der
                      Revierkarte, keine zweite: sie bringt 420 px Standard,
                      `.kino` mit 78vh und `:fullscreen` mit 100vh/100vw schon
                      mit. Damit ist die Karte hier exakt so groß wie die
                      darüber, in allen drei Zuständen. */}
                  <div ref={kasten} className={`zentrale-karte-kasten${kino ? ' kino' : ''}`}>
                    {/* Die Leiste liegt IM Kasten: `requestFullscreen()` läuft
                        auf `kasten`, im Vollbild ist also nur sichtbar, was ein
                        Nachkomme davon ist. Ein Geschwister-Knopf „Vollbild
                        beenden" wäre unbedienbar (Fremdprüfung 10.08.2026, K1).
                        Speichern und Abbrechen bleiben dagegen unten — sie
                        gehören zum Formular, nicht zur Karte. */}
                    <div className="zentrale-karte-knoepfe">
                      <span className="revier-gruppen-zaehler">
                        {markiert.size} gewählt
                        {diff.legen.length > 0 ? ` · +${diff.legen.length}` : ''}
                        {diff.entfernen.length > 0 ? ` · −${diff.entfernen.length}` : ''}
                      </span>
                      {/* Im Vollbild sinnlos — die Zwischengröße ist dort keine
                          Größe mehr. Wortgleich zur Revierkarte. */}
                      {!voll && (
                        <button type="button" onClick={() => setKino((k) => !k)} disabled={busy}>
                          {kino ? 'Kleiner' : 'Kinomodus'}
                        </button>
                      )}
                      <button type="button" onClick={vollUmschalten} disabled={busy}>
                        {voll ? 'Vollbild beenden' : 'Vollbild'}
                      </button>
                    </div>
                    <div className="zentrale-karte-buehne">
                      <Karte
                        grenze={grenze}
                        punkte={punkte}
                        markiert={markiert}
                        aufAuswahl={umschalten}
                      />
                    </div>
                  </div>

                  <div className="revier-gruppen-knoepfe">
                    <button
                      type="button"
                      className="zentrale-knopf"
                      onClick={speichern}
                      disabled={busy || nichtsZuTun || umbenennenVergeben || nameLeer}
                    >
                      {busy ? 'Speichert …' : 'Speichern'}
                    </button>
                    <button
                      type="button"
                      className="zentrale-abbrechen"
                      onClick={schliessen}
                      disabled={busy}
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </li>
            )
          })}
        </ul>
      )}

      <div className="revier-gruppen-neu">
        <label className="revier-gruppen-feld">
          <span>Neue Standgruppe</span>
          <input
            type="text"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            placeholder="z. B. Sauberg"
            disabled={busy}
            maxLength={120}
          />
        </label>
        <button
          type="button"
          className="zentrale-knopf"
          onClick={anlegen}
          // `sichtbarerName`, nicht `neu.trim()`: ein eingefügtes ZWSP ergäbe
          // sonst `length === 1` und eine sichtbar leere Gruppe.
          disabled={busy || neuName.length === 0 || neuVergeben}
        >
          Anlegen
        </button>
      </div>
      {neuVergeben && (
        <p className="zentrale-sub" role="status">
          In diesem Revier gibt es schon eine Gruppe mit diesem Namen.
        </p>
      )}
    </section>
  )
}
