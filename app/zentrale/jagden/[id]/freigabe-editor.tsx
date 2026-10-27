'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { schreibe } from '../../schreiben'
import { VORBEREITBARE_STATUS } from '../jagden'
import { ladeVorlagen, useSpeicherLauf } from './editor-teile'
import type { Katalogzeile } from './regeln-bereich'
import {
  alsEntwurf,
  alsFeldtext,
  alsFreigabeArt,
  blockTextSetzen,
  blockVon,
  entwurfStand,
  FREIGABE_MAX_ZEILEN,
  fuegeHinzu,
  JAGDREGELN_MAX_ZEICHEN,
  konfliktBeimHinzufuegen,
  pruefeFreigabe,
  pruefeFreigabeRegeln,
  pruefeFreigabeVersion,
  regelnZumSpeichern,
  sortiereNachWildart,
  verwaisteRegeln,
  vorlageEinfuegen,
  type EntwurfZeile,
  type FreigabeArt,
  type FreigabeRegel,
  type FreigabeStand,
  type RegelVorlage,
} from './regeln'
import { sucheArten } from './suche'

type Block = { id: string; name: string }

/**
 * Inline-Rückfragen statt `window.confirm` (E1): dieselbe Bauform wie beim
 * Entfernen von Teilnehmern. Solange eine offen ist, ist der übrige Editor
 * gesperrt, und ihre Wirkung trifft den Entwurf zum Zeitpunkt der Bestätigung
 * (Codex 7).
 */
type Rueckfrage =
  | { art: 'ersetzt'; neu: FreigabeArt }
  | { art: 'entfernen'; i: number; namen: string }
  | { art: 'vorlage'; block: Block; vorlage: RegelVorlage }
  | { art: 'schliessen' }

type Vorlagen = { blockId: string } & (
  | { zustand: 'laedt' }
  | { zustand: 'fehler'; text: string }
  | { zustand: 'da'; liste: RegelVorlage[] }
)

function Frage({ text, children }: { text: string; children: ReactNode }) {
  return (
    <div className="zentrale-inspektor-warnung">
      {text}
      <div className="zentrale-inspektor-fuss">{children}</div>
    </div>
  )
}

/**
 * Die Freigabe einer Jagd bearbeiten (Fahrplan P1c, Bauplan Portal
 * Freigabe/Regeln V2.1) — dieselben Spalten mit denselben Regeln wie die App
 * (`FreigabeAnsicht.tsx`, `speichereFreigabe`), am Desktop als **Katalog
 * links, Entwurf rechts** (E1, Bauform c).
 *
 * - **Der Entwurf ist eine flache Liste in Einfügereihenfolge** wie in der
 *   App; rechts nach Wildart gruppiert ist nur die Darstellung. Gespeichert
 *   wird sortiert (`sortiereNachWildart`), wie in der App.
 * - **Regeln je Wildart** je Block ein Textfeld mit eigenem Eingabezustand
 *   (E3, Codex D3); im Zustand roh, bis jemand tippt (`blockTextSetzen`).
 *   Regeln einer entfernten Wildart bleiben ausgeblendet im Entwurf und werden
 *   nicht gesendet (E1 Schritt 5).
 * - **Compare-and-Swap über `freigabe_version`** der beim Öffnen
 *   eingefrorenen Basis, dazu der Statusfilter; Arten und Regeln in EINEM
 *   UPDATE (138/140).
 * - Frist, Ausgänge, „Doch gespeichert" und ein Versuch zur Zeit wie beim
 *   Jagdregeln-Editor (`useSpeicherLauf`, E6/E9). Kein eigenes Nachladen,
 *   kein `<form>`.
 */
export default function FreigabeEditor({
  jagdId,
  basis: basisProp,
  katalog,
  nutzerId,
  onSchliessen,
}: {
  jagdId: string
  /** Stand beim Öffnen — gegen SEINE Version vergleicht der Compare-and-Swap. */
  basis: FreigabeStand
  /** Der globale Katalog (`page.tsx`), nach Name sortiert. */
  katalog: Katalogzeile[]
  /** Das eigene Konto — die Vorlagen hängen an ihm (`user_settings`). */
  nutzerId: string
  /** Schließt den Editor; `hinweis` erscheint danach unter der Freigabe. */
  onSchliessen: (hinweis: string | null) => void
}) {
  // Eingefroren beim Öffnen (E9, Codex CN-277 A3/C1): neue Props nach einem
  // Nachladen der Seite dürfen die Basis eines offenen Editors nicht ersetzen.
  const [basis] = useState(basisProp)
  // Trägt auch Name und Oberart, die `sortiereNachWildart` braucht.
  const arten = useMemo(
    () => new Map<string, FreigabeArt>(katalog.map((w) => [w.id, alsFreigabeArt(w)])),
    [katalog],
  )
  const [zeilen, setZeilen] = useState<EntwurfZeile[]>(() => alsEntwurf(basis.freigabe ?? [], arten))
  // Auch die Regeln einer Wildart, die gerade nicht im Entwurf steht — nur
  // ausgeblendet; kommt sie zurück, sind sie wieder da (Schlusslesung B5).
  const [regeln, setRegeln] = useState<FreigabeRegel[]>(() => basis.regeln ?? [])
  /** Je Block genau das Getippte (E3, Codex D3) — erst ab dem ersten Tippen. */
  const [felder, setFelder] = useState<Record<string, string>>({})
  const { phase, meldung, starte, lebt } = useSpeicherLauf()
  const [rueckfrage, setRueckfrage] = useState<Rueckfrage | null>(null)
  const [vorlagen, setVorlagen] = useState<Vorlagen | null>(null)
  // Jeder Abruf und jedes Schließen der Liste zählt hoch; eine Antwort zählt
  // nur, wenn danach nichts kam — sonst überschriebe die späte Liste von
  // Block A die inzwischen gewählte von Block B (Codex P1c C-F4).
  const vorlagenLauf = useRef(0)
  const [suche, setSuche] = useState('')
  const [offeneFamilie, setOffeneFamilie] = useState<string | null>(null)

  const stand = entwurfStand(zeilen, regeln, arten, basis)
  const laeuft = phase === 'schreibt' || phase === 'wartet'
  const gesperrt = phase !== 'bearbeiten' || rueckfrage !== null
  const voll = zeilen.length >= FREIGABE_MAX_ZEILEN

  // Reload und Tab schließen fragen nach, solange etwas verloren ginge (E9).
  // Link-Navigation im Portal erreicht das nicht (CP-107, hingenommen).
  const schuetzen = stand.geaendert || laeuft
  useEffect(() => {
    if (!schuetzen) return
    const warnen = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [schuetzen])

  // ── Katalog (links) ──
  // Zur Wahl nur bejagdbare Arten; gesucht wird flach über alle samt Klassen,
  // ohne Suche die oberste Ebene, eine Familie klappt auf (E1 Schritt 2).
  const zurWahl = useMemo(() => katalog.filter((w) => w.bejagdbar), [katalog])
  const klassenVon = useMemo(() => {
    const map = new Map<string, Katalogzeile[]>()
    for (const w of zurWahl) {
      if (w.eltern_id === null) continue
      map.set(w.eltern_id, [...(map.get(w.eltern_id) ?? []), w])
    }
    for (const liste of map.values()) liste.sort((a, b) => a.name.localeCompare(b.name, 'de'))
    return map
  }, [zurWahl])
  const oben = useMemo(
    () => zurWahl.filter((w) => w.eltern_id === null).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [zurWahl],
  )
  const treffer = suche.trim() === '' ? null : sucheArten(zurWahl, suche)

  const waehle = (w: Katalogzeile) => {
    if (gesperrt || voll) return
    const neu = alsFreigabeArt(w)
    const konflikt = konfliktBeimHinzufuegen(neu, zeilen)
    if (konflikt === 'oberart-frei') return
    if (konflikt === 'ersetzt-klassen') setRueckfrage({ art: 'ersetzt', neu })
    // Eine Art, die schon drinsteht, gibt eine weitere Zeile — so entsteht
    // „männlich bis 50 kg" neben „ab 80 kg" (E1).
    else setZeilen((z) => fuegeHinzu(z, neu))
  }

  const artKnopf = (w: Katalogzeile, alsOberart: boolean) => {
    const frei = konfliktBeimHinzufuegen(alsFreigabeArt(w), zeilen) === 'oberart-frei'
    return (
      <button type="button" disabled={gesperrt || voll || frei} onClick={() => waehle(w)}>
        {alsOberart ? `${w.name} (alle)` : w.name}
        {frei ? <span className="jagd-freigabe-notiz">schon ganz frei</span> : null}
      </button>
    )
  }

  // ── Entwurf (rechts) ──
  const setze = (i: number, teil: Partial<EntwurfZeile>) =>
    setZeilen((alle) => alle.map((z, j) => (j === i ? { ...z, ...teil } : z)))

  const vorlagenSchliessen = () => {
    vorlagenLauf.current++
    setVorlagen(null)
  }

  /**
   * Nimmt Zeile `i` heraus. Verliert damit ein Block seine letzte Zeile,
   * geht seine Vorlagenliste mit — sonst stünde sie samt einer späten
   * Antwort wieder da, sobald die Wildart zurückkommt (Codex P1c D2).
   */
  const zeileWeg = (i: number) => {
    const rest = zeilen.filter((_, j) => j !== i)
    if (vorlagen && !rest.some((z) => blockVon(z.art) === vorlagen.blockId)) vorlagenSchliessen()
    setZeilen(rest)
  }

  /** Nimmt das die letzte Zeile einer Wildart mit Regeln, erst fragen (E1 Schritt 5). */
  const entfernen = (i: number) => {
    if (gesperrt) return
    const weg = verwaisteRegeln(stand.sichtbareRegeln ?? [], zeilen.filter((_, j) => j !== i))
    if (weg.length === 0) zeileWeg(i)
    else setRueckfrage({ art: 'entfernen', i, namen: weg.map((r) => r.name).join(', ') })
  }

  const feldVon = (id: string) => felder[id] ?? alsFeldtext(regeln.find((r) => r.wildart_id === id)?.regeln ?? null)
  const feldSetzen = (block: Block, text: string) => {
    setFelder((f) => ({ ...f, [block.id]: text }))
    setRegeln((alle) => blockTextSetzen(alle, block, text, basis.regeln))
  }

  /** Lädt die Vorlagen beim Klick (E4) — je Block, eine Liste zur Zeit. */
  const vorlagenLaden = async (blockId: string) => {
    const nr = ++vorlagenLauf.current
    setVorlagen({ blockId, zustand: 'laedt' })
    try {
      const liste = await ladeVorlagen(nutzerId)
      if (lebt.current && nr === vorlagenLauf.current) setVorlagen({ blockId, zustand: 'da', liste })
    } catch (e) {
      if (lebt.current && nr === vorlagenLauf.current) {
        setVorlagen({
          blockId,
          zustand: 'fehler',
          text: e instanceof Error ? e.message : 'Vorlagen gerade nicht abrufbar.',
        })
      }
    }
  }

  /** Ersetzen oder anhängen — auf den Text zum Zeitpunkt der Bestätigung (E1). */
  const einfuegen =(block: Block, vorlage: RegelVorlage, ersetzen: boolean) => {
    feldSetzen(block, vorlageEinfuegen(ersetzen ? [] : [feldVon(block.id)], vorlage).join('\n'))
    vorlagenSchliessen()
    setRueckfrage(null)
  }

  // Stehen schon Regeln da, fragen: ersetzen oder anhängen (CN-387).
  const vorlageWaehlen = (block: Block, vorlage: RegelVorlage) => {
    if (regelnZumSpeichern([feldVon(block.id)]) === null) einfuegen(block, vorlage, false)
    else setRueckfrage({ art: 'vorlage', block, vorlage })
  }

  const speichern = () => {
    if (gesperrt || !stand.pruefung.gueltig || !stand.geaendert || stand.regelnZuLang) return
    // Sortiert gespeichert (CN-347) — im Entwurf bleibt eine neue Art bis
    // hierhin, wo sie eingefügt wurde.
    const freigabe = stand.pruefung.wert && sortiereNachWildart(stand.pruefung.wert, arten)
    const jeArt = stand.sichtbareRegeln
    starte(
      () =>
        schreibe('Die Freigabe', () =>
          createClient()
            .from('hunts')
            // Arten UND Regeln in einem UPDATE: wer nur `freigabe` schickt,
            // kann keine Art mit Regeln entfernen (140, `22023`).
            .update({ freigabe, freigabe_regeln: jeArt })
            .eq('id', jagdId)
            .eq('freigabe_version', basis.version)
            .in('status', VORBEREITBARE_STATUS)
            .select('freigabe, freigabe_regeln, freigabe_version'),
        ),
      (zeile, fristUm) => {
        const z = zeile as Record<string, unknown>
        const lesbar =
          pruefeFreigabe(z.freigabe) !== undefined &&
          pruefeFreigabeRegeln(z.freigabe_regeln) !== undefined &&
          pruefeFreigabeVersion(z.freigabe_version) !== undefined
        onSchliessen(
          !lesbar
            ? 'Die Freigabe wurde gespeichert, kam aber nicht lesbar zurück.'
            : fristUm
              ? 'Doch gespeichert — die Antwort kam nach der Frist.'
              : 'Gespeichert.',
        )
      },
    )
  }

  const schliessen = () => {
    // Nach der Frist ebenfalls fragen: eine Antwort danach fiele ins Leere.
    if (stand.geaendert || phase === 'wartet') setRueckfrage({ art: 'schliessen' })
    else onSchliessen(null)
  }

  const zeileAnzeigen = (i: number) => {
    const z = zeilen[i]
    // Klassen hat nur eine Oberart: sie steht als „Schwarzwild (alle)" da.
    const titel = klassenVon.has(z.art.id) ? `${z.art.name} (alle)` : z.art.name
    return (
      <div key={`${z.art.id}-${i}`}>
        <div className="jagd-freigabe-zeile">
          <span className="jagd-freigabe-art">{titel}</span>
          {/* Keiler und Bache tragen ihr Geschlecht schon (`geschlecht_implizit`). */}
          {z.art.geschlechtImplizit ? null : (
            <select
              aria-label={`${z.art.name}, Geschlecht`}
              value={z.geschlecht ?? ''}
              disabled={gesperrt}
              onChange={(e) =>
                setze(i, { geschlecht: e.target.value === '' ? null : (e.target.value as 'maennlich' | 'weiblich') })
              }
            >
              <option value="">beide</option>
              <option value="maennlich">männlich</option>
              <option value="weiblich">weiblich</option>
            </select>
          )}
          {/* Textfeld, nicht `type="number"`: sonst ginge „1e2" durch und das
              Mausrad änderte den Wert (E1, Schlusslesung F5). */}
          <input
            aria-label={`${z.art.name}, Gewicht ab`}
            placeholder="ab kg"
            inputMode="numeric"
            maxLength={3}
            value={z.gewichtMin}
            readOnly={gesperrt}
            onChange={(e) => setze(i, { gewichtMin: e.target.value })}
          />
          <input
            aria-label={`${z.art.name}, Gewicht bis`}
            placeholder="bis kg"
            inputMode="numeric"
            maxLength={3}
            value={z.gewichtMax}
            readOnly={gesperrt}
            onChange={(e) => setze(i, { gewichtMax: e.target.value })}
          />
          <button type="button" disabled={gesperrt} onClick={() => entfernen(i)} aria-label={`${z.art.name} entfernen`}>
            Entfernen
          </button>
        </div>
        {stand.pruefung.fehler[i] ? <p className="zentrale-inspektor-warnung">{stand.pruefung.fehler[i]}</p> : null}
        {rueckfrage?.art === 'entfernen' && rueckfrage.i === i ? (
          <Frage text={`${rueckfrage.namen} hat Regeln. Ohne ${rueckfrage.namen} in der Freigabe werden sie nicht gespeichert.`}>
            <button type="button" autoFocus onClick={() => setRueckfrage(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="warn"
              onClick={() => {
                // Der Editor ist während der Rückfrage gesperrt — `zeilen` ist
                // also noch der Stand, zu dem gefragt wurde (E1).
                zeileWeg(rueckfrage.i)
                setRueckfrage(null)
              }}
            >
              Entfernen
            </button>
          </Frage>
        ) : null}
      </div>
    )
  }

  const blockAnzeigen = (block: Block) => {
    const liste = vorlagen?.blockId === block.id ? vorlagen : null
    return (
      <section key={block.id} className="jagd-freigabe-block">
        <h4>{block.name}</h4>
        {zeilen.flatMap((z, i) => (blockVon(z.art) === block.id ? [zeileAnzeigen(i)] : []))}
        <div className="zentrale-inspektor-feld">
          <label htmlFor={`regeln-${block.id}`}>Regeln für {block.name} — eine je Zeile, leer = keine</label>
          {/* `readOnly` statt `disabled`: der Text bleibt markier- und kopierbar (E9). */}
          <textarea
            id={`regeln-${block.id}`}
            rows={3}
            value={feldVon(block.id)}
            readOnly={gesperrt}
            onChange={(e) => feldSetzen(block, e.target.value)}
          />
        </div>
        {liste === null ? null : liste.zustand === 'laedt' ? (
          <p className="zentrale-hinweis">Vorlagen werden geladen …</p>
        ) : liste.zustand === 'fehler' ? (
          <div className="zentrale-inspektor-fuss jagd-regeln-vorlagen">
            <span role="alert">{liste.text}</span>
            <button type="button" disabled={gesperrt} onClick={() => void vorlagenLaden(block.id)}>
              Erneut versuchen
            </button>
          </div>
        ) : liste.liste.length === 0 ? (
          <p className="zentrale-hinweis">Noch keine Vorlagen — angelegt werden sie in der App (Du → Jagdeinstellungen).</p>
        ) : (
          <div className="zentrale-inspektor-fuss jagd-regeln-vorlagen">
            {liste.liste.map((v) => (
              <button key={v.titel} type="button" disabled={gesperrt} onClick={() => vorlageWaehlen(block, v)}>
                {v.titel}
              </button>
            ))}
            <button type="button" disabled={gesperrt} onClick={vorlagenSchliessen}>
              Keine einfügen
            </button>
          </div>
        )}
        {rueckfrage?.art === 'vorlage' && rueckfrage.block.id === block.id ? (
          <Frage text={`Es stehen schon Regeln da. „${rueckfrage.vorlage.titel}“ ersetzt sie oder kommt unten dazu.`}>
            <button type="button" autoFocus onClick={() => einfuegen(block, rueckfrage.vorlage, true)}>
              Ersetzen
            </button>
            <button type="button" onClick={() => einfuegen(block, rueckfrage.vorlage, false)}>
              Anhängen
            </button>
            <button type="button" onClick={() => setRueckfrage(null)}>
              Abbrechen
            </button>
          </Frage>
        ) : (
          <button
            type="button"
            className="jagd-freigabe-vorlage"
            disabled={gesperrt || liste?.zustand === 'laedt'}
            onClick={() => void vorlagenLaden(block.id)}
          >
            Vorlage einfügen
          </button>
        )}
      </section>
    )
  }

  return (
    <div className="jagd-regeln-editor">
      <div className="jagd-freigabe-editor">
        <div className="jagd-freigabe-katalog">
          <div className="zentrale-inspektor-feld">
            <label htmlFor="freigabe-suche">Art suchen — „Sau“ findet Schwarzwild</label>
            {/* Wie der ganze Editor gesperrt, solange eine Rückfrage offen ist (E1, Codex P1c C-F1). */}
            <input
              id="freigabe-suche"
              type="search"
              value={suche}
              readOnly={gesperrt}
              onChange={(e) => setSuche(e.target.value)}
              autoComplete="off"
            />
          </div>
          {voll ? (
            <p className="zentrale-hinweis">
              {FREIGABE_MAX_ZEILEN} Zeilen erreicht — für eine weitere erst eine entfernen.
            </p>
          ) : null}
          {rueckfrage?.art === 'ersetzt' ? (
            <Frage
              text={`${rueckfrage.neu.name} ganz freigeben? Das ersetzt: ${zeilen
                .filter((z) => z.art.elternId === rueckfrage.neu.id)
                .map((z) => z.art.name)
                .join(', ')}.`}
            >
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setZeilen((alle) => fuegeHinzu(alle, rueckfrage.neu))
                  setRueckfrage(null)
                }}
              >
                Ersetzen
              </button>
              <button type="button" onClick={() => setRueckfrage(null)}>
                Abbrechen
              </button>
            </Frage>
          ) : null}
          <ul className="jagd-freigabe-arten">
            {treffer !== null ? (
              treffer.length === 0 ? (
                <li className="zentrale-hinweis">Keine Art gefunden.</li>
              ) : (
                treffer.map((w) => <li key={w.id}>{artKnopf(w, klassenVon.has(w.id))}</li>)
              )
            ) : (
              oben.map((w) => {
                const klassen = klassenVon.get(w.id)
                if (!klassen) return <li key={w.id}>{artKnopf(w, false)}</li>
                const offen = offeneFamilie === w.id
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      aria-expanded={offen}
                      disabled={gesperrt}
                      onClick={() => setOffeneFamilie(offen ? null : w.id)}
                    >
                      {offen ? '▾' : '▸'} {w.name}
                      <span className="jagd-freigabe-notiz">{klassen.length} Klassen</span>
                    </button>
                    {offen ? (
                      <ul>
                        <li>{artKnopf(w, true)}</li>
                        {klassen.map((k) => (
                          <li key={k.id}>{artKnopf(k, false)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })
            )}
          </ul>
        </div>

        <div className="jagd-freigabe-entwurf">
          {zeilen.length === 0 ? (
            <p className="zentrale-hinweis">Noch keine Art. Ohne Zeile ist die Freigabe „nicht eingetragen“.</p>
          ) : null}
          {stand.bloecke.map(blockAnzeigen)}
          {zeilen.length > 0 ? <p className="zentrale-hinweis">Gewichte: aufgebrochen</p> : null}
          {stand.ausgeblendet.length > 0 ? (
            <p className="zentrale-hinweis">
              Nicht gespeichert werden die Regeln für {stand.ausgeblendet.map((r) => r.name).join(', ')} — die
              Wildart steht nicht in der Freigabe.
            </p>
          ) : null}
          {stand.bloecke.length > 0 ? (
            <p className={stand.regelnZuLang ? 'zentrale-inspektor-warnung' : 'zentrale-hinweis'}>
              {stand.regelnZuLang ? 'Zu lang: ' : ''}Regeln je Wildart zusammen {stand.regelZeichen} von{' '}
              {JAGDREGELN_MAX_ZEICHEN} Zeichen
            </p>
          ) : null}
        </div>
      </div>

      {rueckfrage?.art === 'schliessen' ? (
        <Frage text="Änderungen verwerfen? Der Entwurf geht verloren.">
          <button type="button" autoFocus onClick={() => setRueckfrage(null)}>
            Weiter bearbeiten
          </button>
          <button type="button" className="warn" onClick={() => onSchliessen(null)}>
            Verwerfen
          </button>
        </Frage>
      ) : null}

      {meldung ? (
        <p className="zentrale-inspektor-fehler" role="alert">
          {meldung}
        </p>
      ) : null}

      <div className="zentrale-inspektor-fuss">
        <button
          type="button"
          className="haupt"
          disabled={gesperrt || !stand.pruefung.gueltig || !stand.geaendert || stand.regelnZuLang}
          onClick={speichern}
        >
          {laeuft ? 'Wird gespeichert …' : 'Speichern'}
        </button>
        <button type="button" disabled={phase === 'schreibt' || rueckfrage !== null} onClick={schliessen}>
          {stand.geaendert ? 'Verwerfen …' : 'Schließen'}
        </button>
      </div>
    </div>
  )
}
