'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getChatDisplayInfo } from '@/lib/chat-utils'
import type { ChatMember } from '@/lib/chat-utils'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

// URL-Regex für Link-Extraktion
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g

type Member = {
  user_id: string
  display_name: string
  joined_at: string
}

type ChatGroup = {
  id: string
  name: string
  emoji: string
  created_by: string
  avatar_url: string | null
}

type MediaItem = {
  id: string
  media_url: string
  created_at: string
  sender_name: string
}

type LinkItem = {
  url: string
  created_at: string
  sender_name: string
}

async function compressImage(file: File, maxWidth = 600): Promise<Blob> {
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
        0.85
      )
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
    img.src = URL.createObjectURL(file)
  })
}

export default function GroupInfoPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const groupId = params.groupId as string

  const [group, setGroup] = useState<ChatGroup | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [newName, setNewName] = useState('')
  const [showAddMember, setShowAddMember] = useState(false)
  const [contacts, setContacts] = useState<{ id: string; display_name: string }[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // 2er-Chat Erkennung
  const [isDirect, setIsDirect] = useState(false)
  const [displayName, setDisplayName] = useState('')

  // Medien-Galerie
  const [mediaTab, setMediaTab] = useState<'medien' | 'links' | 'dokumente'>('medien')
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [linkItems, setLinkItems] = useState<LinkItem[]>([])
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [linksLoaded, setLinksLoaded] = useState(false)

  // Fullscreen Foto
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)

  const isCreator = group?.created_by === userId

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: groupData } = await supabase
      .from('chat_groups')
      .select('id, name, emoji, created_by, avatar_url')
      .eq('id', groupId)
      .single()

    if (!groupData) { router.push('/app'); return }
    setGroup(groupData)
    setNewName(groupData.name)

    // Mitglieder laden
    const { data: membersRaw } = await supabase
      .from('chat_group_members')
      .select('user_id, joined_at')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (membersRaw && membersRaw.length > 0) {
      // Profile separat laden (umgeht Probleme mit FK-Join + Profiles-RLS)
      const userIds = membersRaw.map(m => m.user_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)

      const profileMap: Record<string, string> = {}
      profiles?.forEach(p => { profileMap[p.id] = p.display_name })

      const memberList = membersRaw.map((m: any) => ({
        user_id: m.user_id,
        display_name: profileMap[m.user_id] || 'Unbekannt',
        joined_at: m.joined_at,
      }))
      setMembers(memberList)

      // 2er-Chat-Erkennung
      const chatMembers: ChatMember[] = memberList.map(m => ({
        user_id: m.user_id,
        display_name: m.display_name,
      }))
      const info = getChatDisplayInfo(groupData.name, chatMembers, user.id)
      setIsDirect(info.isDirect)
      setDisplayName(info.displayName)
    }

    setLoading(false)
  }, [supabase, groupId, router])

  useEffect(() => { loadData() }, [loadData])

  // Medien laden (lazy)
  const loadMedia = useCallback(async () => {
    if (mediaLoaded) return
    const { data } = await supabase
      .from('messages')
      .select('id, media_url, created_at, sender_id')
      .eq('group_id', groupId)
      .not('media_url', 'is', null)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      // Sender-Namen laden
      const senderIds = [...new Set(data.map(m => m.sender_id).filter(Boolean))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', senderIds)

      const profileMap: Record<string, string> = {}
      profiles?.forEach(p => { profileMap[p.id] = p.display_name })

      setMediaItems(data.map(m => ({
        id: m.id,
        media_url: m.media_url!,
        created_at: m.created_at,
        sender_name: m.sender_id ? profileMap[m.sender_id] || 'Unbekannt' : 'Unbekannt',
      })))
    }
    setMediaLoaded(true)
  }, [supabase, groupId, mediaLoaded])

  // Links laden (lazy)
  const loadLinks = useCallback(async () => {
    if (linksLoaded) return
    const { data } = await supabase
      .from('messages')
      .select('id, content, created_at, sender_id')
      .eq('group_id', groupId)
      .not('content', 'is', null)
      .order('created_at', { ascending: false })

    if (data) {
      const senderIds = [...new Set(data.map(m => m.sender_id).filter(Boolean))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', senderIds)

      const profileMap: Record<string, string> = {}
      profiles?.forEach(p => { profileMap[p.id] = p.display_name })

      const links: LinkItem[] = []
      data.forEach(m => {
        const matches = m.content?.match(URL_REGEX)
        if (matches) {
          matches.forEach((url: string) => {
            links.push({
              url,
              created_at: m.created_at,
              sender_name: m.sender_id ? profileMap[m.sender_id] || 'Unbekannt' : 'Unbekannt',
            })
          })
        }
      })
      setLinkItems(links)
    }
    setLinksLoaded(true)
  }, [supabase, groupId, linksLoaded])

  // Lazy Loading: Medien/Links bei Tab-Wechsel laden
  useEffect(() => {
    if (mediaTab === 'medien') loadMedia()
    else if (mediaTab === 'links') loadLinks()
  }, [mediaTab, loadMedia, loadLinks])

  // Kontakte laden (zum Hinzufügen)
  const loadContacts = useCallback(async () => {
    const memberIds = members.map(m => m.user_id)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .limit(50)

    if (profiles) {
      setContacts(profiles.filter(p => !memberIds.includes(p.id) && p.id !== userId))
    }
  }, [supabase, members, userId])

  // Gruppen-Avatar hochladen
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !group) return
    e.target.value = ''

    setUploadingAvatar(true)
    try {
      const compressed = await compressImage(file, 400)
      const fileName = `${crypto.randomUUID()}.jpg`
      const storagePath = `${groupId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('group-avatars')
        .upload(storagePath, compressed, { contentType: 'image/jpeg', upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('group-avatars')
        .getPublicUrl(storagePath)

      const { error: updateError } = await supabase
        .from('chat_groups')
        .update({ avatar_url: publicUrl })
        .eq('id', groupId)

      if (!updateError) {
        setGroup({ ...group, avatar_url: publicUrl })
      }
    } catch (err) {
      console.error('Avatar-Upload fehlgeschlagen:', err)
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Gruppenname ändern
  async function handleSaveName() {
    if (!newName.trim() || !group) return
    setActionLoading(true)
    const { error } = await supabase
      .from('chat_groups')
      .update({ name: newName.trim() })
      .eq('id', group.id)

    if (!error) {
      setGroup({ ...group, name: newName.trim() })
      setEditingName(false)
    }
    setActionLoading(false)
  }

  // Mitglied hinzufügen
  async function handleAddMember(contactId: string) {
    setActionLoading(true)
    const { error } = await supabase
      .from('chat_group_members')
      .insert({ group_id: groupId, user_id: contactId })

    if (!error) {
      setShowAddMember(false)
      setSearchTerm('')
      await loadData()
    }
    setActionLoading(false)
  }

  // Gruppe verlassen
  async function handleLeave() {
    if (!userId) return
    const confirmed = window.confirm('Gruppe wirklich verlassen?')
    if (!confirmed) return

    setActionLoading(true)
    await supabase
      .from('chat_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)

    const { count } = await supabase
      .from('chat_group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)

    if (count === 0) {
      await supabase.from('chat_groups').delete().eq('id', groupId)
    }

    router.push('/app?tab=chats')
  }

  // Gruppe löschen
  async function handleDelete() {
    const confirmed = window.confirm('Gruppe und alle Nachrichten unwiderruflich löschen?')
    if (!confirmed) return

    setActionLoading(true)
    await supabase.from('chat_group_members').delete().eq('group_id', groupId)
    await supabase.from('messages').delete().eq('group_id', groupId)
    await supabase.from('chat_groups').delete().eq('id', groupId)
    router.push('/app?tab=chats')
  }

  const filteredContacts = contacts.filter(c =>
    c.display_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-3)' }}>Lädt...</p>
      </div>
    )
  }

  if (!group) return null

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'calc(3.5rem + var(--safe-bottom))' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>
          ←
        </button>
        <h1 className="text-base font-bold">
          {isDirect ? 'Kontaktinfo' : 'Gruppeninfo'}
        </h1>
      </div>

      {/* Scrollbarer Inhalt */}
      <div className="flex-1 overflow-y-auto">
        {/* === Gruppen-Header: Avatar + Name === */}
        <div className="flex flex-col items-center py-8 px-5">
          {/* Avatar mit Kamera-Button */}
          <div style={{ position: 'relative' }}>
            {group.avatar_url ? (
              <img
                src={group.avatar_url}
                alt=""
                style={{
                  width: '5rem', height: '5rem', borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : isDirect ? (
              <div className="flex items-center justify-center avatar av-1"
                style={{
                  width: '5rem', height: '5rem', borderRadius: '50%',
                  fontSize: '2rem', fontWeight: 700,
                }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="flex items-center justify-center"
                style={{
                  width: '5rem', height: '5rem', borderRadius: '50%',
                  background: 'var(--surface-2)', fontSize: '2.5rem',
                }}>
                {group.emoji}
              </div>
            )}

            {/* Kamera-Button (nur für Ersteller, nicht bei 2er-Chats) */}
            {isCreator && !isDirect && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="flex items-center justify-center"
                style={{
                  position: 'absolute', bottom: '-0.125rem', right: '-0.125rem',
                  width: '2rem', height: '2rem', borderRadius: '50%',
                  background: 'var(--green)', color: 'white',
                  fontSize: '0.875rem', border: '2px solid var(--bg)',
                  cursor: 'pointer',
                }}
              >
                {uploadingAvatar ? '⏳' : '📷'}
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              style={{ display: 'none' }}
            />
          </div>

          {/* Name */}
          {editingName ? (
            <div className="flex items-center gap-2 mt-4 w-full max-w-xs">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                className="flex-1"
                style={{
                  background: 'var(--surface-2)', border: '1px solid var(--green)',
                  borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem',
                  color: 'var(--text)', fontSize: '1rem', fontWeight: 700,
                  textAlign: 'center', outline: 'none',
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName() }}
              />
              <button onClick={handleSaveName} disabled={actionLoading}
                style={{
                  background: 'var(--green)', color: 'white', borderRadius: '50%',
                  width: '2.5rem', height: '2.5rem', minWidth: '2.5rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                }}>
                ✓
              </button>
              <button onClick={() => { setEditingName(false); setNewName(group.name) }}
                style={{
                  background: 'var(--surface-2)', color: 'var(--text-2)', borderRadius: '50%',
                  width: '2.5rem', height: '2.5rem', minWidth: '2.5rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                }}>
                ✕
              </button>
            </div>
          ) : (
            <div className="mt-4 text-center cursor-pointer"
              onClick={() => isCreator && !isDirect && setEditingName(true)}>
              <div style={{ fontSize: '1.375rem', fontWeight: 700 }}>
                {isDirect ? displayName : group.name}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.25rem' }}>
                {isDirect ? 'Einzelchat' : `Gruppe · ${members.length} Mitglieder`}
              </div>
            </div>
          )}
        </div>

        {/* === Medien / Links / Dokumente === */}
        <div style={{ borderTop: '1px solid var(--border-light)' }}>
          {/* Segmented Control */}
          <div style={{ padding: '0.75rem 1.25rem 0' }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: '0.625rem', padding: '0.1875rem' }}
              className="flex">
              {(['medien', 'links', 'dokumente'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setMediaTab(tab)}
                  className="flex-1 py-2 text-xs font-semibold text-center transition-all"
                  style={{
                    borderRadius: '0.5rem',
                    background: mediaTab === tab ? 'var(--green-dim)' : 'transparent',
                    color: mediaTab === tab ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: mediaTab === tab ? 700 : 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {tab === 'medien' ? 'Medien' : tab === 'links' ? 'Links' : 'Dokumente'}
                </button>
              ))}
            </div>
          </div>

          {/* Tab-Inhalt */}
          <div style={{ padding: '0.75rem 1.25rem 1rem', minHeight: '8rem' }}>
            {/* Medien-Tab */}
            {mediaTab === 'medien' && (
              !mediaLoaded ? (
                <div className="flex items-center justify-center" style={{ padding: '2rem 0' }}>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>Medien laden...</p>
                </div>
              ) : mediaItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center" style={{ padding: '2rem 0' }}>
                  <span style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>📷</span>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>Noch keine Medien</p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '2px',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                }}>
                  {mediaItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => setFullscreenPhoto(item.media_url)}
                      style={{
                        position: 'relative',
                        paddingTop: '100%',
                        background: 'var(--surface-2)',
                        cursor: 'pointer',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={item.media_url}
                        alt=""
                        loading="lazy"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Links-Tab */}
            {mediaTab === 'links' && (
              !linksLoaded ? (
                <div className="flex items-center justify-center" style={{ padding: '2rem 0' }}>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>Links laden...</p>
                </div>
              ) : linkItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center" style={{ padding: '2rem 0' }}>
                  <span style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>🔗</span>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>Noch keine Links</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {linkItems.map((link, i) => (
                    <a
                      key={`${link.url}-${i}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl"
                      style={{
                        padding: '0.75rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--border-light)',
                        textDecoration: 'none',
                      }}
                    >
                      <p className="text-sm truncate" style={{ color: 'var(--blue)', fontWeight: 600 }}>
                        {link.url}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                        {link.sender_name} · {new Date(link.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                      </p>
                    </a>
                  ))}
                </div>
              )
            )}

            {/* Dokumente-Tab */}
            {mediaTab === 'dokumente' && (
              <div className="flex flex-col items-center justify-center" style={{ padding: '2rem 0' }}>
                <span style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.4 }}>📄</span>
                <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem' }}>
                  Dokumente werden bald unterstützt
                </p>
              </div>
            )}
          </div>
        </div>

        {/* === Mitglieder-Sektion === */}
        <div style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {members.length} {members.length === 1 ? 'Mitglied' : 'Mitglieder'}
            </span>
          </div>

          {/* Mitglied hinzufügen (nur Ersteller) */}
          {isCreator && !showAddMember && (
            <button
              onClick={() => { setShowAddMember(true); loadContacts() }}
              className="w-full flex items-center gap-3"
              style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-light)' }}
            >
              <div className="flex items-center justify-center"
                style={{
                  width: '2.625rem', height: '2.625rem', borderRadius: '50%',
                  background: 'rgba(107,159,58,0.15)', color: 'var(--green)',
                  fontSize: '1.25rem',
                }}>
                +
              </div>
              <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--green)' }}>
                Mitglied hinzufügen
              </span>
            </button>
          )}

          {/* Kontaktsuche zum Hinzufügen */}
          {showAddMember && (
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-light)', background: 'var(--surface)' }}>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Name suchen..."
                  autoFocus
                  style={{
                    flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem',
                    color: 'var(--text)', fontSize: '0.875rem', outline: 'none',
                  }}
                />
                <button onClick={() => { setShowAddMember(false); setSearchTerm('') }}
                  style={{ color: 'var(--text-3)', fontSize: '0.875rem', padding: '0.5rem' }}>
                  Abbrechen
                </button>
              </div>
              <div className="space-y-1" style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                {filteredContacts.length === 0 && (
                  <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem', textAlign: 'center', padding: '0.75rem 0' }}>
                    Keine Kontakte gefunden.
                  </p>
                )}
                {filteredContacts.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => handleAddMember(c.id)}
                    disabled={actionLoading}
                    className="w-full flex items-center gap-2.5 rounded-xl"
                    style={{ padding: '0.5rem', background: 'var(--bg)' }}
                  >
                    <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                      {getInitials(c.display_name)}
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{c.display_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mitglieder-Liste */}
          {members.map((m, i) => {
            const isMe = m.user_id === userId
            const isMemberCreator = m.user_id === group.created_by
            // Bei 2er-Chats: sich selbst nicht nochmal zeigen
            if (isDirect && isMe) return null
            return (
              <div
                key={m.user_id}
                className="flex items-center gap-3"
                style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border-light)' }}
              >
                <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                  style={{ width: '2.625rem', height: '2.625rem', fontSize: '0.875rem' }}>
                  {getInitials(m.display_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600 }} className="truncate">
                      {isMe ? 'Du' : m.display_name}
                    </span>
                  </div>
                </div>
                {isMemberCreator && !isDirect && (
                  <span style={{
                    fontSize: '0.6875rem',
                    color: 'var(--green)',
                    fontWeight: 600,
                    background: 'rgba(107,159,58,0.12)',
                    padding: '0.1875rem 0.5rem',
                    borderRadius: '0.375rem',
                  }}>
                    Ersteller
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* === Aktionen === */}
        <div style={{ padding: '1.5rem 1.25rem', marginTop: '0.5rem' }}>
          <button
            onClick={handleLeave}
            disabled={actionLoading}
            className="w-full flex items-center gap-3 rounded-xl"
            style={{
              padding: '0.875rem 1.25rem', background: 'var(--surface)',
              border: '1px solid var(--border-light)', marginBottom: '0.75rem',
            }}
          >
            <span style={{ fontSize: '1.125rem' }}>🚪</span>
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--red)' }}>
              {isDirect ? 'Chat löschen' : 'Gruppe verlassen'}
            </span>
          </button>

          {isCreator && !isDirect && (
            <button
              onClick={handleDelete}
              disabled={actionLoading}
              className="w-full flex items-center gap-3 rounded-xl"
              style={{
                padding: '0.875rem 1.25rem', background: 'var(--surface)',
                border: '1px solid var(--border-light)',
              }}
            >
              <span style={{ fontSize: '1.125rem' }}>🗑️</span>
              <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--red)' }}>
                Gruppe löschen
              </span>
            </button>
          )}
        </div>

        {/* Abstand unten */}
        <div style={{ height: '2rem' }} />
      </div>

      {/* Fullscreen Foto-Overlay */}
      {fullscreenPhoto && (
        <div
          onClick={() => setFullscreenPhoto(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={fullscreenPhoto}
            alt="Vollbild"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
          <button
            onClick={() => setFullscreenPhoto(null)}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              width: '2.5rem', height: '2.5rem', borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)', color: 'white',
              fontSize: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
