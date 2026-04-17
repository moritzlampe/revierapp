import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import HomeContent from './home-content'

export default async function AppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single()
  const displayName = profile?.display_name || 'Jäger'

  // Jagden laden — Filter (Kind/Revier) benötigt vollständige Hunt-Liste;
  // bei >200 Hunts später Pagination erwägen.
  const { data: myParticipations } = await supabase
    .from('hunt_participants')
    .select(`
      hunt_id, role,
      hunts (
        id, name, type, kind, status, invite_code, started_at, ended_at, created_at, creator_id, district_id,
        districts (id, name)
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'joined')
    .order('created_at', { ascending: false })
    .limit(200)

  const hunts = (myParticipations || [])
    .filter(p => p.hunts)
    .map((p: any) => ({
      ...(p.hunts as any),
      myRole: p.role,
      district_name: p.hunts?.districts?.name ?? null,
    }))

  return (
    <HomeContent
      displayName={displayName}
      initialHunts={hunts}
      userId={user.id}
    />
  )
}
