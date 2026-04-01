import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from './logout-button'

const AVATAR_COLORS = ['av-1', 'av-2', 'av-3', 'av-4', 'av-5', 'av-6']

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
  const displayName = profile?.display_name || 'Jäger'

  // Jagden laden (aktiv + letzte abgeschlossene)
  const { data: myParticipations } = await supabase
    .from('hunt_participants')
    .select(`
      hunt_id, role,
      hunts (id, name, type, status, invite_code, started_at, ended_at, created_at)
    `)
    .eq('user_id', user.id)
    .eq('status', 'joined')
    .order('created_at', { ascending: false })
    .limit(10)

  const hunts = (myParticipations || [])
    .filter(p => p.hunts)
    .map(p => ({ ...(p.hunts as any), myRole: p.role }))

  const activeHunts = hunts.filter(h => h.status === 'active')
  const pastHunts = hunts.filter(h => h.status === 'completed').slice(0, 3)

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '0.25rem 1.25rem 1rem' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
              style={{ background: 'linear-gradient(135deg, var(--green), var(--green-dim))' }}>🌲</div>
            <span className="text-lg font-bold tracking-tight">
              Revier<span style={{ color: 'var(--green-bright)' }}>App</span>
            </span>
          </div>
          <LogoutButton />
        </div>
        <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.03rem' }}>
          Moin, <span style={{ color: 'var(--green-bright)' }}>{displayName}</span>
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Was steht an?</p>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2.5 px-5 mb-5">
        <Link href="/app/hunt/create" className="flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-2xl text-white"
          style={{ background: 'linear-gradient(135deg, var(--green), #4a7a25)', boxShadow: '0 0.25rem 1.25rem rgba(107,159,58,0.25)' }}>
          <span className="text-2xl">🎯</span>
          <span className="text-sm font-semibold">Jagd starten</span>
          <span className="text-xs" style={{ opacity: 0.5 }}>Gruppe erstellen</span>
        </Link>
        <button className="flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-2xl"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <span className="text-2xl">🔗</span>
          <span className="text-sm font-semibold">Beitreten</span>
          <span className="text-xs" style={{ opacity: 0.5 }}>Per Link</span>
        </button>
        <button className="flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-2xl"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <span className="text-2xl">🐕</span>
          <span className="text-sm font-semibold">Nachsuche</span>
          <span className="text-xs" style={{ opacity: 0.5 }}>Hundeführer</span>
        </button>
      </div>

      {/* Aktive Jagden */}
      {activeHunts.length > 0 && (
        <div className="mb-4">
          <p className="section-label px-5 mb-2">Aktive Jagden</p>
          <div className="px-5 space-y-2.5">
            {activeHunts.map((hunt: any) => (
              <Link key={hunt.id} href={`/app/hunt/${hunt.id}`}
                className="block rounded-2xl p-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold">{hunt.name}</span>
                  <span className="badge badge-live"><span className="live-dot mr-1" /> Live</span>
                </div>
                <div className="flex gap-3.5 text-xs" style={{ color: 'var(--text-2)' }}>
                  <span>🕐 Seit {new Date(hunt.started_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>{hunt.myRole === 'jagdleiter' ? '🎖️ Jagdleiter' : '🎯 Schütze'}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Vergangene Jagden */}
      {pastHunts.length > 0 && (
        <div className="mb-4">
          <p className="section-label px-5 mb-2">Letzte Jagden</p>
          <div className="px-5 space-y-2.5">
            {pastHunts.map((hunt: any) => (
              <div key={hunt.id} className="rounded-2xl p-3.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold">{hunt.name}</span>
                  <span className="badge badge-done">
                    {hunt.ended_at ? new Date(hunt.ended_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : 'Beendet'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leerer Zustand */}
      {activeHunts.length === 0 && pastHunts.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <p className="text-3xl mb-3">🌲</p>
          <p className="font-semibold mb-1">Noch keine Jagden</p>
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>
            Starte deine erste Jagd oder tritt per Link bei.
          </p>
        </div>
      )}
    </div>
  )
}
