'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

const WILD_PRESETS = [
  { value: 'schwarzwild', label: 'Schwarzwild', icon: '🐗', items: ['keiler', 'bache', 'ueberlaeufer', 'frischling'] },
  { value: 'rehwild', label: 'Rehwild', icon: '🦌', items: ['rehbock', 'ricke', 'rehkitz'] },
  { value: 'fuchs', label: 'Fuchs', icon: '🦊', items: ['fuchs'] },
  { value: 'dachs', label: 'Dachs', icon: '🦡', items: ['dachs'] },
]

type Contact = {
  id: string
  display_name: string
  phone?: string
  inApp: boolean
  selected: boolean
  tagGL: boolean   // 👥 Gruppenleiter
  tagHF: boolean   // 🐕 Hundeführer
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export default function CreateHuntPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState('ansitz')
  const [wildPresets, setWildPresets] = useState<string[]>(['schwarzwild', 'rehwild', 'fuchs'])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setCurrentUser({ id: user.id, name: profile?.display_name || 'Jäger' })

    // Andere registrierte Nutzer laden
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, phone')
      .neq('id', user.id)
      .limit(50)

    if (profiles) {
      setContacts(profiles.map(p => ({
        id: p.id,
        display_name: p.display_name,
        phone: p.phone || undefined,
        inApp: true,
        selected: false,
        tagGL: false,
        tagHF: false,
      })))
    }
  }

  function toggleContact(id: string) {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c))
  }

  function toggleTag(id: string, tag: 'tagGL' | 'tagHF') {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, [tag]: !c[tag] } : c))
  }

  function toggleWild(value: string) {
    setWildPresets(prev => prev.includes(value) ? prev.filter(w => w !== value) : [...prev, value])
  }

  const filteredContacts = contacts.filter(c =>
    c.display_name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedCount = contacts.filter(c => c.selected).length

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUser) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()

    // Wildarten aus Presets zusammenbauen
    const allWild = wildPresets.flatMap(p => WILD_PRESETS.find(wp => wp.value === p)?.items || [])

    const { data: hunt, error: insertError } = await supabase
      .from('hunts')
      .insert({
        creator_id: currentUser.id,
        name: name || 'Jagd am ' + new Date().toLocaleDateString('de-DE'),
        type,
        status: 'active',
        invite_code: inviteCode,
        wild_presets: allWild,
        signal_mode: type === 'drueckjagd' ? 'loud' : 'silent',
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) { setError(insertError.message); setLoading(false); return }

    // Ersteller als Jagdleiter
    await supabase.from('hunt_participants').insert({
      hunt_id: hunt.id, user_id: currentUser.id,
      role: 'jagdleiter', status: 'joined', joined_at: new Date().toISOString(),
    })

    // Ausgewählte Kontakte als Teilnehmer
    const selectedContacts = contacts.filter(c => c.selected)
    if (selectedContacts.length > 0) {
      await supabase.from('hunt_participants').insert(
        selectedContacts.map(c => ({
          hunt_id: hunt.id,
          user_id: c.inApp ? c.id : null,
          guest_name: c.inApp ? null : c.display_name,
          role: 'schuetze' as const,
          tags: [
            ...(c.tagGL ? ['gruppenleiter' as const] : []),
            ...(c.tagHF ? ['hundefuehrer' as const] : []),
          ],
          status: 'invited' as const,
        }))
      )
    }

    router.push(`/app/hunt/${hunt.id}`)
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
        <div>
          <h1 className="text-lg font-bold">🎯 Jagd starten</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Wie bei WhatsApp — wer die App hat wird direkt hinzugefügt.</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
            Name <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>optional</span>
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Abendansitz Brockwinkel" />
        </div>

        {/* Wildarten */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Wildarten für Schnellmeldung</label>
          <div className="flex gap-2 flex-wrap">
            {WILD_PRESETS.map(w => (
              <button key={w.value} type="button" onClick={() => toggleWild(w.value)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition"
                style={{
                  border: `1.5px solid ${wildPresets.includes(w.value) ? 'var(--green)' : 'var(--border)'}`,
                  background: wildPresets.includes(w.value) ? 'rgba(107,159,58,0.1)' : 'var(--bg)',
                  color: wildPresets.includes(w.value) ? 'var(--green-bright)' : 'var(--text-3)',
                }}>
                {w.icon} {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Teilnehmer */}
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Jäger einladen</label>

          {/* Du = Jagdleiter */}
          {currentUser && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl mb-2.5"
              style={{ background: 'var(--bg)', border: '1.5px solid var(--green)' }}>
              <div className={`avatar ${AVATAR_COLORS[0]}`}>{getInitials(currentUser.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: 'var(--green-bright)' }}>Du ({currentUser.name})</div>
                <div className="text-xs" style={{ color: 'var(--text-3)' }}>🎯 Schütze</div>
              </div>
              <span className="badge badge-gold text-xs font-bold">🎖️ Jagdleiter</span>
            </div>
          )}

          {/* Suchfeld */}
          <div className="mb-2.5">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Name oder Nummer suchen..." />
          </div>

          {/* Kontaktliste */}
          <div className="space-y-1 max-h-56 overflow-y-auto mb-3">
            {filteredContacts.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                Noch keine anderen Nutzer registriert. Teile den Einladungslink nach dem Erstellen.
              </p>
            )}
            {filteredContacts.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl"
                style={{
                  background: 'var(--bg)',
                  border: `1.5px solid ${c.selected ? 'var(--green)' : 'var(--border)'}`,
                }}>
                <div className={`avatar ${AVATAR_COLORS[(i + 1) % AVATAR_COLORS.length]}`}>
                  {getInitials(c.display_name)}
                </div>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleContact(c.id)}>
                  <div className="text-sm font-semibold">{c.display_name}</div>
                  <div className="text-xs" style={{ color: c.inApp ? 'var(--green)' : 'var(--text-3)' }}>
                    {c.inApp ? '✓ In der App' : c.phone || 'Bekommt Link'}
                  </div>
                </div>
                {/* Tags */}
                <div className="flex gap-1 flex-shrink-0">
                  <button type="button" onClick={() => toggleTag(c.id, 'tagGL')}
                    className={`tag-btn ${c.tagGL ? 'on-blue' : ''}`}>👥</button>
                  <button type="button" onClick={() => toggleTag(c.id, 'tagHF')}
                    className={`tag-btn ${c.tagHF ? 'on-orange' : ''}`}>🐕</button>
                </div>
                {/* Checkbox */}
                <div onClick={() => toggleContact(c.id)} className="cursor-pointer flex-shrink-0"
                  style={{
                    width: '1.625rem', height: '1.625rem', borderRadius: '50%',
                    border: `2px solid ${c.selected ? 'var(--green)' : 'var(--border)'}`,
                    background: c.selected ? 'var(--green)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.875rem', fontWeight: 800, color: 'white',
                  }}>
                  {c.selected && '✓'}
                </div>
              </div>
            ))}
          </div>

          {/* Info box */}
          <div className="flex gap-2.5 p-3 rounded-xl"
            style={{ background: 'rgba(66,165,245,0.06)', border: '1px solid rgba(66,165,245,0.15)' }}>
            <span className="text-lg">💡</span>
            <div className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
              Jeder ist <strong>🎯 Schütze</strong>. Tippe 👥 oder 🐕 für Zusatz-Aufgaben.<br />
              <span style={{ color: 'var(--text-3)' }}>App-Nutzer → sofort dabei · Gäste → WhatsApp-Link</span>
            </div>
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

        {/* Submit */}
        <button type="submit" disabled={loading}
          className="w-full font-bold text-base text-white transition disabled:opacity-50"
          style={{ height: '3.5rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '1rem' }}>
          {loading ? 'Wird erstellt...' : `Jagd starten${selectedCount > 0 ? ` · ${selectedCount + 1} Jäger` : ''} →`}
        </button>
      </form>
    </div>
  )
}
