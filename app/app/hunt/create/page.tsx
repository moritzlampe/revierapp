'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
  'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
  'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen',
]

const WILD_PRESETS = [
  { value: 'schwarzwild', label: 'Schwarzwild', icon: '🐗', items: ['keiler', 'bache', 'ueberlaeufer', 'frischling'] },
  { value: 'rehwild', label: 'Rehwild', icon: '🦌', items: ['rehbock', 'ricke', 'rehkitz'] },
  { value: 'fuchs', label: 'Fuchs', icon: '🦊', items: ['fuchs'] },
  { value: 'dachs', label: 'Dachs', icon: '🦡', items: ['dachs'] },
]

type District = {
  id: string
  name: string
}

type Contact = {
  id: string
  display_name: string
  phone?: string
  inApp: boolean
  selected: boolean
  tagGL: boolean   // 👥 Gruppenleiter
  tagHF: boolean   // 🐕 Hundeführer
}

type MapObject = {
  id: string
  name: string
  type: string
}

type AdhocSeat = {
  tempId: string
  name: string
}

type SeatAssignment = {
  userId: string
  userName: string
  seatId: string | null
  seatType: 'assigned' | 'free' | 'adhoc' | 'none'
  seatName?: string  // Nur bei adhoc
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export default function CreateHuntPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [type, setType] = useState('ansitz')
  const [wildPresets, setWildPresets] = useState<string[]>(['schwarzwild', 'rehwild', 'fuchs'])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [districts, setDistricts] = useState<District[]>([])
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)

  // Neues Revier Modal
  const [showRevierModal, setShowRevierModal] = useState(false)
  const [newRevierName, setNewRevierName] = useState('')
  const [newRevierBundesland, setNewRevierBundesland] = useState('')
  const [creatingRevier, setCreatingRevier] = useState(false)
  const [revierError, setRevierError] = useState<string | null>(null)

  // Step 2: Hochsitz-Zuweisung
  const [availableSeats, setAvailableSeats] = useState<MapObject[]>([])
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>([])
  const [loadingSeats, setLoadingSeats] = useState(false)

  // Ad-hoc Stände (Freie Jagd)
  const [adhocSeats, setAdhocSeats] = useState<AdhocSeat[]>([])
  const [newAdhocName, setNewAdhocName] = useState('')
  const [showAdhocInput, setShowAdhocInput] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
    setCurrentUser({ id: user.id, name: profile?.display_name || 'Jäger' })

    // Reviere des Users laden
    const { data: userDistricts } = await supabase
      .from('districts')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('name')

    if (userDistricts && userDistricts.length > 0) {
      setDistricts(userDistricts)
      // Letztes Revier aus localStorage als Default
      const lastId = localStorage.getItem('last_selected_revier_id')
      if (lastId && userDistricts.some(d => d.id === lastId)) {
        setSelectedDistrictId(lastId)
      }
    }

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

  function handleRevierChange(value: string) {
    if (value === '__new__') {
      setShowRevierModal(true)
    } else {
      setSelectedDistrictId(value || null)
    }
  }

  async function handleCreateRevier() {
    if (!newRevierName.trim() || !newRevierBundesland || !currentUser) return
    setCreatingRevier(true)
    setRevierError(null)

    const supabase = createClient()
    const { data, error: insertErr } = await supabase
      .from('districts')
      .insert({
        owner_id: currentUser.id,
        name: newRevierName.trim(),
        bundesland: newRevierBundesland,
      })
      .select('id, name')
      .single()

    if (insertErr) {
      setRevierError(insertErr.message)
      setCreatingRevier(false)
      return
    }

    // Neues Revier in die Liste aufnehmen und auswählen
    setDistricts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedDistrictId(data.id)
    setShowRevierModal(false)
    setNewRevierName('')
    setNewRevierBundesland('')
    setCreatingRevier(false)
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

  // Hochsitze laden und zu Step 2 wechseln
  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()

    // Bei Revier-Jagd: Hochsitze laden
    if (selectedDistrictId) {
      setLoadingSeats(true)
      const supabase = createClient()
      const { data: seats } = await supabase
        .from('map_objects')
        .select('id, name, type')
        .eq('district_id', selectedDistrictId)
        .in('type', ['hochsitz', 'kanzel', 'drueckjagdstand'])
        .order('name')

      setAvailableSeats(seats || [])
      setLoadingSeats(false)
    } else {
      // Freie Jagd: keine Revier-Hochsitze
      setAvailableSeats([])
    }

    // Alle Teilnehmer (Jagdleiter + ausgewählte Kontakte) für Zuweisung vorbereiten
    const allParticipants: SeatAssignment[] = []
    if (currentUser) {
      allParticipants.push({
        userId: currentUser.id,
        userName: currentUser.name,
        seatId: null,
        seatType: 'none',
      })
    }
    contacts.filter(c => c.selected).forEach(c => {
      allParticipants.push({
        userId: c.id,
        userName: c.display_name,
        seatId: null,
        seatType: 'none',
      })
    })

    setSeatAssignments(allParticipants)
    setAdhocSeats([])
    setStep(2)
  }

  // Hochsitz-Zuweisung ändern
  function handleSeatChange(userId: string, value: string) {
    setSeatAssignments(prev => prev.map(a => {
      if (a.userId !== userId) return a
      if (value === '') return { ...a, seatId: null, seatType: 'none', seatName: undefined }
      if (value === 'free') return { ...a, seatId: null, seatType: 'free', seatName: undefined }
      // Adhoc-Stand? (Prefix "adhoc:")
      if (value.startsWith('adhoc:')) {
        const tempId = value.replace('adhoc:', '')
        const adhoc = adhocSeats.find(s => s.tempId === tempId)
        return { ...a, seatId: null, seatType: 'adhoc', seatName: adhoc?.name }
      }
      return { ...a, seatId: value, seatType: 'assigned', seatName: undefined }
    }))
  }

  // Ad-hoc Stand hinzufügen
  function addAdhocSeat() {
    const trimmed = newAdhocName.trim()
    if (!trimmed) return
    const tempId = crypto.randomUUID()
    setAdhocSeats(prev => [...prev, { tempId, name: trimmed }])
    setNewAdhocName('')
    setShowAdhocInput(false)
  }

  // Ad-hoc Stand entfernen
  function removeAdhocSeat(tempId: string) {
    setAdhocSeats(prev => prev.filter(s => s.tempId !== tempId))
    // Zuweisungen zu diesem Stand zurücksetzen
    setSeatAssignments(prev => prev.map(a =>
      a.seatType === 'adhoc' && a.seatName === adhocSeats.find(s => s.tempId === tempId)?.name
        ? { ...a, seatId: null, seatType: 'none', seatName: undefined }
        : a
    ))
  }

  // Verfügbare Hochsitze für einen Teilnehmer (bereits zugewiesene ausschließen)
  function getAvailableSeatsForUser(userId: string) {
    const takenSeatIds = seatAssignments
      .filter(a => a.seatType === 'assigned' && a.seatId && a.userId !== userId)
      .map(a => a.seatId)
    return availableSeats.filter(s => !takenSeatIds.includes(s.id))
  }

  async function handleCreate() {
    if (!currentUser) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()

    // Wildarten aus Presets zusammenbauen
    const allWild = wildPresets.flatMap(p => WILD_PRESETS.find(wp => wp.value === p)?.items || [])

    // Revier-Auswahl in localStorage speichern
    if (selectedDistrictId) {
      localStorage.setItem('last_selected_revier_id', selectedDistrictId)
    } else {
      localStorage.removeItem('last_selected_revier_id')
    }

    const { data: hunt, error: insertError } = await supabase
      .from('hunts')
      .insert({
        creator_id: currentUser.id,
        district_id: selectedDistrictId || null,
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

    // Automatisch Chat-Gruppe für die Jagd anlegen
    const huntName = name || 'Jagd am ' + new Date().toLocaleDateString('de-DE')
    const { data: chatGroup } = await supabase
      .from('chat_groups')
      .insert({
        name: huntName,
        emoji: '🎯',
        created_by: currentUser.id,
        hunt_id: hunt.id,
      })
      .select('id')
      .single()

    if (chatGroup) {
      const chatMembers = [
        { group_id: chatGroup.id, user_id: currentUser.id },
        ...selectedContacts
          .filter(c => c.inApp)
          .map(c => ({ group_id: chatGroup.id, user_id: c.id })),
      ]
      await supabase.from('chat_group_members').insert(chatMembers)
    }

    // Hochsitz-Zuweisungen speichern (nur wenn Step 2 durchlaufen)
    const assignmentsToInsert = seatAssignments.filter(a => a.seatType !== 'none')
    if (assignmentsToInsert.length > 0) {
      await supabase.from('hunt_seat_assignments').insert(
        assignmentsToInsert.map(a => ({
          hunt_id: hunt.id,
          user_id: a.userId,
          seat_id: a.seatType === 'assigned' ? a.seatId : null,
          seat_type: a.seatType,
          seat_name: a.seatType === 'adhoc' ? a.seatName : null,
        }))
      )
    }

    router.push(`/app/hunt/${hunt.id}`)
  }

  // === STEP 2: Hochsitz-Zuweisung ===
  if (step === 2) {
    return (
      <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <button onClick={() => setStep(1)} className="flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
          <div>
            <h1 className="text-lg font-bold">🪑 Stände zuweisen</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>Wer sitzt wo? Optional — du kannst auch überspringen.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loadingSeats ? (
            <div className="flex items-center justify-center py-12">
              <p style={{ color: 'var(--text-3)' }}>Lade Hochsitze...</p>
            </div>
          ) : (
            <>
              {/* Freie Jagd: Ad-hoc Stände erstellen */}
              {!selectedDistrictId && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>
                      Stände für diese Jagd
                    </label>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {adhocSeats.length} {adhocSeats.length === 1 ? 'Stand' : 'Stände'}
                    </span>
                  </div>

                  {/* Bestehende Ad-hoc Stände */}
                  {adhocSeats.map(seat => (
                    <div key={seat.tempId} className="flex items-center gap-2.5 p-3 rounded-xl"
                      style={{ background: 'var(--bg)', border: '1.5px solid var(--green)' }}>
                      <span className="text-lg">📍</span>
                      <span className="flex-1 text-sm font-semibold">{seat.name}</span>
                      <button type="button" onClick={() => removeAdhocSeat(seat.tempId)}
                        className="flex items-center justify-center"
                        style={{
                          width: '2rem', height: '2rem', borderRadius: '50%',
                          background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: '0.875rem',
                        }}>✕</button>
                    </div>
                  ))}

                  {/* Eingabefeld für neuen Stand */}
                  {showAdhocInput ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newAdhocName}
                        onChange={(e) => setNewAdhocName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAdhocSeat() } }}
                        placeholder="z.B. Eiche am Feldrand, Mais 1..."
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button type="button" onClick={addAdhocSeat} disabled={!newAdhocName.trim()}
                        className="flex items-center justify-center font-bold text-white disabled:opacity-50"
                        style={{
                          minWidth: '2.75rem', height: '3rem', borderRadius: 'var(--radius)',
                          background: 'var(--green)', fontSize: '1.25rem',
                        }}>+</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowAdhocInput(true)}
                      className="w-full flex items-center justify-center gap-2 font-semibold text-sm transition"
                      style={{
                        height: '2.75rem', borderRadius: 'var(--radius)',
                        border: '1.5px dashed var(--border)',
                        background: 'transparent', color: 'var(--green-bright)',
                      }}>
                      + Stand hinzufügen
                    </button>
                  )}

                  {adhocSeats.length === 0 && (
                    <div className="flex gap-2.5 p-3 rounded-xl"
                      style={{ background: 'rgba(66,165,245,0.06)', border: '1px solid rgba(66,165,245,0.15)' }}>
                      <span className="text-lg">💡</span>
                      <div className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                        Lege Stände an, um Jägern feste Positionen zuzuweisen.<br />
                        <span style={{ color: 'var(--text-3)' }}>Oder überspringe diesen Schritt — alle starten als "Freier Stand".</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Revier-Jagd ohne Hochsitze: Hinweis */}
              {selectedDistrictId && availableSeats.length === 0 && (
                <div className="flex gap-2.5 p-4 rounded-xl"
                  style={{ background: 'rgba(255,143,0,0.06)', border: '1px solid rgba(255,143,0,0.15)' }}>
                  <span className="text-lg flex-shrink-0">⚠️</span>
                  <div className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>
                    <strong>Keine Hochsitze im Revier.</strong><br />
                    Lege zuerst Hochsitze auf der Revierkarte an, um sie hier zuweisen zu können.
                  </div>
                </div>
              )}

              {/* Zuweisungs-Liste (wenn Revier-Hochsitze ODER Ad-hoc Stände vorhanden) */}
              {(availableSeats.length > 0 || adhocSeats.length > 0) && (
                <>
                  {!selectedDistrictId && adhocSeats.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.75rem' }}>
                      <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>
                        Jäger zuweisen
                      </label>
                    </div>
                  )}

                  <div className="space-y-2">
                    {seatAssignments.map((a, i) => {
                      const seatsForUser = getAvailableSeatsForUser(a.userId)
                      const currentValue = a.seatType === 'none' ? ''
                        : a.seatType === 'free' ? 'free'
                        : a.seatType === 'adhoc' ? `adhoc:${adhocSeats.find(s => s.name === a.seatName)?.tempId || ''}`
                        : a.seatId || ''

                      return (
                        <div key={a.userId} className="flex items-center gap-2.5 p-3 rounded-xl"
                          style={{ background: 'var(--bg)', border: `1.5px solid ${a.seatType !== 'none' ? 'var(--green)' : 'var(--border)'}` }}>
                          <div className={`avatar ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                            {getInitials(a.userName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{a.userName}</div>
                            {i === 0 && (
                              <span className="text-xs font-bold" style={{ color: 'var(--gold)' }}>🎖️ Jagdleiter</span>
                            )}
                          </div>
                          <select
                            value={currentValue}
                            onChange={(e) => handleSeatChange(a.userId, e.target.value)}
                            style={{
                              maxWidth: '10rem',
                              height: '2.5rem',
                              padding: '0 2rem 0 0.625rem',
                              borderRadius: 'var(--radius)',
                              border: `1.5px solid ${a.seatType !== 'none' ? 'var(--green)' : 'var(--border)'}`,
                              background: 'var(--surface)',
                              color: 'var(--text)',
                              fontSize: '0.8125rem',
                              appearance: 'none',
                              WebkitAppearance: 'none',
                            }}
                          >
                            <option value="">Nicht zugewiesen</option>
                            <option value="free">🏃 Freier Stand</option>
                            {/* Revier-Hochsitze */}
                            {seatsForUser.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.type === 'kanzel' ? '🏠' : s.type === 'drueckjagdstand' ? '🎯' : '🪜'} {s.name}
                              </option>
                            ))}
                            {/* Ad-hoc Stände */}
                            {adhocSeats.map(s => (
                              <option key={s.tempId} value={`adhoc:${s.tempId}`}>
                                📍 {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>

                  {/* Info */}
                  <div className="flex gap-2.5 p-3 rounded-xl"
                    style={{ background: 'rgba(66,165,245,0.06)', border: '1px solid rgba(66,165,245,0.15)' }}>
                    <span className="text-lg">💡</span>
                    <div className="text-xs leading-relaxed" style={{ color: 'var(--text-2)' }}>
                      Jeder Stand kann nur <strong>einem Jäger</strong> zugewiesen werden.
                      Zuweisungen sind optional und können während der Jagd geändert werden.
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

          {/* Buttons */}
          <div className="space-y-2 pt-2">
            <button type="button" onClick={() => handleCreate()} disabled={loading}
              className="w-full font-bold text-base text-white transition disabled:opacity-50"
              style={{ height: '3.5rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '1rem' }}>
              {loading ? 'Wird erstellt...' : `Jagd starten · ${seatAssignments.length} Jäger →`}
            </button>

            {(availableSeats.length > 0 || adhocSeats.length > 0) && seatAssignments.some(a => a.seatType !== 'none') ? null : (
              <button type="button"
                onClick={() => {
                  setSeatAssignments(prev => prev.map(a => ({ ...a, seatId: null, seatType: 'none', seatName: undefined })))
                  handleCreate()
                }}
                disabled={loading}
                className="w-full font-semibold text-sm transition disabled:opacity-50"
                style={{ height: '2.75rem', color: 'var(--text-3)', borderRadius: 'var(--radius)' }}>
                Überspringen — ohne Zuweisungen starten
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // === STEP 1: Name, Revier, Wildarten, Kontakte ===
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

      <form onSubmit={handleContinue} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
            Name <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>optional</span>
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Abendansitz Brockwinkel" />
        </div>

        {/* Revier */}
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
            🌲 Revier <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>optional</span>
          </label>
          <div className="relative">
            <select
              value={selectedDistrictId || ''}
              onChange={(e) => handleRevierChange(e.target.value)}
              style={{
                width: '100%',
                height: '3rem',
                padding: '0 2.75rem 0 0.875rem',
                borderRadius: 'var(--radius)',
                border: `1.5px solid ${selectedDistrictId ? 'var(--green)' : 'var(--border)'}`,
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: '0.9375rem',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              <option value="">🏞️ Freie Jagd (kein Revier)</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>🌲 {d.name}</option>
              ))}
              <option value="__new__">➕ Neues Revier erstellen</option>
            </select>
            <div style={{
              position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: 'var(--text-3)', fontSize: '0.75rem',
            }}>▼</div>
          </div>
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
        <button type="submit" disabled={loading || loadingSeats}
          className="w-full font-bold text-base text-white transition disabled:opacity-50"
          style={{ height: '3.5rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '1rem' }}>
          {loadingSeats
            ? 'Lade Hochsitze...'
            : loading
              ? 'Wird erstellt...'
              : `Weiter: Stände zuweisen →`
          }
        </button>
      </form>

      {/* Modal: Neues Revier erstellen */}
      {showRevierModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setShowRevierModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: '30rem',
            background: 'var(--surface)', borderRadius: '1.25rem 1.25rem 0 0',
            padding: '1.5rem', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">🌲 Neues Revier</h2>
              <button onClick={() => setShowRevierModal(false)}
                className="flex items-center justify-center"
                style={{
                  width: '2.25rem', height: '2.25rem', borderRadius: '50%',
                  background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: '1.125rem',
                }}>✕</button>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text-2)' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={newRevierName}
                  onChange={(e) => setNewRevierName(e.target.value)}
                  placeholder="z.B. Revier Brockwinkel"
                  autoFocus
                />
              </div>

              {/* Bundesland */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text-2)' }}>
                  Bundesland *
                </label>
                <div className="relative">
                  <select
                    value={newRevierBundesland}
                    onChange={(e) => setNewRevierBundesland(e.target.value)}
                    style={{
                      width: '100%', height: '3rem',
                      padding: '0 2.75rem 0 0.875rem',
                      borderRadius: 'var(--radius)',
                      border: `1.5px solid ${newRevierBundesland ? 'var(--green)' : 'var(--border)'}`,
                      background: 'var(--bg)', color: 'var(--text)',
                      fontSize: '0.9375rem',
                      appearance: 'none', WebkitAppearance: 'none',
                    }}
                  >
                    <option value="">Bitte wählen…</option>
                    {BUNDESLAENDER.map(bl => (
                      <option key={bl} value={bl}>{bl}</option>
                    ))}
                  </select>
                  <div style={{
                    position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)',
                    pointerEvents: 'none', color: 'var(--text-3)', fontSize: '0.75rem',
                  }}>▼</div>
                </div>
              </div>

              {/* Hinweis */}
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
                Hochsitze und Reviergrenzen kannst du später auf der Karte ergänzen.
              </p>

              {revierError && (
                <p className="text-sm" style={{ color: 'var(--red)' }}>{revierError}</p>
              )}

              {/* Buttons */}
              <button
                type="button"
                onClick={handleCreateRevier}
                disabled={creatingRevier || !newRevierName.trim() || !newRevierBundesland}
                className="w-full font-bold text-base text-white transition disabled:opacity-50"
                style={{ height: '3.25rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '1rem' }}
              >
                {creatingRevier ? 'Wird erstellt...' : 'Revier erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
