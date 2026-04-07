'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'

const SetupMap = dynamic(() => import('./setup-map'), { ssr: false })

type SetupMode = 'stands' | 'boundary'

type StandItem = {
  id: string
  name: string
  position: { lat: number; lng: number }
}

export default function RevierSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" style={{ background: 'var(--bg)' }} />}>
      <RevierSetupContent />
    </Suspense>
  )
}

function RevierSetupContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const districtId = params.id as string
  const returnTo = searchParams.get('returnTo')

  const [mode, setMode] = useState<SetupMode>('stands')
  const [districtName, setDistrictName] = useState<string>('')
  const [stands, setStands] = useState<StandItem[]>([])
  const [boundaryPoints, setBoundaryPoints] = useState<{ lat: number; lng: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [gpsPosition, setGpsPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // GPS-Position holen
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* GPS nicht verfügbar — kein Fehler zeigen */ },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // Revier-Name laden
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('districts')
        .select('name')
        .eq('id', districtId)
        .single()
      if (data) setDistrictName(data.name)
    }
    load()
  }, [districtId])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  // Hochsitz auf Karte setzen
  const handleMapTap = useCallback(async (lat: number, lng: number) => {
    if (mode === 'stands') {
      const standNr = stands.length + 1
      const name = `Stand ${standNr}`
      const ewkt = `SRID=4326;POINT(${lng} ${lat})`

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('map_objects')
        .insert({
          name,
          type: 'hochsitz',
          position: ewkt,
          district_id: districtId,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (error) {
        showToast('Fehler beim Speichern')
        return
      }

      setStands(prev => [...prev, { id: data.id, name, position: { lat, lng } }])
      showToast(`${name} gesetzt`)
    } else if (mode === 'boundary') {
      setBoundaryPoints(prev => [...prev, { lat, lng }])
    }
  }, [mode, stands.length, districtId, showToast])

  // Letzten Punkt rückgängig machen
  const handleUndo = useCallback(() => {
    if (mode === 'boundary') {
      setBoundaryPoints(prev => prev.slice(0, -1))
    }
  }, [mode])

  // Hochsitz löschen
  const handleDeleteStand = useCallback(async (id: string) => {
    const supabase = createClient()
    await supabase.from('map_objects').delete().eq('id', id)
    setStands(prev => prev.filter(s => s.id !== id))
    showToast('Stand entfernt')
  }, [showToast])

  // Grenze speichern
  const saveBoundary = useCallback(async () => {
    if (boundaryPoints.length < 3) {
      showToast('Mindestens 3 Punkte nötig')
      return
    }

    setSaving(true)
    const supabase = createClient()

    // Polygon als EWKT: Ring muss geschlossen sein
    const ring = [...boundaryPoints, boundaryPoints[0]]
    const coordStr = ring.map(p => `${p.lng} ${p.lat}`).join(', ')
    const ewkt = `SRID=4326;POLYGON((${coordStr}))`

    const { error } = await supabase
      .from('districts')
      .update({ boundary: ewkt })
      .eq('id', districtId)

    setSaving(false)
    if (error) {
      showToast('Fehler beim Speichern der Grenze')
    } else {
      showToast('Reviergrenze gespeichert')
    }
  }, [boundaryPoints, districtId, showToast])

  // Fertig-Button
  const handleFinish = useCallback(async () => {
    // Falls Grenze gezeichnet aber noch nicht gespeichert
    if (boundaryPoints.length >= 3) {
      await saveBoundary()
    }

    if (returnTo === 'hunt-create') {
      router.push('/app/hunt/create')
    } else {
      router.push('/app')
    }
  }, [boundaryPoints, saveBoundary, returnTo, router])

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--surface)',
        zIndex: 1000,
      }}>
        <button
          onClick={() => {
            if (returnTo === 'hunt-create') {
              router.push('/app/hunt/create')
            } else {
              router.back()
            }
          }}
          className="flex items-center justify-center rounded-lg"
          style={{ color: 'var(--text-2)', background: 'var(--surface-2)', minWidth: '2.75rem', minHeight: '2.75rem', fontSize: '1.125rem' }}
        >←</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">{districtName || 'Revier einrichten'}</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            {mode === 'stands' ? 'Tippe auf die Karte um Hochsitze zu setzen' : 'Tippe Eckpunkte der Reviergrenze'}
          </p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 px-4 py-2.5 flex-shrink-0" style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border-light)',
        zIndex: 1000,
      }}>
        <button
          onClick={() => setMode('stands')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition"
          style={{
            border: `1.5px solid ${mode === 'stands' ? 'var(--green)' : 'var(--border)'}`,
            background: mode === 'stands' ? 'rgba(107,159,58,0.15)' : 'transparent',
            color: mode === 'stands' ? 'var(--green-bright)' : 'var(--text-3)',
          }}
        >
          📍 Hochsitze setzen
        </button>
        <button
          onClick={() => setMode('boundary')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition"
          style={{
            border: `1.5px solid ${mode === 'boundary' ? 'var(--green)' : 'var(--border)'}`,
            background: mode === 'boundary' ? 'rgba(107,159,58,0.15)' : 'transparent',
            color: mode === 'boundary' ? 'var(--green-bright)' : 'var(--text-3)',
          }}
        >
          🔲 Grenze zeichnen
        </button>
      </div>

      {/* Karte */}
      <div className="flex-1 relative" style={{ zIndex: 1 }}>
        <SetupMap
          center={gpsPosition || { lat: 53.24, lng: 10.42 }}
          stands={stands}
          boundaryPoints={boundaryPoints}
          mode={mode}
          onMapTap={handleMapTap}
        />

        {/* Overlay-Info für Boundary-Modus */}
        {mode === 'boundary' && boundaryPoints.length > 0 && (
          <div style={{
            position: 'absolute', top: '0.75rem', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            padding: '0.5rem 1rem', zIndex: 1000,
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
              {boundaryPoints.length} {boundaryPoints.length === 1 ? 'Punkt' : 'Punkte'}
            </span>
            <button
              onClick={handleUndo}
              className="text-xs font-semibold"
              style={{ color: 'var(--orange)', background: 'none', border: 'none' }}
            >
              ↩ Rückgängig
            </button>
            {boundaryPoints.length >= 3 && (
              <button
                onClick={saveBoundary}
                disabled={saving}
                className="text-xs font-bold"
                style={{ color: 'var(--green-bright)', background: 'none', border: 'none' }}
              >
                {saving ? '...' : '✓ Speichern'}
              </button>
            )}
          </div>
        )}

        {/* Stand-Zähler im Stands-Modus */}
        {mode === 'stands' && stands.length > 0 && (
          <div style={{
            position: 'absolute', top: '0.75rem', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            padding: '0.5rem 1rem', zIndex: 1000,
            border: '1px solid var(--border)',
          }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>
              {stands.length} {stands.length === 1 ? 'Hochsitz' : 'Hochsitze'} gesetzt
            </span>
          </div>
        )}
      </div>

      {/* Untere Leiste */}
      <div className="flex-shrink-0 px-4 py-3" style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border-light)',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        zIndex: 1000,
      }}>
        {/* Stand-Liste (kompakt) */}
        {mode === 'stands' && stands.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2.5 mb-2" style={{ scrollbarWidth: 'none' }}>
            {stands.map(s => (
              <div key={s.id} className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--bg)', border: '1px solid var(--green)', fontSize: '0.8125rem' }}>
                <span>🪜</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{s.name}</span>
                <button
                  onClick={() => handleDeleteStand(s.id)}
                  style={{ color: 'var(--text-3)', fontSize: '0.75rem', marginLeft: '0.25rem', background: 'none', border: 'none' }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleFinish}
          disabled={saving}
          className="w-full font-bold text-base text-white disabled:opacity-50"
          style={{
            height: '3.25rem', borderRadius: 'var(--radius)',
            background: 'var(--green)', fontSize: '1rem',
          }}
        >
          {saving ? 'Speichere...' : returnTo === 'hunt-create' ? 'Fertig — zurück zur Jagd' : 'Fertig'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '6rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface-2)', color: 'var(--text)',
          padding: '0.625rem 1.25rem', borderRadius: 'var(--radius)',
          fontSize: '0.875rem', fontWeight: 600, zIndex: 2000,
          border: '1px solid var(--border)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
