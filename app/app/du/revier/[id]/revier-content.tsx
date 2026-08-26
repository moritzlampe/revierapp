'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Crosshair, CircleNotch } from '@phosphor-icons/react'
import { parsePolygonHex } from '@/lib/geo-utils'
import { createClient } from '@/lib/supabase/client'
import { schreibePruefung } from '@/lib/revier/pruefstand'
import { waitForAccurateGpsFix } from '@/lib/geo/wait-for-gps-fix'
import type { MapObject, ObjektType } from '@/lib/types/revier'
import { parsePointHex } from '@/lib/geo-utils'
import { useBoundaryEditor } from '@/hooks/useBoundaryEditor'
import CategorySheet from '@/components/revier/CategorySheet'
import TypeSheet from '@/components/revier/TypeSheet'
import ObjektEditSheet from '@/components/revier/ObjektEditSheet'
import ObjektDetailSheet from '@/components/revier/ObjektDetailSheet'
import PositionConfirmBar from '@/components/revier/PositionConfirmBar'
import { useConfirmSheet } from '@/components/ui/ConfirmSheet'
import { getJagdjahr } from '@/lib/diary/season'
import {
  alsPruefungen,
  bilanz,
  istWartbar,
  type PruefStatus,
  type PruefZeile,
} from '@/lib/revier/wartung'

const RevierMap = dynamic(() => import('@/components/revier/RevierMap'), { ssr: false })

type District = {
  id: string
  name: string
  owner_id: string
  boundary: unknown
  area_ha: number | null
  bundesland: string | null
}

type Props = {
  district: District
  objects: MapObject[]
  userId: string
  /** Die jüngste Prüfzeile je Kartenobjekt (View aus Migration 117). */
  pruefZeilen: PruefZeile[]
  /**
   * Der Prüfstand konnte nicht geladen werden.
   *
   * **Eigene Prop und nicht „leere Liste", und das ist der Punkt** — dieselbe
   * Unterscheidung, die die Feld-App mit `CheckState.kind === 'error'` macht.
   * Fielen beide auf `[]` zusammen, stünde bei einem Netz- oder RLS-Fehler an
   * jedem Stand „Noch nie geprüft", auch an einem gesperrten. Die Sperre wäre
   * unsichtbar, und zwar genau dann, wenn jemand einteilt.
   */
  pruefFehler: boolean
  /** Kennung → Klarname des Prüfers. Leer, wenn nicht auflösbar (s. `page.tsx`). */
  prueferNamen: Record<string, string>
  /** Der Zeitpunkt vom Server, gegen den Saison und Zukunftsgrenze rechnen. */
  jetztIso: string
}

// --- State Machine ---

type CreationStage =
  | { stage: 'idle' }
  | { stage: 'category-sheet' }
  | { stage: 'type-sheet'; category: 'stand' | 'sonstiges' }
  | { stage: 'awaiting-tap'; type: ObjektType; defaultName: string; defaultDescription: string }
  | { stage: 'positioning'; type: ObjektType; position: [number, number]; defaultName: string; defaultDescription: string; existingId?: string }
  | { stage: 'metadata'; type: ObjektType; position: [number, number]; defaultName: string; defaultDescription: string }
  | { stage: 'detail'; object: MapObject }

// --- Typ-Label für die Pille ---

const TYPE_LABELS: Record<ObjektType, string> = {
  hochsitz: 'Hochsitz',
  kanzel: 'Kanzel',
  drueckjagdstand: 'Drückjagdbock',
  parkplatz: 'Parkplatz',
  kirrung: 'Kirrung',
  salzlecke: 'Salzlecke',
  wildkamera: 'Wildkamera',
  wildacker: 'Wildacker',
  notfall_treffpunkt: 'Notfall-Treffpunkt',
  sonstiges: 'Objekt',
}

/** Position aus MapObject parsen → [lat, lng] */
function parseObjectPosition(pos: unknown): [number, number] | null {
  if (pos && typeof pos === 'object' && 'type' in pos && 'coordinates' in pos) {
    const geo = pos as { type: string; coordinates: number[] }
    if (geo.type === 'Point' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      return [geo.coordinates[1], geo.coordinates[0]]
    }
    return null
  }
  if (typeof pos === 'string') {
    const p = parsePointHex(pos)
    return p ? [p.lat, p.lng] : null
  }
  return null
}

/** Einfacher Centroid: Durchschnitt aller Punkte des ersten Rings */
function centroidFromBoundary(rings: [number, number][][]): [number, number] {
  const ring = rings[0]
  if (!ring || ring.length === 0) return [53.26, 10.35]
  const sumLat = ring.reduce((s, [lat]) => s + lat, 0)
  const sumLng = ring.reduce((s, [, lng]) => s + lng, 0)
  return [sumLat / ring.length, sumLng / ring.length]
}

/**
 * Smart-Paste: erkennt zwei Zahlen in einem Google-Maps-String und trennt sie.
 * Klammern, Grad-Zeichen, Himmelsrichtungen etc. werden zu Trennern.
 * Gibt { lat, lng } zurück wenn GENAU zwei Zahlen erkannt werden, sonst null
 * (= Teil-Eingabe / manuelles Tippen, Feld bleibt unangetastet).
 *   "(53.1234, 10.5678)" / "53.1234; 10.5678" / "53.1234 10.5678" → 53.1234 / 10.5678
 */
function parseCoordPaste(raw: string): { lat: string; lng: string } | null {
  // Alles ausser Ziffern, Punkt, Minus und Trennern → Leerzeichen (= Trenner)
  const cleaned = raw.replace(/[^0-9.\-,;\s]/g, ' ')
  const tokens = cleaned
    .split(/[,;\s]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
  if (tokens.length === 2 && Number.isFinite(Number(tokens[0])) && Number.isFinite(Number(tokens[1]))) {
    return { lat: tokens[0], lng: tokens[1] }
  }
  return null
}

/**
 * Was an einem Write schiefging — oder `null`, wenn er wirklich gelandet ist.
 *
 * **0 betroffene Zeilen sind ein Fehler, kein Erfolg.** PostgREST liefert bei
 * einem Write, den RLS auf 0 Zeilen zusammenstreicht, `{ data: null,
 * error: null }`. Ohne `.select()` ist `data` ohnehin immer `null` — beides
 * sieht ohne diese Prüfung aus wie „hat geklappt".
 *
 * Die Regel steht als **benannte Funktion an einer Stelle** und nicht als
 * Ausdruck an jedem Aufruf, weil genau das hier schiefgegangen ist:
 * `handleDetailDelete` weiter unten macht es seit jeher richtig und erklärt es
 * sogar im Kommentar — die vier Schreibpfade daneben zogen die Lehre trotzdem
 * nicht nach (Backlog E-R1, gefunden 27.07.2026, behoben 29.07.2026). Ein
 * Riegel, der als Ausdruck an einem Aufruf steht, wird beim nächsten vergessen.
 *
 * Warum das gerade jetzt zählt: solange ein Revier genau einen Nutzer hat,
 * filtert RLS nie — die Lücke ist unsichtbar. Sie wird in dem Moment echt, in
 * dem mehrere Leute dasselbe Revier benutzen.
 */
function writeProblem(res: {
  data: unknown[] | null
  error: { message: string } | null
}): string | null {
  if (res.error) return res.error.message
  if (!res.data || res.data.length === 0) return '0 Zeilen betroffen (RLS oder Zeile fehlt)'
  return null
}

export default function RevierContent({
  district,
  objects: initialObjects,
  userId,
  pruefZeilen: initialPruefZeilen,
  pruefFehler: initialPruefFehler,
  prueferNamen,
  jetztIso,
}: Props) {
  const router = useRouter()
  const [objects, setObjects] = useState<MapObject[]>(initialObjects)
  const [creation, setCreation] = useState<CreationStage>({ stage: 'idle' })
  const [toast, setToast] = useState<string | null>(null)

  // GPS-Standort-Capture (awaiting-tap-Stage)
  const [gpsLoading, setGpsLoading] = useState(false)
  // Imperatives Karten-Schwenken nach GPS-Fix (nonce triggert erneut)
  const [centerTarget, setCenterTarget] = useState<{ lat: number; lng: number; nonce: number } | null>(null)

  // Koordinaten-Eingabe (zwei Felder + Smart-Paste, awaiting-tap-Stage)
  const [coordOpen, setCoordOpen] = useState(false)
  const [coordLat, setCoordLat] = useState('')
  const [coordLng, setCoordLng] = useState('')
  const [coordError, setCoordError] = useState<string | null>(null)

  // Metadaten-Entwurf: überlebt positioning ↔ metadata Wechsel
  const [draftMetadata, setDraftMetadata] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  })

  /**
   * Der Standzustand, live — die Zeilen aus der View, im State statt in der
   * Prop, damit eine eben eingetragene Prüfung sofort dasteht.
   *
   * **Kein `router.refresh()` nach dem Schreiben, und das ist ein Unterschied
   * zum Portal.** Dort ist der Nachtrag eine seltene Handlung am Schreibtisch;
   * hier steht jemand im Wald vor dem Stand, oft mit schlechtem Empfang, und
   * geht gleich zum nächsten. Ein voller Server-Rundgang je Prüfung wäre die
   * Wartezeit genau dort, wo sie am teuersten ist.
   *
   * ⚠ **Hier stand, ein Ersetzen je `map_object_id` bilde die View „exakt
   * nach". Das war falsch, und die Fremdprüfung hat es gefunden** (25.08.2026,
   * A6 `[high]`). Die Begründung — mobil kann nicht rückdatiert werden, die
   * eigene Zeile ist also immer die jüngste — gilt nur, solange **niemand
   * sonst schreibt.** Schreibt A „ok", danach B „gesperrt", und trifft erst
   * dann As Antwort ein, ersetzt A seine Zeile durch die eigene ältere: die
   * View führt Bs Sperre, As Bildschirm zeigt „Geprüft". **Ein
   * sicherheitsrelevanter Zustand, der falsch steht, bis jemand neu lädt.**
   *
   * **Was `handleCheck` deshalb tut:** es liest nach dem Insert die eine
   * View-Zeile dieses Objekts nach — gefiltert, indiziert, ein Bruchteil eines
   * vollen Rundgangs — und übernimmt, was dort steht. Die Wartezeit liegt
   * hinter dem gelungenen Schreiben; die Meldung ist zu diesem Zeitpunkt
   * bereits sicher.
   */
  const [pruefZeilen, setPruefZeilen] = useState<PruefZeile[]>(initialPruefZeilen)

  /**
   * Der Fehlerzustand des Prüfstands — **im State und nicht mehr nur in der
   * Prop** (Fremdprüfung 26.08.2026, A1 `[hoch]`).
   *
   * Der Server liefert ihn beim Aufbau; dazu kommt seit heute ein zweiter
   * Anlass: **schlägt das Nachlesen nach einem Schreibvorgang fehl, steht die
   * eigene Zeile zwar, aber ob sie die jüngste ist, weiß niemand.**
   * `maybeSingle()` meldet solche Fehler im Feld `error` statt das Promise
   * abzulehnen — der `catch` deckte sie also nie. „Geprüft" über einer
   * fremden, frischeren Sperre ist genau die Auskunft, die kosten kann.
   *
   * **Nur in eine Richtung**: einmal unsicher, bleibt unsicher, bis die Seite
   * neu lädt. Ein Zurücknehmen behauptete eine Frische, die niemand gemessen
   * hat.
   */
  /**
   * Der Fehlerzustand des Prüfstands, wie ihn der Server beim Aufbau gemeldet
   * hat — **eine Ableitung der Prop, kein State.** Er gilt für die ganze
   * Seite, weil er von der einen Abfrage stammt, die alle Zeilen holt.
   */
  const pruefFehler = initialPruefFehler

  /**
   * Stände, deren Prüfstand nach dem eigenen Schreiben nicht nachgelesen werden
   * konnte — **je Stand und nicht für die ganze Seite** (Fremdprüfung
   * 26.08.2026 A1, Zuschnitt aus der Schlusslesung F2).
   *
   * `maybeSingle()` meldet einen PostgREST-Fehler im Feld `error` statt das
   * Promise abzulehnen; das Nachlesen war deshalb bei Serverfehlern
   * wirkungslos, und „Geprüft" könnte über einer fremden, frischeren Sperre
   * stehen.
   *
   * **Die erste Fassung hob dafür `pruefFehler` global an, und das war zu
   * grob:** ein einziges gescheitertes Nachlesen ließ die Zusammenfassung im
   * Kopf verschwinden und stellte JEDES Objekt-Sheet auf „Prüfstand nicht
   * abrufbar" — obwohl über die anderen Stände nichts Neues bekannt geworden
   * war. Die Unsicherheit betrifft genau den Stand, an dem geschrieben wurde:
   * seine Zeile steht, aber ob sie die jüngste ist, weiß niemand.
   *
   * **Nur in eine Richtung, und hier zu Recht:** ein Stand, dessen Nachlesen
   * scheiterte, wird in dieser Sitzung nicht wieder sicher — es gibt auf
   * dieser Seite keinen zweiten Leseweg, der ihn freisprechen könnte. Die
   * Jagdkarte hat einen (`ladePruefungFuer`) und nimmt ihn deshalb zurück.
   */
  const [pruefUnsicher, setPruefUnsicher] = useState<ReadonlySet<string>>(new Set())

  /**
   * Der Zeitpunkt, gegen den Saison und Zukunftsgrenze rechnen.
   *
   * **Warum er wachsen muss und nicht bloß eine Konstante ist** (s. `jetztIso`
   * in `page.tsx`): `wartung.ts` zählt eine Prüfung mit `checked_at > jetzt`
   * als NICHT dieser Saison — der Riegel gegen zukunftsdatierte Einträge. Der
   * Server liest `jetztIso` beim Seitenaufbau ab; jede Prüfung, die danach
   * geschrieben wird, trägt ein späteres `checked_at` und liefe genau in diesen
   * Riegel. Der Stand bliebe nach dem eigenen Eintrag „offen", die
   * Zusammenfassung im Kopf rührte sich nicht, und niemand käme darauf, warum.
   *
   * Deshalb rückt der Zeitpunkt auf den geschriebenen Zeitstempel vor, sobald
   * einer eintrifft.
   *
   * ⚠ **Hier stand „er kommt aus derselben Uhr wie die Zeile selbst". Das ist
   * falsch** (Fremdprüfung 25.08.2026, A8 `[medium]`): `jetztIso` stammt vom
   * Next-Server, `checked_at` von Postgres. Zwei Rechner, zwei Uhren. Das
   * Nachrücken funktioniert trotzdem, aber aus einem schwächeren Grund als
   * behauptet — es nimmt schlicht das Maximum aus beiden, und mehr braucht es
   * für diesen Zweck nicht.
   *
   * **Zwei benannte Grenzen, beide bewusst nicht gebaut** (Backlog CP-73):
   * eine Sitzung, die über den 1. April hinweg offen bleibt, rechnet weiter
   * gegen das alte Jagdjahr; und liegt die Postgres-Uhr **vor** der des
   * Next-Servers, könnte eine fremde, gerade erst geschriebene Zeile kurz als
   * zukunftsdatiert gelten. Beide brauchen einen Abgleich beim Sichtbarwerden
   * — ein eigener Schritt, kein Nebenbei.
   */
  const [jetzt, setJetzt] = useState(() => new Date(jetztIso))

  const pruefungen = useMemo(() => alsPruefungen(pruefZeilen), [pruefZeilen])
  const saison = getJagdjahr(jetzt)

  /**
   * „173 Sitze · 32 offen · 3 Mangel · 2 gesperrt" — die Zusammenfassung aus
   * Konzept §3, dieselbe in allen drei Clients.
   *
   * **Die vier Zahlen addieren sich absichtlich NICHT.** `offen` ist die
   * ARBEIT (diese Saison nicht bestätigt), `mangel`/`gesperrt` der ZUSTAND
   * (bekannt kaputt, unabhängig vom Alter). Ein Mangel vom letzten Jahr steht
   * in beiden. Die Begründung steht ausgeschrieben in `wartung.ts`.
   *
   * **Bei einem Ladefehler steht hier NICHTS** statt einer Reihe Nullen. „0
   * offen" wäre die Auskunft „alles erledigt" — und die wäre falsch und
   * beruhigend zugleich, die schlechteste Verbindung.
   */
  const zustandsBilanz = useMemo(
    () =>
      pruefFehler
        ? null
        : bilanz(
            objects.map((o) => ({ id: o.id, typ: o.type })),
            pruefungen,
            saison,
            jetzt,
          ),
    [pruefFehler, objects, pruefungen, saison, jetzt],
  )

  // Live-Boundary aus DB (aktualisiert sich nach Speichern)
  const [boundaryRaw, setBoundaryRaw] = useState<unknown>(district.boundary)

  // Fläche ebenso live. `district.area_ha` ist eine Prop und bliebe nach dem
  // Bearbeiten auf dem alten Wert stehen — der Speicherpfad lud die Zahl bisher
  // schon, hat sie aber verworfen. Sichtbar wurde das erst, als das Löschen
  // überhaupt funktionierte: sonst stand „Grenze entfernt" neben der alten
  // Hektarzahl.
  const [areaHa, setAreaHa] = useState<number | null>(district.area_ha)

  const boundary = useMemo(
    () => parsePolygonHex(boundaryRaw),
    [boundaryRaw],
  )

  const center = useMemo<[number, number]>(
    () => boundary ? centroidFromBoundary(boundary) : [53.26, 10.35],
    [boundary],
  )

  // --- Boundary-Editor ---
  const bEditor = useBoundaryEditor()
  const isOwner = userId === district.owner_id
  // Der Provider hängt schon in `app/app/layout.tsx` — hier ist nur der Zugriff
  // neu. Gebraucht für die Rückfrage vor dem Grenzen-Löschen (E-R3).
  const confirm = useConfirmSheet()

  // Bottom-Bar ausblenden wenn Erstellungs-Flow oder Boundary-Edit aktiv
  const creationActive = creation.stage !== 'idle' || bEditor.editMode
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('quickhunt:keyboard', { detail: { open: creationActive } }))
    return () => {
      if (creationActive) {
        window.dispatchEvent(new CustomEvent('quickhunt:keyboard', { detail: { open: false } }))
      }
    }
  }, [creationActive])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const handleBoundaryStart = useCallback(() => {
    if (creation.stage !== 'idle') return
    // Mehrringige Grenzen kann dieser Editor nicht: `startEditing` nimmt nur
    // `existingBoundary[0]`, und das nächste „Fertig" schriebe ein einringiges
    // Polygon — die Enklaven wären still weg (Backlog E-R4). Lieber ablehnen
    // als stillschweigend kappen. Das Portal lehnt denselben Fall seit Phase 3
    // ab; hier fehlte der Riegel, obwohl beide denselben Hook benutzen.
    //
    // Heute trifft das keine echte Grenze — alle sind einringig. Es wird scharf,
    // sobald Katasterflächen mit Enklaven importiert werden (Schritt 5).
    if (boundary && boundary.length > 1) {
      showToast('Diese Grenze enthält Enklaven und kann hier nicht bearbeitet werden.')
      return
    }
    bEditor.startEditing(boundary)
  }, [boundary, creation.stage, bEditor, showToast])

  const handleBoundaryFinish = useCallback(async () => {
    const points = bEditor.drawPoints
    // Leeres Polygon → boundary NULL setzen
    if (points.length === 0) {
      // Rückfrage vor dem Löschen (Backlog E-R3): bis hierher lag zwischen
      // „Fertig" bei 0 Punkten und „Grenze weg" kein einziger Schritt. Sagt der
      // Nutzer nein, bleibt der Editiermodus stehen — er kann weiterzeichnen
      // oder ausdrücklich abbrechen.
      const ok = await confirm({
        title: 'Grenze entfernen?',
        description:
          'Die Reviergrenze wird gelöscht. Die Fläche des Reviers ist danach unbekannt, ' +
          'bis eine neue Grenze gezeichnet wird.',
        confirmLabel: 'Entfernen',
        cancelLabel: 'Behalten',
        confirmVariant: 'danger',
      })
      if (!ok) return

      const supabase = createClient()
      // NUR boundary. `area_ha` ist
      // GENERATED ALWAYS AS (st_area(boundary::geography) / 10000) und fällt von
      // selbst auf NULL, wenn die Grenze weg ist. Ein Schreibversuch darauf
      // scheitert immer mit `column "area_ha" can only be updated to DEFAULT` —
      // und weil hier nur geloggt wird, schlug „Grenze entfernen" jahrelang
      // still fehl (Backlog E-R6, gefunden 27.07.2026).
      //
      // `.select('id')` seit 29.07.2026 (E-R1): ohne es meldete PostgREST bei
      // einem RLS-gefilterten Write `{ data: null, error: null }`, die App
      // leerte die Anzeige und sagte „Grenze entfernt" — während die DB die
      // Grenze behielt. Beim nächsten Laden war sie wieder da. Das sieht aus
      // wie ein Gespenst, nicht wie ein Fehler, und niemand meldet es brauchbar.
      const problem = writeProblem(
        await supabase
          .from('districts')
          .update({ boundary: null })
          .eq('id', district.id)
          .select('id'),
      )
      if (problem) {
        console.error('Boundary-Löschen fehlgeschlagen:', problem)
        showToast('Grenze konnte nicht entfernt werden.')
        // Editiermodus bleibt stehen (E-R2): ein gescheiterter Write darf den
        // Zustand nicht mitnehmen, sonst steht der Nutzer nach einer
        // Fehlermeldung vor einer Karte, die nichts mehr anbietet.
        return
      }
      setBoundaryRaw(null)
      setAreaHa(null)
      showToast('Grenze entfernt')
      bEditor.stopEditing()
      bEditor.reset()
      return
    }
    // Weniger als 3 Punkte → ignorieren, Edit-Mode beenden
    if (points.length < 3) {
      bEditor.stopEditing()
      bEditor.reset()
      return
    }
    // Polygon schliessen und als EWKT speichern
    const closed = [...points, points[0]]
    const wkt = closed.map(p => `${p.lng} ${p.lat}`).join(', ')
    const ewkt = `SRID=4326;POLYGON((${wkt}))`

    const supabase = createClient()
    const problem = writeProblem(
      await supabase
        .from('districts')
        .update({ boundary: ewkt })
        .eq('id', district.id)
        .select('id'),
    )

    if (problem) {
      // Zwei Fehler kamen hier zusammen (Backlog E-R1 und E-R2): der Toast
      // meldete „Grenze gespeichert", obwohl RLS den Write weggefiltert hatte —
      // und weil `stopEditing()` und `reset()` unbedingt darunter liefen, war
      // die gerade gezeichnete Grenze im selben Moment weg. Der Nutzer hatte
      // eine Erfolgsmeldung und nichts in der Hand.
      //
      // Jetzt bleibt der Entwurf stehen: derselbe Ausgang wie im Portal, wo ein
      // gescheitertes Speichern die Punkte ebenfalls nicht mitnimmt.
      console.error('Boundary-Update fehlgeschlagen:', problem)
      showToast('Grenze konnte nicht gespeichert werden.')
      return
    }

    // Boundary aus DB neu laden (damit Hex-Encoding korrekt ist)
    const { data } = await supabase
      .from('districts')
      .select('boundary, area_ha')
      .eq('id', district.id)
      .single()
    if (data) {
      setBoundaryRaw(data.boundary)
      setAreaHa(data.area_ha)
    }
    showToast('Grenze gespeichert')
    bEditor.stopEditing()
    bEditor.reset()
  }, [bEditor, district.id, showToast, confirm])

  const handleBoundaryCancel = useCallback(() => {
    bEditor.stopEditing()
    bEditor.reset()
  }, [bEditor])

  // --- State-Übergänge ---

  const goIdle = useCallback(() => {
    setCreation({ stage: 'idle' })
    setDraftMetadata({ name: '', description: '' })
  }, [])

  const handleCategorySelect = useCallback((category: 'stand' | 'sonstiges') => {
    setCreation({ stage: 'type-sheet', category })
  }, [])

  const handleTypeSelect = useCallback((opt: { type: ObjektType; defaultName: string; defaultDescription?: string }) => {
    // Metadaten-Entwurf mit Defaults füllen
    setDraftMetadata({
      name: opt.defaultName,
      description: opt.defaultDescription || '',
    })
    // Koordinaten-Eingabe für jeden neuen Flow zurücksetzen
    setCoordOpen(false)
    setCoordLat('')
    setCoordLng('')
    setCoordError(null)
    setCreation({
      stage: 'awaiting-tap',
      type: opt.type,
      defaultName: opt.defaultName,
      defaultDescription: opt.defaultDescription || '',
    })
  }, [])

  const handleMapClick = useCallback((latlng: [number, number]) => {
    setCreation(prev => {
      if (prev.stage === 'awaiting-tap') {
        return { ...prev, stage: 'positioning', position: latlng }
      }
      if (prev.stage === 'positioning') {
        return { ...prev, position: latlng }
      }
      if (prev.stage === 'metadata') {
        // Zurück zu positioning mit aktualisierter Position
        return { ...prev, stage: 'positioning', position: latlng }
      }
      return prev
    })
  }, [])

  // GPS-Einzelmessung → speist Position wie ein Karten-Tap in die State-Machine
  const handleUseGps = useCallback(async () => {
    if (gpsLoading) return
    setGpsLoading(true)
    try {
      // Großzügig für dichten Bestand; best-on-timeout greift ohnehin
      const fix = await waitForAccurateGpsFix(12_000, 20)
      // Wie ein Tap: awaiting-tap → positioning, Korrektur per Tap bleibt möglich
      handleMapClick([fix.lat, fix.lng])
      // Karte zum GPS-Punkt schwenken, sonst sieht der User den Pin nicht
      setCenterTarget({ lat: fix.lat, lng: fix.lng, nonce: Date.now() })
    } catch {
      showToast('Standort nicht verfügbar. Tippe stattdessen auf die Karte.')
    } finally {
      setGpsLoading(false)
    }
  }, [gpsLoading, handleMapClick, showToast])

  // Feld-Änderung mit Smart-Paste: kompletter String in EIN Feld → auf beide verteilen
  const handleCoordChange = useCallback((raw: string, field: 'lat' | 'lng') => {
    setCoordError(null)
    const parsed = parseCoordPaste(raw)
    if (parsed) {
      // Reihenfolge fix: Wert 1 = Breitengrad (lat), Wert 2 = Längengrad (lng)
      setCoordLat(parsed.lat)
      setCoordLng(parsed.lng)
      return
    }
    // Einzelner/teilweiser Wert → nur das getippte Feld setzen, anderes unangetastet
    if (field === 'lat') setCoordLat(raw)
    else setCoordLng(raw)
  }, [])

  // Eingegebene Koordinate (zwei Felder) → wie ein Karten-Tap
  const handleCoordSubmit = useCallback(() => {
    const latStr = coordLat.trim()
    const lngStr = coordLng.trim()
    const lat = Number(latStr)
    const lng = Number(lngStr)
    if (
      latStr === '' || lngStr === '' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) {
      setCoordError('Ungültige Koordinaten')
      return
    }
    // Reihenfolge: [lat, lng]; EWKT (POINT(lng lat)) baut der bestehende Insert
    handleMapClick([lat, lng])
    setCenterTarget({ lat, lng, nonce: Date.now() })
    setCoordOpen(false)
    setCoordLat('')
    setCoordLng('')
    setCoordError(null)
  }, [coordLat, coordLng, handleMapClick])

  // Objekte neu laden
  const refreshObjects = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('map_objects')
      .select('id, district_id, type, name, position, description, photo_url, created_by, created_at')
      .eq('district_id', district.id)
    if (data) setObjects(data as MapObject[])
    return data as MapObject[] | null
  }, [district.id])

  const handlePositionConfirm = useCallback(async () => {
    if (creation.stage !== 'positioning') return

    // Position-Verschieben-Flow: direkt UPDATE, kein metadata-Stage
    if (creation.existingId) {
      const supabase = createClient()
      const ewkt = `SRID=4326;POINT(${creation.position[1]} ${creation.position[0]})`
      // `.select('id')` und die 0-Zeilen-Prüfung seit 29.07.2026 (E-R1). Vorher
      // meldete ein RLS-gefilterter Write keinen Fehler: der Toast sagte
      // „Position aktualisiert ✓", der Stand blieb, wo er war.
      const problem = writeProblem(
        await supabase
          .from('map_objects')
          .update({ position: ewkt })
          .eq('id', creation.existingId)
          .select('id'),
      )

      if (problem) {
        // Vorher stand hier nur `console.error` — der Nutzer bekam gar nichts
        // zu sehen und hielt das stumme Zurückspringen für ein Versehen.
        console.error('Position-Update fehlgeschlagen:', problem)
        showToast('Position konnte nicht gespeichert werden.')
        return
      }
      // Objekte neu laden und zurück zu detail mit aktualisiertem Objekt
      const fresh = await refreshObjects()
      const updated = fresh?.find(o => o.id === creation.existingId)
      if (updated) {
        setCreation({ stage: 'detail', object: updated })
      } else {
        setCreation({ stage: 'idle' })
      }
      showToast('Position aktualisiert ✓')
      return
    }

    // Normaler Neu-Anlegen-Flow: weiter zu metadata
    setCreation(prev => {
      if (prev.stage === 'positioning') {
        return { ...prev, stage: 'metadata' }
      }
      return prev
    })
  }, [creation, refreshObjects, showToast])

  // Verwerfen im positioning-Stage: zurück zu detail wenn existingId, sonst idle
  const handlePositionDiscard = useCallback(() => {
    if (creation.stage === 'positioning' && creation.existingId) {
      // Zurück zu detail mit Original-Objekt aus der objects-Liste
      const original = objects.find(o => o.id === creation.existingId)
      if (original) {
        setCreation({ stage: 'detail', object: original })
        return
      }
    }
    goIdle()
  }, [creation, objects, goIdle])

  const handleBackToPositioning = useCallback(() => {
    setCreation(prev => {
      if (prev.stage === 'metadata') {
        return { ...prev, stage: 'positioning' }
      }
      return prev
    })
  }, [])

  // Objekte neu laden nach Speichern (Neues Objekt)
  const handleSaved = useCallback(async () => {
    await refreshObjects()
    setCreation({ stage: 'idle' })
    setDraftMetadata({ name: '', description: '' })
    showToast('Gespeichert ✓')
  }, [refreshObjects, showToast])

  // --- Detail-Sheet Handlers ---

  const handleObjectClick = useCallback((obj: MapObject) => {
    setCreation({ stage: 'detail', object: obj })
  }, [])

  const handleDetailClose = useCallback(() => {
    setCreation({ stage: 'idle' })
  }, [])

  const handleDetailUpdate = useCallback(async (changes: Partial<MapObject>) => {
    if (creation.stage !== 'detail') return
    const supabase = createClient()
    // `.select('id')` und die 0-Zeilen-Prüfung seit 29.07.2026 (E-R1). Dieser
    // Pfad ist der heimtückischste der vier: er aktualisiert den lokalen State
    // optimistisch, also sah der Nutzer seinen neuen Namen sofort im Sheet —
    // auch wenn RLS den Write verworfen hatte. Erst der nächste Reload holte
    // den alten Namen zurück.
    const problem = writeProblem(
      await supabase
        .from('map_objects')
        .update(changes)
        .eq('id', creation.object.id)
        .select('id'),
    )

    if (problem) {
      console.error('Update fehlgeschlagen:', problem)
      showToast('Änderung konnte nicht gespeichert werden.')
      return
    }
    // Lokalen State optimistisch aktualisieren
    const updated = { ...creation.object, ...changes }
    setObjects(prev => prev.map(o => o.id === updated.id ? updated : o))
    setCreation({ stage: 'detail', object: updated })
  }, [creation, showToast])

  /**
   * Läuft für dieses Kartenobjekt gerade ein Schreibvorgang?
   *
   * **Als Ref und nicht als State**, und das ist der tragende Teil: `useState`
   * wirkt erst zum nächsten Render, zwei schnelle Tipps kämen also beide durch
   * und schrieben zwei Zeilen in ein Log ohne DELETE-Policy (S5).
   *
   * **Je Objekt-ID, obwohl heute ein einzelnes Flag genügte** — und das ist
   * nachgesehen, nicht angenommen: `onObjectClick` ist `undefined`, solange
   * `creation.stage === 'detail'` gilt (s. die RevierMap-Prop weiter unten).
   * Ein direkter Wechsel von Stand A zu Stand B ist damit gar nicht möglich;
   * das Sheet geht immer erst zu, und dabei baut React es ab.
   *
   * ⚠ **Ein früherer Kommentar an dieser Stelle behauptete das Gegenteil**
   * („React hält über den Objektwechsel hinweg dieselbe Instanz, ein Riegel im
   * Sheet bliebe für Stand B gesetzt"). Die React-Mechanik stimmt, die Lage
   * nicht — die Karte lässt den Wechsel nicht zu. Der Riegel wäre im Sheet
   * also ebenso richtig gewesen.
   *
   * **Warum er trotzdem hier bleibt:** der Riegel gehört dorthin, wo der Write
   * steht, und der steht hier. Ein Ref im Sheet stürbe mit dem Sheet — auch mit
   * dem `key` unten —, und ein Schreibvorgang, der das Sheet überlebt, wäre
   * dann ungeschützt.
   */
  const pruefLaeuft = useRef<Set<string>>(new Set())

  /**
   * Eine Standprüfung eintragen (Konzept Standzustand §4.4).
   *
   * **Keine Migration nötig, und das ist der ganze Grund, warum es dieses
   * Stück gibt:** `map_object_checks_insert` (Migration 066) verlangt
   * `checked_by = auth.uid()` und ein sichtbares Kartenobjekt — beides ist hier
   * gegeben. Der Weg stand offen, es hatte ihn nur niemand gebaut.
   *
   * **`checked_at` wird NICHT mitgeschickt.** Der Default `now()` der Tabelle
   * ist hier richtig, und das ist der Unterschied zum Portal, wo ein Datumsfeld
   * steht: dort trägt jemand abends am PC nach, was er tagsüber gesehen hat,
   * hier steht er davor. Ein Datumsfeld im Wald wäre eine Frage, deren Antwort
   * immer „jetzt" lautet.
   *
   * **Die Notiz ist bei Mangel und Sperre Pflicht** (Moritz, 25.08.2026 —
   * damit folgt die PWA dem Portal, nicht der Feld-App, die eine leere Eingabe
   * als `null` durchlässt). Das Argument steht wörtlich im nativen Code:
   * *„Ein Mangel ohne Beschreibung ist genau die Zeile, die später niemand
   * deuten kann („irgendwas war an Stand 14")."* Die Feld-App schreibt den Satz
   * hin und erzwingt ihn nicht; dann ist sie die Stelle, die nachzieht.
   * **Der Riegel steht hier und nicht nur im Sheet** — ein Gate, das allein in
   * der Anzeige sitzt, ist keines (S2). Seit dem 26.08.2026 steht er sogar eine
   * Ebene tiefer, in `schreibePruefung()`: dort erbt ihn auch die Jagdkarte,
   * ohne ihn zu kennen.
   *
   * **Der Schreibweg selbst liegt seit dem 26.08.2026 in
   * `src/lib/revier/pruefstand.ts`** und wird mit dem Stand-Detail-Sheet der
   * Jagdkarte geteilt. Was hier bleibt, ist die Folge FÜR DIESE SEITE: der
   * Doppelklick-Riegel, der Zustand der Zeilen und der Bezugszeitpunkt. Die
   * vier teuer erkauften Details des Schreibens — `.select()`, der Riegel gegen
   * eine Zeile ohne Zeitstempel, das Nachlesen der View und das `catch` darum —
   * stehen dort und sind damit nicht mehr an diesen einen Aufrufer gebunden.
   *
   * Gibt `true` zurück, wenn die Zeile wirklich liegt.
   */
  const handleCheck = useCallback(
    async (objektId: string, status: PruefStatus, note: string | null): Promise<boolean> => {
      if (pruefLaeuft.current.has(objektId)) return false
      pruefLaeuft.current.add(objektId)
      try {
        const ergebnis = await schreibePruefung(objektId, userId, status, note)
        if (!ergebnis.ok) {
          showToast(
            ergebnis.grund === 'notiz-fehlt'
              ? 'Bitte kurz beschreiben, was los ist.'
              : 'Prüfung konnte nicht gespeichert werden.',
          )
          return false
        }

        setPruefZeilen((vorher) => [
          ...vorher.filter((z) => z.map_object_id !== objektId),
          ergebnis.zeile,
        ])
        // s. `pruefUnsicher` oben — das Nachlesen ist nicht durchgekommen.
        if (ergebnis.standUnsicher) {
          setPruefUnsicher((vorher) => new Set(vorher).add(objektId))
        }
        // Der Bezugszeitpunkt rückt vor, sonst liest der Zukunfts-Riegel den
        // eigenen Eintrag als noch nicht geschehen (s. `setJetzt` oben).
        // **`geschriebenAm` und nicht die Zeile:** gewinnt beim Nachlesen ein
        // fremder, noch jüngerer Eintrag, ist der eigene trotzdem der Beleg
        // dafür, dass die Uhr mindestens bis hierher gelaufen ist.
        const geschrieben = new Date(ergebnis.geschriebenAm)
        setJetzt((bisher) => (geschrieben > bisher ? geschrieben : bisher))

        showToast(status === 'gesperrt' ? 'Gesperrt ✓' : 'Eingetragen ✓')
        return true
      } finally {
        pruefLaeuft.current.delete(objektId)
      }
    },
    [userId, showToast],
  )

  const handleDetailPositionChange = useCallback(() => {
    if (creation.stage !== 'detail') return
    const obj = creation.object
    const pos = parseObjectPosition(obj.position)
    if (!pos) return
    setCreation({
      stage: 'positioning',
      type: obj.type,
      position: pos,
      defaultName: obj.name,
      defaultDescription: obj.description || '',
      existingId: obj.id,
    })
  }, [creation])

  const handleDetailDelete = useCallback(async () => {
    if (creation.stage !== 'detail') return
    const supabase = createClient()
    // Papierkorb statt hartem DELETE (Migrationen 072–074). Die Zeile bleibt
    // liegen und ist über den Papierkorb des Reviers wiederherstellbar; vor
    // allem überleben die Kontrollhistorie und die Fotos des Objekts, die ein
    // hartes DELETE per CASCADE mitgenommen hätte.
    //
    // Die frühere 0-Zeilen-Prüfung entfällt, und zwar ersatzlos: eine RPC wirft
    // bei fehlender Berechtigung einen Fehler, statt wie ein RLS-gefiltertes
    // DELETE still { data: null, error: null } zu liefern. Genau der stille
    // Erfolg war der Grund für das damalige `.select()`.
    const { error } = await supabase.rpc('kartenobjekt_loeschen', {
      p_id: creation.object.id,
      p_district_id: district.id,
    })

    if (error) {
      console.error('Löschen fehlgeschlagen:', error.message)
      showToast('Objekt konnte nicht gelöscht werden.')
      return
    }
    setObjects(prev => prev.filter(o => o.id !== creation.object.id))
    setCreation({ stage: 'idle' })
    showToast('Gelöscht ✓')
  }, [creation, district.id, showToast])

  // --- Abgeleitete Werte ---

  /** Die Prüfung des Objekts, dessen Sheet gerade offen ist. */
  const offenePruefung =
    creation.stage === 'detail' ? (pruefungen.get(creation.object.id) ?? null) : null

  const isInteractive = creation.stage === 'awaiting-tap'
    || creation.stage === 'positioning'
    || creation.stage === 'metadata'

  const previewPin = (creation.stage === 'positioning' || creation.stage === 'metadata')
    ? {
        type: creation.type,
        position: creation.position,
        confirmed: creation.stage === 'metadata',
      }
    : null

  // ID des Objekts das während Position-Verschieben ausgeblendet wird
  const hiddenObjectId = (creation.stage === 'positioning' && creation.existingId)
    ? creation.existingId
    : null

  // Pille nur im awaiting-tap Stage (positioning hat die ConfirmBar unten)
  const pillText = creation.stage === 'awaiting-tap'
    ? `Tippe auf die Karte um ${TYPE_LABELS[creation.type]} zu setzen`
    : null

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          zIndex: 1000,
          minHeight: '3.5rem',
          paddingTop: 'var(--safe-top)',
        }}
      >
        <button
          onClick={() => router.push('/app/du')}
          className="flex items-center justify-center rounded-lg"
          style={{
            color: 'var(--text-2)',
            background: 'var(--surface-2)',
            minWidth: '2.75rem',
            minHeight: '2.75rem',
            fontSize: '1.125rem',
          }}
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{district.name}</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {objects.length} {objects.length === 1 ? 'Objekt' : 'Objekte'}
            {areaHa ? ` · ${Math.round(areaHa)} ha` : ''}
          </p>
          {/* Die Zusammenfassung aus Konzept §3 — dieselbe in allen drei
              Clients. Eigene Zeile und nicht an die obige angehängt: die
              beantwortet „was liegt in diesem Revier", diese „was ist zu tun".
              Zwei Fragen, und auf einem Telefon passen sie nicht nebeneinander.

              Nur wenn es wartbare Objekte GIBT. Ein Revier aus lauter
              Parkplätzen bekommt keine Zeile „0 Sitze" — das wäre eine
              Auskunft über eine Frage, die dort niemand stellt. */}
          {zustandsBilanz && zustandsBilanz.sitze > 0 && (
            <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
              {zustandsBilanz.sitze} Sitze · {zustandsBilanz.offen} offen
              {zustandsBilanz.mangel > 0 ? ` · ${zustandsBilanz.mangel} Mangel` : ''}
              {zustandsBilanz.gesperrt > 0 ? ` · ${zustandsBilanz.gesperrt} gesperrt` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Karte */}
      <div className="flex-1 relative" style={{ zIndex: 1 }}>
        <RevierMap
          center={center}
          zoom={14}
          objects={objects}
          boundary={boundary}
          onMapClick={isInteractive && !bEditor.editMode ? handleMapClick : undefined}
          onObjectClick={creation.stage === 'idle' && !bEditor.editMode ? handleObjectClick : undefined}
          previewPin={previewPin}
          hiddenObjectId={hiddenObjectId}
          centerOn={centerTarget}
          isOwner={isOwner}
          boundaryEdit={{
            editMode: bEditor.editMode,
            drawPoints: bEditor.drawPoints,
            onStart: handleBoundaryStart,
            onFinish: handleBoundaryFinish,
            onCancel: handleBoundaryCancel,
            onDrawClick: bEditor.addPoint,
            onVertexDrag: bEditor.dragVertex,
            onVertexDelete: bEditor.deleteVertex,
            onMidpointInsert: bEditor.insertMidpoint,
            onUndo: bEditor.undo,
            onClearAll: bEditor.clearAll,
          }}
        />

        {/* Info-Pille (nur awaiting-tap) */}
        {pillText && (
          <div style={{
            position: 'absolute',
            top: '0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            borderRadius: '2rem',
            padding: '0.5rem 1rem',
            fontSize: '0.8125rem',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}>
            <span>{pillText}</span>
            <button
              onClick={goIdle}
              style={{
                background: 'var(--surface-3)',
                border: 'none',
                borderRadius: '1rem',
                padding: '0.25rem 0.625rem',
                fontSize: '0.75rem',
                color: 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* GPS-Standort-Button (nur awaiting-tap, sekundär zum Karten-Tap) */}
        {creation.stage === 'awaiting-tap' && (
          <button
            onClick={handleUseGps}
            disabled={gpsLoading}
            style={{
              position: 'absolute',
              top: '3.5rem',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1050,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '2rem',
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--text)',
              cursor: gpsLoading ? 'default' : 'pointer',
              opacity: gpsLoading ? 0.7 : 1,
              minHeight: '2.75rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            {gpsLoading ? (
              <>
                <CircleNotch size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Standort wird ermittelt …
              </>
            ) : (
              <>
                <Crosshair size={16} weight="bold" />
                Aktueller Standort
              </>
            )}
          </button>
        )}

        {/* Koordinaten-Eingabe (dezente dritte Option, nur awaiting-tap) */}
        {creation.stage === 'awaiting-tap' && (
          <div style={{
            position: 'absolute',
            top: '6.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1050,
            width: coordOpen ? 'min(20rem, calc(100vw - 1.5rem))' : 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}>
            {!coordOpen ? (
              <button
                onClick={() => setCoordOpen(true)}
                style={{
                  background: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(8px)',
                  border: 'none',
                  borderRadius: '1.5rem',
                  padding: '0.375rem 0.875rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Koordinaten eingeben
              </button>
            ) : (
              <div style={{
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '0.75rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {/* Breitengrad (Latitude) */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                      Breitengrad
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={coordLat}
                      onChange={e => handleCoordChange(e.target.value, 'lat')}
                      onKeyDown={e => { if (e.key === 'Enter') handleCoordSubmit() }}
                      placeholder="53.1234"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.5rem',
                        background: 'var(--bg)',
                        border: `1px solid ${coordError ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: '0.625rem',
                        color: 'var(--text)',
                        fontSize: '0.9375rem',
                      }}
                    />
                  </div>
                  {/* Längengrad (Longitude) */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.25rem' }}>
                      Längengrad
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={coordLng}
                      onChange={e => handleCoordChange(e.target.value, 'lng')}
                      onKeyDown={e => { if (e.key === 'Enter') handleCoordSubmit() }}
                      placeholder="10.5678"
                      style={{
                        width: '100%',
                        padding: '0.625rem 0.5rem',
                        background: 'var(--bg)',
                        border: `1px solid ${coordError ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: '0.625rem',
                        color: 'var(--text)',
                        fontSize: '0.9375rem',
                      }}
                    />
                  </div>
                </div>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', margin: '0.375rem 0 0' }}>
                  Aus Google Maps kopieren — ganzer String in ein Feld genügt
                </p>
                {coordError && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--red)', margin: '0.375rem 0 0' }}>
                    {coordError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                  <button
                    onClick={() => {
                      setCoordOpen(false)
                      setCoordLat('')
                      setCoordLng('')
                      setCoordError(null)
                    }}
                    style={{
                      flex: 1,
                      padding: '0.625rem',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: 'var(--text-2)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: '2.75rem',
                    }}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleCoordSubmit}
                    disabled={!coordLat.trim() && !coordLng.trim()}
                    style={{
                      flex: 1,
                      padding: '0.625rem',
                      background: (coordLat.trim() || coordLng.trim()) ? 'var(--green)' : 'var(--green-dim)',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      color: 'white',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      cursor: (coordLat.trim() || coordLng.trim()) ? 'pointer' : 'default',
                      opacity: (coordLat.trim() || coordLng.trim()) ? 1 : 0.5,
                      minHeight: '2.75rem',
                    }}
                  >
                    Setzen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAB (nicht im Boundary-Edit-Mode) */}
        {creation.stage === 'idle' && !bEditor.editMode && (
          <button
            onClick={() => setCreation({ stage: 'category-sheet' })}
            style={{
              position: 'absolute',
              bottom: 'calc(var(--bottom-bar-space, 3.5rem) + 1rem)',
              right: '0.75rem',
              zIndex: 1050,
              width: '3.5rem',
              height: '3.5rem',
              borderRadius: '50%',
              background: 'var(--accent-primary)',
              border: 'none',
              boxShadow: '0 0.25rem 0.5rem rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              color: 'white',
              cursor: 'pointer',
            }}
            title="Neues Objekt setzen"
          >
            +
          </button>
        )}

        {/* Sheets */}
        {creation.stage === 'category-sheet' && (
          <CategorySheet
            onSelect={handleCategorySelect}
            onCancel={goIdle}
          />
        )}

        {creation.stage === 'type-sheet' && (
          <TypeSheet
            category={creation.category}
            onSelect={handleTypeSelect}
            onBack={() => setCreation({ stage: 'category-sheet' })}
            onCancel={goIdle}
          />
        )}

        {creation.stage === 'metadata' && (
          <ObjektEditSheet
            type={creation.type}
            position={creation.position}
            districtId={district.id}
            userId={userId}
            name={draftMetadata.name}
            description={draftMetadata.description}
            onNameChange={name => setDraftMetadata(prev => ({ ...prev, name }))}
            onDescriptionChange={description => setDraftMetadata(prev => ({ ...prev, description }))}
            onSaved={handleSaved}
            onBack={handleBackToPositioning}
            onDiscard={goIdle}
          />
        )}

        {creation.stage === 'detail' && (
          <ObjektDetailSheet
            /**
             * **Der `key` ist der Riegel gegen zwei Findings der Fremdprüfung**
             * (25.08.2026, B6 und B9, beide `[high]`). Ohne ihn hält React über
             * einen Wechsel des Objekts hinweg dieselbe Instanz: die halb
             * getippte Mangel-Notiz von Stand A stünde im Formular für Stand B
             * und landete beim Bestätigen in dessen Append-only-Log, und die
             * Fotoliste von A bliebe sichtbar und LÖSCHBAR, während B lädt.
             *
             * **Beides ist heute nicht erreichbar, und das ist nachgesehen:**
             * alle vier Stellen, die `stage: 'detail'` setzen, tragen dieselbe
             * `object.id`, und `onObjectClick` unten ist `undefined`, solange
             * ein Sheet offen ist — zwischen zwei Ständen liegt immer ein
             * Abbau. Der Prüfer sah nur das Sheet; das Tor steht hier.
             *
             * **Trotzdem gesetzt, und zwar genau deshalb:** die Unerreichbarkeit
             * hängt an einer Bedingung in einer anderen Datei. „Zum nächsten
             * Stand tippen, ohne zuzumachen" ist ein plausibler Wunsch, und wer
             * ihn erfüllt, hätte keinen Anlass, hier nachzusehen. Eine Zeile
             * macht die ganze Klasse unmöglich statt bloß unwahrscheinlich —
             * bei einem Log ohne DELETE-Policy ist das der billigere Tausch.
             */
            key={creation.object.id}
            object={creation.object}
            userId={userId}
            onClose={handleDetailClose}
            onPositionChange={handleDetailPositionChange}
            onDelete={handleDetailDelete}
            onUpdate={handleDetailUpdate}
            pruefung={offenePruefung}
            pruefFehler={pruefFehler || pruefUnsicher.has(creation.object.id)}
            // `null` heißt „unbekannt", nicht „niemand": ein Prüfer, dessen
            // Konto gelöscht wurde, steht nicht mehr in `konto_namen()` — die
            // Prüfung hat trotzdem stattgefunden.
            prueferName={prueferNamen[offenePruefung?.checkedBy ?? ''] ?? null}
            /* Ob dieser Objekttyp überhaupt einen Wartungszustand hat — der
               Schnitt auf sieben Arten aus Konzept §4.1.2. Ein Steinbruch hat
               keinen. */
            wartbar={istWartbar(creation.object.type)}
            onCheck={(status, note) => handleCheck(creation.object.id, status, note)}
          />
        )}
      </div>

      {/* Position-Bestätigungs-Bar (nur positioning-Stage) */}
      {creation.stage === 'positioning' && (
        <PositionConfirmBar
          onConfirm={handlePositionConfirm}
          onDiscard={handlePositionDiscard}
          confirmLabel={creation.existingId ? '✓ Neue Position bestätigen' : undefined}
          discardLabel={creation.existingId ? '← Zurück' : undefined}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '6rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
          padding: '0.625rem 1.25rem',
          borderRadius: 'var(--radius)',
          fontSize: '0.875rem',
          fontWeight: 600,
          zIndex: 2000,
          border: '1px solid var(--border)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
