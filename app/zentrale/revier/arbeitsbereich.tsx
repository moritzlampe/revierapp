'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import Revierkarte from '../revierkarte'
import StandgruppenBereich from './standgruppen-bereich'
import { schreibe, schreibeViele } from '../schreiben'
import { sichtbarerName } from '../namen'
import { gruppenDiff, markierungAus, vergeben, type Standgruppe } from './standgruppen'
import type { Punkt } from '../revierkarte-map'

/**
 * Klammert Revierkarte und Standgruppen zu EINEM Arbeitsbereich.
 *
 * **Der Anlass ist gemessen, nicht ästhetisch** (Moritz, 18.08.2026): der
 * Standgruppen-Editor brachte eine ZWEITE Leaflet-Karte mit, und der
 * Revierinhaber tippte beim ersten Kontakt in die obere — die Karte, die vor ihm
 * stand. Dort passiert nichts, und nichts sagte ihm, dass er in der falschen
 * Karte ist. Der Zähler blieb auf 0, und die Fehlersuche lief eine Dreiviertel-
 * stunde gegen Code, der an jeder Stelle richtig war: zwei Leser, neun geprüfte
 * Hypothesen, null Befunde. Es GAB keinen Fehler im Code.
 *
 * **Die Lehre steht hier, weil sie sonst keine Zeile hätte:** zwei Karten auf
 * einer Seite sind kein doppeltes Angebot, sondern eine Weiche ohne Schild. Wer
 * eine zweite aufmacht, muss sagen können, woran der Nutzer erkennt, welche
 * gemeint ist. Konnte niemand — und keine statische Prüfung hätte das je
 * gefunden.
 *
 * **Was diese Komponente hält.** Den Zustand, den BEIDE Seiten brauchen (aktive
 * Gruppe, Modus, Entwurf), den Namen der bearbeiteten Gruppe — und den
 * Schreibvorgang. Letzteres ist kein Zufall: wer den Entwurf hält, muss ihn
 * speichern können, sonst zerfiele ein Formular über zwei Komponenten. Aus
 * demselben Grund liegt `fuehreAus` hier und wird nach unten gereicht: EIN
 * Doppelklick-Riegel, EIN Sperrzustand, EINE Fehlerzeile für den ganzen Bereich.
 *
 * **Was sie NICHT hält: die Punkte und ihren Zwischenspeicher.** `Revierkarte`
 * überlagert die Server-Punkte mit dem, was in dieser Sitzung geschrieben wurde
 * (`ueberlagert`, s. dort). Läge das hier, hätte die Karte zwei Wahrheiten über
 * dieselbe Zeile.
 *
 * **Kein Store, kein Context, keine URL.** Es sind vier Werte zwischen zwei
 * Geschwistern; ein hochgezogener `useState` ist der ganze Mechanismus. Die URL
 * machte aus einem Entwurf einen teilbaren Link auf einen Zustand, den es nach
 * dem Neuladen nicht mehr gibt.
 */
export default function RevierArbeitsbereich({
  revierId,
  grenze,
  punkte,
  waehlbareIds,
  sichtbareIds,
  gruppen,
}: {
  revierId: string
  grenze: [number, number][][] | null
  /** ALLE Kartenobjekte des Reviers — die Karte zeichnet jeden Typ. */
  punkte: Punkt[]
  /**
   * Was in eine Standgruppe darf: nur Standtypen. Gefiltert in `page.tsx`.
   *
   * Als Menge von IDs statt als zweite Punktliste, weil die Karte ohnehin alle
   * Punkte zeichnet und hier nur die Frage „darf das angetippt werden?" hängt.
   */
  waehlbareIds: string[]
  /** Was der Nutzer SEHEN kann — Grundlage des Papierkorb-Schutzes, s. `gruppenDiff`. */
  sichtbareIds: string[]
  gruppen: Standgruppe[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  /**
   * Der Doppelklick-Riegel ist ein **Ref**, kein State (S5). Zwei schnelle Tipps
   * kommen beide durch, bevor React neu gerendert hat — `laeuft` allein sperrt
   * nur die Anzeige, nicht den zweiten Aufruf.
   */
  const laeuftRef = useRef(false)

  /** Welche Gruppe steht auf der Karte? `null` heißt: keine. */
  const [aktiveId, setAktiveId] = useState<string | null>(null)

  /**
   * Ein eigener Zustand statt eines `bearbeitet: boolean` neben `aktiveId`, weil
   * „bearbeitet, aber keine Gruppe aktiv" sonst ausdrückbar wäre und irgendwann
   * eingetreten wäre. Er gilt nur zusammen mit `aktiveId` — s. `bearbeitet`.
   */
  const [modus, setModus] = useState<'ansehen' | 'bearbeiten'>('ansehen')

  /**
   * Der Modus als Ref, damit der Effekt unten ihn LESEN kann, ohne auf ihn zu
   * HÖREN. Hörte er auf ihn, liefe er bei jedem Moduswechsel und räumte den
   * Entwurf genau dann weg, wenn er gebraucht wird — direkt nach dem Speichern.
   */
  const modusRef = useRef(modus)
  modusRef.current = modus

  /**
   * Die Standmenge, die der Nutzer gerade macht — `null` heißt „keine".
   *
   * **`null` statt eines leeren Sets, und das ist kein Typ-Purismus** (Ponytail
   * 18.08.2026, plus ein Fehler, den erst das Umsetzen zeigte): nach dem
   * Speichern bleibt der Entwurf stehen, bis der Server nachgezogen hat — sonst
   * zeigte die Karte für einen Moment die Menge VOR dem Speichern, weil
   * `router.refresh()` nicht abwartbar ist. Um zu wissen, OB ein Entwurf gilt,
   * braucht es aber eine Unterscheidung, die ein leeres Set nicht hergibt:
   * **„bewusst leer" gegen „gar keiner"**.
   *
   * Wer stattdessen auf `size > 0` prüft — so stand es hier zuerst, und so
   * schlug es auch die Lesung vor —, verliert genau den Fall, in dem jemand ALLE
   * Stände einer Gruppe abwählt und speichert: die eben entfernten Stände
   * leuchteten weiter, bis der Refresh eintrifft.
   */
  const [entwurf, setEntwurf] = useState<ReadonlySet<string> | null>(null)

  /** Der Name im Bearbeiten-Modus — er wird am Band bei der Karte getippt. */
  const [name, setName] = useState('')

  /**
   * **Der Entwurf gilt nur, bis der Server nachgezogen hat** (Fremdprüfung
   * Codex 18.08.2026, Nr. 2, `[mittel]`).
   *
   * Ohne das gewann er DAUERHAFT: nach dem Speichern bleibt er stehen, um das
   * Refresh-Fenster zu überbrücken — aber er wurde nie wieder los. Ändert danach
   * jemand anderes dieselbe Gruppe, zeigte die Karte weiter die eigene alte
   * Menge, potenziell für die ganze Lebensdauer der Seite. Aus einer Brücke über
   * zwei Sekunden wäre eine zweite Wahrheit geworden.
   *
   * **Verglichen wird die Prop-REFERENZ, nicht der Inhalt** — zeichengleich zu
   * `geschrieben`/`gespeichert` in `revierkarte.tsx` und aus demselben Grund
   * (Codex, 27.07.2026): auf Gleichheit zu prüfen ließe den Entwurf genau dann
   * liegen, wenn jemand anderes zwischenzeitlich etwas ANDERES geschrieben hat.
   * `gruppen` wechselt seine Referenz nur bei einer neuen Server-Auslieferung.
   *
   * **Beim Bearbeiten NICHT**, und das ist die Bedingung, ohne die der Fix
   * seinerseits ein Fehler wäre: ein Refresh mitten in der Auswahl risse dem
   * Nutzer sonst die Arbeit unter der Hand weg.
   */
  useEffect(() => {
    // `modus` bewusst NICHT in den Abhängigkeiten: der Effekt soll auf neue
    // SERVERDATEN reagieren, nicht auf jeden Moduswechsel — sonst räumte er den
    // Entwurf direkt nach `setModus('ansehen')` weg, also genau das Fenster,
    // für das er stehen bleibt.
    if (modusRef.current !== 'bearbeiten') setEntwurf(null)
  }, [gruppen])

  const aktiv = gruppen.find((g) => g.id === aktiveId) ?? null
  const waehlbar = new Set(waehlbareIds)
  const sichtbar = new Set(sichtbareIds)
  const busy = laeuft || pending

  /**
   * **Der Diff zählt nur im Bearbeiten-Modus.** Im Ansehen-Modus ist `entwurf`
   * leer — ihn dort gegen die gespeicherte Menge zu rechnen ergäbe ein
   * vollständiges `entfernen` aller Mitglieder, und der Zähler zeigte „−52",
   * ohne dass jemand etwas angefasst hätte. Genau die Sorte Auskunft, die
   * aussieht wie ein Befund.
   */
  const bearbeitet = aktiv !== null && modus === 'bearbeiten'
  const diff =
    bearbeitet && entwurf
      ? gruppenDiff(aktiv.staende, entwurf, sichtbar)
      : { entfernen: [], legen: [] }

  const nameNeu = sichtbarerName(name)
  const nameGeaendert = bearbeitet && nameNeu.length > 0 && nameNeu !== aktiv.name
  const nameLeer = bearbeitet && nameNeu.length === 0
  const nameVergeben = bearbeitet && vergeben(gruppen, nameNeu, aktiv.id)
  const nichtsZuTun = diff.entfernen.length === 0 && diff.legen.length === 0 && !nameGeaendert

  /**
   * **Ein benannter Wert, weil dieselbe Bedingung sonst zweimal dasteht** —
   * einmal als Riegel in `speichern()`, einmal negiert am Knopf (Ponytail
   * 18.08.2026). Zwei Kopien eines Prädikats driften auseinander, und genau
   * dort entsteht der S2-Fall: ein Knopf, den RLS oder die Prüfung danach
   * ablehnt.
   */
  const speicherbar = bearbeitet && !nichtsZuTun && !nameVergeben && !nameLeer

  /**
   * Was die Karte hervorhebt: der Entwurf, solange es einen gibt, sonst die
   * gespeicherte Menge. Beides dieselbe Darstellung — der Nutzer soll beim
   * Umschalten nicht die Bedeutung der Farben neu lernen.
   *
   * **Ein Ausdruck, keine zwei.** Hier standen zuerst `hervorgehoben` und ein
   * `gezeigt` daneben, das per Mengenvergleich entschied, welcher gilt; die
   * Lesung hat es als folgenlos entlarvt (waren die Mengen gleich, wählte es
   * zwischen zwei gleichen Werten). Mit `entwurf: null` beantwortet der Typ die
   * Frage, die der Vergleich stellen wollte.
   */
  const hervorgehoben = aktiv ? (entwurf ?? new Set(aktiv.staende)) : null

  /**
   * Eine Gruppe auf die Karte holen — oder mit `null` alles zurücksetzen.
   *
   * `schliessen()` war zeichengleich diese Funktion mit `aktiveId = null`
   * (Ponytail 18.08.2026). Zwei Fassungen desselben Resets sind eine Stelle, an
   * der man beim Erweitern eine vergisst.
   */
  function zeige(g: Standgruppe | null) {
    setAktiveId(g?.id ?? null)
    setModus('ansehen')
    setEntwurf(null)
    setName('')
    setFehler(null)
  }

  function bearbeiten(g: Standgruppe) {
    setAktiveId(g.id)
    setModus('bearbeiten')
    // `markierungAus`, NICHT `new Set(g.staende)` — ein Mitglied, das nicht auf
    // der Karte wählbar ist (umgetypt, im Papierkorb), darf nicht als angetippt
    // starten, sonst kann es niemand mehr abwählen. Die Begründung steht bei der
    // Funktion; der Fehler hat am 17.08.2026 einen ganzen Fix wirkungslos
    // gemacht, weil nur die halbe Trennung gezogen war.
    setEntwurf(markierungAus(g.staende, waehlbar))
    setName(g.name)
    setFehler(null)
  }

  /**
   * Ein Markerklick im Bearbeiten-Modus. Nur wählbare Stände — ein Parkplatz
   * bleibt unbeteiligt, auch wenn er unter dem Finger liegt.
   *
   * **Der Riegel sitzt HIER, nicht an der Prop** — das ist die Falle, die
   * Schnitt 1 Geld gekostet hat. Ein `aufUmschalten={busy ? undefined : …}` am
   * Aufrufer sperrt zwar korrekt, kippt aber bei jedem Speichervorgang den
   * Marker-`key` von „waehlbar" auf „starr" und zurück (`revierkarte-map.tsx`),
   * und Leaflet wertet `interactive` nur beim Anlegen aus. Bei Söder sind das
   * ~190 CircleMarker samt Tooltips, zweimal je Speichern.
   */
  function umschalten(id: string) {
    if (laeuftRef.current || !bearbeitet || !waehlbar.has(id)) return
    setEntwurf((vorher) => {
      const nachher = new Set(vorher ?? [])
      if (!nachher.delete(id)) nachher.add(id)
      return nachher
    })
  }

  /**
   * Ein Schreibvorgang, ein Riegel, eine Fehlerzeile — auch für die Liste
   * darunter, die ihn als Prop bekommt.
   *
   * `startTransition` um `router.refresh()`: ohne es ist `laeuft` sofort wieder
   * false, während der Refresh noch unterwegs ist — die Props tragen dann kurz
   * den ALTEN Stand und der Knopf lebt auf.
   */
  async function fuehreAus(was: string, arbeit: () => Promise<void>, danach: () => void) {
    if (laeuftRef.current) return
    laeuftRef.current = true
    setLaeuft(true)
    setFehler(null)
    try {
      await arbeit()
      danach()
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
      // Der Modus bleibt bewusst auf „bearbeiten" und `entwurf` unangetastet:
      // die Auswahl ist die Absicht des Nutzers, und `diff` rechnet sie nach dem
      // Refresh gegen den frischen Stand neu.
      startTransition(() => router.refresh())
    } finally {
      laeuftRef.current = false
      setLaeuft(false)
    }
  }

  function speichern() {
    if (!aktiv || !entwurf || !speicherbar) return
    void fuehreAus(
      'Das Speichern',
      async () => {
        const client = createClient()

        if (nameGeaendert) {
          await schreibe('Der Name der Standgruppe', () =>
            client.from('standgruppen').update({ name: nameNeu }).eq('id', aktiv.id).select('id'),
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
                  gruppe_id: aktiv.id,
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
              .eq('gruppe_id', aktiv.id)
              .in('map_object_id', diff.entfernen)
              .select('map_object_id'),
          )
        }
      },
      // **Die Gruppe bleibt nach dem Speichern auf der Karte stehen**, nur das
      // Werkzeug fällt weg. Vorher schloss der Editor ganz — das war richtig,
      // solange die Karte MIT ihm verschwand; jetzt bliebe eine Karte ohne
      // Hervorhebung zurück, und der Nutzer hätte keinen Beleg, dass seine
      // Auswahl angekommen ist.
      //
      // **`entwurf` wird NICHT geleert, und das ist der Unterschied zwischen
      // „sieht richtig aus" und „ist richtig":** `router.refresh()` ist nicht
      // abwartbar, `aktiv.staende` trägt also noch die alte Menge. Ein Leeren
      // zeigte für einen Moment die Menge VOR dem Speichern — der Nutzer sähe
      // seine Änderung verschwinden und wieder auftauchen.
      () => {
        setModus('ansehen')
        setName('')
      },
    )
  }

  return (
    <>
      {/* `zentrale-karte` ist der Rahmen, den die Karte auf dieser Seite immer
          hatte — er wandert mit ihr hierher, sonst verliert sie ihr Layout.

          **Der `key` an der Karte ist seit dem 18.08.2026 redundant und bleibt
          trotzdem** (Delta-Durchgang): `page.tsx` gibt inzwischen dem ganzen
          Arbeitsbereich `key={revier.id}`, ein Revierwechsel baut also ohnehin
          alles neu — der innere kann nichts mehr retten, was der äußere nicht
          schon erledigt hat. Der Kommentar stand hier zuerst als tragende
          Begründung und war damit falsch.
          Er bleibt, weil er nichts kostet und die Karte auch dann richtig
          bliebe, wenn jemand den äußeren entfernt. Ein Riegel, der einen
          zweiten Riegel überlebt, ist keine Doppelung, sondern eine Sicherung —
          solange niemand ihn für die eigentliche Begründung hält. */}
      <div className="zentrale-block">
        <div className="zentrale-karte">
          <Revierkarte
            key={revierId}
            grenze={grenze}
            punkte={punkte}
            revierId={revierId}
            gruppe={
              aktiv && hervorgehoben
                ? {
                    name: aktiv.name,
                    staende: hervorgehoben,
                    bearbeiten: bearbeitet,
                    busy,
                    entwurfName: name,
                    zaehler: {
                      // **`hervorgehoben`, nicht `entwurf`** (Fremdprüfung Codex
                      // 18.08.2026, Nr. 1, `[mittel]`): im Ansehen-Modus ist
                      // `entwurf` null, und `?? 0` meldete „0 gewählt" für eine
                      // Gruppe mit 52 Ständen. Heute zeigt das Band diesen Wert
                      // dort nicht an — ein Wert, der nur deshalb nicht auffällt,
                      // weil ihn gerade niemand liest, ist trotzdem falsch.
                      gewaehlt: hervorgehoben.size,
                      legen: diff.legen.length,
                      entfernen: diff.entfernen.length,
                    },
                    nameLeer,
                    nameVergeben,
                    speicherbar,
                    aufUmschalten: umschalten,
                    aufName: setName,
                    aufBearbeiten: () => bearbeiten(aktiv),
                    aufSpeichern: speichern,
                    aufAbbrechen: () => zeige(aktiv),
                    aufSchliessen: () => zeige(null),
                  }
                : undefined
            }
          />
        </div>
      </div>
      <StandgruppenBereich
        revierId={revierId}
        gruppen={gruppen}
        sichtbareIds={sichtbareIds}
        aktiveId={aktiveId}
        aktiveMenge={hervorgehoben}
        bearbeitet={bearbeitet}
        busy={busy}
        fehler={fehler}
        fuehreAus={fuehreAus}
        aufAnsehen={zeige}
        aufSchliessen={() => zeige(null)}
      />
    </>
  )
}
