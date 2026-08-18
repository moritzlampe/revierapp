'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import { sichtbarerName } from '../namen'
import { vergeben, type Standgruppe } from './standgruppen'

/**
 * Standgruppen — die LISTE, Portal-Phase 4b (Migration 112).
 *
 * Was hier geht: Gruppen anlegen, auf die Karte holen und löschen. Was NICHT
 * mehr hier geht: die Standmenge festlegen und umbenennen — beides sitzt seit
 * dem 18.08.2026 am Band bei der Revierkarte, weil man dort die Stände antippt.
 * Was nie hier ging: eine Gruppe in ein Treiben kopieren (Paket C, wohnt im
 * Treiben-Bereich, weil es dort geklickt wird).
 *
 * **Dieser Bereich hatte bis zum 18.08.2026 eine EIGENE Karte, und das war der
 * Fehler.** Auf der Revier-Seite steht bereits eine; der Revierinhaber tippte
 * beim ersten Kontakt in die obere und bekam keine Rückmeldung — kein Fehler im
 * Code, ein Fehler im Aufbau. Die Karte lebt jetzt oben, samt Kinomodus und
 * Vollbild, die es hier ein zweites Mal gab. Der geteilte Zustand und der
 * Schreibvorgang liegen in `arbeitsbereich.tsx`, dort steht die Begründung.
 *
 * **Der Bereich hält damit nur noch, was zur Liste gehört**: das Feld für eine
 * neue Gruppe und die Löschrückfrage. `busy`, `fehler` und `fuehreAus` kommen
 * von oben — EIN Doppelklick-Riegel und EINE Fehlerzeile für Karte und Liste
 * zusammen, statt zweier, die man widerspruchsfrei halten müsste.
 *
 * ponytail: die Bedienfläche ist damit kein Zwilling von `treiben-bereich.tsx`
 * mehr — dort steht die Karte weiterhin im Editor, und das ist dort auch
 * richtig, weil die Jagdseite keine zweite hat. Zusammenlegen bleibt verworfen.
 */

export default function StandgruppenBereich({
  revierId,
  gruppen,
  sichtbareIds,
  aktiveId,
  aktiveMenge,
  bearbeitet,
  busy,
  fehler,
  fuehreAus,
  aufAnsehen,
  aufSchliessen,
}: {
  revierId: string
  gruppen: Standgruppe[]
  /**
   * Was der Nutzer SEHEN kann: alle Kartenobjekte des Reviers, jeden Typs.
   *
   * Hier nur noch für das Papierkorb-Abzeichen — die Rechnung, für die es
   * ursprünglich kam (`gruppenDiff`), ist mit dem Entwurf nach oben gewandert.
   *
   * **Zwei Mengen statt einer, und das ist ein Befund der Fremdprüfung**
   * (Codex 17.08.2026, Nr. 5, `[medium]`): war `sichtbar` aus der WÄHLBAREN
   * Menge abgeleitet, dann ist ein Mitglied, dessen Objekt jemand vom Hochsitz
   * zum Parkplatz umtypt, plötzlich „unsichtbar" und damit **gefangen** — es
   * zählt in der Gruppe mit, steht nicht auf der Karte, und der
   * Papierkorb-Schutz hält es fest. Nur die ganze Gruppe zu löschen hätte
   * geholfen.
   */
  sichtbareIds: string[]
  /** Welche Gruppe steht gerade auf der Karte? `null` = keine. */
  aktiveId: string | null
  /**
   * Die Menge, die die KARTE für die aktive Gruppe zeigt.
   *
   * **Damit Pille und Karte nie verschiedene Zahlen behaupten** (Fremdprüfung
   * Codex 18.08.2026, Nr. 6, `[mittel]`): nach dem Speichern zeigt die Karte
   * schon den Entwurf, während `g.staende` bis zum Ende des Refreshs noch die
   * alten Props trägt. Für ein bis zwei Sekunden sagte die Karte „5 Stände" und
   * die Pille daneben „4" — kurz, aber falsch, und genau die Sorte Auskunft, die
   * sich wie eine gültige liest.
   */
  aktiveMenge: ReadonlySet<string> | null
  /**
   * Wird am Band gerade eine Gruppe bearbeitet?
   *
   * **Die Liste muss das wissen, sonst ist sie ein Seiteneingang**
   * (Delta-Durchgang 18.08.2026): sie bekam nur `busy` (`laeuft || pending`),
   * und das ist während einer offenen Bearbeitung false. „Auf Karte" bei einer
   * ANDEREN Gruppe rief dann `zeige()` und **verwarf den offenen Entwurf
   * ungefragt** — dieselbe Klasse (S5), gegen die einen Absatz weiter unten die
   * Löschrückfrage geräumt wird.
   *
   * Der Zustand wanderte beim Umbau nach oben; `busy` wuchs nicht mit. Genau
   * die Stelle, an der ein Riegel eine Lücke lässt, weil er an der alten
   * Grenze steht.
   */
  bearbeitet: boolean
  busy: boolean
  fehler: string | null
  /**
   * Der gemeinsame Schreibvorgang aus `arbeitsbereich.tsx` — EIN
   * Doppelklick-Riegel, EIN Sperrzustand, EINE Fehlerzeile für Karte und Liste.
   *
   * `danach` ist Pflicht, nicht optional (Ponytail 18.08.2026): alle drei
   * Aufrufer übergeben es, die Optionalität war Flexibilität für einen
   * Aufrufer, den es nicht gibt.
   */
  fuehreAus: (was: string, arbeit: () => Promise<void>, danach: () => void) => Promise<void>
  aufAnsehen: (g: Standgruppe) => void
  aufSchliessen: () => void
}) {
  const [neu, setNeu] = useState('')
  const [loeschFrage, setLoeschFrage] = useState<string | null>(null)

  // Solange am Band bearbeitet wird, ist die Liste gesperrt — s. `bearbeitet`.
  const gesperrt = busy || bearbeitet

  /**
   * **Bewusst NICHT geräumt: eine Löschfrage, die den Einstieg in die
   * Bearbeitung überlebt** (Delta-Durchgang 18.08.2026, `[niedrig]`).
   *
   * Wer „Löschen" bei einer Gruppe antippt und dann am Band „Bearbeiten"
   * klickt, lässt die Rückfrage ausgegraut stehen; nach Speichern oder
   * Abbrechen ist sie **wieder scharf**. Derselbe Fehlertyp, den
   * `revierkarte.tsx` für die Grenzen-Rückfrage an zwei Stellen räumt — der Weg
   * über das Band ist der dritte, und er ist offen.
   *
   * **Der naheliegende Fix war schlechter als der Fehler:** ein `useEffect`,
   * der bei `bearbeitet` räumt, ist ein `setState` im Effekt — die ESLint-Regel
   * `react-hooks/set-state-in-effect` verbietet das, und sie hat recht. Der
   * saubere Weg wäre, den Räum-Aufruf vom Band durch zwei Komponenten
   * durchzureichen; das kostet mehr, als der Fall wert ist.
   *
   * Es geht dabei um dieselbe Gruppe, und der Zähler im Fragetext zieht mit —
   * die stehengebliebene Frage ist also nie falsch, nur überflüssig. Fällig,
   * wenn die Liste ohnehin einen Rückkanal bekommt.
   */
  const sichtbar = new Set(sichtbareIds)
  const neuName = sichtbarerName(neu)
  const neuVergeben = vergeben(gruppen, neuName)

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
        // Auch aus der KARTE nehmen, nicht nur aus der Liste: die gelöschte
        // Gruppe bliebe dort sonst hervorgehoben, bis der nächste
        // `router.refresh()` durch ist — eine Menge ohne Zeile dahinter.
        if (aktiveId === g.id) aufSchliessen()
      },
    )
  }

  /**
   * Die Sektion trägt **`zentrale-block`**, keine eigene Klasse (Selbstlesung
   * 17.08.2026): `.zentrale-block h2` ist die **einzige** h2-Regel des Portals
   * (uppercase, gesperrt, sekundär). Ohne sie fiele die Überschrift auf den
   * Browser-Default zurück und sähe anders aus als jede andere
   * Bereichsüberschrift der Zentrale. Das Vorbild `treiben-bereich.tsx` hat
   * diesen Fehler — nicht mitgeändert, fremder Schnitt (C-40).
   */
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
        <p className="zentrale-leer">Noch keine Standgruppe angelegt.</p>
      ) : (
        <ul className="revier-gruppen-liste" role="list">
          {gruppen.map((g) => {
            /**
             * **Mitglieder im Papierkorb gehören ausgewiesen.** Sie zählen in
             * der Pille mit, stehen aber nicht auf der Karte und lassen sich
             * nicht abwählen — ohne diesen Hinweis sucht der Revierinhaber
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
            const aktiv = aktiveId === g.id
            // Für die aktive Gruppe gilt, was die Karte zeigt — s. `aktiveMenge`.
            const anzahl = aktiv && aktiveMenge ? aktiveMenge.size : g.staende.length
            return (
              <li key={g.id} className="revier-gruppen-zeile">
                <div className="revier-gruppen-kopf">
                  <span className="revier-gruppen-name">{g.name}</span>
                  <span className="zentrale-pill">
                    {anzahl} {anzahl === 1 ? 'Stand' : 'Stände'}
                  </span>
                  {imPapierkorb > 0 && (
                    <span className="zentrale-pill">{imPapierkorb} im Papierkorb</span>
                  )}
                </div>

                <div className="revier-gruppen-knoepfe">
                  {/* **„Auf Karte" statt „Stände wählen"** — der Knopf zeigt die
                      Gruppe erst nur an. Bearbeitet wird aus dem Band bei der
                      Karte heraus, wo die Stände liegen. Zwei Schritte statt
                      einem, dafür kann man eine Gruppe ansehen, ohne in einen
                      Zustand zu geraten, aus dem man speichern oder abbrechen
                      muss (Moritz, 18.08.2026: „gerade geht ja nur stände
                      wählen und löschen"). */}
                  {/* `setLoeschFrage(null)` gehört dazu (Schlusslesung
                      18.08.2026, 3): das alte `oeffnen()` räumte die Rückfrage,
                      der Weg über den Arbeitsbereich kennt sie nicht. Sonst
                      bleibt eine angefangene Löschfrage stehen, während man
                      dieselbe Gruppe auf die Karte holt — folgenlos im Ergebnis,
                      aber eine Frage, die auf einen Klick wartet, der ihr nicht
                      mehr gilt. Derselbe Fehlertyp wie die Grenzen-Rückfrage in
                      `revierkarte.tsx`. */}
                  <button
                    type="button"
                    className="zentrale-knopf"
                    onClick={() => {
                      setLoeschFrage(null)
                      if (aktiv) aufSchliessen()
                      else aufAnsehen(g)
                    }}
                    disabled={gesperrt}
                  >
                    {aktiv ? 'Von der Karte nehmen' : 'Auf Karte'}
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
                        disabled={gesperrt}
                      >
                        Ja, löschen
                      </button>
                      <button
                        type="button"
                        className="zentrale-abbrechen"
                        onClick={() => setLoeschFrage(null)}
                        disabled={gesperrt}
                      >
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="zentrale-knopf"
                      onClick={() => setLoeschFrage(g.id)}
                      disabled={gesperrt}
                    >
                      Löschen
                    </button>
                  )}
                </div>
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
            disabled={gesperrt}
            maxLength={120}
          />
        </label>
        <button
          type="button"
          className="zentrale-knopf"
          onClick={anlegen}
          // `sichtbarerName`, nicht `neu.trim()`: ein eingefügtes ZWSP ergäbe
          // sonst `length === 1` und eine sichtbar leere Gruppe.
          disabled={gesperrt || neuName.length === 0 || neuVergeben}
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
