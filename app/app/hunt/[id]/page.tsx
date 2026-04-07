'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useHuntPositions } from '@/hooks/useHuntPositions'
import { updatePosition } from '@/lib/position-service'
import { parsePolygonHex, parsePointHex } from '@/lib/geo-utils'
import { getChatDisplayInfo } from '@/lib/chat-utils'
import type { ChatMember } from '@/lib/chat-utils'
import MapView from '@/components/hunt/MapView'
import ChatPanel from '@/components/hunt/ChatPanel'
import type { StandData } from '@/components/hunt/MapContent'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']
function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() }

type Hunt = { id: string; name: string; type: string; status: string; invite_code: string; wild_presets: string[]; started_at: string; signal_mode: string; district_id: string | null; creator_id: string }
type Participant = { id: string; user_id: string | null; guest_name: string | null; role: string; tags: string[]; status: string; stand_id: string | null; profiles: { display_name: string } | null }

type SwitcherChat = {
  groupId: string
  name: string
  emoji: string
  isDirect: boolean
  displayInitial: string | null
  avatarUrl: string | null
  unreadCount: number
  lastMessagePreview: string | null
}

export default function HuntPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const [hunt, setHunt] = useState<Hunt | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showJLBar, setShowJLBar] = useState(false)
  const initialTab = (searchParams.get('tab') as 'karte' | 'chat' | 'nachsuche' | 'strecke') || 'karte'
  const [activeTab, setActiveTab] = useState<'karte' | 'chat' | 'nachsuche' | 'strecke'>(initialTab)
  const [isJagdleiter, setIsJagdleiter] = useState(false)
  const [boundary, setBoundary] = useState<[number, number][][] | null>(null)
  const [districtName, setDistrictName] = useState<string | null>(null)
  const [stands, setStands] = useState<StandData[]>([])
  const [chatUnread, setChatUnread] = useState(0)
  const [showChatSwitcher, setShowChatSwitcher] = useState(false)
  const [switcherChats, setSwitcherChats] = useState<SwitcherChat[]>([])
  const [switcherLoaded, setSwitcherLoaded] = useState(false)

  // GPS sofort starten (auch wenn anderer Tab aktiv)
  const geoState = useGeolocation()

  // Eigene participant_id bestimmen
  const myParticipantId = useMemo(() => {
    return participants.find(p => p.user_id === userId)?.id ?? null
  }, [participants, userId])

  // Realtime-Positionen aller anderen Teilnehmer
  const otherPositions = useHuntPositions(hunt?.id ?? null, participants, userId)

  // Stand-Zuweisungen: participantId → standId
  const participantStands = useMemo(() => {
    const mapping: Record<string, string> = {}
    participants.forEach(p => {
      if (p.stand_id) mapping[p.id] = p.stand_id
    })
    return mapping
  }, [participants])

  // Eigene Position an Supabase senden (throttled in updatePosition)
  useEffect(() => {
    if (!myParticipantId || !hunt?.id || !geoState.position) return

    updatePosition(
      supabase,
      myParticipantId,
      hunt.id,
      geoState.position,
      geoState.accuracy ?? 999,
      geoState.isLocked,
    )
  }, [geoState.position, geoState.isLocked, myParticipantId, hunt?.id, supabase])

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
      const parsed = parsePolygonHex(district.boundary as string)
      if (parsed) setBoundary(parsed)
    }
    setDistrictName(district?.name ?? null)

    await loadMapObjects(districtId)
  }, [supabase, loadMapObjects])

  const loadHunt = useCallback(async () => {
    const { data: hunt } = await supabase.from('hunts').select('*').eq('id', params.id).single()
    if (!hunt) { router.push('/app?tab=jagden'); return }

    const { data: parts } = await supabase.from('hunt_participants').select('*, profiles(display_name)').eq('hunt_id', params.id)
    const { data: { user } } = await supabase.auth.getUser()

    setHunt(hunt)
    setParticipants(parts || [])
    setUserId(user?.id ?? null)
    setIsJagdleiter(parts?.some(p => p.user_id === user?.id && p.role === 'jagdleiter') || false)
    setLoading(false)

    // Revier-Daten laden (Grenze + Hochsitze)
    if (hunt.district_id) {
      loadDistrictData(hunt.district_id)
    }
  }, [supabase, params.id, router, loadDistrictData])

  useEffect(() => { loadHunt() }, [loadHunt])

  // Chat-Switcher: User-Chats laden (lazy, beim ersten Öffnen)
  const loadSwitcherChats = useCallback(async () => {
    if (switcherLoaded || !userId) return
    setSwitcherLoaded(true)

    const { data: groups } = await supabase
      .from('chat_groups')
      .select('id, name, emoji, hunt_id, avatar_url')
      .order('updated_at', { ascending: false })

    if (!groups || groups.length === 0) return

    // Jagd-eigenen Chat ausfiltern (der wird separat angezeigt)
    const otherGroups = groups.filter(g => g.hunt_id !== params.id)
    if (otherGroups.length === 0) return

    const groupIds = otherGroups.map(g => g.id)

    // Mitglieder laden (für 2er-Chat-Erkennung)
    const { data: allMembers } = await supabase
      .from('chat_group_members')
      .select('group_id, user_id, last_read_at')
      .in('group_id', groupIds)

    // Profile laden
    const allUserIds = [...new Set((allMembers || []).map(m => m.user_id))]
    const profileMap: Record<string, string> = {}
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', allUserIds)
      profiles?.forEach(p => { profileMap[p.id] = p.display_name })
    }

    const membersByGroup: Record<string, ChatMember[]> = {}
    const lastReadByGroup: Record<string, string> = {}
    allMembers?.forEach((m: any) => {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
      membersByGroup[m.group_id].push({
        user_id: m.user_id,
        display_name: profileMap[m.user_id] || 'Unbekannt',
      })
      if (m.user_id === userId) {
        lastReadByGroup[m.group_id] = m.last_read_at
      }
    })

    const items: SwitcherChat[] = []
    for (const group of otherGroups) {
      const groupMembers = membersByGroup[group.id] || []
      const displayInfo = getChatDisplayInfo(group.name, groupMembers, userId)

      // Letzte Nachricht + Unread Count
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('content, type')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .limit(1)

      let preview: string | null = null
      if (lastMsgs?.[0]) {
        const m = lastMsgs[0]
        preview = m.type === 'photo' ? '📷 Foto' : m.type === 'audio' ? '🎤 Sprachnachricht' : m.content
      }

      let unreadCount = 0
      const lastReadAt = lastReadByGroup[group.id]
      if (lastReadAt) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id)
          .gt('created_at', lastReadAt)
          .neq('sender_id', userId)
        unreadCount = count || 0
      }

      items.push({
        groupId: group.id,
        name: group.hunt_id ? `🎯 ${group.name}` : displayInfo.displayName,
        emoji: group.hunt_id ? '🎯' : group.emoji,
        isDirect: displayInfo.isDirect,
        displayInitial: displayInfo.displayInitial,
        avatarUrl: group.avatar_url,
        unreadCount,
        lastMessagePreview: preview,
      })
    }
    setSwitcherChats(items)
  }, [supabase, userId, params.id, switcherLoaded])

  const openChatSwitcher = useCallback(() => {
    loadSwitcherChats()
    setShowChatSwitcher(true)
  }, [loadSwitcherChats])

  const handleStandsChanged = useCallback((newStand?: StandData, deletedId?: string) => {
    // Optimistisches Update: sofort anzeigen ohne Refetch abzuwarten
    if (newStand) {
      setStands(prev => {
        const exists = prev.some(s => s.id === newStand.id)
        return exists ? prev.map(s => s.id === newStand.id ? newStand : s) : [...prev, newStand]
      })
    }
    if (deletedId) {
      setStands(prev => prev.filter(s => s.id !== deletedId))
    }
    // Background-Refetch für Konsistenz
    if (hunt?.district_id) {
      loadMapObjects(hunt.district_id)
    }
  }, [hunt?.district_id, loadMapObjects])

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

  async function endHunt() {
    if (!hunt || !confirm('Jagd wirklich beenden?')) return
    await supabase.from('hunts').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', hunt.id)
    router.push('/app?tab=jagden')
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}><p style={{ color: 'var(--text-3)' }}>Lädt...</p></div>
  if (!hunt) return null

  const pName = (p: Participant) => p.profiles?.display_name || p.guest_name || 'Unbekannt'
  const joinedParticipants = participants.filter(p => p.status === 'joined')

  const TABS = [
    { key: 'karte' as const, label: 'Karte', icon: '🗺️' },
    { key: 'chat' as const, label: 'Chat', icon: '💬' },
    { key: 'nachsuche' as const, label: 'Nachsuche', icon: '🔴' },
    { key: 'strecke' as const, label: 'Strecke', icon: '🦌' },
  ]

  return (
    <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Top Bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.push('/app?tab=jagden')} className="flex items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div className="flex-1 min-w-0"
          {...(activeTab === 'chat' ? {
            onClick: openChatSwitcher,
            role: 'button',
            style: { cursor: 'pointer' },
          } : {})}>
          <div className="text-sm font-bold flex items-center gap-1.5">
            <span className="live-dot" /> {hunt.name}
            {activeTab === 'chat' && (
              <span style={{ color: 'var(--text-3)', fontSize: '0.625rem', marginLeft: '0.125rem' }}>▼</span>
            )}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            {isJagdleiter ? '🎖️ Jagdleiter' : '🎯 Schütze'} · {joinedParticipants.length} Jäger aktiv
          </div>
        </div>
        <button onClick={copyInviteLink} className="flex items-center justify-center rounded-lg text-sm"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem' }}>{copied ? '✓' : '🔗'}</button>
        <button onClick={shareWhatsApp} className="flex items-center justify-center rounded-lg text-sm"
          style={{ background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)', minWidth: '2.75rem', minHeight: '2.75rem' }}>💬</button>
        {isJagdleiter && (
          <button onClick={() => setShowJLBar(!showJLBar)} className="px-2 flex items-center justify-center rounded-lg text-xs font-bold"
            style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.2)', color: 'var(--gold)', minHeight: '2.75rem' }}>🎖️</button>
        )}
      </div>

      {/* Jagdleiter Command Bar */}
      {showJLBar && isJagdleiter && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #2a2008, #1f1a06)', borderBottom: '1px solid rgba(255,215,0,0.15)' }}>
          <button className="flex items-center gap-1 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid rgba(107,159,58,0.3)', background: 'rgba(107,159,58,0.1)', color: 'var(--green-bright)', minHeight: '2.75rem' }}>
            📢 Treiben!
          </button>
          <button onClick={endHunt} className="flex items-center gap-1 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid rgba(239,83,80,0.3)', background: 'rgba(239,83,80,0.1)', color: 'var(--red)', minHeight: '2.75rem' }}>
            🔴 Hahn in Ruh
          </button>
          <button className="flex items-center gap-1 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', minHeight: '2.75rem' }}>
            👥 Rollen
          </button>
          <button className="flex items-center gap-1 px-3 rounded-lg text-xs font-semibold whitespace-nowrap"
            style={{ border: '1px solid rgba(255,143,0,0.3)', background: 'rgba(255,143,0,0.08)', color: 'var(--orange)', minHeight: '2.75rem' }}>
            🐕 +Nachsuche
          </button>
        </div>
      )}

      {/* Hunt Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--border-light)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-2.5 text-xs font-semibold text-center transition"
            style={{
              color: activeTab === tab.key ? 'var(--green-bright)' : 'var(--text-3)',
              borderBottom: activeTab === tab.key ? '2px solid var(--green)' : '2px solid transparent',
            }}>
            {tab.icon} {tab.label}
            {tab.key === 'chat' && chatUnread > 0 && (
              <span className="tab-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Teilnehmer-Chips (nur auf Karte-Tab) */}
      {activeTab === 'karte' && (
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
          {participants.map((p, i) => (
            <div key={p.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--surface-2)', border: p.role === 'jagdleiter' ? '1px solid rgba(255,215,0,0.3)' : '1px solid var(--border)' }}>
              <div className={`avatar-xs ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>{getInitials(pName(p))}</div>
              <span className="text-xs font-medium">{p.user_id === userId ? 'Du' : pName(p).split(' ')[0]}</span>
              {p.role === 'jagdleiter' && <span className="text-xs" style={{ color: 'var(--gold)' }}>🎖️</span>}
              {p.tags?.includes('gruppenleiter') && <span className="text-xs" style={{ color: 'var(--blue)' }}>👥</span>}
              {p.tags?.includes('hundefuehrer') && <span className="text-xs" style={{ color: 'var(--orange)' }}>🐕</span>}
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
            stands={stands}
            participantStands={participantStands}
            districtId={hunt.district_id}
            districtName={districtName}
            huntId={hunt.id}
            onStandsChanged={handleStandsChanged}
            onBoundaryChanged={handleBoundaryChanged}
          />
        </div>

        {/* Chat — NICHT unmounten beim Tab-Wechsel (Realtime-Subscription + Unread-Counter) */}
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
        {activeTab === 'nachsuche' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-5xl mb-4">🐕</div>
            <p className="text-lg font-bold mb-1">Nachsuche</p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Foto-Annotation + Hundeführer-Aufträge.</p>
          </div>
        )}
        {activeTab === 'strecke' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <p className="text-lg font-bold mb-1">Strecke</p>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Schnellmeldung + Teilnehmer-Filter.</p>
          </div>
        )}
      </div>

      {/* Chat-Switcher Bottom Sheet */}
      {showChatSwitcher && (
        <div
          onClick={() => setShowChatSwitcher(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '28rem',
              background: 'var(--surface)',
              borderRadius: '1rem 1rem 0 0',
              paddingBottom: 'calc(var(--safe-bottom, 0rem) + 0.75rem)',
              maxHeight: '70dvh',
              display: 'flex', flexDirection: 'column',
              animation: 'sheet-slide-up 200ms ease-out',
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div style={{ width: '2.5rem', height: '0.25rem', borderRadius: '0.125rem', background: 'var(--text-3)' }} />
            </div>

            {/* Aktueller Jagd-Chat */}
            <div
              className="flex items-center gap-3 mx-4 mb-2 px-3 py-3 rounded-xl"
              style={{ background: 'rgba(107,159,58,0.12)', border: '1px solid rgba(107,159,58,0.25)' }}
            >
              <span className="live-dot flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--green-bright)' }}>{hunt.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>Jagd-Chat · aktiv</p>
              </div>
              <span className="text-xs font-semibold" style={{ color: 'var(--green)', background: 'rgba(107,159,58,0.15)', padding: '0.25rem 0.5rem', borderRadius: '0.375rem' }}>Aktuell</span>
            </div>

            {/* Trenner */}
            <div className="mx-4 mb-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }} />
            <p className="text-xs font-semibold mx-4 mb-2 flex-shrink-0" style={{ color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>
              Deine Chats
            </p>

            {/* Chat-Liste */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {switcherChats.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm" style={{ color: 'var(--text-3)' }}>Noch keine anderen Chats</p>
                </div>
              ) : (
                switcherChats.map(chat => (
                  <button
                    key={chat.groupId}
                    onClick={() => {
                      setShowChatSwitcher(false)
                      router.push(`/app/chat/${chat.groupId}`)
                    }}
                    className="w-full flex items-center gap-3 text-left"
                    style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)' }}
                  >
                    {/* Avatar */}
                    {chat.isDirect && chat.displayInitial ? (
                      <div className="flex-shrink-0 flex items-center justify-center avatar av-1"
                        style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', fontSize: '0.875rem', fontWeight: 700 }}>
                        {chat.displayInitial}
                      </div>
                    ) : chat.avatarUrl ? (
                      <img src={chat.avatarUrl} alt=""
                        className="flex-shrink-0"
                        style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div className="flex-shrink-0 flex items-center justify-center"
                        style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', background: 'var(--surface-2)', fontSize: '1.125rem' }}>
                        {chat.emoji}
                      </div>
                    )}

                    {/* Name + Vorschau */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{chat.name}</p>
                      {chat.lastMessagePreview && (
                        <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{chat.lastMessagePreview}</p>
                      )}
                    </div>

                    {/* Unread Badge */}
                    {chat.unreadCount > 0 && (
                      <span className="flex-shrink-0 flex items-center justify-center"
                        style={{
                          minWidth: '1.25rem', height: '1.25rem', borderRadius: '0.625rem',
                          background: 'var(--green)', color: 'white',
                          fontSize: '0.6875rem', fontWeight: 700,
                          padding: '0 0.3125rem',
                        }}>
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Neue Gruppe erstellen */}
            <div className="mx-4 mt-2 flex-shrink-0">
              <button
                onClick={() => {
                  setShowChatSwitcher(false)
                  router.push('/app/chat/create')
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--green-bright)' }}
              >
                + Neue Gruppe erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
