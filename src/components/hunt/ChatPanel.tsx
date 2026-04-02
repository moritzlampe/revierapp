'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useChatCache } from '@/contexts/ChatCacheContext'
import SwipeToAction from '@/components/ui/swipe-to-action'

// === Types ===

type Message = {
  id: string
  hunt_id: string | null
  group_id: string | null
  participant_id: string | null
  sender_id: string | null
  type: string
  content: string | null
  media_url: string | null
  created_at: string
}

type Participant = {
  id: string
  user_id: string | null
  guest_name: string | null
  role: string
  tags: string[]
  status: string
  profiles: { display_name: string } | null
}

type Props = {
  huntId?: string
  groupId?: string
  chatName?: string
  isDirect?: boolean
  participants?: Participant[]
  userId: string | null
  myParticipantId?: string | null
  supabase: SupabaseClient
  isActive: boolean
  onUnreadChange: (count: number) => void
  /** Wenn true, darf der User ALLE Nachrichten löschen (Gruppen-/Jagd-Ersteller) */
  canDeleteAll?: boolean
}

// === Konstanten ===

const SENDER_COLORS = ['#8BC34A', '#42A5F5', '#FF8F00', '#EF5350', '#AB47BC', '#26A69A', '#FF7043', '#5C6BC0']
const PAGE_SIZE = 20
const SCROLL_THRESHOLD = 100
const SYSTEM_TYPES = ['signal', 'kill_report', 'tracking']

// === Hilfsfunktionen ===

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function formatDateSeparator(dateStr: string) {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Heute'
  if (date.toDateString() === yesterday.toDateString()) return 'Gestern'
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function needsDateSeparator(msg: Message, prevMsg: Message | null) {
  if (!prevMsg) return true
  return new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString()
}

async function compressImage(file: File, maxWidth = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas nicht verfügbar')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('Komprimierung fehlgeschlagen')) },
        'image/jpeg',
        0.8
      )
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
    img.src = URL.createObjectURL(file)
  })
}

// Push-Notification senden (fire-and-forget)
function sendPushNotification(params: {
  huntId?: string
  groupId?: string
  title: string
  body: string
  senderUserId: string
  url: string
}) {
  fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).catch(() => {}) // Fehler ignorieren — Push ist best-effort
}

// === Komponente ===

export default function ChatPanel({ huntId, groupId, chatName, isDirect = false, participants = [], userId, myParticipantId, supabase, isActive, onUnreadChange, canDeleteAll = false }: Props) {
  // Gruppenchat-Modus: Mitglieder als "Participants" laden
  const [groupMembers, setGroupMembers] = useState<Record<string, { name: string; colorIndex: number }>>({})
  const isGroupChat = !!groupId && !huntId
  const channelId = huntId || groupId || 'none'
  const chatCache = useChatCache()
  const cachedEntry = chatCache.get(channelId)
  const [messages, setMessages] = useState<Message[]>(cachedEntry?.messages || [])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(!cachedEntry)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showNewPill, setShowNewPill] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)
  const [removingMsgId, setRemovingMsgId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const activeSwipeCloseRef = useRef<(() => void) | null>(null)

  // Refs für stabile Subscription-Callbacks
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isAtBottomRef = useRef(true)
  const isActiveRef = useRef(isActive)
  const unreadRef = useRef(0)
  const onUnreadChangeRef = useRef(onUnreadChange)
  const participantsRef = useRef(participants)
  const userIdRef = useRef(userId)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastScrollTopRef = useRef(0)

  useEffect(() => { isActiveRef.current = isActive }, [isActive])
  useEffect(() => { onUnreadChangeRef.current = onUnreadChange }, [onUnreadChange])
  useEffect(() => { participantsRef.current = participants }, [participants])
  useEffect(() => { userIdRef.current = userId }, [userId])

  // Mobile Keyboard: Auto-Scroll wenn Tastatur aufgeht
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let prevHeight = vv.height
    const handleResize = () => {
      const shrunk = vv.height < prevHeight - 50
      prevHeight = vv.height
      if (shrunk && isAtBottomRef.current) {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      }
    }
    vv.addEventListener('resize', handleResize)
    return () => vv.removeEventListener('resize', handleResize)
  }, [])

  // Gruppenchat: Mitglieder-Profile laden
  useEffect(() => {
    if (!isGroupChat || !groupId) return
    let cancelled = false
    async function loadMembers() {
      const { data } = await supabase
        .from('chat_group_members')
        .select('user_id, profiles:user_id(display_name)')
        .eq('group_id', groupId)
      if (cancelled || !data) return
      const map: Record<string, { name: string; colorIndex: number }> = {}
      data.forEach((m: any, i: number) => {
        map[m.user_id] = {
          name: m.profiles?.display_name || 'Unbekannt',
          colorIndex: i % SENDER_COLORS.length,
        }
      })
      setGroupMembers(map)
    }
    loadMembers()
    return () => { cancelled = true }
  }, [isGroupChat, groupId, supabase])

  // Teilnehmer-Lookup: id → { name, colorIndex }
  const participantMap = useMemo(() => {
    if (isGroupChat) return groupMembers
    const map: Record<string, { name: string; colorIndex: number }> = {}
    participants.forEach((p, i) => {
      map[p.id] = {
        name: p.profiles?.display_name || p.guest_name || 'Unbekannt',
        colorIndex: i % SENDER_COLORS.length,
      }
    })
    return map
  }, [participants, isGroupChat, groupMembers])

  // Eigener Anzeigename (für Push-Notification Body)
  const mySenderName = useMemo(() => {
    if (!userId) return undefined
    if (isGroupChat) return participantMap[userId]?.name
    const p = participants.find(p => p.user_id === userId)
    return p ? participantMap[p.id]?.name : undefined
  }, [userId, isGroupChat, participantMap, participants])

  // Prüft ob Nachricht vom aktuellen User ist
  const isMyMessage = useCallback((msg: Message) => {
    if (isGroupChat) return msg.sender_id === userId
    const p = participants.find(p => p.id === msg.participant_id)
    return p?.user_id === userId
  }, [participants, userId, isGroupChat])

  // Kann diese Nachricht gelöscht werden?
  const canDeleteMessage = useCallback((msg: Message) => {
    if (isMyMessage(msg)) return true
    return canDeleteAll
  }, [isMyMessage, canDeleteAll])

  // Aktiven Swipe schließen
  const closeActiveSwipe = useCallback(() => {
    if (activeSwipeCloseRef.current) {
      activeSwipeCloseRef.current()
      activeSwipeCloseRef.current = null
    }
  }, [])

  // Nachricht löschen
  const handleDeleteMessage = useCallback(async (msgId: string) => {
    setConfirmDeleteId(null)
    setRemovingMsgId(msgId)
    await new Promise(r => setTimeout(r, 300))

    const { error } = await supabase.from('messages').delete().eq('id', msgId)
    if (error) {
      console.error('Nachricht löschen fehlgeschlagen:', error)
    } else {
      setMessages(prev => {
        const updated = prev.filter(m => m.id !== msgId)
        chatCache.set(channelId, updated)
        return updated
      })
    }
    setRemovingMsgId(null)
  }, [supabase, chatCache, channelId])

  // Scroll-Helpers
  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView(smooth ? { behavior: 'smooth' } : undefined)
    setShowNewPill(false)
  }, [])

  const checkIsAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD
  }, [])

  // === Nachrichten laden (mit Cache) ===

  useEffect(() => {
    let cancelled = false
    const cached = chatCache.get(channelId)

    async function load() {
      if (cached && cached.messages.length > 0) {
        // Cache vorhanden → nur neue Nachrichten nachladen
        let query = supabase
          .from('messages')
          .select('*')
          .gt('created_at', cached.lastFetchedAt)
          .order('created_at', { ascending: true })

        if (huntId) query = query.eq('hunt_id', huntId)
        else if (groupId) query = query.eq('group_id', groupId)
        else return

        const { data } = await query
        if (cancelled) return

        if (data && data.length > 0) {
          setMessages(prev => {
            const ids = new Set(prev.map(m => m.id))
            const newMsgs = data.filter(m => !ids.has(m.id))
            const merged = [...prev, ...newMsgs]
            chatCache.set(channelId, merged)
            return merged
          })
        }
        setLoading(false)
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
      } else {
        // Kein Cache → komplett laden
        let query = supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE)

        if (huntId) query = query.eq('hunt_id', huntId)
        else if (groupId) query = query.eq('group_id', groupId)
        else return

        const { data } = await query
        if (cancelled) return

        if (data) {
          const sorted = data.reverse()
          setMessages(sorted)
          setHasMore(data.length === PAGE_SIZE)
          chatCache.set(channelId, sorted)
        }
        setLoading(false)
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
      }
    }

    // Bei Cache sofort nach unten scrollen
    if (cached && cached.messages.length > 0) {
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
    }

    load()
    return () => { cancelled = true }
  }, [supabase, huntId, groupId, channelId, chatCache])

  // === Realtime Subscription (stabil, nur huntId-abhängig) ===

  useEffect(() => {
    const filterCol = huntId ? 'hunt_id' : 'group_id'
    const filterVal = huntId || groupId
    if (!filterVal) return

    const channel = supabase
      .channel(`chat-${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `${filterCol}=eq.${filterVal}`,
      }, (payload) => {
        const msg = payload.new as Message

        setMessages(prev => {
          // Duplikat vermeiden (optimistisches Update)
          if (prev.some(m => m.id === msg.id)) return prev
          const updated = [...prev, msg]
          chatCache.set(channelId, updated)
          return updated
        })

        // Auto-Scroll oder Pill anzeigen
        if (isAtBottomRef.current) {
          requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
        } else {
          // Prüfen ob die Nachricht von jemand anderem ist
          const isFromOther = isGroupChat
            ? msg.sender_id !== userIdRef.current
            : (() => { const p = participantsRef.current.find(p => p.id === msg.participant_id); return p?.user_id !== userIdRef.current })()
          if (isFromOther) setShowNewPill(true)
        }

        // Ungelesen-Zähler
        if (!isActiveRef.current) {
          const isFromOther = isGroupChat
            ? msg.sender_id !== userIdRef.current
            : (() => { const p = participantsRef.current.find(p => p.id === msg.participant_id); return p?.user_id !== userIdRef.current })()
          if (isFromOther) {
            unreadRef.current += 1
            onUnreadChangeRef.current(unreadRef.current)
          }
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `${filterCol}=eq.${filterVal}`,
      }, (payload) => {
        const deletedId = (payload.old as { id: string }).id
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== deletedId)
          chatCache.set(channelId, updated)
          return updated
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, channelId, huntId, groupId, isGroupChat, chatCache])

  // Ungelesen zurücksetzen + Badge löschen wenn Tab aktiv wird
  useEffect(() => {
    if (isActive) {
      if (unreadRef.current > 0) {
        unreadRef.current = 0
        onUnreadChange(0)
      }
      // App-Badge zurücksetzen
      if ('clearAppBadge' in navigator) {
        (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {})
      }
    }
  }, [isActive, onUnreadChange])

  // === Ältere Nachrichten laden (Pagination) ===

  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)

    const el = scrollRef.current
    const prevHeight = el?.scrollHeight ?? 0

    // Älteste Nachricht im State finden
    let oldestCreatedAt: string | null = null
    setMessages(prev => {
      if (prev.length > 0) oldestCreatedAt = prev[0].created_at
      return prev
    })

    if (!oldestCreatedAt) { setLoadingMore(false); return }

    let query = supabase
      .from('messages')
      .select('*')
      .lt('created_at', oldestCreatedAt)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (huntId) query = query.eq('hunt_id', huntId)
    else if (groupId) query = query.eq('group_id', groupId)

    const { data } = await query

    if (data && data.length > 0) {
      setMessages(prev => [...data.reverse(), ...prev])
      setHasMore(data.length === PAGE_SIZE)
      // Scroll-Position beibehalten
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight
      })
    } else {
      setHasMore(false)
    }
    setLoadingMore(false)
  }, [supabase, huntId, groupId, loadingMore, hasMore])

  // Scroll-Handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // Keyboard schließen beim Hochscrollen
    const scrollingUp = el.scrollTop < lastScrollTopRef.current - 10
    lastScrollTopRef.current = el.scrollTop
    isAtBottomRef.current = checkIsAtBottom()
    if (isAtBottomRef.current) setShowNewPill(false)
    // Ältere Nachrichten laden wenn ganz oben
    if (el.scrollTop < 50 && hasMore && !loadingMore) {
      loadOlder()
    }
    if (scrollingUp && document.activeElement === inputRef.current) {
      inputRef.current?.blur()
    }
  }, [checkIsAtBottom, hasMore, loadingMore, loadOlder])

  // === Nachricht senden ===

  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    // Jagd-Chat braucht participantId, Gruppenchat braucht userId
    if (!isGroupChat && !myParticipantId) return
    if (isGroupChat && !userId) return

    const msgId = crypto.randomUUID()
    const optimistic: Message = {
      id: msgId,
      hunt_id: huntId || null,
      group_id: groupId || null,
      participant_id: isGroupChat ? null : myParticipantId!,
      sender_id: isGroupChat ? userId : null,
      type: 'text',
      content: text,
      media_url: null,
      created_at: new Date().toISOString(),
    }

    setInputText('')
    // Textarea-Höhe zurücksetzen
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setMessages(prev => [...prev, optimistic])
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))

    const insertData: Record<string, unknown> = {
      id: msgId,
      type: 'text',
      content: text,
    }
    if (isGroupChat) {
      insertData.group_id = groupId
      insertData.sender_id = userId
    } else {
      insertData.hunt_id = huntId
      insertData.participant_id = myParticipantId
    }

    const { error } = await supabase.from('messages').insert(insertData)

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== msgId))
      console.error('Nachricht senden fehlgeschlagen:', error)
    } else if (userId) {
      // 2er-Chat: Titel = Absendername, Body = nur Nachricht (wie WhatsApp)
      // Gruppenchat: Titel = Gruppenname, Body = "Name: Nachricht"
      const pushTitle = isDirect && mySenderName
        ? mySenderName
        : chatName || (groupId ? 'Gruppenchat' : 'Jagd-Chat')
      const pushBody = isDirect
        ? text.substring(0, 100)
        : (mySenderName ? `${mySenderName}: ${text.substring(0, 100)}` : text.substring(0, 100))
      sendPushNotification({
        huntId: huntId || undefined,
        groupId: groupId || undefined,
        title: pushTitle,
        body: pushBody,
        senderUserId: userId,
        url: groupId ? `/app/chat/${groupId}` : `/app/hunt/${huntId}?tab=chat`,
      })
    }
  }, [inputText, myParticipantId, huntId, groupId, userId, isGroupChat, supabase, chatName, mySenderName, isDirect])

  // === Foto senden ===

  const handlePhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isGroupChat && !myParticipantId) return
    if (isGroupChat && !userId) return
    e.target.value = ''

    setUploading(true)
    try {
      const compressed = await compressImage(file)
      const msgId = crypto.randomUUID()
      const storagePath = `${channelId}/${msgId}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('chat-photos')
        .upload(storagePath, compressed, { contentType: 'image/jpeg' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('chat-photos')
        .getPublicUrl(storagePath)

      const optimistic: Message = {
        id: msgId,
        hunt_id: huntId || null,
        group_id: groupId || null,
        participant_id: isGroupChat ? null : myParticipantId!,
        sender_id: isGroupChat ? userId : null,
        type: 'photo',
        content: null,
        media_url: publicUrl,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, optimistic])
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))

      const insertData: Record<string, unknown> = {
        id: msgId,
        type: 'photo',
        media_url: publicUrl,
      }
      if (isGroupChat) {
        insertData.group_id = groupId
        insertData.sender_id = userId
      } else {
        insertData.hunt_id = huntId
        insertData.participant_id = myParticipantId
      }

      const { error } = await supabase.from('messages').insert(insertData)

      if (error) {
        setMessages(prev => prev.filter(m => m.id !== msgId))
        console.error('Foto senden fehlgeschlagen:', error)
      } else if (userId) {
        const pushTitle = isDirect && mySenderName
          ? mySenderName
          : chatName || (groupId ? 'Gruppenchat' : 'Jagd-Chat')
        const pushBody = isDirect
          ? '📷 Foto'
          : (mySenderName ? `${mySenderName}: 📷 Foto` : '📷 Foto')
        sendPushNotification({
          huntId: huntId || undefined,
          groupId: groupId || undefined,
          title: pushTitle,
          body: pushBody,
          senderUserId: userId,
          url: groupId ? `/app/chat/${groupId}` : `/app/hunt/${huntId}?tab=chat`,
        })
      }
    } catch (err) {
      console.error('Foto-Upload fehlgeschlagen:', err)
    } finally {
      setUploading(false)
    }
  }, [myParticipantId, huntId, groupId, userId, isGroupChat, channelId, supabase])

  // Enter-Taste zum Senden
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  // === Render ===

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Skeleton-Bubbles */}
        <div className="chat-messages" style={{ flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
            {[
              { side: 'other', width: '65%' },
              { side: 'other', width: '45%' },
              { side: 'self', width: '55%' },
              { side: 'other', width: '70%' },
              { side: 'self', width: '40%' },
              { side: 'self', width: '60%' },
            ].map((bubble, i) => (
              <div key={i} style={{
                alignSelf: bubble.side === 'self' ? 'flex-end' : 'flex-start',
                width: bubble.width,
                maxWidth: '16rem',
                height: '2.25rem',
                borderRadius: '1rem',
                background: bubble.side === 'self' ? 'var(--green-dim)' : 'var(--surface-2)',
                animation: 'skeleton-pulse 1.5s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }} />
            ))}
          </div>
        </div>
        {/* Input-Bar sofort sichtbar */}
        <div className="chat-input-bar">
          <button className="chat-icon-btn cam" disabled style={{ opacity: 0.5 }}>📷</button>
          <input className="chat-input" placeholder="Nachricht..." disabled />
          <button className="chat-icon-btn mic" disabled>🎤</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, position: 'relative' }}>
      {/* Nachrichten-Bereich */}
      <div ref={scrollRef} className="chat-messages" onScroll={handleScroll}>
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-3)', fontSize: '0.75rem' }}>
            Ältere Nachrichten laden...
          </div>
        )}

        {messages.length === 0 && (
          <div className="chat-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💬</div>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>
              Noch keine Nachrichten.<br />Starte den Chat!
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prevMsg = i > 0 ? messages[i - 1] : null
          const showDateSep = needsDateSeparator(msg, prevMsg)
          const isMine = isMyMessage(msg)
          const isSystem = SYSTEM_TYPES.includes(msg.type)
          const senderId = isGroupChat ? msg.sender_id : msg.participant_id
          const sender = senderId ? participantMap[senderId] : undefined
          const deletable = !isSystem && canDeleteMessage(msg)

          // Sender-Name: nur in Gruppen 3+, nicht bei aufeinanderfolgenden vom gleichen Sender
          const memberTotal = Object.keys(participantMap).length
          const prevIsFromSameSender = prevMsg && !showDateSep
            && !SYSTEM_TYPES.includes(prevMsg.type) && !isMyMessage(prevMsg)
            && (isGroupChat ? prevMsg.sender_id : prevMsg.participant_id) === senderId
          const showSenderName = !isMine && !isSystem && sender && memberTotal > 2 && !prevIsFromSameSender

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="chat-date-separator">
                  {formatDateSeparator(msg.created_at)}
                </div>
              )}

              {isSystem ? (
                <div className={`chat-system-msg ${msg.type === 'tracking' ? 'tracking' : ''}`}>
                  {msg.content}
                </div>
              ) : (
                <div className={removingMsgId === msg.id ? 'swipe-removing' : ''}>
                  <SwipeToAction
                    actionIcon="🗑️"
                    actionColor="var(--red)"
                    onAction={() => setConfirmDeleteId(msg.id)}
                    disabled={!deletable}
                    onSwipeOpen={(closeFn) => {
                      closeActiveSwipe()
                      activeSwipeCloseRef.current = closeFn
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                      <div className={`chat-msg ${isMine ? 'self' : 'other'}`}>
                        {showSenderName && (
                          <div className="msg-sender" style={{ color: SENDER_COLORS[sender.colorIndex] }}>
                            {sender.name}
                          </div>
                        )}
                        {msg.type === 'photo' && msg.media_url && (
                          <img
                            src={msg.media_url}
                            alt="Foto"
                            className="msg-photo-img"
                            onClick={() => setFullscreenPhoto(msg.media_url)}
                          />
                        )}
                        {msg.content && <div>{msg.content}</div>}
                        <div className="msg-time">{formatTime(msg.created_at)}</div>
                      </div>
                    </div>
                  </SwipeToAction>
                </div>
              )}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* "Neue Nachrichten" Pill */}
      {showNewPill && (
        <button className="chat-new-pill" onClick={() => scrollToBottom(true)}>
          ↓ Neue Nachrichten
        </button>
      )}

      {/* Bestätigungs-Dialog: Nachricht löschen */}
      {confirmDeleteId && (
        <div className="confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p style={{ color: 'var(--text)', fontSize: '0.9375rem', margin: '0 0 1.25rem' }}>
              Nachricht löschen?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { setConfirmDeleteId(null); closeActiveSwipe() }}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text)', fontSize: '0.875rem', cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDeleteMessage(confirmDeleteId)}
                style={{
                  flex: 1, padding: '0.625rem', borderRadius: 'var(--radius)', border: 'none',
                  background: 'var(--red)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Eingabeleiste */}
      <div className="chat-input-bar">
        <button
          className="chat-icon-btn cam"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || (!isGroupChat && !myParticipantId) || (isGroupChat && !userId)}
          style={{ opacity: uploading ? 0.5 : 1 }}
        >
          {uploading ? '⏳' : '📷'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Nachricht..."
          rows={1}
          value={inputText}
          onChange={e => {
            setInputText(e.target.value)
            // Auto-Grow: Höhe an Inhalt anpassen
            const el = e.target
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 96) + 'px' // max ~4 Zeilen
          }}
          onKeyDown={handleKeyDown}
          disabled={(!isGroupChat && !myParticipantId) || (isGroupChat && !userId)}
        />
        {inputText.trim() ? (
          <button className="chat-icon-btn send" onClick={sendMessage}>
            ➤
          </button>
        ) : (
          <button className="chat-icon-btn mic" disabled title="Sprachnachrichten — bald verfügbar">
            🎤
          </button>
        )}
      </div>

      {/* Fullscreen Foto-Overlay */}
      {fullscreenPhoto && (
        <div className="chat-fullscreen-overlay" onClick={() => setFullscreenPhoto(null)}>
          <img src={fullscreenPhoto} alt="Vollbild" className="chat-fullscreen-img" />
          <button className="chat-fullscreen-close" onClick={() => setFullscreenPhoto(null)}>✕</button>
        </div>
      )}
    </div>
  )
}
