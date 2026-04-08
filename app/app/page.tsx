import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from './logout-button'
import HomeContent from './home-content'
import BottomTabBar from '@/components/bottom-tab-bar'

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
      hunts (id, name, type, status, invite_code, started_at, ended_at, created_at, creator_id)
    `)
    .eq('user_id', user.id)
    .eq('status', 'joined')
    .order('created_at', { ascending: false })
    .limit(10)

  const hunts = (myParticipations || [])
    .filter(p => p.hunts)
    .map(p => ({ ...(p.hunts as any), myRole: p.role }))

  return (
    <div className="relative">
      {/* Logout-Button (Server Component) */}
      <div style={{ position: 'absolute', top: '0.25rem', right: '1.25rem', zIndex: 10 }}>
        <LogoutButton />
      </div>
      <HomeContent
        displayName={displayName}
        initialHunts={hunts}
        userId={user.id}
      />
      <BottomTabBar />
    </div>
  )
}
