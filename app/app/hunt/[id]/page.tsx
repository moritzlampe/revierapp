'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
import { MapTrifold, WarningCircle, ChatCircle, Star, Crosshair, UsersThree, Dog, Megaphone, Stop } from '@phosphor-icons/react'
import { RehwildIcon } from '@/components/icons/SpeciesIcons'
import type { ComponentType, SVGProps } from 'react'

type TabIconComponent = ComponentType<{ size?: number; weight?: 'regular' | 'fill'; color?: string } & SVGProps<SVGSVGElement>>

function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() }

type Hunt = { id: string; name: string; type: string; kind: 'group' | 'solo'; status: string; invite_code: string; wild_presets: string[]; started_at: string; signal_mode: string; district_id: string | null; creator_id: string; boundary: unknown | null }
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

  // GPS sofort starten (auch wenn anderer Tab aktiv)
  const geoState = useGeolocation()

  // Eigene participant_id bestimmen
  const myParticipantId = useMemo(() => {
    return participants.find(p => p.user_id === userId)?.id ?? null
  }, [participants, userId])

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
  }, [geoState.position, geoState.accuracy, geoState.isLocked, myParticipantId, hunt?.id, supabase])

  const loadMapObjects = useCallback(async (districtId: string) => {
    const { data: mapObjects } = await supabase
      .from('map_objects')
      .select('id, name, type, position, description')
      .eq('district_id', districtId)

    if (mapObjects) {
      const parsed: StandData[] = []
      for (const obj of mapObjects) {
        const pos = parsePointHex(obj.position as string)
        if (pos) parsed.push({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          position: pos,
          description: (obj as Record<string, unknown>).description as string | null,
        })
      }
      setStands(parsed)
    }
  }, [supabase])

  const loadDistrictData = useCallback(async (districtId: string) => {
    // Reviergrenze + Name laden
    const { data: district } = await supabase
      .from('districts')
      .select('boundary, name')
      .eq('id', districtId)
      .single()

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

    const { data: parts } = await supabase.from('hunt_participants').select('*, profiles(display_name, anonymize_kills)').eq('hunt_id', params.id)
    const { data: { user } } = await supabase.auth.getUser()

    setHunt(hunt)
    setParticipants(parts || [])
    setUserId(user?.id ?? null)
    setIsJagdleiter(parts?.some(p => p.user_id === user?.id && p.role === 'jagdleiter') || false)
    setIsGruppenleiter(parts?.some(p => p.user_id === user?.id && p.tags?.includes('👥')) || false)
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
    await supabase.from('hunts').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', hunt.id)
    router.push('/app')
  }

  async function leaveHunt() {
    if (!hunt || !userId) return
    const ok = await confirmSheet({
      title: 'Jagd verlassen?',
      description: 'Du kannst später wieder beitreten, solange die Jagd läuft.',
      confirmLabel: 'Verlassen',
      confirmVariant: 'danger',
    })
    if (!ok) return
    await supabase
      .from('hunt_participants')
      .update({ status: 'left', left_at: new Date().toISOString() })
      .eq('hunt_id', hunt.id)
      .eq('user_id', userId)
    router.push('/app')
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}><p style={{ color: 'var(--text-3)' }}>Lädt...</p></div>
  if (!hunt) return null

  const pName = (p: Participant) => p.profiles?.display_name || p.guest_name || 'Unbekannt'
  const joinedParticipants = participants.filter(p => p.status === 'joined')

  const isSolo = hunt.kind === 'solo'

  const TABS: Array<{ key: 'karte' | 'chat' | 'nachsuche' | 'strecke'; label: string; icon: TabIconComponent; iconKind: 'phosphor' | 'species'; iconColor?: string }> = isSolo
    ? [
        { key: 'karte', label: 'Karte', icon: MapTrifold, iconKind: 'phosphor' },
        { key: 'nachsuche', label: 'Nachsuche', icon: WarningCircle, iconKind: 'phosphor', iconColor: 'var(--red)' },
        { key: 'strecke', label: 'Strecke', icon: RehwildIcon as TabIconComponent, iconKind: 'species' },
      ]
    : [
        { key: 'karte', label: 'Karte', icon: MapTrifold, iconKind: 'phosphor' },
        { key: 'chat', label: 'Chat', icon: ChatCircle, iconKind: 'phosphor' },
        { key: 'nachsuche', label: 'Nachsuche', icon: WarningCircle, iconKind: 'phosphor', iconColor: 'var(--red)' },
        { key: 'strecke', label: 'Strecke', icon: RehwildIcon as TabIconComponent, iconKind: 'species' },
      ]

  return (
    <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
      {/* Top Bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.push('/app?tab=jagden')} className="flex items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold flex items-center gap-1.5">
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

      {/* Jagdleiter Command Bar */}
      {showJLBar && isJagdleiter && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
          <button className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid var(--accent-primary)', background: 'var(--accent-primary)', color: '#fff', minHeight: '2.75rem' }}>
            <Megaphone size={14} />
            Treiben!
          </button>
          <button onClick={() => endHunt()} className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid var(--alert-border)', background: 'var(--alert-bg)', color: 'var(--alert-text)', minHeight: '2.75rem' }}>
            <Stop size={14} weight="fill" color="var(--red)" />
            Hahn in Ruh
          </button>
          <button className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid var(--border-default)', background: 'var(--bg-sunken)', color: 'var(--text-primary)', minHeight: '2.75rem' }}>
            <UsersThree size={14} />
            Rollen
          </button>
          <button className="flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid var(--accent-gold)', background: 'var(--bg-sunken)', color: 'var(--accent-gold)', minHeight: '2.75rem' }}>
            <Dog size={14} />
            +Nachsuche
          </button>
        </div>
      )}

      {/* Hunt Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border-light)' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
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
          {participants.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--surface-2)', border: p.role === 'jagdleiter' ? '1px solid var(--accent-gold)' : '1px solid var(--border)' }}>
              <div className="avatar-xs" style={{ background: getAvatarColor(p.id), color: '#fff' }}>{getInitials(pName(p))}</div>
              <span className="text-xs font-medium">{p.user_id === userId ? 'Du' : pName(p).split(' ')[0]}</span>
              {p.role === 'jagdleiter' && <Star size={12} weight="fill" color="var(--accent-gold)" />}
              {p.tags?.includes('gruppenleiter') && <UsersThree size={12} color="var(--text-secondary)" />}
              {p.tags?.includes('hundefuehrer') && <Dog size={12} color="var(--text-secondary)" />}
            </div>
          ))}
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Karte — NICHT unmounten beim Tab-Wechsel (display statt conditional) */}
        <div style={{ position: 'absolute', inset: 0, display: activeTab === 'karte' ? 'block' : 'none' }}>
          <MapView
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
