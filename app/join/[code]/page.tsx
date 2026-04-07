'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function JoinHuntPage() {
  const params = useParams()
  const router = useRouter()
  const [huntName, setHuntName] = useState<string | null>(null)
  const [huntId, setHuntId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seatInfo, setSeatInfo] = useState<string | null>(null)

  useEffect(() => { loadHunt() }, [params.code])

  async function loadHunt() {
    const supabase = createClient()
    const { data: hunt } = await supabase.from('hunts').select('id, name, status').eq('invite_code', params.code).single()

    if (!hunt) { setError('Einladungslink ungültig oder abgelaufen.'); setLoading(false); return }
    if (hunt.status === 'completed') { setError('Diese Jagd ist bereits beendet.'); setLoading(false); return }

    setHuntId(hunt.id)
    setHuntName(hunt.name)
    setLoading(false)

    // Falls eingeloggt → Hochsitz-Zuweisung laden + prüfen ob schon dabei
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: existing } = await supabase.from('hunt_participants').select('id').eq('hunt_id', hunt.id).eq('user_id', user.id).single()
      if (existing) { router.push(`/app/hunt/${hunt.id}`); return }

      // Hochsitz-Zuweisung prüfen
      const { data: assignment } = await supabase
        .from('hunt_seat_assignments')
        .select('seat_type, seat_id, map_objects(name)')
        .eq('hunt_id', hunt.id)
        .eq('user_id', user.id)
        .single()

      if (assignment) {
        if (assignment.seat_type === 'free') {
          setSeatInfo('Freie Standwahl')
        } else if (assignment.seat_id && assignment.map_objects) {
          const obj = assignment.map_objects as unknown as { name: string }
          setSeatInfo(obj.name)
        }
      }
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!huntId || !name.trim()) return
    setJoining(true); setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const guestToken = !user ? Math.random().toString(36).substring(2) + Date.now().toString(36) : null

    const { error: insertError } = await supabase.from('hunt_participants').insert({
      hunt_id: huntId,
      user_id: user?.id || null,
      guest_name: user ? null : name.trim(),
      guest_token: guestToken,
      role: 'schuetze',
      status: 'joined',
      joined_at: new Date().toISOString(),
    })

    if (insertError) { setError(insertError.message); setJoining(false); return }
    router.push(`/app/hunt/${huntId}`)
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}><p style={{ color: 'var(--text-3)' }}>Lädt...</p></div>

  if (error && !huntId) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <p className="text-4xl mb-4">🚫</p>
          <p className="text-lg font-bold mb-2">Geht nicht</p>
          <p style={{ color: 'var(--text-3)' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
            style={{ background: 'linear-gradient(135deg, var(--green), var(--green-dim))' }}>🌲</div>
          <span className="text-xl font-bold tracking-tight">
            Revier<span style={{ color: 'var(--green-bright)' }}>App</span>
          </span>
        </div>

        <h1 className="text-2xl font-bold mb-1">Du bist eingeladen!</h1>
        <p className="text-sm mb-2" style={{ color: 'var(--text-2)' }}>
          Jagd: <strong style={{ color: 'var(--text)' }}>{huntName}</strong>
        </p>
        {seatInfo && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
            style={{ background: 'rgba(107,159,58,0.08)', border: '1px solid rgba(107,159,58,0.2)' }}>
            <span>🪑</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--green-bright)' }}>
              Dein Stand: {seatInfo}
            </span>
          </div>
        )}
        {!seatInfo && <div className="mb-6" />}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Dein Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Hans Müller" />
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

          <button type="submit" disabled={joining || !name.trim()}
            className="w-full font-bold text-lg text-white transition disabled:opacity-50"
            style={{ height: '3.5rem', borderRadius: 'var(--radius)', background: 'linear-gradient(135deg, var(--green), #4a7a25)', boxShadow: '0 0.25rem 1.25rem rgba(107,159,58,0.25)' }}>
            {joining ? 'Moment...' : 'Dabei! 🎯'}
          </button>
        </form>

        <p className="text-xs text-center mt-6" style={{ color: 'var(--text-3)' }}>Kein Account nötig. Kein Download.</p>
      </div>
    </div>
  )
}
