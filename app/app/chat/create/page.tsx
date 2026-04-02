'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']
const EMOJI_OPTIONS = ['💬', '🌲', '🐗', '🦌', '🏠', '🔫', '👥', '🐕']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

type Contact = {
  id: string
  display_name: string
  selected: boolean
}

export default function CreateChatGroupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💬')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .neq('id', user.id)
      .limit(50)

    if (profiles) {
      setContacts(profiles.map(p => ({
        id: p.id,
        display_name: p.display_name,
        selected: false,
      })))
    }
  }

  function toggleContact(id: string) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c))
  }

  const filteredContacts = contacts.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedContacts = contacts.filter(c => c.selected)
  const selectedCount = selectedContacts.length
  const isDirectChat = selectedCount === 1

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUserId) return
    // Bei Gruppenchats ist der Name Pflicht, bei Einzelchats nicht
    if (!isDirectChat && !name.trim()) return
    setLoading(true)
    setError(null)

    const supabase = createClient()

    // Chat-Name: Bei Einzelchat den Namen des Kontakts verwenden
    const chatName = isDirectChat
      ? selectedContacts[0].display_name
      : name.trim()

    // Gruppe erstellen
    const { data: group, error: groupError } = await supabase
      .from('chat_groups')
      .insert({
        name: chatName,
        emoji: isDirectChat ? '💬' : emoji,
        created_by: currentUserId,
      })
      .select('id')
      .single()

    if (groupError) {
      setError(groupError.message)
      setLoading(false)
      return
    }

    // Ersteller als Mitglied
    const members = [
      { group_id: group.id, user_id: currentUserId },
      ...contacts.filter(c => c.selected).map(c => ({
        group_id: group.id,
        user_id: c.id,
      })),
    ]

    const { error: memberError } = await supabase
      .from('chat_group_members')
      .insert(members)

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    router.push(`/app/chat/${group.id}`)
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div>
          <h1 className="text-lg font-bold">{isDirectChat ? '💬 Neuer Chat' : '💬 Gruppe erstellen'}</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {isDirectChat ? `Einzelchat mit ${selectedContacts[0].display_name}` : 'Chat-Gruppe für Jagdfreunde, Revierinfos, etc.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Gruppenname — nur bei Gruppenchats (2+ Kontakte oder 0) */}
        {!isDirectChat && (
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
              Gruppenname <span style={{ color: 'var(--red)', fontWeight: 400 }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Jagdfreunde Brockwinkel"
              required
            />
          </div>
        )}

        {/* Emoji wählen — nur bei Gruppenchats */}
        {!isDirectChat && (
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Gruppen-Emoji</label>
            <div className="flex gap-2 flex-wrap">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className="flex items-center justify-center"
                  style={{
                    width: '2.75rem', height: '2.75rem', borderRadius: '50%',
                    fontSize: '1.25rem',
                    border: `2px solid ${emoji === e ? 'var(--green)' : 'var(--border)'}`,
                    background: emoji === e ? 'rgba(107,159,58,0.1)' : 'var(--surface-2)',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Teilnehmer */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
            Teilnehmer hinzufügen
            {selectedCount > 0 && (
              <span style={{ color: 'var(--green-bright)', fontWeight: 400 }}> · {selectedCount} ausgewählt</span>
            )}
          </label>

          <div className="mb-2.5">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Name suchen..."
            />
          </div>

          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredContacts.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                Keine Kontakte gefunden.
              </p>
            )}
            {filteredContacts.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleContact(c.id)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{
                  background: 'var(--bg)',
                  border: `1.5px solid ${c.selected ? 'var(--green)' : 'var(--border)'}`,
                }}
              >
                <div className={`avatar ${AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]}`}>
                  {getInitials(c.display_name)}
                </div>
                <span className="flex-1 text-left text-sm font-semibold">{c.display_name}</span>
                <div
                  style={{
                    width: '1.625rem', height: '1.625rem', borderRadius: '50%',
                    border: `2px solid ${c.selected ? 'var(--green)' : 'var(--border)'}`,
                    background: c.selected ? 'var(--green)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.875rem', fontWeight: 800, color: 'white',
                  }}
                >
                  {c.selected && '✓'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || (!isDirectChat && !name.trim()) || selectedCount === 0}
          className="w-full font-bold text-base text-white transition disabled:opacity-50"
          style={{ height: '3.5rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '1rem' }}
        >
          {loading
            ? 'Wird erstellt...'
            : isDirectChat
              ? `Chat starten mit ${selectedContacts[0].display_name}`
              : `Gruppe erstellen${selectedCount > 0 ? ` · ${selectedCount + 1} Mitglieder` : ''}`
          }
        </button>
      </form>
    </div>
  )
}
