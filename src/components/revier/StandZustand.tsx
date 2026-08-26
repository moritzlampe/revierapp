'use client'

import { useState } from 'react'
import { zustandsSatz, type Pruefung, type PruefStatus } from '@/lib/revier/wartung'

/**
 * „3. Nov. 2025, 14:12" — Datum plus Uhrzeit, weil an einem Tag zweimal geprüft
 * werden kann und die Reihenfolge dann sonst unbelegt bliebe.
 *
 * **Fest auf Berlin**, wie überall sonst im Repo, wo ein `timestamptz`
 * angezeigt wird (`DiaryTimelineList`, `ErlegungCard`, im Portal `zeitpunkt` in
 * `objekt-inspektor.tsx`). Ohne die Zeitzone liefe die Anzeige in der des
 * Geräts, und dieselbe Prüfung stünde auf dem Handy im Ausland auf einem
 * anderen Tag als im Portal. Ein Revier liegt in einer Zeitzone, und die Frage
 * „war das vor der Drückjagd?" wird in Ortszeit gestellt. Genau dieser
 * fehlende Eintrag war Finding 3 der Schlusslesung vom 25.08.2026.
 */
const zeitpunkt = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})

/** Was der Knopf tut, in der Sprache des Zustands, den er hinterlässt. */
const SCHADEN_TEXT: Record<Exclude<PruefStatus, 'ok'>, {
  knopf: string
  frage: string
  bestaetigen: string
}> = {
  mangel: {
    knopf: 'Mangel melden',
    frage: 'Was ist aufgefallen?',
    bestaetigen: 'Melden',
  },
  gesperrt: {
    knopf: 'Sperren — nicht besetzen',
    frage: 'Was ist kaputt? Der Stand wird als „nicht besetzen" geführt, bis ihn jemand wieder freigibt.',
    bestaetigen: 'Sperren',
  },
}

const knopfStil: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '0.625rem',
  color: 'var(--text)',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  minHeight: '2.75rem',
}

/**
 * Die eine Zeile, die den Zustand eines Standes sagt — **für jeden, der sie
 * braucht, dieselbe.**
 *
 * Zweiter Leser ist die Sperrwarnung im Einteilen-Sheet der Jagdkarte
 * (`MapContent.tsx`, `StandAssignSheet`). Dort stünde sonst eine zweite,
 * handgeschriebene Fassung desselben Satzes — und genau so laufen zwei
 * Anzeigen desselben Sachverhalts auseinander. Die Feld-App hat aus demselben
 * Grund ein `stateLine()`.
 *
 * **Der Fehlerfall behauptet NICHTS über den Stand** — er sagt, dass wir es
 * nicht wissen. Er hat Vorrang vor „wird geladen", weil ein gescheiterter
 * Versuch die jüngere Information ist.
 */
export function zustandsZeile(
  pruefung: Pruefung | null,
  prueferName: string | null,
  { pruefFehler = false, laedt = false }: { pruefFehler?: boolean; laedt?: boolean } = {},
): string {
  if (pruefFehler) return 'Prüfstand nicht abrufbar'
  /**
   * **`laedt` gilt nur, wenn NICHTS bekannt ist** (Fremdprüfung 26.08.2026,
   * A5 `[mittel]`). Vorher stand es vor `zustandsSatz()` und überstimmte damit
   * auch eine bekannte Sperre: bei jedem Nachladen wäre die
   * Sicherheitsauskunft für die Dauer der Abfrage verschwunden. Eine bekannte
   * Prüfung ist die beste verfügbare Auskunft, auch während eine frischere
   * unterwegs ist.
   */
  if (laedt && pruefung === null) return 'Prüfstand wird geladen …'
  const zeit = pruefung ? zeitpunkt.format(new Date(pruefung.checkedAt)) : ''
  const wann = prueferName === null ? zeit : `${zeit} von ${prueferName}`
  return zustandsSatz(pruefung, wann)
}

/**
 * Der Standzustand am Kartenobjekt — anzeigen und eintragen (Konzept
 * Standzustand §4.4).
 *
 * **Kein neuer Bildschirm, und das ist die Entscheidung des Konzepts.** Das
 * Sheet hat Notiz und Fotos längst; der Zustand kommt daneben, mit denselben
 * drei Knöpfen wie die Feld-App.
 *
 * **Warum die PWA überhaupt erfasst und nicht nur anzeigt** (§2.2): prüfen darf
 * jeder, der das Objekt sieht — die Policy aus Migration 066 verlangt nur
 * `checked_by = auth.uid()`. Ein Recht, das nur ein Gerätetyp ausüben kann, ist
 * keines.
 *
 * **Zwei Leser, eine Fassung** (seit 26.08.2026). Der Block saß bis dahin in
 * `ObjektDetailSheet.tsx` und war damit nur über den mobilen Revier-Editor
 * erreichbar — den erreicht wiederum nur der Revierbesitzer, weil
 * `app/app/du/revier/[id]/page.tsx` jeden anderen umleitet. **Der zweite Leser
 * ist das Stand-Detail-Sheet der Jagdkarte** (`src/components/hunt/StandDetailSheet.tsx`),
 * und mit ihm erreicht §2.2 endlich den, für den er geschrieben ist: den
 * Begehungsscheininhaber und den Gast auf einer fremden Drückjagd. Beide sehen
 * Kartenobjekte allein dort (`map_objects_hunt_member` bzw.
 * `map_objects_jes_select`).
 *
 * **Das ist kein neues Recht, sondern eine fehlende Tür.**
 * `map_object_checks_insert` (066) verlangt `checked_by = auth.uid()` und ein
 * SICHTBARES Kartenobjekt — das `exists` läuft unter der RLS des Aufrufers.
 * Wer den Stand sieht, darf ihn prüfen; die Feld-App nutzt das seit jeher
 * (`quickhunt-native/src/components/hunt/StandSheet.tsx`, ohne weiteres Gate).
 * Die PWA zieht nach.
 *
 * **Anti-Kitsch, und hier kostet es etwas:** der Zustand ist Typografie, keine
 * Ampel. Ein gesperrter Stand bekommt Gewicht über Wortwahl, nicht über eine
 * Alarmfarbe — dieselbe Entscheidung wie in der Feld-App.
 */
export type StandZustandProps = {
  pruefung: Pruefung | null
  pruefFehler: boolean
  /**
   * Der Prüfstand ist unterwegs — **der vierte Fall, und er fehlte hier**.
   *
   * Der mobile Revier-Editor kennt ihn nicht: dort lädt der Server, die Zeilen
   * stehen im ersten Bild. Die Jagdkarte lädt im Browser nach, und ohne diesen
   * Zustand stünde in der Lücke „Noch nie geprüft" — **ein Ladevorgang, der
   * sich als gültige Auskunft liest** (S4). Ein Stand mit aktiver Sperre sähe
   * für den Augenblick frei aus, und das ist genau der Augenblick, in dem
   * eingeteilt wird.
   *
   * Die Feld-App trennt denselben Fall seit dem 28.07.2026 als
   * `CheckState.kind === 'loading'`; der Satz unten ist von dort zeichengleich
   * übernommen.
   */
  laedt?: boolean
  prueferName: string | null
  wartbar: boolean
  onCheck: (status: PruefStatus, note: string | null) => Promise<boolean>
}

export function StandZustand({
  pruefung,
  pruefFehler,
  laedt = false,
  prueferName,
  wartbar,
  onCheck,
}: StandZustandProps) {
  /**
   * `zu` → die drei Knöpfe → bei Schaden die Notiz. Drei Schritte, weil die
   * Notiz Pflicht ist und ein Sheet im Sheet mehr Bedienung als Inhalt wäre.
   */
  const [schritt, setSchritt] = useState<'zu' | 'wahl' | Exclude<PruefStatus, 'ok'>>('zu')
  const [notiz, setNotiz] = useState('')
  const [laeuft, setLaeuft] = useState(false)

  /**
   * Der Zustand steht IMMER da, wenn es etwas zu sagen gibt — er lässt sich
   * nicht wegklappen. Ein gesperrter Stand darf sich nicht verstecken.
   *
   * **Ein nicht wartbarer Objekttyp bekommt trotzdem eine Zeile, WENN eine
   * Prüfung an ihm hängt.** Der Schnitt auf sieben Arten ist vom 22.08.2026;
   * die Feld-App konnte vorher jeden Typ prüfen. Ohne diese Bedingung stünde
   * ein Parkplatz mit alter Sperre hier ohne jede Erklärung da — dieselbe
   * Lücke, die das Portal am 25.08.2026 geschlossen hat.
   *
   * **`pruefFehler` gehört NICHT in diese Bedingung** (Ponytail 25.08.2026):
   * ein Steinbruch bekäme dann bei jedem Ladefehler „Prüfstand nicht abrufbar"
   * — eine Auskunft über eine Frage, die an ihm niemand stellt. Für alles, was
   * einen Zustand HAT, deckt `wartbar` den Fehlerfall bereits ab.
   */
  if (!wartbar && !pruefung) return null

  const satz = zustandsZeile(pruefung, prueferName, { pruefFehler, laedt })

  /**
   * Melden — und `laeuft` in JEDEM Ausgang zurücksetzen.
   *
   * **Das `finally` ist ein Befund der Fremdprüfung** (25.08.2026, B1
   * `[medium]`). Vorher stand `setLaeuft(false)` hinter dem `await`: wirft
   * `onCheck` — und ein Netzabbruch lässt `fetch` unter PostgREST tatsächlich
   * werfen, statt `{ error }` zu liefern —, wird die Zeile übersprungen. Alle
   * Knöpfe blieben dann dauerhaft deaktiviert, und der Melder müsste das Sheet
   * schließen und seine Notiz neu tippen. Ausgerechnet im Funkloch, wo der
   * Fall eintritt.
   *
   * **Eine Ablehnung wird wie `false` behandelt**, nicht durchgereicht: der
   * Aufrufer meldet den Fehlschlag bereits per Toast, und ein zweiter Kanal für
   * dieselbe Nachricht wäre einer zu viel. Was hier zählt, ist allein, ob die
   * Zeile liegt.
   */
  async function melde(status: PruefStatus, note: string | null) {
    setLaeuft(true)
    let gelandet = false
    try {
      gelandet = await onCheck(status, note)
    } catch (e) {
      console.error('Prüfung fehlgeschlagen:', e)
    } finally {
      setLaeuft(false)
    }
    // **Nur bei Erfolg zumachen.** Ging es nicht durch, bleibt die getippte
    // Notiz stehen und der Knopf ist wieder scharf — sonst hätte der Melder im
    // Funkloch seinen Satz verloren und hielte die Meldung für abgesetzt.
    if (gelandet) {
      setSchritt('zu')
      setNotiz('')
    }
  }

  return (
    <div style={{ padding: '0.75rem 1rem 0', display: 'grid', gap: '0.5rem' }}>
      <p
        style={{
          margin: 0,
          fontSize: '0.875rem',
          fontWeight: pruefFehler || (laedt && !pruefung) ? 400 : 600,
          lineHeight: 1.4,
          color: pruefFehler || (laedt && !pruefung) ? 'var(--text-3)' : 'var(--text)',
        }}
      >
        {satz}
      </p>

      {/* Die Notiz der letzten Prüfung — was jemand gesehen hat. Sie soll
          auffallen, nicht alarmieren; deshalb dieselbe gedämpfte Farbe wie in
          der Feld-App und keine Fehlerfarbe.

          **`!pruefFehler` ist Pflicht** (Schlusslesung 25.08.2026, T4): im
          Fehler- und im Deckel-Fall werden die geladenen Zeilen trotzdem
          durchgereicht. Ohne diese Bedingung stünde „Prüfstand nicht
          abrufbar" und DARUNTER eine Notiz — die Zeile behauptet Unwissen,
          die Notiz behauptet Wissen. Wer nichts weiß, sagt nichts. */}
      {!pruefFehler && pruefung?.note && (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
          „{pruefung.note}“
        </p>
      )}

      {schritt === 'zu' && wartbar && (
        // Ein Knopf, der zu dreien wird — kein Chevron, keine Akkordeon-Mechanik.
        <button type="button" onClick={() => setSchritt('wahl')} style={knopfStil}>
          Stand prüfen
        </button>
      )}

      {schritt === 'wahl' && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <button
            type="button"
            disabled={laeuft}
            onClick={() => void melde('ok', null)}
            style={{ ...knopfStil, opacity: laeuft ? 0.6 : 1 }}
          >
            Geprüft, alles heil
          </button>
          {(['mangel', 'gesperrt'] as const).map((art) => (
            <button
              key={art}
              type="button"
              disabled={laeuft}
              onClick={() => setSchritt(art)}
              style={{ ...knopfStil, opacity: laeuft ? 0.6 : 1 }}
            >
              {/* Dieselbe Bedingung wie an der Notiz oben und aus demselben
                  Grund (Schlusslesung 25.08.2026, T4): „Weiter gesperrt
                  melden" ist eine Aussage über den bekannten Zustand. Wer
                  gerade „nicht abrufbar" gemeldet hat, darf sie nicht
                  treffen. */}
              {!pruefFehler && pruefung?.status === 'gesperrt' && art === 'gesperrt'
                ? 'Weiter gesperrt melden'
                : SCHADEN_TEXT[art].knopf}
            </button>
          ))}
          {/* Der Rückweg, ohne etwas zu behaupten. Er fehlte in der Feld-App
              zuerst, und das war kein Schönheitsfehler: das Menü ließ sich nur
              verlassen, indem man eine Prüfung eintrug oder das ganze Sheet
              schloss — also indem man entweder etwas behauptete oder alles
              verwarf. */}
          <button
            type="button"
            disabled={laeuft}
            onClick={() => setSchritt('zu')}
            style={{ ...knopfStil, background: 'none', color: 'var(--text-3)', fontWeight: 400 }}
          >
            Abbrechen
          </button>
        </div>
      )}

      {(schritt === 'mangel' || schritt === 'gesperrt') && (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: 1.4 }}>
            {SCHADEN_TEXT[schritt].frage}
          </p>
          <textarea
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            disabled={laeuft}
            rows={3}
            autoFocus
            placeholder="Kurz beschreiben …"
            style={{
              width: '100%',
              padding: '0.625rem 0.75rem',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '0.625rem',
              color: 'var(--text)',
              fontSize: '0.875rem',
              resize: 'none',
            }}
          />
          <button
            type="button"
            /* **Die Notiz ist Pflicht** (Moritz, 25.08.2026): die PWA folgt hier
               dem Portal, nicht der Feld-App, die eine leere Eingabe als `null`
               durchlässt. Der harte Riegel sitzt im Schreibpfad — dieser Knopf
               ist das Gate davor, nicht der Ersatz dafür (S2). */
            disabled={laeuft || notiz.trim() === ''}
            onClick={() => void melde(schritt, notiz)}
            style={{
              ...knopfStil,
              opacity: laeuft || notiz.trim() === '' ? 0.5 : 1,
              cursor: laeuft || notiz.trim() === '' ? 'default' : 'pointer',
            }}
          >
            {laeuft ? 'Wird gespeichert …' : SCHADEN_TEXT[schritt].bestaetigen}
          </button>
          <button
            type="button"
            disabled={laeuft}
            onClick={() => setSchritt('wahl')}
            style={{ ...knopfStil, background: 'none', color: 'var(--text-3)', fontWeight: 400 }}
          >
            Zurück
          </button>
        </div>
      )}
    </div>
  )
}
