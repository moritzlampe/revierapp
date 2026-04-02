'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  participants?: Participant[]
  userId: string | null
  myParticipantId?: string | null
  supabase: SupabaseClient
  isActive: boolean
  onUnreadChange: (count: number) => void
}

// === Konstanten ===

const SENDER_COLORS = ['#8BC34A', '#42A5F5', '#FF8F00', '#EF5350', '#AB47BC', '#26A69A', '#FF7043', '#5C6BC0']
const PAGE_SIZE = 50
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

// === Komponente ===

export default function ChatPanel({ huntId, groupId, participants = [], userId, myParticipantId, supabase, isActive, onUnreadChange }: Props) {
  // Gruppenchat-Modus: Mitglieder als "Participants" laden
  const [groupMembers, setGroupMembers] = useState<Record<string, { name: string; colorIndex: number }>>({})
  const isGroupChat = !!groupId && !huntId
  const channelId = huntId || groupId || 'none'
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showNewPill, setShowNewPill] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)

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

  useEffect(() => { isActiveRef.current = isActive }, [isActive])
  useEffect(() => { onUnreadChangeRef.current = onUnreadChange }, [onUnreadChange])
  useEffect(() => { participantsRef.current = participants }, [participants])
  useEffect(() => { userIdRef.current = userId }, [userId])

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

  // Prüft ob Nachricht vom aktuellen User ist
  const isMyMessage = useCallback((msg: Message) => {
    if (isGroupChat) return msg.sender_id === userId
    const p = participants.find(p => p.id === msg.participant_id)
    return p?.user_id === userId
  }, [participants, userId, isGroupChat])

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

  // === Nachrichten laden ===

  useEffect(() => {
    let cancelled = false
    async function load() {
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
        setMessages(data.reverse())
        setHasMore(data.length === PAGE_SIZE)
      }
      setLoading(false)
      // Nach dem Rendern ganz nach unten scrollen
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
    }
    load()
    return () => { cancelled = true }
  }, [supabase, huntId, groupId])

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
          return [...prev, msg]
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
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, channelId, huntId, groupId, isGroupChat])

  // Ungelesen zurücksetzen wenn Tab aktiv wird
  useEffect(() => {
    if (isActive && unreadRef.current > 0) {
      unreadRef.current = 0
      onUnreadChange(0)
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
    isAtBottomRef.current = checkIsAtBottom()
    if (isAtBottomRef.current) setShowNewPill(false)
    // Ältere Nachrichten laden wenn ganz oben
    if (el.scrollTop < 50 && hasMore && !loadingMore) {
      loadOlder()
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
    }
  }, [inputText, myParticipantId, huntId, groupId, userId, isGroupChat, supabase])

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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Nachrichten laden...</p>
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
                <div className={`chat-msg ${isMine ? 'self' : 'other'}`}>
                  {!isMine && sender && (
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
          capture="environment"
          onChange={handlePhoto}
          style={{ display: 'none' }}
        />
        <input
          className="chat-input"
          placeholder="Nachricht..."
          value={inputText}
          onChange={e => setInputText(e.target.value)}
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
