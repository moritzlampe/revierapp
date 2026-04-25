'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DotsThreeVertical } from '@phosphor-icons/react'
import { createClient } from '@/lib/supabase/client'
import ChatPanel from '@/components/hunt/ChatPanel'
import { getChatDisplayInfo } from '@/lib/chat-utils'
import type { ChatMember } from '@/lib/chat-utils'
import { getAvatarColor } from '@/lib/avatar-color'
import { useConfirmSheet } from '@/components/ui/ConfirmSheet'
import { leaveChatGroup, deleteChatGroup } from '@/lib/chat-group-actions'

type ChatGroup = {
  id: string
  name: string
  emoji: string
  created_by: string
  hunt_id: string | null
  avatar_url: string | null
}

export default function GroupChatPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const confirmSheet = useConfirmSheet()
  const [group, setGroup] = useState<ChatGroup | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [isDirect, setIsDirect] = useState(false)
  const [displayInitial, setDisplayInitial] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  // Erst rendern, wenn Gruppen-Daten + Mitglieder geladen sind (verhindert Flicker des Dots-Buttons bei 1:1-Chats)
  const [isReady, setIsReady] = useState(false)

  const isOwner = !!group && !!userId && group.created_by === userId

  const showErrorToast = useCallback((message: string) => {
    window.dispatchEvent(new CustomEvent('quickhunt:toast', {
      detail: { message, type: 'warning' },
    }))
  }, [])

  const handleMenuTap = useCallback(async () => {
    if (!group || !userId || actionLoading) return

    if (isOwner) {
      const ok = await confirmSheet({
        title: 'Gruppe löschen?',
        description: 'Diese Gruppe wird für alle Mitglieder gelöscht. Der Chat-Verlauf geht verloren.',
        confirmLabel: 'Löschen',
        confirmVariant: 'danger',
      })
      if (!ok) return
      setActionLoading(true)
      const { error } = await deleteChatGroup(supabase, group.id)
      setActionLoading(false)
      if (error) {
        showErrorToast('Gruppe konnte nicht gelöscht werden')
        return
      }
      router.push('/app?tab=chats')
    } else {
      const ok = await confirmSheet({
        title: 'Gruppe verlassen?',
        description: 'Du kannst von einem Mitglied wieder hinzugefügt werden.',
        confirmLabel: 'Verlassen',
        confirmVariant: 'danger',
      })
      if (!ok) return
      setActionLoading(true)
      const { error } = await leaveChatGroup(supabase, group.id, userId)
      setActionLoading(false)
      if (error) {
        showErrorToast('Gruppe konnte nicht verlassen werden')
        return
      }
      router.push('/app?tab=chats')
    }
  }, [group, userId, isOwner, actionLoading, confirmSheet, supabase, router, showErrorToast])

  const loadGroup = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: groupData } = await supabase
      .from('chat_groups')
      .select('*')
      .eq('id', params.groupId)
      .single()

    if (!groupData) { router.push('/app'); return }
    setGroup(groupData)

    // Mitglieder laden für Anzahl + 2er-Chat-Erkennung
    const { data: membersData } = await supabase
      .from('chat_group_members')
      .select('user_id')
      .eq('group_id', params.groupId)

    // Profile separat laden (umgeht FK-Join-Probleme bei fehlender Profiles-RLS)
    const memberUserIds = (membersData || []).map(m => m.user_id)
    const profileMap: Record<string, string> = {}
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', memberUserIds)
      profiles?.forEach(p => { profileMap[p.id] = p.display_name })
    }

    const members: ChatMember[] = (membersData || []).map((m: any) => ({
      user_id: m.user_id,
      display_name: profileMap[m.user_id] || 'Unbekannt',
    }))
    setMemberCount(members.length)

    const info = getChatDisplayInfo(groupData.name, members, user.id)
    setDisplayName(info.displayName)
    setIsDirect(info.isDirect)
    setDisplayInitial(info.displayInitial)
    setIsReady(true)

    // last_read_at aktualisieren
    await supabase
      .from('chat_group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', params.groupId)
      .eq('user_id', user.id)
  }, [supabase, params.groupId, router])

  useEffect(() => { loadGroup() }, [loadGroup])

  // last_read_at beim Verlassen aktualisieren
  useEffect(() => {
    return () => {
      if (userId && params.groupId) {
        supabase
          .from('chat_group_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('group_id', params.groupId as string)
          .eq('user_id', userId)
          .then(() => {})
      }
    }
  }, [userId, params.groupId, supabase])

  if (!group) {
    // Skeleton-Header sofort anzeigen während Daten laden
    return (
      <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
          <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
            style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <div className="flex-shrink-0" style={{
              width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--surface-2)',
              animation: 'skeleton-pulse 1.5s ease-in-out infinite',
            }} />
            <div className="flex-1 min-w-0">
              <div style={{ width: '8rem', height: '0.875rem', borderRadius: '0.25rem', background: 'var(--surface-2)',
                animation: 'skeleton-pulse 1.5s ease-in-out infinite' }} />
              <div style={{ width: '5rem', height: '0.625rem', borderRadius: '0.25rem', background: 'var(--surface-2)',
                marginTop: '0.375rem', animation: 'skeleton-pulse 1.5s ease-in-out infinite', animationDelay: '0.1s' }} />
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          {userId && (
            <ChatPanel
              groupId={params.groupId as string}
              userId={userId}
              supabase={supabase}
              isActive={true}
              onUnreadChange={() => {}}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)', paddingBottom: 'var(--bottom-bar-space)' }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer"
          onClick={() => router.push(`/app/chat/${group.id}/info`)}>
          {/* Avatar: 2er-Chat → Initial, Gruppen-Avatar → Bild, sonst Emoji */}
          {isDirect && displayInitial ? (
            <div className="flex items-center justify-center flex-shrink-0 avatar"
              style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', fontSize: '0.875rem', fontWeight: 700, background: getAvatarColor(group.id), color: '#fff' }}>
              {displayInitial}
            </div>
          ) : group.avatar_url ? (
            <img src={group.avatar_url} alt=""
              className="flex-shrink-0"
              style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div className="flex items-center justify-center flex-shrink-0"
              style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--surface-2)', fontSize: '1.125rem' }}>
              {group.emoji}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}>{displayName || group.name}</div>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              {isDirect ? 'Einzelchat' : `👥 ${memberCount} Mitglieder`}
            </div>
          </div>
        </div>
        {isReady && !isDirect && (
          <button
            onClick={(e) => { e.stopPropagation(); handleMenuTap() }}
            disabled={actionLoading}
            aria-label={isOwner ? 'Gruppe löschen' : 'Gruppe verlassen'}
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{
              minWidth: '2.75rem',
              minHeight: '2.75rem',
              color: 'var(--text-2)',
              background: 'transparent',
            }}
          >
            <DotsThreeVertical size={22} weight="regular" />
          </button>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-h-0">
        <ChatPanel
          groupId={group.id}
          chatName={displayName || group.name}
          isDirect={isDirect}
          userId={userId}
          supabase={supabase}
          isActive={true}
          onUnreadChange={() => {}}
          canDeleteAll={userId === group.created_by}
        />
      </div>
    </div>
  )
}
