'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Plus, CircleNotch as Loader2 } from '@phosphor-icons/react'
import type { MapObject, ObjektType, MapObjectPhoto } from '@/lib/types/revier'
import PhotoCapture from '@/components/photo/PhotoCapture'
import PhotoThumbnail from '@/components/photo/PhotoThumbnail'
import StorageImg from '@/components/photo/StorageImg'
import { uploadPhoto } from '@/lib/photos/upload'
import { deletePhoto } from '@/lib/photos/delete'
import { listMapObjectPhotos } from '@/lib/photos/list'
import { createClient } from '@/lib/supabase/client'
import { useConfirmSheet } from '@/components/ui/ConfirmSheet'
import { zustandsSatz, type Pruefung, type PruefStatus } from '@/lib/revier/wartung'

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
  sonstiges: 'Sonstiges',
}

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
 * ⚠ **Diese Datei wird heute nur vom Revierbesitzer erreicht**, weil
 * `app/app/du/revier/[id]/page.tsx` jeden anderen umleitet und die Revierliste
 * unter „Du" nach `owner_id` filtert. Der Scheininhaber aus §2.2 kommt hier
 * NICHT an — er sieht Kartenobjekte allein über die Jagdkarte
 * (`src/components/hunt/MapObjectSheet.tsx`), und die hat das Konzept
 * ausdrücklich aus dem Umfang genommen. Gemessen am 25.08.2026 im Recon;
 * die Begründung in §2.2 trifft also einen Weg, den der Umfang nicht baut.
 * **Was hier trotzdem entsteht, hat einen eigenen Nutzer:** der Revierbesitzer
 * ohne iPhone, also jeder Teilnehmer des Testlaufs.
 *
 * **Anti-Kitsch, und hier kostet es etwas:** der Zustand ist Typografie, keine
 * Ampel. Ein gesperrter Stand bekommt Gewicht über Wortwahl, nicht über eine
 * Alarmfarbe — dieselbe Entscheidung wie in der Feld-App.
 */
function StandZustand({
  pruefung,
  pruefFehler,
  prueferName,
  wartbar,
  onCheck,
}: {
  pruefung: Pruefung | null
  pruefFehler: boolean
  prueferName: string | null
  wartbar: boolean
  onCheck: (status: PruefStatus, note: string | null) => Promise<boolean>
}) {
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

  const zeit = pruefung ? zeitpunkt.format(new Date(pruefung.checkedAt)) : ''
  const wann = prueferName === null ? zeit : `${zeit} von ${prueferName}`

  /**
   * **Der Fehlerfall behauptet NICHTS über den Stand** — er sagt, dass wir es
   * nicht wissen. Die Knöpfe bleiben trotzdem bedienbar: wer davorsteht, kann
   * prüfen, auch wenn die Historie gerade nicht kommt. Sein Eintrag überholt
   * ohnehin alles Ältere.
   */
  const satz = pruefFehler ? 'Prüfstand nicht abrufbar' : zustandsSatz(pruefung, wann)

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
          fontWeight: pruefFehler ? 400 : 600,
          lineHeight: 1.4,
          color: pruefFehler ? 'var(--text-3)' : 'var(--text)',
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

type Props = {
  object: MapObject
  userId: string
  onClose: () => void
  onPositionChange: () => void
  onDelete: () => void
  onUpdate: (changes: Partial<MapObject>) => Promise<void>
  /** Die jüngste Prüfung dieses Objekts; `null` heißt „noch nie geprüft". */
  pruefung: Pruefung | null
  /**
   * Der Prüfstand konnte nicht geladen werden.
   *
   * **Getrennt von `pruefung === null`, und das ist der ganze Zweck der Prop.**
   * Fielen beide zusammen, stünde bei einem Netz- oder RLS-Fehler „Noch nie
   * geprüft" — auch an einem gesperrten Stand. Die Sperre wäre unsichtbar, und
   * zwar genau dann, wenn jemand einteilt. Dieselbe Unterscheidung macht die
   * Feld-App mit `CheckState.kind === 'error'`, und dort steht der Satz, der
   * sie begründet: *„Ein Fehler, der wie ein gültiger Zustand aussieht, ist
   * schlimmer als ein sichtbarer Fehler."*
   */
  pruefFehler: boolean
  /** Klarname des Prüfers; `null` heißt „nicht auflösbar", nicht „niemand". */
  prueferName: string | null
  /** Hat dieser Objekttyp überhaupt einen Wartungszustand (Konzept §4.1.2)? */
  wartbar: boolean
  /** Eine Prüfung eintragen. `true`, wenn die Zeile wirklich liegt. */
  onCheck: (status: PruefStatus, note: string | null) => Promise<boolean>
}

export default function ObjektDetailSheet({
  object,
  userId,
  onClose,
  onPositionChange,
  onDelete,
  onUpdate,
  pruefung,
  pruefFehler,
  prueferName,
  wartbar,
  onCheck,
}: Props) {
  const confirmSheet = useConfirmSheet()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(object.name)
  const [savingName, setSavingName] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const [showNotiz, setShowNotiz] = useState(!!object.description)
  const [editingNotiz, setEditingNotiz] = useState(false)
  const [notizValue, setNotizValue] = useState(object.description || '')
  const [savingNotiz, setSavingNotiz] = useState(false)
  const notizRef = useRef<HTMLTextAreaElement>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // --- Fotos ---
  const [photos, setPhotos] = useState<MapObjectPhoto[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)
  const fullscreenOpenRef = useRef(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setPhotosLoading(true)
    listMapObjectPhotos(object.id)
      .then((data) => {
        if (!cancelled) setPhotos(data)
      })
      .catch((err) => {
        if (!cancelled) setPhotoError(err.message)
      })
      .finally(() => {
        if (!cancelled) setPhotosLoading(false)
      })
    return () => { cancelled = true }
  }, [object.id])

  // --- Name inline-edit ---

  const startNameEdit = useCallback(() => {
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }, [])

  const saveName = useCallback(async () => {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed === object.name) {
      setNameValue(object.name)
      setEditingName(false)
      return
    }
    setSavingName(true)
    await onUpdate({ name: trimmed })
    setSavingName(false)
    setEditingName(false)
  }, [nameValue, object.name, onUpdate])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setNameValue(object.name)
      setEditingName(false)
    }
  }, [object.name])

  // --- Notiz inline-edit ---

  const startNotizEdit = useCallback(() => {
    setShowNotiz(true)
    setEditingNotiz(true)
    setTimeout(() => notizRef.current?.focus(), 50)
  }, [])

  const saveNotiz = useCallback(async () => {
    const trimmed = notizValue.trim()
    if (trimmed === (object.description || '')) {
      setEditingNotiz(false)
      if (!trimmed) setShowNotiz(false)
      return
    }
    setSavingNotiz(true)
    await onUpdate({ description: trimmed || null })
    setSavingNotiz(false)
    setEditingNotiz(false)
    if (!trimmed) setShowNotiz(false)
  }, [notizValue, object.description, onUpdate])

  const clearNotiz = useCallback(async () => {
    setSavingNotiz(true)
    await onUpdate({ description: null })
    setSavingNotiz(false)
    setNotizValue('')
    setEditingNotiz(false)
    setShowNotiz(false)
  }, [onUpdate])

  // --- Löschen ---

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    onDelete()
  }, [onDelete])

  // --- Fullscreen: History-Management (Back-Button schliesst Overlay) ---

  const openFullscreen = useCallback((url: string) => {
    setFullscreenPhoto(url)
    fullscreenOpenRef.current = true
    window.history.pushState({ fullscreenPhoto: true }, '')
  }, [])

  const closeFullscreen = useCallback(() => {
    if (fullscreenOpenRef.current) {
      fullscreenOpenRef.current = false
      window.history.back()
    }
    setFullscreenPhoto(null)
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      if (fullscreenOpenRef.current) {
        fullscreenOpenRef.current = false
        setFullscreenPhoto(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      // Cleanup: Falls Overlay noch offen ist wenn Sheet unmountet
      if (fullscreenOpenRef.current) {
        fullscreenOpenRef.current = false
        window.history.back()
      }
    }
  }, [])

  // --- Foto Upload ---

  async function handlePhotoCapture(file: File) {
    setUploading(true)
    setPhotoError(null)
    try {
      const { url, path } = await uploadPhoto({
        file,
        userId,
        entityType: 'map_object',
        entityId: object.id,
      })

      const supabase = createClient()
      const { data, error } = await supabase
        .from('map_object_photos')
        .insert({
          map_object_id: object.id,
          url,
          storage_path: path,
          uploaded_by: userId,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      setPhotos((prev) => [data as MapObjectPhoto, ...prev])
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  // --- Foto Delete ---

  async function handlePhotoDelete(photo: MapObjectPhoto) {
    const ok = await confirmSheet({
      title: 'Foto löschen?',
      description: 'Das Foto wird endgültig entfernt.',
      confirmLabel: 'Löschen',
      confirmVariant: 'danger',
    })
    if (!ok) return
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('map_object_photos')
        .delete()
        .eq('id', photo.id)

      if (error) throw new Error(error.message)

      await deletePhoto(photo.storage_path)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
      setPhotos((prev) => [photo, ...prev].sort(
        (a, b) => (a.created_at < b.created_at ? 1 : -1)
      ))
    }
  }

  const typeLabel = TYPE_LABELS[object.type] || object.type

  // --- Swipe-to-close ---
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipeStartY = useRef(0)
  const swipeStartTime = useRef(0)
  const swipeDeltaY = useRef(0)
  const isSwiping = useRef(false)

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY
    swipeStartTime.current = Date.now()
    swipeDeltaY.current = 0
    isSwiping.current = true
    const sheet = sheetRef.current
    if (sheet) sheet.style.transition = 'none'
  }, [])

  const handleSwipeMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping.current) return
    const delta = e.touches[0].clientY - swipeStartY.current
    // Nur nach unten ziehen erlauben
    swipeDeltaY.current = Math.max(0, delta)
    const sheet = sheetRef.current
    if (sheet) sheet.style.transform = `translateY(${swipeDeltaY.current}px)`
  }, [])

  const handleSwipeEnd = useCallback(() => {
    if (!isSwiping.current) return
    isSwiping.current = false
    const sheet = sheetRef.current
    if (!sheet) return

    const elapsed = Date.now() - swipeStartTime.current
    const velocity = swipeDeltaY.current / Math.max(elapsed, 1) // px/ms

    if (swipeDeltaY.current > 80 || velocity > 0.5) {
      // Raus-animieren und schliessen
      sheet.style.transition = 'transform 0.25s ease-out'
      sheet.style.transform = 'translateY(100%)'
      setTimeout(onClose, 250)
    } else {
      // Zurueck-snappen
      sheet.style.transition = 'transform 0.2s ease'
      sheet.style.transform = 'translateY(0)'
    }
  }, [onClose])

  return (
    <>
      <div className="map-object-sheet-overlay" onClick={onClose} />
      <div
        ref={sheetRef}
        className="map-object-sheet"
        style={{
          paddingBottom: '1rem',
          maxHeight: '70dvh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          style={{ width: '100%', padding: '0.75rem 0', cursor: 'grab', touchAction: 'none' }}
        >
          <div className="sheet-handle" />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '0.75rem 1rem 0' }}>
            {/* Name — Inline-Edit */}
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={handleNameKeyDown}
                  disabled={savingName}
                  style={{
                    flex: 1,
                    padding: '0.375rem 0.5rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--green)',
                    borderRadius: '0.5rem',
                    color: 'var(--text)',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                  }}
                />
                <span style={{ color: 'var(--green)', fontSize: '1.125rem' }}>✓</span>
              </div>
            ) : (
              <button
                onClick={startNameEdit}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0,
                  lineHeight: 1.3,
                }}>
                  {object.name}
                </h2>
              </button>
            )}

            {/* Typ-Label */}
            <p style={{
              fontSize: '0.8125rem',
              color: 'var(--text-3)',
              margin: '0.25rem 0 0',
            }}>
              {typeLabel}
            </p>
          </div>

          {/* Standzustand — direkt unter dem Namen, wie in der Feld-App. Er ist
              die Aussage, wegen der jemand den Stand antippt („kann ich da
              hoch?"); Notiz und Fotos kommen danach. */}
          <StandZustand
            pruefung={pruefung}
            pruefFehler={pruefFehler}
            prueferName={prueferName}
            wartbar={wartbar}
            onCheck={onCheck}
          />

          {/* Notiz-Bereich */}
          <div style={{ padding: '0.75rem 1rem 0' }}>
            {!showNotiz ? (
              <button
                onClick={startNotizEdit}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0.25rem 0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  color: 'var(--text-3)',
                  fontSize: '0.8125rem',
                }}
              >
                <span style={{ fontSize: '0.875rem' }}>+</span>
                Notiz hinzufügen
              </button>
            ) : editingNotiz ? (
              <div>
                <textarea
                  ref={notizRef}
                  value={notizValue}
                  onChange={e => setNotizValue(e.target.value)}
                  onBlur={saveNotiz}
                  disabled={savingNotiz}
                  placeholder="Notiz eingeben…"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    background: 'var(--bg)',
                    border: '1px solid var(--green)',
                    borderRadius: '0.625rem',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                    resize: 'none',
                  }}
                />
              </div>
            ) : (
              <div style={{
                position: 'relative',
                background: 'var(--surface-2)',
                borderRadius: '0.625rem',
                padding: '0.625rem 0.75rem',
              }}>
                <button
                  onClick={() => {
                    setEditingNotiz(true)
                    setTimeout(() => notizRef.current?.focus(), 50)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    color: 'var(--text-2)',
                    fontSize: '0.875rem',
                    lineHeight: 1.5,
                  }}
                >
                  {notizValue}
                </button>
                <button
                  onClick={clearNotiz}
                  disabled={savingNotiz}
                  style={{
                    position: 'absolute',
                    top: '0.375rem',
                    right: '0.375rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    fontSize: '0.75rem',
                    padding: '0.25rem',
                    lineHeight: 1,
                  }}
                  title="Notiz entfernen"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Foto-Section */}
          <div style={{ padding: '0.75rem 1rem' }}>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.5rem',
              }}
            >
              Fotos
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                overflowX: 'auto',
                paddingBottom: '0.25rem',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* Plus-Kachel */}
              <PhotoCapture
                quality="documentation"
                onCapture={handlePhotoCapture}
                disabled={uploading}
                onError={(e) => setPhotoError(e.message)}
              >
                <button
                  type="button"
                  aria-label="Foto hinzufügen"
                  style={{
                    flex: '0 0 auto',
                    width: '4.5rem',
                    height: '4.5rem',
                    border: '2px dashed var(--border)',
                    borderRadius: '0.5rem',
                    background: 'transparent',
                    color: 'var(--text-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: uploading ? 'wait' : 'pointer',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={24} />}
                </button>
              </PhotoCapture>

              {/* Loading-Placeholder */}
              {photosLoading && photos.length === 0 && (
                <div
                  style={{
                    flex: '0 0 auto',
                    width: '4.5rem',
                    height: '4.5rem',
                    borderRadius: '0.5rem',
                    background: 'var(--surface-2)',
                  }}
                />
              )}

              {/* Bestehende Fotos */}
              {photos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  url={photo.url}
                  size={4.5}
                  shape="square"
                  onTap={() => openFullscreen(photo.url)}
                  onDelete={() => handlePhotoDelete(photo)}
                />
              ))}
            </div>

            {photoError && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--red)' }}>
                {photoError}
              </div>
            )}
          </div>

          {/* Trennlinie */}
          <div style={{
            margin: '0 1rem',
            height: '1px',
            background: 'var(--border)',
          }} />

          {/* Aktions-Liste */}
          <div style={{ padding: '0 1rem' }}>
            <button
              onClick={onPositionChange}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 0.25rem',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                color: 'var(--text)',
                fontSize: '0.9375rem',
                minHeight: '2.75rem',
              }}
            >
              <span style={{ fontSize: '1.125rem' }}>📍</span>
              Position ändern
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 0.25rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--red)',
                fontSize: '0.9375rem',
                minHeight: '2.75rem',
              }}
            >
              <span style={{ fontSize: '1.125rem' }}>🗑</span>
              Löschen
            </button>
          </div>

          {/* Lösch-Bestätigung (Stufe 2) */}
          {confirmDelete && (
            <div style={{
              margin: '0.5rem 1rem 0',
              padding: '0.75rem',
              background: 'rgba(239, 83, 80, 0.1)',
              borderRadius: 'var(--radius)',
              border: '1px solid rgba(239, 83, 80, 0.25)',
            }}>
              <p style={{
                fontSize: '0.8125rem',
                color: 'var(--text-2)',
                margin: '0 0 0.625rem',
                lineHeight: 1.4,
              }}>
                Wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setConfirmDelete(false)}
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
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1,
                    padding: '0.625rem',
                    background: 'var(--red)',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    color: 'white',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    cursor: deleting ? 'default' : 'pointer',
                    opacity: deleting ? 0.6 : 1,
                    minHeight: '2.75rem',
                  }}
                >
                  {deleting ? 'Lösche…' : 'Endgültig löschen'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Foto-Overlay */}
      {fullscreenPhoto && (
        <div
          className="chat-fullscreen-overlay"
          onClick={closeFullscreen}
        >
          <StorageImg src={fullscreenPhoto} alt="" className="chat-fullscreen-img" />
          <button
            className="chat-fullscreen-close"
            onClick={closeFullscreen}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
