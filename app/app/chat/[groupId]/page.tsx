'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ChatPanel from '@/components/hunt/ChatPanel'
import { getChatDisplayInfo } from '@/lib/chat-utils'
import type { ChatMember } from '@/lib/chat-utils'

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
  const [group, setGroup] = useState<ChatGroup | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [displayName, setDisplayName] = useState('')
  const [isDirect, setIsDirect] = useState(false)
  const [displayInitial, setDisplayInitial] = useState<string | null>(null)

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
      .select('user_id, profiles:user_id(display_name)')
      .eq('group_id', params.groupId)

    const members: ChatMember[] = (membersData || []).map((m: any) => ({
      user_id: m.user_id,
      display_name: m.profiles?.display_name || 'Unbekannt',
    }))
    setMemberCount(members.length)

    const info = getChatDisplayInfo(groupData.name, members, user.id)
    setDisplayName(info.displayName)
    setIsDirect(info.isDirect)
    setDisplayInitial(info.displayInitial)

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
      <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)' }}>
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
    <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div className="flex-1 min-w-0 flex items-center gap-2.5 cursor-pointer"
          onClick={() => router.push(`/app/chat/${group.id}/info`)}>
          {/* Avatar: 2er-Chat → Initial, Gruppen-Avatar → Bild, sonst Emoji */}
          {isDirect && displayInitial ? (
            <div className="flex items-center justify-center flex-shrink-0 avatar av-1"
              style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', fontSize: '0.875rem', fontWeight: 700 }}>
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
            <div className="text-sm font-bold truncate">{displayName || group.name}</div>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>
              {isDirect ? 'Einzelchat' : `👥 ${memberCount} Mitglieder`}
            </div>
          </div>
        </div>
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
