'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { usePrefetchChats } from '@/hooks/usePrefetchChats'
import SwipeToAction from '@/components/ui/swipe-to-action'
import { getChatDisplayInfo } from '@/lib/chat-utils'
import { Search, Plus } from 'lucide-react'
import type { ChatMember } from '@/lib/chat-utils'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

// === Zeitformat wie WhatsApp ===
function formatChatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (msgDay.getTime() === today.getTime()) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  if (msgDay.getTime() === yesterday.getTime()) {
    return 'Gestern'
  }
  // Innerhalb der letzten 7 Tage: Wochentag
  const diffDays = (today.getTime() - msgDay.getTime()) / 86400000
  if (diffDays < 7) {
    return date.toLocaleDateString('de-DE', { weekday: 'short' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

type Hunt = {
  id: string
  name: string
  type: string
  status: string
  invite_code: string
  started_at: string
  ended_at: string | null
  created_at: string
  creator_id: string
  myRole: string
}

type ChatGroup = {
  id: string
  name: string
  emoji: string
  hunt_id: string | null
  created_by: string
  updated_at: string
  avatar_url: string | null
}

type ChatListItem = {
  id: string
  groupId: string
  name: string
  emoji: string
  isHuntChat: boolean
  huntId: string | null
  huntStatus: string | null
  createdBy: string
  lastMessage: string | null
  lastMessageSender: string | null
  lastMessageTime: string | null
  unreadCount: number
  isDirect: boolean
  displayInitial: string | null
  avatarUrl: string | null
}

type Props = {
  displayName: string
  initialHunts: Hunt[]
  userId: string
}

export default function HomeContent({ displayName, initialHunts, userId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  // Tab direkt aus URL-Parameter ableiten, localStorage als Fallback beim ersten Laden
  const tabParam = searchParams.get('tab')
  const activeTab: 'jagden' | 'chats' = tabParam === 'jagden' ? 'jagden' : tabParam === 'chats' ? 'chats'
    : (typeof window !== 'undefined' && localStorage.getItem('quickhunt:lastTab') === 'jagden' ? 'jagden' : 'chats')

  // Letzten Tab in localStorage speichern
  useEffect(() => {
    if (tabParam === 'jagden' || tabParam === 'chats') {
      localStorage.setItem('quickhunt:lastTab', tabParam)
    }
  }, [tabParam])

  // Beim ersten Laden ohne ?tab= → auf gespeicherten Tab redirecten
  useEffect(() => {
    if (!tabParam) {
      const saved = localStorage.getItem('quickhunt:lastTab')
      if (saved === 'jagden') {
        router.replace('/app?tab=jagden', { scroll: false })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [chatItems, setChatItems] = useState<ChatListItem[]>([])
  const [loadingChats, setLoadingChats] = useState(false)

  // Suche + Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [chatFilter, setChatFilter] = useState<'alle' | 'ungelesen' | 'gruppen' | 'direkt'>('alle')
  const [jagdFilter, setJagdFilter] = useState<'alle' | 'live' | 'geplant' | 'vergangen'>('alle')

  // Suche beim Tab-Wechsel zurücksetzen
  const prevTabRef = useRef(activeTab)
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      setSearchQuery('')
      prevTabRef.current = activeTab
    }
  }, [activeTab])

  const { showBanner: showPushBanner, subscribe: subscribePush, dismiss: dismissPush } = usePushNotifications(supabase, userId)

  // Chat-Nachrichten vorladen sobald Chat-Liste da ist
  const prefetchGroupIds = useMemo(() => chatItems.map(c => c.groupId), [chatItems])
  usePrefetchChats(supabase, prefetchGroupIds)

  // Swipe-to-Delete State
  const [hunts, setHunts] = useState(initialHunts)
  const [confirmDialog, setConfirmDialog] = useState<{
    type: 'delete-hunt' | 'delete-group' | 'leave-group'
    id: string
    name: string
  } | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const activeCloseRef = useRef<(() => void) | null>(null)

  // Client-seitiges Nachladen der Jagden (Server-Cache kann veraltet sein)
  const loadHunts = useCallback(async () => {
    const { data: myParticipations } = await supabase
      .from('hunt_participants')
      .select(`
        hunt_id, role,
        hunts (id, name, type, status, invite_code, started_at, ended_at, created_at, creator_id)
      `)
      .eq('user_id', userId)
      .eq('status', 'joined')
      .order('created_at', { ascending: false })
      .limit(10)

    if (myParticipations) {
      const freshHunts = myParticipations
        .filter((p: any) => p.hunts)
        .map((p: any) => ({ ...p.hunts, myRole: p.role }))
      setHunts(freshHunts)
    }
  }, [supabase, userId])

  useEffect(() => { loadHunts() }, [loadHunts])

  const activeHunts = hunts.filter(h => h.status === 'active')
  const pastHunts = hunts.filter(h => h.status === 'completed').slice(0, 3)

  // Gefilterte Jagd-Liste
  const filteredHunts = useMemo(() => {
    let list = hunts
    // Suche
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(h => h.name.toLowerCase().includes(q))
    } else {
      // Filter-Pills nur wenn keine Suche aktiv
      if (jagdFilter === 'live') list = list.filter(h => h.status === 'active')
      else if (jagdFilter === 'geplant') list = list.filter(h => h.status === 'planned')
      else if (jagdFilter === 'vergangen') list = list.filter(h => h.status === 'completed')
    }
    // Live-Jagden immer oben
    return list.sort((a, b) => {
      const aLive = a.status === 'active'
      const bLive = b.status === 'active'
      if (aLive && !bLive) return -1
      if (!aLive && bLive) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [hunts, searchQuery, jagdFilter])

  // Gefilterte Chat-Liste
  const filteredChats = useMemo(() => {
    let list = chatItems
    // Suche
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
      )
    } else {
      // Filter-Pills nur wenn keine Suche aktiv
      if (chatFilter === 'ungelesen') list = list.filter(c => c.unreadCount > 0)
      else if (chatFilter === 'gruppen') list = list.filter(c => !c.isDirect)
      else if (chatFilter === 'direkt') list = list.filter(c => c.isDirect)
    }
    return list
  }, [chatItems, searchQuery, chatFilter])

  // Schließe offene Swipe-Action wenn woanders getippt wird
  const closeActiveSwipe = useCallback(() => {
    if (activeCloseRef.current) {
      activeCloseRef.current()
      activeCloseRef.current = null
    }
  }, [])

  // Jagd löschen
  const handleDeleteHunt = useCallback(async (huntId: string) => {
    setConfirmDialog(null)
    setRemovingId(huntId)
    // Warte auf Remove-Animation
    await new Promise(r => setTimeout(r, 300))
    const { error } = await supabase.from('hunts').delete().eq('id', huntId)
    if (!error) {
      setHunts(prev => prev.filter(h => h.id !== huntId))
    }
    setRemovingId(null)
  }, [supabase])

  // Chat-Gruppe löschen
  const handleDeleteGroup = useCallback(async (groupId: string) => {
    setConfirmDialog(null)
    setRemovingId(groupId)
    await new Promise(r => setTimeout(r, 300))
    const { error } = await supabase.from('chat_groups').delete().eq('id', groupId)
    if (!error) {
      setChatItems(prev => prev.filter(c => c.groupId !== groupId))
    }
    setRemovingId(null)
  }, [supabase])

  // Chat-Gruppe verlassen
  const handleLeaveGroup = useCallback(async (groupId: string) => {
    setConfirmDialog(null)
    setRemovingId(groupId)
    await new Promise(r => setTimeout(r, 300))
    const { error } = await supabase
      .from('chat_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)
    if (!error) {
      setChatItems(prev => prev.filter(c => c.groupId !== groupId))
    }
    setRemovingId(null)
  }, [supabase, userId])

  // Chat-Liste laden
  const loadChats = useCallback(async () => {
    setLoadingChats(true)

    // Meine Gruppen laden
    const { data: groups } = await supabase
      .from('chat_groups')
      .select('*')
      .order('updated_at', { ascending: false })

    if (!groups || groups.length === 0) {
      setChatItems([])
      setLoadingChats(false)
      return
    }

    const groupIds = groups.map(g => g.id)

    // Hunt-Status für Jagd-Chats laden
    const huntIds = groups.filter(g => g.hunt_id).map(g => g.hunt_id!)
    const huntStatusMap: Record<string, string> = {}
    if (huntIds.length > 0) {
      const { data: huntData } = await supabase
        .from('hunts')
        .select('id, status')
        .in('id', huntIds)
      huntData?.forEach(h => { huntStatusMap[h.id] = h.status })
    }

    // Meine Mitgliedschaften laden (für last_read_at)
    const { data: memberships } = await supabase
      .from('chat_group_members')
      .select('group_id, last_read_at')
      .eq('user_id', userId)
      .in('group_id', groupIds)

    const membershipMap: Record<string, string> = {}
    memberships?.forEach(m => { membershipMap[m.group_id] = m.last_read_at })

    // Alle Mitglieder aller Gruppen batch-laden (für 2er-Chat-Erkennung)
    const { data: allMembers } = await supabase
      .from('chat_group_members')
      .select('group_id, user_id')
      .in('group_id', groupIds)

    // Profile separat laden (umgeht FK-Join-Probleme bei fehlender Profiles-RLS)
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
    allMembers?.forEach((m: any) => {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
      membersByGroup[m.group_id].push({
        user_id: m.user_id,
        display_name: profileMap[m.user_id] || 'Unbekannt',
      })
    })

    // Letzte Nachricht pro Gruppe laden
    const items: ChatListItem[] = []
    for (const group of groups) {
      // Letzte Nachricht
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('content, type, created_at, sender_id, participant_id')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false })
        .limit(1)

      const lastMsg = lastMsgs?.[0]
      let lastMessageSender: string | null = null

      if (lastMsg?.sender_id && lastMsg.sender_id !== userId) {
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', lastMsg.sender_id)
          .single()
        lastMessageSender = senderProfile?.display_name?.split(' ')[0] || null
      }

      // Ungelesen zählen
      let unreadCount = 0
      const lastReadAt = membershipMap[group.id]
      if (lastReadAt && lastMsg) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', group.id)
          .gt('created_at', lastReadAt)
          .neq('sender_id', userId)

        unreadCount = count || 0
      }

      let msgPreview: string | null = null
      if (lastMsg) {
        if (lastMsg.type === 'photo') msgPreview = '📷 Foto'
        else if (lastMsg.type === 'audio') msgPreview = '🎤 Sprachnachricht'
        else msgPreview = lastMsg.content
      }

      // 2er-Chat-Erkennung
      const groupMembers = membersByGroup[group.id] || []
      const displayInfo = getChatDisplayInfo(group.name, groupMembers, userId)

      items.push({
        id: group.id,
        groupId: group.id,
        name: group.hunt_id ? `🎯 ${group.name}` : displayInfo.displayName,
        emoji: group.hunt_id ? '🎯' : group.emoji,
        isHuntChat: !!group.hunt_id,
        huntId: group.hunt_id,
        huntStatus: group.hunt_id ? (huntStatusMap[group.hunt_id] || null) : null,
        createdBy: group.created_by,
        lastMessage: msgPreview,
        lastMessageSender,
        lastMessageTime: lastMsg?.created_at || group.updated_at,
        unreadCount,
        isDirect: displayInfo.isDirect,
        displayInitial: displayInfo.displayInitial,
        avatarUrl: group.avatar_url,
      })
    }

    // Sortierung: aktive Jagd-Chats gepinnt oben, Rest nach letzter Nachricht
    items.sort((a, b) => {
      const aLive = a.isHuntChat && a.huntStatus === 'active'
      const bLive = b.isHuntChat && b.huntStatus === 'active'
      if (aLive && !bLive) return -1
      if (!aLive && bLive) return 1
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0
      return timeB - timeA
    })

    setChatItems(items)
    setLoadingChats(false)
  }, [supabase, userId])

  // App-Badge zurücksetzen wenn Home geladen wird
  useEffect(() => {
    if ('clearAppBadge' in navigator) {
      (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
    }
  }, [])

  // Chats immer beim Mount laden (nicht erst beim Tab-Wechsel)
  useEffect(() => {
    loadChats()
  }, [loadChats])

  function getChatHref(item: ChatListItem) {
    if (item.isHuntChat && item.huntId) {
      return `/app/hunt/${item.huntId}?tab=chat`
    }
    return `/app/chat/${item.groupId}`
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: '0.75rem 1.25rem 0.625rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03rem', color: 'var(--text)' }}>
          {activeTab === 'jagden' ? 'Jagden' : 'Chats'}
        </h1>
        <Link
          href={activeTab === 'jagden' ? '/app/hunt/create' : '/app/chat/create'}
          className="flex items-center justify-center"
          style={{
            width: '2.5rem', height: '2.5rem', borderRadius: '50%',
            background: 'var(--surface-2)',
            color: 'var(--green-bright)',
          }}
        >
          <Plus size={22} strokeWidth={2.5} />
        </Link>
      </div>

      {/* Push-Benachrichtigungen Banner */}
      {showPushBanner && (
        <div className="mx-5 mb-3 flex items-center gap-2.5 p-3 rounded-xl"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1.25rem' }}>🔔</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Benachrichtigungen aktivieren?</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Damit du keine Nachrichten verpasst.</p>
          </div>
          <button onClick={subscribePush}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg flex-shrink-0"
            style={{ background: 'var(--green)', color: 'white' }}>
            Ja
          </button>
          <button onClick={dismissPush}
            className="px-2 py-1.5 text-xs rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-3)' }}>
            Später
          </button>
        </div>
      )}

      {/* Suchleiste */}
      <div className="px-5 mb-3">
        <div className="flex items-center gap-2" style={{
          background: 'var(--surface-2)',
          borderRadius: '9999px',
          padding: '0 0.875rem',
          height: '2.5rem',
          border: '1px solid var(--border)',
        }}>
          <Search size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Suchen"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '0.875rem',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Filter-Pills */}
      <div className="px-5 mb-3" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
          {activeTab === 'chats' ? (
            (['alle', 'ungelesen', 'gruppen', 'direkt'] as const).map(f => (
              <button
                key={f}
                onClick={() => setChatFilter(f)}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: '9999px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: chatFilter === f ? 'var(--green)' : 'transparent',
                  color: chatFilter === f ? 'white' : 'var(--text-2)',
                  border: chatFilter === f ? 'none' : '1px solid var(--border)',
                  opacity: searchQuery ? 0.5 : 1,
                  pointerEvents: searchQuery ? 'none' : 'auto',
                  minHeight: '2.25rem',
                }}
              >
                {f === 'alle' ? 'Alle' : f === 'ungelesen' ? 'Ungelesen' : f === 'gruppen' ? 'Gruppen' : 'Direkt'}
              </button>
            ))
          ) : (
            (['alle', 'live', 'geplant', 'vergangen'] as const).map(f => (
              <button
                key={f}
                onClick={() => setJagdFilter(f)}
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: '9999px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: jagdFilter === f ? 'var(--green)' : 'transparent',
                  color: jagdFilter === f ? 'white' : 'var(--text-2)',
                  border: jagdFilter === f ? 'none' : '1px solid var(--border)',
                  opacity: searchQuery ? 0.5 : 1,
                  pointerEvents: searchQuery ? 'none' : 'auto',
                  minHeight: '2.25rem',
                }}
              >
                {f === 'alle' ? 'Alle' : f === 'live' ? 'Live' : f === 'geplant' ? 'Geplant' : 'Vergangen'}
              </button>
            ))
          )}
        </div>
      </div>

      {/* === JAGDEN TAB === */}
      <div className="flex-1 flex flex-col" style={{ display: activeTab === 'jagden' ? undefined : 'none' }}>
          {filteredHunts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
              <p className="text-3xl mb-3">🌲</p>
              <p className="font-semibold mb-1">{searchQuery ? 'Keine Treffer' : 'Noch keine Jagden'}</p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                {searchQuery ? 'Versuch einen anderen Suchbegriff.' : 'Starte deine erste Jagd oder tritt per Link bei.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 space-y-2.5">
                {filteredHunts.map((hunt) => {
                  const isOwner = hunt.creator_id === userId
                  const isLive = hunt.status === 'active'
                  return (
                    <div
                      key={hunt.id}
                      className={removingId === hunt.id ? 'swipe-removing' : ''}
                    >
                      <SwipeToAction
                        actionIcon="🗑️"
                        actionColor="var(--red)"
                        disabled={!isOwner}
                        onAction={() => setConfirmDialog({ type: 'delete-hunt', id: hunt.id, name: hunt.name })}
                        onSwipeOpen={(closeFn) => {
                          closeActiveSwipe()
                          activeCloseRef.current = closeFn
                        }}
                      >
                        <Link href={`/app/hunt/${hunt.id}`}
                          className="block rounded-2xl p-3.5" style={{
                            background: isLive ? 'rgba(107,159,58,0.08)' : 'var(--surface)',
                            border: isLive ? '1px solid rgba(107,159,58,0.25)' : '1px solid var(--border)',
                          }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold">{hunt.name}</span>
                            {isLive ? (
                              <span className="badge badge-live"><span className="live-dot mr-1" /> Live</span>
                            ) : hunt.status === 'completed' ? (
                              <span className="badge badge-done">
                                {hunt.ended_at ? new Date(hunt.ended_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : 'Beendet'}
                              </span>
                            ) : (
                              <span className="badge" style={{ background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}>Geplant</span>
                            )}
                          </div>
                          <div className="flex gap-3.5 text-xs" style={{ color: 'var(--text-2)' }}>
                            {isLive && hunt.started_at && (
                              <span>🕐 Seit {new Date(hunt.started_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            <span>{hunt.myRole === 'jagdleiter' ? '🎖️ Jagdleiter' : '🎯 Schütze'}</span>
                          </div>
                        </Link>
                      </SwipeToAction>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
      </div>

      {/* === CHATS TAB === */}
      <div className="flex-1 flex flex-col relative" style={{ display: activeTab === 'chats' ? undefined : 'none' }}>
          {loadingChats ? (
            <div className="flex-1 flex items-center justify-center">
              <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Chats laden...</p>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
              <p className="text-3xl mb-3">💬</p>
              <p className="font-semibold mb-1">{searchQuery || chatFilter !== 'alle' ? 'Keine Treffer' : 'Noch keine Chats'}</p>
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>
                {searchQuery ? 'Versuch einen anderen Suchbegriff.' : chatFilter !== 'alle' ? 'Kein Chat passt zum Filter.' : 'Erstelle eine Gruppe oder starte eine Jagd — der Chat kommt automatisch.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {filteredChats.map(item => {
                const isOwner = item.createdBy === userId
                const isSwipeable = !item.isHuntChat
                const swipeAction = isOwner ? 'delete-group' : 'leave-group'
                const swipeIcon = isOwner ? '🗑️' : '🚪'
                const swipeColor = isOwner ? 'var(--red)' : 'var(--orange)'

                const isLiveHunt = item.isHuntChat && item.huntStatus === 'active'

                const chatRow = (
                  <Link
                    href={getChatHref(item)}
                    prefetch={true}
                    className="w-full flex items-center gap-3 text-left"
                    style={{
                      padding: '0.875rem 1.25rem',
                      borderBottom: '1px solid var(--border-light)',
                      display: 'flex',
                      textDecoration: 'none',
                      color: 'inherit',
                      ...(isLiveHunt ? { background: 'rgba(107,159,58,0.06)' } : {}),
                    }}
                  >
                    {/* Avatar: 2er-Chat → Initial, Gruppen-Avatar → Bild, sonst Emoji */}
                    {item.isDirect && item.displayInitial ? (
                      <div className="flex-shrink-0 flex items-center justify-center avatar av-1"
                        style={{
                          width: '2.625rem', height: '2.625rem', borderRadius: '50%',
                          fontSize: '0.9375rem', fontWeight: 700,
                        }}>
                        {item.displayInitial}
                      </div>
                    ) : item.avatarUrl ? (
                      <img src={item.avatarUrl} alt=""
                        className="flex-shrink-0"
                        style={{
                          width: '2.625rem', height: '2.625rem', borderRadius: '50%',
                          objectFit: 'cover',
                        }} />
                    ) : (
                      <div className="flex-shrink-0 flex items-center justify-center"
                        style={{
                          width: '2.625rem', height: '2.625rem', borderRadius: '50%',
                          background: 'var(--surface-2)', fontSize: '1.25rem',
                        }}>
                        {item.emoji}
                      </div>
                    )}

                    {/* Name + letzte Nachricht */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate flex items-center gap-1.5" style={{ fontSize: '0.9375rem' }}>
                          {item.isHuntChat ? item.name.replace('🎯 ', '') : item.name}
                          {item.isHuntChat && item.huntStatus === 'active' && (
                            <span className="badge badge-live" style={{ fontSize: '0.5625rem', padding: '0.0625rem 0.375rem' }}>
                              <span className="live-dot mr-1" style={{ width: '0.375rem', height: '0.375rem' }} />Live
                            </span>
                          )}
                        </span>
                        {item.lastMessageTime && (
                          <span className="text-xs flex-shrink-0 ml-2"
                            style={{ color: item.unreadCount > 0 ? 'var(--green-bright)' : 'var(--text-3)', fontSize: '0.6875rem' }}>
                            {formatChatTime(item.lastMessageTime)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-sm truncate" style={{ color: 'var(--text-3)', fontSize: '0.8125rem', maxWidth: '80%' }}>
                          {item.lastMessage
                            ? (item.lastMessageSender && !item.isDirect ? `${item.lastMessageSender}: ${item.lastMessage}` : item.lastMessage)
                            : 'Noch keine Nachrichten'}
                        </p>
                        {item.unreadCount > 0 && (
                          <span className="flex-shrink-0 flex items-center justify-center"
                            style={{
                              minWidth: '1.25rem', height: '1.25rem', borderRadius: '0.625rem',
                              background: 'var(--green)', color: 'white',
                              fontSize: '0.6875rem', fontWeight: 700,
                              padding: '0 0.3125rem',
                            }}>
                            {item.unreadCount > 99 ? '99+' : item.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )

                return (
                  <div
                    key={item.id}
                    className={removingId === item.groupId ? 'swipe-removing' : ''}
                  >
                    <SwipeToAction
                      actionIcon={swipeIcon}
                      actionColor={swipeColor}
                      disabled={!isSwipeable}
                      onAction={() => setConfirmDialog({
                        type: swipeAction as 'delete-group' | 'leave-group',
                        id: item.groupId,
                        name: item.name,
                      })}
                      onSwipeOpen={(closeFn) => {
                        closeActiveSwipe()
                        activeCloseRef.current = closeFn
                      }}
                    >
                      {chatRow}
                    </SwipeToAction>
                  </div>
                )
              })}
            </div>
          )}

      </div>

      {/* Bestätigungs-Dialog */}
      {confirmDialog && (
        <div
          onClick={() => setConfirmDialog(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '1.25rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '24rem',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius)',
              padding: '1.5rem',
              marginBottom: 'calc(var(--safe-bottom) + 0.5rem)',
            }}
          >
            <p className="text-base font-bold mb-1">
              {confirmDialog.type === 'leave-group' ? 'Gruppe verlassen?' : 'Löschen?'}
            </p>
            <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
              {confirmDialog.type === 'leave-group'
                ? `„${confirmDialog.name}" verlassen? Du kannst erneut eingeladen werden.`
                : confirmDialog.type === 'delete-hunt'
                  ? `Jagd „${confirmDialog.name}" unwiderruflich löschen? Der Jagd-Chat wird ebenfalls gelöscht.`
                  : `Gruppe „${confirmDialog.name}" unwiderruflich löschen? Alle Nachrichten gehen verloren.`
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-3 text-sm font-semibold rounded-xl"
                style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.type === 'delete-hunt') handleDeleteHunt(confirmDialog.id)
                  else if (confirmDialog.type === 'delete-group') handleDeleteGroup(confirmDialog.id)
                  else handleLeaveGroup(confirmDialog.id)
                }}
                className="flex-1 py-3 text-sm font-bold rounded-xl"
                style={{
                  background: confirmDialog.type === 'leave-group' ? 'var(--orange)' : 'var(--red)',
                  color: 'white',
                }}
              >
                {confirmDialog.type === 'leave-group' ? 'Verlassen' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
