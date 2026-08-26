'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import type { KontoName } from '@/lib/konto-namen'
import { createClient } from '@/lib/supabase/client'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useHuntPositions } from '@/hooks/useHuntPositions'
import { updatePosition } from '@/lib/position-service'
import { parsePolygonHex, parsePointHex } from '@/lib/geo-utils'
import MapView from '@/components/hunt/MapView'
import ChatPanel from '@/components/hunt/ChatPanel'
import HuntStreckeTab from '@/components/hunt/HuntStreckeTab'
import { HuntActionsMenu } from '@/components/hunt/HuntActionsMenu'
import type { StandData } from '@/components/hunt/MapContent'
import { getAvatarColor } from '@/lib/avatar-color'
import { useConfirmSheet } from '@/components/ui/ConfirmSheet'
import { isHuntScheduled } from '@/lib/hunt/status'
import { showToast } from '@/lib/erlegung/toast'
import { MapTrifold, WarningCircle, ChatCircle, Star, Crosshair, UsersThree, Dog, Stop, CalendarBlank, Plus, Trash, MagnifyingGlass } from '@phosphor-icons/react'
import { WildIcon } from '@/components/icons/WildIcon'
import type { ComponentType, SVGProps } from 'react'

type TabIconComponent = ComponentType<{ size?: number; weight?: 'regular' | 'fill'; color?: string } & SVGProps<SVGSVGElement>>

// Strecke-Tab-Glyph auf das neue WildIcon-Set (rehwild — Reh steht
// stellvertretend fürs Wild). Reicht size durch; color:inherit lässt das Icon
// der Active/Inactive-Farbe des Tab-Buttons folgen (Inline-Style schlägt die
// globale :where(.wild-icon){color:bronze}-Regel).
function RehwildTabIcon({ size = 18 }: { size?: number }) {
  return <WildIcon type="rehwild" size={size} style={{ color: 'inherit' }} />
}

const VALID_TABS = ['karte', 'chat', 'nachsuche', 'strecke'] as const
type TabKey = typeof VALID_TABS[number]
const isValidTab = (v: string | null): v is TabKey =>
  v !== null && (VALID_TABS as readonly string[]).includes(v)

function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() }

// Sprint C: Plan-Datum lesbar. weekday+Datum, dann Uhrzeit.
function formatPlanDateTime(iso: string) {
  const d = new Date(iso)
  const datum = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${datum} · ${zeit} Uhr`
}

// Sprint C2: Freigabe-Toggle für Karte + Chat (optisch ein Paar). L5-Konvention:
// der Titel zeigt den ZUSTAND ("Karte offen"/"Chat geschlossen"), der Button die
// AKTION ("Schließen"/"Freischalten"). Geschlossen → grüner CTA zum Freischalten,
// offen → dezenter Outline-Button zum Schließen.
function FreigabeToggle({ noun, hint, open, busy, onToggle, Icon }: {
  noun: string
  hint: string
  open: boolean
  busy: boolean
  onToggle: () => void
  Icon: TabIconComponent
}) {
  return (
    <div className="rounded-2xl p-4 flex items-center justify-between gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-semibold text-sm">
          <Icon size={16} weight="fill" color={open ? 'var(--green)' : 'var(--text-3)'} />
          <span>{noun} {open ? 'offen' : 'geschlossen'}</span>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-3)' }}>{hint}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className="font-bold text-sm transition disabled:opacity-50"
        style={{
          flexShrink: 0, height: '2.5rem', padding: '0 1.25rem', borderRadius: 'var(--radius)',
          border: `1.5px solid ${open ? 'var(--border)' : 'var(--green)'}`,
          background: open ? 'transparent' : 'var(--green)',
          color: open ? 'var(--text-2)' : '#fff',
        }}
      >
        {open ? 'Schließen' : 'Freischalten'}
      </button>
    </div>
  )
}

type Hunt = { id: string; name: string; type: string; kind: 'group' | 'solo'; status: string; invite_code: string; wild_presets: string[]; started_at: string; scheduled_for: string | null; chat_open: boolean; map_open: boolean; signal_mode: string; district_id: string | null; creator_id: string; boundary: unknown | null }
type Participant = { id: string; user_id: string | null; guest_name: string | null; role: string; tags: string[]; status: string; stand_id: string | null; profiles: { display_name: string; anonymize_kills: boolean } | null }
type SeatAssignment = { id: string; user_id: string | null; seat_id: string | null; seat_type: string; seat_name: string | null; position_lat: number | null; position_lng: number | null; adhoc_subtype?: 'leiter' | 'hochsitz' | 'sitzstock' | null }

export default function HuntPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const confirmSheet = useConfirmSheet()
  const [hunt, setHunt] = useState<Hunt | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showJLBar, setShowJLBar] = useState(false)
  const initialTab = (searchParams.get('tab') as 'karte' | 'chat' | 'nachsuche' | 'strecke') || 'karte'
  const [activeTab, setActiveTab] = useState<'karte' | 'chat' | 'nachsuche' | 'strecke'>(initialTab)
  const [isJagdleiter, setIsJagdleiter] = useState(false)
  const [isGruppenleiter, setIsGruppenleiter] = useState(false)
  const [boundary, setBoundary] = useState<[number, number][][] | null>(null)
  const [districtName, setDistrictName] = useState<string | null>(null)
  const [stands, setStands] = useState<StandData[]>([])
  const [chatUnread, setChatUnread] = useState(0)
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>([])
  const [showEndHuntPrompt, setShowEndHuntPrompt] = useState(false)
  // Sprint C: scheduled-Detail (Plan/Karte/Chat-Subtabs + Einladungsverwaltung).
  // C2: Karte-Subtab kommt hinzu, wenn der Jagdleiter sie freigibt (map_open)
  // bzw. immer für den Ersteller selbst (Planungsarbeit vor Go-Live).
  const [scheduledTab, setScheduledTab] = useState<'plan' | 'karte' | 'chat'>('plan')
  const [inviteContacts, setInviteContacts] = useState<{ id: string; display_name: string }[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  /**
   * Der Riegel gegen den Doppelklick — **ein Ref, kein State** (Standard-Focus
   * S5). `inviteBusy` wird aus der Closure gelesen und ist erst nach dem
   * nächsten Render neu; zwei schnelle Klicks sähen beide `false`. Seit
   * `addInvite` erst LIEST und dann schreibt, ist das Fenster dafür breiter
   * als vorher. Der State bleibt als Anzeige an den Knöpfen.
   */
  const inviteLaeuft = useRef(false)
  const [chatOpenBusy, setChatOpenBusy] = useState(false)
  const [mapOpenBusy, setMapOpenBusy] = useState(false)
  // "Jetzt"-Snapshot für die Chat-Schreibsperre (Date.now() gehört nicht in den
  // Render — Purity). Auf Mount gesetzt; der ~1-Min-Edge bis zum Cron-Flip ist egal.
  const [nowMs, setNowMs] = useState(0)

  // GPS sofort starten (auch wenn anderer Tab aktiv)
  const geoState = useGeolocation()

  // Eigene participant_id bestimmen
  // Die eigene Teilnehmerzeile, nicht nur ihre id — der STATUS entscheidet, ob
  // wir überhaupt dabei sind. Vorher stand hier nur `?.id`, und damit zählte
  // auch eine Zeile mit status='left' als Teilnahme.
  // `userId &&` ist nicht kosmetisch: Gäste haben `user_id IS NULL`. Ohne die
  // Bedingung fände `find` bei unbekanntem `userId` (getUser() hat gehakt) die
  // erste GASTZEILE und hielte sie für die eigene — der Nutzer käme am Guard
  // vorbei und sendete seine Position unter der Teilnehmer-id des Gastes.
  // Ohne bekannten Nutzer gibt es keine eigene Zeile, Punkt.
  const myParticipation = useMemo(
    () => (userId ? participants.find(p => p.user_id === userId) ?? null : null),
    [participants, userId],
  )
  const myParticipantId = myParticipation?.id ?? null

  // Realtime-Positionen aller anderen Teilnehmer
  const otherPositions = useHuntPositions(hunt?.id ?? null, participants, userId)

  // Seat Assignments → Stände, Zuweisungen, freie Positionen ableiten
  const { allStands, allParticipantStands, freePositions, standAssignedNames } = useMemo(() => {
    const userToParticipant = new Map<string, string>()
    participants.forEach(p => { if (p.user_id) userToParticipant.set(p.user_id, p.id) })

    const pStands: Record<string, string> = {}
    const adhocList: StandData[] = []
    const freePos: { userId: string; position: { lat: number; lng: number }; userName: string; avatarColor: string }[] = []
    const assignedNames: Record<string, string> = {}

    for (const a of seatAssignments) {
      const p = a.user_id ? participants.find(pp => pp.user_id === a.user_id) : null
      const name = p?.profiles?.display_name || p?.guest_name || 'Unbekannt'
      const pid = a.user_id ? userToParticipant.get(a.user_id) : undefined

      if (a.seat_type === 'assigned' && a.seat_id && pid) {
        pStands[pid] = a.seat_id
        assignedNames[a.seat_id] = name
      } else if (a.seat_type === 'adhoc' && a.position_lat != null && a.position_lng != null) {
        adhocList.push({
          id: a.id,
          name: a.seat_name || 'Ad-hoc Stand',
          type: 'adhoc',
          position: { lat: a.position_lat, lng: a.position_lng },
          description: null,
          adhoc_subtype: a.adhoc_subtype ?? null,
        })
        if (pid) {
          pStands[pid] = a.id
          assignedNames[a.id] = name
        }
      } else if (a.seat_type === 'free_pos' && a.position_lat != null && a.position_lng != null && a.user_id) {
        freePos.push({
          userId: a.user_id,
          position: { lat: a.position_lat, lng: a.position_lng },
          userName: name,
          avatarColor: getAvatarColor(pid || a.user_id),
        })
      }
    }

    // Dedup per ID: falls ein Stand in beiden Quellen existiert, gewinnt adhocList
    const merged = new Map<string, StandData>()
    for (const s of stands) merged.set(s.id, s)
    for (const s of adhocList) merged.set(s.id, s)

    return {
      allStands: Array.from(merged.values()),
      allParticipantStands: pStands,
      freePositions: freePos,
      standAssignedNames: assignedNames,
    }
  }, [stands, seatAssignments, participants])

  // Eigene Position an Supabase senden — NUR bei guter Genauigkeit (<10m)
  // Ungenaue Positionen werden nur lokal angezeigt (Sicherheit bei Drückjagd)
  useEffect(() => {
    // Nur wer wirklich dabei ist, sendet Position. Wer die Jagd verlassen hat,
    // blieb sonst ein Punkt auf der Karte der anderen, während er in keiner
    // Teilnehmerliste mehr stand: der Jagdleiter hielt ihn für weg, die Karte
    // zeigte ihn auf dem Stand. Genau der Fall, der bei einer Drückjagd nicht
    // passieren darf. 'invited' ist ebenfalls kein Mitsenden — wer noch nicht
    // zugesagt hat, ist nicht im Revier.
    if (myParticipation?.status !== 'joined') return
    if (!myParticipantId || !hunt?.id || !geoState.position) return
    if ((geoState.accuracy ?? 999) >= 10) return

    updatePosition(
      supabase,
      myParticipantId,
      hunt.id,
      geoState.position,
      geoState.accuracy ?? 999,
      geoState.isLocked,
    )
  }, [geoState.position, geoState.accuracy, geoState.isLocked, myParticipantId, myParticipation?.status, hunt?.id, supabase])

  const loadMapObjects = useCallback(async (districtId: string) => {
    const { data: mapObjects, error } = await supabase
      .from('map_objects')
      .select('id, name, type, position, description')
      .eq('district_id', districtId)

    /**
     * **Der Fehler wurde bis zum 26.08.2026 gar nicht gelesen** — hier stand
     * `const { data: mapObjects } = …`, ohne `error`. Schlug die Anfrage fehl,
     * blieb die Karte still leer: kein Hinweis, keine Meldung, und niemand
     * konnte unterscheiden, ob ein Revier keine Stände hat oder ob die Anfrage
     * gescheitert ist (S1/S4).
     *
     * **Das ist kein theoretischer Mangel.** Am 26.08.2026 fehlten in der
     * Jagdkarte alle 32 Objekte von Testrevier L7 — die Ursache lag beim
     * Parser, aber ohne diese Zeile war vom Bildschirm aus nicht einmal zu
     * sagen, ob überhaupt Daten ankamen. Die Diagnose kostete darum den Umweg
     * über eine zweite Seite. Moritz' erste Deutung war die naheliegende und
     * falsche: *„vielleicht gibt es ja gar keine."*
     *
     * **Der bestehende Zustand bleibt stehen**, statt geleert zu werden: beim
     * Nachladen ist der alte Stand die bessere Auskunft als ein erfundener
     * leerer — dieselbe Entscheidung wie bei den Teilnehmern in `loadHunt`.
     */
    if (error) {
      console.warn('[loadMapObjects] map_objects-Query fehlgeschlagen:', error)
      return
    }
    if (!mapObjects) return

    const parsed: StandData[] = []
    let ohnePosition = 0
    for (const obj of mapObjects) {
      const pos = parsePointHex(obj.position)
      if (!pos) { ohnePosition++; continue }
      parsed.push({
        id: obj.id,
        name: obj.name,
        type: obj.type,
        position: pos,
        description: (obj as Record<string, unknown>).description as string | null,
      })
    }
    /**
     * **Ein Objekt ohne lesbare Position ist eine Auffälligkeit, kein
     * Normalfall** — `position` ist NOT NULL. Genau diese Zahl wäre am
     * 26.08.2026 die Antwort gewesen: 32 geladen, 32 verworfen.
     */
    if (ohnePosition > 0) {
      console.warn(
        `[loadMapObjects] ${ohnePosition} von ${mapObjects.length} Objekten ohne lesbare Position — ` +
          'geparst wird jetzt Hex UND GeoJSON, s. parsePointHex.',
      )
    }
    setStands(parsed)
  }, [supabase])

  const loadDistrictData = useCallback(async (districtId: string) => {
    // Reviergrenze + Name laden
    const { data: district, error } = await supabase
      .from('districts')
      .select('boundary, name')
      .eq('id', districtId)
      .maybeSingle()

    // RLS-Lücken müssen laut sein, nicht kommentarlos grenzenlos rendern.
    if (error) {
      console.warn('[loadDistrictData] districts-Query fehlgeschlagen:', error)
    } else if (!district) {
      console.warn('[loadDistrictData] Keine districts-Zeile sichtbar (RLS?) für district_id:', districtId)
    }

    if (district?.boundary) {
      const parsed = parsePolygonHex(district.boundary)
      if (parsed) setBoundary(parsed)
    }
    setDistrictName(district?.name ?? null)

    await loadMapObjects(districtId)
  }, [supabase, loadMapObjects])

  const loadHunt = useCallback(async () => {
    const { data: hunt } = await supabase.from('hunts').select('*').eq('id', params.id).single()
    if (!hunt) { router.push('/app?tab=jagden'); return }

    const { data: parts, error: teilnehmerFehler } = await supabase.from('hunt_participants').select('*, profiles(display_name, anonymize_kills)').eq('hunt_id', params.id)
    const { data: { user } } = await supabase.auth.getUser()

    setHunt(hunt)
    setUserId(user?.id ?? null)

    // **Ein gescheiterter Nachladelauf darf die Liste nicht LEEREN**
    // (Fremdprüfung 05.08.2026, Punkt 8). Vorher lief der Fehler in
    // `parts || []` und setzte damit `participants` auf leer — und weil
    // `isJagdleiter` daraus abgeleitet wird, verschwand bei einem Funkloch
    // nach dem Einladen die ganze Führungs-UI, obwohl die Einladung
    // geschrieben war. Beim ERSTEN Laden ist leer richtig; beim Nachladen ist
    // der alte Stand die bessere Auskunft als ein erfundener leerer.
    //
    // **KEIN `return` hier**, und das ist der Punkt, an dem der erste Versuch
    // falsch war: darunter stehen `setLoading(false)`, die Sitzplätze und die
    // Revierdaten. Ein Ausstieg hätte den Bildschirm beim ERSTEN Laden
    // dauerhaft im Ladezustand hängen lassen — schlimmer als der Fehler, gegen
    // den der Riegel gebaut ist. Übersprungen werden nur die drei Zuweisungen,
    // die aus `parts` folgen.
    if (teilnehmerFehler) {
      console.error('[hunt] Teilnehmer konnten nicht geladen werden:', teilnehmerFehler)
      showToast('Die Teilnehmerliste ist nicht aktuell.', 'warning')
    } else {
      setParticipants(parts || [])
    // `status === 'joined'` muss mit: get_my_joined_hunt_ids_as_leader() (067)
    // verlangt es, also darf das UI-Gate es nicht weglassen. Sonst sieht ein
    // eingeladener, aber noch nicht beigetretener Jagdleiter die Führungs-UI,
    // und jeder Knopf darin scheitert an RLS — genau die UI/RLS-Divergenz, die
    // 067 beseitigt hat.
      setIsJagdleiter(parts?.some(p => p.user_id === user?.id && p.role === 'jagdleiter' && p.status === 'joined') || false)
      setIsGruppenleiter(parts?.some(p => p.user_id === user?.id && p.tags?.includes('gruppenleiter')) || false)
    }
    setLoading(false)

    // Solo-Hunt: Chat-Tab nicht erlaubt → auf Karte fallbacken
    if (hunt.kind === 'solo') {
      setActiveTab(prev => prev === 'chat' ? 'karte' : prev)
    }

    // Nach Kill in Solo-Hunt: "Jagd beenden?"-Prompt zeigen
    if (hunt.kind === 'solo' && searchParams.get('afterKill') === '1') {
      setShowEndHuntPrompt(true)
    }

    // Seat Assignments laden (Hochsitz-Zuweisungen, Ad-hoc Stände, freie Positionen)
    const { data: assignments } = await supabase
      .from('hunt_seat_assignments')
      .select('id, user_id, seat_id, seat_type, seat_name, position_lat, position_lng, adhoc_subtype')
      .eq('hunt_id', params.id)
    setSeatAssignments(assignments || [])

    // Revier-Daten laden (Grenze + Hochsitze)
    if (hunt.district_id) {
      loadDistrictData(hunt.district_id)
    } else if (hunt.boundary) {
      // Freie Jagd: Boundary direkt aus hunts laden
      const parsed = parsePolygonHex(hunt.boundary)
      if (parsed) setBoundary(parsed)
    }
  }, [supabase, params.id, router, loadDistrictData])

  useEffect(() => { loadHunt() }, [loadHunt])

  useEffect(() => { setNowMs(Date.now()) }, [])

  // Kontakte für die Einladungsverwaltung — nur laden, wenn geplante Jagd + Jagdleiter.
  useEffect(() => {
    if (!hunt || !isHuntScheduled(hunt.status) || !isJagdleiter || !userId) return
    let cancelled = false
    // konto_namen() statt profiles — s. `src/lib/konto-namen.ts`. Der
    // Selbst-Ausschluss bleibt hier: die RPC liefert bewusst alle Konten.
    supabase.rpc('konto_namen')
      .then(({ data, error }) => {
        if (cancelled) return
        // **Der Fehler wird nicht verschluckt, aber S4 ist hier nur HALB
        // geschlossen** (Fremdpruefung 22.08.2026 F3, Schlusslesung T4).
        //
        // Der Log ist das Mindeste. Was er NICHT leistet: der Nutzer sieht
        // weiterhin eine leere Einladeliste und kann sie nicht von „es gibt
        // niemanden mehr" unterscheiden. **Der erste Entwurf begruendete das
        // mit „der vorige Stand bleibt stehen" — das ist praktisch leer**,
        // denn `inviteContacts` startet als `[]` und der Effekt laeuft real
        // genau einmal. Ein Argument, das nur auf dem Papier traegt, ist
        // schlimmer als keins.
        //
        // Ein sichtbarer Zustand braucht hier mehr als eine Zeile (die Liste
        // steckt in einem groesseren Einladebereich) und steht im Backlog.
        if (error) {
          console.error('[jagd] Einladeliste nicht abrufbar:', error.message)
          return
        }
        if (data) setInviteContacts(data.filter((p: KontoName) => p.id !== userId))
      })
    return () => { cancelled = true }
  }, [hunt, isJagdleiter, userId, supabase])

  // URL-Sync: ?tab=… ist Source of Truth. Re-Navigation auf gleiche Route
  // (z.B. zweiter Tap auf Hunt-Chat in Liste) updated activeTab über diesen Effect.
  // Funktionaler Setter vermeidet activeTab-Dependency und Stale-Closure.
  useEffect(() => {
    const raw = searchParams.get('tab')
    if (!isValidTab(raw)) return
    if (hunt?.kind === 'solo' && raw === 'chat') {
      setActiveTab(prev => prev !== 'karte' ? 'karte' : prev)
      return
    }
    setActiveTab(prev => prev !== raw ? raw : prev)
  }, [searchParams, hunt?.kind])

  const handleStandsChanged = useCallback((newStand?: StandData, deletedId?: string) => {
    // Optimistisches Update: sofort anzeigen ohne Refetch abzuwarten
    if (newStand) {
      if (newStand.type === 'adhoc') {
        // Adhoc-Stände leben in seatAssignments, nicht in stands
        setSeatAssignments(prev => prev.map(a =>
          a.id === newStand.id
            ? { ...a, position_lat: newStand.position.lat, position_lng: newStand.position.lng }
            : a
        ))
      } else {
        setStands(prev => {
          const exists = prev.some(s => s.id === newStand.id)
          return exists ? prev.map(s => s.id === newStand.id ? newStand : s) : [...prev, newStand]
        })
      }
    }
    if (deletedId) {
      setStands(prev => prev.filter(s => s.id !== deletedId))
    }
    // Kein loadMapObjects hier — Race-Condition: DB-Update ist noch nicht durch
    // wenn der Refetch feuert, alter Stand überschreibt das optimistische Update.
    // Konsistenz wird bei nächstem Seitenaufruf/Reload hergestellt.
  }, [])

  const handleBoundaryChanged = useCallback(() => {
    loadHunt()
  }, [loadHunt])

  async function copyInviteLink() {
    if (!hunt) return
    await navigator.clipboard.writeText(`${window.location.origin}/join/${hunt.invite_code}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function shareWhatsApp() {
    if (!hunt) return
    const link = `${window.location.origin}/join/${hunt.invite_code}`
    window.open(`https://wa.me/?text=${encodeURIComponent(`Jagd "${hunt.name}" — komm dazu: ${link}`)}`, '_blank')
  }

  async function endHunt(skipConfirm = false) {
    if (!hunt) return
    if (!skipConfirm) {
      const ok = await confirmSheet({
        title: hunt.kind === 'solo' ? 'Einzeljagd beenden?' : 'Jagd für alle beenden?',
        description: hunt.kind === 'solo'
          ? 'Die Jagd wird auf „abgeschlossen" gesetzt.'
          : 'Alle Teilnehmer sehen die Jagd als beendet.',
        confirmLabel: 'Beenden',
        confirmVariant: 'danger',
      })
      if (!ok) return
    }
    // .select() ist hier kein Beiwerk: ohne es meldet PostgREST auch dann
    // Erfolg, wenn RLS die Zeile herausgefiltert hat. Genau so blieb „Hahn in
    // Ruh" für einen Jagdleiter ≠ Ersteller wirkungslos, während der Nutzer
    // schon auf /app stand und die Jagd weiterlief.
    const { data: beendet, error } = await supabase
      .from('hunts')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', hunt.id)
      .select('id')
    if (error || !beendet?.length) {
      showToast('Jagd konnte nicht beendet werden. Sie läuft weiter.', 'warning')
      return
    }
    // Router-Cache invalidieren, sonst zeigt das Tagebuch den Hunt
    // weiterhin ohne 'auto_completed'/'completed'-Chip bis PWA-Neustart.
    router.refresh()
    router.push('/app')
  }

  async function leaveHunt() {
    if (!hunt || !userId) return
    const ok = await confirmSheet({
      title: 'Jagd verlassen?',
      // Der alte Text — „Du kannst später wieder beitreten, solange die Jagd
      // läuft" — versprach etwas, das es nicht gibt und auch nicht geben soll:
      // hunt_participants hat keine Self-Join-Policy, und das ist Absicht
      // (Jagd_Abschluss_V1 §6). Wer sich selbst zurückholen könnte, säße
      // womöglich auf einem Stand, während der Jagdleiter ihn für weg hält.
      description: 'Der Jagdleiter kann dich danach wieder aufnehmen.',
      confirmLabel: 'Verlassen',
      confirmVariant: 'danger',
    })
    if (!ok) return
    // RPC statt UPDATE (Migration 067). Ein direktes UPDATE auf die eigene
    // Zeile ist nicht möglich: hunt_participants hat keine UPDATE-Policy für
    // `user_id = auth.uid()`, und eine solche Policy dürfte es auch nicht
    // geben — RLS kann keine Spalten einschränken, also könnte damit jeder
    // Teilnehmer sein eigenes `role` auf 'jagdleiter' setzen. Die Funktion
    // schreibt genau status und left_at und wirft bei 0 Zeilen.
    const { error } = await supabase.rpc('jagd_verlassen', { p_hunt: hunt.id })
    if (error) {
      showToast('Verlassen fehlgeschlagen. Du bist weiter in der Jagd.', 'warning')
      return
    }
    // Participant-Count ändert sich → Solo/Gesell-Schwelle im Tagebuch
    // muss neu berechnet werden.
    router.refresh()
    router.push('/app')
  }

  // === Sprint C: Einladungsverwaltung (nur Jagdleiter) ===
  //
  // **Bis zum 05.08.2026 ein blanker Insert — und damit seit Migration 088
  // kaputt** (Backlog A-G8). Seither bleibt eine Absage als Zeile mit
  // `status='declined'` stehen, statt gelöscht zu werden; der Insert lief für
  // sie in `23505` (`UNIQUE (hunt_id, user_id)`), und der Nutzer sah nur
  // „Einladen fehlgeschlagen". **Wer einmal abgesagt hatte, war hier nie
  // wieder einladbar.** 088 hat die Auflage im Kopf ausdrücklich benannt
  // („jeder Einladepfad muss künftig ein UPDATE sein"); nachgezogen wurde
  // damals nur die Zentrale.
  //
  // Zwei Zweige, nach dem Vorbild von `app/zentrale/jagden/[id]/detail.tsx`:
  // vorhandene abgesagte Zeile zurückdrehen, sonst neu anlegen.
  //
  // **`.in('status', …)` am Update ist ein Compare-and-Swap, kein Zierat:**
  // zwischen dem Lesen und dem Schreiben kann derselbe Mensch zusagen. Ohne
  // den Riegel würde eine frische Zusage kommentarlos auf `invited`
  // zurückgestuft und verlöre ihr `joined_at`.
  //
  // **`left` kommt mit, anders als in der Zentrale**, die nur `declined`
  // kennt: wer die Jagd verlassen hat (`jagd_verlassen`, 067), ist derselbe
  // Fall — der Weg zurück gehört dem Jagdleiter (Moritz, 31.07.2026). So hält
  // es auch der native Pfad (`src/lib/data/participants.ts`).
  //
  // **`.select()` an beiden Zweigen**, damit 0 betroffene Zeilen nicht als
  // Erfolg durchgehen (S1) — RLS filtert beim UPDATE still, sie wirft nicht.
  async function addInvite(contactId: string) {
    if (!hunt || inviteLaeuft.current) return
    inviteLaeuft.current = true
    setInviteBusy(true)
    try {
      const { data: vorhandene, error: leseFehler } = await supabase
        .from('hunt_participants')
        .select('id, status')
        .eq('hunt_id', hunt.id)
        .eq('user_id', contactId)
        .maybeSingle()
      if (leseFehler) throw leseFehler

      const geschrieben = vorhandene
        ? await supabase
            .from('hunt_participants')
            .update({ status: 'invited', left_at: null, joined_at: null })
            .eq('id', vorhandene.id)
            .in('status', ['declined', 'left'])
            .select('id')
        : await supabase
            .from('hunt_participants')
            .insert({ hunt_id: hunt.id, user_id: contactId, role: 'schuetze', status: 'invited' })
            .select('id')

      if (geschrieben.error) throw geschrieben.error
      if ((geschrieben.data?.length ?? 0) === 0) {
        // Kein Fehler und trotzdem nichts geschrieben: die Zeile stand schon
        // auf `invited` oder `joined`, oder RLS hat still gefiltert. Beides
        // ist kein Erfolg und darf nicht wie einer aussehen.
        showToast('Niemand eingeladen — der Zustand hat sich inzwischen geändert.', 'warning')
        return
      }
      setInviteSearch('')
      await loadHunt()
      router.refresh()
    } catch (e) {
      console.error('[hunt] Einladen fehlgeschlagen:', e)
      showToast('Einladen fehlgeschlagen', 'warning')
    } finally {
      inviteLaeuft.current = false
      setInviteBusy(false)
    }
  }

  async function removeParticipant(p: Participant) {
    // **Derselbe Ref wie beim Einladen, und er greift VOR dem Dialog**
    // (Fremdprüfung 05.08.2026, Punkt 6): `inviteBusy` wurde hier erst NACH der
    // Rückfrage gesetzt. Solange der Bestätigungsdialog offen stand, konnte
    // nebenher eingeladen werden — beide Vorgänge liefen dann parallel auf
    // denselben Anzeige-State, und der zuerst fertige gab ihn frei, während der
    // andere noch schrieb. Die Knöpfe sahen bedienbar aus, obwohl es noch lief.
    if (!hunt || inviteLaeuft.current) return
    inviteLaeuft.current = true
    const name = p.profiles?.display_name || p.guest_name || 'Teilnehmer'
    const ok = await confirmSheet({
      title: 'Aus der Jagd entfernen?',
      description: `${name} wird aus der Jagd entfernt.`,
      confirmLabel: 'Entfernen',
      confirmVariant: 'danger',
    })
    if (!ok) {
      inviteLaeuft.current = false
      return
    }
    setInviteBusy(true)
    const { data: entfernt, error } = await supabase
      .from('hunt_participants')
      .delete()
      .eq('id', p.id)
      .select('id')
    if (error || !entfernt?.length) {
      inviteLaeuft.current = false
      setInviteBusy(false)
      showToast(`${name} konnte nicht entfernt werden.`, 'warning')
      return
    }
    // joined: zusätzlich aus der Hunt-Chat-Gruppe entfernen (analog 049-Cleanup,
    // gescopt auf chat_groups.hunt_id IS NOT NULL). Seit 067 deckt das nicht nur
    // der Gruppen-Ersteller ab, sondern jeder Jagdleiter der Jagd
    // (chat_group_members_hunt_leader_delete).
    //
    // Kein Abbruch bei Fehlschlag, aber auch kein Schweigen: der Teilnehmer ist
    // an dieser Stelle schon aus der Jagd raus, das lässt sich nicht
    // zurücknehmen. Ein halbes Entfernen — raus aus der Jagd, drin im Chat —
    // muss man aber sehen, sonst liest jemand still weiter mit.
    if (p.status === 'joined' && p.user_id) {
      const { data: groups } = await supabase.from('chat_groups').select('id').eq('hunt_id', hunt.id)
      const groupIds = (groups || []).map(g => g.id)
      if (groupIds.length > 0) {
        const { error: chatFehler } = await supabase
          .from('chat_group_members')
          .delete()
          .in('group_id', groupIds)
          .eq('user_id', p.user_id)
        if (chatFehler) {
          showToast(`${name} ist aus der Jagd, aber noch im Jagd-Chat.`, 'warning')
        }
      }
    }
    inviteLaeuft.current = false
    setInviteBusy(false)
    await loadHunt()
    router.refresh()
  }

  async function toggleChatOpen() {
    if (!hunt || chatOpenBusy) return
    setChatOpenBusy(true)
    const next = !hunt.chat_open
    const { error } = await supabase.from('hunts').update({ chat_open: next }).eq('id', hunt.id)
    setChatOpenBusy(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('quickhunt:toast', { detail: { message: 'Konnte Chat-Freigabe nicht ändern', type: 'warning' } }))
      return
    }
    setHunt({ ...hunt, chat_open: next })
    router.refresh()
  }

  // C2: Karten-Freigabe — symmetrisch zu toggleChatOpen. Setzt hunts.map_open;
  // joined-Mitglieder sehen die Karte erst danach (nur lesen, kein Einzeichnen).
  async function toggleMapOpen() {
    if (!hunt || mapOpenBusy) return
    setMapOpenBusy(true)
    const next = !hunt.map_open
    const { error } = await supabase.from('hunts').update({ map_open: next }).eq('id', hunt.id)
    setMapOpenBusy(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('quickhunt:toast', { detail: { message: 'Konnte Karten-Freigabe nicht ändern', type: 'warning' } }))
      return
    }
    setHunt({ ...hunt, map_open: next })
    router.refresh()
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}><p style={{ color: 'var(--text-3)' }}>Lädt...</p></div>
  if (!hunt) return null

  // Wer die Jagd verlassen hat, darf sie nicht weiter als Teilnehmer sehen.
  //
  // Vorher prüfte diese Seite den eigenen Status NIRGENDS: nach dem Verlassen
  // sah alles unverändert aus — Karte, Chat, Stände —, während
  // `joinedParticipants` einen längst herausgefiltert hatte. Man war für die
  // anderen weg und für sich selbst dabei.
  //
  // Der Rückweg führt bewusst über den Jagdleiter und nicht über einen
  // Selbst-Beitritt: er muss wissen, wer im Revier ist, bevor sich jemand auf
  // einen Stand setzt (Konzept Jagd_Abschluss_V1 §6). Nativ steht an derselben
  // Stelle HuntGatePrompt mit derselben Aussage.
  //
  // Der Ersteller kommt immer durch: `hunts_creator_all` lässt ihn die Jagd
  // auch dann laden, wenn seine Teilnehmerzeile fehlt (gescheiterter Insert
  // beim Anlegen) — ohne diese Ausnahme sperrte der Guard ihn aus seiner
  // eigenen Jagd aus.
  if (userId !== hunt.creator_id && (!myParticipation || myParticipation.status === 'left')) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ background: 'var(--bg)' }}>
        <WarningCircle size={40} color="var(--text-3)" />
        <div>
          <p className="font-semibold" style={{ marginBottom: '0.375rem' }}>
            Du bist kein Teilnehmer von „{hunt.name}“
          </p>
          {/* Zwei verschiedene Zustände, zwei verschiedene Sätze: „verlassen"
              stimmt nur, wenn es eine Zeile mit status='left' gibt. Fehlt die
              Zeile ganz, ist der häufigere Grund eine hakende Anmeldung — dann
              wäre „Du hast verlassen" schlicht gelogen und schickt jemanden auf
              die falsche Fehlersuche. */}
          <p className="text-sm" style={{ color: 'var(--text-3)', lineHeight: 1.45 }}>
            {myParticipation?.status === 'left'
              ? 'Du hast diese Jagd verlassen. Der Jagdleiter kann dich wieder aufnehmen.'
              : 'Nur der Jagdleiter kann dich zu dieser Jagd hinzufügen.'}
          </p>
        </div>
        <button onClick={() => router.push('/app?tab=jagden')}
          className="font-semibold text-sm"
          style={{
            height: '2.75rem', padding: '0 1.25rem', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
          }}>
          Zurück zu den Jagden
        </button>
      </div>
    )
  }

  const pName = (p: Participant) => p.profiles?.display_name || p.guest_name || 'Unbekannt'
  const joinedParticipants = participants.filter(p => p.status === 'joined')

  const isSolo = hunt.kind === 'solo'
  const isScheduled = isHuntScheduled(hunt.status)

  // === Sprint C: geplante Jagd — eigene Ansicht (Plan + Chat). Karte/Strecke/
  // Nachsuche sind gesperrt (UI-only). Der Cron flippt zum scheduled_for auf
  // 'active' → danach rendert die normale Jagd-Ansicht unten. ===
  if (isScheduled) {
    const isCreator = userId === hunt.creator_id
    // Spiegelt messages_insert_member: Leiter immer; sonst nur wenn chat_open
    // ODER scheduled_for erreicht. RLS bleibt die Wahrheit.
    const chatWritable = isJagdleiter
      || hunt.chat_open
      || (hunt.scheduled_for != null && nowMs > 0 && nowMs >= new Date(hunt.scheduled_for).getTime())
    // C2: Karte ist vor Go-Live für den Ersteller immer sichtbar (Planungsarbeit —
    // Treiben/Stände einzeichnen), für andere joined erst nach Freigabe (map_open).
    // Live (status='active') landet nie in diesem Branch → kein Live-Zweig nötig (L3).
    const mapVisible = isCreator || hunt.map_open
    const scheduledTabs: Array<'plan' | 'karte' | 'chat'> = mapVisible
      ? ['plan', 'karte', 'chat']
      : ['plan', 'chat']
    /**
     * **Hier sass die 088-Falle wirklich** (Fremdprüfung 05.08.2026, Punkt 1).
     *
     * Der Filter lautete `!participants.some(p => p.user_id === c.id)` und warf
     * damit JEDE vorhandene Zeile heraus — auch eine abgesagte. `loadHunt`
     * lädt `hunt_participants` ohne Statusfilter, ein Abgesagter steht also in
     * `participants` und verschwand aus der Auswahl. **Wer einmal abgesagt
     * hatte, tauchte hier nie wieder auf**, und der Reparatur-Zweig in
     * `addInvite` wäre unerreichbar geblieben: ein Fix, der nichts fixt.
     * Gefunden erst, nachdem der Schreibpfad schon umgebaut war.
     *
     * Jetzt fallen nur `joined` und `invited` heraus — die einen sind dabei,
     * die anderen gefragt. `declined` und `left` bleiben in der Liste und
     * werden dort ausgewiesen (`abgesagt`), damit der Jagdleiter weiss, dass
     * er jemanden erneut fragt. So hält es auch der native Pfad.
     */
    const invitable = inviteContacts
      .map(c => ({ ...c, vorhanden: participants.find(p => p.user_id === c.id) }))
      .filter(c => !c.vorhanden || c.vorhanden.status === 'declined' || c.vorhanden.status === 'left')
      .map(c => ({ ...c, abgesagt: Boolean(c.vorhanden) }))
      .filter(c => !inviteSearch || c.display_name.toLowerCase().includes(inviteSearch.toLowerCase()))

    return (
      <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
        {/* Top Bar */}
        <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)', paddingTop: 'calc(0.625rem + var(--safe-top))' }}>
          <button onClick={() => router.push('/app?tab=jagden')} className="flex items-center justify-center rounded-lg"
            style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{
              fontFamily: 'var(--font-display)', fontSize: '1.0625rem', fontWeight: 500,
              letterSpacing: '-0.01em', color: 'var(--text)',
            }}>{hunt.name}</div>
            <div className="text-xs truncate" style={{ color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CalendarBlank size={12} weight="fill" />
              <span>Geplant{hunt.scheduled_for ? ` · ${new Date(hunt.scheduled_for).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${new Date(hunt.scheduled_for).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : ''}</span>
            </div>
          </div>
          <button onClick={copyInviteLink} className="flex items-center justify-center rounded-lg text-sm"
            style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem' }}>{copied ? '✓' : '🔗'}</button>
          <button onClick={shareWhatsApp} className="flex items-center justify-center rounded-lg text-sm"
            style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', minWidth: '2.75rem', minHeight: '2.75rem' }}>💬</button>
          <HuntActionsMenu
            huntKind={hunt.kind}
            isCreator={isCreator}
            onEndHunt={() => endHunt()}
            onLeaveHunt={leaveHunt}
          />
        </div>

        {/* Sub-Tabs: Plan | (Karte) | Chat — Karte nur wenn freigegeben/Ersteller */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border-light)' }}>
          {scheduledTabs.map(t => {
            const active = scheduledTab === t
            const Icon = t === 'plan' ? CalendarBlank : t === 'karte' ? MapTrifold : ChatCircle
            const label = t === 'plan' ? 'Plan' : t === 'karte' ? 'Karte' : 'Chat'
            return (
              <button key={t} onClick={() => setScheduledTab(t)}
                className="flex-1 py-2.5 text-xs font-semibold transition"
                style={{
                  color: active ? 'var(--accent-primary)' : 'var(--text-3)',
                  borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
                }}>
                <Icon size={16} weight={active ? 'fill' : 'regular'} />
                <span>{label}</span>
                {t === 'chat' && chatUnread > 0 && (
                  <span className="tab-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0" style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Chat — bleibt gemountet für Realtime */}
          <div style={{ position: 'absolute', inset: 0, display: scheduledTab === 'chat' ? 'flex' : 'none', flexDirection: 'column' }}>
            <ChatPanel
              huntId={hunt.id}
              chatName={hunt.name}
              participants={participants}
              userId={userId}
              myParticipantId={myParticipantId}
              supabase={supabase}
              isActive={scheduledTab === 'chat'}
              onUnreadChange={setChatUnread}
              canDeleteAll={isCreator}
              sendDisabled={!chatWritable}
              sendDisabledHint="Der Jagdleiter hat den Chat noch nicht freigegeben."
            />
          </div>

          {/* Karte — nur gemountet, wenn sichtbar (Ersteller immer, sonst map_open).
              Editieren bleibt creator-only: isJagdleiter={isCreator},
              isGruppenleiter={false} → Schütze sieht nur, zeichnet nicht (L2). */}
          {mapVisible && (
            <div style={{ position: 'absolute', inset: 0, display: scheduledTab === 'karte' ? 'block' : 'none' }}>
              <MapView
                isVisible={scheduledTab === 'karte'}
                geoState={geoState}
                participants={otherPositions}
                boundary={boundary}
                stands={allStands}
                participantStands={allParticipantStands}
                freePositions={freePositions}
                standAssignedNames={standAssignedNames}
                districtId={hunt.district_id}
                districtName={districtName}
                huntId={hunt.id}
                huntParticipants={participants}
                seatAssignments={seatAssignments}
                isJagdleiter={isCreator}
                isGruppenleiter={false}
                currentUserId={userId}
                onStandsChanged={handleStandsChanged}
                onBoundaryChanged={handleBoundaryChanged}
                onSeatAssignmentsChanged={setSeatAssignments}
              />
            </div>
          )}

          {/* Plan-Tab */}
          {scheduledTab === 'plan' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Datum-Hero */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--blue)' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--blue)', marginBottom: '0.25rem',
                }}>
                  <CalendarBlank size={13} weight="fill" />
                  Geplant
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: '1.125rem', fontWeight: 500,
                  letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: '0.5rem',
                }}>{hunt.scheduled_for ? formatPlanDateTime(hunt.scheduled_for) : 'Kein Datum gesetzt'}</div>
                <p className="text-xs" style={{ color: 'var(--text-3)', lineHeight: 1.4 }}>
                  Die Jagd geht automatisch zum geplanten Zeitpunkt live. Strecke und Nachsuche sind bis dahin gesperrt.
                </p>
              </div>

              {/* Freigaben (nur Jagdleiter) — Karte + Chat als optisches Paar (L5):
                  Titel = Zustand, Button = Aktion. */}
              {isCreator && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Vor dem Start freigeben</div>
                  <FreigabeToggle
                    noun="Karte"
                    hint="Zugesagte sehen die geplanten Stände & Treiben (nur ansehen)."
                    open={hunt.map_open}
                    busy={mapOpenBusy}
                    onToggle={toggleMapOpen}
                    Icon={MapTrifold}
                  />
                  <FreigabeToggle
                    noun="Chat"
                    hint="Zugesagte können schon vor dem Start schreiben."
                    open={hunt.chat_open}
                    busy={chatOpenBusy}
                    onToggle={toggleChatOpen}
                    Icon={ChatCircle}
                  />
                </div>
              )}

              {/* Teilnehmer */}
              <div>
                <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                  Teilnehmer ({participants.length})
                </div>
                <div className="space-y-2">
                  {participants.map((p) => {
                    const invited = p.status === 'invited'
                    const canRemove = isJagdleiter && p.user_id !== userId
                    return (
                      <div key={p.id} className="flex items-center gap-2.5 rounded-xl p-2.5"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                        <div className="avatar-xs" style={{ background: getAvatarColor(p.id), color: '#fff' }}>{getInitials(pName(p))}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.user_id === userId ? 'Du' : pName(p)}</div>
                          <div className="text-xs flex items-center gap-1" style={{ color: invited ? 'var(--blue)' : 'var(--accent-primary)' }}>
                            {p.role === 'jagdleiter'
                              ? <><Star size={11} weight="fill" color="var(--accent-gold)" /> Jagdleiter</>
                              : invited ? 'Eingeladen' : 'Zugesagt'}
                          </div>
                        </div>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => removeParticipant(p)}
                            disabled={inviteBusy}
                            aria-label="Entfernen"
                            className="flex items-center justify-center rounded-lg disabled:opacity-50"
                            style={{ minWidth: '2.5rem', minHeight: '2.5rem', color: 'var(--red)', background: 'transparent' }}
                          >
                            <Trash size={18} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Weitere einladen (nur Jagdleiter) */}
              {isJagdleiter && (
                <div>
                  <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Weitere einladen</div>
                  <div className="relative mb-2">
                    <MagnifyingGlass size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                    <input
                      type="text"
                      value={inviteSearch}
                      onChange={(e) => setInviteSearch(e.target.value)}
                      placeholder="Jäger suchen…"
                      style={{
                        width: '100%', height: '2.75rem', padding: '0 0.875rem 0 2.5rem',
                        borderRadius: 'var(--radius)', border: '1.5px solid var(--border)',
                        background: 'var(--surface)', color: 'var(--text)', fontSize: '0.9375rem',
                      }}
                    />
                  </div>
                  {invitable.length === 0 ? (
                    <p className="text-xs px-1" style={{ color: 'var(--text-3)' }}>
                      {inviteSearch ? 'Keine Treffer.' : 'Niemand mehr zur Auswahl — wer schon eingeladen ist oder zugesagt hat, fällt heraus.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {invitable.slice(0, 20).map((c) => (
                        <div key={c.id} className="flex items-center gap-2.5 rounded-xl p-2.5"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <div className="avatar-xs" style={{ background: getAvatarColor(c.id), color: '#fff' }}>{getInitials(c.display_name)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{c.display_name}</div>
                            {/* Ausgewiesen, nicht verschwiegen — der Jagdleiter
                                soll wissen, dass er jemanden erneut fragt. */}
                            {/* „verlassen" und „abgesagt" sind zwei Dinge, und
                                die Zentrale unterscheidet sie auch
                                (detail.tsx) — wer selbst gegangen ist, als
                                Absager auszuweisen, wäre eine kleine
                                Unwahrheit (Schlusslesung 05.08.2026). */}
                            {c.abgesagt ? (
                              <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                                {c.vorhanden?.status === 'left' ? 'hat die Jagd verlassen' : 'hat abgesagt'}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => addInvite(c.id)}
                            disabled={inviteBusy}
                            className="flex items-center gap-1 font-semibold text-sm transition disabled:opacity-50"
                            style={{
                              height: '2.5rem', padding: '0 1rem', borderRadius: 'var(--radius)',
                              border: '1.5px solid var(--green)', color: 'var(--green)', background: 'transparent',
                            }}
                          >
                            <Plus size={15} weight="bold" />
                            Einladen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const TABS: Array<{ key: 'karte' | 'chat' | 'nachsuche' | 'strecke'; label: string; icon: TabIconComponent; iconKind: 'phosphor' | 'species'; iconColor?: string }> = isSolo
    ? [
        { key: 'karte', label: 'Karte', icon: MapTrifold, iconKind: 'phosphor' },
        { key: 'nachsuche', label: 'Nachsuche', icon: WarningCircle, iconKind: 'phosphor', iconColor: 'var(--red)' },
        { key: 'strecke', label: 'Strecke', icon: RehwildTabIcon as TabIconComponent, iconKind: 'species' },
      ]
    : [
        { key: 'karte', label: 'Karte', icon: MapTrifold, iconKind: 'phosphor' },
        { key: 'chat', label: 'Chat', icon: ChatCircle, iconKind: 'phosphor' },
        { key: 'nachsuche', label: 'Nachsuche', icon: WarningCircle, iconKind: 'phosphor', iconColor: 'var(--red)' },
        { key: 'strecke', label: 'Strecke', icon: RehwildTabIcon as TabIconComponent, iconKind: 'species' },
      ]

  return (
    <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
      {/* Top Bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)', paddingTop: 'calc(0.625rem + var(--safe-top))' }}>
        <button onClick={() => router.push('/app?tab=jagden')} className="flex items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5" style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.0625rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'var(--text)',
          }}>
            <span className="live-dot" /> {hunt.name}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {isJagdleiter ? (
              <>
                <Star size={12} weight="fill" color="var(--accent-gold)" />
                <span>Jagdleiter</span>
              </>
            ) : (
              <>
                <Crosshair size={12} />
                <span>Schütze</span>
              </>
            )}
            <span>· {joinedParticipants.length} Jäger aktiv</span>
          </div>
        </div>
        <button onClick={copyInviteLink} className="flex items-center justify-center rounded-lg text-sm"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem' }}>{copied ? '✓' : '🔗'}</button>
        <button onClick={shareWhatsApp} className="flex items-center justify-center rounded-lg text-sm"
          style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', minWidth: '2.75rem', minHeight: '2.75rem' }}>💬</button>
        <HuntActionsMenu
          huntKind={hunt.kind}
          isCreator={userId === hunt.creator_id}
          onEndHunt={() => endHunt()}
          onLeaveHunt={leaveHunt}
        />
        {isJagdleiter && (
          <button onClick={() => setShowJLBar(!showJLBar)} className="px-2 flex items-center justify-center rounded-lg text-xs font-bold"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', minHeight: '2.75rem', minWidth: '2.75rem' }}>
            <Star size={16} weight="fill" />
          </button>
        )}
      </div>

      {/* Jagdleiter-Leiste.
       *
       * Hieß der eine verbliebene Knopf bis 30.07.2026 „Hahn in Ruh" — falsch,
       * und zwar nicht bloß schief: nativ ist das der Begriff für das ENDE
       * EINES TREIBENS (`endDrive()` in src/lib/data/drives.ts, „active →
       * completed" auf hunt_drives), und das Jagd-Ende heißt dort „Jagd
       * beenden" (EndHuntPrompt.tsx). Dieselben Worte meinten in den zwei
       * Clients derselben Datenbank zwei verschiedene Reichweiten. Wer den
       * Begriff in der Feld-App gelernt hat, hätte hier für ein Treiben
       * gedrückt und die Jagd für alle beendet.
       *
       * Gleichzeitig sind drei Knöpfe gefallen: „Treiben!", „Rollen" und
       * „+Nachsuche" hatten NIE einen onClick. „Treiben!" war dabei der
       * auffälligste der Leiste (gefüllt, Akzentfarbe) und tat nichts.
       * Verdrahtet wurden sie bewusst nicht: das Treiben gehört in die native
       * App (DrivesSheet, DriveStatusBanner, hunt_drives sind dort fertig),
       * und die PWA ist im Maintenance-Modus. Ein Knopf, der nichts tut, ist
       * schlechter als kein Knopf.
       *
       * Die Leiste bleibt als Ablage für Jagdleiter-Aktionen stehen — sie ist
       * die Stelle, an der ein Treiben-Bedienelement landet, wenn die PWA nativ
       * nachzieht. Offen und bewusst nicht hier entschieden: „Jagd beenden"
       * steht damit an zwei Orten (hier und im ⋯-Menü, dort creator-only). Ein
       * Ort wäre besser — genau diese doppelte Bedingung war der Bug von heute.
       */}
      {showJLBar && isJagdleiter && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
          <button onClick={() => endHunt()} className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid var(--alert-border)', background: 'var(--alert-bg)', color: 'var(--alert-text)', minHeight: '2.75rem' }}>
            <Stop size={14} weight="fill" color="var(--red)" />
            Jagd beenden
          </button>
        </div>
      )}

      {/* Hunt Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border-light)' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => {
                setActiveTab(tab.key)
                router.replace(`/app/hunt/${params.id}?tab=${tab.key}`, { scroll: false })
              }}
              className="flex-1 py-2.5 text-xs font-semibold transition"
              style={{
                color: isActive ? 'var(--accent-primary)' : 'var(--text-3)',
                borderBottom: isActive ? '2px solid var(--green)' : '2px solid transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.375rem',
              }}>
              {tab.iconKind === 'phosphor' ? (
                <Icon
                  size={16}
                  weight={isActive ? 'fill' : 'regular'}
                  color={tab.iconColor}
                />
              ) : (
                <Icon size={18} />
              )}
              <span>{tab.label}</span>
              {tab.key === 'chat' && chatUnread > 0 && (
                <span className="tab-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Teilnehmer-Chips (nur auf Karte-Tab) */}
      {activeTab === 'karte' && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
          {participants.map((p) => {
            // invited = eingeladen, noch nicht zugesagt → optisch abgesetzt
            // (gedimmt, gestrichelter Rahmen), damit zugesagt vs. eingeladen
            // auf einen Blick erkennbar ist (Sprint B, Befund 2).
            const isInvited = p.status === 'invited'
            return (
              <div key={p.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full flex-shrink-0"
                style={{
                  background: 'var(--surface-2)',
                  border: isInvited
                    ? '1px dashed var(--border)'
                    : p.role === 'jagdleiter' ? '1px solid var(--accent-gold)' : '1px solid var(--border)',
                  opacity: isInvited ? 0.55 : 1,
                }}>
                <div className="avatar-xs" style={{ background: getAvatarColor(p.id), color: '#fff' }}>{getInitials(pName(p))}</div>
                <span className="text-xs font-medium">{p.user_id === userId ? 'Du' : pName(p).split(' ')[0]}</span>
                {isInvited && <span className="text-xs" style={{ color: 'var(--text-3)' }}>eingeladen</span>}
                {!isInvited && p.role === 'jagdleiter' && <Star size={12} weight="fill" color="var(--accent-gold)" />}
                {!isInvited && p.tags?.includes('gruppenleiter') && <UsersThree size={12} color="var(--text-secondary)" />}
                {!isInvited && p.tags?.includes('hundefuehrer') && <Dog size={12} color="var(--text-secondary)" />}
              </div>
            )
          })}
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Karte — NICHT unmounten beim Tab-Wechsel (display statt conditional) */}
        <div style={{ position: 'absolute', inset: 0, display: activeTab === 'karte' ? 'block' : 'none' }}>
          <MapView
            isVisible={activeTab === 'karte'}
            geoState={geoState}
            participants={otherPositions}
            boundary={boundary}
            stands={allStands}
            participantStands={allParticipantStands}
            freePositions={freePositions}
            standAssignedNames={standAssignedNames}
            districtId={hunt.district_id}
            districtName={districtName}
            huntId={hunt.id}
            huntParticipants={participants}
            seatAssignments={seatAssignments}
            isJagdleiter={isJagdleiter}
            isGruppenleiter={isGruppenleiter}
            currentUserId={userId}
            onStandsChanged={handleStandsChanged}
            onBoundaryChanged={handleBoundaryChanged}
            onSeatAssignmentsChanged={setSeatAssignments}
          />
        </div>

        {/* Jagd-Chat — bleibt gemountet für Realtime, bei Solo nicht rendern */}
        {!isSolo && (
          <div style={{ position: 'absolute', inset: 0, display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column' }}>
            <ChatPanel
              huntId={hunt.id}
              chatName={hunt.name}
              participants={participants}
              userId={userId}
              myParticipantId={myParticipantId}
              supabase={supabase}
              isActive={activeTab === 'chat'}
              onUnreadChange={setChatUnread}
              canDeleteAll={userId === hunt.creator_id}
            />
          </div>
        )}

        {activeTab === 'nachsuche' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-5xl mb-4">🐕</div>
            <p className="text-lg font-bold mb-1">Nachsuche</p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Foto-Annotation + Hundeführer-Aufträge.</p>
          </div>
        )}
        {activeTab === 'strecke' && (
          <HuntStreckeTab
            huntId={hunt.id}
            participants={participants}
            userId={userId}
            isJagdleiter={isJagdleiter}
          />
        )}
      </div>

      {/* "Jagd beenden?"-Prompt nach Kill in Solo-Hunt */}
      {showEndHuntPrompt && (
        <div style={{
          position: 'fixed',
          bottom: 'var(--bottom-bar-space, 5rem)',
          left: 0,
          right: 0,
          padding: '1rem',
          background: 'var(--surface-2)',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.3)',
          zIndex: 50,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{
              textAlign: 'center',
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text)',
            }}>
              Jagd beenden?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowEndHuntPrompt(false)}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  borderRadius: 'var(--radius)',
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  minHeight: '2.75rem',
                }}
              >
                Weitermachen
              </button>
              <button
                onClick={() => {
                  setShowEndHuntPrompt(false)
                  endHunt(true)
                }}
                style={{
                  flex: 1,
                  padding: '0.875rem',
                  borderRadius: 'var(--radius)',
                  background: 'var(--green)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minHeight: '2.75rem',
                }}
              >
                Beenden
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
