'use client'

import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../schreiben'
import { sichtbarerName } from '../namen'
import { vergeben, type Standgruppe } from './standgruppen'
import type { Punkt } from '../revierkarte-map'

/**
 * Standgruppen — die LISTE, jetzt in der rechten Spalte (C-44, 18.08.2026).
 *
 * **Sie stand bis heute unter der Karte, und das war der Rest eines Aufbaus, den
 * es nicht mehr gibt.** Vormittags hatte der Standgruppen-Editor noch eine
 * eigene zweite Leaflet-Karte; als die wegfiel, blieb die Liste unten liegen und
 * bekam ein Band an der Karte als Fernbedienung. Zwei Orte für eine Sache — man
 * tippt oben Stände an und liest unten nach, was daraus geworden ist.
 *
 * Mit den Reitern ist die Spalte der Platz, den die Objektliste für ihre Objekte
 * schon hat: **eine Auswahlliste neben der Karte, nicht unter ihr.**
 *
 * **Was hier NICHT mehr wohnt: Bearbeiten, Umbenennen, Löschen.** Die drei
 * stehen in der Optionenzeile unter dem Reiter und wirken auf die angewählte
 * Gruppe (Moritz' Entwurf vom 18.08.2026). Die Trennung ist die eigentliche
 * Ordnung dieses Umbaus: **die Spalte wählt aus, die Optionenzeile handelt.**
 * Solange beides in der Zeile stand, brauchte jeder Knopf seine eigene Bedingung
 * — genau die acht Einzelriegel, aus denen drei der sechzehn Befunde des Tages
 * kamen.
 *
 * **Was hier bleibt: das Anlegen.** Ein neues Feld gehört an den Fuß seiner
 * Liste, nicht in eine Zeile mit Knöpfen, die auf eine Auswahl wirken — es
 * braucht ja gerade keine.
 *
 * **Die Stände hängen an der AUSWAHL, nicht an einem eigenen Aufklapp-Zustand**,
 * und das ist eine bewusste Auslassung. Ein `<details>` je Gruppe wäre das
 * naheliegende Muster (die Typ-Legende daneben macht es so) und hätte einen
 * zweiten Zustand neben `aktiveId` eingeführt: aufgeklappt-aber-nicht-angewählt,
 * angewählt-aber-zugeklappt. Beides ist ausdrückbar, beides bedeutet nichts, und
 * in diesem Repo ist zweimal ein Fehler genau daraus entstanden, dass ein
 * Zustand ausdrückbar war, den niemand gemeint hat. Angewählt heißt: auf der
 * Karte UND hier ausgeschrieben.
 */
export default function StandgruppenSpalte({
  revierId,
  gruppen,
  punkte,
  sichtbareIds,
  aktiveId,
  aktiveMenge,
  bearbeitet,
  busy,
  ausgeklappt,
  aufAnsehen,
  fuehreAus,
  neu,
  aufNeu,
}: {
  revierId: string
  gruppen: Standgruppe[]
  /** Für die Namen der eingerückten Stände. Alle Objekte, nicht nur Standtypen. */
  punkte: Punkt[]
  /**
   * Was der Nutzer SEHEN kann — Grundlage des Papierkorb-Abzeichens.
   *
   * **Zwei Mengen statt einer, und das ist ein Befund der Fremdprüfung**
   * (Codex 17.08.2026, Nr. 5, `[medium]`): war `sichtbar` aus der WÄHLBAREN
   * Menge abgeleitet, dann ist ein Mitglied, dessen Objekt jemand vom Hochsitz
   * zum Parkplatz umtypt, plötzlich „unsichtbar" und damit **gefangen** — es
   * zählt in der Gruppe mit, steht nicht auf der Karte, und der
   * Papierkorb-Schutz hält es fest.
   */
  sichtbareIds: string[]
  aktiveId: string | null
  /**
   * Die Menge, die die KARTE für die aktive Gruppe zeigt.
   *
   * **Damit Liste und Karte nie verschiedene Zahlen behaupten** (Fremdprüfung
   * Codex 18.08.2026, Nr. 6, `[mittel]`): nach dem Speichern zeigt die Karte
   * schon den Entwurf, während `g.staende` bis zum Ende des Refreshs noch die
   * alten Props trägt. Für ein bis zwei Sekunden sagte die Karte „5 Stände" und
   * die Pille daneben „4".
   *
   * Beim Bearbeiten ist das zusätzlich der Punkt der ganzen Spalte: die
   * eingerückte Liste wächst und schrumpft **live** mit jedem Kartentipp. Wer
   * einen Stand antippt, sieht seinen Namen erscheinen — und merkt so auch, wenn
   * er den falschen erwischt hat.
   */
  aktiveMenge: ReadonlySet<string> | null
  bearbeitet: boolean
  busy: boolean
  /** Eingeklappt wird die Spalte nur verborgen, damit der Suchzustand überlebt. */
  ausgeklappt: boolean
  /**
   * Eine Gruppe auf die Karte holen — oder mit `null` alles zurücksetzen.
   *
   * **Ein Handler, nicht zwei** (Ponytail 18.08.2026): `aufSchliessen` daneben
   * war zeichengleich `aufAnsehen(null)`, und zwei Fassungen desselben Resets
   * sind eine Stelle, an der man beim Erweitern eine vergisst. Dieselbe Lehre
   * wie bei `zeige()` im Arbeitsbereich, aus derselben Woche.
   */
  aufAnsehen: (g: Standgruppe | null) => void
  /**
   * Der gemeinsame Schreibvorgang aus `arbeitsbereich.tsx` — EIN
   * Doppelklick-Riegel, EIN Sperrzustand, EINE Fehlerzeile für Karte und Liste.
   */
  fuehreAus: (was: string, arbeit: () => Promise<void>, danach: () => void) => Promise<void>
  /**
   * Der getippte Name für eine neue Gruppe — **liegt im Arbeitsbereich, nicht
   * hier** (Schlusslesung 18.08.2026, F5).
   *
   * Er stand zuerst als lokaler `useState` in dieser Komponente, und das war
   * der siebte Fall des Tagesmusters: am alten Platz (Bereich UNTER der Karte,
   * immer montiert) überlebte er jeden Moduswechsel. In der Spalte wird er beim
   * Reiterwechsel unmountet — ein halb getippter Name verschwand wortlos, und
   * er setzt keinen Modus, `werkzeugOffen` schützt ihn also auch nicht.
   *
   * Oben gehalten überlebt er, und die Spalte wird dadurch zustandsfrei — was
   * zu ihrer Rolle passt: sie wählt aus, sie hält nichts.
   */
  neu: string
  aufNeu: (wert: string) => void
}) {

  // Solange am Reiter bearbeitet wird, ist die Auswahl gesperrt: ein Wechsel
  // verwürfe den offenen Entwurf ungefragt (S5). Denselben Riegel trägt die
  // Reiterleiste; hier steht er, weil die Zeilen keine Reiter sind.
  const gesperrt = busy || bearbeitet

  const sichtbar = new Set(sichtbareIds)
  const neuName = sichtbarerName(neu)
  const neuVergeben = vergeben(gruppen, neuName)

  /** `map_objects.id` → Name, für die eingerückte Liste. */
  const namen = new Map(punkte.map((p) => [p.id, p.name]))

  function anlegen() {
    // **Gespeichert wird, was geprüft wurde** (Entscheidung Moritz, 17.08.2026,
    // PWA-Übergabe §4). `sichtbarerName()` liefert hier den SPEICHERWERT, nicht
    // nur einen Prüfwert — der Grund ist der Weg, auf dem so ein Zeichen
    // hereinkommt: kopiert aus Mail, WhatsApp oder Excel, nie getippt. Zwei
    // optisch identische Gruppennamen fielen beim Anlegen niemandem auf,
    // sondern erst am Jagdmorgen beim Antippen der falschen.
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
      () => aufNeu(''),
    )
  }

  return (
    <aside
      id="zentrale-inspektor"
      className={`zentrale-inspektor${ausgeklappt ? '' : ' zu'}`}
      aria-label="Standgruppen"
    >
      <div className="zentrale-inspektor-kopf">
        <h3>
          Standgruppen <span className="zahl">{gruppen.length}</span>
        </h3>
      </div>

      {gruppen.length === 0 ? (
        <p className="zentrale-leer">Noch keine Standgruppe angelegt.</p>
      ) : (
        <ul className="revier-gruppen-liste" role="list">
          {gruppen.map((g) => {
            /**
             * **Mitglieder im Papierkorb gehören ausgewiesen.** Sie zählen in
             * der Pille mit, stehen aber nicht auf der Karte und lassen sich
             * nicht abwählen — ohne diesen Hinweis sucht der Revierinhaber einen
             * Stand, den er nie findet.
             */
            const imPapierkorb = g.staende.filter((id) => !sichtbar.has(id)).length
            const aktiv = aktiveId === g.id
            // Für die aktive Gruppe gilt, was die Karte zeigt — s. `aktiveMenge`.
            const menge = aktiv && aktiveMenge ? aktiveMenge : new Set(g.staende)
            const anzahl = menge.size

            /**
             * Die Stände der angewählten Gruppe, alphabetisch wie die
             * Objektliste nebenan. Nur für die aktive Zeile gerechnet — bei 52
             * Mitgliedern und mehreren Gruppen wäre es sonst Arbeit für Listen,
             * die niemand aufgeklappt hat.
             *
             * Ein Mitglied ohne Namen ist eines im Papierkorb: es steht in der
             * Menge, aber nicht in `punkte`. Es bekommt eine eigene Zeile statt
             * stillschweigend zu fehlen — sonst zählt die Pille anders als die
             * Liste darunter, und genau das ist die Sorte Auskunft, die sich wie
             * eine gültige liest.
             */
            // `￿` sortiert die namenlosen Zeilen ans Ende, ohne einen
            // zweiten Vergleichszweig: es liegt hinter jedem Zeichen, das ein
            // Standname tragen kann.
            const zeilen = aktiv
              ? [...menge]
                  .map((id) => ({ id, name: namen.get(id) ?? null }))
                  .sort((a, b) =>
                    (a.name ?? '￿').localeCompare(b.name ?? '￿', 'de'),
                  )
              : []

            return (
              <li
                key={g.id}
                className={`revier-gruppen-zeile${aktiv ? ' aktiv' : ''}`}
              >
                {/* **`gesperrt` gilt für ALLE Zeilen, auch die aktive**
                    (Fremdprüfung Codex 18.08.2026, Q8, `[mittel]`). Vorher
                    stand hier `gesperrt && !aktiv`, damit man die angewählte
                    Gruppe jederzeit von der Karte nehmen kann — genau dieser
                    Klick ruft aber `aufAnsehen(null)` und damit `zeige(null)`,
                    und das **verwirft einen offenen Entwurf ungefragt** (S5).
                    Der Weg aus einer Bearbeitung heraus ist „Abbrechen" in der
                    Optionenzeile; der ist beschriftet und fragt nicht heimlich. */}
                <button
                  type="button"
                  className="revier-gruppen-waehler"
                  onClick={() => aufAnsehen(aktiv ? null : g)}
                  disabled={gesperrt}
                  aria-pressed={aktiv}
                >
                  <span className="revier-gruppen-name">{g.name}</span>
                  <span className="zentrale-pill">
                    {anzahl} {anzahl === 1 ? 'Stand' : 'Stände'}
                  </span>
                  {imPapierkorb > 0 && (
                    <span className="zentrale-pill">{imPapierkorb} im Papierkorb</span>
                  )}
                </button>

                {aktiv && (
                  <ul className="revier-gruppen-staende" role="list">
                    {zeilen.length === 0 ? (
                      <li className="leer">
                        {bearbeitet
                          ? 'Noch kein Stand angetippt.'
                          : 'Diese Gruppe hat noch keine Stände.'}
                      </li>
                    ) : (
                      zeilen.map((s) => (
                        <li key={s.id} className={s.name === null ? 'fehlt' : undefined}>
                          {s.name ?? 'Im Papierkorb'}
                        </li>
                      ))
                    )}
                  </ul>
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
            onChange={(e) => aufNeu(e.target.value)}
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
    </aside>
  )
}
