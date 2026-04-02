'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

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

  const isCreator = group?.created_by === userId

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: groupData } = await supabase
      .from('chat_groups')
      .select('id, name, emoji, created_by')
      .eq('id', groupId)
      .single()

    if (!groupData) { router.push('/app'); return }
    setGroup(groupData)
    setNewName(groupData.name)

    // Mitglieder mit Profil-Namen laden
    const { data: membersData } = await supabase
      .from('chat_group_members')
      .select('user_id, joined_at, profiles:user_id(display_name)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (membersData) {
      setMembers(membersData.map((m: any) => ({
        user_id: m.user_id,
        display_name: m.profiles?.display_name || 'Unbekannt',
        joined_at: m.joined_at,
      })))
    }

    setLoading(false)
  }, [supabase, groupId, router])

  useEffect(() => { loadData() }, [loadData])

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

    // Wenn letztes Mitglied → Gruppe löschen
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
    // Mitglieder löschen, dann Nachrichten, dann Gruppe
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
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>
          ←
        </button>
        <h1 className="text-base font-bold">Gruppeninfo</h1>
      </div>

      {/* Scrollbarer Inhalt */}
      <div className="flex-1 overflow-y-auto">
        {/* Gruppen-Header: Emoji + Name */}
        <div className="flex flex-col items-center py-8 px-5">
          <div className="flex items-center justify-center"
            style={{
              width: '5rem', height: '5rem', borderRadius: '50%',
              background: 'var(--surface-2)', fontSize: '2.5rem',
            }}>
            {group.emoji}
          </div>

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
            <div className="mt-4 text-center cursor-pointer" onClick={() => isCreator && setEditingName(true)}>
              <div style={{ fontSize: '1.375rem', fontWeight: 700 }}>{group.name}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.25rem' }}>
                Gruppe · {members.length} Mitglieder
              </div>
            </div>
          )}
        </div>

        {/* Mitglieder-Sektion */}
        <div style={{ borderTop: '1px solid var(--border-light)' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-2)' }}>
              Mitglieder · {members.length}
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
                <span style={{
                  fontSize: '0.75rem',
                  color: isMemberCreator ? 'var(--green)' : 'var(--text-3)',
                  fontWeight: isMemberCreator ? 600 : 400,
                }}>
                  {isMemberCreator ? 'Admin' : 'Mitglied'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Aktionen */}
        <div style={{ padding: '1.5rem 1.25rem', marginTop: '1rem' }}>
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
              Gruppe verlassen
            </span>
          </button>

          {isCreator && (
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
      </div>
    </div>
  )
}
