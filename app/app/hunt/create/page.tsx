'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import StandAssignmentMapView from '@/components/hunt/StandAssignmentMapView'
import type { AssignStand, AssignParticipant, FreePosition } from '@/components/hunt/StandAssignmentMap'
import { useGeolocation } from '@/hooks/useGeolocation'
import GpsStatusBadge from '@/components/hunt/GpsStatusBadge'
import { parsePointHex } from '@/lib/geo-utils'
import { createSoloHunt } from '@/lib/supabase/hunts'
import { getAvatarColor } from '@/lib/avatar-color'
import { getGroupIcon } from '@/components/icons/SpeciesIcons'
import type { WildGroup } from '@/lib/species-config'
import { Star, Crosshair, UsersThree, Dog } from '@phosphor-icons/react'

const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
  'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
  'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
  'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen',
]

const WILD_PRESETS: { value: string; label: string; group: WildGroup; items: string[] }[] = [
  { value: 'schwarzwild', label: 'Schwarzwild', group: 'schwarzwild', items: ['keiler', 'bache', 'ueberlaeufer', 'frischling'] },
  { value: 'rehwild', label: 'Rehwild', group: 'rehwild', items: ['rehbock', 'ricke', 'rehkitz'] },
  { value: 'fuchs', label: 'Fuchs', group: 'raubwild', items: ['fuchs'] },
  { value: 'dachs', label: 'Dachs', group: 'raubwild', items: ['dachs'] },
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
  position?: { lat: number; lng: number }
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export default function CreateHuntPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [huntKind, setHuntKind] = useState<'group' | 'solo'>('group')
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

  // "Jetzt einrichten?" Dialog nach Revier-Erstellung
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [newRevierData, setNewRevierData] = useState<{ id: string; name: string } | null>(null)

  // Step 2: Karten-basierte Stand-Zuweisung
  const [revierStands, setRevierStands] = useState<AssignStand[]>([])
  const [adhocStands, setAdhocStands] = useState<AssignStand[]>([])
  const [freePositions, setFreePositions] = useState<FreePosition[]>([])
  const [assignMode, setAssignMode] = useState<'stands' | 'free'>('stands')
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null)
  const [loadingSeats, setLoadingSeats] = useState(false)
  const [revierBoundary, setRevierBoundary] = useState<[number, number][][] | null>(null)

  // Stand-Edit Sheet
  const [editingStand, setEditingStand] = useState<AssignStand | null>(null)
  const [editName, setEditName] = useState('')
  const [assigningStand, setAssigningStand] = useState<AssignStand | null>(null)

  // Per-Marker Move-Mode
  const [movingStandId, setMovingStandId] = useState<string | null>(null)

  // Ad-hoc Stand Counter
  const adhocCounter = useRef(0)

  // GPS fuer Karten-Zentrierung
  const geoState = useGeolocation()

  // Alle Teilnehmer als AssignParticipant
  const allParticipants: AssignParticipant[] = [
    ...(currentUser ? [{
      userId: currentUser.id,
      userName: currentUser.name,
      avatarColor: getAvatarColor(currentUser.id),
    }] : []),
    ...contacts.filter(c => c.selected).map((c) => ({
      userId: c.id,
      userName: c.display_name,
      avatarColor: getAvatarColor(c.id),
    })),
  ]

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

    // "Jetzt einrichten?" Dialog zeigen
    setNewRevierData(data)
    setShowSetupDialog(true)
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

  // Einzeljagd direkt erstellen (ohne Step 2 / Stand-Zuweisung)
  async function handleCreateSolo(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUser) return
    setLoading(true)
    setError(null)

    const dateStr = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    const finalName = name.trim() || `Einzeljagd · ${dateStr}`

    if (selectedDistrictId) {
      localStorage.setItem('last_selected_revier_id', selectedDistrictId)
    } else {
      localStorage.removeItem('last_selected_revier_id')
    }

    try {
      const { id } = await createSoloHunt({
        userId: currentUser.id,
        districtId: selectedDistrictId || null,
        name: finalName,
      })
      router.push(`/app/hunt/${id}`)
    } catch (err: any) {
      setError(err?.message ?? 'Einzeljagd konnte nicht erstellt werden.')
      setLoading(false)
    }
  }

  // Hochsitze + Grenze laden und zu Step 2 wechseln
  async function handleContinue(e: React.FormEvent) {
    e.preventDefault()
    if (huntKind === 'solo') {
      return handleCreateSolo(e)
    }
    setLoadingSeats(true)

    const supabase = createClient()

    if (selectedDistrictId) {
      // Hochsitze mit Position laden
      const { data: seats } = await supabase
        .from('map_objects')
        .select('id, name, type, position')
        .eq('district_id', selectedDistrictId)
        .in('type', ['hochsitz', 'kanzel', 'drueckjagdstand'])
        .order('name')

      const parsed: AssignStand[] = (seats || []).map(s => {
        let pos = { lat: 0, lng: 0 }
        if (s.position && typeof s.position === 'string') {
          const p = parsePointHex(s.position)
          if (p) pos = p
        } else if (s.position && typeof s.position === 'object') {
          const obj = s.position as any
          if (obj.coordinates) {
            pos = { lat: obj.coordinates[1], lng: obj.coordinates[0] }
          }
        }
        return { id: s.id, name: s.name, type: s.type, position: pos, assignedUserId: null }
      })
      setRevierStands(parsed)

      // Reviergrenze laden
      const { data: district } = await supabase
        .from('districts')
        .select('boundary')
        .eq('id', selectedDistrictId)
        .single()

      if (district?.boundary) {
        try {
          const geo = typeof district.boundary === 'string'
            ? JSON.parse(district.boundary)
            : district.boundary
          if (geo?.coordinates) {
            const ring = geo.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number])
            setRevierBoundary([ring])
          }
        } catch { /* keine Grenze */ }
      } else {
        setRevierBoundary(null)
      }
    } else {
      setRevierStands([])
      setRevierBoundary(null)
    }

    setAdhocStands([])
    setFreePositions([])
    setActiveParticipantId(null)
    setAssignMode('stands')
    adhocCounter.current = 0
    setLoadingSeats(false)
    setStep(2)
  }

  // Karten-Callbacks

  // Neuen Stand auf der Karte erstellen (Tap in Hochsitz-Modus)
  const handleStandCreated = useCallback((position: { lat: number; lng: number }) => {
    adhocCounter.current += 1
    const newStand: AssignStand = {
      id: `adhoc-${crypto.randomUUID()}`,
      name: `Stand ${adhocCounter.current}`,
      type: 'adhoc',
      position,
      assignedUserId: null,
    }
    setAdhocStands(prev => [...prev, newStand])
  }, [])

  // Bestehenden Stand getappt → Schnellzuweisung öffnen
  const handleStandTapped = useCallback((standId: string) => {
    const stand = [...revierStands, ...adhocStands].find(s => s.id === standId)
    if (stand) {
      setAssigningStand(stand)
    }
  }, [revierStands, adhocStands])

  // Teilnehmer einem Stand zuweisen
  const handleStandAssign = useCallback((standId: string, userId: string) => {
    // Vorherige Zuweisung dieses Users entfernen (bei allen Staenden)
    setRevierStands(prev => prev.map(s =>
      s.assignedUserId === userId ? { ...s, assignedUserId: null } : s
    ))
    setAdhocStands(prev => prev.map(s =>
      s.assignedUserId === userId ? { ...s, assignedUserId: null } : s
    ))
    // Freie Position dieses Users entfernen
    setFreePositions(prev => prev.filter(fp => fp.userId !== userId))

    // Neuen Stand zuweisen
    const inRevier = revierStands.find(s => s.id === standId)
    if (inRevier) {
      setRevierStands(prev => prev.map(s =>
        s.id === standId ? { ...s, assignedUserId: userId } : s
      ))
    } else {
      setAdhocStands(prev => prev.map(s =>
        s.id === standId ? { ...s, assignedUserId: userId } : s
      ))
    }
    // Naechsten unzugewiesenen Teilnehmer auswaehlen
    selectNextUnassigned(userId)
  }, [revierStands, adhocStands])

  // Freie Position setzen (Tap in Frei-Modus)
  const handleFreePositionSet = useCallback((userId: string, position: { lat: number; lng: number }) => {
    // Vorherige Zuweisungen entfernen
    setRevierStands(prev => prev.map(s =>
      s.assignedUserId === userId ? { ...s, assignedUserId: null } : s
    ))
    setAdhocStands(prev => prev.map(s =>
      s.assignedUserId === userId ? { ...s, assignedUserId: null } : s
    ))
    // Freie Position upserten
    setFreePositions(prev => {
      const existing = prev.findIndex(fp => fp.userId === userId)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = { userId, position }
        return next
      }
      return [...prev, { userId, position }]
    })
    selectNextUnassigned(userId)
  }, [])

  // Naechsten unzugewiesenen Teilnehmer automatisch auswaehlen
  function selectNextUnassigned(justAssignedUserId: string) {
    // Timeout damit der State-Update durchgeht
    setTimeout(() => {
      setActiveParticipantId(prev => {
        // Prüfen welche Teilnehmer noch nicht zugewiesen sind
        // (wird im naechsten Render-Zyklus korrekt sein)
        return null // Reset — User waehlt naechsten manuell oder Auto-Logik greift
      })
    }, 100)
  }

  // Stand umbenennen
  function handleRenameStand() {
    if (!editingStand || !editName.trim()) return
    const isAdhoc = editingStand.id.startsWith('adhoc-')
    if (isAdhoc) {
      setAdhocStands(prev => prev.map(s =>
        s.id === editingStand.id ? { ...s, name: editName.trim() } : s
      ))
    } else {
      setRevierStands(prev => prev.map(s =>
        s.id === editingStand.id ? { ...s, name: editName.trim() } : s
      ))
    }
    setEditingStand(null)
  }

  // Stand loeschen (nur ad-hoc)
  function handleDeleteStand() {
    if (!editingStand) return
    setAdhocStands(prev => prev.filter(s => s.id !== editingStand.id))
    setEditingStand(null)
  }

  // Stand verschoben (Drag-End im Move-Mode)
  function handleStandMoved(standId: string, position: { lat: number; lng: number }, standType: string) {
    if (standType === 'adhoc') {
      setAdhocStands(prev => prev.map(s => s.id === standId ? { ...s, position } : s))
    } else {
      setRevierStands(prev => prev.map(s => s.id === standId ? { ...s, position } : s))
    }
  }

  // "Position ändern" aus dem Edit-Sheet
  function handleMovePosition() {
    if (!editingStand) return
    setMovingStandId(editingStand.id)
    setEditingStand(null)
  }

  // Chip-Tap: Teilnehmer auswaehlen/abwaehlen
  function toggleParticipant(userId: string) {
    setActiveParticipantId(prev => prev === userId ? null : userId)
  }

  // Pruefen ob ein Teilnehmer zugewiesen ist
  function isParticipantPlaced(userId: string): boolean {
    if (revierStands.some(s => s.assignedUserId === userId)) return true
    if (adhocStands.some(s => s.assignedUserId === userId)) return true
    if (freePositions.some(fp => fp.userId === userId)) return true
    return false
  }

  function getAssignedStandName(userId: string): string | null {
    const r = revierStands.find(s => s.assignedUserId === userId)
    if (r) return r.name
    const a = adhocStands.find(s => s.assignedUserId === userId)
    if (a) return a.name
    if (freePositions.some(fp => fp.userId === userId)) return 'Freie Position'
    return null
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

    // Karten-basierte Zuweisungen speichern
    const assignments: {
      hunt_id: string
      user_id: string | null
      seat_id: string | null
      seat_type: string
      seat_name: string | null
      position_lat: number | null
      position_lng: number | null
    }[] = []

    // Revier-Hochsitz-Zuweisungen
    for (const s of revierStands) {
      if (s.assignedUserId) {
        assignments.push({
          hunt_id: hunt.id,
          user_id: s.assignedUserId,
          seat_id: s.id,
          seat_type: 'assigned',
          seat_name: null,
          position_lat: null,
          position_lng: null,
        })
      }
    }

    // Ad-hoc Stand-Zuweisungen (auch unbesetzte Stände persistieren)
    for (const s of adhocStands) {
      assignments.push({
        hunt_id: hunt.id,
        user_id: s.assignedUserId || null,
        seat_id: null,
        seat_type: 'adhoc',
        seat_name: s.name,
        position_lat: s.position.lat,
        position_lng: s.position.lng,
      })
    }

    // Freie Positionen
    for (const fp of freePositions) {
      assignments.push({
        hunt_id: hunt.id,
        user_id: fp.userId,
        seat_id: null,
        seat_type: 'free_pos',
        seat_name: null,
        position_lat: fp.position.lat,
        position_lng: fp.position.lng,
      })
    }

    if (assignments.length > 0) {
      await supabase.from('hunt_seat_assignments').insert(assignments)
    }

    router.push(`/app/hunt/${hunt.id}`)
  }

  // === STEP 2: Karten-basierte Stand-Zuweisung ===
  if (step === 2) {
    const placedCount = allParticipants.filter(p => isParticipantPlaced(p.userId)).length
    const hasAnyAssignment = placedCount > 0

    return (
      <div className="h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-light)' }}>
          <button onClick={() => setStep(1)} className="flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}>←</button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold">Stände zuweisen</h1>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              {assignMode === 'stands' ? 'Tippe Karte = neuer Stand' : 'Tippe Karte = Position setzen'}
            </p>
          </div>
          <span className="text-xs font-semibold" style={{ color: placedCount > 0 ? 'var(--accent-primary)' : 'var(--text-3)' }}>
            {placedCount}/{allParticipants.length}
          </span>
        </div>

        {/* Teilnehmer-Chips */}
        <div className="assign-chips flex-shrink-0">
          {allParticipants.map((p, i) => {
            const placed = isParticipantPlaced(p.userId)
            const active = activeParticipantId === p.userId
            return (
              <button
                key={p.userId}
                className={`assign-chip${placed ? ' placed' : ''}${active ? ' active' : ''}`}
                onClick={() => toggleParticipant(p.userId)}
              >
                <div className="avatar" style={{ background: getAvatarColor(p.userId), color: '#fff' }}>
                  {getInitials(p.userName)}
                </div>
                {p.userName.split(' ')[0]}
                {i === 0 && <Star size={10} weight="fill" color="var(--accent-gold)" />}
                {placed && <span style={{ fontSize: '0.625rem', color: 'var(--accent-primary)' }}>✓</span>}
              </button>
            )
          })}
        </div>

        {/* Karte */}
        <div className="assign-map-container flex-1">
          <GpsStatusBadge geo={geoState} />
          {loadingSeats ? (
            <div className="flex items-center justify-center h-full">
              <p style={{ color: 'var(--text-3)' }}>Lade Karte...</p>
            </div>
          ) : (
            <StandAssignmentMapView
              revierStands={revierStands}
              adhocStands={adhocStands}
              participants={allParticipants}
              freePositions={freePositions}
              boundary={revierBoundary}
              mode={assignMode}
              activeParticipantId={activeParticipantId}
              userPosition={geoState.position}
              userAccuracy={geoState.accuracy}
              onStandCreated={handleStandCreated}
              onStandTapped={handleStandTapped}
              onStandAssign={handleStandAssign}
              onFreePositionSet={handleFreePositionSet}
              onStandMoved={handleStandMoved}
              movingStandId={movingStandId}
              onMovingDone={() => setMovingStandId(null)}
            />
          )}
        </div>

        {/* Modus-Toggle */}
        <div className="px-4 py-2 flex-shrink-0">
          <div className="assign-mode-toggle">
            <button
              className={`assign-mode-btn${assignMode === 'stands' ? ' active' : ''}`}
              onClick={() => setAssignMode('stands')}
            >
              📍 Hochsitze
            </button>
            <button
              className={`assign-mode-btn${assignMode === 'free' ? ' active' : ''}`}
              onClick={() => setAssignMode('free')}
            >
              👤 Frei platzieren
            </button>
          </div>
        </div>

        {error && <p className="text-sm px-4" style={{ color: 'var(--red)' }}>{error}</p>}

        {/* Buttons */}
        <div className="flex gap-3 px-4 pb-4 pt-1 flex-shrink-0" style={{ paddingBottom: 'max(1rem, var(--safe-bottom))' }}>
          {!hasAnyAssignment && (
            <button type="button"
              onClick={() => {
                setRevierStands(prev => prev.map(s => ({ ...s, assignedUserId: null })))
                setAdhocStands([])
                setFreePositions([])
                handleCreate()
              }}
              disabled={loading}
              className="font-semibold text-sm transition disabled:opacity-50"
              style={{
                height: '3.25rem', borderRadius: 'var(--radius)',
                color: 'var(--text-3)', padding: '0 1rem',
                whiteSpace: 'nowrap',
              }}>
              Überspringen
            </button>
          )}
          <button type="button" onClick={() => handleCreate()} disabled={loading}
            className="flex-1 font-bold text-base text-white transition disabled:opacity-50"
            style={{ height: '3.25rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '0.9375rem' }}>
            {loading ? 'Wird erstellt...' : `Jagd starten · ${allParticipants.length} Jäger`}
          </button>
        </div>

        {/* Schnellzuweisung Sheet (Tap auf Stand → Jäger-Liste) */}
        {assigningStand && (
          <div className="assign-sheet-overlay" onClick={() => setAssigningStand(null)}>
            <div className="assign-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '60vh' }}>
              <div className="assign-sheet-handle" />
              <h3 className="text-sm font-bold mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🪜 {assigningStand.name}
                {assigningStand.assignedUserId && (
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 400, fontSize: '0.75rem' }}>
                    → {allParticipants.find(p => p.userId === assigningStand.assignedUserId)?.userName}
                  </span>
                )}
              </h3>

              <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                {allParticipants.map((p, i) => {
                  const isOnThisStand = assigningStand.assignedUserId === p.userId
                  const assignedElsewhere = !isOnThisStand ? getAssignedStandName(p.userId) : null

                  return (
                    <button
                      key={p.userId}
                      onClick={() => {
                        if (isOnThisStand) {
                          // Toggle: Zuweisung entfernen
                          const isAdhoc = assigningStand.id.startsWith('adhoc-')
                          if (isAdhoc) {
                            setAdhocStands(prev => prev.map(s => s.id === assigningStand.id ? { ...s, assignedUserId: null } : s))
                          } else {
                            setRevierStands(prev => prev.map(s => s.id === assigningStand.id ? { ...s, assignedUserId: null } : s))
                          }
                          setAssigningStand(prev => prev ? { ...prev, assignedUserId: null } : null)
                        } else {
                          handleStandAssign(assigningStand.id, p.userId)
                          setAssigningStand(null)
                        }
                      }}
                      className="w-full flex items-center gap-3 text-left"
                      style={{
                        padding: '0.75rem 0',
                        borderBottom: '1px solid var(--border-light)',
                        opacity: assignedElsewhere ? 0.5 : 1,
                        background: isOnThisStand ? 'rgba(107,159,58,0.08)' : 'transparent',
                      }}
                    >
                      <div className="avatar-xs" style={{ flexShrink: 0, background: getAvatarColor(p.userId), color: '#fff' }}>
                        {getInitials(p.userName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.userName}</p>
                        {isOnThisStand && (
                          <p className="text-xs" style={{ color: 'var(--accent-primary)' }}>Hier zugewiesen ✓</p>
                        )}
                        {assignedElsewhere && (
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Auf: {assignedElsewhere}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div style={{ padding: '0.75rem 0 0', borderTop: '1px solid var(--border-light)' }}>
                <button
                  onClick={() => {
                    setEditingStand(assigningStand)
                    setEditName(assigningStand.name)
                    setAssigningStand(null)
                  }}
                  className="w-full text-center text-xs font-semibold"
                  style={{
                    padding: '0.625rem', borderRadius: 'var(--radius)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--text-2)',
                  }}
                >
                  ✏️ Bearbeiten
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stand-Edit Bottom Sheet */}
        {editingStand && (
          <div className="assign-sheet-overlay" onClick={() => setEditingStand(null)}>
            <div className="assign-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="assign-sheet-handle" />
              <h3 className="text-base font-bold mb-3">Stand bearbeiten</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-2)' }}>Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameStand() }}
                    autoFocus
                  />
                </div>

                <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                  Typ: {editingStand.type === 'kanzel' ? '🏠 Kanzel' : editingStand.type === 'drueckjagdstand' ? '🎯 Drückjagdstand' : editingStand.type === 'adhoc' ? '📍 Ad-hoc' : '🪜 Hochsitz'}
                </div>

                <button
                  type="button"
                  onClick={handleMovePosition}
                  className="sheet-move-btn"
                >
                  📍 Position ändern
                </button>

                <div className="flex gap-2 pt-1">
                  {editingStand.id.startsWith('adhoc-') && (
                    <button
                      type="button"
                      onClick={handleDeleteStand}
                      className="font-semibold text-sm"
                      style={{
                        height: '2.75rem', padding: '0 1rem',
                        borderRadius: 'var(--radius)',
                        border: '1.5px solid rgba(239,83,80,0.3)',
                        color: 'var(--red)', background: 'transparent',
                      }}
                    >
                      Löschen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRenameStand}
                    className="flex-1 font-bold text-sm text-white"
                    style={{
                      height: '2.75rem', borderRadius: 'var(--radius)',
                      background: 'var(--green)',
                    }}
                  >
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {huntKind === 'solo'
              ? 'Allein ansitzen — GPS, Karte, Wildbeobachtung.'
              : 'Wie bei WhatsApp — wer die App hat wird direkt hinzugefügt.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleContinue} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Jagd-Typ Toggle */}
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>Typ</label>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
            padding: '0.25rem', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
          }}>
            <button
              type="button"
              onClick={() => setHuntKind('group')}
              style={{
                height: '2.75rem', borderRadius: 'calc(var(--radius) - 4px)',
                fontSize: '0.9375rem', fontWeight: 600,
                background: huntKind === 'group' ? 'var(--green)' : 'transparent',
                color: huntKind === 'group' ? '#fff' : 'var(--text-2)',
                transition: 'background 120ms, color 120ms',
              }}
            >
              👥 Gruppenjagd
            </button>
            <button
              type="button"
              onClick={() => setHuntKind('solo')}
              style={{
                height: '2.75rem', borderRadius: 'calc(var(--radius) - 4px)',
                fontSize: '0.9375rem', fontWeight: 600,
                background: huntKind === 'solo' ? 'var(--green)' : 'transparent',
                color: huntKind === 'solo' ? '#fff' : 'var(--text-2)',
                transition: 'background 120ms, color 120ms',
              }}
            >
              🎯 Einzeljagd
            </button>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text-2)' }}>
            Name <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>optional</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={huntKind === 'solo' ? 'z.B. Einzeljagd · 18.04.' : 'z.B. Abendansitz Brockwinkel'}
          />
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
            {WILD_PRESETS.map(w => {
              const Icon = getGroupIcon(w.group)
              const selected = wildPresets.includes(w.value)
              return (
                <button key={w.value} type="button" onClick={() => toggleWild(w.value)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition"
                  style={{
                    border: `1.5px solid ${selected ? 'var(--green)' : 'var(--border)'}`,
                    background: selected ? 'rgba(107,159,58,0.1)' : 'var(--bg)',
                    color: selected ? 'var(--accent-primary)' : 'var(--text-3)',
                  }}>
                  <Icon size={18} />
                  <span>{w.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Teilnehmer */}
        {huntKind === 'group' && (
        <div>
          <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text-2)' }}>Jäger einladen</label>

          {/* Du = Jagdleiter */}
          {currentUser && (
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl mb-2.5"
              style={{ background: 'var(--bg)', border: '1.5px solid var(--green)' }}>
              <div className="avatar" style={{ background: getAvatarColor(currentUser.id), color: '#fff' }}>{getInitials(currentUser.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>Du ({currentUser.name})</div>
                <div className="text-xs" style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Crosshair size={12} />
                  <span>Schütze</span>
                </div>
              </div>
              <span className="badge badge-gold text-xs font-bold" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Star size={12} weight="fill" />
                Jagdleiter
              </span>
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
                <div className="avatar" style={{ background: getAvatarColor(c.id), color: '#fff' }}>
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
                  <button type="button" onClick={() => toggleTag(c.id, 'tagGL')} aria-label="Gruppenleiter-Tag"
                    className={`tag-btn ${c.tagGL ? 'on-blue' : ''}`}><UsersThree size={14} /></button>
                  <button type="button" onClick={() => toggleTag(c.id, 'tagHF')} aria-label="Hundeführer-Tag"
                    className={`tag-btn ${c.tagHF ? 'on-orange' : ''}`}><Dog size={14} /></button>
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
        )}

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

        {/* Submit */}
        <button type="submit" disabled={loading || loadingSeats}
          className="w-full font-bold text-base text-white transition disabled:opacity-50"
          style={{ height: '3.5rem', borderRadius: 'var(--radius)', background: 'var(--green)', fontSize: '1rem' }}>
          {loading
            ? 'Wird erstellt...'
            : loadingSeats
              ? 'Lade Hochsitze...'
              : huntKind === 'solo'
                ? '🎯 Einzeljagd starten'
                : 'Weiter: Stände zuweisen →'
          }
        </button>
      </form>

      {/* Dialog: Jetzt einrichten? */}
      {showSetupDialog && newRevierData && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 110,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem',
        }}>
          <div style={{
            width: '100%', maxWidth: '22rem',
            background: 'var(--surface)', borderRadius: '1.25rem',
            padding: '2rem 1.5rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
            <h2 className="text-lg font-bold" style={{ marginBottom: '0.25rem' }}>
              Revier erstellt!
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-2)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Möchtest du jetzt direkt Reviergrenzen{'\n'}und Hochsitze einrichten?
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowSetupDialog(false)
                  router.push(`/app/revier/${newRevierData.id}/setup?returnTo=hunt-create`)
                }}
                className="w-full font-bold text-base text-white"
                style={{
                  height: '3.25rem', borderRadius: 'var(--radius)',
                  background: 'var(--green)', fontSize: '1rem',
                }}
              >
                Jetzt einrichten →
              </button>
              <button
                type="button"
                onClick={() => setShowSetupDialog(false)}
                className="w-full font-semibold text-sm"
                style={{
                  height: '2.75rem', borderRadius: 'var(--radius)',
                  color: 'var(--text-3)', background: 'transparent',
                }}
              >
                Später
              </button>
            </div>
          </div>
        </div>
      )}

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
