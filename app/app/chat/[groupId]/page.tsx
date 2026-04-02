'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ChatPanel from '@/components/hunt/ChatPanel'

type ChatGroup = {
  id: string
  name: string
  emoji: string
  created_by: string
  hunt_id: string | null
}

export default function GroupChatPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [group, setGroup] = useState<ChatGroup | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)

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

    const { count } = await supabase
      .from('chat_group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', params.groupId)

    setMemberCount(count || 0)
    setLoading(false)

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

  if (loading) {
    return (
      <div className="h-viewport flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-3)' }}>Lädt...</p>
      </div>
    )
  }

  if (!group) return null

  return (
    <div className="h-viewport flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.push('/app?tab=chats')} className="flex items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div className="flex items-center justify-center flex-shrink-0"
          style={{ width: '2.25rem', height: '2.25rem', borderRadius: '50%', background: 'var(--surface-2)', fontSize: '1.125rem' }}>
          {group.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{group.name}</div>
          <div className="text-xs" style={{ color: 'var(--text-3)' }}>
            👥 {memberCount} Mitglieder
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-h-0">
        <ChatPanel
          groupId={group.id}
          userId={userId}
          supabase={supabase}
          isActive={true}
          onUnreadChange={() => {}}
        />
      </div>
    </div>
  )
}
